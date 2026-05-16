import type { Service } from "../types";

/**
 * Online Booking Gate — pure decision core.
 *
 * This file has ZERO Firestore / Firebase imports so it can be safely
 * imported from `server.ts` (which loads data via firebase-admin) and
 * from the in-app client wrapper `onlineBookingGate.ts` (which loads
 * data via the firebase client SDK). The decision logic is shared.
 *
 * Hard rule: NEVER call Firestore from this file. Add a Firestore-aware
 * wrapper in `onlineBookingGate.ts` (client) or directly in `server.ts`
 * (server) instead.
 */

// ─── Normalization helpers ────────────────────────────────────────────────────

/** Trim and lowercase an email address. */
export const normalizeEmail = (v: string): string => (v || "").trim().toLowerCase();

/**
 * Strip all non-digit characters, then remove a leading country-code "1"
 * when the result is 11 digits (North American numbers stored with code).
 *   "(415) 555-1234"  → "4155551234"
 *   "14155551234"     → "4155551234"
 *   "4155551234"      → "4155551234"
 */
export const normalizePhone = (v: string): string => {
  const digits = (v || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
};

/** Strip formatting from a license plate. */
export const normalizeLicensePlate = (v: string): string =>
  (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// ─── Types ────────────────────────────────────────────────────────────────────

/** The routing decision for this booking submission. */
export type BookingMode =
  | "instant_confirm"       // no risk, no deposit → auto-confirmed
  | "pending_owner_review"  // risk detected → owner must review
  | "blocked_review"        // Block Booking flag → owner must explicitly approve
  | "deposit_required";     // deposit required, no risk → pending payment instructions

/**
 * What the customer-facing screen should show after submission.
 * Internal risk details are NEVER disclosed to the customer.
 */
export type CustomerMessageType =
  | "success"          // instant_confirm → green "Request Received"
  | "pending_review"   // any risk level → generic green "Request Received" (no risk wording)
  | "deposit_pending"; // deposit required, no risk → amber "Booking Pending"

/**
 * Input to the pure decision function. All Firestore loads have already
 * been performed by the caller; this function performs no I/O.
 */
export interface BookingGateDecisionInput {
  email: string;
  phone: string;
  /** Optional license plate from the booking form (used for PC matching). */
  licensePlate?: string;
  /** Resolved Service objects for all selected service IDs. */
  selectedServices: Service[];
  /**
   * Full customer-facing total after all adjustments:
   * serviceSubtotal + travelFee - discount + afterHoursFee.
   * Deposit percentages and balance-due calculation use this value.
   */
  grandTotal: number;
  /** Pre-loaded `protected_clients` documents (security-critical — admin-only). */
  protectedClients: Array<Record<string, unknown> & { id: string }>;
  /** Pre-loaded matching `clients` doc by email (may be null). */
  matchedClient: (Record<string, unknown> & { id: string }) | null;
}

/**
 * Full gate result. Used directly by authenticated callers (Calendar /
 * BookAppointment). Public callers MUST NOT receive this shape — only the
 * sanitized subset returned by `/api/booking/gate` (see PublicBookingGateResponse).
 */
export interface BookingGateResult {
  bookingMode: BookingMode;
  pendingOwnerReview: boolean;

  // ── Matching ──────────────────────────────────────────────────────────────
  matchedProtectedClientId: string | null;
  matchedClientId: string | null;
  protectedClientMatch: boolean;

  // ── Risk (internal — never shown to or stored by the customer) ────────────
  clientRiskLevelAtBooking: string | null;
  protectionLevel: string | null;
  riskReason: string | null;

  // ── Deposit ───────────────────────────────────────────────────────────────
  depositRequired: boolean;
  depositAmount: number;
  depositType: "fixed" | "percentage" | "mixed" | null;
  depositSource: "risk_rule" | "service" | "none";
  /**
   * Audit-only strings explaining why a deposit was triggered. Kept GENERIC
   * so they are safe for public exposure (service names are publicly readable
   * already; risk-level text is intentionally NOT included here — see the
   * stricter `riskReason` field for that).
   *
   *   • "Service deposit: <service name>"
   *   • "Account requires advance review"
   *   • "Client profile requires deposit"
   */
  depositReasons: string[];
  depositPaid: false;
  paymentStatus: "deposit_pending" | "unpaid";
  balanceDue: number;

  // ── UI hint ───────────────────────────────────────────────────────────────
  customerMessageType: CustomerMessageType;
}

/**
 * Public-safe gate response. This is what `/api/booking/gate` returns to
 * the public `/book` browser session. It deliberately omits:
 *   - riskReason
 *   - protectionLevel (raw enum text)
 *   - clientRiskLevelAtBooking (raw enum text)
 *
 * Only opaque IDs (`matchedProtectedClientId`, `matchedClientId`) cross
 * the wire so admins can join back to the source collections, but the
 * sensitive text fields never leave the server.
 */
export interface PublicBookingGateResponse {
  bookingMode: BookingMode;
  pendingOwnerReview: boolean;
  matchedProtectedClientId: string | null;
  matchedClientId: string | null;
  protectedClientMatch: boolean;
  depositRequired: boolean;
  depositAmount: number;
  depositType: "fixed" | "percentage" | "mixed" | null;
  depositSource: "risk_rule" | "service" | "none";
  /** Generic deposit-trigger strings. Never include raw risk-level wording. */
  depositReasons: string[];
  paymentStatus: "deposit_pending" | "unpaid";
  balanceDue: number;
  customerMessageType: CustomerMessageType;
}

// ─── Pure decision function ───────────────────────────────────────────────────

/**
 * Compute the gate decision from already-loaded data. Pure — no I/O.
 *
 * Called from:
 *   - `runOnlineBookingGate` in `onlineBookingGate.ts` (client SDK reads)
 *   - `/api/booking/gate` in `server.ts` (admin SDK reads, public exposure)
 */
export function decideBookingGate(input: BookingGateDecisionInput): BookingGateResult {
  const {
    email,
    phone,
    licensePlate,
    selectedServices,
    grandTotal,
    protectedClients,
    matchedClient,
  } = input;

  // ── 1. Normalize identifiers ──────────────────────────────────────────────
  const normEmail = normalizeEmail(email);
  const normPhone = normalizePhone(phone);
  const normPlate = normalizeLicensePlate(licensePlate ?? "");

  // ── 2. Match protected clients (in-memory, normalized) ────────────────────
  type PC = Record<string, unknown> & {
    id: string;
    isActive?: boolean;
    email?: string;
    phone?: string;
    licensePlate?: string;
    protectionLevel?: string;
    riskReason?: string;
    requiredDepositValue?: number;
    requiredDepositType?: string;
  };
  let matchedPc: PC | null = null;
  for (const raw of protectedClients) {
    const pc = raw as PC;
    if (!pc.isActive) continue;

    const pcEmail = normalizeEmail(pc.email || "");
    const pcPhone = normalizePhone(pc.phone || "");
    const pcPlate = normalizeLicensePlate(pc.licensePlate || "");

    // Email (strong — require ≥4 chars to avoid empty-string hits)
    if (normEmail.length > 3 && pcEmail.length > 3 && pcEmail === normEmail) {
      matchedPc = pc;
      break;
    }
    // Phone (require ≥10 digits to avoid short partial matches)
    if (normPhone.length >= 10 && pcPhone.length >= 10 && pcPhone === normPhone) {
      matchedPc = pc;
      break;
    }
    // License plate
    if (normPlate.length > 3 && pcPlate.length > 3 && pcPlate === normPlate) {
      matchedPc = pc;
      break;
    }
  }

  // ── 3. Derive risk level ──────────────────────────────────────────────────
  const protectionLevel: string | null = matchedPc?.protectionLevel ?? null;

  // Client-level inherent risk: check multiple field names that exist in
  // Firestore due to past schema iterations.
  const mc = matchedClient as
    | (Record<string, unknown> & {
        id: string;
        riskLevel?: string;
        risk_level?: string;
        riskStatus?: string;
        clientRiskLevel?: string;
        riskManagement?: { level?: string };
      })
    | null;
  const clientInherentRisk: string | null = mc
    ? (mc.riskLevel ??
        mc.risk_level ??
        mc.riskStatus ??
        mc.clientRiskLevel ??
        mc.riskManagement?.level ??
        null)
    : null;

  // Protected-client protectionLevel wins over client.riskLevel.
  const effectiveRiskLevel: string | null =
    protectionLevel ?? clientInherentRisk ?? null;

  const riskReason: string | null =
    matchedPc?.riskReason ??
    (clientInherentRisk ? "Risk level detected on client profile." : null);

  // ── 4. Determine deposit requirement ──────────────────────────────────────
  // Reasons array is built alongside the decision so admins can audit *why*
  // a deposit fired. Strings are intentionally GENERIC — they never include
  // raw risk-level wording (use `riskReason` for that), so the array is safe
  // to expose to the public client and persist on the appointment doc.
  let depositRequired = false;
  let depositAmount = 0;
  let depositType: "fixed" | "percentage" | "mixed" | null = null;
  let depositSource: "risk_rule" | "service" | "none" = "none";
  const depositReasons: string[] = [];

  if (matchedPc && (matchedPc.requiredDepositValue ?? 0) > 0) {
    // Protected-client rule takes highest priority.
    depositRequired = true;
    depositSource = "risk_rule";
    const rawType: string = matchedPc.requiredDepositType ?? "fixed";
    depositType = rawType as "fixed" | "percentage";
    if (rawType === "percentage") {
      depositAmount = (grandTotal * (matchedPc.requiredDepositValue ?? 0)) / 100;
    } else {
      depositAmount = matchedPc.requiredDepositValue ?? 0;
    }
    depositReasons.push("Account requires advance review");
  } else if (
    clientInherentRisk &&
    ["high", "High", "medium", "Medium", "Med", "med"].includes(clientInherentRisk)
  ) {
    // Client has inherent risk but no PC rule — default 25% deposit.
    depositRequired = true;
    depositSource = "risk_rule";
    depositType = "percentage";
    depositAmount = (grandTotal * 25) / 100;
    depositReasons.push("Client profile requires deposit");
  } else {
    // Service-level deposits: accumulate, track types for "mixed" detection.
    // Match the same field-name variance used by riskUtils.computeDepositRequirement
    // (`depositRequired` / `requireDeposit` / `requiresDeposit`) so real-world
    // service docs with the alternate names are not silently skipped.
    const seenTypes = new Set<string>();
    for (const svc of selectedServices) {
      const svcRaw = svc as Service & {
        requireDeposit?: boolean;
        requiresDeposit?: boolean;
      };
      const svcRequires = Boolean(
        svcRaw.depositRequired || svcRaw.requireDeposit || svcRaw.requiresDeposit,
      );
      if (!svcRequires) continue;
      depositRequired = true;
      depositSource = "service";
      const svcType = svcRaw.depositType ?? "fixed";
      seenTypes.add(svcType);
      if (svcType === "percentage") {
        depositAmount += ((svcRaw.depositAmount ?? 0) * svcRaw.basePrice) / 100;
      } else {
        depositAmount += svcRaw.depositAmount ?? 0;
      }
      depositReasons.push(`Service deposit: ${svcRaw.name ?? svcRaw.id}`);
    }
    if (seenTypes.size === 1) {
      depositType = seenTypes.values().next().value as "fixed" | "percentage";
    } else if (seenTypes.size > 1) {
      depositType = "mixed";
    }
  }

  // Cap at grandTotal; never negative.
  depositAmount = Math.max(0, Math.min(depositAmount, grandTotal));

  // ── 5. Booking mode ───────────────────────────────────────────────────────
  let bookingMode: BookingMode;
  let pendingOwnerReview = false;

  if (protectionLevel === "Block Booking") {
    bookingMode = "blocked_review";
    pendingOwnerReview = true;
  } else if (effectiveRiskLevel) {
    bookingMode = "pending_owner_review";
    pendingOwnerReview = true;
  } else if (depositRequired) {
    bookingMode = "deposit_required";
    pendingOwnerReview = false;
  } else {
    bookingMode = "instant_confirm";
    pendingOwnerReview = false;
  }

  // ── 6. Customer-facing message type ──────────────────────────────────────
  // Risk details are NEVER disclosed. Both pending_owner_review and
  // blocked_review show the same generic green confirmation screen.
  let customerMessageType: CustomerMessageType;
  if (bookingMode === "instant_confirm") {
    customerMessageType = "success";
  } else if (
    bookingMode === "pending_owner_review" ||
    bookingMode === "blocked_review"
  ) {
    customerMessageType = "pending_review";
  } else {
    customerMessageType = "deposit_pending";
  }

  const paymentStatus: "deposit_pending" | "unpaid" = depositRequired
    ? "deposit_pending"
    : "unpaid";
  const balanceDue = depositRequired
    ? Math.max(0, grandTotal - depositAmount)
    : grandTotal;

  return {
    bookingMode,
    pendingOwnerReview,
    matchedProtectedClientId: matchedPc?.id ?? null,
    matchedClientId: matchedClient?.id ?? null,
    protectedClientMatch: matchedPc !== null,
    clientRiskLevelAtBooking: effectiveRiskLevel,
    protectionLevel,
    riskReason,
    depositRequired,
    depositAmount,
    depositType: depositRequired ? depositType : null,
    depositSource,
    depositReasons,
    depositPaid: false,
    paymentStatus,
    balanceDue,
    customerMessageType,
  };
}

/**
 * Sanitize a full BookingGateResult into a public-safe response. Used by
 * the `/api/booking/gate` endpoint before returning to the public client.
 */
export function sanitizeGateResultForPublic(
  full: BookingGateResult,
): PublicBookingGateResponse {
  return {
    bookingMode: full.bookingMode,
    pendingOwnerReview: full.pendingOwnerReview,
    matchedProtectedClientId: full.matchedProtectedClientId,
    matchedClientId: full.matchedClientId,
    protectedClientMatch: full.protectedClientMatch,
    depositRequired: full.depositRequired,
    depositAmount: full.depositAmount,
    depositType: full.depositType,
    depositSource: full.depositSource,
    depositReasons: full.depositReasons,
    paymentStatus: full.paymentStatus,
    balanceDue: full.balanceDue,
    customerMessageType: full.customerMessageType,
    // DELIBERATELY OMITTED — never cross the wire to a public client:
    //   - riskReason          (raw protected-client reason text)
    //   - protectionLevel     (raw enum text)
    //   - clientRiskLevelAtBooking (raw enum text)
  };
}
