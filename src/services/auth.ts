import bcrypt from "bcryptjs";
import crypto from "crypto";
import { execute, isUniqueViolation, queryOne } from "./db";
import { badRequest, conflict, forbidden, unauthorized } from "./errors";
import type { User } from "./types";
import { loginSchema, profileSchema, registerSchema } from "./validation";

export const SESSION_TTL_SEC = 60 * 60 * 24 * 7;
const COST = Number(process.env.BCRYPT_COST || 10);
const PUBLIC_COLS = "id, email, name, city, zip, bio, role, banned, tier, created_at";
const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export async function register(input: unknown): Promise<User> {
  const d = registerSchema.parse(input);
  // users.email is CITEXT: this check (and the unique index) is case-insensitive.
  if (await queryOne("SELECT 1 FROM users WHERE email = $1", [d.email])) throw conflict("Email already registered");
  const hash = await bcrypt.hash(d.password, COST);
  try {
    const r = await queryOne<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, city, zip) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [d.email, hash, d.name, d.city, d.zip]
    );
    return (await getUser(r!.id))!;
  } catch (e) {
    // Lost a registration race: the unique index fired instead of the pre-check.
    if (isUniqueViolation(e)) throw conflict("Email already registered");
    throw e;
  }
}

export async function login(input: unknown): Promise<{ user: User; token: string }> {
  const d = loginSchema.parse(input);
  const row = await queryOne<User & { password_hash: string }>("SELECT * FROM users WHERE email = $1", [d.email]);
  // Always run a bcrypt compare to reduce user-enumeration timing differences.
  const ok = await bcrypt.compare(d.password, row?.password_hash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!row || !ok) throw unauthorized("Invalid email or password");
  if (row.banned) throw forbidden("Account banned");
  return { user: (await getUser(row.id))!, token: await createSession(row.id) };
}

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)", [sha(token), userId, Date.now() + SESSION_TTL_SEC * 1000]);
  return token;
}

export async function userFromToken(token: string | undefined | null): Promise<User | null> {
  if (!token) return null;
  const s = await queryOne<{ user_id: number; expires_at: number }>("SELECT user_id, expires_at FROM sessions WHERE token_hash = $1", [sha(token)]);
  if (!s) return null;
  if (s.expires_at < Date.now()) {
    await execute("DELETE FROM sessions WHERE token_hash = $1", [sha(token)]);
    return null;
  }
  const u = await getUser(s.user_id);
  if (!u || u.banned) return null;
  return u;
}

export async function logout(token: string | undefined | null) {
  if (token) await execute("DELETE FROM sessions WHERE token_hash = $1", [sha(token)]);
}

export async function getUser(id: number): Promise<User | undefined> {
  return queryOne<User>(`SELECT ${PUBLIC_COLS} FROM users WHERE id = $1`, [id]);
}

export async function updateProfile(user: User, input: unknown): Promise<User> {
  const d = profileSchema.parse(input);
  const keys = Object.keys(d).filter((k) => (d as Record<string, unknown>)[k] !== undefined) as (keyof typeof d)[];
  if (!keys.length) throw badRequest("Nothing to update");
  const params = keys.map((k) => d[k]);
  await execute(`UPDATE users SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(", ")} WHERE id = $${keys.length + 1}`, [...params, user.id]);
  return (await getUser(user.id))!;
}
