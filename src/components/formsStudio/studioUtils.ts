import type { Timestamp } from "firebase/firestore";
import type { StudioFormTemplate, WaiverRiskLevel, WaiverStatus, WaiverBlock, WaiverBlockType } from "../../types/waiver";
import { WAIVER_BLOCK_LIBRARY, CATEGORY_META, RISK_LEVEL_META } from "../../types/waiver";
import type { FormCategory } from "../../types/forms";

/**
 * Maps legacy / loose category strings to a known FormCategory key.
 * Old templates created before the Studio may have category values like
 * "general", "general_authorization", "payment", etc. that aren't in
 * CATEGORY_META — without this they'd crash when a component reads
 * CATEGORY_META[t.category].emoji.
 */
const LEGACY_CATEGORY_ALIAS: Record<string, FormCategory> = {
  general:                "authorization",
  generalAuthorization:   "authorization",
  general_authorization:  "authorization",
  authorization:          "authorization",
  liability:              "liability",
  service_agreement:      "service_agreement",
  service:                "service_agreement",
  serviceAgreement:       "service_agreement",
  condition_acknowledgment: "condition_acknowledgment",
  condition:              "condition_acknowledgment",
  conditionAcknowledgment:"condition_acknowledgment",
  deposit_policy:         "deposit_policy",
  deposit:                "deposit_policy",
  depositPolicy:          "deposit_policy",
  payment:                "deposit_policy",
  paymentTerms:           "deposit_policy",
  payment_terms:          "deposit_policy",
  late_fee:               "deposit_policy",
  lateFee:                "deposit_policy",
  cancellation:           "deposit_policy",
  disclosure:             "disclosure",
  photo:                  "disclosure",
  photoRelease:           "disclosure",
  photo_release:          "disclosure",
  custom:                 "custom",
};

export function normalizeCategory(value: string | undefined | null): FormCategory {
  if (!value) return "custom";
  if ((CATEGORY_META as any)[value]) return value as FormCategory;
  const lowered = String(value).trim();
  if ((LEGACY_CATEGORY_ALIAS as any)[lowered]) return LEGACY_CATEGORY_ALIAS[lowered];
  return "custom";
}

const FALLBACK_CATEGORY_META = { label: "General", emoji: "📄" } as const;
const FALLBACK_RISK_META = {
  label: "Basic Protection",
  color: "text-emerald-300",
  bg: "bg-emerald-500/10",
  ring: "ring-emerald-500/30",
} as const;

/** Always returns a populated meta object — never undefined. */
export function getCategoryMeta(value: string | undefined | null): { label: string; emoji: string } {
  const key = normalizeCategory(value);
  return (CATEGORY_META as any)[key] ?? FALLBACK_CATEGORY_META;
}

/** Always returns a populated meta object — never undefined. */
export function getRiskMeta(value: WaiverRiskLevel | string | undefined | null): { label: string; color: string; bg: string; ring: string } {
  if (value && (RISK_LEVEL_META as any)[value]) return (RISK_LEVEL_META as any)[value];
  return FALLBACK_RISK_META;
}

export function tsToDate(ts: Timestamp | Date | string | undefined | null): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof (ts as any).toDate === "function") {
    try { return (ts as any).toDate(); } catch { return null; }
  }
  return null;
}

export function getTemplateStatus(t: StudioFormTemplate): WaiverStatus {
  if (t.status) return t.status;
  return t.isActive ? "active" : "draft";
}

export function getTemplateRiskLevel(t: StudioFormTemplate): WaiverRiskLevel {
  if (t.riskLevel) return t.riskLevel;
  // Heuristic for legacy templates
  if (t.priceThreshold && t.priceThreshold >= 500) return "high";
  if (t.category === "liability" || t.category === "disclosure") return "medium";
  return "low";
}

export function getCustomerTitle(t: StudioFormTemplate): string {
  return t.customerTitle?.trim() || t.title;
}

let _idCounter = 0;
export function makeId(): string {
  _idCounter += 1;
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return `blk_${Date.now()}_${_idCounter}`;
}

/**
 * Per-block-type defaults used when the owner clicks a block in the library.
 * Each entry mirrors the "Expected block behavior" the product spec lists —
 * a friendly default title plus sensible starter content / settings so the
 * inserted block is immediately useful, not blank.
 */
