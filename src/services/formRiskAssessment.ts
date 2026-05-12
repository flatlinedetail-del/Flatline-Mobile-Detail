/**
 * FormsStudio Smart Protection — deterministic risk assessment.
 *
 * Pure function. No Firestore, no LLM, no side effects, no React.
 *
 * Given an appointment + related client/vehicle/service context and the
 * set of active form templates, produces:
 *   • a risk level ("low" | "medium" | "high")
 *   • a human-readable list of reasons that drove the level
 *   • the ids of active templates that look relevant
 *   • a flag indicating no active template adequately covers the dominant
 *     risk (so the UI can suggest generating a custom protection form)
 *   • a list of clause-key hints for downstream initials placement
 */

import type {
  Appointment,
  Client,
  Vehicle,
  Service,
  AddOn,
  BusinessSettings,
} from "../types";
import type { StudioFormTemplate } from "../types/waiver";

// ─── Public types ──────────────────────────────────────────────────────────

export interface RiskContext {
  appointment: Appointment;
  client?: Client;
  vehicles?: Vehicle[];
  services: Service[];
  addons: AddOn[];
  templates: StudioFormTemplate[];
  businessSettings?: BusinessSettings;
}

export interface RiskAssessment {
  level: "low" | "medium" | "high";
  reasons: string[];
  recommendedTemplateIds: string[];
  generateCustomSuggestion: boolean;
  initialsRecommendedClauseKeys: string[];
}

// ─── Risk axes (heuristic keyword matchers on names / ids) ─────────────────
//
// Conservative deterministic rules. The point is to detect the *dominant
// risk axis* of a job, not to be exhaustive. Tuning the price thresholds
// and the keyword lists is a follow-up tuning task once we have data.

const SERVICE_KEYWORDS = {
  ceramic:        /\bcerami\w*|coating/i,
  paintCorrection:/\b(paint\s*correction|correction|polish(?:ing)?|compounding)\b/i,
  extraction:     /\b(extraction|shampoo|deep\s*clean|interior\s*detail)\b/i,
  stainOrOdor:    /\b(stain|odor|smell|odour)\b/i,
};

const ADDON_KEYWORDS = {
  biohazard:      /\b(bio|biohazard|vomit|urine|feces|blood|mold|mildew)\b/i,
  petHair:        /\bpet\s*hair\b/i,
  headliner:      /\bheadliner\b/i,
  odorInterior:   /\b(odor|odour|smell)\b/i,
};

// Price thresholds. Configurable via BusinessSettings later; sensible defaults now.
const MEDIUM_PRICE_THRESHOLD = 300;
const HIGH_PRICE_THRESHOLD   = 750;

const RISK_LEVELS = { low: 0, medium: 1, high: 2 } as const;
type Level = keyof typeof RISK_LEVELS;

function maxLevel(a: Level, b: Level): Level {
  return RISK_LEVELS[a] >= RISK_LEVELS[b] ? a : b;
}

// ─── Main assessment ───────────────────────────────────────────────────────

