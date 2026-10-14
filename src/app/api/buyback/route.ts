import { listBuybacks, submitBuyback } from "@/services/buyback";
import { readBody, requireUser, route } from "@/services/http";
export const GET = route(async (req) => ({ requests: listBuybacks(requireUser(req), new URL(req.url).searchParams.get("all") === "1") }));
export const POST = route(async (req) => Response.json({ request: submitBuyback(requireUser(req), await readBody(req)) }, { status: 201 }));
