/**
 * Platform fee math — locked decisions (Rare, 2026-11-21).
 *
 * - 9.9% flat all-in on SHIPPED sales for free sellers (Stripe processing
 *   comes out of the 9.9%; no listing fee, no per-order fee).
 * - 6.9% on shipped sales for PREMIUM sellers ($14.99/mo).
 * - 0% on LOCAL pickup, any tier.
 * - Fee base = item price actually paid (subtotal minus promo discount) +
 *   shipping charged. NEVER sales tax.
 *
 * Pure functions over integer cents so the math is unit-testable without a DB.
 * Rates come from env (PLATFORM_FEE_BPS / PLATFORM_FEE_PREMIUM_BPS /
 * PLATFORM_FEE_LOCAL_BPS) with the locked values as defaults.
 */
export type SellerTier = "free" | "premium";
export type DeliveryMethod = "shipped" | "local";

function bpsEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

/** Basis points charged for this seller tier + delivery method. */
export function feeBpsFor(tier: SellerTier, delivery: DeliveryMethod): number {
  if (delivery === "local") return bpsEnv("PLATFORM_FEE_LOCAL_BPS", 0);
  return tier === "premium" ? bpsEnv("PLATFORM_FEE_PREMIUM_BPS", 690) : bpsEnv("PLATFORM_FEE_BPS", 990);
}

/** Platform fee in cents, rounded to the nearest cent. Tax is never in the base. */
export function computePlatformFee(args: {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  tier: SellerTier;
  deliveryMethod: DeliveryMethod;
}): number {
  const base = Math.max(args.subtotalCents - args.discountCents, 0) + Math.max(args.shippingCents, 0);
  return Math.round((base * feeBpsFor(args.tier, args.deliveryMethod)) / 10000);
}