export function assessFormProtection(ctx: RiskContext): RiskAssessment {
  let level: Level = "low";
  const reasons: string[] = [];
  const initialsClauseKeys = new Set<string>();
  const dominantAxes = new Set<string>();

  const { appointment, client, services, addons, templates } = ctx;

  // ── Service-driven risk ──────────────────────────────────────────────────
  const serviceNames = collectNames(appointment.serviceIds, appointment.serviceNames, services);
  for (const name of serviceNames) {
    if (SERVICE_KEYWORDS.ceramic.test(name)) {
      level = maxLevel(level, "high");
      reasons.push("Job includes ceramic coating");
      dominantAxes.add("ceramic");
      initialsClauseKeys.add("ceramicCoating");
      initialsClauseKeys.add("preExistingDamage");
    }
    if (SERVICE_KEYWORDS.paintCorrection.test(name)) {
      level = maxLevel(level, "high");
      reasons.push("Job includes paint correction");
      dominantAxes.add("paintCorrection");
      initialsClauseKeys.add("paintCorrection");
      initialsClauseKeys.add("preExistingDamage");
    }
    if (SERVICE_KEYWORDS.extraction.test(name)) {
      level = maxLevel(level, "medium");
      reasons.push("Job includes interior extraction");
      dominantAxes.add("interior");
      initialsClauseKeys.add("odorStain");
    }
    if (SERVICE_KEYWORDS.stainOrOdor.test(name)) {
      level = maxLevel(level, "medium");
      reasons.push("Job involves stain or odor work");
      dominantAxes.add("interior");
      initialsClauseKeys.add("odorStain");
    }
  }

  // ── Add-on-driven risk ───────────────────────────────────────────────────
  const addonNames = collectNames(appointment.addOnIds, appointment.addOnNames, addons);
  for (const name of addonNames) {
    if (ADDON_KEYWORDS.biohazard.test(name)) {
      level = maxLevel(level, "high");
      reasons.push("Add-on involves biohazard / contamination work");
      dominantAxes.add("biohazard");
      initialsClauseKeys.add("biohazard");
    }
    if (ADDON_KEYWORDS.petHair.test(name)) {
      level = maxLevel(level, "medium");
      reasons.push("Add-on includes pet hair removal");
      dominantAxes.add("interior");
      initialsClauseKeys.add("petHair");
    }
    if (ADDON_KEYWORDS.headliner.test(name)) {
      level = maxLevel(level, "medium");
      reasons.push("Add-on includes headliner work");
      dominantAxes.add("interior");
    }
    if (ADDON_KEYWORDS.odorInterior.test(name)) {
      level = maxLevel(level, "medium");
      reasons.push("Add-on targets odor removal");
      dominantAxes.add("interior");
      initialsClauseKeys.add("odorStain");
    }
  }

  // ── Price-driven risk ────────────────────────────────────────────────────
  const total = totalAmount(appointment);
  if (total >= HIGH_PRICE_THRESHOLD) {
    level = maxLevel(level, "high");
    reasons.push(`Job total $${total.toFixed(0)} exceeds high-value threshold ($${HIGH_PRICE_THRESHOLD})`);
    dominantAxes.add("payment");
    initialsClauseKeys.add("paymentTerms");
  } else if (total >= MEDIUM_PRICE_THRESHOLD) {
    level = maxLevel(level, "medium");
    reasons.push(`Job total $${total.toFixed(0)} exceeds standard threshold ($${MEDIUM_PRICE_THRESHOLD})`);
    initialsClauseKeys.add("paymentTerms");
  }

  // ── Client-driven risk ───────────────────────────────────────────────────
  const clientRisk = client?.riskLevel ?? (appointment as any).clientRiskLevelAtBooking ?? null;
  if (clientRisk === "high") {
    level = maxLevel(level, "high");
    reasons.push("Customer is flagged as high-risk");
    initialsClauseKeys.add("preExistingDamage");
  } else if (clientRisk === "medium") {
    level = maxLevel(level, "medium");
    reasons.push("Customer is flagged as medium-risk");
  }

  if ((client?.outstandingCancellationFee ?? 0) > 0) {
    level = maxLevel(level, "medium");
    reasons.push("Customer has an outstanding cancellation fee");
    dominantAxes.add("payment");
    initialsClauseKeys.add("paymentTerms");
  }

  // ── Payment-state risk ───────────────────────────────────────────────────
  // Unpaid deposit on a meaningful balance is a payment-protection signal.
  const balance = total - (appointment.depositAmount ?? 0);
  if (
    appointment.depositRequired
    && !appointment.depositPaid
    && balance >= MEDIUM_PRICE_THRESHOLD
  ) {
    level = maxLevel(level, "medium");
    reasons.push("Required deposit not yet paid on a meaningful balance");
    dominantAxes.add("payment");
    initialsClauseKeys.add("paymentTerms");
  }

  // ── Pre-existing condition signals ───────────────────────────────────────
  const notes = [
    appointment.customerNotes,
    appointment.internalNotes,
  ].filter(Boolean).join(" ");
  if (/\b(damage|scratch|dent|chip|swirl|oxid|stain|odor|odour|rust|bondo|repaint)\b/i.test(notes)) {
    level = maxLevel(level, "medium");
    reasons.push("Notes mention pre-existing condition");
    initialsClauseKeys.add("preExistingDamage");
  }
  if ((appointment.photos?.damage?.length ?? 0) > 0) {
    level = maxLevel(level, "medium");
    reasons.push("Damage photos are attached to the appointment");
    initialsClauseKeys.add("preExistingDamage");
  }

  // ── Template recommendation ──────────────────────────────────────────────
  const recommendedTemplateIds = pickRecommendedTemplates({
    templates,
    serviceIds: appointment.serviceIds ?? [],
    addOnIds: appointment.addOnIds ?? [],
    clientRiskLevel: clientRisk,
    totalPrice: total,
    dominantAxes,
  });

  // If we flagged high or medium risk but the active template set doesn't
  // cover the dominant axis (e.g. ceramic-coating job but no Ceramic
  // Coating Agreement template active), the UI can offer "Generate Custom
  // Protection Form" as the next step.
  const coversDominant = dominantAxes.size === 0
    || hasTemplateForAxis(templates, recommendedTemplateIds, dominantAxes);
  const generateCustomSuggestion = level !== "low" && !coversDominant;

  return {
    level,
    reasons: dedupe(reasons),
    recommendedTemplateIds,
    generateCustomSuggestion,
    initialsRecommendedClauseKeys: Array.from(initialsClauseKeys),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function collectNames(
  ids: string[] | undefined,
  names: string[] | undefined,
  lookup: { id: string; name: string }[],
): string[] {
  const out: string[] = [];
  if (Array.isArray(names)) out.push(...names);
  if (Array.isArray(ids)) {
    for (const id of ids) {
      const found = lookup.find(item => item.id === id);
      if (found?.name) out.push(found.name);
    }
  }
  return out;
}

function totalAmount(a: Appointment): number {
  // Appointment has a typed totalAmount field; fall back defensively.
  const t = (a as any).totalAmount ?? (a as any).totalPrice ?? (a as any).price ?? 0;
  return typeof t === "number" && Number.isFinite(t) ? t : 0;
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// ─── Template matching ─────────────────────────────────────────────────────

interface PickArgs {
  templates: StudioFormTemplate[];
  serviceIds: string[];
  addOnIds: string[];
  clientRiskLevel: string | null;
  totalPrice: number;
  dominantAxes: Set<string>;
}

function pickRecommendedTemplates(args: PickArgs): string[] {
  const ids = new Set<string>();
  for (const t of args.templates) {
    if (t.isActive === false || (t.status && t.status !== "active")) continue;

    if (t.assignedServices?.some(id => args.serviceIds.includes(id))) {
      ids.add(t.id);
    }
    if (t.assignedAddons?.some(id => args.addOnIds.includes(id))) {
      ids.add(t.id);
    }
    if (
      args.clientRiskLevel
      && t.riskTriggers?.includes(args.clientRiskLevel)
    ) {
      ids.add(t.id);
    }
    if (t.priceThreshold != null && args.totalPrice >= t.priceThreshold) {
      ids.add(t.id);
    }

    // Axis hint: dominant axis (e.g. "ceramic", "paintCorrection") matched
    // against template title for templates without explicit service/addon
    // assignments. Lets a freshly-created Ceramic Coating Agreement that
    // hasn't been wired to a specific service still surface here.
    const title = (t.title ?? "").toLowerCase();
    for (const axis of args.dominantAxes) {
      if (axisMatchesTitle(axis, title)) ids.add(t.id);
    }
  }
  return Array.from(ids);
}

function axisMatchesTitle(axis: string, title: string): boolean {
  switch (axis) {
    case "ceramic":         return /cerami|coating/.test(title);
    case "paintCorrection": return /paint|correction|polish/.test(title);
    case "interior":        return /interior|stain|odor|odour|pet/.test(title);
    case "biohazard":       return /bio|hazard|mold|mildew/.test(title);
    case "payment":         return /payment|late\s*fee|deposit|cancel/.test(title);
    default:                return false;
  }
}

function hasTemplateForAxis(
  templates: StudioFormTemplate[],
  recommendedIds: string[],
  axes: Set<string>,
): boolean {
  if (axes.size === 0) return true;
  const recs = templates.filter(t => recommendedIds.includes(t.id));
  for (const axis of axes) {
    const covered = recs.some(t => axisMatchesTitle(axis, (t.title ?? "").toLowerCase()));
    if (!covered) return false;
  }
  return true;
}
