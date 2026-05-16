/**
 * Public Booking — centralized deposit detector.
 *
 * Pure (no Firestore, no React). Shared by:
 *   - `onlineBookingGateCore.ts` (server gate, admin SDK reads)
 *   - `PublicBooking.tsx` (client preview before submit)
 *
 * Handles every field-name variant we have observed across schema iterations
 * so a real-world service doc using any of the historical names still triggers
 * the correct deposit. Without this, services configured under an old name
 * silently fall through to "no deposit required" and instant-confirm.
 *
 * Recognised flag fields (any truthy ⇒ deposit required):
 *   depositRequired | requireDeposit | requiresDeposit
 *
 * Recognised amount fields (first non-zero wins):
 *   depositAmount | depositValue | requiredDepositAmount |
 *   depositPercentage | depositPercent
 *
 * Type inference order:
 *   1. explicit `depositType` ("fixed" | "percentage")
 *   2. percent-named field present  ⇒ "percentage"
 *   3. default                       ⇒ "fixed"
 */

import type { Service } from "../types";

/** Minimal shape — accepts any field-name variant we have seen. */
export type DepositServiceLike = Partial<Service> & {
  id?: string;
  name?: string;
  basePrice?: number;

  // ── Flag variants ────────────────────────────────────────────────────────
  depositRequired?: boolean;
  requireDeposit?: boolean;
  requiresDeposit?: boolean;

  // ── Amount variants ──────────────────────────────────────────────────────
  depositAmount?: number;
  depositValue?: number;
  requiredDepositAmount?: number;
  depositPercentage?: number;
  depositPercent?: number;

  // ── Type ─────────────────────────────────────────────────────────────────
  depositType?: "fixed" | "percentage" | string;
};

/** Per-service deposit reading. Pure. */
export interface ServiceDepositReading {
  requires: boolean;
  /** Absolute dollars this service contributes to the booking deposit. */
  amount: number;
  type: "fixed" | "percentage" | null;
  /** Raw configured value (for audit/debug). */
  rawValue: number;
  label: string;
}

const num = (v: unknown): number =>
  typeof v === "number" && isFinite(v) && v >= 0 ? v : 0;

/**
 * Read a single service's deposit configuration, normalising all known
 * field-name variants into a single shape and converting percentage values
 * to absolute dollars against the service's basePrice.
 */
export function readServiceDeposit(svc: DepositServiceLike): ServiceDepositReading {
  const requires = Boolean(
    svc.depositRequired || svc.requireDeposit || svc.requiresDeposit,
  );

  const label = `Service deposit: ${svc.name ?? svc.id ?? "service"}`;

  if (!requires) {
    return { requires: false, amount: 0, type: null, rawValue: 0, label };
  }

  // First non-zero amount field wins. Percent-named fields force percentage.
  const explicitType = svc.depositType === "percentage" || svc.depositType === "fixed"
    ? svc.depositType
    : null;

  let rawValue = 0;
  let type: "fixed" | "percentage" = explicitType ?? "fixed";

  const depositPercent = num(svc.depositPercentage) || num(svc.depositPercent);
  const depositAmount = num(svc.depositAmount);
  const depositValue = num(svc.depositValue);
  const requiredDeposit = num(svc.requiredDepositAmount);

  if (depositPercent > 0) {
    rawValue = depositPercent;
    type = "percentage"; // field name is authoritative
  } else if (depositAmount > 0) {
    rawValue = depositAmount;
    // honour explicitType; default "fixed"
  } else if (depositValue > 0) {
    rawValue = depositValue;
    // honour explicitType; default "fixed"
  } else if (requiredDeposit > 0) {
    rawValue = requiredDeposit;
    // honour explicitType; default "fixed"
  }

  // Convert to absolute dollars
  const basePrice = num(svc.basePrice);
  const amount =
    type === "percentage" ? (basePrice * rawValue) / 100 : rawValue;

  return {
    requires: rawValue > 0,
    amount: Math.max(0, amount),
    type: rawValue > 0 ? type : null,
    rawValue,
    label,
  };
}

/** Aggregated service-level deposit decision across the selected services. */
export interface AggregatedServiceDeposit {
  required: boolean;
  amount: number;
  type: "fixed" | "percentage" | "mixed" | null;
  reasons: string[];
}

/**
 * Aggregate per-service deposit readings into the booking-level deposit
 * decision. `mixed` is returned when the selected services use different
 * deposit types (e.g. one fixed + one percentage).
 */
export function aggregateServiceDeposits(
  services: DepositServiceLike[],
  cap: number,
): AggregatedServiceDeposit {
  let amount = 0;
  let required = false;
  const reasons: string[] = [];
  const seenTypes = new Set<"fixed" | "percentage">();

  for (const svc of services) {
    const reading = readServiceDeposit(svc);
    if (!reading.requires) continue;
    required = true;
    amount += reading.amount;
    if (reading.type) seenTypes.add(reading.type);
    reasons.push(reading.label);
  }

  let type: "fixed" | "percentage" | "mixed" | null = null;
  if (seenTypes.size === 1) {
    type = seenTypes.values().next().value as "fixed" | "percentage";
  } else if (seenTypes.size > 1) {
    type = "mixed";
  }

  const safeCap = num(cap);
  const capped = safeCap > 0 ? Math.min(amount, safeCap) : amount;

  return {
    required,
    amount: Math.max(0, capped),
    type: required ? type : null,
    reasons,
  };
}

/**
 * Risk-rule deposit reading from a protected_clients doc. Field names mirror
 * the existing protected_clients schema:
 *   requiredDepositValue + requiredDepositType ("fixed" | "percentage")
 */
export interface ProtectedClientLike {
  requiredDepositValue?: number;
  requiredDepositType?: string;
}

export interface RiskDepositReading {
  required: boolean;
  amount: number;
  type: "fixed" | "percentage" | null;
}

/** Apply a protected-client deposit rule against the booking grandTotal. */
export function readProtectedClientDeposit(
  pc: ProtectedClientLike,
  grandTotal: number,
): RiskDepositReading {
  const rawValue = num(pc.requiredDepositValue);
  if (rawValue <= 0) return { required: false, amount: 0, type: null };

  const type: "fixed" | "percentage" =
    pc.requiredDepositType === "percentage" ? "percentage" : "fixed";
  const safeTotal = num(grandTotal);
  const amount =
    type === "percentage" ? (safeTotal * rawValue) / 100 : rawValue;

  return { required: true, amount: Math.max(0, amount), type };
}
