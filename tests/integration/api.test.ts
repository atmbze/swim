import { beforeEach, describe, expect, it } from "vitest";
import { call, cookieOf, freshDb } from "../helpers";
import * as registerR from "@/app/api/auth/register/route";
import * as loginR from "@/app/api/auth/login/route";
import * as logoutR from "@/app/api/auth/logout/route";
import * as meR from "@/app/api/me/route";
import * as listingsR from "@/app/api/listings/route";
import * as listingR from "@/app/api/listings/[id]/route";
import * as flagR from "@/app/api/listings/[id]/flag/route";
import * as offersR from "@/app/api/offers/route";
import * as offerR from "@/app/api/offers/[id]/route";
import * as ordersR from "@/app/api/orders/route";
import * as orderR from "@/app/api/orders/[id]/route";
import * as bbR from "@/app/api/buyback/route";
import * as bbIdR from "@/app/api/buyback/[id]/route";
import * as promoR from "@/app/api/promotions/route";
import * as quoteR from "@/app/api/promotions/quote/route";
import * as msgR from "@/app/api/messages/route";
import * as admListR from "@/app/api/admin/listings/[id]/route";
import * as admUserR from "@/app/api/admin/users/[id]/route";

let db: ReturnType<typeof freshDb>;
async function user(email: string, extra: Record<string, string> = {}) {
  const r = await call(registerR.POST, { body: { email, password: "password123", name: email.split("@")[0], zip: "85001", ...extra } });
  expect(r.status).toBe(201);
  return { id: r.json.user.id as number, cookie: cookieOf(r.res) };
}
async function admin() {
  const a = await user("admin@t.test");
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(a.id);
  return a;
}
const LISTING = { title: "Saguaro Lamp", description: "Nice lamp", price: 50, category: "home", condition: "good", quantity: 3, zip: "85701", city: "Tucson" };
async function listing(cookie: string, over: Record<string, unknown> = {}) {
  const r = await call(listingsR.POST, { cookie, body: { ...LISTING, ...over } });
  expect(r.status).toBe(201);
  return r.json.listing.id as number;
}
const P = (id: number) => ({ id: String(id) });

beforeEach(() => { db = freshDb(); });

describe("auth", () => {
  it("registers, stores a bcrypt hash, logs in, logs out", async () => {
    const u = await user("a@t.test");
    const row = db.prepare("SELECT password_hash FROM users WHERE id=?").get(u.id) as { password_hash: string };
    expect(row.password_hash).toMatch(/^\$2[aby]\$/);
    expect(row.password_hash).not.toContain("password123");
    expect((await call(meR.GET, { cookie: u.cookie })).json.user.email).toBe("a@t.test");
    const bad = await call(loginR.POST, { body: { email: "a@t.test", password: "wrongpass" } });
    expect(bad.status).toBe(401);
    const ok = await call(loginR.POST, { body: { email: "A@T.TEST", password: "password123" } });
    expect(ok.status).toBe(200);
    expect(ok.res.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Lax/);
    const c = cookieOf(ok.res);
    await call(logoutR.POST, { cookie: c, body: {} });
    expect((await call(meR.GET, { cookie: c })).status).toBe(401);
  });
  it("rejects duplicate email, weak password, forged session", async () => {
    await user("a@t.test");
    expect((await call(registerR.POST, { body: { email: "a@t.test", password: "password123", name: "x" } })).status).toBe(409);
    expect((await call(registerR.POST, { body: { email: "b@t.test", password: "123", name: "x" } })).status).toBe(400);
    expect((await call(meR.GET, { cookie: "swim_session=forged" })).status).toBe(401);
  });
  it("updates profile with validation", async () => {
    const u = await user("a@t.test");
    expect((await call(meR.PATCH, { method: "PATCH", cookie: u.cookie, body: { bio: "hi", zip: "87101" } })).json.user.zip).toBe("87101");
    expect((await call(meR.PATCH, { method: "PATCH", cookie: u.cookie, body: { zip: "abc" } })).status).toBe(400);
  });
  it("blocks cross-origin mutations", async () => {
    const r = await call(loginR.POST, { body: { email: "a@t.test", password: "x" }, headers: { origin: "https://evil.example", host: "localhost" } });
    expect(r.status).toBe(403);
  });
});

