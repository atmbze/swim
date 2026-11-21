import { execute, query, queryOne } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import type { User } from "./types";
import { buybackSchema } from "./validation";

/** BuyBacker: submitted -> accepted (admin sets quote) | rejected (admin) | withdrawn (owner). */
export interface Buyback { id: number; user_id: number; title: string; description: string; condition: string; asking_cents: number | null; quote_cents: number | null; admin_note: string | null; status: string; created_at: string }

export async function submitBuyback(user: User, input: unknown): Promise<Buyback> {
  const d = buybackSchema.parse(input);
  const r = await queryOne<{ id: number }>("INSERT INTO buyback_requests (user_id, title, description, condition, asking_cents) VALUES ($1,$2,$3,$4,$5) RETURNING id", [user.id, d.title, d.description, d.condition, d.asking ?? null]);
  return getBuyback(r!.id);
}

export async function getBuyback(id: number): Promise<Buyback> {
  const b = await queryOne<Buyback>("SELECT * FROM buyback_requests WHERE id = $1", [id]);
  if (!b) throw notFound("Buyback request not found");
  return b;
}

export async function listAllBuybacks(user: User) {
  if (user.role !== "admin") throw forbidden("Admin only");
  return query<Buyback & { user_name: string }>("SELECT b.*, u.name AS user_name FROM buyback_requests b JOIN users u ON u.id = b.user_id ORDER BY b.id DESC");
}

export async function listBuybacks(user: User, all = false): Promise<Buyback[]> {
  if (all) return listAllBuybacks(user);
  return query<Buyback>("SELECT * FROM buyback_requests WHERE user_id = $1 ORDER BY id DESC", [user.id]);
}

export async function decideBuyback(user: User, id: number, action: string, quoteDollars?: unknown, note?: unknown): Promise<Buyback> {
  const b = await getBuyback(id);
  const adminNote = note ? String(note).slice(0, 500) : null;
  if (action === "withdraw") {
    if (b.user_id !== user.id) throw forbidden("Not your request");
  } else if (action === "accept" || action === "reject") {
    if (user.role !== "admin") throw forbidden("Admin only");
  } else throw badRequest("Unknown action");
  if (b.status !== "submitted") throw conflict(`Request already ${b.status}`);
  if (action === "accept") {
    const q = Number(quoteDollars);
    if (!Number.isFinite(q) || q <= 0 || q > 1_000_000) throw badRequest("Quote must be a positive amount");
    await execute("UPDATE buyback_requests SET status='accepted', quote_cents=$1, admin_note=$2 WHERE id=$3", [Math.round(q * 100), adminNote, id]);
  } else {
    await execute("UPDATE buyback_requests SET status=$1, admin_note=COALESCE($2, admin_note) WHERE id=$3", [action === "reject" ? "rejected" : "withdrawn", adminNote, id]);
  }
  return getBuyback(id);
}
