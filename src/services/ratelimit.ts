import { AppError } from "./errors";

/** Minimal in-memory fixed-window rate limiter (single-process only; resets on restart). */
const buckets = new Map<string, { count: number; reset: number }>();

export function clientIp(req: Request): string {
  // NOTE: X-Forwarded-For is client-controlled unless a trusted proxy overwrites it.
  return (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { count: 1, reset: now + windowMs }); return; }
  if (++b.count > limit) {
    const err = new AppError(429, `Too many attempts. Try again in ${Math.ceil((b.reset - now) / 1000)}s`);
    throw err;
  }
}

export const limitFromEnv = (name: string, dflt: number) => Number(process.env[name]) || dflt;
export function resetRateLimits() { buckets.clear(); }
