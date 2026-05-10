/**
 * Deterministic note analysis for Smart Quote.
 *
 * Pure (no network, no Firestore). Runs locally BEFORE the AI call so that:
 *   1. The benchmark fallback reflects job complexity even if AI times out.
 *   2. The AI prompt receives a structured signal so Gemini cannot ignore
 *      obvious conditions like water damage, mold, seat removal, etc.
 *   3. The Market Analysis UI can show the user *why* the price moved.
 *
 * This is ADDITIVE on top of existing keyword multipliers in Quotes.tsx.
 * It detects the high-impact conditions that the existing system misses
 * (water damage, seat removal, paint decon, multi-year coating) and adds
 * an explicit dollar amount + extra labor hours rather than a multiplier.
 */

export interface NoteAnalysis {
  /** Human-readable condition labels detected from the notes. */
  detectedConditions: string[];
  /** Technician-facing operations needed to complete the work. */
  requiredOperations: string[];
  /** Suggested add-ons the quote should consider including. */
  suggestedAddOns: string[];
  /** Risk flag identifiers (e.g. "water_damage", "mold", "biohazard"). */
  riskFlags: string[];
  /** Approximate extra labor hours beyond the base service. */
  estimatedExtraLaborHours: number;
  /** Dollar amount to add to benchmark pricing for this job's conditions. */
  localPriceAdjustment: number;
  /** True when several severe conditions stack — recommend human review. */
  manualReviewRecommended: boolean;
  /** One-line explanation suitable for the Market Analysis panel. */
  explanation: string;
}

interface ConditionRule {
  id: string;
  patterns: RegExp[];
  label: string;
  operations: string[];
  addOns: string[];
  riskFlags?: string[];
  hours: number;
  adjustment: number;
  /** Severe conditions count toward the manual-review threshold. */
  severe?: boolean;
}

/**
 * Pattern set. Order matters only for display; detection is independent
 * (a single note can trigger multiple rules).
 *
 * Tuning rationale for adjustment values: based on field labour at $95/hr
 * (existing baseMarketHourlyRate in Quotes.tsx). Each rule's adjustment is
 * roughly hours × 75 (slight discount because the additive layer composes
 * with the existing recommendations multipliers).
 */
const RULES: ConditionRule[] = [
  {
    id: "water_damage",
    patterns: [
      /\bwater\s+damage\b/i,
      /\bwater\s+intrusion\b/i,
      /\bflood(?:ed|ing)?\b/i,
      /\bsubmerged\b/i,
      /\bsoaked\b/i,
    ],
    label: "Water Damage",
    operations: [
      "Wet extraction",
      "Dry-out & dehumidify",
      "Mildew prevention treatment",
      "Odor remediation",
    ],
    addOns: ["Water Damage Cleanup", "Ozone Treatment"],
    riskFlags: ["water_damage"],
    hours: 4,
    adjustment: 300,
    severe: true,
  },
  {
    id: "mold",
    patterns: [
      /\bmold\b/i,
      /\bmildew\b/i,
      /\bremediation\b/i,
    ],
    label: "Mold / Mildew Remediation",
    operations: [
      "Mold remediation",
      "Antimicrobial treatment",
      "Disposal of contaminated materials",
      "Air-quality verification",
    ],
    addOns: ["Mold Remediation", "Biohazard Cleanup"],
    riskFlags: ["mold"],
    hours: 4,
    adjustment: 300,
    severe: true,
  },
  {
    id: "seat_removal",
    patterns: [
      /\bseats?\s+(?:need|needed|needs|will|to|must|have to)\s+(?:be\s+)?(?:removed?|pulled?|taken\s+out)\b/i,
      /\bremove\s+seats?\b/i,
      /\binterior\s+strip(?:ped|ping)?\b/i,
      /\binterior\s+disassembl/i,
      /\bseats?\s+out\b/i,
    ],
    label: "Seat Removal / Interior Disassembly",
    operations: [
      "Seat extraction & reinstall",
      "Carpet pull-back",
      "Anchor / belt re-torque to spec",
    ],
    addOns: ["Interior Disassembly Fee"],
    riskFlags: ["seat_removal"],
    hours: 3,
    adjustment: 200,
    severe: true,
  },
  {
    id: "biohazard",
    patterns: [
      /\bbiohazard\b/i,
      /\bblood\b/i,
      /\bvomit\b/i,
      /\bbody\s+fluid/i,
      /\bsharps?\b/i,
    ],
    label: "Biohazard",
    operations: ["OSHA-compliant cleanup", "PPE", "Regulated disposal"],
    addOns: ["Biohazard Cleanup"],
    riskFlags: ["biohazard"],
    hours: 2,
    adjustment: 200,
    severe: true,
  },
  {
    id: "paint_decon",
    patterns: [
      /\bdecon(?:tamination)?\b/i,
      /\biron\s+(?:remover|fallout)\b/i,
      /\bfallout\b/i,
      /\bclay\s+bar\b/i,
      /\bcoating\s+prep\b/i,
      /\bsafe\s+to\s+accept\s+coating\b/i,
    ],
    label: "Paint Decontamination / Coating Prep",
    operations: ["Iron remover", "Clay bar", "IPA wipe-down", "Surface inspection"],
    addOns: ["Paint Decontamination (Iron + Clay)"],
    hours: 1.5,
    adjustment: 100,
  },
  {
    id: "multi_year_coating",
    patterns: [
      // "5yr ceramic", "5-year coating", "7 yr coating", "10-year ceramic"
      /\b(?:[3-9]|10)\s*[-\s]?(?:yr|year|years)\b[^.]*coating/i,
      /\bcoating\b[^.]*\b(?:[3-9]|10)\s*[-\s]?(?:yr|year|years)\b/i,
      /\bmulti[-\s]?year\s+(?:ceramic|coating)\b/i,
    ],
    label: "Multi-Year Ceramic Coating",
    operations: [
      "Multi-stage paint correction",
      "Extended cure prep",
      "Coating-grade panel wipe",
      "Post-coat inspection",
    ],
    addOns: ["Paint Correction Stage 2"],
    hours: 3,
    adjustment: 250,
  },
  {
    id: "paint_correction",
    patterns: [
      /\bpaint\s+correction\b/i,
      /\bswirl(?:s|\s+marks)?\b/i,
      /\bscratch(?:es|y)?\b/i,
      /\bcompound(?:ing)?\b/i,
      /\bpolish(?:ing)?\b/i,
    ],
    label: "Paint Correction",
    operations: ["Multi-stage cut + polish"],
    addOns: ["Paint Correction"],
    hours: 2,
    adjustment: 150,
  },
  {
    id: "oxidation",
    patterns: [
      /\boxidation\b/i,
      /\bfaded?\s+paint\b/i,
      /\bdead\s+paint\b/i,
      /\bchalky\s+paint\b/i,
    ],
    label: "Oxidation",
    operations: ["Wet sand or compound", "Re-finish polish"],
    addOns: ["Oxidation Removal"],
    hours: 2,
    adjustment: 150,
  },
  {
    id: "pet",
    patterns: [
      /\bpet\s+hair\b/i,
      /\bpet\s+odor\b/i,
      /\bdog\s+hair\b/i,
      /\bcat\s+hair\b/i,
      /\bshed(?:ding)?\b/i,
    ],
    label: "Pet Hair / Odor",
    operations: ["Heavy extraction", "Brush + vacuum pass"],
    addOns: ["Pet Hair Removal", "Ozone Treatment"],
    hours: 1.5,
    adjustment: 75,
  },
  {
    id: "smoke",
    patterns: [
      /\bsmoke\s+odor\b/i,
      /\bcigarette\b/i,
      /\bnicotine\b/i,
      /\bash\s+(?:smell|odor)\b/i,
    ],
    label: "Smoke Odor",
    operations: ["Ozone treatment", "Deep clean of porous surfaces"],
    addOns: ["Ozone Treatment"],
    hours: 2,
    adjustment: 100,
  },
  {
    id: "heavy",
    patterns: [
      /\bheavy\s+contamination\b/i,
      /\bheavy\s+soil\b/i,
      /\bdisgusting\b/i,
      /\bextreme(?:ly)?\s+(?:dirty|nasty|filth)/i,
      /\btrash(?:ed)?\b/i,
    ],
    label: "Heavy Contamination",
    operations: ["Pre-soak", "Multiple cleaning passes"],
    addOns: ["Heavy Contamination Supply Fee"],
    hours: 1,
    adjustment: 75,
  },
];

