/**
 * publicBookingDepositEngine.ts — Public Booking Combined Deposit Engine
 *
 * Pure (no Firestore, no React, no I/O). The deposit engine is the single
 * authoritative source for whether a booking requires a deposit and how much.
 * It combines two independent sources:
 *
 *   1. Service-level deposits — read from the selected service docs via the
 *      shared `publicBookingDepositDetector` (which tolerates every field-name
 *      variant the codebase has used over time).
 *
 *   2. Risk-level deposits — derived from the risk engine's result. A
 *      protected_clients match at tier "review" or "block" always triggers a
 *      deposit (default 25% of grandTotal when no explicit value is
 *      configured). An explicit `requiredDepositValue > 0` wins over the
 *      default. A bare clients-collection `riskLevel` (no PC match) also
 *      triggers the 25% default as a fallback.
 *
 * Combination rule: if both sources are active, the engine takes the LARGER
 * required deposit (per the rebuild spec — sums create surprising customer
 * charges and are not a documented product rule). Both reason strings are
 * recorded so the audit trail is complete; `depositSource` becomes "mixed"
 * to indicate both rules fired.
 *
 * Output is guaranteed: never negative, capped at grandTotal, `depositPaid`
 * always literal `false`. The engine never collects or stores payment data.
 */

import {
  aggregateServiceDeposits,
  readProtectedClientDeposit,
  type DepositServiceLike,
} from "./publicBookingDepositDetector.js";
import type { RiskEngineResult } from "./publicBookingRiskEngine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DepositType = "fixed" | "percentage" | "mixed" | null;
export type DepositSource = "risk_rule" | "service" | "mixed" | "none";

export interface DepositEngineInput {
  /** Selected services already loaded by the caller (server-side or preview). */
  selectedServices: DepositServiceLike[];
  /** Output of `decideBookingRiskGate`. */
  risk: Pick<
    RiskEngineResult,
    "matchedProtectedClient" | "protectedTier" | "clientInherentRisk"
  >;
  /** Full customer-facing grand total — deposit percentages calculate off this. */
  grandTotal: number;
}

