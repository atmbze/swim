/* Seeds demo data. Usage: npm run seed  (uses DATABASE_PATH or ./data/swim.db). Wipes existing data. */
import { getDb } from "../src/services/db";
import { register } from "../src/services/auth";
import { createListing } from "../src/services/listings";
import { createPromotion } from "../src/services/promotions";
import { submitBuyback } from "../src/services/buyback";

async function main() {
  const db = getDb();
  db.exec("DELETE FROM promotions; DELETE FROM orders; DELETE FROM offers; DELETE FROM messages; DELETE FROM flags; DELETE FROM buyback_requests; DELETE FROM listings; DELETE FROM sessions; DELETE FROM users;");
  const pw = process.env.SEED_PASSWORD || "password123";
  const admin = await register({ email: "admin@swim.test", password: pw, name: "SWIM Admin", city: "Phoenix", zip: "85001" });
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.id);
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
  createPromotion({ ...admin, role: "admin" }, { code: "WELCOME10", title: "Welcome to SOWESTIM", percentOff: 10 });
  createPromotion(sam, { code: "SAMTOOLS", title: "Sam's tool sale", percentOff: 20, category: "tools" });
  submitBuyback(bea, { title: "Old Nintendo Switch", description: "Works, minor scratches", condition: "good", asking: 120 });
  console.log(`Seeded. Logins (password "${pw}"): admin@swim.test, seller@swim.test, buyer@swim.test, nm@swim.test. Listings: ${ids.join(",")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