/** Number of severe conditions that triggers a manual-review recommendation. */
const SEVERE_THRESHOLD = 3;

const EMPTY: NoteAnalysis = Object.freeze({
  detectedConditions: [],
  requiredOperations: [],
  suggestedAddOns: [],
  riskFlags: [],
  estimatedExtraLaborHours: 0,
  localPriceAdjustment: 0,
  manualReviewRecommended: false,
  explanation: "",
}) as NoteAnalysis;

export function analyzeJobNotes(notes?: string | null): NoteAnalysis {
  if (!notes || typeof notes !== "string") return EMPTY;
  const text = notes.trim();
  if (text.length < 3) return EMPTY;

  const conditions: string[] = [];
  const ops: string[] = [];
  const addOns: string[] = [];
  const flags: string[] = [];
  let hours = 0;
  let adjust = 0;
  let severeCount = 0;

  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      conditions.push(rule.label);
      for (const op of rule.operations) if (!ops.includes(op)) ops.push(op);
      for (const ao of rule.addOns) if (!addOns.includes(ao)) addOns.push(ao);
      if (rule.riskFlags) {
        for (const f of rule.riskFlags) if (!flags.includes(f)) flags.push(f);
      }
      hours += rule.hours;
      adjust += rule.adjustment;
      if (rule.severe) severeCount += 1;
    }
  }

  if (conditions.length === 0) return EMPTY;

  const manualReview = severeCount >= SEVERE_THRESHOLD;
  const explanation = manualReview
    ? `Detected ${conditions.length} conditions including ${severeCount} severe (${conditions.join(", ")}). Adding ${hours.toFixed(1)} hrs / $${adjust} to benchmark. Manual review strongly recommended before sending this quote.`
    : `Detected ${conditions.length} condition${conditions.length === 1 ? "" : "s"} from notes: ${conditions.join(", ")}. +${hours.toFixed(1)} hrs labor / +$${adjust} added to benchmark.`;

  return {
    detectedConditions: conditions,
    requiredOperations: ops,
    suggestedAddOns: addOns,
    riskFlags: flags,
    estimatedExtraLaborHours: hours,
    localPriceAdjustment: adjust,
    manualReviewRecommended: manualReview,
    explanation,
  };
}
