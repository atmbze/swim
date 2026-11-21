import { decideBuyback } from "@/services/buyback";
import { idParam, readBody, requireUser, route, type IdCtx } from "@/services/http";
export const POST = route<IdCtx>(async (req, ctx) => {
  const u = await requireUser(req); const b = await readBody(req);
  return { request: await decideBuyback(u, await idParam(ctx), String(b.action), b.quote, b.note) };
});
