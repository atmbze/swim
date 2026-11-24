import Stripe from "stripe";

/**
 * SWIM's OWN Stripe integration — separate from the Layout.ai restricted key,
 * which is NOT SWIM's integration and is never used here.
 *
 * Staging runs in Stripe TEST mode only: STRIPE_SECRET_KEY must start with
 * `sk_test_`. A live key (`sk_live_...`) is refused outright so a staging
 * misconfiguration can never move real money. With no key set, the app keeps
 * its existing mock pay behaviour; the pay transition only demands a real
 * charge once a key is configured (see commerce.ts).
 *
 * Flow: buyer creates an order (pending_payment) -> POST
 * /api/orders/[id]/payment-intent creates a PaymentIntent for the order total
 * and stores its id on the order -> buyer confirms it with a test card
 * (4242 4242 4242 4242) via Stripe.js using STRIPE_PUBLISHABLE_KEY ->
 * POST /api/orders/[id] { action: "pay" } verifies the intent succeeded
 * before flipping the order to paid. The platform fee is recorded on the
 * order (platform_fee_cents) and in the intent metadata; it is withheld from
 * seller proceeds by the platform's own accounting — no Connect
 * application_fee is set here, because sellers are not Stripe Connect
 * accounts in this design.
 */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

let client: Stripe | null = null;

/** Lazily build the Stripe client; throws when no key is set or it is not a test key. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set — Stripe test mode is not configured for this deployment (see .env.example)");
  }
  if (!key.startsWith("sk_test_")) {
    throw new Error("Refusing non-test Stripe key: STRIPE_SECRET_KEY must start with sk_test_ on staging");
  }
  if (!client) client = new Stripe(key);
  return client;
}

export interface OrderMoney {
  id: number;
  total_cents: number;
  platform_fee_cents: number;
}

/** Create (or reuse) the PaymentIntent for an order; returns its id + client secret. */
export async function createPaymentIntentForOrder(order: OrderMoney & { stripe_payment_intent_id?: string | null }): Promise<{ id: string; clientSecret: string }> {
  const stripe = getStripe();
  if (order.stripe_payment_intent_id) {
    const existing = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
    if (existing.client_secret) return { id: existing.id, clientSecret: existing.client_secret };
  }
  const pi = await stripe.paymentIntents.create({
    amount: order.total_cents,
    currency: "usd",
    metadata: { swim_order_id: String(order.id), platform_fee_cents: String(order.platform_fee_cents) },
  });
  if (!pi.client_secret) throw new Error("Stripe did not return a client secret for the PaymentIntent");
  return { id: pi.id, clientSecret: pi.client_secret };
}

/** True only once Stripe reports the intent succeeded — the pay gate in commerce.ts. */
export async function isPaymentIntentSucceeded(intentId: string): Promise<boolean> {
  const pi = await getStripe().paymentIntents.retrieve(intentId);
  return pi.status === "succeeded";
}