describe("listings CRUD + authorization", () => {
  it("requires login to create", async () => {
    expect((await call(listingsR.POST, { body: LISTING })).status).toBe(401);
  });
  it("create, read, update, delete by owner; others denied", async () => {
    const s = await user("s@t.test"), o = await user("o@t.test");
    const id = await listing(s.cookie);
    expect((await call(listingR.GET, { params: P(id) })).json.listing.price_cents).toBe(5000);
    expect((await call(listingR.PATCH, { method: "PATCH", cookie: o.cookie, params: P(id), body: { price: 1 } })).status).toBe(403);
    expect((await call(listingR.DELETE, { method: "DELETE", cookie: o.cookie, params: P(id) })).status).toBe(403);
    const up = await call(listingR.PATCH, { method: "PATCH", cookie: s.cookie, params: P(id), body: { price: 40, quantity: 7 } });
    expect(up.json.listing.price_cents).toBe(4000); expect(up.json.listing.quantity).toBe(7);
    expect((await call(listingR.PATCH, { method: "PATCH", cookie: s.cookie, params: P(id), body: { quantity: -1 } })).status).toBe(400);
    expect((await call(listingR.DELETE, { method: "DELETE", cookie: s.cookie, params: P(id) })).status).toBe(200);
    expect((await call(listingR.GET, { params: P(id) })).status).toBe(404);
  });
  it("validates image uploads by content", async () => {
    const s = await user("s@t.test");
    const fd = new FormData();
    for (const [k, v] of Object.entries(LISTING)) fd.set(k, String(v));
    fd.set("image", new File(["<html>not an image</html>"], "x.png", { type: "image/png" }));
    expect((await call(listingsR.POST, { cookie: s.cookie, form: fd })).status).toBe(400);
    fd.set("image", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], "x.png", { type: "image/png" }));
    const ok = await call(listingsR.POST, { cookie: s.cookie, form: fd });
    expect(ok.status).toBe(201); expect(ok.json.listing.image).toMatch(/^[a-f0-9]{32}\.png$/);
    fd.set("image", new File([new Uint8Array(2 * 1024 * 1024 + 10)], "big.jpg"));
    expect((await call(listingsR.POST, { cookie: s.cookie, form: fd })).status).toBe(400);
  });
  it("search, category, price filters and distance radius", async () => {
    const s = await user("s@t.test");
    await listing(s.cookie, { title: "Tucson Drill", category: "tools", price: 80, zip: "85701" });
    await listing(s.cookie, { title: "Phoenix Couch", category: "furniture", price: 300, zip: "85001" });
    await listing(s.cookie, { title: "Vegas Lamp", category: "home", price: 20, zip: "89101" });
    const q = async (qs: string) => (await call(listingsR.GET, { url: `http://localhost/api/listings?${qs}` })).json.listings.map((l: { title: string }) => l.title);
    expect(await q("q=drill")).toEqual(["Tucson Drill"]);
    expect(await q("category=furniture")).toEqual(["Phoenix Couch"]);
    expect(await q("maxPrice=100&sort=price_asc")).toEqual(["Vegas Lamp", "Tucson Drill"]);
    expect(await q("zip=85281&radius=150&sort=distance")).toEqual(["Phoenix Couch", "Tucson Drill"]);
    expect(await q("q=%25")).toEqual([]);
  });
});

