import { createOffer, listOffers } from "@/services/commerce";
import { readBody, requireUser, route } from "@/services/http";
export const GET = route(async (req) => listOffers(await requireUser(req)));
export const POST = route(async (req) => Response.json({ offer: await createOffer(await requireUser(req), await readBody(req)) }, { status: 201 }));
