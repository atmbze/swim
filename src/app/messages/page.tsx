import Link from "next/link";
import { conversations } from "@/services/messages";
import { requirePageUser } from "@/services/page-auth";
export default async function Messages() {
  const u = await requirePageUser("/messages");
  const c = conversations(u);
  return (<><h1>Messages</h1>
    {c.length === 0 ? <p className="card">No conversations yet. Message a seller from any listing.</p> :
      <ul>{c.map((x) => <li key={x.other_id}><Link href={`/messages/${x.other_id}`}>{x.other_name}</Link> <small className="muted">({x.count}) {x.last_at}</small></li>)}</ul>}
  </>);
}
