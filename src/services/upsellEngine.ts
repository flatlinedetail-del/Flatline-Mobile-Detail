/**
 * Centralized upsell engine — shared by desktop (ClientAIStrategy) and
 * mobile (FieldClientDetail AI tab, FieldBookingIntelligence, ActiveJob).
 *
 * RULES:
 * - Pure function: no network, no Firestore, no side effects.
 * - Data-driven: recommendations are derived from real service records,
 *   appointment history, vehicle data, and client profile.
 * - No hardcoded service names: the engine uses service IDs and categories.
 *   Service timing is delegated to serviceTimingEngine which uses the
 *   maintenanceIntervalDays / maintenanceIntervalMonths fields on Service.
 * - Respects: VIP pricing, price floors (pricingBySize/basePrice),
 *   deposit rules, risk gates, eligibility (isActive), outstanding balances.
 * - Note signals: integrates analyzeJobNotes for condition-based upsells.
 */

import { differenceInDays } from "date-fns";
import { Timestamp } from "firebase/firestore";
import type { Client, Appointment, Vehicle, Service, AddOn, Invoice } from "../types";
import { getEffectiveRisk } from "../lib/riskUtils";
import { generateServiceTimingIntelligence } from "./serviceTimingEngine";
import { analyzeJobNotes } from "../lib/noteAnalysis";

// ─── Public types ─────────────────────────────────────────────────────────────

export type UpsellType =
  | "timing"        // maintenance interval due/overdue (from serviceTimingEngine)
  | "upsell"        // service the client has never used
  | "maintenance"   // periodic check-in / overdue routine
  | "reactivation"  // win-back / at-risk retention
  | "package"       // membership / plan upgrade
  | "addon"         // add-on the client has never used
  | "condition";    // note-analysis condition signal

export type UpsellPriority = "critical" | "high" | "medium" | "low";

export interface UpsellRecommendation {
  id: string;
  title: string;
  reason: string;
  type: UpsellType;
  priority: UpsellPriority;
  /** 0–1 confidence in the recommendation relevance. */
  confidence: number;
  /** Estimated revenue impact if service is added (floor price). */
  estimatedPriceImpact?: number;
  /** Estimated time required in minutes. */
  estimatedTimeImpact?: number;
  /** Linked real service ID if applicable. */
  serviceId?: string;
  /** Linked real add-on ID if applicable. */
  addonId?: string;
  /** Specific vehicle this applies to, if any. */
  vehicleId?: string;
  vehicleName?: string;
  /** True = safe to mention to the client; false = internal-only intelligence. */
  isCustomerFacing: boolean;
  /** Human-readable description of what triggered this recommendation. */
  dataSource: string;
  /** Non-null when a risk or eligibility rule prevents acting on this. */
  blockedBy?: string;
}

export interface UpsellContext {
  client: Client;
  appointments: Appointment[];
  vehicles: Vehicle[];
  services: Service[];
  addons?: AddOn[];
  invoices?: Invoice[];
  /** Raw technician / client notes — fed through noteAnalysis for condition signals. */
  notes?: string;
}

