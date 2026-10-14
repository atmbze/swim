import { getOrder, transitionOrder } from "@/services/commerce";
import { forbidden } from "@/services/errors";
import { idParam, readBody, requireUser, route, type IdCtx } from "@/services/http";
export const GET = route<IdCtx>(async (req, ctx) => {
  const u = requireUser(req); const o = getOrder(await idParam(ctx));
  if (o.buyer_id !== u.id && o.seller_id !== u.id && u.role !== "admin") throw forbidden("Not your order");
  return { order: o };
});
export const POST = route<IdCtx>(async (req, ctx) => { const u = requireUser(req); return { order: transitionOrder(u, await idParam(ctx), String((await readBody(req)).action)) }; });
