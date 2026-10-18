import { ZodError } from "zod";
import { SESSION_TTL_SEC, userFromToken } from "./auth";
import { AppError, forbidden, unauthorized } from "./errors";
import { rateLimit, type RateLimitRule } from "./ratelimit";
import type { User } from "./types";

export const SESSION_COOKIE = "swim_session";

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
}

export const currentUser = (req: Request): User | null => userFromToken(readCookie(req, SESSION_COOKIE));
export function requireUser(req: Request): User {
  const u = currentUser(req);
  if (!u) throw unauthorized();
  return u;
}

export function sessionCookie(token: string, clear = false) {
  const secure = process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${clear ? "" : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_TTL_SEC}${secure}`;
}

/** Parse JSON or form bodies into a plain object (File values preserved). */
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const b = await req.json().catch(() => null);
    if (!b || typeof b !== "object") throw new AppError(400, "Invalid JSON");
    return b as Record<string, unknown>;
  }
  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    const fd = await req.formData();
    const o: Record<string, unknown> = {};
    fd.forEach((v, k) => (o[k] = v));
    return o;
  }
  return {};
}

type Handler<C> = (req: Request, ctx: C) => Promise<unknown> | unknown;

/** Wraps a route: rate limiting, CSRF origin check on mutations, uniform error mapping. */
export function route<C = unknown>(fn: Handler<C>, opts?: { limit?: RateLimitRule }) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      if (opts?.limit) rateLimit(req, opts.limit);
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("origin");
        const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
        if (origin && host && new URL(origin).host !== host) throw forbidden("Cross-origin request blocked");
      }
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return Response.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof AppError) {
        const res = Response.json({ error: e.message }, { status: e.status });
        for (const [k, v] of Object.entries(e.headers ?? {})) res.headers.set(k, v);
        return res;
      }
      if (e instanceof ZodError) return Response.json({ error: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") }, { status: 400 });
      console.error(e);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

export type IdCtx = { params: Promise<{ id: string }> };
export async function idParam(ctx: IdCtx): Promise<number> {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "Invalid id");
  return id;
}
