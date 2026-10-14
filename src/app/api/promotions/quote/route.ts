import { currentUser, route } from "@/services/http";
import { quotePromo } from "@/services/promotions";
export const GET = route(async (req) => {
  const s = new URL(req.url).searchParams;
  return quotePromo(String(s.get("code") || ""), Number(s.get("listingId")), Math.max(1, Number(s.get("quantity")) || 1), currentUser(req)?.id);
});
