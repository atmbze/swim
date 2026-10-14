import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getDb } from "./db";
import { badRequest, conflict, forbidden, unauthorized } from "./errors";
import type { User } from "./types";
import { loginSchema, profileSchema, registerSchema } from "./validation";

export const SESSION_TTL_SEC = 60 * 60 * 24 * 7;
const COST = Number(process.env.BCRYPT_COST || 10);
const PUBLIC_COLS = "id, email, name, city, zip, bio, role, banned, created_at";
const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export async function register(input: unknown): Promise<User> {
  const d = registerSchema.parse(input);
  const db = getDb();
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(d.email)) throw conflict("Email already registered");
  const hash = await bcrypt.hash(d.password, COST);
  const r = db.prepare("INSERT INTO users (email, password_hash, name, city, zip) VALUES (?,?,?,?,?)").run(d.email, hash, d.name, d.city, d.zip);
  return getUser(Number(r.lastInsertRowid))!;
}

export async function login(input: unknown): Promise<{ user: User; token: string }> {
  const d = loginSchema.parse(input);
  const row = getDb().prepare("SELECT * FROM users WHERE email = ?").get(d.email) as (User & { password_hash: string }) | undefined;
  // Always run a bcrypt compare to reduce user-enumeration timing differences.
  const ok = await bcrypt.compare(d.password, row?.password_hash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!row || !ok) throw unauthorized("Invalid email or password");
  if (row.banned) throw forbidden("Account banned");
  return { user: getUser(row.id)!, token: createSession(row.id) };
}

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString("base64url");
  getDb().prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)").run(sha(token), userId, Date.now() + SESSION_TTL_SEC * 1000);
  return token;
}

export function userFromToken(token: string | undefined | null): User | null {
  if (!token) return null;
  const db = getDb();
  const s = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?").get(sha(token)) as { user_id: number; expires_at: number } | undefined;
  if (!s) return null;
  if (s.expires_at < Date.now()) { db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token)); return null; }
  const u = getUser(s.user_id);
  if (!u || u.banned) return null;
  return u;
}

export function logout(token: string | undefined | null) {
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
}

export function getUser(id: number): User | undefined {
  return getDb().prepare(`SELECT ${PUBLIC_COLS} FROM users WHERE id = ?`).get(id) as User | undefined;
}

export function updateProfile(user: User, input: unknown): User {
  const d = profileSchema.parse(input);
  const keys = Object.keys(d).filter((k) => (d as Record<string, unknown>)[k] !== undefined) as (keyof typeof d)[];
  if (!keys.length) throw badRequest("Nothing to update");
  getDb().prepare(`UPDATE users SET ${keys.map((k) => `${k} = @${k}`).join(", ")} WHERE id = @id`).run({ ...d, id: user.id });
  return getUser(user.id)!;
}
