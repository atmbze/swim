import Link from "next/link";
import ApiForm from "@/components/ApiForm";
import { CATEGORIES } from "@/services/constants";
import { searchListings } from "@/services/listings";
import { pageUser } from "@/services/page-auth";
import { listActivePromotions } from "@/services/promotions";
export default async function DealDen() {
  const u = await pageUser();
  const promos = listActivePromotions();
  const myListings = u ? searchListings({ sellerId: u.id, includeSoldOut: true }).listings : [];
  return (<><h1>Deal Den</h1><p>Active discount codes. Enter a code at checkout on an eligible listing.</p>
    {promos.length === 0 ? <p className="card">No active deals right now.</p> :
      <div className="grid">{promos.map((p) => <div key={p.id} className="card"><strong>{p.title}</strong><div className="price">{p.percent_off}% off</div><code>{p.code}</code>
        <br /><small>{p.listing_id ? <>Listing: <Link href={`/listings/${p.listing_id}`}>{p.listing_title}</Link></> : p.seller_id ? <>All items from <Link href={`/sellers/${p.seller_id}`}>{p.seller_name}</Link></> : "Site-wide"}{p.category ? ` · ${p.category}` : ""}{p.expires_at ? ` · until ${p.expires_at}` : ""}{p.max_uses ? ` · ${p.max_uses - p.uses} left` : ""}</small>
        {u && (u.role === "admin" || u.id === p.seller_id) && <ApiForm action={`/api/promotions/${p.id}`}><button className="secondary">Deactivate</button></ApiForm>}</div>)}</div>}
    {u && (<div className="card"><h2>Create a promo {u.role === "admin" ? "(admin: blank listing = site-wide)" : "for your listings"}</h2>
      <ApiForm action="/api/promotions" resetOnSuccess>
        <div className="row"><label>Code<input name="code" required pattern="[A-Za-z0-9_\-]{3,20}" /></label><label>% off<input name="percentOff" type="number" min={1} max={90} required /></label></div>
        <label>Title<input name="title" required /></label>
        <div className="row"><label>Listing<select name="listingId"><option value="">{u.role === "admin" ? "All (site-wide)" : "All my listings"}</option>{myListings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select></label>
        <label>Category<select name="category"><option value="">Any</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label></div>
        <div className="row"><label>Max uses<input name="maxUses" type="number" min={1} /></label><label>Expires<input name="expiresAt" type="date" /></label></div>
        <button>Create</button></ApiForm></div>)}
  </>);
}
