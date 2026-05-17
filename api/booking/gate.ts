/**
 * Vercel serverless function — POST /api/booking/gate
 *
 * Production deployment runs on Vercel, where `server.ts` (Express) is
 * never executed. This file exposes the same handler as a Vercel
 * serverless route so the public booking gate works in production.
 *
 * Local dev still uses the Express route in `server.ts` — both call the
 * same `handleBookingGateRequest` so the decision logic stays in one place.
 *
 * Env vars required on Vercel:
 *   FIREBASE_SERVICE_ACCOUNT_KEY — service account JSON (stringified)
 *   FIRESTORE_DATABASE_ID        — named-database ID (e.g.
 *                                  "ai-studio-6b671eae-...") — required when
 *                                  using a non-default Firestore database.
 */

import { handleBookingGateRequest } from "../../src/server/handlers/bookingGateHandler.js";
import { getBookingGateAdminDb } from "../../src/server/adminFirestore.js";

interface VercelLikeRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
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
  // Defensive logging — appears in Vercel's function logs.
  console.log("[BookingGate] method", req.method);

  // CORS preflight — Vercel's edge sometimes invokes OPTIONS before POST.
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      code: "GATE_METHOD_NOT_ALLOWED",
      allowed: ["POST", "OPTIONS"],
      received: req.method ?? "unknown",
    });
  }

  // Vercel parses application/json into req.body automatically; if a raw
  // string somehow arrives (custom Content-Type), parse it ourselves.
  let parsedBody: unknown = req.body;
  if (typeof parsedBody === "string") {
    try {
      parsedBody = JSON.parse(parsedBody);
    } catch {
      return res.status(400).json({
        error: "Invalid JSON body",
        code: "GATE_INVALID_JSON",
      });
    }
  }

  const { status, body } = await handleBookingGateRequest(
    parsedBody,
    getBookingGateAdminDb(),
  );
  return res.status(status).json(body);
}
