import { beforeEach, describe, expect, it } from "vitest";
import { call, cookieOf, freshDb } from "../helpers";
import * as registerR from "@/app/api/auth/register/route";
import * as listingsR from "@/app/api/listings/route";
import * as ordersR from "@/app/api/orders/route";
import * as orderR from "@/app/api/orders/[id]/route";
import * as promoR from "@/app/api/promotions/route";
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
const act = (h: typeof orderR.POST, cookie: string, id: number, action: string) => call(h, { cookie, params: P(id), body: { action } });
beforeEach(() => { db = freshDb(); resetRateLimits(); });

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
