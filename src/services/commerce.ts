import type { PoolClient } from "pg";
import { execute, query, queryOne, withTransaction, type DbExecutor } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { computePlatformFee, type DeliveryMethod, type SellerTier } from "./fees";
import { availableQty, getListing } from "./listings";
import { resolvePromo } from "./promotions";
import { isPaymentIntentSucceeded, isStripeConfigured } from "./stripe";
import type { Offer, Order, User } from "./types";
import { offerSchema, orderSchema } from "./validation";

/** Accepted offers hold their units for this long before expiring. */
export const OFFER_TTL_HOURS = 48;

/**
 * Lazily expire accepted offers past their expiry, releasing reservations.
 * Runs in its own transaction so the expiry persists even if the caller's
 * operation fails; call it before mutating offers.
 */
async function sweepExpiredOffers(): Promise<void> {
  await withTransaction(async (client) => {
    const expired = await query<{ id: number; listing_id: number; quantity: number }>(
      "SELECT id, listing_id, quantity FROM offers WHERE status = 'accepted' AND expires_at IS NOT NULL AND expires_at < now()",
      [],
      client
    );
    for (const o of expired) {
      await execute("UPDATE offers SET status = 'expired' WHERE id = $1", [o.id], client);
      // GREATEST, not MAX: in Postgres MAX is an aggregate, not a scalar clamp.
      await execute("UPDATE listings SET reserved_quantity = GREATEST(reserved_quantity - $1, 0) WHERE id = $2", [o.quantity, o.listing_id], client);
    }
  });
}

/** Lock a row for the rest of the transaction (SQLite serialized all writers; Postgres does not). */
async function lockRow(client: PoolClient, table: "offers" | "orders" | "listings", id: number): Promise<void> {
  await queryOne(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, [id], client);
}

/* ---------- Offers: pending -> accepted|rejected|withdrawn ; accepted -> ordered ---------- */
export const OFFER_TRANSITIONS: Record<string, { from: string[]; by: "buyer" | "seller" }> = {
  accept: { from: ["pending"], by: "seller" },
  reject: { from: ["pending"], by: "seller" },
  withdraw: { from: ["pending", "accepted"], by: "buyer" },
};
const OFFER_RESULT: Record<string, string> = { accept: "accepted", reject: "rejected", withdraw: "withdrawn" };

export async function getOffer(id: number, exec?: DbExecutor): Promise<Offer> {
  const o = await queryOne<Offer>("SELECT * FROM offers WHERE id = $1", [id], exec);
  if (!o) throw notFound("Offer not found");
  return o;
}

export async function createOffer(user: User, input: unknown): Promise<Offer> {
  const d = offerSchema.parse(input);
  const l = await getListing(d.listingId, user);
  if (l.status !== "active") throw badRequest("Listing not available");
  if (l.seller_id === user.id) throw forbidden("Cannot make an offer on your own listing");
  if (d.quantity > availableQty(l)) throw badRequest("Not enough inventory");
  const r = await queryOne<{ id: number }>("INSERT INTO offers (listing_id, buyer_id, amount_cents, quantity) VALUES ($1,$2,$3,$4) RETURNING id", [l.id, user.id, d.amount, d.quantity]);
  return getOffer(r!.id);
}

export async function transitionOffer(user: User, id: number, action: string): Promise<Offer> {
  await sweepExpiredOffers();
  return withTransaction(async (client) => {
    await lockRow(client, "offers", id);
    const o = await getOffer(id, client);
    const t = OFFER_TRANSITIONS[action];
    if (!t) throw badRequest("Unknown action");
    const l = await getListing(o.listing_id, user, client);
    const actorOk = t.by === "seller" ? l.seller_id === user.id : o.buyer_id === user.id;
    if (!actorOk) throw forbidden(`Only the ${t.by} can ${action} this offer`);
    if (!t.from.includes(o.status)) throw conflict(`Cannot ${action} an offer that is ${o.status}`);
    const result = OFFER_RESULT[action];
    if (action === "accept") {
      // Reserve the units so a second acceptance can't oversell the same stock.
      // The conditional update keeps this safe under concurrency.
      const changes = await execute(
        "UPDATE listings SET reserved_quantity = reserved_quantity + $1 WHERE id = $2 AND quantity - reserved_quantity >= $1",
        [o.quantity, l.id],
        client
      );
      if (!changes) throw conflict("Not enough available inventory to accept this offer");
      await execute("UPDATE offers SET status = $1, expires_at = now() + $2 * interval '1 hour' WHERE id = $3", [result, OFFER_TTL_HOURS, id], client);
    } else {
      if (o.status === "accepted" && result === "withdrawn") {
        // Buyer walked away from an accepted offer: release the reservation.
        await execute("UPDATE listings SET reserved_quantity = GREATEST(reserved_quantity - $1, 0) WHERE id = $2", [o.quantity, l.id], client);
      }
      await execute("UPDATE offers SET status = $1 WHERE id = $2", [result, id], client);
    }
    return getOffer(id, client);
  });
}

