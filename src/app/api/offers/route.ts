import { createOffer, listOffers } from "@/services/commerce";
import { readBody, requireUser, route } from "@/services/http";
export const GET = route(async (req) => listOffers(requireUser(req)));
export const POST = route(async (req) => Response.json({ offer: createOffer(requireUser(req), await readBody(req)) }, { status: 201 }));
