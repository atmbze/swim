import { getDb } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { availableQty, getListing } from "./listings";
import { resolvePromo } from "./promotions";
import type { Offer, Order, User } from "./types";
import { offerSchema, orderSchema } from "./validation";

/** Accepted offers hold their units for this long before expiring. */
export const OFFER_TTL_HOURS = 48;

/**
 * Lazily expire accepted offers past their expiry, releasing reservations.
 * Runs in its own transaction so the expiry persists even if the caller's
 * operation fails; call it before mutating offers.
 */
function sweepExpiredOffers(): void {
  const db = getDb();
  db.transaction(() => {
    const expired = db
      .prepare(
        "SELECT id, listing_id, quantity FROM offers WHERE status = 'accepted' AND expires_at IS NOT NULL AND expires_at < datetime('now')"
      )
      .all() as { id: number; listing_id: number; quantity: number }[];
    for (const o of expired) {
      db.prepare("UPDATE offers SET status = 'expired' WHERE id = ?").run(o.id);
      db.prepare("UPDATE listings SET reserved_quantity = MAX(reserved_quantity - ?, 0) WHERE id = ?").run(o.quantity, o.listing_id);
    }
  })();
}

/* ---------- Offers: pending -> accepted|rejected|withdrawn ; accepted -> ordered ---------- */
export const OFFER_TRANSITIONS: Record<string, { from: string[]; by: "buyer" | "seller" }> = {
  accept: { from: ["pending"], by: "seller" },
  reject: { from: ["pending"], by: "seller" },
  withdraw: { from: ["pending", "accepted"], by: "buyer" },
};
const OFFER_RESULT: Record<string, string> = { accept: "accepted", reject: "rejected", withdraw: "withdrawn" };

export function getOffer(id: number): Offer {
  const o = getDb().prepare("SELECT * FROM offers WHERE id = ?").get(id) as Offer | undefined;
  if (!o) throw notFound("Offer not found");
  return o;
}

export function createOffer(user: User, input: unknown): Offer {
  const d = offerSchema.parse(input);
  const l = getListing(d.listingId, user);
  if (l.status !== "active") throw badRequest("Listing not available");
  if (l.seller_id === user.id) throw forbidden("Cannot make an offer on your own listing");
  if (d.quantity > availableQty(l)) throw badRequest("Not enough inventory");
  const r = getDb().prepare("INSERT INTO offers (listing_id, buyer_id, amount_cents, quantity) VALUES (?,?,?,?)").run(l.id, user.id, d.amount, d.quantity);
  return getOffer(Number(r.lastInsertRowid));
}

export function transitionOffer(user: User, id: number, action: string): Offer {
  sweepExpiredOffers();
  const db = getDb();
  return db.transaction(() => {
    const o = getOffer(id);
    const t = OFFER_TRANSITIONS[action];
    if (!t) throw badRequest("Unknown action");
    const l = getListing(o.listing_id, user);
    const actorOk = t.by === "seller" ? l.seller_id === user.id : o.buyer_id === user.id;
    if (!actorOk) throw forbidden(`Only the ${t.by} can ${action} this offer`);
    if (!t.from.includes(o.status)) throw conflict(`Cannot ${action} an offer that is ${o.status}`);
    const result = OFFER_RESULT[action];
    if (action === "accept") {
      // Reserve the units so a second acceptance can't oversell the same stock.
      // The conditional update keeps this safe under concurrency.
      const res = db.prepare(
        "UPDATE listings SET reserved_quantity = reserved_quantity + ? WHERE id = ? AND quantity - reserved_quantity >= ?"
      ).run(o.quantity, l.id, o.quantity);
      if (!res.changes) throw conflict("Not enough available inventory to accept this offer");
      db.prepare(`UPDATE offers SET status = ?, expires_at = datetime('now', '+${OFFER_TTL_HOURS} hours') WHERE id = ?`).run(result, id);
    } else {
      if (o.status === "accepted" && result === "withdrawn") {
        // Buyer walked away from an accepted offer: release the reservation.
        db.prepare("UPDATE listings SET reserved_quantity = MAX(reserved_quantity - ?, 0) WHERE id = ?").run(o.quantity, l.id);
      }
      db.prepare("UPDATE offers SET status = ? WHERE id = ?").run(result, id);
    }
    return getOffer(id);
  })();
}

export function listOffers(user: User) {
  const db = getDb();
  const q = `SELECT o.*, l.title, l.seller_id, b.name AS buyer_name FROM offers o JOIN listings l ON l.id = o.listing_id JOIN users b ON b.id = o.buyer_id`;
  return {
    sent: db.prepare(`${q} WHERE o.buyer_id = ? ORDER BY o.id DESC`).all(user.id) as (Offer & { title: string })[],
    received: db.prepare(`${q} WHERE l.seller_id = ? ORDER BY o.id DESC`).all(user.id) as (Offer & { title: string; buyer_name: string })[],
  };
}

/* ---------- Orders ----------
 pending_payment --pay(buyer, MOCK)--> paid --ship(seller)--> shipped --confirm(buyer)--> delivered
 pending_payment --cancel(buyer|seller)--> cancelled ; paid --cancel(seller; mock refund)--> cancelled
 Inventory is reserved at creation and restored on cancel. */
