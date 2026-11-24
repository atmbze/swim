import { execute } from "@/services/db";
import { AppError, conflict, forbidden } from "@/services/errors";
import { getOrder } from "@/services/commerce";
import { idParam, requireUser, route, type IdCtx } from "@/services/http";
import { createPaymentIntentForOrder, isStripeConfigured } from "@/services/stripe";

/**
 * POST /api/orders/[id]/payment-intent — buyer only, order must be pending_payment.
 * Creates (or reuses) the Stripe PaymentIntent for the order total and stores
 * its id on the order; returns the client secret for Stripe.js confirmation
 * with a test card. 503 while Stripe test mode is not configured — the mock
 * pay flow still applies then.
 */
export const POST = route<IdCtx>(async (req, ctx) => {
  const u = await requireUser(req);
  const o = await getOrder(await idParam(ctx));
  if (o.buyer_id !== u.id) throw forbidden("Not your order");
  if (o.status !== "pending_payment") throw conflict(`Cannot create a payment for an order that is ${o.status}`);
  if (!isStripeConfigured()) {
    throw new AppError(503, "Stripe test mode is not configured for this deployment — ask the store owner for the test-mode key, or use mock pay");
  }
  const pi = await createPaymentIntentForOrder(o);
  await execute("UPDATE orders SET stripe_payment_intent_id = $1, updated_at = now() WHERE id = $2", [pi.id, o.id]);
  return { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: o.total_cents };
});
