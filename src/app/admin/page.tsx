import Link from "next/link";
import ApiForm from "@/components/ApiForm";
import { adminOverview } from "@/services/admin";
import { listAllBuybacks } from "@/services/buyback";
import { fmt } from "@/services/constants";
import { requirePageUser } from "@/services/page-auth";
export default async function Admin() {
  const u = await requirePageUser("/admin");
  if (u.role !== "admin") return <p role="alert" className="error">403 — admins only.</p>;
  const { flagged, users } = adminOverview(u);
  const bb = listAllBuybacks(u);
  const A = ({ url, action, label }: { url: string; action: string; label: string }) => <ApiForm action={url} className="inline"><input type="hidden" name="action" value={action} /><button className="secondary">{label}</button></ApiForm>;
  return (<><h1>Admin moderation</h1>
    <h2>Flagged / removed listings</h2>{flagged.length === 0 ? <p className="muted">Nothing flagged.</p> : <table><tbody>{flagged.map((l) => <tr key={l.id}><td><Link href={`/listings/${l.id}`}>{l.title}</Link> by {l.seller_name}</td><td>{l.flag_count} flags: {l.reasons}</td><td>{l.status}</td>
      <td>{l.status === "active" ? <A url={`/api/admin/listings/${l.id}`} action="remove" label="Remove" /> : <A url={`/api/admin/listings/${l.id}`} action="restore" label="Restore" />} <A url={`/api/admin/listings/${l.id}`} action="clear_flags" label="Clear flags" /></td></tr>)}</tbody></table>}
    <h2>BuyBacker queue</h2>{bb.length === 0 ? <p className="muted">No requests.</p> : <table><tbody>{bb.map((b) => <tr key={b.id}><td>{b.title} ({b.condition}) — {b.user_name}<br /><small>{b.description}</small></td><td>{b.asking_cents ? `asks ${fmt(b.asking_cents)}` : ""}</td><td>{b.status}{b.quote_cents ? ` ${fmt(b.quote_cents)}` : ""}</td>
      <td>{b.status === "submitted" && <><ApiForm action={`/api/buyback/${b.id}`}><input type="hidden" name="action" value="accept" /><input name="quote" type="number" step="0.01" min="0.01" placeholder="Quote $" required aria-label="Quote amount" /><button>Accept w/ quote</button></ApiForm><A url={`/api/buyback/${b.id}`} action="reject" label="Reject" /></>}</td></tr>)}</tbody></table>}
    <h2>Users</h2><table><tbody>{users.map((x) => <tr key={x.id}><td>{x.name}</td><td>{x.email}</td><td>{x.role}{x.banned ? " (banned)" : ""}</td>
      <td>{x.role !== "admin" && <A url={`/api/admin/users/${x.id}`} action={x.banned ? "unban" : "ban"} label={x.banned ? "Unban" : "Ban"} />}</td></tr>)}</tbody></table>
  </>);
}