export const ORDER_TRANSITIONS: Record<string, { from: string[]; to: string; by: ("buyer" | "seller")[] }> = {
  pay: { from: ["pending_payment"], to: "paid", by: ["buyer"] },
  ship: { from: ["paid"], to: "shipped", by: ["seller"] },
  confirm: { from: ["shipped"], to: "delivered", by: ["buyer"] },
  cancel: { from: ["pending_payment", "paid"], to: "cancelled", by: ["buyer", "seller"] },
};

export function getOrder(id: number): Order {
  const o = getDb().prepare("SELECT * FROM orders WHERE id = ?").get(id) as Order | undefined;
  if (!o) throw notFound("Order not found");
  return o;
}

export function createOrder(user: User, input: unknown): Order {
  const d = orderSchema.parse(input);
  sweepExpiredOffers();
  const db = getDb();
  return db.transaction(() => {
    let listingId: number, qty: number, unit: number, offerId: number | null = null, discount = 0, code: string | null = null;
    if ("offerId" in d) {
      const o = getOffer(d.offerId);
      if (o.buyer_id !== user.id) throw forbidden("Not your offer");
      if (o.status !== "accepted") throw conflict(`Offer is ${o.status}, not accepted`);
      listingId = o.listing_id; qty = o.quantity; unit = o.amount_cents; offerId = o.id;
    } else {
      listingId = d.listingId; qty = d.quantity;
      unit = getListing(listingId).price_cents;
    }
    const l = getListing(listingId);
    if (l.status !== "active") throw badRequest("Listing not available");
    if (l.seller_id === user.id) throw forbidden("Cannot buy your own listing");
    // Offer orders draw on the reservation made at acceptance; direct orders
    // must leave reserved units alone.
    if (!offerId && qty > availableQty(l)) throw conflict("Not enough inventory");
    const subtotal = unit * qty;
    if (!("offerId" in d) && d.promoCode) {
      const p = resolvePromo(d.promoCode, l);
      discount = Math.round((subtotal * p.percent_off) / 100);
      code = p.code;
      db.prepare("UPDATE promotions SET uses = uses + 1 WHERE id = ?").run(p.id);
    }
    // Conditional decrement guards against concurrent oversell. Offer orders
    // consume the reservation made at acceptance; direct orders must leave
    // reserved units alone.
    const dec = offerId
      ? db.prepare("UPDATE listings SET quantity = quantity - ?, reserved_quantity = reserved_quantity - ? WHERE id = ? AND reserved_quantity >= ?").run(qty, qty, l.id, qty)
      : db.prepare("UPDATE listings SET quantity = quantity - ? WHERE id = ? AND quantity - reserved_quantity >= ?").run(qty, l.id, qty);
    if (!dec.changes) throw conflict("Not enough inventory");
    if (offerId) db.prepare("UPDATE offers SET status = 'ordered' WHERE id = ?").run(offerId);
    const r = db.prepare(`INSERT INTO orders (listing_id, buyer_id, seller_id, offer_id, quantity, unit_price_cents, discount_cents, total_cents, promo_code)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(l.id, user.id, l.seller_id, offerId, qty, unit, discount, subtotal - discount, code);
    return getOrder(Number(r.lastInsertRowid));
  })();
}

export function transitionOrder(user: User, id: number, action: string): Order {
  const db = getDb();
  return db.transaction(() => {
    const o = getOrder(id);
    const t = ORDER_TRANSITIONS[action];
    if (!t) throw badRequest("Unknown action");
    const roles: ("buyer" | "seller")[] = [];
    if (o.buyer_id === user.id) roles.push("buyer");
    if (o.seller_id === user.id) roles.push("seller");
    if (!roles.length) throw forbidden("Not your order");
    let allowed = t.by.some((r) => roles.includes(r));
    // Once paid, only the seller may cancel (mock refund).
    if (action === "cancel" && o.status === "paid" && !roles.includes("seller")) allowed = false;
    if (!allowed) throw forbidden(`You cannot ${action} this order`);
    if (!t.from.includes(o.status)) throw conflict(`Cannot ${action} an order that is ${o.status}`);
    // Money must not move for a listing moderation removed: block pay/ship.
    // Confirm and cancel still work so in-flight orders can settle.
    if (action === "pay" || action === "ship") {
      const ls = db.prepare("SELECT status FROM listings WHERE id = ?").get(o.listing_id) as { status: string } | undefined;
      if (ls?.status === "removed") throw conflict(`Cannot ${action} an order for a removed listing`);
    }
    db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(t.to, id);
    if (t.to === "cancelled") {
      db.prepare("UPDATE listings SET quantity = quantity + ? WHERE id = ?").run(o.quantity, o.listing_id);
      if (o.promo_code) db.prepare("UPDATE promotions SET uses = MAX(uses - 1, 0) WHERE code = ?").run(o.promo_code);
    }
    return getOrder(id);
  })();
}

export function listOrders(user: User) {
  const q = `SELECT o.*, l.title FROM orders o JOIN listings l ON l.id = o.listing_id`;
  const db = getDb();
  return {
    purchases: db.prepare(`${q} WHERE o.buyer_id = ? ORDER BY o.id DESC`).all(user.id) as (Order & { title: string })[],
    sales: db.prepare(`${q} WHERE o.seller_id = ? ORDER BY o.id DESC`).all(user.id) as (Order & { title: string })[],
  };
}
