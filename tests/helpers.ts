import { resetDb, getDb } from "@/services/db";
export function freshDb() { resetDb(); return getDb(); }
type H = (req: Request, ctx: any) => Promise<Response>; // eslint-disable-line @typescript-eslint/no-explicit-any
export async function call(h: H, opts: { method?: string; url?: string; body?: unknown; form?: FormData; cookie?: string; params?: Record<string, string>; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.cookie) headers.cookie = opts.cookie;
  // Give each simulated request its own client IP so route rate limits don't
  // trip across unrelated tests; pass an explicit x-forwarded-for to test limits.
  if (!headers["x-forwarded-for"]) headers["x-forwarded-for"] = `test-${Math.random().toString(36).slice(2)}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers["content-type"] = "application/json"; }
  const req = new Request(opts.url || "http://localhost/api/x", { method: opts.method || (body ? "POST" : "GET"), headers, body });
  const res = await h(req, { params: Promise.resolve(opts.params || {}) });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, res };
}
export function cookieOf(res: Response) { return (res.headers.get("set-cookie") || "").split(";")[0]; }
