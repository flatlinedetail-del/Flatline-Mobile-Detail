/**
 * publicBookingRiskEngine.ts — Public Booking Risk Gate
 *
 * Pure (no Firestore, no React, no I/O). The risk engine is responsible for:
 *
 *   1. Normalising customer identifiers (email, phone, license plate).
 *   2. Matching the booking against an admin-loaded protected_clients list.
 *   3. Classifying any match into a coarse severity tier.
 *   4. Producing the safe booking-mode + customer-facing message routing.
 *   5. Returning ONLY public-safe data — raw risk text never leaves here.
 *
 * The engine is consumed by `onlineBookingGateCore.decideBookingGate`, which
 * orchestrates it together with the deposit engine and the travel engine.
 * Server.ts `/api/booking/gate` is the only place the protected_clients list
 * is loaded; it is never read from the public browser.
 */

// ─── Booking-mode + customer-message types ────────────────────────────────────
// These live here (the producer) and are re-exported from onlineBookingGateCore
// for backwards compatibility with existing callers.

/** The routing decision for this booking submission. */
export type BookingMode =
  | "instant_confirm"       // no risk, no deposit → auto-confirmed
  | "pending_owner_review"  // risk detected → owner must review
  | "blocked_review"        // block-tier match → owner must explicitly approve
  | "deposit_required";     // deposit required, no risk → pending payment

/**
 * What the customer-facing screen should show after submission.
 * Internal risk details are NEVER disclosed to the customer.
 */
export type CustomerMessageType =
  | "success"          // instant_confirm → green "Request Received"
  | "pending_review"   // any risk level → generic green "Request Received"
  | "deposit_pending"; // deposit required, no risk → amber "Booking Pending"

// ─── Normalisation ────────────────────────────────────────────────────────────

/** Trim and lowercase an email address. */
export const normalizeEmail = (v: string): string =>
  (v || "").trim().toLowerCase();

/**
 * Strip all non-digit characters, then remove a leading country-code "1"
 * when the result is 11 digits (North American numbers stored with code).
 *   "(415) 555-1234"  → "4155551234"
 *   "14155551234"     → "4155551234"
 */
