import { beforeEach, describe, expect, it } from "vitest";
import { call, cookieOf, freshDb } from "../helpers";
import * as registerR from "@/app/api/auth/register/route";
import * as loginR from "@/app/api/auth/login/route";
import * as logoutR from "@/app/api/auth/logout/route";
import * as listingsR from "@/app/api/listings/route";
import * as listingR from "@/app/api/listings/[id]/route";
import * as offersR from "@/app/api/offers/route";
import * as offerR from "@/app/api/offers/[id]/route";
import * as ordersR from "@/app/api/orders/route";
import * as orderR from "@/app/api/orders/[id]/route";
import * as promoR from "@/app/api/promotions/route";
import * as admListR from "@/app/api/admin/listings/[id]/route";
import * as admUserR from "@/app/api/admin/users/[id]/route";
import { resetRateLimits } from "@/services/ratelimit";

let db: ReturnType<typeof freshDb>;
let n = 0;
async function user(role = "user") {
  const r = await call(registerR.POST, { body: { email: `u${++n}@t.test`, password: "password123", name: `u${n}` } });
  if (role === "admin") db.prepare("UPDATE users SET role='admin' WHERE id=?").run(r.json.user.id);
  return { id: r.json.user.id as number, cookie: cookieOf(r.res) };
}
const P = (id: number) => ({ id: String(id) });
async function listing(cookie: string, quantity = 1) {
  return (await call(listingsR.POST, { cookie, body: { title: "Lamp", description: "d", price: 100, category: "home", condition: "good", quantity } })).json.listing.id as number;
}
const qty = async (id: number, cookie?: string) => (await call(listingR.GET, { params: P(id), cookie })).json.listing.quantity;
const offer = async (cookie: string, listingId: number, quantity = 1) => (await call(offersR.POST, { cookie, body: { listingId, amount: 50, quantity } })).json.offer.id as number;
const act = (h: typeof offerR.POST, cookie: string, id: number, action: string) => call(h, { cookie, params: P(id), body: { action } });

beforeEach(() => { db = freshDb(); resetRateLimits(); });

describe("fix 1: accepting an offer reserves stock", () => {
  it("second accept on the last unit is refused; accepted buyer can still check out", async () => {
    const s = await user(), b1 = await user(), b2 = await user();
    const id = await listing(s.cookie, 1);
    const o1 = await offer(b1.cookie, id), o2 = await offer(b2.cookie, id);
    expect((await act(offerR.POST, s.cookie, o1, "accept")).status).toBe(200);
    expect(await qty(id)).toBe(0);
    const second = await act(offerR.POST, s.cookie, o2, "accept");
    expect(second.status).toBe(409); expect(second.json.error).toMatch(/inventory/);
    expect((await call(ordersR.POST, { cookie: b2.cookie, body: { listingId: id } })).status).toBe(409);
    const ord = await call(ordersR.POST, { cookie: b1.cookie, body: { offerId: o1 } });
    expect(ord.status).toBe(201);
    expect(await qty(id)).toBe(0);
  });
  it("withdrawing an accepted offer releases the reservation; cancelling its order restores stock", async () => {
    const s = await user(), b = await user();
    const id = await listing(s.cookie, 2);
    const o = await offer(b.cookie, id, 2);
    await act(offerR.POST, s.cookie, o, "accept");
    expect(await qty(id)).toBe(0);
    await act(offerR.POST, b.cookie, o, "withdraw");
    expect(await qty(id)).toBe(2);
    const o2 = await offer(b.cookie, id, 2);
    await act(offerR.POST, s.cookie, o2, "accept");
    const ord = (await call(ordersR.POST, { cookie: b.cookie, body: { offerId: o2 } })).json.order;
    await act(orderR.POST, b.cookie, ord.id, "cancel");
    expect(await qty(id)).toBe(2);
  });
});

describe("fix 2: orders on removed listings / banned sellers cannot progress", () => {
  it("pay and ship are refused after moderation removal; cancel still works", async () => {
    const s = await user(), b = await user(), a = await user("admin");
    const id = await listing(s.cookie, 3);
    const o1 = (await call(ordersR.POST, { cookie: b.cookie, body: { listingId: id } })).json.order;
    const o2 = (await call(ordersR.POST, { cookie: b.cookie, body: { listingId: id } })).json.order;
    expect((await act(orderR.POST, b.cookie, o2.id, "pay")).status).toBe(200);
    await call(admListR.POST, { cookie: a.cookie, params: P(id), body: { action: "remove" } });
    const pay = await act(orderR.POST, b.cookie, o1.id, "pay");
    expect(pay.status).toBe(409); expect(pay.json.error).toMatch(/removed/);
    expect((await act(orderR.POST, s.cookie, o2.id, "ship")).status).toBe(409);
    expect((await act(orderR.POST, b.cookie, o1.id, "cancel")).json.order.status).toBe("cancelled");
    expect((await act(orderR.POST, s.cookie, o2.id, "cancel")).json.order.status).toBe("cancelled");
  });
  it("pay is refused when the seller is banned", async () => {
    const s = await user(), b = await user(), a = await user("admin");
    const id = await listing(s.cookie, 1);
    const o = (await call(ordersR.POST, { cookie: b.cookie, body: { listingId: id } })).json.order;
    await call(admUserR.POST, { cookie: a.cookie, params: P(s.id), body: { action: "ban" } });
    expect((await act(orderR.POST, b.cookie, o.id, "pay")).status).toBe(409);
  });
  it("seller cannot accept an offer on a removed listing", async () => {
    const s = await user(), b = await user(), a = await user("admin");
    const id = await listing(s.cookie, 1);
    const o = await offer(b.cookie, id);
    await call(admListR.POST, { cookie: a.cookie, params: P(id), body: { action: "remove" } });
    expect((await act(offerR.POST, s.cookie, o, "accept")).status).toBe(409);
  });
});

