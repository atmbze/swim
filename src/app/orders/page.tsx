import Link from "next/link";
import ApiForm from "@/components/ApiForm";
import { listOrders } from "@/services/commerce";
import { fmt } from "@/services/constants";
import { requirePageUser } from "@/services/page-auth";
const Act = ({ id, action, label }: { id: number; action: string; label: string }) => (
  <ApiForm action={`/api/orders/${id}`} className="inline"><input type="hidden" name="action" value={action} /><button>{label}</button></ApiForm>);
export default async function Orders() {
  const u = await requirePageUser("/orders");
  const { purchases, sales } = listOrders(u);
  return (<><h1>Orders</h1><p className="mock">Payments are MOCKED. &quot;Pay (mock)&quot; only changes the order status; no money moves.</p>
    <h2>Purchases</h2>{purchases.length === 0 ? <p className="muted">No purchases yet.</p> : <table><tbody>{purchases.map((o) => <tr key={o.id} data-testid={`order-${o.id}`}><td>#{o.id} <Link href={`/listings/${o.listing_id}`}>{o.title}</Link></td><td>{fmt(o.total_cents)}{o.promo_code ? ` (${o.promo_code} −${fmt(o.discount_cents)})` : ""}</td><td className="status">{o.status}</td>
      <td>{o.status === "pending_payment" && <><Act id={o.id} action="pay" label="Pay (mock)" /> <Act id={o.id} action="cancel" label="Cancel" /></>}{o.status === "shipped" && <Act id={o.id} action="confirm" label="Confirm delivery" />}</td></tr>)}</tbody></table>}
    <h2>Sales</h2>{sales.length === 0 ? <p className="muted">No sales yet.</p> : <table><tbody>{sales.map((o) => <tr key={o.id}><td>#{o.id} {o.title}</td><td>{fmt(o.total_cents)}</td><td>{o.status}</td>
      <td>{o.status === "paid" && <><Act id={o.id} action="ship" label="Mark shipped" /> <Act id={o.id} action="cancel" label="Cancel + mock refund" /></>}{o.status === "pending_payment" && <Act id={o.id} action="cancel" label="Cancel" />}</td></tr>)}</tbody></table>}
  </>);
}
