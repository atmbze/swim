import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { userFromToken } from "./auth";
import { SESSION_COOKIE } from "./http";

export async function pageUser() {
  return userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function requirePageUser(next = "/") {
  const u = await pageUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}