// ─── Priority sort order ──────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<UpsellPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(val: any): Date | null {
  if (!val) return null;
  try {
    if (val instanceof Timestamp) return val.toDate();
    if (val?.toDate) return val.toDate();
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

/** Resolve the effective price for a service given the client's VIP settings and vehicle size. */
function resolvePrice(service: Service, client: Client, vehicle?: Vehicle): number {
  // Vehicle-level VIP override (most specific)
  if (vehicle && client.vipSettings?.vipVehiclePricing?.[vehicle.id]?.[service.id] != null) {
    return client.vipSettings.vipVehiclePricing![vehicle.id][service.id];
  }
  // Client-level VIP override
  if (client.vipSettings?.customServicePricing?.[service.id] != null) {
    return client.vipSettings.customServicePricing![service.id];
  }
  // Size-based floor price
  if (vehicle?.size && service.pricingBySize?.[vehicle.size]) {
    return service.pricingBySize[vehicle.size];
  }
  // Fallback to base price (always a floor, never below this)
  return service.basePrice || 0;
}

/** Select the primary vehicle from a list (largest = most valuable, then first). */
function primaryVehicle(vehicles: Vehicle[]): Vehicle | undefined {
  const sizeRank: Record<string, number> = { extra_large: 3, large: 2, medium: 1, small: 0 };
  return [...vehicles].sort((a, b) => (sizeRank[b.size] ?? 1) - (sizeRank[a.size] ?? 1))[0];
}

// ─── Main engine ──────────────────────────────────────────────────────────────

/**
 * Compute upsell recommendations for a client.
 *
 * Results are deterministic, sorted by priority then confidence,
 * and de-duplicated by ID. Blocking conditions (risk, outstanding balance)
 * are surfaced as `blockedBy` on each affected recommendation rather than
 * silently suppressing them — the caller decides how to render them.
 */
export function computeUpsells(ctx: UpsellContext): UpsellRecommendation[] {
  const {
    client,
    appointments,
    vehicles,
    services,
    addons = [],
    invoices = [],
    notes = "",
  } = ctx;

  const recs: UpsellRecommendation[] = [];

  // ── Risk gate ──────────────────────────────────────────────────────────────
  const risk = getEffectiveRisk(client);
  const isBlocked = risk === "block_booking" || risk === "do_not_book";
  const blockedBy = isBlocked ? "Account restricted — resolve risk flag before booking" : undefined;

  // ── Derived appointment data ───────────────────────────────────────────────
  const completedAppts = appointments.filter(
    (a) => a.status === "completed" || a.status === "paid",
  );
  const totalSpend = completedAppts.reduce((s, a) => s + (a.totalAmount || 0), 0);
  const avgSpend = completedAppts.length > 0 ? totalSpend / completedAppts.length : 0;

  let daysSinceLast = Infinity;
  let lastServiceDate: Date | null = null;
  if (completedAppts.length > 0) {
    lastServiceDate = toDate(completedAppts[0].scheduledAt);
    if (lastServiceDate) daysSinceLast = differenceInDays(new Date(), lastServiceDate);
  }

  let avgDaysBetween = 0;
  if (completedAppts.length > 1) {
    const first = toDate(completedAppts[completedAppts.length - 1].scheduledAt)?.getTime() ?? 0;
    const last = toDate(completedAppts[0].scheduledAt)?.getTime() ?? 0;
    if (first && last) {
      avgDaysBetween = Math.round((last - first) / (completedAppts.length - 1) / 86_400_000);
    }
  }

  // ── Service / add-on history ───────────────────────────────────────────────
  const activeServices = services.filter((s) => s.isActive);
  const activeAddons = addons.filter((a) => a.isActive);

  const performedServiceIds = new Set<string>();
  const performedServiceNames = new Set<string>();
  for (const appt of completedAppts) {
    (appt.serviceIds ?? []).forEach((id) => performedServiceIds.add(id));
    (appt.serviceNames ?? []).forEach((n) => performedServiceNames.add(n.toLowerCase()));
  }
  // Also cross-reference by name for services without IDs in old records
  for (const svc of activeServices) {
    if (performedServiceNames.has(svc.name.toLowerCase())) performedServiceIds.add(svc.id);
  }

  const usedAddonIds = new Set<string>();
  const usedAddonNames = new Set<string>();
  for (const appt of completedAppts) {
    const a = appt as any;
    (a.addonIds ?? a.addOnIds ?? []).forEach((id: string) => usedAddonIds.add(id));
    (a.addonNames ?? []).forEach((n: string) => usedAddonNames.add(n.toLowerCase()));
  }
  for (const addon of activeAddons) {
    if (usedAddonNames.has(addon.name.toLowerCase())) usedAddonIds.add(addon.id);
  }

  // ── Outstanding balance ────────────────────────────────────────────────────
  const outstandingTotal = invoices
    .filter((inv) => inv.status !== "paid" && inv.status !== "voided")
    .reduce((s, inv) => s + ((inv as any).total || 0), 0);

  // ── Primary vehicle ────────────────────────────────────────────────────────
  const primary = primaryVehicle(vehicles);

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 1: SERVICE TIMING INTELLIGENCE
  // Uses maintenanceIntervalDays/Months from real Service records.
  // Highest priority — these are schedule-based obligations.
  // ─────────────────────────────────────────────────────────────────────────
  if (vehicles.length > 0) {
    const timingOutputs = generateServiceTimingIntelligence(vehicles, appointments, activeServices);

    for (const t of timingOutputs) {
      if (t.dueStatus === "Current" || t.dueStatus === "Never Performed") continue;

      const svc = activeServices.find((s) => s.id === t.serviceId);
      const veh = vehicles.find((v) => v.id === t.vehicleId);
      const price = svc ? resolvePrice(svc, client, veh) : 0;

      const priority: UpsellPriority =
        t.dueStatus === "Overdue" ? "critical"
        : t.dueStatus === "Due" ? "high"
        : "medium";

      const daysSinceService = t.lastCompletedDate
        ? differenceInDays(new Date(), t.lastCompletedDate)
        : null;

      recs.push({
        id: `timing-${t.vehicleId}-${t.serviceId}`,
        title: t.serviceName,
        reason: `${t.vehicleName} — ${t.serviceName} is ${t.dueStatus.toLowerCase()}. ${
          daysSinceService != null
            ? `Last performed ${daysSinceService} days ago. `
            : ""
        }Recommended interval: ${t.intervalUsed}.`,
        type: "timing",
        priority,
        confidence: 0.95,
        estimatedPriceImpact: price > 0 ? price : undefined,
        estimatedTimeImpact: svc?.estimatedDuration,
        serviceId: t.serviceId,
        vehicleId: t.vehicleId,
        vehicleName: t.vehicleName,
        isCustomerFacing: true,
        dataSource: `Maintenance interval: ${t.intervalUsed}`,
        blockedBy,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 2: NOTE-BASED CONDITION SIGNALS
  // Analyzes client notes + job notes for damage/condition keywords.
  // Surfaces add-ons that match detected conditions.
  // ─────────────────────────────────────────────────────────────────────────
  const combinedNotes = [client.notes ?? "", notes].filter(Boolean).join(" ");
  if (combinedNotes.trim()) {
    const noteResult = analyzeJobNotes(combinedNotes);

    for (const suggestedName of noteResult.suggestedAddOns) {
      // Try to find a matching real add-on by name
      const matchedAddon = activeAddons.find(
        (a) => a.name.toLowerCase().includes(suggestedName.toLowerCase()) ||
               suggestedName.toLowerCase().includes(a.name.toLowerCase()),
      );
      if (matchedAddon && usedAddonIds.has(matchedAddon.id)) continue;

      recs.push({
        id: `condition-${suggestedName.replace(/\s+/g, "-").toLowerCase()}`,
        title: matchedAddon?.name ?? suggestedName,
        reason: `Condition detected in notes: ${noteResult.detectedConditions.join(", ") || suggestedName}. ${
          noteResult.explanation
        }`,
        type: "condition",
        priority: noteResult.manualReviewRecommended ? "critical" : "high",
        confidence: 0.85,
        estimatedPriceImpact: matchedAddon?.price ?? (noteResult.localPriceAdjustment > 0 ? noteResult.localPriceAdjustment : undefined),
        estimatedTimeImpact: matchedAddon?.estimatedDuration ?? (noteResult.estimatedExtraLaborHours * 60 || undefined),
        addonId: matchedAddon?.id,
        vehicleId: primary?.id,
        vehicleName: primary ? `${primary.year} ${primary.make} ${primary.model}` : undefined,
        isCustomerFacing: false,
        dataSource: `Note analysis: ${noteResult.detectedConditions.join(", ") || "condition detected"}`,
        blockedBy,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 3: HIGH-VALUE SERVICE GAPS
  // Active services the client has never used, sorted by floor price.
  // Capped at 4 to avoid noise. Only fires after ≥ 2 completed jobs.
  // ─────────────────────────────────────────────────────────────────────────
  if (completedAppts.length >= 2) {
    const neverPerformed = activeServices
      .filter((s) => {
        if (performedServiceIds.has(s.id)) return false;
        // Skip services with maintenance intervals — handled by timing engine
        if (s.maintenanceIntervalDays || s.maintenanceIntervalMonths) return false;
        return true;
      })
      .sort((a, b) => {
        const pa = resolvePrice(a, client, primary);
        const pb = resolvePrice(b, client, primary);
        return pb - pa;
      })
      .slice(0, 4);

    for (const svc of neverPerformed) {
      const price = resolvePrice(svc, client, primary);
      const clientFirst = client.firstName || client.name || "This client";

      recs.push({
        id: `gap-${svc.id}`,
        title: svc.name,
        reason: `${clientFirst} has completed ${completedAppts.length} services but has never booked ${svc.name}. ${
          svc.description ? svc.description.slice(0, 80) : "Untapped service opportunity."
        }`,
        type: "upsell",
        priority: "low",
        confidence: 0.5,
        estimatedPriceImpact: price > 0 ? price : undefined,
        estimatedTimeImpact: svc.estimatedDuration,
        serviceId: svc.id,
        vehicleId: primary?.id,
        vehicleName: primary ? `${primary.year} ${primary.make} ${primary.model}` : undefined,
        isCustomerFacing: false,
        dataSource: "Service gap analysis",
        blockedBy,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 4: ADD-ON GAPS
  // Active add-ons never used by this client. Capped at 3.
  // Only fires after ≥ 3 completed jobs.
  // ─────────────────────────────────────────────────────────────────────────
  if (completedAppts.length >= 3) {
    const unusedAddons = activeAddons
      .filter((a) => !usedAddonIds.has(a.id))
      .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
      .slice(0, 3);

    for (const addon of unusedAddons) {
      recs.push({
        id: `addon-${addon.id}`,
        title: addon.name,
        reason: `${addon.name} has not been added to any of this client's ${completedAppts.length} visits. ${
          addon.description ? addon.description.slice(0, 80) : ""
        }`,
        type: "addon",
        priority: "low",
        confidence: 0.4,
        estimatedPriceImpact: addon.price > 0 ? addon.price : undefined,
        estimatedTimeImpact: addon.estimatedDuration,
        addonId: addon.id,
        vehicleId: primary?.id,
        vehicleName: primary ? `${primary.year} ${primary.make} ${primary.model}` : undefined,
        isCustomerFacing: false,
        dataSource: "Add-on gap analysis",
        blockedBy,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 5: VIP UPGRADE
  // Frequent clients who are not yet VIP. Fires at > 3 completed visits.
  // ─────────────────────────────────────────────────────────────────────────
  if (completedAppts.length > 3 && !client.isVIP && !client.isOneTime) {
    recs.push({
      id: "vip-upgrade",
      title: "VIP Membership Upgrade",
      reason: `Client has completed ${completedAppts.length} services (avg ${fmtCurrency(avgSpend)}/visit). Converting to VIP secures retention and recurring revenue.`,
      type: "package",
      priority: completedAppts.length >= 6 ? "high" : "medium",
      confidence: 0.75,
      isCustomerFacing: true,
      dataSource: `${completedAppts.length} completed visits`,
      blockedBy,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 6: MAINTENANCE PLAN / MEMBERSHIP
  // High-frequency clients without gold/platinum membership.
  // ─────────────────────────────────────────────────────────────────────────
  const highFreq = avgDaysBetween > 0 && avgDaysBetween <= 45;
  const notPremiumMember = !["gold", "platinum"].includes(client.membershipLevel ?? "");
  if (highFreq && notPremiumMember && completedAppts.length >= 3) {
    recs.push({
      id: "maintenance-plan",
      title: "Monthly Maintenance Plan",
      reason: `Client returns every ~${avgDaysBetween} days — qualifying frequency for a committed maintenance subscription. Locks in recurring revenue and prioritizes their schedule.`,
      type: "package",
      priority: "high",
      confidence: 0.85,
      isCustomerFacing: true,
      dataSource: `Avg visit interval: ${avgDaysBetween} days`,
      blockedBy,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 7: REACTIVATION / RETENTION
  // Thresholds: 1.5× average interval → reactivation; 1.25× → at-risk.
  // Fallback thresholds when no history: 120d / 60d.
  // ─────────────────────────────────────────────────────────────────────────
  if (completedAppts.length > 0) {
    const reactivationThreshold = avgDaysBetween > 0 ? Math.round(avgDaysBetween * 1.5) : 120;
    const atRiskThreshold      = avgDaysBetween > 0 ? Math.round(avgDaysBetween * 1.25) : 60;

    if (daysSinceLast > reactivationThreshold) {
      recs.push({
        id: "reactivation",
        title: "Win-Back Campaign",
        reason: `Client hasn't booked in ${Math.round(daysSinceLast)} days (threshold: ${reactivationThreshold}d based on their ${avgDaysBetween || "N/A"}d avg interval). Personalized re-engagement offer recommended.`,
        type: "reactivation",
        priority: "critical",
        confidence: 0.9,
        isCustomerFacing: false,
        dataSource: `${Math.round(daysSinceLast)} days since last service`,
        blockedBy,
      });
    } else if (daysSinceLast > atRiskThreshold) {
      recs.push({
        id: "at-risk",
        title: "Retention Follow-Up",
        reason: `${Math.round(daysSinceLast)} days since last service — above their typical ${avgDaysBetween || 60}d cadence. A quick check-in prevents churn.`,
        type: "reactivation",
        priority: "high",
        confidence: 0.7,
        isCustomerFacing: false,
        dataSource: `${Math.round(daysSinceLast)} days since last service`,
        blockedBy,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 8: CERAMIC MAINTENANCE OVERDUE
  // If ceramic was performed > 180 days ago, maintenance wash is due.
  // Uses service name substring match only as a fallback when service IDs
  // aren't available — the timing engine handles this more precisely when
  // the ceramic service has a maintenanceInterval configured.
  // ─────────────────────────────────────────────────────────────────────────
  const ceramicAppts = completedAppts.filter(
    (a) => a.serviceNames?.some((n) => /ceramic/i.test(n)),
  );
  if (ceramicAppts.length > 0) {
    const lastCeramic = toDate(ceramicAppts[0].scheduledAt);
    if (lastCeramic) {
      const daysSinceCeramic = differenceInDays(new Date(), lastCeramic);
      // Only add if the timing engine didn't already cover this service
      const alreadyCoveredByCeramic = recs.some((r) =>
        r.type === "timing" && r.reason.toLowerCase().includes("ceramic"),
      );
      if (daysSinceCeramic > 180 && !alreadyCoveredByCeramic) {
        recs.push({
          id: "ceramic-maintenance",
          title: "Ceramic Maintenance Wash",
          reason: `It's been ${daysSinceCeramic} days since the last ceramic service. A maintenance wash preserves the hydrophobic properties${
            ceramicAppts[0].serviceNames?.some((n) => /warrant/i.test(n)) ? " and warranty coverage" : ""
          }.`,
          type: "maintenance",
          priority: daysSinceCeramic > 270 ? "critical" : "high",
          confidence: 0.9,
          isCustomerFacing: true,
          dataSource: `Ceramic applied ${daysSinceCeramic} days ago`,
          blockedBy,
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 9: OUTSTANDING BALANCE FLAG
  // Internal alert only — not an upsell, but must appear before others.
  // ─────────────────────────────────────────────────────────────────────────
  if (outstandingTotal > 0) {
    recs.push({
      id: "outstanding-balance",
      title: "Outstanding Balance",
      reason: `Client has ${fmtCurrency(outstandingTotal)} in unpaid invoices. Collect balance before discussing additional services.`,
      type: "maintenance",
      priority: "critical",
      confidence: 1.0,
      estimatedPriceImpact: outstandingTotal,
      isCustomerFacing: false,
      dataSource: "Unpaid invoices",
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 10: DEPOSIT REQUIREMENT FLAG
  // Flag when risk level or protected client match requires a deposit.
  // ─────────────────────────────────────────────────────────────────────────
  const needsDeposit = risk === "medium" || risk === "high" || risk === "critical" || isBlocked;
  const hasOutstandingFee = (client.outstandingCancellationFee ?? 0) > 0;
  if (needsDeposit || hasOutstandingFee) {
    recs.push({
      id: "deposit-required",
      title: "Deposit Required",
      reason: [
        needsDeposit ? `Client risk level (${risk}) requires a deposit before booking.` : "",
        hasOutstandingFee ? `Outstanding cancellation fee: ${fmtCurrency(client.outstandingCancellationFee!)}.` : "",
      ].filter(Boolean).join(" "),
      type: "maintenance",
      priority: isBlocked ? "critical" : "high",
      confidence: 1.0,
      estimatedPriceImpact: client.outstandingCancellationFee ?? undefined,
      isCustomerFacing: false,
      dataSource: "Risk & deposit policy",
    });
  }

  // ── De-duplicate, sort, return ─────────────────────────────────────────────
  const seen = new Set<string>();
  return recs
    .filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    })
    .sort((a, b) => {
      const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (pd !== 0) return pd;
      return b.confidence - a.confidence;
    });
}

// ─── Legacy type adapter (for ClientAIStrategy compatibility) ─────────────────

/**
 * Maps the engine's extended type set to the three-value type that
 * ClientAIStrategy has always rendered. Import this alongside computeUpsells
 * in desktop components that consume the legacy shape.
 */
export function toLegacyType(
  type: UpsellType,
): "maintenance" | "upsell" | "reactivation" {
  switch (type) {
    case "timing":
    case "maintenance":
    case "condition":
      return "maintenance";
    case "reactivation":
      return "reactivation";
    default:
      return "upsell";
  }
}

// ─── Derived analytics (shared by Overview and AI tabs) ───────────────────────

export interface ClientAnalytics {
  totalSpend: number;
  avgSpend: number;
  completedCount: number;
  daysSinceLast: number;
  avgDaysBetween: number;
  retentionStatus: "active" | "at_risk" | "inactive";
  projectedMonthly: number | null;
  projectedAnnual: number | null;
  topServices: string[];
}

export function computeClientAnalytics(
  appointments: Appointment[],
): ClientAnalytics {
  const completed = appointments.filter(
    (a) => a.status === "completed" || a.status === "paid",
  );
  const totalSpend = completed.reduce((s, a) => s + (a.totalAmount || 0), 0);
  const avgSpend = completed.length > 0 ? totalSpend / completed.length : 0;

  let daysSinceLast = Infinity;
  if (completed.length > 0) {
    const d = toDate(completed[0].scheduledAt);
    if (d) daysSinceLast = differenceInDays(new Date(), d);
  }

  let avgDaysBetween = 0;
  if (completed.length > 1) {
    const first = toDate(completed[completed.length - 1].scheduledAt)?.getTime() ?? 0;
    const last = toDate(completed[0].scheduledAt)?.getTime() ?? 0;
    if (first && last) {
      avgDaysBetween = Math.round((last - first) / (completed.length - 1) / 86_400_000);
    }
  }

  const reactivationThreshold = avgDaysBetween > 0 ? Math.round(avgDaysBetween * 1.5) : 120;
  const atRiskThreshold      = avgDaysBetween > 0 ? Math.round(avgDaysBetween * 1.25) : 60;

  const retentionStatus: "active" | "at_risk" | "inactive" =
    daysSinceLast > reactivationThreshold ? "inactive"
    : daysSinceLast > atRiskThreshold ? "at_risk"
    : "active";

  const projectedMonthly =
    avgDaysBetween > 0 ? (avgSpend / avgDaysBetween) * 30 : null;
  const projectedAnnual = projectedMonthly ? projectedMonthly * 12 : null;

  // Top 3 services by frequency
  const counts: Record<string, number> = {};
  for (const a of completed) {
    for (const n of a.serviceNames ?? []) {
      counts[n] = (counts[n] || 0) + 1;
    }
  }
  const topServices = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([n]) => n);

  return {
    totalSpend,
    avgSpend,
    completedCount: completed.length,
    daysSinceLast,
    avgDaysBetween,
    retentionStatus,
    projectedMonthly,
    projectedAnnual,
    topServices,
  };
}
