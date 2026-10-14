import { createSession, register } from "@/services/auth";
import { readBody, route, sessionCookie } from "@/services/http";
export const POST = route(async (req) => {
  const user = await register(await readBody(req));
  return Response.json({ user }, { status: 201, headers: { "Set-Cookie": sessionCookie(createSession(user.id)) } });
});
