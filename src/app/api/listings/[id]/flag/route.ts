import { idParam, readBody, requireUser, route, type IdCtx } from "@/services/http";
import { flagListing } from "@/services/listings";
export const POST = route<IdCtx>(async (req, ctx) => { const u = requireUser(req); flagListing(u, await idParam(ctx), String((await readBody(req)).reason ?? "")); return { ok: true }; }, { limit: { key: "flag", max: 20, windowSec: 3600 } });
