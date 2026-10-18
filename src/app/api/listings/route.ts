import { readBody, requireUser, route } from "@/services/http";
import { createListing, searchListings } from "@/services/listings";
export const GET = route(async (req) => {
  const p = Object.fromEntries(new URL(req.url).searchParams);
  const r = searchListings({ ...p, sellerId: p.sellerId ? Number(p.sellerId) : undefined });
  return { listings: r.listings, total: r.total, page: r.page, perPage: r.perPage };
});
export const POST = route(async (req) => {
  const user = requireUser(req);
  return Response.json({ listing: await createListing(user, await readBody(req)) }, { status: 201 });
});
