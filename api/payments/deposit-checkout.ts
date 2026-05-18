/**
 * POST /api/payments/deposit-checkout
 *
 * Creates a Stripe Checkout Session for a public-booking deposit.
 * Returns { url } — the caller redirects the customer there.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY — Stripe secret key (sk_live_… or sk_test_…)
 *
 * Body fields:
 *   appointmentId            string   Firestore appointment doc ID
 *   depositAmount            number   Deposit amount in dollars (e.g. 50.00)
 *   customerEmail            string   Customer email for Stripe pre-fill
 *   customerName             string   Customer display name
 *   serviceNames             string   Comma-joined service names for line-item label
 *   origin                   string   window.location.origin for success/cancel URLs
 *   bookingMode              string?  Gate bookingMode for audit metadata
 *   protectedClientMatch     boolean? Whether a protected-client record matched
 *   matchedProtectedClientId string?  Opaque protected-client doc ID (audit only)
 *   matchedClientId          string?  Opaque clients-collection doc ID (audit only)
 *
 * NOTE — Stripe webhook signature verification:
 *   stripe.webhooks.constructEvent() requires the raw request body bytes.
 *   Vercel's default runtime parses application/json before the handler runs,
 *   so req.body is already a JS object and the raw bytes are gone. Without
 *   installing @vercel/node and disabling bodyParser, signature verification
 *   is not feasible. The webhook instead validates events via
 *   metadata.source === "public_booking_deposit" and the presence of a known
 *   appointmentId. To enable full signature verification in the future:
 *     1. npm i @vercel/node
 *     2. Export `export const config = { api: { bodyParser: false } }` from
 *        the webhook handler.
 *     3. Read the raw body with micro or a manual stream accumulator.
 *     4. Call stripe.webhooks.constructEvent(rawBody, sig, secret).
 */

import Stripe from "stripe";

interface VercelLikeRequest {
  method?: string;
  body?: unknown;
}
interface VercelLikeResponse {
  status(code: number): VercelLikeResponse;
  setHeader(name: string, value: string): VercelLikeResponse;
  json(value: unknown): VercelLikeResponse;
  end(): VercelLikeResponse;
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
) {
  if (req.method === "OPTIONS") {
    res
      .setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
      .setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(503).json({
      error: "Payment system not configured",
      code: "STRIPE_NOT_CONFIGURED",
    });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const appointmentId =
    typeof body.appointmentId === "string" ? body.appointmentId.trim() : "";
  const depositAmount =
    typeof body.depositAmount === "number" && body.depositAmount > 0
      ? body.depositAmount
      : 0;
  const customerEmail =
    typeof body.customerEmail === "string" ? body.customerEmail.trim() : "";
  const customerName =
    typeof body.customerName === "string" ? body.customerName.trim() : "";
  const serviceNames =
    typeof body.serviceNames === "string" && body.serviceNames.trim()
      ? body.serviceNames.trim()
      : "Auto Detailing";
  const origin =
    typeof body.origin === "string" ? body.origin.replace(/\/$/, "") : "";

  // Audit / traceability fields — optional, stored in Stripe session metadata
  const bookingMode =
    typeof body.bookingMode === "string" ? body.bookingMode.slice(0, 64) : null;
  const protectedClientMatch =
    typeof body.protectedClientMatch === "boolean"
      ? body.protectedClientMatch
      : null;
  const matchedProtectedClientId =
    typeof body.matchedProtectedClientId === "string"
      ? body.matchedProtectedClientId.slice(0, 128)
      : null;
  const matchedClientId =
    typeof body.matchedClientId === "string"
      ? body.matchedClientId.slice(0, 128)
      : null;

  if (!appointmentId || depositAmount <= 0 || !origin) {
    return res.status(400).json({
      error: "appointmentId, depositAmount (> 0), and origin are required",
    });
  }

  try {
    const stripe = new Stripe(secretKey);

    // Build metadata — Stripe requires string values, max 500 chars each.
    const metadata: Record<string, string> = {
      appointmentId,
      source: "public_booking_deposit",
      depositAmount: String(depositAmount),
      ...(customerEmail && { customerEmail }),
      ...(bookingMode && { bookingMode }),
      ...(protectedClientMatch !== null && {
        protectedClientMatch: String(protectedClientMatch),
      }),
      ...(matchedProtectedClientId && { matchedProtectedClientId }),
      ...(matchedClientId && { matchedClientId }),
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: customerEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Booking Deposit — ${serviceNames}`,
              description: customerName
                ? `Deposit for ${customerName}`
                : "Booking deposit",
            },
            unit_amount: Math.round(depositAmount * 100),
          },
          quantity: 1,
        },
      ],
      metadata,
      success_url: `${origin}/book?depositPaid=1&appointmentId=${appointmentId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/book?depositCancelled=1`,
    });

    console.log("[deposit-checkout] session created", {
      sessionId: session.id,
      appointmentId,
      bookingMode,
      protectedClientMatch,
    });

    return res.status(200).json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[deposit-checkout] Stripe error:", message);
    return res.status(500).json({
      error: "Failed to create checkout session",
      details: message,
    });
  }
}
