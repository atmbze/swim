import { notFound } from "next/navigation";
import ApiForm from "@/components/ApiForm";
import { getUser } from "@/services/auth";
import { thread } from "@/services/messages";
import { requirePageUser } from "@/services/page-auth";
export default async function Thread({ params }: { params: Promise<{ id: string }> }) {
  const otherId = Number((await params).id);
  const u = await requirePageUser(`/messages/${otherId}`);
  const other = getUser(otherId);
  if (!other) notFound();
  const msgs = thread(u, otherId);
  return (<><h1>Chat with {other.name}</h1>
    {msgs.length === 0 && <p className="muted">No messages yet.</p>}
    <div aria-live="polite">{msgs.map((m) => <div key={m.id} className={`msg ${m.sender_id === u.id ? "mine" : "theirs"}`}>{m.listing_title && <small>re: {m.listing_title}<br /></small>}{m.body}<br /><small className="muted">{m.created_at}</small></div>)}</div>
    <ApiForm action="/api/messages" resetOnSuccess><input type="hidden" name="recipientId" value={otherId} /><label>Reply<textarea name="body" required maxLength={2000} /></label><button>Send</button></ApiForm>
  </>);
}
