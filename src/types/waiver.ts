import type { Timestamp } from "firebase/firestore";
import type { FormCategory, FormEnforcement, SignatureFrequency } from "./forms";

/**
 * Forms & Waivers Studio — extended data model.
 *
 * Builds on top of the existing FormTemplate / FormInstance / SignedFormRecord
 * collections (form_templates, form_instances, signed_forms) without breaking
 * back-compat. New fields are all optional so legacy templates render fine.
 */

export type WaiverRiskLevel = "low" | "medium" | "high" | "critical";

export type WaiverStatus = "active" | "draft" | "archived";

export type WaiverBlockType =
  | "header"
  | "legalText"
  | "acknowledgmentCheckbox"
  | "initials"
  | "signature"
  | "date"
  | "customerInfo"
  | "vehicleInfo"
  | "jobInfo"
  | "serviceSummary"
  | "beforeAfterPhotoAcknowledgment"
  | "preExistingDamageAcknowledgment"
  | "paymentTerms"
  | "lateFeeTerms"
  | "cancellationPolicy"
  | "customQuestion"
  | "photoUploadRequest";

export interface WaiverBlock {
  id: string;
  type: WaiverBlockType;
  title?: string;
  content?: string;
  required?: boolean;
  order: number;
  settings?: Record<string, any>;
}

/**
 * StudioFormTemplate is the document stored in `form_templates`. It is a
 * superset of the original FormTemplate so old data keeps working.
 */
export interface StudioFormTemplate {
  id: string;

  // legacy / required core
  title: string;
  category: FormCategory;
  content: string;
  acknowledgments: string[];
  requiresSignature: boolean;
  requiresPrintedName: boolean;
  requiresDate: boolean;
  requiresInitials: boolean;
  requiresPhoto: boolean;
  isActive: boolean;
  version: number;
  assignedServices: string[];
  assignedAddons: string[];
  assignedToRetail: boolean;
  assignedToVendors: boolean;
  enforcement: FormEnforcement;
  signatureFrequency: SignatureFrequency;
  expiresAfterDays?: number;
  riskTriggers?: string[];
  priceThreshold?: number;

  // Studio extensions — all optional for back-compat
  customerTitle?: string;
  internalDescription?: string;
  status?: WaiverStatus;
  riskLevel?: WaiverRiskLevel;
  requiredByDefault?: boolean;
  blocks?: WaiverBlock[];
  linkedRiskFlags?: string[];
  linkedVehicleConditionFlags?: string[];
  appliesToOnlineBooking?: boolean;
  appliesToInvoices?: boolean;
  appliesToLateFeeTerms?: boolean;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
  updatedBy?: string;
}

export type WaiverRuleConditionType =
  | "servicePackage"
  | "addon"
  | "vehicleCondition"
  | "damagePhotosPresent"
  | "clientRiskFlag"
  | "onlineBooking"
  | "jobTotalThreshold"
  | "depositRequired"
  | "invoicePaymentTerms"
  | "lateFeeTerms"
  | "manual";

export type WaiverRuleEnforcementPoint =
  | "quoteApproval"
  | "bookingConfirmation"
  | "jobStart"
  | "invoicePayment";