describe("offers and orders state machine", () => {
  it("offer accept -> order -> pay -> ship -> confirm, with role checks", async () => {
    const s = await user("s@t.test"), b = await user("b@t.test"), x = await user("x@t.test");
    const id = await listing(s.cookie);
    expect((await call(offersR.POST, { cookie: s.cookie, body: { listingId: id, amount: 40 } })).status).toBe(403);
    const off = (await call(offersR.POST, { cookie: b.cookie, body: { listingId: id, amount: 40, quantity: 2 } })).json.offer;
    expect(off.status).toBe("pending");
    expect((await call(offerR.POST, { cookie: b.cookie, params: P(off.id), body: { action: "accept" } })).status).toBe(403);
    expect((await call(offerR.POST, { cookie: x.cookie, params: P(off.id), body: { action: "accept" } })).status).toBe(403);
    expect((await call(ordersR.POST, { cookie: b.cookie, body: { offerId: off.id } })).status).toBe(409);
    expect((await call(offerR.POST, { cookie: s.cookie, params: P(off.id), body: { action: "accept" } })).json.offer.status).toBe("accepted");
    expect((await call(offerR.POST, { cookie: s.cookie, params: P(off.id), body: { action: "reject" } })).status).toBe(409);
    expect((await call(ordersR.POST, { cookie: x.cookie, body: { offerId: off.id } })).status).toBe(403);
    const ord = (await call(ordersR.POST, { cookie: b.cookie, body: { offerId: off.id } })).json.order;
    expect(ord.total_cents).toBe(8000); expect(ord.status).toBe("pending_payment");
    expect((await call(listingR.GET, { params: P(id) })).json.listing.quantity).toBe(1);
    expect((await call(ordersR.POST, { cookie: b.cookie, body: { offerId: off.id } })).status).toBe(409);
    const T = (c: string, action: string) => call(orderR.POST, { cookie: c, params: P(ord.id), body: { action } });
    expect((await T(s.cookie, "ship")).status).toBe(409);
    expect((await T(s.cookie, "pay")).status).toBe(403);
    expect((await T(x.cookie, "pay")).status).toBe(403);
    expect((await T(b.cookie, "pay")).json.order.status).toBe("paid");
    expect((await T(b.cookie, "cancel")).status).toBe(403);
    expect((await T(b.cookie, "ship")).status).toBe(403);
    expect((await T(s.cookie, "ship")).json.order.status).toBe("shipped");
    expect((await T(s.cookie, "confirm")).status).toBe(403);
    expect((await T(b.cookie, "confirm")).json.order.status).toBe("delivered");
    expect((await T(b.cookie, "cancel")).status).toBe(409);
    expect((await call(orderR.GET, { cookie: x.cookie, params: P(ord.id) })).status).toBe(403);
  });
  it("buy now reserves inventory, prevents oversell and self-purchase, cancel restores stock", async () => {
    const s = await user("s@t.test"), b = await user("b@t.test");
    const id = await listing(s.cookie, { quantity: 2 });
    expect((await call(ordersR.POST, { cookie: s.cookie, body: { listingId: id } })).status).toBe(403);
    expect((await call(ordersR.POST, { cookie: b.cookie, body: { listingId: id, quantity: 3 } })).status).toBe(409);
    const o = (await call(ordersR.POST, { cookie: b.cookie, body: { listingId: id, quantity: 2 } })).json.order;
    expect((await call(ordersR.POST, { cookie: b.cookie, body: { listingId: id, quantity: 1 } })).status).toBe(409);
    expect((await call(orderR.POST, { cookie: b.cookie, params: P(o.id), body: { action: "cancel" } })).json.order.status).toBe("cancelled");
    expect((await call(listingR.GET, { params: P(id) })).json.listing.quantity).toBe(2);
  });
  it("buyer may withdraw a pending offer, seller can then not accept it", async () => {
    const s = await user("s@t.test"), b = await user("b@t.test");
    const id = await listing(s.cookie);
    const off = (await call(offersR.POST, { cookie: b.cookie, body: { listingId: id, amount: 1 } })).json.offer;
    expect((await call(offerR.POST, { cookie: b.cookie, params: P(off.id), body: { action: "withdraw" } })).json.offer.status).toBe("withdrawn");
    expect((await call(offerR.POST, { cookie: s.cookie, params: P(off.id), body: { action: "accept" } })).status).toBe(409);
  });
});

