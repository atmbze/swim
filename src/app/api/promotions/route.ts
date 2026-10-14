import { readBody, requireUser, route } from "@/services/http";
import { createPromotion, listActivePromotions } from "@/services/promotions";
export const GET = route(async () => ({ promotions: listActivePromotions() }));
export const POST = route(async (req) => Response.json({ promotion: createPromotion(requireUser(req), await readBody(req)) }, { status: 201 }));
