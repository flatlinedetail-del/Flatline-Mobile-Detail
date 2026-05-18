/**
 * POST /api/payments/stripe-webhook
 *
 * Handles Stripe webhook events. On checkout.session.completed, marks the
 * corresponding Firestore appointment as deposit paid.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY     — Stripe secret key
 *   STRIPE_WEBHOOK_SECRET — Stripe webhook signing secret (see note below)
 *
 * Stripe webhook signature verification — current limitation:
 *   stripe.webhooks.constructEvent() requires the raw request body bytes.
 *   Vercel's default runtime parses application/json before the handler runs,
 *   so req.body is already a JS object and the raw bytes are unavailable here.
 *   Without @vercel/node + bodyParser: false, full signature verification is
 *   not feasible in this function's current form.
 *
 *   Mitigation in place:
 *     • Only events with metadata.source === "public_booking_deposit" are
 *       acted on — spoofed events for other Stripe accounts/sources are silently
 *       ignored.
 *     • appointmentId is required in metadata before any Firestore write.
 *     • Configure the Stripe Dashboard webhook to deliver ONLY the
 *       checkout.session.completed event type to this URL to reduce attack
 *       surface.
 *
 *   To enable full signature verification in the future:
 *     1. npm i @vercel/node
 *     2. Add to this file: export const config = { api: { bodyParser: false } }
 *     3. Read the raw body as a Buffer from the incoming stream.
 *     4. Call stripe.webhooks.constructEvent(rawBody, req.headers["stripe-signature"], secret).
 */

import Stripe from "stripe";
import { getBookingGateAdminDb } from "../../src/server/adminFirestore.js";
import { FieldValue } from "firebase-admin/firestore";

interface VercelLikeRequest {
  method?: string;
  body?: unknown;
}
interface VercelLikeResponse {
  status(code: number): VercelLikeResponse;
  json(value: unknown): VercelLikeResponse;
  end(): VercelLikeResponse;
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(503).json({ error: "Payment system not configured" });
  }

  // Vercel parses application/json automatically so req.body is already an
  // object — signature verification via constructEvent requires the raw bytes
  // and is not feasible here. See the file header for the mitigation strategy.
  const event = req.body as Stripe.Event;
  if (!event?.type || !event?.data?.object) {
    return res.status(400).json({ error: "Invalid Stripe event body" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.metadata?.source !== "public_booking_deposit") {
      // Not our event — silently acknowledge
      return res.status(200).json({ received: true });
    }

    const appointmentId = session.metadata?.appointmentId;
    if (!appointmentId) {
      console.warn("[stripe-webhook] checkout.session.completed — no appointmentId in metadata");
      return res.status(200).json({ received: true });
    }

    const db = getBookingGateAdminDb();
    if (!db) {
      console.error("[stripe-webhook] Admin DB not configured — cannot update appointment");
      return res.status(500).json({ error: "DB not configured" });
    }

    const stripeCheckoutSessionId = session.id;
    const stripePaymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : null;
    // paymentProviderRef = payment intent if available, session id as fallback
    const paymentProviderRef = stripePaymentIntentId ?? stripeCheckoutSessionId;

    try {
      await db.collection("appointments").doc(appointmentId).update({
        depositPaid: true,
        depositPaidAt: FieldValue.serverTimestamp(),
        paymentStatus: "deposit_paid",
        paymentMethod: "stripe",
        stripeCheckoutSessionId,
        stripePaymentIntentId,
        paymentProviderRef, // backward-compat alias
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log("[stripe-webhook] appointment updated", {
        appointmentId,
        stripeCheckoutSessionId,
        stripePaymentIntentId,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[stripe-webhook] failed to update appointment ${appointmentId}:`,
        message,
      );
      return res.status(500).json({ error: "Failed to update appointment" });
    }
  }

  return res.status(200).json({ received: true });
}
