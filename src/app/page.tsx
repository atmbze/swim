import ListingCard from "@/components/ListingCard";
import { CATEGORIES, CONDITIONS } from "@/services/constants";
import { ZIPS } from "@/services/geo";
import { searchListings } from "@/services/listings";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { listings, total, page, perPage } = searchListings(sp);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageHref = (n: number) => `/?${new URLSearchParams({ ...sp, page: String(n) })}`;
  return (<>
    <h1>Browse the Southwest</h1>
    <form className="filters" role="search" aria-label="Search listings">
      <label>Search<input name="q" defaultValue={sp.q} placeholder="What are you looking for?" /></label>
      <label>Category<select name="category" defaultValue={sp.category || ""}><option value="">All</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label>Condition<select name="condition" defaultValue={sp.condition || ""}><option value="">Any</option>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label>Min $<input name="minPrice" type="number" min="0" defaultValue={sp.minPrice} /></label>
      <label>Max $<input name="maxPrice" type="number" min="0" defaultValue={sp.maxPrice} /></label>
      <label>City<input name="city" defaultValue={sp.city} /></label>
      <label>Near ZIP<select name="zip" defaultValue={sp.zip || ""}><option value="">—</option>{Object.entries(ZIPS).map(([z, v]) => <option key={z} value={z}>{z} {v.city}</option>)}</select></label>
      <label>Within (mi)<input name="radius" type="number" min="0" defaultValue={sp.radius} /></label>
      <label>Sort<select name="sort" defaultValue={sp.sort || ""}><option value="">Newest</option><option value="price_asc">Price ↑</option><option value="price_desc">Price ↓</option><option value="distance">Distance</option></select></label>
      <div style={{ alignSelf: "end" }}><button>Search</button></div>
    </form>
    <p className="muted">{total} result{total === 1 ? "" : "s"}{totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}</p>
    {listings.length === 0 ? <p className="card">No listings match. Try widening your filters.</p> : <div className="grid">{listings.map((l) => <ListingCard key={l.id} l={l} />)}</div>}
    {totalPages > 1 && (
      <nav aria-label="Search results pages" className="row" style={{ marginTop: 16 }}>
        {page > 1 ? <a className="secondary" href={pageHref(page - 1)}>← Previous</a> : <span className="muted">← Previous</span>}
        {page < totalPages ? <a className="secondary" href={pageHref(page + 1)}>Next →</a> : <span className="muted">Next →</span>}
      </nav>
    )}
  </>);
}
