import { readBody, requireUser, route } from "@/services/http";
import { conversations, sendMessage, thread } from "@/services/messages";
export const GET = route(async (req) => {
  const u = requireUser(req);
  const w = Number(new URL(req.url).searchParams.get("with"));
  return w ? { messages: thread(u, w) } : { conversations: conversations(u) };
});
export const POST = route(async (req) => Response.json({ message: sendMessage(requireUser(req), await readBody(req)) }, { status: 201 }));