export interface WaiverRule {
  id: string;
  name: string;
  status: "active" | "inactive";
  conditionType: WaiverRuleConditionType;
  conditionOperator?: "equals" | "contains" | "greaterThan" | "isTrue";
  conditionValue?: string | number | string[] | boolean;
  action: "requireForm";
  waiverTemplateId: string;
  enforcementPoint: WaiverRuleEnforcementPoint;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type JobWaiverStatus =
  | "required"
  | "sent"
  | "viewed"
  | "signed"
  | "missing"
  | "overridden"
  | "expired"
  | "notRequired";

export interface JobWaiverRequirement {
  id: string;
  jobId: string;
  customerId: string;
  vehicleId?: string;
  waiverTemplateId: string;
  waiverTemplateVersion: number;
  status: JobWaiverStatus;
  requiredReason?: string;
  sentAt?: Timestamp;
  viewedAt?: Timestamp;
  signedAt?: Timestamp;
  overriddenAt?: Timestamp;
  overrideReason?: string;
  overriddenBy?: string;
  signingLinkId?: string;
  signedDocumentId?: string;
}

export const WAIVER_BLOCK_LIBRARY: {
  type: WaiverBlockType;
  label: string;
  description: string;
  defaultTitle: string;
  defaultRequired?: boolean;
}[] = [
  { type: "header", label: "Header", description: "Section title / banner", defaultTitle: "Section Header" },
  { type: "legalText", label: "Legal Text", description: "Long-form legal clause", defaultTitle: "Legal Clause" },
  { type: "acknowledgmentCheckbox", label: "Acknowledgment", description: "Customer must check to agree", defaultTitle: "I acknowledge…", defaultRequired: true },
  { type: "initials", label: "Initials", description: "Customer initials a clause", defaultTitle: "Initial here", defaultRequired: true },
  { type: "signature", label: "Signature", description: "Drawn or typed signature", defaultTitle: "Signature", defaultRequired: true },
  { type: "date", label: "Date", description: "Auto-filled signing date", defaultTitle: "Date", defaultRequired: true },
  { type: "customerInfo", label: "Customer Info", description: "Auto-fills customer name & contact", defaultTitle: "Customer Information" },
  { type: "vehicleInfo", label: "Vehicle Info", description: "Auto-fills vehicle details", defaultTitle: "Vehicle Information" },
  { type: "jobInfo", label: "Job Info", description: "Auto-fills appointment details", defaultTitle: "Appointment" },
  { type: "serviceSummary", label: "Service Summary", description: "Itemized services & pricing", defaultTitle: "Service Summary" },
  { type: "beforeAfterPhotoAcknowledgment", label: "Photo Release", description: "Authorize before/after photos", defaultTitle: "Before / After Photo Authorization", defaultRequired: true },
  { type: "preExistingDamageAcknowledgment", label: "Pre-Existing Damage", description: "Acknowledge prior damage", defaultTitle: "Pre-Existing Damage Acknowledgment", defaultRequired: true },
  { type: "paymentTerms", label: "Payment Terms", description: "How and when payment is due", defaultTitle: "Payment Terms" },
  { type: "lateFeeTerms", label: "Late Fee Terms", description: "Late payment / past-due policy", defaultTitle: "Late Fee Policy" },
  { type: "cancellationPolicy", label: "Cancellation Policy", description: "No-show / cancellation clauses", defaultTitle: "Cancellation Policy" },
  { type: "customQuestion", label: "Custom Question", description: "Free-form question and answer", defaultTitle: "Custom Question" },
  { type: "photoUploadRequest", label: "Photo Upload", description: "Ask the customer to upload a photo", defaultTitle: "Upload a Photo" },
];

export const RISK_LEVEL_META: Record<WaiverRiskLevel, { label: string; color: string; bg: string; ring: string }> = {
  low:      { label: "Low Risk",     color: "text-emerald-300", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30" },
  medium:   { label: "Moderate",     color: "text-amber-300",   bg: "bg-amber-500/10",   ring: "ring-amber-500/30"   },
  high:     { label: "High Risk",    color: "text-orange-300",  bg: "bg-orange-500/10",  ring: "ring-orange-500/30"  },
  critical: { label: "Critical",     color: "text-red-300",     bg: "bg-red-500/10",     ring: "ring-red-500/30"     },
};

export const CATEGORY_META: Record<FormCategory, { label: string; emoji: string }> = {
  liability:                 { label: "Liability",              emoji: "🛡" },
  service_agreement:         { label: "Service Agreement",      emoji: "📋" },
  condition_acknowledgment:  { label: "Condition",              emoji: "🔍" },
  deposit_policy:            { label: "Deposit Policy",         emoji: "💳" },
  disclosure:                { label: "Disclosure",             emoji: "📢" },
  authorization:             { label: "Authorization",          emoji: "✍️" },
  custom:                    { label: "Custom",                 emoji: "✨" },
};

export const ENFORCEMENT_POINT_META: Record<WaiverRuleEnforcementPoint, { label: string; short: string }> = {
  quoteApproval:        { label: "Before Quote Approval",   short: "Quote" },
  bookingConfirmation:  { label: "Before Booking Confirms", short: "Booking" },
  jobStart:             { label: "Before Job Start",        short: "Job Start" },
  invoicePayment:       { label: "Before Invoice Payment",  short: "Invoice" },
};
