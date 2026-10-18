import { getDb } from "./db";
import { badRequest, forbidden, notFound } from "./errors";
import { distanceMiles } from "./geo";
import type { Listing, User } from "./types";
import { deleteImage, saveImage } from "./uploads";
import { listingSchema, listingUpdateSchema } from "./validation";

export function getListing(id: number, viewer?: User | null): Listing {
  const l = getDb().prepare("SELECT l.*, u.name AS seller_name, u.banned AS seller_banned FROM listings l JOIN users u ON u.id = l.seller_id WHERE l.id = ?").get(id) as (Listing & { seller_banned?: number }) | undefined;
  if (!l) throw notFound("Listing not found");
  // Removed listings are only visible to their seller and admins.
  if ((l.status === "removed" || l.seller_banned) && !(viewer && (viewer.role === "admin" || viewer.id === l.seller_id))) throw notFound("Listing not found");
  return l;
}

function assertOwner(l: Listing, user: User) {
  if (l.seller_id !== user.id && user.role !== "admin") throw forbidden("Not your listing");
}

export async function createListing(user: User, input: Record<string, unknown>): Promise<Listing> {
  const d = listingSchema.parse({ ...input, city: input.city || user.city, zip: input.zip || user.zip });
  const image = await saveImage(input.image);
  const r = getDb().prepare(`INSERT INTO listings (seller_id, title, description, price_cents, category, condition, quantity, city, zip, image)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(user.id, d.title, d.description, d.price, d.category, d.condition, d.quantity, d.city, d.zip, image);
  return getListing(Number(r.lastInsertRowid), user);
}

export async function updateListing(user: User, id: number, input: Record<string, unknown>): Promise<Listing> {
  const l = getListing(id, user);
  assertOwner(l, user);
  const clean = Object.fromEntries(Object.entries(input).filter(([k, v]) => k !== "image" && v !== undefined && v !== ""));
  const d = listingUpdateSchema.parse(clean);
  if (d.quantity !== undefined && d.quantity < (l.reserved_quantity ?? 0)) {
    throw badRequest("Quantity cannot be set below the units reserved by accepted offers");
  }
  const sets: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) if (v !== undefined) sets[k === "price" ? "price_cents" : k] = v;
  const image = await saveImage(input.image);
  if (image) { sets.image = image; deleteImage(l.image); }
  if (Object.keys(sets).length) {
    getDb().prepare(`UPDATE listings SET ${Object.keys(sets).map((k) => `${k} = @${k}`).join(", ")}, updated_at = datetime('now') WHERE id = @id`).run({ ...sets, id });
  }
  return getListing(id, user);
}

export function deleteListing(user: User, id: number) {
  const l = getListing(id, user);
  assertOwner(l, user);
  const db = getDb();
  const hasOrders = db.prepare("SELECT 1 FROM orders WHERE listing_id = ?").get(id);
  if (hasOrders) {
    // Keep order history intact: soft-remove instead of hard delete.
    db.prepare("UPDATE listings SET status = 'removed', quantity = 0 WHERE id = ?").run(id);
  } else {
    db.prepare("DELETE FROM listings WHERE id = ?").run(id);
    deleteImage(l.image);
  }
}

export interface SearchParams { q?: string; category?: string; minPrice?: string; maxPrice?: string; condition?: string; zip?: string; radius?: string; city?: string; sellerId?: number; sort?: string; includeSoldOut?: boolean; page?: string; perPage?: string }

export interface SearchResult { listings: Listing[]; total: number; page: number; perPage: number }

/** Units not tied up by accepted offers. */
export function availableQty(l: { quantity: number; reserved_quantity?: number | null }): number {
  return l.quantity - (l.reserved_quantity ?? 0);
}

export function searchListings(p: SearchParams): SearchResult {
  const perPage = Math.min(100, Math.max(1, Math.floor(Number(p.perPage) || 24)));
  const page = Math.max(1, Math.floor(Number(p.page) || 1));
  const where = ["l.status = 'active'", "u.banned = 0"];
  const args: Record<string, unknown> = {};
  if (!p.includeSoldOut) where.push("(l.quantity - l.reserved_quantity) > 0");
  if (p.q) { where.push("(l.title LIKE @q ESCAPE '\\' OR l.description LIKE @q ESCAPE '\\')"); args.q = `%${p.q.replace(/[\\%_]/g, (c) => "\\" + c)}%`; }
  if (p.category) { where.push("l.category = @category"); args.category = p.category; }
  if (p.condition) { where.push("l.condition = @condition"); args.condition = p.condition; }
  if (p.city) { where.push("l.city LIKE @city"); args.city = `%${p.city}%`; }
  const min = Number(p.minPrice), max = Number(p.maxPrice);
  if (p.minPrice && !isNaN(min)) { where.push("l.price_cents >= @min"); args.min = Math.round(min * 100); }
  if (p.maxPrice && !isNaN(max)) { where.push("l.price_cents <= @max"); args.max = Math.round(max * 100); }
  if (p.sellerId) { where.push("l.seller_id = @sellerId"); args.sellerId = p.sellerId; }
  const order = p.sort === "price_asc" ? "l.price_cents ASC" : p.sort === "price_desc" ? "l.price_cents DESC" : "l.created_at DESC, l.id DESC";
  const from = `FROM listings l JOIN users u ON u.id = l.seller_id WHERE ${where.join(" AND ")}`;
  const zipOk = !!p.zip && /^\d{5}$/.test(p.zip);
  const radius = Number(p.radius) || 0;

  if (zipOk && radius > 0) {
    // Distance filtering happens in JS over a bounded set; paginate the filtered rows.
    let rows = getDb().prepare(`SELECT l.*, u.name AS seller_name ${from} ORDER BY ${order} LIMIT 200`).all(args) as Listing[];
    rows = rows
      .map((r) => ({ ...r, distance: distanceMiles(p.zip!, r.zip) }))
      .filter((r) => r.distance != null && r.distance <= radius);
    if (p.sort === "distance") rows.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
    const total = rows.length;
    return { listings: rows.slice((page - 1) * perPage, page * perPage), total, page, perPage };
  }

  const { c: total } = getDb().prepare(`SELECT COUNT(*) AS c ${from}`).get(args) as { c: number };
  let rows = getDb()
    .prepare(`SELECT l.*, u.name AS seller_name ${from} ORDER BY ${order} LIMIT @limit OFFSET @offset`)
    .all({ ...args, limit: perPage, offset: (page - 1) * perPage }) as Listing[];
  if (zipOk) {
    rows = rows.map((r) => ({ ...r, distance: distanceMiles(p.zip!, r.zip) }));
    if (p.sort === "distance") rows.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
  }
  return { listings: rows, total, page, perPage };
}

export function flagListing(user: User, id: number, reason: string) {
  const l = getListing(id, user);
  if (l.seller_id === user.id) throw forbidden("Cannot flag your own listing");
  const r = String(reason || "").trim().slice(0, 500) || "unspecified";
  const res = getDb().prepare("INSERT OR IGNORE INTO flags (listing_id, reporter_id, reason) VALUES (?,?,?)").run(id, user.id, r);
  if (res.changes) getDb().prepare("UPDATE listings SET flag_count = flag_count + 1 WHERE id = ?").run(id);
}
