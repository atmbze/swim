import { login } from "@/services/auth";
import { readBody, route, sessionCookie } from "@/services/http";
export const POST = route(async (req) => {
  const { user, token } = await login(await readBody(req));
  return Response.json({ user }, { headers: { "Set-Cookie": sessionCookie(token) } });
});
