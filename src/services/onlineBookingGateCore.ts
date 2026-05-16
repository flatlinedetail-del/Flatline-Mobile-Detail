import type { BusinessSettings, Service } from "../types";
import {
  computePublicBookingTravel,
  type PublicBookingTravelResult,
} from "./publicBookingTravelEngine";
import {
  decideBookingRiskGate,
  normalizeEmail as _normalizeEmail,
  normalizePhone as _normalizePhone,
  normalizeAlnum as _normalizeAlnum,
  protectionLevelTier as _protectionLevelTier,
  type BookingMode as _BookingMode,
  type CustomerMessageType as _CustomerMessageType,
  type ProtectedClientRecord,
  type ClientRecord,
  type RiskTier,
} from "./publicBookingRiskEngine";
import {
  decideBookingDeposit,
  type DepositSource,
  type DepositType,
} from "./publicBookingDepositEngine";
import type { DepositServiceLike } from "./publicBookingDepositDetector";

/**
 * Online Booking Gate — pure orchestrator.
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
 * Architecture (post-rebuild):
 *
 *   ┌──────────────────────────┐     ┌──────────────────────────┐
 *   │ publicBookingRiskEngine  │     │ publicBookingTravelEngine│
 *   │  • match protected_clients     │  • haversine + zones     │
 *   │  • protection-level tier │     │  • service-area routing  │
 *   │  • route booking mode    │     └──────────────────────────┘
 *   └────────────┬─────────────┘                  │
 *                │                                │
 *                ▼                                │
 *   ┌──────────────────────────┐                  │
 *   │ publicBookingDepositEngine│                 │
 *   │  • service deposits      │                  │
 *   │  • risk deposits         │                  │
 *   │  • combined decision     │                  │
 *   └────────────┬─────────────┘                  │
 *                │                                │
 *                ▼                                │
 *           ┌────────────────────────────────────────────┐
 *           │ decideBookingGate (this file)              │
 *           │   composes RiskGate + Deposit + Travel     │
 *           │   into BookingGateResult and applies the   │
 *           │   final bookingMode upgrades.              │
 *           └────────────────────────────────────────────┘
 */

// ─── Public types ─────────────────────────────────────────────────────────────
// BookingMode and CustomerMessageType are declared by the risk engine (the
// producer). Re-export here so existing imports of these names from this file
// keep working unchanged across the codebase.

export type BookingMode = _BookingMode;
export type CustomerMessageType = _CustomerMessageType;

/**
 * Input to the orchestrator. All Firestore loads have already been performed
 * by the caller; this function performs no I/O.
 */
export interface BookingGateDecisionInput {
  email: string;
  phone: string;
  /** Optional license plate from the booking form (used for PC matching). */
  licensePlate?: string;
  /** Optional VIN — included in PC matching when supplied. */
  vin?: string;
  /** Resolved Service objects for all selected service IDs. */
  selectedServices: Service[];
  /**
   * Full customer-facing total after all adjustments:
   * serviceSubtotal + travelFee - discount + afterHoursFee.
   * Deposit percentages and balance-due calculation use this value.
   */
  grandTotal: number;
  /** Pre-loaded `protected_clients` documents (security-critical — admin-only). */
  protectedClients: ProtectedClientRecord[];
  /** Pre-loaded matching `clients` doc by email (may be null). */
  matchedClient: ClientRecord | null;

  // ── Optional travel-fee inputs ─────────────────────────────────────────────
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
  depositType: DepositType;
  depositSource: DepositSource;
  /**
   * Audit-only strings explaining why a deposit was triggered. Kept GENERIC
   * so they are safe for public exposure.
   */
  depositReasons: string[];
  depositPaid: false;
  paymentStatus: "deposit_pending" | "unpaid";
  balanceDue: number;

  // ── Travel ────────────────────────────────────────────────────────────────
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
  depositType: DepositType;
  depositSource: DepositSource;
  /** Generic deposit-trigger strings. Never include raw risk-level wording. */
  depositReasons: string[];
  paymentStatus: "deposit_pending" | "unpaid";
  balanceDue: number;
  /** Authoritative travel-fee computation. Safe to expose. */
  travel: PublicBookingTravelResult;
  customerMessageType: CustomerMessageType;
}

