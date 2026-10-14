import { getDb } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { getListing } from "./listings";
import { resolvePromo } from "./promotions";
import type { Offer, Order, User } from "./types";
import { offerSchema, orderSchema } from "./validation";

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
  if (d.quantity > l.quantity) throw badRequest("Not enough inventory");
  const r = getDb().prepare("INSERT INTO offers (listing_id, buyer_id, amount_cents, quantity) VALUES (?,?,?,?)").run(l.id, user.id, d.amount, d.quantity);
  return getOffer(Number(r.lastInsertRowid));
}

export function transitionOffer(user: User, id: number, action: string): Offer {
  const o = getOffer(id);
  const t = OFFER_TRANSITIONS[action];
  if (!t) throw badRequest("Unknown action");
  const l = getListing(o.listing_id, user);
  const actorOk = t.by === "seller" ? l.seller_id === user.id : o.buyer_id === user.id;
  if (!actorOk) throw forbidden(`Only the ${t.by} can ${action} this offer`);
  if (!t.from.includes(o.status)) throw conflict(`Cannot ${action} an offer that is ${o.status}`);
  const db = getDb();
  db.transaction(() => {
    if (action === "accept") {
      if (l.status !== "active") throw conflict("Listing is no longer available");
      // Reserve stock at acceptance so two accepted offers can't both claim the last unit.
      const dec = db.prepare("UPDATE listings SET quantity = quantity - ? WHERE id = ? AND quantity >= ?").run(o.quantity, l.id, o.quantity);
      if (!dec.changes) throw conflict("Not enough inventory to accept this offer");
    } else if (action === "withdraw" && o.status === "accepted") {
      db.prepare("UPDATE listings SET quantity = quantity + ? WHERE id = ?").run(o.quantity, l.id);
    }
    db.prepare("UPDATE offers SET status = ? WHERE id = ?").run(OFFER_RESULT[action], id);
  })();
  return getOffer(id);
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
    // Stock for accepted offers was already reserved at acceptance.
    if (!offerId && qty > l.quantity) throw conflict("Not enough inventory");
    const subtotal = unit * qty;
    if (!("offerId" in d) && d.promoCode) {
      const p = resolvePromo(d.promoCode, l, user.id);
      discount = Math.round((subtotal * p.percent_off) / 100);
      code = p.code;
      db.prepare("UPDATE promotions SET uses = uses + 1 WHERE id = ?").run(p.id);
    }
    // Conditional decrement guards against concurrent oversell.
    if (!offerId) {
      const dec = db.prepare("UPDATE listings SET quantity = quantity - ? WHERE id = ? AND quantity >= ?").run(qty, l.id, qty);
      if (!dec.changes) throw conflict("Not enough inventory");
    }
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
    if (action === "pay" || action === "ship") {
      const st = db.prepare("SELECT l.status, u.banned FROM listings l JOIN users u ON u.id = l.seller_id WHERE l.id = ?").get(o.listing_id) as { status: string; banned: number } | undefined;
      if (!st || st.status !== "active" || st.banned) throw conflict("Listing was removed by moderation; this order can only be cancelled");
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