describe("BuyBacker", () => {
  it("user submits; only admin accepts/rejects; terminal states locked", async () => {
    const u = await user("u@t.test"), a = await admin();
    expect((await call(bbR.POST, { body: { title: "Switch", description: "d", condition: "good" } })).status).toBe(401);
    const r = (await call(bbR.POST, { cookie: u.cookie, body: { title: "Switch", description: "ok", condition: "good", asking: 100 } })).json.request;
    expect(r.status).toBe("submitted"); expect(r.asking_cents).toBe(10000);
    expect((await call(bbR.GET, { cookie: u.cookie, url: "http://localhost/api/buyback?all=1" })).status).toBe(403);
    expect((await call(bbIdR.POST, { cookie: u.cookie, params: P(r.id), body: { action: "accept", quote: 999 } })).status).toBe(403);
    expect((await call(bbIdR.POST, { cookie: a.cookie, params: P(r.id), body: { action: "accept", quote: -5 } })).status).toBe(400);
    const acc = (await call(bbIdR.POST, { cookie: a.cookie, params: P(r.id), body: { action: "accept", quote: 85.5 } })).json.request;
    expect(acc.status).toBe("accepted"); expect(acc.quote_cents).toBe(8550);
    expect((await call(bbIdR.POST, { cookie: a.cookie, params: P(r.id), body: { action: "reject" } })).status).toBe(409);
    const r2 = (await call(bbR.POST, { cookie: u.cookie, body: { title: "Broken TV", description: "x", condition: "poor" } })).json.request;
    expect((await call(bbIdR.POST, { cookie: a.cookie, params: P(r2.id), body: { action: "reject", note: "no" } })).json.request.status).toBe("rejected");
    expect((await call(bbR.GET, { cookie: a.cookie, url: "http://localhost/api/buyback?all=1" })).json.requests).toHaveLength(2);
  });
});

describe("Deal Den", () => {
  it("seller promo applies only to own listings; limits enforced; discount on order", async () => {
    const s = await user("s@t.test"), s2 = await user("s2@t.test"), b = await user("b@t.test"), a = await admin();
    const mine = await listing(s.cookie, { price: 100, category: "tools" });
    const other = await listing(s2.cookie, { price: 100 });
    expect((await call(promoR.POST, { cookie: s2.cookie, body: { code: "HIJACK", title: "x", percentOff: 50, listingId: mine } })).status).toBe(403);
    expect((await call(promoR.POST, { cookie: s.cookie, body: { code: "sam20", title: "Sam", percentOff: 20, maxUses: 1 } })).status).toBe(201);
    expect((await call(promoR.POST, { cookie: s.cookie, body: { code: "SAM20", title: "dup", percentOff: 5 } })).status).toBe(400);
    const q = await call(quoteR.GET, { url: `http://localhost/api/promotions/quote?code=SAM20&listingId=${mine}&quantity=2` });
    expect(q.json).toMatchObject({ subtotal: 20000, discount: 4000, total: 16000 });
    expect((await call(ordersR.POST, { cookie: b.cookie, body: { listingId: other, promoCode: "SAM20" } })).status).toBe(400);
    const o = (await call(ordersR.POST, { cookie: b.cookie, body: { listingId: mine, promoCode: "sam20" } })).json.order;
    expect(o).toMatchObject({ total_cents: 8000, discount_cents: 2000, promo_code: "SAM20" });
    expect((await call(ordersR.POST, { cookie: b.cookie, body: { listingId: mine, promoCode: "SAM20" } })).status).toBe(400);
    await call(orderR.POST, { cookie: b.cookie, params: P(o.id), body: { action: "cancel" } });
    expect((await call(ordersR.POST, { cookie: b.cookie, body: { listingId: mine, promoCode: "SAM20" } })).status).toBe(201);
    expect((await call(promoR.POST, { cookie: a.cookie, body: { code: "OLD", title: "old", percentOff: 10, expiresAt: "2000-01-01" } })).status).toBe(201);
    expect((await call(ordersR.POST, { cookie: b.cookie, body: { listingId: other, promoCode: "OLD" } })).status).toBe(400);
    expect((await call(promoR.POST, { cookie: a.cookie, body: { code: "SITE10", title: "site", percentOff: 10 } })).status).toBe(201);
    expect((await call(ordersR.POST, { cookie: b.cookie, body: { listingId: other, promoCode: "SITE10" } })).json.order.total_cents).toBe(9000);
    const codes = (await call(promoR.GET)).json.promotions.map((p: { code: string }) => p.code);
    expect(codes).toContain("SITE10"); expect(codes).not.toContain("OLD"); expect(codes).not.toContain("SAM20");
  });
});

