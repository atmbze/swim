import Link from "next/link";
import { notFound } from "next/navigation";
import ApiForm from "@/components/ApiForm";
import { fmt } from "@/services/constants";
import { availableQty, getListing } from "@/services/listings";
import { pageUser } from "@/services/page-auth";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await pageUser();
  let l; try { l = getListing(Number(id), u); } catch { notFound(); }
  const own = u?.id === l.seller_id;
  const avail = availableQty(l);
  return (<article>
    {l.status === "removed" && <p className="error" role="alert">This listing was removed by moderation.</p>}
    {l.image && <img src={`/api/images/${l.image}`} alt={l.title} style={{ maxWidth: "100%", maxHeight: 400, borderRadius: 10 }} />}
    <h1>{l.title}</h1>
    <p className="price" style={{ fontSize: 24 }}>{fmt(l.price_cents)}</p>
    <p><span className="badge">{l.category}</span> <span className="badge">{l.condition}</span> <span className="badge">{avail > 0 ? `${avail} available` : "sold out"}</span></p>
    <p>Seller: <Link href={`/sellers/${l.seller_id}`}>{l.seller_name}</Link> · {l.city} {l.zip}</p>
    <p style={{ whiteSpace: "pre-wrap" }}>{l.description}</p>
    {own && <p><Link href={`/listings/${l.id}/edit`}>Edit / delete</Link> · <Link href="/deals">Create a promo code</Link></p>}
    {!u && <p><Link href={`/login?next=/listings/${l.id}`}>Log in</Link> to buy, make an offer or message the seller.</p>}
    {u && !own && l.status === "active" && avail > 0 && (<>
      <section className="card"><h2>Buy now</h2>
        <p className="mock">MOCK CHECKOUT — no real payment is taken.</p>
        <ApiForm action="/api/orders" redirectTo="/orders">
          <input type="hidden" name="listingId" value={l.id} />
          <div className="row"><label>Quantity<input name="quantity" type="number" min={1} max={avail} defaultValue={1} /></label>
          <label>Deal Den code<input name="promoCode" placeholder="optional" /></label></div>
          <button>Place order</button>
        </ApiForm></section>
      <section className="card"><h2>Make an offer</h2>
        <ApiForm action="/api/offers" redirectTo="/offers">
          <input type="hidden" name="listingId" value={l.id} />
          <div className="row"><label>Offer ($ each)<input name="amount" type="number" step="0.01" min="0.01" required /></label>
          <label>Quantity<input name="quantity" type="number" min={1} max={avail} defaultValue={1} /></label></div>
          <button>Send offer</button>
        </ApiForm></section>
    </>)}
    {u && !own && (<>
      <section className="card"><h2>Message seller</h2>
        <ApiForm action="/api/messages" redirectTo={`/messages/${l.seller_id}`}>
          <input type="hidden" name="recipientId" value={l.seller_id} /><input type="hidden" name="listingId" value={l.id} />
          <label>Message<textarea name="body" required maxLength={2000} /></label><button>Send</button>
        </ApiForm></section>
      <details className="card"><summary>Report this listing</summary>
        <ApiForm action={`/api/listings/${l.id}/flag`} resetOnSuccess><label>Reason<input name="reason" required maxLength={500} /></label><button className="secondary">Flag</button></ApiForm>
      </details>
    </>)}
    {u?.role === "admin" && (<ApiForm action={`/api/admin/listings/${l.id}`}><input type="hidden" name="action" value={l.status === "removed" ? "restore" : "remove"} /><button className="secondary">Admin: {l.status === "removed" ? "restore" : "remove"} listing</button></ApiForm>)}
  </article>);
}
