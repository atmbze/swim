/* Seeds demo data into Postgres. Usage: npm run seed. Wipes all app tables first.
   Target: DATABASE_URL_UNPOOLED if set, else DATABASE_URL.
   Guard: hosted (non-localhost) databases are refused unless
   ALLOW_STAGING_SEED=1 — the seed creates @swim.test demo accounts sharing
   one password and must never run against production. */
import { register } from "../src/services/auth";
import { submitBuyback } from "../src/services/buyback";
import { closePool, execute, getPool } from "../src/services/db";
import { createListing } from "../src/services/listings";
import { migrate } from "../src/services/migrations";
import { createPromotion } from "../src/services/promotions";

function targetUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED) first — see .env.example");
  const host = new URL(url).hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!local && process.env.ALLOW_STAGING_SEED !== "1") {
    throw new Error(`Refusing to seed hosted database at ${host} without ALLOW_STAGING_SEED=1 (seed wipes all data and creates demo accounts)`);
  }
  return url;
}

async function main() {
  process.env.DATABASE_URL = targetUrl();
  const client = await getPool().connect();
  try {
    await migrate(client);
  } finally {
    client.release();
  }
  await execute("TRUNCATE promotions, orders, offers, messages, flags, buyback_requests, listings, sessions, users RESTART IDENTITY CASCADE");
  const pw = process.env.SEED_PASSWORD || "password123";
  const admin = await register({ email: "admin@swim.test", password: pw, name: "SWIM Admin", city: "Phoenix", zip: "85001" });
  await execute("UPDATE users SET role='admin' WHERE id=$1", [admin.id]);
  const sam = await register({ email: "seller@swim.test", password: pw, name: "Sam's Desert Goods", city: "Tucson", zip: "85701" });
  const bea = await register({ email: "buyer@swim.test", password: pw, name: "Bea Buyer", city: "Tempe", zip: "85281" });
  const nina = await register({ email: "nm@swim.test", password: pw, name: "Nina NM", city: "Albuquerque", zip: "87101" });
  const items: [typeof sam, string, number, string, string, number, string, string][] = [
    [sam, "Vintage Saguaro Lamp", 45, "home", "good", 3, "Tucson", "85701"],
    [sam, "Cordless Drill 20V", 79.99, "tools", "like_new", 2, "Tucson", "85701"],
    [sam, "Camping Tent 4-person", 120, "outdoors", "good", 1, "Tucson", "85701"],
    [nina, "Turquoise Necklace", 210, "collectibles", "new", 5, "Albuquerque", "87101"],
    [nina, "Oak Dining Chairs (set of 4)", 160, "furniture", "fair", 1, "Albuquerque", "87101"],
    [bea, "iPhone 13 128GB", 380, "electronics", "good", 1, "Tempe", "85281"],
  ];
  const ids: number[] = [];
  for (const [u, title, price, category, condition, quantity, city, zip] of items) {
    ids.push((await createListing(u, { title, description: `${title} — local pickup or shipping.`, price, category, condition, quantity, city, zip })).id);
  }
  await createPromotion({ ...admin, role: "admin" }, { code: "WELCOME10", title: "Welcome to SOWESTIM", percentOff: 10 });
  await createPromotion(sam, { code: "SAMTOOLS", title: "Sam's tool sale", percentOff: 20, category: "tools" });
  await submitBuyback(bea, { title: "Old Nintendo Switch", description: "Works, minor scratches", condition: "good", asking: 120 });
  console.log(`Seeded. Logins (password "${pw}"): admin@swim.test, seller@swim.test, buyer@swim.test, nm@swim.test. Listings: ${ids.join(",")}`);
  await closePool();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