const BLOCK_DEFAULTS: Partial<Record<WaiverBlockType, Partial<WaiverBlock>>> = {
  header: {
    title: "New Section",
    required: false,
  },
  legalText: {
    title: "Legal Clause",
    content: "Enter clause text here.",
    required: false,
  },
  acknowledgmentCheckbox: {
    title: "Customer Acknowledgment",
    content: "I acknowledge and agree to the terms stated above.",
    required: true,
  },
  initials: {
    title: "Customer Initials",
    content: "Customer initials required.",
    required: true,
  },
  signature: {
    title: "Customer Signature",
    required: true,
  },
  date: {
    title: "Date",
    required: true,
    settings: { autoFill: true },
  },
  customerInfo: {
    title: "Customer Information",
    required: false,
    settings: { fields: ["name", "phone", "email"] },
  },
  vehicleInfo: {
    title: "Vehicle Information",
    required: false,
    settings: { fields: ["year", "make", "model", "color", "licensePlate"] },
  },
  jobInfo: {
    title: "Appointment & Job",
    required: false,
    settings: { fields: ["appointmentDate", "serviceLocation", "assignedTechnician"] },
  },
  serviceSummary: {
    title: "Service Summary",
    required: false,
    settings: { fields: ["services", "addOns", "discounts", "taxesAndFees", "total"] },
  },
  beforeAfterPhotoAcknowledgment: {
    title: "Photo / Media Authorization",
    content:
      "Customer authorizes the business to capture before, during, and after photos and videos of the vehicle and service work, and to use those images for documentation, quality assurance, training, marketing, social media, and portfolio purposes, unless the customer opts out in writing.",
    required: true,
  },
  preExistingDamageAcknowledgment: {
    title: "Pre-Existing Damage Acknowledgment",
    content:
      "Customer acknowledges that scratches, swirl marks, oxidation, failing or thinning clear coat, paint chips, dents, rust, interior stains, prior poor repairs or detailing, and damage hidden by dirt or contamination may already exist on the vehicle before service. The business is not responsible for pre-existing conditions identified before, during, or after the appointment.",
    required: true,
  },
  paymentTerms: {
    title: "Payment Terms",
    content:
      "Customer agrees to pay the full amount owed for all approved services upon completion, unless written terms specify otherwise. Accepted methods are as listed at the time of booking or invoicing.",
    required: false,
  },
  lateFeeTerms: {
    title: "Late Fee Policy",
    content:
      "Past-due invoices may accrue a late fee in accordance with the business's configured late-fee policy. Continued non-payment may result in additional fees or collection action.",
    required: false,
  },
  cancellationPolicy: {
    title: "Cancellation & No-Show Policy",
    content:
      "Appointments cancelled within 24 hours of the scheduled time may incur a cancellation fee. No-shows may forfeit any deposit and may be charged for travel and reserved labor.",
    required: false,
  },
  customQuestion: {
    title: "Custom Question",
    content: "",
    required: false,
  },
  photoUploadRequest: {
    title: "Photo Upload",
    content: "Tap to upload a photo (e.g., a clear shot of any existing damage).",
    required: false,
  },
};

export function defaultBlockFor(type: WaiverBlockType): WaiverBlock {
  const libMeta = WAIVER_BLOCK_LIBRARY.find(b => b.type === type);
  const def = BLOCK_DEFAULTS[type] ?? {};
  return {
    id: makeId(),
    type,
    title: def.title ?? libMeta?.defaultTitle ?? "",
    content: def.content ?? "",
    required: def.required ?? libMeta?.defaultRequired ?? false,
    order: 0,
    settings: def.settings,
  };
}

/**
 * Build a default block layout from a legacy template so the visual builder
 * can render block-based templates that were originally created in the old
 * basic builder.
 */
export function deriveBlocksFromLegacy(t: StudioFormTemplate): WaiverBlock[] {
  if (t.blocks && t.blocks.length > 0) return [...t.blocks].sort((a, b) => a.order - b.order);

  const blocks: WaiverBlock[] = [];
  let order = 0;

  if (t.title) {
    blocks.push({ id: makeId(), type: "header", title: t.title, order: order++ });
  }
  if (t.content) {
    blocks.push({ id: makeId(), type: "legalText", title: "Terms", content: t.content, order: order++ });
  }
  for (const ack of t.acknowledgments || []) {
    blocks.push({ id: makeId(), type: "acknowledgmentCheckbox", title: ack, required: true, order: order++ });
  }
  if (t.requiresInitials) {
    blocks.push({ id: makeId(), type: "initials", title: "Initials", required: true, order: order++ });
  }
  if (t.requiresPrintedName) {
    blocks.push({ id: makeId(), type: "customerInfo", title: "Customer Information", required: true, order: order++ });
  }
  if (t.requiresDate) {
    blocks.push({ id: makeId(), type: "date", title: "Date", required: true, order: order++ });
  }
  if (t.requiresSignature) {
    blocks.push({ id: makeId(), type: "signature", title: "Signature", required: true, order: order++ });
  }
  if (t.requiresPhoto) {
    blocks.push({ id: makeId(), type: "photoUploadRequest", title: "Photo Required", required: true, order: order++ });
  }
  return blocks;
}

export function reorderBlock(blocks: WaiverBlock[], blockId: string, direction: "up" | "down"): WaiverBlock[] {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex(b => b.id === blockId);
  if (idx === -1) return sorted;
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= sorted.length) return sorted;
  [sorted[idx], sorted[swap]] = [sorted[swap], sorted[idx]];
  return sorted.map((b, i) => ({ ...b, order: i }));
}
