import { getDb } from "./db";
import { badRequest, notFound } from "./errors";
import type { User } from "./types";
import { messageSchema } from "./validation";

export function sendMessage(user: User, input: unknown) {
  const d = messageSchema.parse(input);
  if (d.recipientId === user.id) throw badRequest("Cannot message yourself");
  const db = getDb();
  const r = db.prepare("SELECT id, banned FROM users WHERE id = ?").get(d.recipientId) as { banned: number } | undefined;
  if (!r || r.banned) throw notFound("Recipient not found");
  const res = db.prepare("INSERT INTO messages (sender_id, recipient_id, listing_id, body) VALUES (?,?,?,?)").run(user.id, d.recipientId, d.listingId ?? null, d.body);
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(res.lastInsertRowid);
}

export function conversations(user: User) {
  return getDb().prepare(`SELECT other_id, u.name AS other_name, MAX(m.created_at) AS last_at, COUNT(*) AS count FROM (
      SELECT CASE WHEN sender_id = @me THEN recipient_id ELSE sender_id END AS other_id, created_at FROM messages WHERE sender_id = @me OR recipient_id = @me
    ) m JOIN users u ON u.id = m.other_id GROUP BY other_id ORDER BY last_at DESC`).all({ me: user.id }) as { other_id: number; other_name: string; last_at: string; count: number }[];
}

/** Only returns messages where the current user is a participant. */
export function thread(user: User, otherId: number) {
  return getDb().prepare(`SELECT m.*, l.title AS listing_title FROM messages m LEFT JOIN listings l ON l.id = m.listing_id
    WHERE (sender_id = @me AND recipient_id = @o) OR (sender_id = @o AND recipient_id = @me) ORDER BY m.id`).all({ me: user.id, o: otherId }) as { id: number; sender_id: number; body: string; created_at: string; listing_title: string | null }[];
}