export async function listOffers(user: User) {
  const q = `SELECT o.*, l.title, l.seller_id, b.name AS buyer_name FROM offers o JOIN listings l ON l.id = o.listing_id JOIN users b ON b.id = o.buyer_id`;
  return {
    sent: await query<Offer & { title: string }>(`${q} WHERE o.buyer_id = $1 ORDER BY o.id DESC`, [user.id]),
    received: await query<Offer & { title: string; buyer_name: string }>(`${q} WHERE l.seller_id = $1 ORDER BY o.id DESC`, [user.id]),
  };
}

/* ---------- Orders ----------
 pending_payment --pay(buyer, MOCK or Stripe test charge)--> paid --ship(seller)--> shipped --confirm(buyer)--> delivered
 pending_payment --cancel(buyer|seller)--> cancelled ; paid --cancel(seller; mock refund)--> cancelled
 Inventory is reserved at creation and restored on cancel.
 Pay: when Stripe test mode is configured (STRIPE_SECRET_KEY set), the buyer
 must first create a PaymentIntent (POST /api/orders/[id]/payment-intent) and
 confirm it with a test card; pay then verifies the charge succeeded. With no
 key configured, pay stays the mock status flip it has always been. */
export const ORDER_TRANSITIONS: Record<string, { from: string[]; to: string; by: ("buyer" | "seller")[] }> = {
  pay: { from: ["pending_payment"], to: "paid", by: ["buyer"] },
  ship: { from: ["paid"], to: "shipped", by: ["seller"] },
  confirm: { from: ["shipped"], to: "delivered", by: ["buyer"] },
  cancel: { from: ["pending_payment", "paid"], to: "cancelled", by: ["buyer", "seller"] },
};

export async function getOrder(id: number, exec?: DbExecutor): Promise<Order> {
  const o = await queryOne<Order>("SELECT * FROM orders WHERE id = $1", [id], exec);
  if (!o) throw notFound("Order not found");
  return o;
}