// ─── Re-exports for backwards compatibility ───────────────────────────────────
// `onlineBookingGate.ts` (the desktop wrapper) re-exports these from this file.
// Keeping the symbols here means existing callers across the codebase keep
// working without changes.
export const normalizeEmail = _normalizeEmail;
export const normalizePhone = _normalizePhone;
export const normalizeLicensePlate = _normalizeAlnum;
export const protectionLevelTier = _protectionLevelTier;
export type { RiskTier };

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Compute the gate decision from already-loaded data. Pure — no I/O.
 *
 * Composes:
 *   - Risk engine: matches protected_clients, classifies tier, sets initial
 *     bookingMode (blocked_review | pending_owner_review | instant_confirm).
 *   - Travel engine: computes authoritative travel-fee + service-area review.
 *   - Deposit engine: combines service-level + risk-level deposits.
 *
 * Then applies the final mode upgrade so a deposit/travel-review signal can
 * promote an instant_confirm to deposit_required / pending_owner_review.
 */
export function decideBookingGate(
  input: BookingGateDecisionInput,
): BookingGateResult {
  // ── 1. Risk gate ──────────────────────────────────────────────────────────
  const risk = decideBookingRiskGate({
    email: input.email,
    phone: input.phone,
    licensePlate: input.licensePlate,
    vin: input.vin,
    protectedClients: input.protectedClients,
    matchedClient: input.matchedClient,
  });

  // ── 2. Travel (optional — only when coords + settings supplied) ───────────
  const travel: PublicBookingTravelResult =
    input.customerCoordinates && input.settings
      ? computePublicBookingTravel({
          customerLat: input.customerCoordinates.lat,
          customerLng: input.customerCoordinates.lng,
          settings: input.settings,
        })
      : {
          travelFee: 0,
          travelDistanceMiles: 0,
          estimatedTravelMinutes: 0,
          travelZone: "",
          travelFeeReason: "Travel not evaluated (no coordinates supplied)",
          travelReviewRequired: false,
        };

  // ── 3. Deposit (service-level + risk-level, combined) ─────────────────────
  const deposit = decideBookingDeposit({
    selectedServices: input.selectedServices as DepositServiceLike[],
    risk: {
      matchedProtectedClient: risk.matchedProtectedClient,
      protectedTier: risk.protectedTier,
      clientInherentRisk: risk.clientInherentRisk,
    },
    grandTotal: input.grandTotal,
  });

  // ── 4. Final booking mode + customer message ──────────────────────────────
  // Priority (highest first):
  //   1. block-tier protection → blocked_review (already set by risk engine)
  //   2. any risk signal → pending_owner_review (already set by risk engine)
  //   3. travel outside service area → pending_owner_review (upgrade)
  //   4. deposit required (no risk, no travel review) → deposit_required (upgrade)
  //   5. otherwise → instant_confirm (already set by risk engine)
  let bookingMode = risk.bookingMode;
  let pendingOwnerReview = risk.pendingOwnerReview;
  let customerMessageType = risk.customerMessageType;
  const depositReasons = [...deposit.depositReasons];

  if (bookingMode === "instant_confirm" && travel.travelReviewRequired) {
    bookingMode = "pending_owner_review";
    pendingOwnerReview = true;
    customerMessageType = "pending_review";
    depositReasons.push("Service location requires owner review");
  } else if (bookingMode === "instant_confirm" && deposit.depositRequired) {
    bookingMode = "deposit_required";
    customerMessageType = "deposit_pending";
  }

  return {
    bookingMode,
    pendingOwnerReview,
    matchedProtectedClientId: risk.matchedProtectedClientId,
    matchedClientId: risk.matchedClientId,
    protectedClientMatch: risk.protectedClientMatch,
    clientRiskLevelAtBooking: risk.effectiveRiskLevel,
    protectionLevel: risk.matchedProtectedClient?.protectionLevel ?? null,
    riskReason: risk.riskReason,
    depositRequired: deposit.depositRequired,
    depositAmount: deposit.depositAmount,
    depositType: deposit.depositType,
    depositSource: deposit.depositSource,
    depositReasons,
    depositPaid: false,
    paymentStatus: deposit.paymentStatus,
    balanceDue: deposit.balanceDue,
    travel,
    customerMessageType,
  };
}

/**
 * Sanitize a full BookingGateResult into a public-safe response. Used by
 * the `/api/booking/gate` endpoint before returning to the public client.
 *
 * SECURITY: every field added to PublicBookingGateResponse must be reviewed
 * against the customer-facing privacy contract — raw risk text never leaves
 * the server. Opaque IDs are fine (admins dereference them server-side).
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
    //   - riskReason
    //   - protectionLevel
    //   - clientRiskLevelAtBooking
  };
}
