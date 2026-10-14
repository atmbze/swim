import { notFound } from "next/navigation";
import ApiForm from "@/components/ApiForm";
import ListingFields from "@/components/ListingFields";
import { getListing } from "@/services/listings";
import { requirePageUser } from "@/services/page-auth";
export default async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requirePageUser(`/listings/${id}/edit`);
  let l; try { l = getListing(Number(id), u); } catch { notFound(); }
  if (l.seller_id !== u.id && u.role !== "admin") return <p role="alert" className="error">You can only edit your own listings.</p>;
  return (<div className="card"><h1>Edit listing</h1>
    <ApiForm action={`/api/listings/${l.id}`} method="PATCH" redirectTo={`/listings/${l.id}`}><ListingFields l={l} /><button>Save</button></ApiForm>
    <ApiForm action={`/api/listings/${l.id}`} method="DELETE" redirectTo="/" confirm="Delete this listing?"><button className="secondary">Delete listing</button></ApiForm>
  </div>);
}
