import { describe, expect, it } from "vitest";
import { distanceMiles } from "@/services/geo";
import { sniffImage } from "@/services/uploads";
import { computePlatformFee, feeBpsFor } from "@/services/fees";
import { listingSchema, orderSchema, registerSchema, promoSchema } from "@/services/validation";
import { ORDER_TRANSITIONS, OFFER_TRANSITIONS } from "@/services/commerce";

describe("validation", () => {
  it("rejects short passwords and bad emails", () => {
    expect(registerSchema.safeParse({ email: "x", password: "short", name: "a" }).success).toBe(false);
    expect(registerSchema.parse({ email: " A@B.co ", password: "longenough", name: "A" }).email).toBe("a@b.co");
  });
  it("converts dollars to cents and rejects bad category", () => {
    const base = { title: "Lamp", description: "d", price: "12.345", category: "home", condition: "good", quantity: "2" };
    expect(listingSchema.parse(base).price).toBe(1235);
    expect(listingSchema.safeParse({ ...base, category: "weapons" }).success).toBe(false);
    expect(listingSchema.safeParse({ ...base, price: "-1" }).success).toBe(false);
    expect(listingSchema.safeParse({ ...base, zip: "abc" }).success).toBe(false);
  });
  it("normalizes promo codes and bounds percent", () => {
    expect(promoSchema.parse({ code: "save10", title: "t", percentOff: 10 }).code).toBe("SAVE10");
    expect(promoSchema.safeParse({ code: "X", title: "t", percentOff: 10 }).success).toBe(false);
    expect(promoSchema.safeParse({ code: "ABC", title: "t", percentOff: 95 }).success).toBe(false);
  });
});

describe("geo", () => {
  it("computes plausible Phoenix-Tucson distance", () => {
    const d = distanceMiles("85001", "85701")!;
    expect(d).toBeGreaterThan(100); expect(d).toBeLessThan(120);
    expect(distanceMiles("85001", "00000")).toBeNull();
  });
});

describe("image sniffing", () => {
  it("detects by magic bytes, not extension", () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("jpg");
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("png");
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe("state machine tables", () => {
  it("never allows leaving terminal order states", () => {
    for (const t of Object.values(ORDER_TRANSITIONS)) { expect(t.from).not.toContain("delivered"); expect(t.from).not.toContain("cancelled"); }
    for (const t of Object.values(OFFER_TRANSITIONS)) { expect(t.from).not.toContain("rejected"); expect(t.from).not.toContain("ordered"); }
  });
});

describe("platform fees (locked 2026-11-21)", () => {
  it("charges 9.9% shipped for free sellers, 6.9% for premium, 0% local", () => {
    expect(feeBpsFor("free", "shipped")).toBe(990);
    expect(feeBpsFor("premium", "shipped")).toBe(690);
    expect(feeBpsFor("free", "local")).toBe(0);
    expect(feeBpsFor("premium", "local")).toBe(0);
    // $100 item + $10 shipping, no tax: base $110 -> 9.9% = $10.89
    expect(computePlatformFee({ subtotalCents: 10000, discountCents: 0, shippingCents: 1000, tier: "free", deliveryMethod: "shipped" })).toBe(1089);
    expect(computePlatformFee({ subtotalCents: 10000, discountCents: 0, shippingCents: 1000, tier: "premium", deliveryMethod: "shipped" })).toBe(759);
    expect(computePlatformFee({ subtotalCents: 10000, discountCents: 0, shippingCents: 1000, tier: "free", deliveryMethod: "local" })).toBe(0);
  });
  it("bases the fee on item price paid + shipping — never tax, discount reduces the base", () => {
    // $100 item, 20% promo, $10 shipping, $5 tax: base is $80 + $10 = $90 -> 9.9% = $8.91 (tax excluded)
    expect(computePlatformFee({ subtotalCents: 10000, discountCents: 2000, shippingCents: 1000, tier: "free", deliveryMethod: "shipped" })).toBe(891);
    // Rounding: $10.01 base at 9.9% = $0.99099 -> $0.99
    expect(computePlatformFee({ subtotalCents: 1001, discountCents: 0, shippingCents: 0, tier: "free", deliveryMethod: "shipped" })).toBe(99);
  });
  it("order schema defaults to shipped with no shipping/tax, dollars in / cents out", () => {
    const o = orderSchema.parse({ listingId: 1 });
    expect(o.deliveryMethod).toBe("shipped"); expect(o.shipping).toBe(0); expect(o.tax).toBe(0);
    const o2 = orderSchema.parse({ listingId: 1, deliveryMethod: "local", shipping: "5.99", tax: 2 });
    expect(o2.shipping).toBe(599); expect(o2.tax).toBe(200);
    expect(orderSchema.safeParse({ listingId: 1, deliveryMethod: "mail" }).success).toBe(false);
    expect(orderSchema.safeParse({ listingId: 1, shipping: -1 }).success).toBe(false);
  });
});

describe("security headers config", () => {
  it("serves a strict Content-Security-Policy on all routes", async () => {
    // @ts-expect-error — next.config.mjs has no type declarations
    const config = (await import("../../next.config.mjs")).default;
    const headers = await config.headers();
    const all = headers.find((h: { source: string }) => h.source === "/(.*)");
    expect(all).toBeDefined();
    const csp = all.headers.find((h: { key: string }) => h.key === "Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp.value).toContain("default-src 'self'");
    expect(csp.value).toContain("frame-ancestors 'none'");
    expect(csp.value).toContain("base-uri 'self'");
    const scriptSrc = csp.value.split(";").find((d: string) => d.trim().startsWith("script-src")) ?? "";
    // Staging deliberately allows 'unsafe-inline': Next.js App Router inlines
    // its flight/startup scripts, and blocking them blanked the staging site
    // (2026-11-23). The stricter nonce-based CSP lives on branch
    // port/promo-limit-exif and is the pre-launch hardening path.
    expect(scriptSrc).toContain("'unsafe-inline'");
  });
});
