import { currentUser, idParam, readBody, requireUser, route, type IdCtx } from "@/services/http";
import { deleteListing, getListing, updateListing } from "@/services/listings";
export const GET = route<IdCtx>(async (req, ctx) => ({ listing: getListing(await idParam(ctx), currentUser(req)) }));
export const PATCH = route<IdCtx>(async (req, ctx) => ({ listing: await updateListing(requireUser(req), await idParam(ctx), await readBody(req)) }));
export const PUT = PATCH;
export const DELETE = route<IdCtx>(async (req, ctx) => { deleteListing(requireUser(req), await idParam(ctx)); return { ok: true }; });
