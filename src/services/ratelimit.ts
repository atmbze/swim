import { AppError } from "./errors";

export interface RateLimitRule { key: string; max: number; windowSec: number; }

interface Bucket { count: number; resetAt: number; }
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10000; // bound memory when facing many distinct clients

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return (req.headers.get("x-real-ip") || "unknown").slice(0, 64);
}

/**
 * Fixed-window rate limiter keyed by rule + client IP.
 * Throws a 429 AppError (with Retry-After) when the bucket is exhausted.
 */
export function rateLimit(req: Request, rule: RateLimitRule): void {
  const now = Date.now();
  const k = `${rule.key}:${clientIp(req)}`;
  let b = buckets.get(k);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + rule.windowSec * 1000 };
    buckets.set(k, b);
    if (buckets.size > MAX_BUCKETS) {
      const oldest = buckets.keys().next();
      if (!oldest.done) buckets.delete(oldest.value);
    }
  }
  b.count += 1;
  if (b.count > rule.max) {
    const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    throw new AppError(429, `Too many requests — please try again in ${retryAfter} seconds`, { "Retry-After": String(retryAfter) });
  }
}

/** Test hook: clear all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}
