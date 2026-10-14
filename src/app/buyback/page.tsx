import Link from "next/link";
import ApiForm from "@/components/ApiForm";
import { listBuybacks } from "@/services/buyback";
import { CONDITIONS, fmt } from "@/services/constants";
import { pageUser } from "@/services/page-auth";
export default async function BuyBacker() {
  const u = await pageUser();
  const mine = u ? listBuybacks(u) : [];
  return (<><h1>BuyBacker</h1><p>Submit an item and SWIM staff will send you a buyback quote. (Quotes are informational in this MVP; no payout is processed.)</p>
    {!u ? <p><Link href="/login?next=/buyback">Log in</Link> to submit an item.</p> : (<>
      <div className="card"><ApiForm action="/api/buyback" resetOnSuccess>
        <label>Item<input name="title" required minLength={3} maxLength={120} /></label>
        <label>Details<textarea name="description" required maxLength={3000} /></label>
        <div className="row"><label>Condition<select name="condition">{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Asking ($, optional)<input name="asking" type="number" step="0.01" min="0.01" /></label></div>
        <button>Request quote</button></ApiForm></div>
      <h2>My requests</h2>{mine.length === 0 ? <p className="muted">No requests yet.</p> :
        <table><tbody>{mine.map((b) => <tr key={b.id}><td>{b.title}</td><td>{b.status}</td><td>{b.quote_cents ? `Quote: ${fmt(b.quote_cents)}` : ""} {b.admin_note}</td>
          <td>{b.status === "submitted" && <ApiForm action={`/api/buyback/${b.id}`} className="inline"><input type="hidden" name="action" value="withdraw" /><button className="secondary">Withdraw</button></ApiForm>}</td></tr>)}</tbody></table>}
    </>)}
  </>);
}
