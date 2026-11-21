import { execute, query, queryOne } from "./db";
import { badRequest, forbidden, notFound } from "./errors";
import type { User } from "./types";

export function assertAdmin(user: User) {
  if (user.role !== "admin") throw forbidden("Admin only");
}

export async function moderateListing(admin: User, id: number, action: string) {
  assertAdmin(admin);
  if (!(await queryOne("SELECT 1 FROM listings WHERE id = $1", [id]))) throw notFound();
  if (action === "remove") await execute("UPDATE listings SET status='removed' WHERE id=$1", [id]);
  else if (action === "restore") await execute("UPDATE listings SET status='active' WHERE id=$1", [id]);
  else if (action === "clear_flags") {
    await execute("DELETE FROM flags WHERE listing_id=$1", [id]);
    await execute("UPDATE listings SET flag_count=0 WHERE id=$1", [id]);
  } else throw badRequest("Unknown action");
}

export async function moderateUser(admin: User, id: number, action: string) {
  assertAdmin(admin);
  if (id === admin.id) throw badRequest("Cannot moderate yourself");
  const u = await queryOne<{ role: string }>("SELECT role FROM users WHERE id = $1", [id]);
  if (!u) throw notFound();
  if (u.role === "admin") throw forbidden("Cannot ban an admin");
  if (action === "ban") {
    await execute("UPDATE users SET banned=1 WHERE id=$1", [id]);
    await execute("DELETE FROM sessions WHERE user_id=$1", [id]);
  } else if (action === "unban") await execute("UPDATE users SET banned=0 WHERE id=$1", [id]);
  else throw badRequest("Unknown action");
}

export async function adminOverview(admin: User) {
  assertAdmin(admin);
  return {
    // string_agg is Postgres' group_concat.
    flagged: await query<{ id: number; title: string; status: string; flag_count: number; seller_name: string; reasons: string | null }>(
      `SELECT l.id, l.title, l.status, l.flag_count, u.name AS seller_name, (SELECT string_agg(reason, ' | ') FROM flags f WHERE f.listing_id = l.id) AS reasons
       FROM listings l JOIN users u ON u.id = l.seller_id WHERE l.flag_count > 0 OR l.status = 'removed' ORDER BY l.flag_count DESC`
    ),
    users: await query<{ id: number; email: string; name: string; role: string; banned: number }>("SELECT id, email, name, role, banned FROM users ORDER BY id"),
  };
}
