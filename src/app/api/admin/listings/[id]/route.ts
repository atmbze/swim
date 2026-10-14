import { moderateListing } from "@/services/admin";
import { idParam, readBody, requireUser, route, type IdCtx } from "@/services/http";
export const POST = route<IdCtx>(async (req, ctx) => { const u = requireUser(req); moderateListing(u, await idParam(ctx), String((await readBody(req)).action)); return { ok: true }; });