export async function createOrder(user: User, input: unknown): Promise<Order> {
  const d = orderSchema.parse(input);
  await sweepExpiredOffers();
  return withTransaction(async (client) => {
    let listingId: number, qty: number, unit = 0, offerId: number | null = null, discount = 0, code: string | null = null;
    if ("offerId" in d) {
      await lockRow(client, "offers", d.offerId);
      const o = await getOffer(d.offerId, client);
      if (o.buyer_id !== user.id) throw forbidden("Not your offer");
      if (o.status !== "accepted") throw conflict(`Offer is ${o.status}, not accepted`);
      listingId = o.listing_id; qty = o.quantity; unit = o.amount_cents; offerId = o.id;
    } else {
      listingId = d.listingId; qty = d.quantity;
    }
    await lockRow(client, "listings", listingId);
    const l = await getListing(listingId, undefined, client);
    if (!("offerId" in d)) unit = l.price_cents;
    if (l.status !== "active") throw badRequest("Listing not available");
    if (l.seller_id === user.id) throw forbidden("Cannot buy your own listing");
    // Offer orders draw on the reservation made at acceptance; direct orders
    // must leave reserved units alone.
    if (!offerId && qty > availableQty(l)) throw conflict("Not enough inventory");
    const subtotal = unit * qty;
    if (!("offerId" in d) && d.promoCode) {
      const p = await resolvePromo(d.promoCode, l, client);
      discount = Math.round((subtotal * p.percent_off) / 100);
      code = p.code;
      await execute("UPDATE promotions SET uses = uses + 1 WHERE id = $1", [p.id], client);
    }
    // Platform fee (locked 2026-11-21): base = item price actually paid +
    // shipping charged, never tax; rate by seller tier + delivery method.
    const sellerRow = await queryOne<{ tier: string }>("SELECT tier FROM users WHERE id = $1", [l.seller_id], client);
    const tier: SellerTier = sellerRow?.tier === "premium" ? "premium" : "free";
    const deliveryMethod: DeliveryMethod = d.deliveryMethod;
    const shippingCents = d.shipping;
    const taxCents = d.tax;
    const platformFeeCents = computePlatformFee({ subtotalCents: subtotal, discountCents: discount, shippingCents, tier, deliveryMethod });
    const totalCents = subtotal - discount + shippingCents + taxCents;
    // Conditional decrement guards against concurrent oversell. Offer orders
    // consume the reservation made at acceptance; direct orders must leave
    // reserved units alone.
    const changes = offerId
      ? await execute("UPDATE listings SET quantity = quantity - $1, reserved_quantity = reserved_quantity - $1 WHERE id = $2 AND reserved_quantity >= $1", [qty, l.id], client)
      : await execute("UPDATE listings SET quantity = quantity - $1 WHERE id = $2 AND quantity - reserved_quantity >= $1", [qty, l.id], client);
    if (!changes) throw conflict("Not enough inventory");
    if (offerId) await execute("UPDATE offers SET status = 'ordered' WHERE id = $1", [offerId], client);
    const r = await queryOne<{ id: number }>(
      `INSERT INTO orders (listing_id, buyer_id, seller_id, offer_id, quantity, unit_price_cents, discount_cents, total_cents, promo_code, delivery_method, shipping_cents, tax_cents, platform_fee_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [l.id, user.id, l.seller_id, offerId, qty, unit, discount, totalCents, code, deliveryMethod, shippingCents, taxCents, platformFeeCents],
      client
    );
    return getOrder(r!.id, client);
  });
}

export async function transitionOrder(user: User, id: number, action: string): Promise<Order> {
  return withTransaction(async (client) => {
    await lockRow(client, "orders", id);
    const o = await getOrder(id, client);
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
    // Stripe test mode: when configured, pay requires a succeeded charge first.
    // Without a key, pay stays the mock flip. A missing/failed charge blocks.
    if (action === "pay" && isStripeConfigured()) {
      if (!o.stripe_payment_intent_id) throw conflict("Create a Stripe payment for this order first (POST /api/orders/[id]/payment-intent)");
      if (!(await isPaymentIntentSucceeded(o.stripe_payment_intent_id))) throw conflict("Stripe payment has not succeeded yet — confirm the test card charge first");
    }
    // Money must not move for a listing moderation removed: block pay/ship.
    // Confirm and cancel still work so in-flight orders can settle.
    if (action === "pay" || action === "ship") {
      const ls = await queryOne<{ status: string }>("SELECT status FROM listings WHERE id = $1", [o.listing_id], client);
      if (ls?.status === "removed") throw conflict(`Cannot ${action} an order for a removed listing`);
    }
    await execute("UPDATE orders SET status = $1, updated_at = now() WHERE id = $2", [t.to, id], client);
    if (t.to === "cancelled") {
      await execute("UPDATE listings SET quantity = quantity + $1 WHERE id = $2", [o.quantity, o.listing_id], client);
      if (o.promo_code) await execute("UPDATE promotions SET uses = GREATEST(uses - 1, 0) WHERE code = $1", [o.promo_code], client);
    }
    return getOrder(id, client);
  });
}

export async function listOrders(user: User) {
  const q = `SELECT o.*, l.title FROM orders o JOIN listings l ON l.id = o.listing_id`;
  return {
    purchases: await query<Order & { title: string }>(`${q} WHERE o.buyer_id = $1 ORDER BY o.id DESC`, [user.id]),
    sales: await query<Order & { title: string }>(`${q} WHERE o.seller_id = $1 ORDER BY o.id DESC`, [user.id]),
  };
}
