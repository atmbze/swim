import { readBody, requireUser, route } from "@/services/http";
import { createPromotion, listActivePromotions } from "@/services/promotions";
export const GET = route(async () => ({ promotions: await listActivePromotions() }));
export const POST = route(async (req) => Response.json({ promotion: await createPromotion(await requireUser(req), await readBody(req)) }, { status: 201 }));
