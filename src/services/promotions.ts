import { getDb } from "./db";
import { badRequest, forbidden } from "./errors";
import { getListing } from "./listings";
import type { Listing, Promotion, User } from "./types";
import { promoSchema } from "./validation";

/** Deal Den. Admin promos with no seller apply site-wide (optionally per category); seller promos apply only to that seller's listings (optionally one listing). */
export function createPromotion(user: User, input: unknown): Promotion {
  const d = promoSchema.parse(input);
  if (d.listingId) {
    const l = getListing(d.listingId, user);
    if (l.seller_id !== user.id && user.role !== "admin") throw forbidden("Not your listing");
  }
  const sellerId = user.role === "admin" && !d.listingId ? null : user.id;
  const db = getDb();
  if (db.prepare("SELECT 1 FROM promotions WHERE code = ?").get(d.code)) throw badRequest("Code already exists");
  const r = db.prepare(`INSERT INTO promotions (code, title, percent_off, seller_id, listing_id, category, max_uses, per_user_limit, expires_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(d.code, d.title, d.percentOff, sellerId, d.listingId ?? null, d.category ?? null, d.maxUses ?? null, d.perUserLimit === 0 ? null : d.perUserLimit, d.expiresAt ?? null);
  return db.prepare("SELECT * FROM promotions WHERE id = ?").get(r.lastInsertRowid) as Promotion;
}

export function resolvePromo(code: string, l: Listing, buyerId?: number): Promotion {
  const p = getDb().prepare("SELECT * FROM promotions WHERE code = ?").get(code.trim()) as Promotion | undefined;
  if (!p || !p.active) throw badRequest("Invalid promo code");
  if (p.expires_at && p.expires_at < new Date().toISOString().slice(0, 10)) throw badRequest("Promo code expired");
  if (p.max_uses != null && p.uses >= p.max_uses) throw badRequest("Promo code fully redeemed");
  if (p.seller_id != null && p.seller_id !== l.seller_id) throw badRequest("Promo code not valid for this seller");
  if (p.listing_id != null && p.listing_id !== l.id) throw badRequest("Promo code not valid for this listing");
  if (p.category && p.category !== l.category) throw badRequest("Promo code not valid for this category");
  if (buyerId != null && p.per_user_limit != null) {
    const used = (getDb().prepare("SELECT COUNT(*) AS n FROM orders WHERE buyer_id = ? AND promo_code = ? AND status != 'cancelled'").get(buyerId, p.code) as { n: number }).n;
    if (used >= p.per_user_limit) throw badRequest("You have already used this promo code");
  }
  return p;
}

export function quotePromo(code: string, listingId: number, qty = 1, buyerId?: number) {
  const l = getListing(listingId);
  const p = resolvePromo(code, l, buyerId);
  const subtotal = l.price_cents * qty;
  const discount = Math.round((subtotal * p.percent_off) / 100);
  return { code: p.code, percentOff: p.percent_off, subtotal, discount, total: subtotal - discount };
}

export function listActivePromotions() {
  return getDb().prepare(`SELECT p.*, u.name AS seller_name, l.title AS listing_title FROM promotions p
    LEFT JOIN users u ON u.id = p.seller_id LEFT JOIN listings l ON l.id = p.listing_id
    WHERE p.active = 1 AND (p.expires_at IS NULL OR p.expires_at >= date('now')) AND (p.max_uses IS NULL OR p.uses < p.max_uses)
    ORDER BY p.percent_off DESC`).all() as (Promotion & { seller_name: string | null; listing_title: string | null })[];
}

export function deactivatePromotion(user: User, id: number) {
  const p = getDb().prepare("SELECT * FROM promotions WHERE id = ?").get(id) as Promotion | undefined;
  if (!p) throw badRequest("Not found");
  if (user.role !== "admin" && p.seller_id !== user.id) throw forbidden("Not your promotion");
  getDb().prepare("UPDATE promotions SET active = 0 WHERE id = ?").run(id);
}
