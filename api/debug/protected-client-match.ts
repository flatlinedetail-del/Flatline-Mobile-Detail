/**
 * Vercel serverless function — POST /api/debug/protected-client-match
 *
 * Temporary diagnostic. Gated by `BOOKING_DEBUG_TOKEN` env var + matching
 * `X-Debug-Token` header. Mirrors the Express version in `server.ts` so
 * production (Vercel) and local dev both expose the same diagnostic.
 *
 * REMOVE this file once the live-data mismatch is resolved.
 */

import { handleProtectedClientMatchRequest } from "../../src/server/handlers/protectedClientMatchHandler";
import { getBookingGateAdminDb } from "../../src/server/adminFirestore";

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

function pickHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
) {
  console.log("[BookingGate/debug] method", req.method);

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Debug-Token");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      code: "DEBUG_METHOD_NOT_ALLOWED",
      allowed: ["POST", "OPTIONS"],
      received: req.method ?? "unknown",
    });
  }

  const expectedToken = process.env.BOOKING_DEBUG_TOKEN;
  if (!expectedToken) {
    return res.status(503).json({
      error: "Diagnostic disabled",
      code: "DEBUG_DISABLED",
      message: "Set BOOKING_DEBUG_TOKEN in the server env to enable.",
    });
  }
  const provided = pickHeader(req.headers, "x-debug-token");
  if (provided !== expectedToken) {
    return res.status(401).json({ error: "unauthorized", code: "DEBUG_AUTH" });
  }

  let parsedBody: unknown = req.body;
  if (typeof parsedBody === "string") {
    try {
      parsedBody = JSON.parse(parsedBody);
    } catch {
      return res.status(400).json({
        error: "Invalid JSON body",
        code: "DEBUG_INVALID_JSON",
      });
    }
  }

  const { status, body } = await handleProtectedClientMatchRequest(
    parsedBody,
    getBookingGateAdminDb(),
  );
  return res.status(status).json(body);
}
