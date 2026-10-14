import { getDb } from "./db";
import { badRequest, forbidden, notFound } from "./errors";
import type { User } from "./types";

export function assertAdmin(user: User) {
  if (user.role !== "admin") throw forbidden("Admin only");
}

export function moderateListing(admin: User, id: number, action: string) {
  assertAdmin(admin);
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM listings WHERE id = ?").get(id)) throw notFound();
  if (action === "remove") db.prepare("UPDATE listings SET status='removed' WHERE id=?").run(id);
  else if (action === "restore") db.prepare("UPDATE listings SET status='active' WHERE id=?").run(id);
  else if (action === "clear_flags") { db.prepare("DELETE FROM flags WHERE listing_id=?").run(id); db.prepare("UPDATE listings SET flag_count=0 WHERE id=?").run(id); }
  else throw badRequest("Unknown action");
}

export function moderateUser(admin: User, id: number, action: string) {
  assertAdmin(admin);
  if (id === admin.id) throw badRequest("Cannot moderate yourself");
  const db = getDb();
  const u = db.prepare("SELECT role FROM users WHERE id = ?").get(id) as { role: string } | undefined;
  if (!u) throw notFound();
  if (u.role === "admin") throw forbidden("Cannot ban an admin");
  if (action === "ban") {
    db.prepare("UPDATE users SET banned=1 WHERE id=?").run(id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
  } else if (action === "unban") db.prepare("UPDATE users SET banned=0 WHERE id=?").run(id);
  else throw badRequest("Unknown action");
}

export function adminOverview(admin: User) {
  assertAdmin(admin);
  const db = getDb();
  return {
    flagged: db.prepare(`SELECT l.id, l.title, l.status, l.flag_count, u.name AS seller_name, (SELECT group_concat(reason, ' | ') FROM flags f WHERE f.listing_id = l.id) AS reasons
      FROM listings l JOIN users u ON u.id = l.seller_id WHERE l.flag_count > 0 OR l.status = 'removed' ORDER BY l.flag_count DESC`).all() as { id: number; title: string; status: string; flag_count: number; seller_name: string; reasons: string | null }[],
    users: db.prepare("SELECT id, email, name, role, banned FROM users ORDER BY id").all() as { id: number; email: string; name: string; role: string; banned: number }[],
  };
}
