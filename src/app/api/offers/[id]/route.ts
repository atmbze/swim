import { transitionOffer } from "@/services/commerce";
import { idParam, readBody, requireUser, route, type IdCtx } from "@/services/http";
export const POST = route<IdCtx>(async (req, ctx) => { const u = requireUser(req); return { offer: transitionOffer(u, await idParam(ctx), String((await readBody(req)).action)) }; });
