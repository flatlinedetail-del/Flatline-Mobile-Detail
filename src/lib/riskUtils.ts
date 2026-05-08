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
// Badge helpers
// ---------------------------------------------------------------------------

export function getRiskBadgeLabel(level: "low" | "medium" | "high" | null): string {
  if (!level) return "";
  return `${level.toUpperCase()} RISK`;
}

export type RiskBadgeVariant = "low" | "medium" | "high" | "none";

export function getRiskBadgeVariant(riskLevel: any): RiskBadgeVariant {
  const level = normalizeRiskLevel(riskLevel);
  if (level === "high") return "high";
  if (level === "medium") return "medium";
  if (level === "low") return "low";
  return "none";
}

/** Tailwind class string for risk badge backgrounds. */
export function getRiskBadgeClass(riskLevel: any): string {
  const variant = getRiskBadgeVariant(riskLevel);
  if (variant === "high") return "bg-red-500 text-white";
  if (variant === "medium") return "bg-orange-500 text-white";
  if (variant === "low") return "bg-yellow-400 text-black";
  return "";
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
