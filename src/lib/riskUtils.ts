/**
 * Shared risk-level and deposit-policy utilities.
 * All UI and save-payload logic should derive from these rather than duplicating locally.
 */

import type { Client, Service, BusinessSettings } from "../types";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Treat true / "true" / 1 / "1" as truthy — everything else is false. */
export function boolish(val: any): boolean {
  return val === true || val === "true" || val === 1 || val === "1";
}

/**
 * Normalize any risk value string/alias to a canonical level.
 * Handles: riskLevel, risk_level, riskStatus, clientRiskLevel, riskManagement.level,
 * and ProtectedClient protectionLevel strings ("Low", "Med", "High", "Block Booking").
 */
export function normalizeRiskLevel(val: any): "low" | "medium" | "high" | null {
  if (!val) return null;
  const s = String(val).toLowerCase().trim().replace(/[_\s-]+/g, " ");
  if (s === "low" || s === "normal") return "low";
  if (["medium", "med"].includes(s)) return "medium";
  if (["high", "critical", "do not book", "block booking"].includes(s)) return "high";
  return null;
}

// ---------------------------------------------------------------------------
// Risk-level policy predicates
// ---------------------------------------------------------------------------

export function riskRequiresDeposit(level: "low" | "medium" | "high" | null): boolean {
  return level === "medium" || level === "high";
}

export function riskRequiresApproval(level: "low" | "medium" | "high" | null): boolean {
  return level === "high";
}

export function riskBlocksBooking(level: "low" | "medium" | "high" | null): boolean {
  return level === "high";
}

// ---------------------------------------------------------------------------
// Full 6-level canonical risk (for display)
// ---------------------------------------------------------------------------

/**
 * Full canonical risk type used for badge display.
 * Keeps critical / do_not_book / block_booking distinct so the UI can
 * show the correct label and colour instead of collapsing everything to "high".
 *
 * Note: normalizeRiskLevel() (above) still collapses to 3 levels for deposit
 * policy — that's intentional and must not change.
 */
export type CanonicalRisk =
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "do_not_book"
  | "block_booking"
  | null;

/**
 * Normalize any raw value to the full 6-level CanonicalRisk.
 * Handles all known field spellings including ProtectedClient capitalized values.
 */
export function normalizeRiskFull(val: any): CanonicalRisk {
  if (!val) return null;
  const s = String(val).toLowerCase().trim().replace(/[_\s-]+/g, " ");
  if (s === "low" || s === "low risk" || s === "normal") return "low";
  if (s === "medium" || s === "med" || s === "medium risk") return "medium";
  if (s === "high" || s === "high risk") return "high";
  if (s === "critical") return "critical";
  if (s === "do not book" || s === "donotbook") return "do_not_book";
  if (s === "block booking" || s === "blockbooking") return "block_booking";
  return null;
}

/**
 * Read the risk value from a client object, checking all known field aliases,
 * then return the full 6-level CanonicalRisk.
 *
 * Priority order (most specific first):
 *   protectionLevel → riskManagement.level → protectedClient.protectionLevel
 *   → riskLevel → risk_level → riskStatus → clientRiskLevel
 */
