import type { BusinessSettings, Service } from "../types";
import {
  aggregateServiceDeposits,
  readProtectedClientDeposit,
  type DepositServiceLike,
} from "./publicBookingDepositDetector";
import {
  computePublicBookingTravel,
  type PublicBookingTravelResult,
} from "./publicBookingTravelEngine";

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
 *
 * The gate is the SINGLE SOURCE OF TRUTH for: protected-client matching,
 * service-level deposits, risk-rule deposits, travel-fee computation (when
 * `customerCoordinates` + `settings` are provided) and the resulting
 * booking-mode routing (instant_confirm / deposit_required /
 * pending_owner_review / blocked_review).
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

/**
 * Classify a protectionLevel string into a coarse severity tier.
 *
 *   "Low" | "Normal"                        → "low"
 *   "Med" | "Medium" | "High"               → "review"  (owner-review + default deposit)
 *   "Critical" | "Do Not Book" |
 *   "Block Booking"                         → "block"   (blocked_review + default deposit)
 *   anything else (unknown)                 → "review"  (fail-safe — never instant-confirm
 *                                                       a level we do not recognise)
 *
 * Comparison is case-insensitive and tolerant of whitespace so values written
 * by older UI iterations (e.g. "medium" lowercase, " Block Booking ") still
 * classify correctly. Used by `decideBookingGate` to decide whether a
 * protected-client match should trigger the default 25% risk deposit and what
 * booking mode to route to.
 */
