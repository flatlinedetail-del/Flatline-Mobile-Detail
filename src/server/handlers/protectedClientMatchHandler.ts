/**
 * Shared handler for POST /api/debug/protected-client-match.
 *
 * Temporary diagnostic endpoint — see the commit that added it for context.
 * Gated by `BOOKING_DEBUG_TOKEN` (the caller is responsible for the
 * header-vs-env-var equality check; this handler trusts the caller to have
 * authenticated). Returns a structured dump of what the matcher sees so we
 * can resolve live-data mismatches without guessing.
 *
 * NEVER returns `riskReason` / `internalNotes` even though the endpoint is
 * admin-only.
 */

import fs from "fs";
import path from "path";
import type { Firestore as AdminFirestore } from "firebase-admin/firestore";
import {
  decideBookingGate,
  normalizeEmail as gateNormalizeEmail,
} from "../../services/onlineBookingGateCore.js";

export interface ProtectedClientMatchHandlerResponse {
  status: number;
  body: unknown;
}

function readConfiguredDatabaseId(): {
  databaseId: string | null;
  projectId: string | null;
} {
  // env first
  const envDb = process.env.FIRESTORE_DATABASE_ID;
  if (typeof envDb === "string" && envDb.length > 0) {
    return { databaseId: envDb, projectId: process.env.FIREBASE_PROJECT_ID ?? null };
  }
  // file fallback (dev convenience)
  const candidates = [
    path.join(process.cwd(), "firebase-applet-config.json"),
    path.join(__dirname, "..", "..", "..", "firebase-applet-config.json"),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const config = JSON.parse(fs.readFileSync(p, "utf-8"));
      return {
        databaseId:
          typeof config.firestoreDatabaseId === "string"
            ? config.firestoreDatabaseId
            : "(default)",
        projectId: typeof config.projectId === "string" ? config.projectId : null,
      };
    } catch {
      // try the next candidate
    }
  }
  return { databaseId: "(unresolved)", projectId: null };
}