export const normalizePhone = (v: string): string => {
  const digits = (v || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
};

/** Strip formatting from a license plate / VIN — uppercase, alnum only. */
export const normalizeAlnum = (v: string): string =>
  (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// ─── Tier classification ──────────────────────────────────────────────────────

/**
 * Coarse severity tier derived from a protectionLevel string.
 *
 *   "Low" | "Normal"                                  → "low"
 *   "Med" | "Medium" | "High"                         → "review"
 *   "Critical" | "Do Not Book" | "Block Booking"      → "block"
 *   anything else (unknown / legacy)                  → "review" (fail-safe)
 *
 * Comparison is case-insensitive and tolerant of whitespace.
 */
export type RiskTier = "none" | "low" | "review" | "block";

export function protectionLevelTier(
  level: string | null | undefined,
): RiskTier {
  if (!level) return "none";
  const lc = String(level).trim().toLowerCase();
  if (lc === "low" || lc === "normal") return "low";
  if (lc === "block booking" || lc === "critical" || lc === "do not book") {
    return "block";
  }
  if (lc === "med" || lc === "medium" || lc === "high") return "review";
  // Unknown values default to "review" — we never instant-confirm an
  // unrecognised level (could be a future tier or a typo).
  return "review";
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Anything the matcher needs from a protected_clients document. */
export type ProtectedClientRecord = Record<string, unknown> & {
  id: string;
  isActive?: boolean;
  email?: string;
  phone?: string;
  licensePlate?: string;
  vin?: string;
  protectionLevel?: string;
  riskReason?: string;
  depositRequired?: boolean;
  requiredDepositValue?: number;
  requiredDepositType?: string;
};

/** Anything the engine needs from a clients document for the fallback path. */
export type ClientRecord = Record<string, unknown> & {
  id: string;
  riskLevel?: string;
  risk_level?: string;
  riskStatus?: string;
  clientRiskLevel?: string;
  riskManagement?: { level?: string };
};

export interface RiskEngineInput {
  email: string;
  phone: string;
  licensePlate?: string;
  vin?: string;
  protectedClients: ProtectedClientRecord[];
  matchedClient: ClientRecord | null;
}

/** Result of the risk engine. Includes both safe and INTERNAL fields. */
export interface RiskEngineResult {
  // ── Safe / public fields ─────────────────────────────────────────────────
  protectedClientMatch: boolean;
  matchedProtectedClientId: string | null;
  matchedClientId: string | null;
  pendingOwnerReview: boolean;
  /** May be upgraded by other engines (deposit / travel) before final emit. */
  bookingMode: BookingMode;
  customerMessageType: CustomerMessageType;

  // ── Internal fields (never expose to public client) ──────────────────────
  /** The matched protected_clients doc, or null. Used by the deposit engine. */
  matchedProtectedClient: ProtectedClientRecord | null;
  /** Coarse severity tier of the protected-client match. */
  protectedTier: RiskTier;
  /** Raw client.riskLevel value found across the legacy field names, or null. */
  clientInherentRisk: string | null;
  /** Combined effective risk level (PC wins). Raw text — INTERNAL. */
  effectiveRiskLevel: string | null;
  /** Free-text risk reason from the protected-client or client doc. INTERNAL. */
  riskReason: string | null;
}

// ─── Matching ─────────────────────────────────────────────────────────────────

/**
 * Walk the protected_clients list with normalised comparisons. Returns the
 * first active match by email / phone / license plate / VIN in that order.
 * Empty/short identifiers are skipped to prevent false positives:
 *   email   ≥ 4 chars
 *   phone   ≥ 10 digits
 *   plate   > 3 chars
 *   VIN     > 3 chars
 */
export function matchProtectedClient(
  identifiers: { email: string; phone: string; licensePlate?: string; vin?: string },
  list: ProtectedClientRecord[],
): ProtectedClientRecord | null {
  const normEmail = normalizeEmail(identifiers.email);
  const normPhone = normalizePhone(identifiers.phone);
  const normPlate = normalizeAlnum(identifiers.licensePlate ?? "");
  const normVin = normalizeAlnum(identifiers.vin ?? "");

  for (const pc of list) {
    if (pc.isActive === false) continue;

    const pcEmail = normalizeEmail(pc.email ?? "");
    const pcPhone = normalizePhone(pc.phone ?? "");
    const pcPlate = normalizeAlnum(pc.licensePlate ?? "");
    const pcVin = normalizeAlnum(pc.vin ?? "");

    if (normEmail.length > 3 && pcEmail.length > 3 && pcEmail === normEmail) return pc;
    if (normPhone.length >= 10 && pcPhone.length >= 10 && pcPhone === normPhone) return pc;
    if (normPlate.length > 3 && pcPlate.length > 3 && pcPlate === normPlate) return pc;
    if (normVin.length > 3 && pcVin.length > 3 && pcVin === normVin) return pc;
  }

  return null;
}

// ─── Client-level inherent risk ───────────────────────────────────────────────

/**
 * Read the customer's inherent risk level from a `clients` doc, tolerating
 * every field-name variant the codebase has used historically.
 */
export function readClientInherentRisk(client: ClientRecord | null): string | null {
  if (!client) return null;
  return (
    client.riskLevel ??
    client.risk_level ??
    client.riskStatus ??
    client.clientRiskLevel ??
    client.riskManagement?.level ??
    null
  );
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * Compute the risk decision. Pure.
 *
 * Routing:
 *   - protected match at tier "block" → blocked_review
 *   - any other risk signal (PC at tier review/low or client.riskLevel) →
 *     pending_owner_review
 *   - no risk → instant_confirm (deposit engine / travel engine may upgrade)
 *
 * Customer message:
 *   - instant_confirm → success
 *   - blocked_review | pending_owner_review → pending_review (generic)
 *   - (deposit-only is decided later in the orchestrator)
 */
export function decideBookingRiskGate(input: RiskEngineInput): RiskEngineResult {
  const matchedPc = matchProtectedClient(
    {
      email: input.email,
      phone: input.phone,
      licensePlate: input.licensePlate,
      vin: input.vin,
    },
    input.protectedClients,
  );

  const protectionLevel: string | null = matchedPc?.protectionLevel ?? null;
  const protectedTier = protectionLevelTier(protectionLevel);
  const clientInherentRisk = readClientInherentRisk(input.matchedClient);
  const effectiveRiskLevel = protectionLevel ?? clientInherentRisk ?? null;

  const riskReason: string | null =
    matchedPc?.riskReason ??
    (clientInherentRisk ? "Risk level detected on client profile." : null);

  let bookingMode: BookingMode;
  let pendingOwnerReview = false;
  let customerMessageType: CustomerMessageType = "success";

  if (protectedTier === "block") {
    bookingMode = "blocked_review";
    pendingOwnerReview = true;
    customerMessageType = "pending_review";
  } else if (effectiveRiskLevel) {
    bookingMode = "pending_owner_review";
    pendingOwnerReview = true;
    customerMessageType = "pending_review";
  } else {
    // No risk signal — the orchestrator may still upgrade this to
    // "deposit_required" or "pending_owner_review" (travel outside area).
    bookingMode = "instant_confirm";
    customerMessageType = "success";
  }

  return {
    protectedClientMatch: matchedPc !== null,
    matchedProtectedClientId: matchedPc?.id ?? null,
    matchedClientId: input.matchedClient?.id ?? null,
    pendingOwnerReview,
    bookingMode,
    customerMessageType,
    matchedProtectedClient: matchedPc,
    protectedTier,
    clientInherentRisk,
    effectiveRiskLevel,
    riskReason,
  };
}
