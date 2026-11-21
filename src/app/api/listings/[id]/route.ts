import { currentUser, idParam, readBody, requireUser, route, type IdCtx } from "@/services/http";
import { deleteListing, getListing, updateListing } from "@/services/listings";
export const GET = route<IdCtx>(async (req, ctx) => ({ listing: await getListing(await idParam(ctx), await currentUser(req)) }));
export const PATCH = route<IdCtx>(async (req, ctx) => ({ listing: await updateListing(await requireUser(req), await idParam(ctx), await readBody(req)) }));
export const PUT = PATCH;
export const DELETE = route<IdCtx>(async (req, ctx) => { await deleteListing(await requireUser(req), await idParam(ctx)); return { ok: true }; });