export function getEffectiveRisk(client: any): CanonicalRisk {
  if (!client) return null;
  const raw =
    client.protectionLevel ??
    client.riskManagement?.level ??
    client.protectedClient?.protectionLevel ??
    client.riskLevel ??
    client.risk_level ??
    client.riskStatus ??
    client.clientRiskLevel;
  return normalizeRiskFull(raw);
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

/**
 * Human-readable badge label.
 * null → "No Risk Set" so a badge is always rendered on every client card.
 */
export function getRiskBadgeLabel(level: CanonicalRisk | any): string {
  const canonical = typeof level === "string" ? normalizeRiskFull(level) : level;
  switch (canonical) {
    case "low":          return "Low Risk";
    case "medium":       return "Medium Risk";
    case "high":         return "High Risk";
    case "critical":     return "Critical";
    case "do_not_book":  return "Do Not Book";
    case "block_booking":return "Block Booking";
    default:             return "No Risk Set";
  }
}

export type RiskBadgeVariant = "low" | "medium" | "high" | "none";

export function getRiskBadgeVariant(riskLevel: any): RiskBadgeVariant {
  const level = normalizeRiskLevel(riskLevel);
  if (level === "high") return "high";
  if (level === "medium") return "medium";
  if (level === "low") return "low";
  return "none";
}

/** Tailwind class string for risk badge backgrounds (supports all 6 canonical levels). */
export function getRiskBadgeClass(riskLevel: CanonicalRisk | any): string {
  const canonical = typeof riskLevel === "string" ? normalizeRiskFull(riskLevel) : riskLevel;
  switch (canonical) {
    case "block_booking":
    case "do_not_book":
      return "bg-red-900/40 text-red-400 border-red-500/30";
    case "critical":
      return "bg-red-700/30 text-red-400 border-red-600/30";
    case "high":
      return "bg-red-500/20 text-red-400 border-red-500/20";
    case "medium":
      return "bg-orange-500/20 text-orange-400 border-orange-500/20";
    case "low":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    default:
      // null / no-risk: subtle neutral — always visible but not alarming
      return "bg-white/5 text-white/40 border-white/10";
  }
}

// ---------------------------------------------------------------------------
// ProtectedClients bridge helpers
// ---------------------------------------------------------------------------

/**
 * Get badge label from a ProtectedClient protectionLevel string.
 * Delegates to getRiskBadgeLabel via normalizeRiskFull.
 */
export function getProtectionLevelLabel(level: string | null | undefined): string {
  return getRiskBadgeLabel(normalizeRiskFull(level));
}

/**
 * Get badge class from a ProtectedClient protectionLevel string.
 * Delegates to getRiskBadgeClass via normalizeRiskFull.
 */
export function getProtectionLevelBadgeClass(level: string | null | undefined): string {
  return getRiskBadgeClass(normalizeRiskFull(level));
}

// ---------------------------------------------------------------------------
// Client risk policy (combines client fields)
// ---------------------------------------------------------------------------

export interface ClientRiskPolicy {
  /** Canonical level derived from all field aliases. */
  level: "low" | "medium" | "high" | null;
  requiresDeposit: boolean;
  requiresApproval: boolean;
  blocksBooking: boolean;
}

/** Read risk from any known field alias on a client document. */
export function computeClientRiskPolicy(client: any): ClientRiskPolicy {
  const raw =
    client?.riskLevel ??
    client?.risk_level ??
    client?.riskStatus ??
    client?.clientRiskLevel ??
    client?.riskManagement?.level;
  const level = normalizeRiskLevel(raw);
  return {
    level,
    requiresDeposit: riskRequiresDeposit(level),
    requiresApproval: riskRequiresApproval(level),
    blocksBooking: riskBlocksBooking(level),
  };
}

// ---------------------------------------------------------------------------
// Deposit requirement computation
// ---------------------------------------------------------------------------

export interface DepositRequirement {
  required: boolean;
  amount: number;
  reasons: string[];
  /** Primary trigger: "risk" | "service" | "settings" | "mixed" | "none" */
  source: "risk" | "service" | "settings" | "mixed" | "none";
}

export interface ComputeDepositParams {
  client: any | null;
  selectedServices: { id: string; qty: number }[];
  services: any[];
  settings: any | null;
  bookingTotal: number;
}

export function computeDepositRequirement({
  client,
  selectedServices,
  services,
  settings,
  bookingTotal,
}: ComputeDepositParams): DepositRequirement {
  const riskPolicy = computeClientRiskPolicy(client);
  const reasons: string[] = [];
  let sources: string[] = [];

  // 1. Risk-based
  const riskTriggered = riskPolicy.requiresDeposit;
  if (riskTriggered) {
    reasons.push(`Client risk level: ${riskPolicy.level}`);
    sources.push("risk");
  }

  // 2. Service-based
  let serviceFixedTotal = 0;
  let serviceTriggered = false;
  for (const sel of selectedServices) {
    const svc = services.find((s: any) => s.id === sel.id);
    if (!svc) continue;
    const svcRequires =
      boolish(svc.depositRequired) ||
      boolish(svc.requireDeposit) ||
      boolish(svc.requiresDeposit);
    if (svcRequires) {
      serviceTriggered = true;
      if (svc.depositType === "fixed" && Number(svc.depositAmount) > 0) {
        serviceFixedTotal += Number(svc.depositAmount) * sel.qty;
      }
      reasons.push(`Service requires deposit: ${svc.name || svc.serviceName || svc.id}`);
    }
  }
  if (serviceTriggered) sources.push("service");

  // 3. Settings-based
  const settingsTriggered =
    boolish(settings?.depositRequired) ||
    boolish(settings?.requireDeposit) ||
    boolish(settings?.depositsEnabled);
  if (settingsTriggered) {
    reasons.push("Business settings require deposit");
    sources.push("settings");
  }

  const required = riskTriggered || serviceTriggered || settingsTriggered;

  if (!required) {
    return { required: false, amount: 0, reasons: [], source: "none" };
  }

  // Amount: prefer explicit service fixed amount, else 25% of total
  const amount = serviceFixedTotal > 0 ? serviceFixedTotal : bookingTotal * 0.25;

  const source =
    sources.length > 1
      ? "mixed"
      : (sources[0] as "risk" | "service" | "settings");

  return { required, amount, reasons, source };
}
