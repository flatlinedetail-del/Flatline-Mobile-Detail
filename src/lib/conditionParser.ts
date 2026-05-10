/**
 * Deterministic job-note condition parser for Smart Quote pricing.
 * Detects special job conditions (mold, water damage, seat removal, etc.)
 * and returns surcharge amounts and metadata used to adjust benchmark prices
 * before the AI call and to display condition flags in the Market Analysis panel.
 */

export interface ConditionFlag {
  key: string;
  label: string;
  laborSurcharge: number;
  riskLevel: "medium" | "high" | "critical";
}

export interface ConditionAnalysis {
  flags: ConditionFlag[];
  requiredOperations: string[];
  suggestedServices: string[];
  totalSurcharge: number;
  manualReviewRecommended: boolean;
  pricingExplanation: string;
}

interface ConditionDef {
  key: string;
  label: string;
  keywords: string[];
  laborSurcharge: number;
  riskLevel: "medium" | "high" | "critical";
  requiredOp?: string;
  suggestedService?: string;
}

const CONDITIONS_CATALOG: ConditionDef[] = [
  {
    key: "mold_remediation",
    label: "Mold Remediation",
    keywords: ["mold", "mildew", "mold remediation", "fungal", "spores"],
    laborSurcharge: 350,
    riskLevel: "critical",
    requiredOp: "Mold remediation with EPA-registered products",
    suggestedService: "Mold Remediation",
  },
  {
    key: "biohazard",
    label: "Biohazard Cleanup",
    keywords: ["biohazard", "blood", "vomit", "urine", "feces", "bodily fluid", "hazmat"],
    laborSurcharge: 400,
    riskLevel: "critical",
    requiredOp: "Biohazard cleanup with PPE and EPA disposal",
    suggestedService: "Biohazard Remediation",
  },
  {
    key: "water_damage",
    label: "Water Damage",
    keywords: ["water damage", "flooded", "flood", "soaking wet", "water intrusion", "wet carpet"],
    laborSurcharge: 200,
    riskLevel: "high",
    requiredOp: "Interior drying and extraction",
    suggestedService: "Water Damage Restoration",
  },
  {
    key: "seat_removal",
    label: "Seat Removal Required",
    keywords: [
      "seats need to be removed",
      "seat removal",
      "remove seats",
      "pull seats",
      "seats removed",
      "remove the seats",
    ],
    laborSurcharge: 150,
    riskLevel: "high",
    requiredOp: "Seat removal and reinstallation",
  },
  {
    key: "smoke_odor",
    label: "Smoke / Nicotine Odor",
    keywords: ["smoke", "nicotine", "cigarette", "tobacco", "smoker"],
    laborSurcharge: 200,
    riskLevel: "high",
    requiredOp: "Ozone treatment or thermal fogging",
  },
  {
    key: "carpet_removal",
    label: "Carpet Removal",
    keywords: ["carpet removal", "remove carpet", "carpet pulled", "pull carpet"],
    laborSurcharge: 125,
    riskLevel: "high",
    requiredOp: "Carpet removal and disposal",
  },
  {
    key: "wet_sanding",
    label: "Wet Sanding",
    keywords: ["wet sand", "wet sanding", "level sanding"],
    laborSurcharge: 150,
    riskLevel: "medium",
    requiredOp: "Machine wet sanding",
  },
  {
    key: "paint_correction",
    label: "Paint Correction",
    keywords: ["paint correction", "swirl", "scratch removal", "buffer", "compounding", "clear coat repair"],
    laborSurcharge: 125,
    riskLevel: "medium",
    requiredOp: "Multi-stage paint correction",
  },
  {
    key: "paint_decon",
    label: "Paint Decontamination",
    keywords: ["decon", "decontamination", "iron remover", "clay bar", "fallout", "overspray", "paint decon"],
    laborSurcharge: 100,
    riskLevel: "medium",
    requiredOp: "Chemical decontamination + clay bar",
    suggestedService: "Paint Decontamination",
  },
  {
    key: "interior_drying",
    label: "Interior Drying",
    keywords: ["drying", "dry out", "air dry", "dehumidify", "wet interior"],
    laborSurcharge: 100,
    riskLevel: "medium",
    requiredOp: "Industrial drying with blowers/dehumidifiers",
  },
  {
    key: "pet_contamination",
    label: "Pet Contamination",
    keywords: ["pet hair", "dog hair", "cat hair", "shedding", "pet dander", "pet odor", "dog smell"],
    laborSurcharge: 100,
    riskLevel: "medium",
    requiredOp: "Pet hair removal and enzyme treatment",
  },
  {
    key: "extraction",
    label: "Deep Extraction",
    keywords: ["extraction", "hot water extraction", "steam extraction"],
    laborSurcharge: 75,
    riskLevel: "medium",
    requiredOp: "Hot water extraction",
  },
  {
    key: "odor_treatment",
    label: "Odor Treatment",
    keywords: ["odor", "stench", "deodorize", "bad smell"],
    laborSurcharge: 75,
    riskLevel: "medium",
    requiredOp: "Enzyme odor treatment",
  },
  {
    key: "heavy_contamination",
    label: "Heavy Contamination",
    keywords: ["heavy soiling", "extreme", "trashed", "very dirty", "heavily soiled", "disaster"],
    laborSurcharge: 75,
    riskLevel: "medium",
    requiredOp: "Extended labor for heavy soiling",
  },
];

export function parseJobConditions(notes: string, selectedServiceNames: string[]): ConditionAnalysis {
  const lower = notes.toLowerCase();
  const selectedLower = selectedServiceNames.map(s => s.toLowerCase());

  const flags: ConditionFlag[] = [];
  const requiredOperations: string[] = [];
  const suggestedServices: string[] = [];

  for (const def of CONDITIONS_CATALOG) {
    if (!def.keywords.some(kw => lower.includes(kw))) continue;

    flags.push({
      key: def.key,
      label: def.label,
      laborSurcharge: def.laborSurcharge,
      riskLevel: def.riskLevel,
    });

    if (def.requiredOp) requiredOperations.push(def.requiredOp);

    if (def.suggestedService) {
      const firstWord = def.suggestedService.toLowerCase().split(" ")[0];
      const alreadySelected = selectedLower.some(s => s.includes(firstWord));
      if (!alreadySelected) suggestedServices.push(def.suggestedService);
    }
  }

  const totalSurcharge = flags.reduce((s, f) => s + f.laborSurcharge, 0);
  const manualReviewRecommended = flags.some(f => f.riskLevel === "critical");

  let pricingExplanation = "";
  if (flags.length > 0) {
    const labels = flags.map(f => `${f.label} (+$${f.laborSurcharge})`).join(", ");
    pricingExplanation = `Detected conditions: ${labels}. Total condition surcharge: $${totalSurcharge}.`;
    if (manualReviewRecommended) {
      pricingExplanation += " Critical conditions detected — manual review recommended before finalizing.";
    }
  }

  return { flags, requiredOperations, suggestedServices, totalSurcharge, manualReviewRecommended, pricingExplanation };
}