export interface DepositEngineResult {
  depositRequired: boolean;
  depositAmount: number;
  depositType: DepositType;
  depositSource: DepositSource;
  /**
   * Generic, audit-only strings. SAFE for public exposure — never include
   * raw risk-level wording. Examples:
   *   - "Service deposit: <service name>"
   *   - "Risk profile requires deposit"
   *   - "Client profile requires deposit"
   */
  depositReasons: string[];
  /** Always literal false — no payment is ever collected by the gate. */
  depositPaid: false;
  paymentStatus: "deposit_pending" | "unpaid";
  balanceDue: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface RiskDepositCandidate {
  required: boolean;
  amount: number;
  type: "fixed" | "percentage" | null;
  reasons: string[];
}

const NO_RISK_DEPOSIT: RiskDepositCandidate = {
  required: false,
  amount: 0,
  type: null,
  reasons: [],
};

const CLIENT_INHERENT_RISK_DEPOSIT_LEVELS = new Set(
  [
    "med", "medium", "high",
    "critical", "do not book", "block booking",
  ].map((s) => s.toLowerCase()),
);

const RISK_DEPOSIT_DEFAULT_PERCENT = 25;

const safe = (n: number): number =>
  typeof n === "number" && isFinite(n) && n > 0 ? n : 0;

/**
 * Derive the risk-side deposit candidate from the risk engine's output:
 *
 *   1. matched PC with explicit `requiredDepositValue > 0` → use that
 *   2. matched PC at tier "review"/"block" OR `depositRequired === true`
 *      → default 25% of grandTotal, type "percentage"
 *   3. matched PC at tier "low" with no explicit value → no risk deposit
 *      (Low risk is informational only)
 *   4. no PC match, but `client.riskLevel` is Med/High/Critical/Do Not Book
 *      → default 25% of grandTotal (fallback for legacy data)
 */
function computeRiskDepositCandidate(
  risk: DepositEngineInput["risk"],
  safeGrandTotal: number,
): RiskDepositCandidate {
  const pc = risk.matchedProtectedClient;

  if (pc) {
    const explicit = readProtectedClientDeposit(pc, safeGrandTotal);
    if (explicit.required) {
      return {
        required: true,
        amount: explicit.amount,
        type: explicit.type,
        reasons: ["Account requires advance review"],
      };
    }

    const flagOn = (pc as Record<string, unknown>).depositRequired === true;
    if (flagOn || risk.protectedTier === "review" || risk.protectedTier === "block") {
      return {
        required: true,
        amount: (safeGrandTotal * RISK_DEPOSIT_DEFAULT_PERCENT) / 100,
        type: "percentage",
        reasons: ["Risk profile requires deposit"],
      };
    }

    // Tier "low" with no explicit value — informational, no deposit.
    return NO_RISK_DEPOSIT;
  }

  // No PC match — fall back to clients-collection inherent risk.
  const inherent = risk.clientInherentRisk
    ? String(risk.clientInherentRisk).trim().toLowerCase()
    : "";
  if (inherent && CLIENT_INHERENT_RISK_DEPOSIT_LEVELS.has(inherent)) {
    return {
      required: true,
      amount: (safeGrandTotal * RISK_DEPOSIT_DEFAULT_PERCENT) / 100,
      type: "percentage",
      reasons: ["Client profile requires deposit"],
    };
  }

  return NO_RISK_DEPOSIT;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * Combine service-level and risk-level deposits into one final decision.
 *
 * Combination rule (when both apply):
 *   - take the LARGER required amount
 *   - record reasons from BOTH sources
 *   - depositSource = "mixed"
 *   - depositType from the winning side; if amounts tie, prefer the
 *     service type (fixed/percentage/mixed) because service rules are
 *     product-configured and more precise than the 25% default fallback
 */
export function decideBookingDeposit(
  input: DepositEngineInput,
): DepositEngineResult {
  const safeGrandTotal = Math.max(0, safe(input.grandTotal));

  // ── Service side ─────────────────────────────────────────────────────────
  const serviceAgg = aggregateServiceDeposits(
    input.selectedServices,
    safeGrandTotal,
  );

  // ── Risk side ────────────────────────────────────────────────────────────
  const riskCandidate = computeRiskDepositCandidate(input.risk, safeGrandTotal);

  // ── Combine ──────────────────────────────────────────────────────────────
  let depositRequired = false;
  let depositAmount = 0;
  let depositType: DepositType = null;
  let depositSource: DepositSource = "none";
  const depositReasons: string[] = [];

  if (!serviceAgg.required && !riskCandidate.required) {
    // No deposit from either side.
  } else if (serviceAgg.required && !riskCandidate.required) {
    depositRequired = true;
    depositAmount = serviceAgg.amount;
    depositType = serviceAgg.type;
    depositSource = "service";
    for (const r of serviceAgg.reasons) depositReasons.push(r);
  } else if (!serviceAgg.required && riskCandidate.required) {
    depositRequired = true;
    depositAmount = riskCandidate.amount;
    depositType = riskCandidate.type;
    depositSource = "risk_rule";
    for (const r of riskCandidate.reasons) depositReasons.push(r);
  } else {
    // Both fired — take the larger amount, but always record both reasons
    // and mark source as "mixed".
    depositRequired = true;
    if (serviceAgg.amount >= riskCandidate.amount) {
      depositAmount = serviceAgg.amount;
      depositType = serviceAgg.type;
    } else {
      depositAmount = riskCandidate.amount;
      depositType = riskCandidate.type;
    }
    depositSource = "mixed";
    for (const r of serviceAgg.reasons) depositReasons.push(r);
    for (const r of riskCandidate.reasons) depositReasons.push(r);
  }

  // Cap + clamp.
  depositAmount = Math.max(0, Math.min(depositAmount, safeGrandTotal));

  const paymentStatus: "deposit_pending" | "unpaid" = depositRequired
    ? "deposit_pending"
    : "unpaid";
  const balanceDue = depositRequired
    ? Math.max(0, safeGrandTotal - depositAmount)
    : safeGrandTotal;

  return {
    depositRequired,
    depositAmount,
    depositType: depositRequired ? depositType : null,
    depositSource,
    depositReasons,
    depositPaid: false,
    paymentStatus,
    balanceDue,
  };
}