describe("messaging", () => {
  it("only participants see a thread", async () => {
    const a = await user("a@t.test"), b = await user("b@t.test"), c = await user("c@t.test");
    expect((await call(msgR.POST, { cookie: a.cookie, body: { recipientId: b.id, body: "hi" } })).status).toBe(201);
    expect((await call(msgR.POST, { cookie: a.cookie, body: { recipientId: a.id, body: "me" } })).status).toBe(400);
    expect((await call(msgR.GET, { cookie: b.cookie, url: `http://localhost/api/messages?with=${a.id}` })).json.messages).toHaveLength(1);
    expect((await call(msgR.GET, { cookie: c.cookie, url: `http://localhost/api/messages?with=${a.id}` })).json.messages).toHaveLength(0);
    expect((await call(msgR.GET, { cookie: b.cookie })).json.conversations[0].other_id).toBe(a.id);
  });
});

describe("admin moderation", () => {
  it("flag, remove (hidden from public), ban kills sessions; non-admin denied", async () => {
    const s = await user("s@t.test"), b = await user("b@t.test"), a = await admin();
    const id = await listing(s.cookie);
    expect((await call(flagR.POST, { cookie: s.cookie, params: P(id), body: { reason: "x" } })).status).toBe(403);
    await call(flagR.POST, { cookie: b.cookie, params: P(id), body: { reason: "scam" } });
    await call(flagR.POST, { cookie: b.cookie, params: P(id), body: { reason: "scam again" } });
    expect((await call(listingR.GET, { params: P(id) })).json.listing.flag_count).toBe(1);
    expect((await call(admListR.POST, { cookie: b.cookie, params: P(id), body: { action: "remove" } })).status).toBe(403);
    expect((await call(admListR.POST, { cookie: a.cookie, params: P(id), body: { action: "remove" } })).status).toBe(200);
    expect((await call(listingR.GET, { params: P(id) })).status).toBe(404);
    expect((await call(listingR.GET, { params: P(id), cookie: s.cookie })).json.listing.status).toBe("removed");
    expect((await call(listingsR.GET, { url: "http://localhost/api/listings" })).json.listings).toHaveLength(0);
    expect((await call(ordersR.POST, { cookie: b.cookie, body: { listingId: id } })).status).toBe(404);
    expect((await call(admUserR.POST, { cookie: b.cookie, params: P(s.id), body: { action: "ban" } })).status).toBe(403);
    expect((await call(admUserR.POST, { cookie: a.cookie, params: P(a.id), body: { action: "ban" } })).status).toBe(400);
    expect((await call(admUserR.POST, { cookie: a.cookie, params: P(s.id), body: { action: "ban" } })).status).toBe(200);
    expect((await call(meR.GET, { cookie: s.cookie })).status).toBe(401);
    expect((await call(loginR.POST, { body: { email: "s@t.test", password: "password123" } })).status).toBe(403);
    const id2 = (db.prepare("INSERT INTO listings (seller_id,title,description,price_cents,category,condition,quantity) VALUES (?,?,?,?,?,?,?)").run(s.id, "Banned item", "d", 100, "home", "good", 1)).lastInsertRowid;
    expect((await call(listingR.GET, { params: P(Number(id2)) })).status).toBe(404);
    expect((await call(ordersR.POST, { cookie: b.cookie, body: { listingId: Number(id2) } })).status).toBe(404);
  });
});

