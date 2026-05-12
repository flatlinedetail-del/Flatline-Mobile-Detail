import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import type { FormTemplate, FormEnforcement } from "../types/forms";
import type { FormsSetupAnswers } from "../types";
import {
  RECOMMENDED_TEMPLATES,
  type RecommendedTemplateKey,
  type RecommendedTemplate,
  type ProtectionStyle,
} from "../data/formDefaults";

export interface GenerationResult {
  created: Array<{ key: RecommendedTemplateKey; title: string; id: string }>;
  skipped: Array<{ key: RecommendedTemplateKey; title: string; reason: "already_exists" }>;
}

export function recommendTemplateKeys(answers: FormsSetupAnswers): RecommendedTemplateKey[] {
  const keys = new Set<RecommendedTemplateKey>();

  keys.add("general_service_agreement");

  const has = (s: string) => answers.services.includes(s);
  const want = (p: string) => answers.protections.includes(p);

  if (want("pre_existing_damage") || want("paint_condition")) {
    keys.add("pre_existing_damage");
  }

  if (want("photo_video")) {
    keys.add("photo_video_release");
  }

  if (has("ceramic_coating") || want("ceramic_cure")) {
    keys.add("ceramic_coating_care");
  }

  if (has("paint_correction") || want("paint_condition")) {
    keys.add("paint_correction_risk");
  }

  if (want("payment_terms") || want("late_fees")) {
    keys.add("payment_late_fee");
  }

  if (has("mobile") || want("access")) {
    keys.add("mobile_service_access");
  }

  if (want("cancellation")) {
    keys.add("cancellation_no_show");
  }

  if (has("interior") || has("stain_odor") || want("interior_stains") || want("odor")) {
    keys.add("interior_stain_odor");
  }

  if (has("pet_hair") || want("pet_hair")) {
    keys.add("pet_hair_limitation");
  }

  return Array.from(keys);
}

function buildDraft(
  recommended: RecommendedTemplate,
  style: ProtectionStyle,
  enforcement: FormEnforcement,
): Omit<FormTemplate, "id"> & { status: "draft"; requiredByDefault: boolean } {
  return {
    title: recommended.title,
    category: recommended.category,
    content: recommended.body[style],
    acknowledgments: recommended.acknowledgments[style],
    requiresSignature: true,
    requiresPrintedName: true,
    requiresDate: true,
    requiresInitials: !!recommended.requiresInitials,
    requiresPhoto: false,
    isActive: false,
    status: "draft",
    requiredByDefault: false,
    version: 1,
    assignedServices: [],
    assignedAddons: [],
    assignedToRetail: true,
    assignedToVendors: false,
    enforcement,
    signatureFrequency: "every_job",
  };
}

function timingToEnforcement(
  timing: FormsSetupAnswers["timing"],
  key: RecommendedTemplateKey,
): FormEnforcement {
  if (timing === "before_booking") return "before_booking";
  if (timing === "before_start") return "before_start";
  if (timing === "before_payment") return "before_start";
  if (timing === "high_risk_only") {
    const highRisk: RecommendedTemplateKey[] = [
      "ceramic_coating_care",
      "paint_correction_risk",
      "pre_existing_damage",
    ];
    return highRisk.includes(key) ? "before_start" : "optional";
  }
  return "before_start";
}

async function loadExistingTitles(): Promise<Set<string>> {
  const snap = await getDocs(collection(db, "form_templates"));
  const titles = new Set<string>();
  snap.docs.forEach((d) => {
    const data = d.data() as Partial<FormTemplate>;
    if (data?.title) titles.add(data.title.trim().toLowerCase());
  });
  return titles;
}

export async function generateRecommendedTemplates(
  answers: FormsSetupAnswers,
): Promise<GenerationResult> {
  const keys = recommendTemplateKeys(answers);
  const existingTitles = await loadExistingTitles();

  const created: GenerationResult["created"] = [];
  const skipped: GenerationResult["skipped"] = [];

  for (const key of keys) {
    const recommended = RECOMMENDED_TEMPLATES[key];
    if (!recommended) continue;

    if (existingTitles.has(recommended.title.trim().toLowerCase())) {
      skipped.push({ key, title: recommended.title, reason: "already_exists" });
      continue;
    }

    const enforcement = timingToEnforcement(answers.timing, key);
    const draft = buildDraft(recommended, answers.style, enforcement);

    const docRef = await addDoc(collection(db, "form_templates"), {
      ...draft,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    created.push({ key, title: recommended.title, id: docRef.id });
  }

  return { created, skipped };
}
