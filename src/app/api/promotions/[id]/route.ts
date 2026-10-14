import { idParam, requireUser, route, type IdCtx } from "@/services/http";
import { deactivatePromotion } from "@/services/promotions";
export const DELETE = route<IdCtx>(async (req, ctx) => { deactivatePromotion(requireUser(req), await idParam(ctx)); return { ok: true }; });
export const POST = DELETE;
