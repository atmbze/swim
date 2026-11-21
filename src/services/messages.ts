import { query, queryOne } from "./db";
import { badRequest, notFound } from "./errors";
import type { User } from "./types";
import { messageSchema } from "./validation";

export async function sendMessage(user: User, input: unknown) {
  const d = messageSchema.parse(input);
  if (d.recipientId === user.id) throw badRequest("Cannot message yourself");
  const r = await queryOne<{ id: number; banned: number }>("SELECT id, banned FROM users WHERE id = $1", [d.recipientId]);
  if (!r || r.banned) throw notFound("Recipient not found");
  return queryOne("INSERT INTO messages (sender_id, recipient_id, listing_id, body) VALUES ($1,$2,$3,$4) RETURNING *", [user.id, d.recipientId, d.listingId ?? null, d.body]);
}

export async function conversations(user: User) {
  return query<{ other_id: number; other_name: string; last_at: string; count: number }>(
    `SELECT other_id, u.name AS other_name, MAX(m.created_at) AS last_at, COUNT(*) AS count FROM (
       SELECT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_id, created_at FROM messages WHERE sender_id = $1 OR recipient_id = $1
     ) m JOIN users u ON u.id = m.other_id GROUP BY other_id, u.name ORDER BY last_at DESC`,
    [user.id]
  );
}

/** Only returns messages where the current user is a participant. */
export async function thread(user: User, otherId: number) {
  return query<{ id: number; sender_id: number; body: string; created_at: string; listing_title: string | null }>(
    `SELECT m.*, l.title AS listing_title FROM messages m LEFT JOIN listings l ON l.id = m.listing_id
     WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1) ORDER BY m.id`,
    [user.id, otherId]
  );
}
