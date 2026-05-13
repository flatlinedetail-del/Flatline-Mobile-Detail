import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import type { Service } from "../types";

// ─── Normalization helpers ────────────────────────────────────────────────────
// Exported so PublicBooking can use the identical normalization for its live
// preview (matching useEffect) without duplicating the logic.

/**
 * Trim and lowercase an email address.
 */
export const normalizeEmail = (v: string): string => v.trim().toLowerCase();

/**
 * Strip all non-digit characters, then remove a leading country-code "1" when
 * the result is 11 digits (North American numbers stored with country code).
 * Returns a 10-digit string for North American numbers, e.g.:
 *   "(415) 555-1234"  → "4155551234"
 *   "14155551234"     → "4155551234"
 *   "4155551234"      → "4155551234"
 */
export const normalizePhone = (v: string): string => {
  const digits = v.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
};

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

export interface BookingGateInput {
  email: string;
  phone: string;
  /** Optional license plate value from the booking form (used for PC matching). */
  licensePlate?: string;
  /** Resolved Service objects for all selected service IDs. */
  selectedServices: Service[];
  /**
   * Full customer-facing total after all adjustments:
   * serviceSubtotal + travelFee - discount + afterHoursFee.
   * Deposit percentages and the balance-due calculation use this value.
   */
  grandTotal: number;
}

export interface BookingGateResult {
  bookingMode: BookingMode;
  pendingOwnerReview: boolean;

  // ── Matching ──────────────────────────────────────────────────────────────
  matchedProtectedClientId: string | null;
  matchedClientId: string | null;
  protectedClientMatch: boolean;

  // ── Risk (internal — never shown to customer) ─────────────────────────────
  clientRiskLevelAtBooking: string | null;
  /** Raw protectionLevel from the ProtectedClient record, if matched. */
  protectionLevel: string | null;
  /** Internal reason string from the ProtectedClient record. */
  riskReason: string | null;

  // ── Deposit ───────────────────────────────────────────────────────────────
  depositRequired: boolean;
  depositAmount: number;
  /** Deposit type; "mixed" when multiple services use different types. */
  depositType: "fixed" | "percentage" | "mixed" | null;
  depositSource: "risk_rule" | "service" | "none";
  /** Always false — Stripe checkout is not yet implemented. */
  depositPaid: false;
  paymentStatus: "deposit_pending" | "unpaid";
  balanceDue: number;

  // ── UI hint ───────────────────────────────────────────────────────────────
  customerMessageType: CustomerMessageType;
}

// ─── Main Gate ────────────────────────────────────────────────────────────────

/**
 * OnlineBookingGate — authoritative risk + deposit check for public booking.
 *
 * Called once per booking submission, immediately before writing to Firestore.
 * Always fetches fresh data so results are never stale from page-load caches.
 *
 * Payment note: Stripe checkout is NOT yet implemented.  When depositRequired
 * is true the appointment is saved with paymentStatus "deposit_pending" and
 * depositPaid false.  The owner contacts the customer with payment instructions
 * manually.  depositPaid must only be set to true by a verified payment webhook
 * once Stripe is wired up.
 */
