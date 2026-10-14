import Link from "next/link";
import { fmt } from "@/services/constants";
import type { Listing } from "@/services/types";

export default function ListingCard({ l }: { l: Listing }) {
  return (
    <Link href={`/listings/${l.id}`} className="card listing-card">
      {l.image ? <img src={`/api/images/${l.image}`} alt="" loading="lazy" /> : <div className="noimg" aria-hidden>📦</div>}
      <div>
        <strong>{l.title}</strong>
        <div className="price">{fmt(l.price_cents)}</div>
        <small>{l.category} · {l.city || l.zip || "—"}{l.distance != null ? ` · ${l.distance.toFixed(0)} mi` : ""}{l.quantity === 0 ? " · sold out" : ""}</small>
      </div>
    </Link>
  );
}
