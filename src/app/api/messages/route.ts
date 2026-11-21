import { readBody, requireUser, route } from "@/services/http";
import { conversations, sendMessage, thread } from "@/services/messages";
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const w = Number(new URL(req.url).searchParams.get("with"));
  return w ? { messages: await thread(u, w) } : { conversations: await conversations(u) };
});
export const POST = route(async (req) => Response.json({ message: await sendMessage(await requireUser(req), await readBody(req)) }, { status: 201 }), { limit: { key: "messages", max: 30, windowSec: 60 } });
