import { createOrder, listOrders } from "@/services/commerce";
import { readBody, requireUser, route } from "@/services/http";
export const GET = route(async (req) => listOrders(requireUser(req)));
export const POST = route(async (req) => {
  const u = requireUser(req);
  const b = await readBody(req);
  if (b.offerId === "" || b.offerId == null) delete b.offerId;
  if (b.promoCode === "") delete b.promoCode;
  return Response.json({ order: createOrder(u, b) }, { status: 201 });
});
