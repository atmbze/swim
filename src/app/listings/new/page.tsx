import ApiForm from "@/components/ApiForm";
import ListingFields from "@/components/ListingFields";
import { requirePageUser } from "@/services/page-auth";
export default async function NewListing() {
  await requirePageUser("/listings/new");
  return (<div className="card"><h1>Create listing</h1><ApiForm action="/api/listings" redirectTo="/listings/{id}"><ListingFields /><button>Publish</button></ApiForm></div>);
}
