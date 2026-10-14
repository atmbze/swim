import { logout } from "@/services/auth";
import { readCookie, route, SESSION_COOKIE, sessionCookie } from "@/services/http";
export const POST = route(async (req) => {
  logout(readCookie(req, SESSION_COOKIE));
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", true) } });
});
