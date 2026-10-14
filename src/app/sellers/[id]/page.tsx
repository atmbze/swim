import { notFound } from "next/navigation";
import ListingCard from "@/components/ListingCard";
import { getUser } from "@/services/auth";
import { searchListings } from "@/services/listings";
export default async function Storefront({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const s = getUser(id);
  if (!s || s.banned) notFound();
  const listings = searchListings({ sellerId: id, includeSoldOut: true });
  return (<>
    <h1>{s.name}&apos;s storefront</h1>
    <p className="muted">{s.city} {s.zip} · member since {s.created_at.slice(0, 10)}</p>
    {s.bio && <p>{s.bio}</p>}
    {listings.length === 0 ? <p className="card">This seller has no active listings.</p> : <div className="grid">{listings.map((l) => <ListingCard key={l.id} l={l} />)}</div>}
  </>);
}
