import { createSession, register } from "@/services/auth";
import { readBody, route, sessionCookie } from "@/services/http";
import { clientIp, limitFromEnv, rateLimit } from "@/services/ratelimit";
export const POST = route(async (req) => {
  rateLimit(`register:ip:${clientIp(req)}`, limitFromEnv("REGISTER_RATE_LIMIT", 5), 10 * 60_000);
  const user = await register(await readBody(req));
  return Response.json({ user }, { status: 201, headers: { "Set-Cookie": sessionCookie(createSession(user.id)) } });
});
