/**
 * Shared handler for POST /api/booking/gate.
 *
 * Pure of any HTTP framework — takes a parsed request body + a Firestore
 * handle and returns { status, body } so the same logic powers both:
 *
 *   - server.ts Express route (local dev / preview)
 *   - api/booking/gate.ts Vercel serverless function (production)
 *
 * Security contract is owned by `sanitizeGateResultForPublic` —
 * `riskReason`, `protectionLevel`, and `clientRiskLevelAtBooking` never
 * cross the wire to public callers.
 */

import type { Firestore as AdminFirestore } from "firebase-admin/firestore";
import type { BusinessSettings, Service } from "../../types";
import {
  decideBookingGate,
  normalizeEmail as gateNormalizeEmail,
  sanitizeGateResultForPublic,
} from "../../services/onlineBookingGateCore";

export interface BookingGateHandlerResponse {
  status: number;
  body: unknown;
}

export async function handleBookingGateRequest(
  rawBody: unknown,
  db: AdminFirestore | null,
): Promise<BookingGateHandlerResponse> {
  if (!db) {
    return {
      status: 503,
      body: {
        error: "Booking gate not configured",
        code: "GATE_NOT_CONFIGURED",
        message:
          "Booking review is temporarily unavailable. Please try again shortly or contact us directly.",
      },
    };
  }

  // ── Validate body ─────────────────────────────────────────────────────────
  const body = (rawBody ?? {}) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email : "";
  const phone = typeof body.phone === "string" ? body.phone : "";
  const licensePlate =
    typeof body.licensePlate === "string" ? body.licensePlate : undefined;
  const grandTotalRaw = body.grandTotal;
  const grandTotal =
    typeof grandTotalRaw === "number" && isFinite(grandTotalRaw) && grandTotalRaw >= 0
      ? grandTotalRaw
      : NaN;
  const selectedServiceIdsRaw = body.selectedServiceIds;
  const selectedServiceIds = Array.isArray(selectedServiceIdsRaw)
    ? selectedServiceIdsRaw
        .filter((x): x is string => typeof x === "string" && x.length > 0)
        .slice(0, 40)
    : [];
  const coordsRaw = body.customerCoordinates as
    | { lat?: unknown; lng?: unknown }
    | undefined;
  const customerCoordinates: { lat: number; lng: number } | null =
    coordsRaw &&
    typeof coordsRaw.lat === "number" &&
    typeof coordsRaw.lng === "number" &&
    isFinite(coordsRaw.lat) &&
    isFinite(coordsRaw.lng) &&
    !(coordsRaw.lat === 0 && coordsRaw.lng === 0)
      ? { lat: coordsRaw.lat, lng: coordsRaw.lng }
      : null;

  if (!email && !phone) {
    return { status: 400, body: { error: "email or phone is required" } };
  }
  if (!isFinite(grandTotal)) {
    return {
      status: 400,
      body: { error: "grandTotal must be a non-negative number" },
    };
  }
  if (selectedServiceIds.length === 0) {
    return {
      status: 400,
      body: { error: "selectedServiceIds must be a non-empty array" },
    };
  }

  try {
    // ── Load data with admin privileges ────────────────────────────────────
    const normEmail = gateNormalizeEmail(email);

    const pcPromise = db.collection("protected_clients").get();
    const clientPromise =
      normEmail.length > 3
        ? db.collection("clients").where("email", "==", normEmail).limit(1).get()
        : Promise.resolve(null);
    const servicesPromise = Promise.all(
      selectedServiceIds.map((id) => db.collection("services").doc(id).get()),
    );
    const settingsPromise = db.collection("settings").doc("business").get();

    const [pcSnap, clientSnap, serviceSnaps, settingsSnap] = await Promise.all([
      pcPromise,
      clientPromise,
      servicesPromise,
      settingsPromise,
    ]);

    const protectedClients = pcSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    }));

    const matchedClient =
      clientSnap && !clientSnap.empty
        ? {
            id: clientSnap.docs[0].id,
            ...(clientSnap.docs[0].data() as Record<string, unknown>),
          }
        : null;

    const selectedServices: Service[] = serviceSnaps
      .filter((s) => s.exists)
      .map((s) => ({ id: s.id, ...(s.data() as Omit<Service, "id">) }));

    if (selectedServices.length === 0) {
      return {
        status: 400,
        body: { error: "No matching services found for selectedServiceIds" },
      };
    }

    const settings = settingsSnap.exists
      ? (settingsSnap.data() as BusinessSettings)
      : null;

    const result = decideBookingGate({
      email,
      phone,
      licensePlate,
      selectedServices,
      grandTotal,
      protectedClients,
      matchedClient,
      customerCoordinates,
      settings,
    });

    return { status: 200, body: sanitizeGateResultForPublic(result) };
  } catch (err) {
    console.error("[booking-gate] error:", err);
    return {
      status: 500,
      body: {
        error: "Booking gate failed",
        code: "GATE_INTERNAL_ERROR",
        message:
          "We could not complete booking review right now. Please try again or contact us directly.",
      },
    };
  }
}
