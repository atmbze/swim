import { login } from "@/services/auth";
import { readBody, route, sessionCookie } from "@/services/http";
import { clientIp, limitFromEnv, rateLimit } from "@/services/ratelimit";
export const POST = route(async (req) => {
  const body = await readBody(req);
  const limit = limitFromEnv("LOGIN_RATE_LIMIT", 10);
  rateLimit(`login:ip:${clientIp(req)}`, limit * 3, 60_000);
  rateLimit(`login:email:${String(body.email || "").trim().toLowerCase()}`, limit, 60_000);
  const { user, token } = await login(body);
  return Response.json({ user }, { headers: { "Set-Cookie": sessionCookie(token) } });
});