export async function runOnlineBookingGate(
  input: BookingGateInput
): Promise<BookingGateResult> {
  const { email, phone, licensePlate, selectedServices, grandTotal } = input;

  // ── 1. Normalize identifiers ──────────────────────────────────────────────
  const normEmail = normalizeEmail(email);
  const normPhone = normalizePhone(phone);
  const normPlate = licensePlate
    ? licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, "")
    : "";

  // ── 2. Fetch data in parallel ─────────────────────────────────────────────
  //
  // protected_clients: always fetch all — this list is small (<500 entries in
  //   practice) and security-critical.  In-memory matching handles all fields.
  //
  // clients: query by normalized email (Firestore index, fast).  Phone-based
  //   querying requires a stored normalized field which does not exist yet, so
  //   phone matching is only done for protected_clients (the primary risk gate).
  const pcFetch = getDocs(collection(db, "protected_clients"));
  const clientFetch =
    normEmail.length > 3
      ? getDocs(query(collection(db, "clients"), where("email", "==", normEmail)))
      : Promise.resolve(null);

  const [pcSnap, clientSnap] = await Promise.all([pcFetch, clientFetch]);

  const allProtected: any[] = pcSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const clientDocs: any[] = clientSnap
    ? clientSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    : [];

  // ── 3. Match protected clients (in-memory, normalized) ────────────────────
  let matchedPc: any = null;

  for (const pc of allProtected) {
    if (!pc.isActive) continue;

    const pcEmail = normalizeEmail(pc.email || "");
    const pcPhone = normalizePhone(pc.phone || "");
    const pcPlate = pc.licensePlate
      ? pc.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, "")
      : "";

    // Email match (strong — require at least 4 chars to avoid empty-string hits)
    if (normEmail.length > 3 && pcEmail.length > 3 && pcEmail === normEmail) {
      matchedPc = pc;
      break;
    }
    // Phone match (require at least 10 digits to avoid short partial matches)
    if (normPhone.length >= 10 && pcPhone.length >= 10 && pcPhone === normPhone) {
      matchedPc = pc;
      break;
    }
    // License plate match
    if (normPlate.length > 3 && pcPlate.length > 3 && pcPlate === normPlate) {
      matchedPc = pc;
      break;
    }
  }

  // ── 4. Match existing client record (email-based) ─────────────────────────
  const matchedClient: any = clientDocs.length > 0 ? clientDocs[0] : null;

  // ── 5. Derive risk level ──────────────────────────────────────────────────
  const protectionLevel: string | null = matchedPc?.protectionLevel ?? null;

  // Client-level inherent risk: check multiple field names that exist in Firestore
  // due to past schema iterations.
  const clientInherentRisk: string | null = matchedClient
    ? (matchedClient.riskLevel ??
        matchedClient.risk_level ??
        matchedClient.riskStatus ??
        matchedClient.clientRiskLevel ??
        matchedClient.riskManagement?.level ??
        null)
    : null;

  // Protected-client protectionLevel wins over client.riskLevel
  const effectiveRiskLevel: string | null = protectionLevel ?? clientInherentRisk ?? null;

  const riskReason: string | null =
    matchedPc?.riskReason ??
    (clientInherentRisk ? "Risk level detected on client profile." : null);

  // ── 6. Determine deposit requirement ─────────────────────────────────────
  let depositRequired = false;
  let depositAmount = 0;
  let depositType: "fixed" | "percentage" | "mixed" | null = null;
  let depositSource: "risk_rule" | "service" | "none" = "none";

  if (matchedPc && (matchedPc.requiredDepositValue ?? 0) > 0) {
    // Protected client rule takes highest priority
    depositRequired = true;
    depositSource = "risk_rule";
    const rawType: string = matchedPc.requiredDepositType ?? "fixed";
    depositType = rawType as "fixed" | "percentage";
    if (rawType === "percentage") {
      depositAmount = (grandTotal * (matchedPc.requiredDepositValue ?? 0)) / 100;
    } else {
      depositAmount = matchedPc.requiredDepositValue ?? 0;
    }
  } else if (
    clientInherentRisk &&
    ["high", "High", "medium", "Medium", "Med", "med"].includes(clientInherentRisk)
  ) {
    // Client has inherent risk but no protected-client rule — default 25 % deposit
    depositRequired = true;
    depositSource = "risk_rule";
    depositType = "percentage";
    depositAmount = (grandTotal * 25) / 100;
  } else {
    // Service-level deposits: accumulate, track types for "mixed" detection
    const seenTypes = new Set<string>();
    for (const svc of selectedServices) {
      if (!svc.depositRequired) continue;
      depositRequired = true;
      depositSource = "service";
      const svcType = svc.depositType ?? "fixed";
      seenTypes.add(svcType);
      if (svcType === "percentage") {
        // Percentage is of the service's base price
        depositAmount += ((svc.depositAmount ?? 0) * svc.basePrice) / 100;
      } else {
        depositAmount += svc.depositAmount ?? 0;
      }
    }
    if (seenTypes.size === 1) {
      depositType = seenTypes.values().next().value as "fixed" | "percentage";
    } else if (seenTypes.size > 1) {
      depositType = "mixed";
    }
  }

  // Cap at grandTotal; never negative
  depositAmount = Math.max(0, Math.min(depositAmount, grandTotal));

  // ── 7. Booking mode ───────────────────────────────────────────────────────
  let bookingMode: BookingMode;
  let pendingOwnerReview = false;

  if (protectionLevel === "Block Booking") {
    // Explicit block flag — always requires owner review
    bookingMode = "blocked_review";
    pendingOwnerReview = true;
  } else if (effectiveRiskLevel) {
    // Any identified risk level (protected client or client profile)
    bookingMode = "pending_owner_review";
    pendingOwnerReview = true;
  } else if (depositRequired) {
    // Deposit required, no risk — payment pending (owner contacts customer)
    bookingMode = "deposit_required";
    pendingOwnerReview = false;
  } else {
    bookingMode = "instant_confirm";
    pendingOwnerReview = false;
  }

  // When risk AND deposit both apply, risk wins for bookingMode (already set
  // above) but all deposit fields are still correctly populated so the owner
  // knows a deposit is also expected when they reach out.

  // ── 8. Customer-facing message type ──────────────────────────────────────
  // Risk details are NEVER disclosed to the customer.  Both pending_owner_review
  // and blocked_review show the same generic green confirmation screen.
  let customerMessageType: CustomerMessageType;
  if (bookingMode === "instant_confirm") {
    customerMessageType = "success";
  } else if (
    bookingMode === "pending_owner_review" ||
    bookingMode === "blocked_review"
  ) {
    customerMessageType = "pending_review";
  } else {
    // deposit_required
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
    depositPaid: false,
    paymentStatus,
    balanceDue,
    customerMessageType,
  };
}
