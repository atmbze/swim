import { getDb } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import type { User } from "./types";
import { buybackSchema } from "./validation";

/** BuyBacker: submitted -> accepted (admin sets quote) | rejected (admin) | withdrawn (owner). */
export interface Buyback { id: number; user_id: number; title: string; description: string; condition: string; asking_cents: number | null; quote_cents: number | null; admin_note: string | null; status: string; created_at: string }

export function submitBuyback(user: User, input: unknown): Buyback {
  const d = buybackSchema.parse(input);
  const r = getDb().prepare("INSERT INTO buyback_requests (user_id, title, description, condition, asking_cents) VALUES (?,?,?,?,?)").run(user.id, d.title, d.description, d.condition, d.asking ?? null);
  return getBuyback(Number(r.lastInsertRowid));
}

export function getBuyback(id: number): Buyback {
  const b = getDb().prepare("SELECT * FROM buyback_requests WHERE id = ?").get(id) as Buyback | undefined;
  if (!b) throw notFound("Buyback request not found");
  return b;
}

export function listAllBuybacks(user: User) {
  if (user.role !== "admin") throw forbidden("Admin only");
  return getDb().prepare("SELECT b.*, u.name AS user_name FROM buyback_requests b JOIN users u ON u.id = b.user_id ORDER BY b.id DESC").all() as (Buyback & { user_name: string })[];
}

export function listBuybacks(user: User, all = false): Buyback[] {
  if (all) return listAllBuybacks(user);
  return getDb().prepare("SELECT * FROM buyback_requests WHERE user_id = ? ORDER BY id DESC").all(user.id) as Buyback[];
}

export function decideBuyback(user: User, id: number, action: string, quoteDollars?: unknown, note?: unknown): Buyback {
  const b = getBuyback(id);
  const adminNote = note ? String(note).slice(0, 500) : null;
  if (action === "withdraw") {
    if (b.user_id !== user.id) throw forbidden("Not your request");
  } else if (action === "accept" || action === "reject") {
    if (user.role !== "admin") throw forbidden("Admin only");
  } else throw badRequest("Unknown action");
  if (b.status !== "submitted") throw conflict(`Request already ${b.status}`);
  const db = getDb();
  if (action === "accept") {
    const q = Number(quoteDollars);
    if (!Number.isFinite(q) || q <= 0 || q > 1_000_000) throw badRequest("Quote must be a positive amount");
    db.prepare("UPDATE buyback_requests SET status='accepted', quote_cents=?, admin_note=? WHERE id=?").run(Math.round(q * 100), adminNote, id);
  } else {
    db.prepare("UPDATE buyback_requests SET status=?, admin_note=COALESCE(?, admin_note) WHERE id=?").run(action === "reject" ? "rejected" : "withdrawn", adminNote, id);
  }
  return getBuyback(id);
}
