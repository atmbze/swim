import Link from "next/link";
import ApiForm from "@/components/ApiForm";
import { listOffers } from "@/services/commerce";
import { fmt } from "@/services/constants";
import { requirePageUser } from "@/services/page-auth";
const Act = ({ id, action, label }: { id: number; action: string; label: string }) => (
  <ApiForm action={`/api/offers/${id}`} className="inline"><input type="hidden" name="action" value={action} /><button>{label}</button></ApiForm>);
export default async function Offers() {
  const u = await requirePageUser("/offers");
  const { sent, received } = listOffers(u);
  return (<><h1>Offers</h1>
    <h2>Received</h2>{received.length === 0 ? <p className="muted">None.</p> : <table><tbody>{received.map((o) => <tr key={o.id}><td><Link href={`/listings/${o.listing_id}`}>{o.title}</Link></td><td>{o.buyer_name}</td><td>{fmt(o.amount_cents)} × {o.quantity}</td><td>{o.status}</td>
      <td>{o.status === "pending" && <><Act id={o.id} action="accept" label="Accept" /> <Act id={o.id} action="reject" label="Reject" /></>}</td></tr>)}</tbody></table>}
    <h2>Sent</h2>{sent.length === 0 ? <p className="muted">None.</p> : <table><tbody>{sent.map((o) => <tr key={o.id}><td><Link href={`/listings/${o.listing_id}`}>{o.title}</Link></td><td>{fmt(o.amount_cents)} × {o.quantity}</td><td>{o.status}</td>
      <td>{o.status === "accepted" && <ApiForm action="/api/orders" redirectTo="/orders" className="inline"><input type="hidden" name="offerId" value={o.id} /><button>Checkout</button></ApiForm>}
      {(o.status === "pending" || o.status === "accepted") && <Act id={o.id} action="withdraw" label="Withdraw" />}</td></tr>)}</tbody></table>}
  </>);
}
