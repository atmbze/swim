import { createSession, register } from "@/services/auth";
import { readBody, route, sessionCookie } from "@/services/http";
export const POST = route(async (req) => {
  const user = await register(await readBody(req));
  const token = await createSession(user.id);
  return Response.json({ user }, { status: 201, headers: { "Set-Cookie": sessionCookie(token) } });
}, { limit: { key: "register", max: 10, windowSec: 3600 } });