describe("rate limiting", () => {
  it("throttles repeated logins from one IP with 429 and Retry-After", async () => {
    await user("rl@t.test");
    const ip = { "x-forwarded-for": "203.0.113.9" };
    let limited = 0;
    for (let i = 0; i < 12; i++) {
      const r = await call(loginR.POST, { body: { email: "rl@t.test", password: "wrong" }, headers: ip });
      if (r.status === 429) {
        limited++;
        expect(r.json.error).toMatch(/Too many requests/);
        expect(r.res.headers.get("retry-after")).toMatch(/^\d+$/);
      } else {
        expect(r.status).toBe(401);
      }
    }
    expect(limited).toBeGreaterThan(0);
    // A different IP is unaffected.
    expect((await call(loginR.POST, { body: { email: "rl@t.test", password: "password123" }, headers: { "x-forwarded-for": "203.0.113.10" } })).status).toBe(200);
  });
  it("throttles message spam from one IP", async () => {
    const a = await user("m1@t.test"), b = await user("m2@t.test");
    const ip = { "x-forwarded-for": "203.0.113.11" };
    let limited = 0;
    for (let i = 0; i < 32; i++) {
      const r = await call(msgR.POST, { cookie: a.cookie, body: { recipientId: b.id, body: "hi" }, headers: ip });
      if (r.status === 429) limited++;
      else expect(r.status).toBe(201);
    }
    expect(limited).toBeGreaterThan(0);
  });
});

describe("inventory reservation on offer acceptance", () => {
  it("second acceptance of the last unit fails fast; withdraw releases; order consumes", async () => {
    const s = await user("s@t.test"), b1 = await user("b1@t.test"), b2 = await user("b2@t.test");
    const id = await listing(s.cookie, { quantity: 1 });
    const o1 = (await call(offersR.POST, { cookie: b1.cookie, body: { listingId: id, amount: 10 } })).json.offer;
    const o2 = (await call(offersR.POST, { cookie: b2.cookie, body: { listingId: id, amount: 11 } })).json.offer;
    expect((await call(offerR.POST, { cookie: s.cookie, params: P(o1.id), body: { action: "accept" } })).json.offer.status).toBe("accepted");
    expect((await call(listingR.GET, { params: P(id), cookie: s.cookie })).json.listing.reserved_quantity).toBe(1);
    // The second acceptance now fails here instead of failing at checkout.
    expect((await call(offerR.POST, { cookie: s.cookie, params: P(o2.id), body: { action: "accept" } })).status).toBe(409);
    // Buyer walks away from the accepted offer: reservation released.
    expect((await call(offerR.POST, { cookie: b1.cookie, params: P(o1.id), body: { action: "withdraw" } })).json.offer.status).toBe("withdrawn");
    expect((await call(listingR.GET, { params: P(id), cookie: s.cookie })).json.listing.reserved_quantity).toBe(0);
    expect((await call(offerR.POST, { cookie: s.cookie, params: P(o2.id), body: { action: "accept" } })).json.offer.status).toBe("accepted");
    // Ordering consumes both the reservation and the stock.
    const ord = (await call(ordersR.POST, { cookie: b2.cookie, body: { offerId: o2.id } })).json.order;
    expect(ord.status).toBe("pending_payment");
    const l = (await call(listingR.GET, { params: P(id), cookie: s.cookie })).json.listing;
    expect(l.quantity).toBe(0);
    expect(l.reserved_quantity).toBe(0);
  });
  it("expired accepted offers release their reservation lazily", async () => {
    const s = await user("s@t.test"), b = await user("b@t.test");
    const id = await listing(s.cookie, { quantity: 1 });
    const o = (await call(offersR.POST, { cookie: b.cookie, body: { listingId: id, amount: 10 } })).json.offer;
    await call(offerR.POST, { cookie: s.cookie, params: P(o.id), body: { action: "accept" } });
    db.prepare("UPDATE offers SET expires_at = datetime('now', '-1 hour') WHERE id = ?").run(o.id);
    // The next mutation sweeps it: the offer can no longer be ordered from.
    expect((await call(ordersR.POST, { cookie: b.cookie, body: { offerId: o.id } })).status).toBe(409);
    expect(db.prepare("SELECT status FROM offers WHERE id = ?").get(o.id)).toMatchObject({ status: "expired" });
    expect((await call(listingR.GET, { params: P(id), cookie: s.cookie })).json.listing.reserved_quantity).toBe(0);
  });
  it("seller cannot drop quantity below reserved units", async () => {
    const s = await user("s@t.test"), b = await user("b@t.test");
    const id = await listing(s.cookie, { quantity: 2 });
    const o = (await call(offersR.POST, { cookie: b.cookie, body: { listingId: id, amount: 10, quantity: 2 } })).json.offer;
    await call(offerR.POST, { cookie: s.cookie, params: P(o.id), body: { action: "accept" } });
    expect((await call(listingR.PATCH, { method: "PATCH", cookie: s.cookie, params: P(id), body: { quantity: 1 } })).status).toBe(400);
    expect((await call(listingR.PATCH, { method: "PATCH", cookie: s.cookie, params: P(id), body: { quantity: 2 } })).status).toBe(200);
  });
});