export async function handleProtectedClientMatchRequest(
  rawBody: unknown,
  db: AdminFirestore | null,
): Promise<ProtectedClientMatchHandlerResponse> {
  if (!db) {
    return {
      status: 503,
      body: { error: "Admin SDK not configured", code: "GATE_NOT_CONFIGURED" },
    };
  }

  const body = (rawBody ?? {}) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email : "";
  const phone = typeof body.phone === "string" ? body.phone : "";
  const licensePlate = typeof body.licensePlate === "string" ? body.licensePlate : "";
  const vin = typeof body.vin === "string" ? body.vin : "";
  const grandTotalRaw = body.grandTotal;
  const grandTotal =
    typeof grandTotalRaw === "number" && isFinite(grandTotalRaw) && grandTotalRaw >= 0
      ? grandTotalRaw
      : 100;

  const { databaseId, projectId } = readConfiguredDatabaseId();

  const normEmail = gateNormalizeEmail(email);
  const normPhoneRaw = (phone || "").replace(/\D/g, "");
  const normPhone =
    normPhoneRaw.length === 11 && normPhoneRaw.startsWith("1")
      ? normPhoneRaw.slice(1)
      : normPhoneRaw;
  const normPlate = (licensePlate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const normVin = (vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  try {
    const pcSnap = await db.collection("protected_clients").get();

    const candidates = pcSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const pcEmail = typeof data.email === "string" ? data.email : "";
      const pcPhone = typeof data.phone === "string" ? data.phone : "";
      const pcPlate = typeof data.licensePlate === "string" ? data.licensePlate : "";
      const pcVin = typeof data.vin === "string" ? data.vin : "";

      const pcNormEmail = pcEmail.trim().toLowerCase();
      const pcNormPhoneRaw = pcPhone.replace(/\D/g, "");
      const pcNormPhone =
        pcNormPhoneRaw.length === 11 && pcNormPhoneRaw.startsWith("1")
          ? pcNormPhoneRaw.slice(1)
          : pcNormPhoneRaw;
      const pcNormPlate = pcPlate.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const pcNormVin = pcVin.toUpperCase().replace(/[^A-Z0-9]/g, "");

      const isActive = data.isActive !== false;

      const emailHit =
        isActive &&
        normEmail.length > 3 &&
        pcNormEmail.length > 3 &&
        pcNormEmail === normEmail;
      const phoneHit =
        isActive &&
        normPhone.length >= 10 &&
        pcNormPhone.length >= 10 &&
        pcNormPhone === normPhone;
      const plateHit =
        isActive &&
        normPlate.length > 3 &&
        pcNormPlate.length > 3 &&
        pcNormPlate === normPlate;
      const vinHit =
        isActive &&
        normVin.length > 3 &&
        pcNormVin.length > 3 &&
        pcNormVin === normVin;

      const matched = emailHit || phoneHit || plateHit || vinHit;
      const matchedBy = emailHit
        ? "email"
        : phoneHit
          ? "phone"
          : plateHit
            ? "licensePlate"
            : vinHit
              ? "vin"
              : null;

      return {
        id: d.id,
        raw: {
          email: pcEmail,
          phone: pcPhone,
          licensePlate: pcPlate,
          vin: pcVin,
          isActive: data.isActive,
          isActiveResolved: isActive,
          protectionLevel: data.protectionLevel ?? null,
          depositRequired: data.depositRequired ?? null,
          requiredDepositType: data.requiredDepositType ?? null,
          requiredDepositValue: data.requiredDepositValue ?? null,
          fullName: data.fullName ?? null,
          linkedClientId: data.linkedClientId ?? null,
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
          __keysPresent: Object.keys(data).sort(),
        },
        normalized: {
          email: pcNormEmail,
          phone: pcNormPhone,
          licensePlate: pcNormPlate,
          vin: pcNormVin,
        },
        match: { matched, matchedBy, emailHit, phoneHit, plateHit, vinHit },
        // EXCLUDED per spec: riskReason, internalNotes
      };
    });

    const matchedCandidate = candidates.find((c) => c.match.matched) ?? null;

    const gateResult = decideBookingGate({
      email,
      phone,
      licensePlate: licensePlate || undefined,
      vin: vin || undefined,
      selectedServices: [],
      grandTotal,
      protectedClients: pcSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Record<string, unknown>),
      })),
      matchedClient: null,
    });

    return {
      status: 200,
      body: {
        meta: {
          databaseId,
          projectId,
          protectedClientsCount: pcSnap.size,
          timestamp: new Date().toISOString(),
        },
        input: {
          raw: { email, phone, licensePlate, vin, grandTotal },
          normalized: {
            email: normEmail,
            phone: normPhone,
            licensePlate: normPlate,
            vin: normVin,
          },
        },
        candidates,
        matchedCandidateId: matchedCandidate?.id ?? null,
        depositDecision: {
          bookingMode: gateResult.bookingMode,
          pendingOwnerReview: gateResult.pendingOwnerReview,
          depositRequired: gateResult.depositRequired,
          depositAmount: gateResult.depositAmount,
          depositType: gateResult.depositType,
          depositSource: gateResult.depositSource,
          depositReasons: gateResult.depositReasons,
          paymentStatus: gateResult.paymentStatus,
          balanceDue: gateResult.balanceDue,
          customerMessageType: gateResult.customerMessageType,
          matchedProtectedClientId: gateResult.matchedProtectedClientId,
          protectedClientMatch: gateResult.protectedClientMatch,
          // EXCLUDED per spec: riskReason, protectionLevel raw text,
          // clientRiskLevelAtBooking
        },
      },
    };
  } catch (err) {
    console.error("[debug/protected-client-match] error:", err);
    return {
      status: 500,
      body: {
        error: "diagnostic failed",
        code: "DEBUG_INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
