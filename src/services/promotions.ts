import { execute, isUniqueViolation, query, queryOne, type DbExecutor } from "./db";
import { badRequest, forbidden } from "./errors";
import { getListing } from "./listings";
import type { Listing, Promotion, User } from "./types";
import { promoSchema } from "./validation";

/** Deal Den. Admin promos with no seller apply site-wide (optionally per category); seller promos apply only to that seller's listings (optionally one listing). */
export async function createPromotion(user: User, input: unknown): Promise<Promotion> {
  const d = promoSchema.parse(input);
  if (d.listingId) {
    const l = await getListing(d.listingId, user);
    if (l.seller_id !== user.id && user.role !== "admin") throw forbidden("Not your listing");
  }
  const sellerId = user.role === "admin" && !d.listingId ? null : user.id;
  // promotions.code is CITEXT: the duplicate check (and unique index) is case-insensitive.
  if (await queryOne("SELECT 1 FROM promotions WHERE code = $1", [d.code])) throw badRequest("Code already exists");
  try {
    const r = await queryOne<{ id: number }>(
      `INSERT INTO promotions (code, title, percent_off, seller_id, listing_id, category, max_uses, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [d.code, d.title, d.percentOff, sellerId, d.listingId ?? null, d.category ?? null, d.maxUses ?? null, d.expiresAt ?? null]
    );
    return (await queryOne<Promotion>("SELECT * FROM promotions WHERE id = $1", [r!.id]))!;
  } catch (e) {
    if (isUniqueViolation(e)) throw badRequest("Code already exists");
    throw e;
  }
}

export async function resolvePromo(code: string, l: Listing, exec?: DbExecutor): Promise<Promotion> {
  const p = await queryOne<Promotion>("SELECT * FROM promotions WHERE code = $1", [code.trim()], exec);
  if (!p || !p.active) throw badRequest("Invalid promo code");
  if (p.expires_at && p.expires_at < new Date().toISOString().slice(0, 10)) throw badRequest("Promo code expired");
  if (p.max_uses != null && p.uses >= p.max_uses) throw badRequest("Promo code fully redeemed");
  if (p.seller_id != null && p.seller_id !== l.seller_id) throw badRequest("Promo code not valid for this seller");
  if (p.listing_id != null && p.listing_id !== l.id) throw badRequest("Promo code not valid for this listing");
  if (p.category && p.category !== l.category) throw badRequest("Promo code not valid for this category");
  return p;
}

export async function quotePromo(code: string, listingId: number, qty = 1) {
  const l = await getListing(listingId);
  const p = await resolvePromo(code, l);
  const subtotal = l.price_cents * qty;
  const discount = Math.round((subtotal * p.percent_off) / 100);
  return { code: p.code, percentOff: p.percent_off, subtotal, discount, total: subtotal - discount };
}

export async function listActivePromotions() {
  // expires_at is a date-only TEXT column; compare against today's date string,
  // the same comparison resolvePromo makes in JS.
  const today = new Date().toISOString().slice(0, 10);
  return query<Promotion & { seller_name: string | null; listing_title: string | null }>(
    `SELECT p.*, u.name AS seller_name, l.title AS listing_title FROM promotions p
     LEFT JOIN users u ON u.id = p.seller_id LEFT JOIN listings l ON l.id = p.listing_id
     WHERE p.active = 1 AND (p.expires_at IS NULL OR p.expires_at >= $1) AND (p.max_uses IS NULL OR p.uses < p.max_uses)
     ORDER BY p.percent_off DESC`,
    [today]
  );
}

export async function deactivatePromotion(user: User, id: number) {
  const p = await queryOne<Promotion>("SELECT * FROM promotions WHERE id = $1", [id]);
  if (!p) throw badRequest("Not found");
  if (user.role !== "admin" && p.seller_id !== user.id) throw forbidden("Not your promotion");
  await execute("UPDATE promotions SET active = 0 WHERE id = $1", [id]);
}