export function protectionLevelTier(
  level: string | null | undefined,
): "none" | "low" | "review" | "block" {
  if (!level) return "none";
  const lc = String(level).trim().toLowerCase();
  if (lc === "low" || lc === "normal") return "low";
  if (lc === "block booking" || lc === "critical" || lc === "do not book") return "block";
  if (lc === "med" || lc === "medium" || lc === "high") return "review";
  return "review";
}

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
   *
   * NOTE: when `customerCoordinates` and `settings` are also provided the
   * gate will RECOMPUTE the authoritative travel fee server-side. Callers
   * should pass `grandTotal` excluding any client-computed travel fee in
   * that case (or pass it with the client's preview value — the gate's
   * travel result is exported separately as `travel` on the result).
   */
  grandTotal: number;
  /** Pre-loaded `protected_clients` documents (security-critical — admin-only). */
  protectedClients: Array<Record<string, unknown> & { id: string }>;
  /** Pre-loaded matching `clients` doc by email (may be null). */
  matchedClient: (Record<string, unknown> & { id: string }) | null;

  // ── Optional travel-fee inputs ─────────────────────────────────────────────
  // When BOTH are provided, the gate runs `computePublicBookingTravel` and
  // returns the result. The gate also routes to pending_owner_review when
  // the customer's coordinates fall outside the configured service area.
  customerCoordinates?: { lat: number; lng: number } | null;
  settings?: BusinessSettings | null;
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

  // ── Travel (only meaningful when settings + customerCoordinates provided) ─
  travel: PublicBookingTravelResult;

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
  /** Authoritative travel-fee computation. Safe to expose. */
  travel: PublicBookingTravelResult;
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
    customerCoordinates,
    settings,
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

  // ── 4. Travel fee (server-authoritative when inputs available) ────────────
  // Computed BEFORE deposit so the deposit can be capped at the correct
  // grandTotal (caller-supplied grandTotal already includes whatever travel
  // fee preview the client computed; we trust the caller's grandTotal and
  // surface the authoritative travel result separately for the appointment
  // payload).
  const travel: PublicBookingTravelResult = (() => {
    if (customerCoordinates && settings) {
      return computePublicBookingTravel({
        customerLat: customerCoordinates.lat,
        customerLng: customerCoordinates.lng,
        settings,
      });
    }
    return {
      travelFee: 0,
      travelDistanceMiles: 0,
      estimatedTravelMinutes: 0,
      travelZone: "",
      travelFeeReason: "Travel not evaluated (no coordinates supplied)",
      travelReviewRequired: false,
    };
  })();

  // ── 5. Determine deposit requirement ──────────────────────────────────────
  // Reasons array is built alongside the decision so admins can audit *why*
  // a deposit fired. Strings are intentionally GENERIC — they never include
  // raw risk-level wording (use `riskReason` for that), so the array is safe
  // to expose to the public client and persist on the appointment doc.
  //
  // Priority (highest first):
  //   1. Protected-client EXPLICIT deposit (requiredDepositValue > 0)
  //   2. Protected-client default risk deposit — applies whenever a match
  //      exists AND either the per-client `depositRequired` flag is set OR
  //      the protectionLevel tier is "review"/"block" (Med/High/Critical/
  //      Do Not Book/Block Booking). Default 25% of grandTotal so flagging a
  //      client as high-risk without filling in a value still fires a
  //      deposit — the previous behaviour silently fell through to $0.
  //   3. Client-level inherent risk (from clients collection riskLevel)
  //      default 25% — fallback for clients who have a riskLevel set but
  //      no matching protected_clients entry.
  //   4. Service-level deposits via shared detector.
  let depositRequired = false;
  let depositAmount = 0;
  let depositType: "fixed" | "percentage" | "mixed" | null = null;
  let depositSource: "risk_rule" | "service" | "none" = "none";
  const depositReasons: string[] = [];

  const pcExplicit = matchedPc
    ? readProtectedClientDeposit(matchedPc, grandTotal)
    : { required: false, amount: 0, type: null as "fixed" | "percentage" | null };

  const tier = protectionLevelTier(protectionLevel);
  const pcDepositFlag = Boolean(
    matchedPc &&
      ((matchedPc as Record<string, unknown>).depositRequired === true),
  );
  const safeGrandTotal = Math.max(0, grandTotal);

  if (pcExplicit.required) {
    // Explicit configured value takes top priority.
    depositRequired = true;
    depositSource = "risk_rule";
    depositType = pcExplicit.type;
    depositAmount = pcExplicit.amount;
    depositReasons.push("Account requires advance review");
  } else if (matchedPc && (pcDepositFlag || tier === "review" || tier === "block")) {
    // Protected-client match at a risk-bearing tier (or with the
    // "Require deposit before booking" flag checked) but no explicit value
    // configured → default 25% of grandTotal so the flag is never ignored.
    depositRequired = true;
    depositSource = "risk_rule";
    depositType = "percentage";
    depositAmount = (safeGrandTotal * 25) / 100;
    depositReasons.push("Risk profile requires deposit");
  } else if (
    clientInherentRisk &&
    [
      "high", "High",
      "medium", "Medium", "med", "Med",
      "critical", "Critical",
      "do not book", "Do Not Book",
    ].includes(clientInherentRisk)
  ) {
    // Client has inherent risk but no PC rule — default 25% deposit.
    depositRequired = true;
    depositSource = "risk_rule";
    depositType = "percentage";
    depositAmount = (safeGrandTotal * 25) / 100;
    depositReasons.push("Client profile requires deposit");
  } else {
    // Service-level deposits via shared detector (handles all field-name
    // variants observed across schema iterations).
    const agg = aggregateServiceDeposits(
      selectedServices as DepositServiceLike[],
      safeGrandTotal,
    );
    if (agg.required) {
      depositRequired = true;
      depositSource = "service";
      depositAmount = agg.amount;
      depositType = agg.type;
      for (const reason of agg.reasons) depositReasons.push(reason);
    }
  }

  // Cap at grandTotal; never negative.
  depositAmount = Math.max(0, Math.min(depositAmount, safeGrandTotal));

  // ── 6. Booking mode ───────────────────────────────────────────────────────
  // Priority (highest first):
  //   1. Block-tier protection   → blocked_review (Block Booking, Critical,
  //                                Do Not Book — owner must explicitly approve)
  //   2. Any other risk level    → pending_owner_review
  //   3. Travel outside service  → pending_owner_review
  //   4. Deposit required        → deposit_required
  //   5. Otherwise               → instant_confirm
  let bookingMode: BookingMode;
  let pendingOwnerReview = false;

  if (tier === "block") {
    bookingMode = "blocked_review";
    pendingOwnerReview = true;
  } else if (effectiveRiskLevel) {
    bookingMode = "pending_owner_review";
    pendingOwnerReview = true;
  } else if (travel.travelReviewRequired) {
    bookingMode = "pending_owner_review";
    pendingOwnerReview = true;
    depositReasons.push("Service location requires owner review");
  } else if (depositRequired) {
    bookingMode = "deposit_required";
    pendingOwnerReview = false;
  } else {
    bookingMode = "instant_confirm";
    pendingOwnerReview = false;
  }

  // ── 7. Customer-facing message type ──────────────────────────────────────
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
    : Math.max(0, grandTotal);

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
    travel,
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
    travel: full.travel,
    customerMessageType: full.customerMessageType,
    // DELIBERATELY OMITTED — never cross the wire to a public client:
    //   - riskReason          (raw protected-client reason text)
    //   - protectionLevel     (raw enum text)
    //   - clientRiskLevelAtBooking (raw enum text)
  };
}