describe("fix 3: per-user promo limit", () => {
  it("site-wide code defaults to one use per buyer; cancelled orders don't count; 0 = unlimited", async () => {
    const s = await user(), b1 = await user(), b2 = await user(), a = await user("admin");
    const id = await listing(s.cookie, 10);
    expect((await call(promoR.POST, { cookie: a.cookie, body: { code: "SITE10", title: "s", percentOff: 10 } })).json.promotion.per_user_limit).toBe(1);
    const first = (await call(ordersR.POST, { cookie: b1.cookie, body: { listingId: id, promoCode: "SITE10" } })).json.order;
    const again = await call(ordersR.POST, { cookie: b1.cookie, body: { listingId: id, promoCode: "SITE10" } });
    expect(again.status).toBe(400); expect(again.json.error).toMatch(/already used/);
    expect((await call(ordersR.POST, { cookie: b2.cookie, body: { listingId: id, promoCode: "SITE10" } })).status).toBe(201);
    await act(orderR.POST, b1.cookie, first.id, "cancel");
    expect((await call(ordersR.POST, { cookie: b1.cookie, body: { listingId: id, promoCode: "SITE10" } })).status).toBe(201);
    await call(promoR.POST, { cookie: a.cookie, body: { code: "TWICE", title: "t", percentOff: 5, perUserLimit: 2 } });
    await call(promoR.POST, { cookie: a.cookie, body: { code: "OPEN", title: "o", percentOff: 5, perUserLimit: 0 } });
    for (let i = 0; i < 2; i++) expect((await call(ordersR.POST, { cookie: b2.cookie, body: { listingId: id, promoCode: "TWICE" } })).status).toBe(201);
    expect((await call(ordersR.POST, { cookie: b2.cookie, body: { listingId: id, promoCode: "TWICE" } })).status).toBe(400);
    for (let i = 0; i < 3; i++) expect((await call(ordersR.POST, { cookie: b1.cookie, body: { listingId: id, promoCode: "OPEN" } })).status).toBe(201);
  });
});

describe("fix 4: logout clears client caches", () => {
  it("logout response sends Clear-Site-Data: cache and no-store", async () => {
    const u = await user();
    const r = await call(logoutR.POST, { cookie: u.cookie, body: {} });
    expect(r.res.headers.get("clear-site-data")).toBe('"cache"');
    expect(r.res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("rate limiting", () => {
  it("returns 429 after too many logins for one email, and too many registrations per IP", async () => {
    process.env.LOGIN_RATE_LIMIT = "3"; process.env.REGISTER_RATE_LIMIT = "2";
    try {
      const statuses = [];
      for (let i = 0; i < 4; i++) statuses.push((await call(loginR.POST, { body: { email: "x@t.test", password: "wrong" }, headers: { "x-forwarded-for": "1.2.3.4" } })).status);
      expect(statuses).toEqual([401, 401, 401, 429]);
      const reg = async (e: string) => (await call(registerR.POST, { body: { email: e, password: "password123", name: "r" }, headers: { "x-forwarded-for": "5.6.7.8" } })).status;
      expect([await reg("r1@t.test"), await reg("r2@t.test"), await reg("r3@t.test")]).toEqual([201, 201, 429]);
    } finally { process.env.LOGIN_RATE_LIMIT = "1000"; process.env.REGISTER_RATE_LIMIT = "1000"; }
  });
});

describe("EXIF stripping on upload", () => {
  it("stored image no longer contains GPS EXIF", async () => {
    const fs = await import("fs"); const path = await import("path");
    const s = await user();
    const seg = (m: number, p: Buffer) => { const h = Buffer.alloc(4); h[0] = 0xff; h[1] = m; h.writeUInt16BE(p.length + 2, 2); return Buffer.concat([h, p]); };
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe1, Buffer.from("Exif\0\0GPS-SECRET")), Buffer.from([0xff, 0xda, 0, 2]), Buffer.from("DATA"), Buffer.from([0xff, 0xd9])]);
    const fd = new FormData();
    for (const [k, v] of Object.entries({ title: "Photo", description: "d", price: "5", category: "home", condition: "good", quantity: "1" })) fd.set(k, v);
    fd.set("image", new File([jpg], "p.jpg", { type: "image/jpeg" }));
    const r = await call(listingsR.POST, { cookie: s.cookie, form: fd });
    expect(r.status).toBe(201);
    const stored = fs.readFileSync(path.join(process.env.UPLOAD_DIR!, r.json.listing.image));
    expect(stored.includes("GPS-SECRET")).toBe(false); expect(stored.includes("DATA")).toBe(true);
  });
});
