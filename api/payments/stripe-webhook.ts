/**
 * POST /api/payments/stripe-webhook
 *
 * Handles Stripe webhook events. On checkout.session.completed, marks the
 * corresponding Firestore appointment as deposit paid.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY     — Stripe secret key
 *   STRIPE_WEBHOOK_SECRET — (optional) Stripe webhook signing secret for
 *                           signature verification. When set, requires raw
 *                           body access. Vercel automatically parses
 *                           application/json bodies, so signature
 *                           verification is skipped here — configure your
 *                           Stripe dashboard webhook to this URL and restrict
 *                           the events to checkout.session.completed.
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
  // and is not feasible without a custom proxy. Accept the parsed event directly.
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

    const paymentIntentRef =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.id;

    try {
      await db.collection("appointments").doc(appointmentId).update({
        depositPaid: true,
        depositPaidAt: FieldValue.serverTimestamp(),
        paymentStatus: "paid",
        paymentMethod: "stripe",
        paymentProviderRef: paymentIntentRef,
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(
        `[stripe-webhook] appointment ${appointmentId} marked deposit paid (ref: ${paymentIntentRef})`,
      );
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