describe("removed listings block order progress", () => {
  it("pay fails after removal; cancel still lets the buyer out", async () => {
    const s = await user("s@t.test"), b = await user("b@t.test"), a = await admin();
    const id = await listing(s.cookie, { quantity: 1 });
    const ord = (await call(ordersR.POST, { cookie: b.cookie, body: { listingId: id } })).json.order;
    const T = (c: string, action: string) => call(orderR.POST, { cookie: c, params: P(ord.id), body: { action } });
    expect((await call(admListR.POST, { cookie: a.cookie, params: P(id), body: { action: "remove" } })).status).toBe(200);
    expect((await T(b.cookie, "pay")).status).toBe(409);
    expect((await T(b.cookie, "cancel")).json.order.status).toBe("cancelled");
  });
  it("ship is blocked after removal; paid orders can still be cancelled", async () => {
    const s = await user("s@t.test"), b = await user("b@t.test"), a = await admin();
    const id = await listing(s.cookie, { quantity: 1 });
    const ord = (await call(ordersR.POST, { cookie: b.cookie, body: { listingId: id } })).json.order;
    const T = (c: string, action: string) => call(orderR.POST, { cookie: c, params: P(ord.id), body: { action } });
    expect((await T(b.cookie, "pay")).json.order.status).toBe("paid");
    expect((await call(admListR.POST, { cookie: a.cookie, params: P(id), body: { action: "remove" } })).status).toBe(200);
    expect((await T(s.cookie, "ship")).status).toBe(409);
    expect((await T(s.cookie, "cancel")).json.order.status).toBe("cancelled");
  });
});

describe("search pagination", () => {
  it("paginates with total, page and perPage", async () => {
    const s = await user("s@t.test");
    for (let i = 0; i < 30; i++) await listing(s.cookie, { title: `Paginated Widget ${i}` });
    const p1 = await call(listingsR.GET, { url: "http://localhost/api/listings?q=Widget&perPage=10" });
    expect(p1.json.total).toBe(30);
    expect(p1.json.listings).toHaveLength(10);
    expect(p1.json.page).toBe(1);
    expect(p1.json.perPage).toBe(10);
    const p2 = await call(listingsR.GET, { url: "http://localhost/api/listings?q=Widget&perPage=10&page=2" });
    expect(p2.json.page).toBe(2);
    expect(p2.json.listings).toHaveLength(10);
    const ids1 = new Set(p1.json.listings.map((l: { id: number }) => l.id));
    for (const l of p2.json.listings) expect(ids1.has(l.id)).toBe(false);
    const p3 = await call(listingsR.GET, { url: "http://localhost/api/listings?q=Widget&perPage=10&page=3" });
    expect(p3.json.listings).toHaveLength(10);
    const big = await call(listingsR.GET, { url: "http://localhost/api/listings?q=Widget&perPage=500" });
    expect(big.json.perPage).toBe(100);
  });
});

describe("migrations", () => {
  it("records applied versions and adds the reservation columns", async () => {
    const v = (db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as { version: number }[]).map((r) => r.version);
    expect(v).toEqual([1, 2]);
    const cols = (db.prepare("PRAGMA table_info(listings)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("reserved_quantity");
    const ocols = (db.prepare("PRAGMA table_info(offers)").all() as { name: string }[]).map((c) => c.name);
    expect(ocols).toContain("expires_at");
  });
});
