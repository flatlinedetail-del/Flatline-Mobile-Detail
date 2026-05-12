/**
 * AI Waiver Drafting Engine — local deterministic builder.
 *
 * Used by AIDraftModal to:
 *   1. Build a list of "proposed clauses" from the owner's prompt + checkboxes
 *      + custom clause instructions + AI interview answers.
 *   2. Run a guided question schema (the "AI Interview").
 *   3. Convert reviewed/edited clauses into WaiverBlocks + legacy fields the
 *      Studio editor and CustomerSigning route already understand.
 *
 * Why local? See AIDraftModal — the team has not yet approved a Gemini-backed
 * schema for waiver drafting, so this engine builds structured drafts from
 * the owner's input deterministically. The integration point for Gemini is
 * `buildProposedClauses` — swap it for a network call when ready.
 */

import type { WaiverBlock, WaiverRiskLevel } from "../../types/waiver";
import type { FormCategory } from "../../types/forms";

// ─── Public types ─────────────────────────────────────────────────────────

export type Tone = "customer" | "balanced" | "strict";

export interface CustomProtection {
  id: string;
  title: string;
  description: string;
  requireAck: boolean;
  requireInitials: boolean;
}

export type ProposedClauseCategory =
  | "intro"
  | "risk"
  | "limitation"
  | "agreement"
  | "policy"
  | "authorization"
  | "internal_note"
  | "custom";

/**
 * A clause as proposed to the owner before activation. The owner edits the
 * toggles on the review screen — those choices then drive how each clause
 * is rendered as a WaiverBlock and surfaced in the customer signing flow.
 */
export interface ProposedClause {
  id: string;
  title: string;
  text: string;
  category: ProposedClauseCategory;
  /** False = internal-only (never shown to customer). */
  customerVisible: boolean;
  /** Customer must explicitly accept the clause. */
  requireAcceptance: boolean;
  /** Customer must initial this clause. */
  requireInitials: boolean;
  /** Customer must add a full signature next to this clause. */
  requireSignature: boolean;
  /** Customer can decline this clause (instead of being forced to accept). */
  optionalConsent: boolean;
  /** Activation/enforcement hints — surfaced as block.settings.activation. */
  activation: {
    appliesToSelectedServices: boolean;
    appliesToSelectedRiskFlags: boolean;
    showBeforeBooking: boolean;
    showBeforeJobStart: boolean;
    attachToInvoice: boolean;
    requireBeforePayment: boolean;
    requireBeforeTechBegins: boolean;
  };
  /** Marks where this clause came from — useful for review-screen icons. */
  source: "checkbox" | "custom" | "prompt" | "interview" | "exact_wording";
}

export interface InterviewAnswers {
  scopeChoice?: "this_job" | "all_jobs" | "selected_services" | "selected_packages" | "selected_risk_flags";
  blockUntilSigned?: ("booking" | "payment" | "job_start")[];
  acknowledgedRisks?: string;
  strongerLanguageRisks?: string;
  initialsClauseHints?: string;
  signatureClauseHints?: string;
  optionalConsentHints?: string;
  exactWording?: string;
  internalNotes?: string;
  /** Owner gave permission to AI to write polished clause language from rough notes. */
  allowAIPolish?: boolean;
}

export interface DraftInput {
  prompt: string;
  waiverType: string;
  serviceType: string;
  tone: Tone;
  riskLevel: WaiverRiskLevel;
  selectedProtections: string[];
  customProtections: CustomProtection[];
  interviewAnswers: InterviewAnswers;
  /** Whether the owner went through the guided interview. */
  interviewCompleted: boolean;
  /**
   * "legal" = waiver / service agreement / acknowledgment.
   * "informational" = aftercare, brochure, prep, maintenance, warranty, follow-up email.
   * Defaults to "legal" when omitted (back-compat).
   */
  documentClass?: "legal" | "informational";
  /**
   * For informational documents only — when true, the document still requires
   * customer acknowledgment / signature blocks. Ignored for legal types.
   */
  requiresAcknowledgment?: boolean;
}

export interface DraftOutput {
  title: string;
  customerTitle: string;
  internalDescription: string;
  category: FormCategory;
  riskLevel: WaiverRiskLevel;
  content: string;
  acknowledgments: string[];
  requiresInitials: boolean;
  blocks: WaiverBlock[];
  documentClass?: "legal" | "informational";
  /** Echoed back so the persistence layer can decide signature/initials defaults. */
  requiresAcknowledgment?: boolean;
}

// ─── Question schema for the guided AI Interview ───────────────────────────

export interface InterviewStep {
  id: string;
  title: string;
  /** Short helper sentence rendered under the step heading. */
  intro?: string;
  /** Each step contains one or more questions. */
  questions: InterviewQuestion[];
}

export type InterviewQuestion =
  | {
      kind: "radio";
      id: keyof InterviewAnswers;
      label: string;
      help?: string;
      options: { value: string; label: string; desc?: string }[];
    }
  | {
      kind: "multi";
      id: keyof InterviewAnswers;
      label: string;
      help?: string;
      options: { value: string; label: string; desc?: string }[];
    }
  | {
      kind: "textarea";
      id: keyof InterviewAnswers;
      label: string;
      help?: string;
      placeholder?: string;
    }
  | {
      kind: "toggle";
      id: keyof InterviewAnswers;
      label: string;
      help?: string;
    };

export const INTERVIEW_STEPS: InterviewStep[] = [
  {
    id: "scope",
    title: "Scope",
    intro: "Where should this document apply?",
    questions: [
      {
        kind: "radio",
        id: "scopeChoice",
        label: "Which jobs should this document apply to?",
        options: [
          { value: "this_job",            label: "Just this one job",          desc: "A one-off document for a single appointment." },
          { value: "all_jobs",            label: "All future jobs",            desc: "Becomes a baseline document every customer receives." },
          { value: "selected_services",   label: "Selected services",          desc: "Only when specific services are on the job." },
          { value: "selected_packages",   label: "Selected packages",          desc: "Only when specific packages are booked." },
          { value: "selected_risk_flags", label: "Selected risk flags",        desc: "Only when the client has certain risk flags." },
        ],
      },
      {
        kind: "multi",
        id: "blockUntilSigned",
        label: "Block the customer from doing what until this is signed?",
        help: "Pick everything that applies — these become enforcement points.",
        options: [
          { value: "booking",   label: "Confirming a booking" },
          { value: "payment",   label: "Paying an invoice" },
          { value: "job_start", label: "Technician starting the job" },
        ],
      },
    ],
  },
  {
    id: "risks",
    title: "Risks & Acknowledgments",
    intro: "Tell the AI exactly what to protect against.",
    questions: [
      {
        kind: "textarea",
        id: "acknowledgedRisks",
        label: "What specific risks should the customer acknowledge?",
        placeholder: "e.g. swirl marks, clearcoat damage, scratches hidden by dirt, paint chips, oxidation, prior body work…",
      },
      {
        kind: "textarea",
        id: "strongerLanguageRisks",
        label: "Any risk that should be written in stronger / firmer language?",
        placeholder: "e.g. ceramic cure-time damage from car washes within 7 days — must be very clear.",
      },
    ],
  },
  {
    id: "signing",
    title: "Customer Signing Requirements",
    intro: "How strictly does the customer need to confirm?",
    questions: [
      {
        kind: "textarea",
        id: "initialsClauseHints",
        label: "Which clauses should require customer initials?",
        help: "List the clauses or topics that need initials beside them. Leave blank to skip.",
        placeholder: "e.g. ceramic coating cure time, paint correction risk, pre-existing damage…",
      },
      {
        kind: "textarea",
        id: "signatureClauseHints",
        label: "Which clauses need a full signature (not just initials)?",
        placeholder: "Usually only the final agreement — leave blank for the default.",
      },
      {
        kind: "textarea",
        id: "optionalConsentHints",
        label: "Any clauses that are optional consent (customer can decline)?",
        placeholder: "e.g. photo / social media release.",
      },
    ],
  },
  {
    id: "wording",
    title: "Wording & Tone",
    intro: "Help the AI sound like your business.",
    questions: [
      {
        kind: "textarea",
        id: "exactWording",
        label: "Any exact wording you want preserved verbatim?",
        help: "Paste any phrases or sentences the AI must keep word-for-word.",
        placeholder: "e.g. \"Customer understands that we are not liable for damage hidden by dirt or contamination present before the wash.\"",
      },
      {
        kind: "toggle",
        id: "allowAIPolish",
        label: "Let the AI polish rough instructions into clause language.",
        help: "When on, the AI rewrites your rough notes into a clean, signing-ready clause.",
      },
    ],
  },
  {
    id: "internal",
    title: "Internal Notes",
    intro: "Notes for your team only — never shown to customers.",
    questions: [
      {
        kind: "textarea",
        id: "internalNotes",
        label: "Anything you want stored as an internal-only note?",
        placeholder: "e.g. \"Created for the Q1 ceramic season. Coordinate with insurance carrier before activation.\"",
      },
    ],
  },
];

// ─── Standard clause library (used by both prompt-keyword matching and
//     selected-protections expansion) ───────────────────────────────────────

interface StandardClause {
  id: string;
  title: string;
  text: string;
  category: ProposedClauseCategory;
  /** Default: customer should initial this clause. */
  defaultInitials?: boolean;
}

const STANDARD_CLAUSES: Record<string, StandardClause> = {
  preExistingDamage: {
    id: "pre_existing_damage",
    title: "Pre-Existing Damage",
    category: "limitation",
    defaultInitials: true,
    text:
      "Customer acknowledges that pre-existing scratches, swirl marks, dents, paint chips, interior stains, mechanical issues, and other prior damage are not the responsibility of the business. Inspection photos will be referenced if available.",
  },
  paintCorrection: {
    id: "paint_correction_risk",
    title: "Paint Correction Risk",
    category: "risk",
    defaultInitials: true,
    text:
      "Paint correction removes a measured layer of clear-coat to reduce defects. Some defects cannot be fully corrected, and aggressive correction may further reduce clear-coat life. Customer agrees that results depend on the existing paint condition.",
  },
  ceramicCoating: {
    id: "ceramic_coating_terms",
    title: "Ceramic Coating — Cure & Maintenance",
    category: "agreement",
    defaultInitials: true,
    text:
      "Ceramic coatings require an undisturbed cure period as advised. Customer agrees to follow maintenance guidance and acknowledges that improper care, harsh chemicals, automatic car-washes, or environmental contaminants may shorten coating life.",
  },
  interiorStain: {
    id: "interior_stain_limit",
    title: "Interior Stain Limitations",
    category: "limitation",
    text:
      "Some interior stains, odors, watermarks, dye transfer, and burn marks may be permanent and cannot be fully removed without risk to the underlying material. Customer accepts that not all stains can be fully restored.",
  },
  petHair: {
    id: "pet_hair_limit",
    title: "Pet Hair Limitations",
    category: "limitation",
    text:
      "Pet hair embedded into fabric, headliner, or carpet may not be 100% removable. Heavily embedded pet hair may add labor time or remain partially present after service.",
  },
  cancellation: {
    id: "cancellation_policy",
    title: "Cancellation & No-Show Policy",
    category: "policy",
    text:
      "Appointments cancelled within 24 hours of the scheduled time may incur a cancellation fee. No-shows may forfeit any deposit and may be charged for travel and reserved labor.",
  },
  paymentTerms: {
    id: "payment_terms",
    title: "Payment Terms",
    category: "policy",
    text:
      "Payment is due upon completion of services unless other written terms have been agreed. Accepted payment methods are as listed at booking.",
  },
  paymentDue: {
    id: "payment_due",
    title: "Payment Due",
    category: "policy",
    text:
      "Payment is due upon completion of services unless other written terms have been agreed in advance. The customer agrees to provide a valid payment method and to settle the balance no later than the time stated on the invoice.",
  },
  acceptedMethods: {
    id: "accepted_methods",
    title: "Accepted Payment Methods",
    category: "policy",
    text:
      "Accepted payment methods are as listed at booking. The business may, at its discretion, decline any payment method that cannot be verified, and may require an alternative method before service is completed.",
  },
  deposits: {
    id: "deposits_booking_fees",
    title: "Deposits & Booking Fees",
    category: "policy",
    text:
      "A deposit or booking fee may be required to reserve the appointment, as disclosed at booking. Deposits are applied toward the final invoice. If the appointment is cancelled or rescheduled outside the agreed window, the deposit may be forfeited as described in the cancellation policy.",
  },
  lateFees: {
    id: "late_fees",
    title: "Late Fee Policy",
    category: "policy",
    text:
      "Past-due invoices accrue a late fee as defined in the business late-fee policy. Continued non-payment may result in collection action.",
  },
  additionalCharges: {
    id: "additional_charges",
    title: "Additional Charges & Change Orders",
    category: "policy",
    text:
      "If conditions found at the time of service require work outside the agreed scope, the business will disclose the additional charge and obtain customer approval (verbal, written, or by signed change order) before performing the additional work.",
  },
  chargebacks: {
    id: "chargebacks_disputes",
    title: "Chargebacks & Payment Disputes",
    category: "policy",
    text:
      "If the customer disputes a charge, the customer agrees to contact the business first to attempt resolution before initiating a chargeback. Improper chargebacks may incur a processing fee and the customer remains responsible for the original balance.",
  },
  collections: {
    id: "collections_nonpayment",
    title: "Collections & Nonpayment",
    category: "policy",
    text:
      "Balances that remain unpaid after the late-fee window may be referred to a collection agency or pursued through legal remedies available to the business. The customer is responsible for reasonable collection costs.",
  },
  photoAuth: {
    id: "photo_release",
    title: "Photo & Media Authorization",
    category: "authorization",
    text:
      "Customer authorizes the business to capture before/after and progress photos and to use those images for marketing, social media, training, and portfolio purposes. Identifying information will not be shared.",
  },
  mobileAccess: {
    id: "mobile_access",
    title: "Mobile Access Permission",
    category: "authorization",
    text:
      "For mobile appointments, customer grants the business reasonable access to the vehicle and to water/electric/driveway/key as required at the agreed location during the service window.",
  },
};

// ─── Prompt keyword → standard-clause hints ────────────────────────────────

const KEYWORD_MAP: { match: RegExp; key: keyof typeof STANDARD_CLAUSES }[] = [
  { match: /\bceramic\b/i,                            key: "ceramicCoating" },
  { match: /\bcoating(s)?\b/i,                        key: "ceramicCoating" },
  { match: /\bcure (time|window|period)?\b/i,          key: "ceramicCoating" },
  { match: /\bpaint correction\b/i,                    key: "paintCorrection" },
  { match: /\bclear[- ]?coat\b/i,                      key: "paintCorrection" },
  { match: /\bpolish(ing)?\b/i,                        key: "paintCorrection" },
  { match: /\bpre[- ]?existing\b/i,                    key: "preExistingDamage" },
  { match: /\bprior damage\b/i,                        key: "preExistingDamage" },
  { match: /\boxidation\b/i,                           key: "preExistingDamage" },
  { match: /\binterior (stain|odor)\b/i,               key: "interiorStain" },
  { match: /\bstain(s)?\b/i,                           key: "interiorStain" },
  { match: /\bpet hair\b/i,                            key: "petHair" },
  { match: /\bcancel(lation)?\b/i,                     key: "cancellation" },
  { match: /\bno[- ]?show\b/i,                         key: "cancellation" },
  { match: /\breschedul/i,                             key: "cancellation" },
  { match: /\bpayment\b/i,                             key: "paymentTerms" },
  { match: /\blate fee/i,                              key: "lateFees" },
  { match: /\bphoto/i,                                 key: "photoAuth" },
  { match: /\bvideo/i,                                 key: "photoAuth" },
  { match: /\bsocial media\b/i,                        key: "photoAuth" },
  { match: /\bmobile\b/i,                              key: "mobileAccess" },
  { match: /\bdriveway\b/i,                            key: "mobileAccess" },
  { match: /\baccess\b/i,                              key: "mobileAccess" },
];

// ─── Tone helpers ──────────────────────────────────────────────────────────

const TONE_INTRO: Record<Tone, string> = {
  customer:
    "Thank you for choosing us. To make sure your experience is smooth and that expectations are clear, please review the following.",
  balanced:
    "By signing this document, you confirm you have read and agree to the following terms relating to the requested services.",
  strict:
    "READ CAREFULLY. By signing below, you knowingly and voluntarily agree to the following terms. This is a legally binding agreement.",
};

const TYPE_META: Record<string, { title: string; description: string; category: FormCategory }> = {
  // ─── Legal document types ───────────────────────────────────────────────
  general:      { title: "General Service Authorization",      description: "Authorizes the business to perform requested services on the customer's vehicle.", category: "authorization" },
  liability:    { title: "Liability Release & Acknowledgment", description: "Releases the business from defined liabilities incurred during service.",            category: "liability" },
  ceramic:      { title: "Ceramic Coating Service Agreement",  description: "Defines cure-time, maintenance, and warranty terms for ceramic coating services.", category: "service_agreement" },
  paint:        { title: "Paint Correction Acknowledgment",    description: "Acknowledges risks and limitations of paint correction services.",                 category: "service_agreement" },
  interior:     { title: "Interior Condition Acknowledgment",  description: "Documents pre-existing interior condition and limitations of restoration.",        category: "condition_acknowledgment" },
  cancellation: { title: "Cancellation & No-Show Policy",      description: "Defines cancellation windows, no-show fees, and rescheduling terms.",              category: "deposit_policy" },
  payment:      { title: "Payment Terms Agreement",            description: "Customer agreement to defined payment timing and methods.",                          category: "deposit_policy" },
  photo:        { title: "Photo & Media Release",              description: "Customer authorizes business use of before/after and progress photos.",            category: "disclosure" },
  mobile:       { title: "Mobile Service Access Permission",   description: "Customer grants access to vehicle at the agreed location for mobile service.",     category: "authorization" },
  service_agreement:    { title: "Service Agreement",          description: "Defines the scope, expectations, and terms of the service to be performed.",       category: "service_agreement" },
  acknowledgment_form:  { title: "Acknowledgment Form",        description: "Customer acknowledges specific conditions, limitations, or risks.",                  category: "condition_acknowledgment" },

  // ─── Informational document types ───────────────────────────────────────
  // The deterministic engine produces a minimal title + prompt-derived body
  // for these. Real per-type generation is a Phase-A.5 / Phase-B task that
  // will replace the body with a Gemini-generated draft.
  aftercare:        { title: "Aftercare Instructions",       description: "Post-service care instructions for the customer.",                                   category: "custom" },
  prep_instructions:{ title: "Customer Prep Instructions",   description: "Pre-appointment preparation instructions for the customer.",                         category: "custom" },
  brochure:         { title: "Service Brochure",             description: "Customer-facing brochure describing a service and what it includes.",                category: "custom" },
  maintenance_guide:{ title: "Maintenance Guide",            description: "Ongoing maintenance instructions for the customer.",                                 category: "custom" },
  warranty_care:    { title: "Warranty / Care Guide",        description: "Warranty terms and recommended care to preserve coverage.",                          category: "custom" },
  follow_up_email:  { title: "Follow-up Email",              description: "Post-service follow-up email content.",                                              category: "custom" },
  custom_document:  { title: "Custom Document",              description: "A custom customer-facing document.",                                                 category: "custom" },
};

export const INFORMATIONAL_TYPES = new Set<string>([
  "aftercare", "prep_instructions", "brochure", "maintenance_guide",
  "warranty_care", "follow_up_email", "custom_document",
]);

export function isInformationalType(type: string): boolean {
  return INFORMATIONAL_TYPES.has(type);
}

// Per–document-type clause seed. Keys reference STANDARD_CLAUSES. When a type
// has an entry here, those clauses are used as the deterministic baseline so
// the generated body contains meaningful terms specific to the chosen doc —
// not the generic preExistingDamage/photoAuth defaults the modal used to seed.
const TYPE_SPECIFIC_DEFAULT_CLAUSES: Record<string, string[]> = {
  payment: [
    "paymentDue",
    "acceptedMethods",
    "deposits",
    "lateFees",
    "additionalCharges",
    "chargebacks",
    "collections",
  ],
  cancellation:        ["cancellation"],
  photo:               ["photoAuth"],
  mobile:              ["mobileAccess"],
  ceramic:             ["ceramicCoating", "preExistingDamage"],
  paint:               ["paintCorrection", "preExistingDamage"],
  interior:            ["interiorStain", "preExistingDamage"],
  liability:           ["preExistingDamage", "paintCorrection", "interiorStain"],
  service_agreement:   ["preExistingDamage", "paymentTerms"],
  acknowledgment_form: ["preExistingDamage"],
  general:             ["preExistingDamage"],
};

// Shell-shaped output that should never reach the customer-facing document body.
// The preview shell already owns title/customer/date/signature/etc., so any
// clause that just repeats the document title or is a generic intro/SERVICE-
// metadata line gets filtered before assembly.
export function isShellOnlyClause(
  clause: { title: string; text?: string; category?: string },
  documentTitle: string,
): boolean {
  const t = clause.title.trim().toLowerCase();
  const docT = documentTitle.trim().toLowerCase();
  if (t === docT) return true;
  if (t === "introduction") return true;
  // SERVICE: metadata line is shell metadata.
  if ((clause.text ?? "").trim().match(/^SERVICE:\s/i)) return true;
  return false;
}

// ─── ID helper (cross-runtime safe) ────────────────────────────────────────

let _cid = 0;
function makeClauseId(): string {
  _cid += 1;
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) return (crypto as any).randomUUID();
  return `cls_${Date.now()}_${_cid}`;
}

// ─── Hint matchers — given a free-text hint string and a clause title,
//     decide whether the owner's hint applies to that clause. ─────────────

function hintMatchesClause(hint: string | undefined, clauseTitle: string): boolean {
  if (!hint?.trim()) return false;
  const haystack = clauseTitle.toLowerCase();
  const words = hint
    .toLowerCase()
    .split(/[\s,\.;:]+/)
    .map(w => w.trim())
    .filter(w => w.length >= 4);
  return words.some(w => haystack.includes(w));
}

// ─── Build proposed clauses from all inputs ────────────────────────────────

export function buildProposedClauses(input: DraftInput): ProposedClause[] {
  // TODO(Phase A.5): replace this deterministic clause-stitcher with a real
  // Gemini call (see src/services/gemini.ts) that takes prompt + documentClass
  // + waiverType + serviceType + tone and returns a structured draft. For
  // informational types in particular, the templated output below is a
  // placeholder — the proper result should be an LLM-written body.
  // Skip the placeholder generator when the owner walked through the interview —
  // their answers should be honoured and converted into real clauses, even for
  // informational doc types.
  if (
    isInformationalType(input.waiverType)
    && !input.requiresAcknowledgment
    && !input.interviewCompleted
  ) {
    return buildInformationalDraft(input);
  }

  const out: ProposedClause[] = [];
  const seen = new Set<string>();
  const ans = input.interviewAnswers;

  const defaults = (): ProposedClause["activation"] => ({
    appliesToSelectedServices: false,
    appliesToSelectedRiskFlags: false,
    showBeforeBooking: ans.blockUntilSigned?.includes("booking") ?? false,
    showBeforeJobStart: ans.blockUntilSigned?.includes("job_start") ?? true,
    attachToInvoice: false,
    requireBeforePayment: ans.blockUntilSigned?.includes("payment") ?? false,
    requireBeforeTechBegins: ans.blockUntilSigned?.includes("job_start") ?? true,
  });

  // 1) Seed clauses: type-specific defaults first, then any owner-selected
  // protections from the optional-protections checklist. The legacy generic
  // Introduction / SERVICE-metadata clause has been removed — that content
  // belongs in the preview shell (title) and the template's usage rules, not
  // in the customer-facing document body.
  const seedKeys = [
    ...(TYPE_SPECIFIC_DEFAULT_CLAUSES[input.waiverType] ?? []),
    ...input.selectedProtections,
  ];

  for (const key of seedKeys) {
    const c = STANDARD_CLAUSES[key];
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(toClause(c, "checkbox", defaults, ans));
  }

  // 3) Standard clauses inferred from the prompt keywords
  if (input.prompt.trim()) {
    for (const { match, key } of KEYWORD_MAP) {
      const c = STANDARD_CLAUSES[key];
      if (!c || seen.has(c.id)) continue;
      if (match.test(input.prompt)) {
        seen.add(c.id);
        out.push(toClause(c, "prompt", defaults, ans));
      }
    }
  }

  // 4) Stronger-language risks → standalone "Critical Risks" clause
  if (ans.strongerLanguageRisks?.trim()) {
    out.push({
      id: makeClauseId(),
      title: "Critical Risks — Strong Language",
      text:
        "CUSTOMER ACKNOWLEDGES THE FOLLOWING RISKS:\n\n" +
        ans.strongerLanguageRisks.trim() +
        "\n\nCustomer knowingly and voluntarily accepts these risks as part of the requested service.",
      category: "risk",
      customerVisible: true,
      requireAcceptance: true,
      requireInitials: true,
      requireSignature: false,
      optionalConsent: false,
      activation: defaults(),
      source: "interview",
    });
  }

  // 5) Acknowledged risks → general acknowledgment clause
  if (ans.acknowledgedRisks?.trim()) {
    out.push({
      id: makeClauseId(),
      title: "Acknowledged Risks",
      text:
        "Customer specifically acknowledges and accepts the following risks:\n\n" +
        ans.acknowledgedRisks.trim(),
      category: "risk",
      customerVisible: true,
      requireAcceptance: true,
      requireInitials: false,
      requireSignature: false,
      optionalConsent: false,
      activation: defaults(),
      source: "interview",
    });
  }

  // 6) Custom protections from the modal's custom list
  for (const cp of input.customProtections) {
    const title = cp.title.trim();
    if (!title) continue;
    const PLACEHOLDER = "(Add the wording for this clause here — this is a placeholder you can edit in the document canvas.)";
    out.push({
      id: makeClauseId(),
      title,
      text: cp.description.trim() || PLACEHOLDER,
      category: "custom",
      customerVisible: true,
      requireAcceptance: cp.requireAck || cp.requireInitials,
      requireInitials: cp.requireInitials,
      requireSignature: false,
      optionalConsent: false,
      activation: defaults(),
      source: "custom",
    });
  }

  // 7) Exact-wording clause (verbatim from interview)
  if (ans.exactWording?.trim()) {
    out.push({
      id: makeClauseId(),
      title: "Specific Acknowledgment",
      text: ans.exactWording.trim(),
      category: "agreement",
      customerVisible: true,
      requireAcceptance: true,
      requireInitials: false,
      requireSignature: false,
      optionalConsent: false,
      activation: defaults(),
      source: "exact_wording",
    });
  }

  // 8) Apply interview hints — initials/signature/optional-consent overrides
  for (const c of out) {
    if (hintMatchesClause(ans.initialsClauseHints, c.title)) c.requireInitials = true;
    if (hintMatchesClause(ans.signatureClauseHints, c.title)) c.requireSignature = true;
    if (hintMatchesClause(ans.optionalConsentHints, c.title)) {
      c.optionalConsent = true;
      c.requireAcceptance = false;
    }
  }

  // 9) Entire-agreement closer
  out.push({
    id: makeClauseId(),
    title: "Entire Agreement",
    text:
      input.tone === "strict"
        ? "This document constitutes the entire agreement between the parties regarding the subject matter herein and supersedes any prior agreement, written or oral."
        : "This document covers what we've agreed to for this service. Anything not listed here isn't part of this agreement.",
    category: "agreement",
    customerVisible: true,
    requireAcceptance: false,
    requireInitials: false,
    requireSignature: false,
    optionalConsent: false,
    activation: defaults(),
    source: "prompt",
  });

  // 10) Internal note from interview — never shown to customer.
  if (ans.internalNotes?.trim()) {
    out.push({
      id: makeClauseId(),
      title: "Internal Note",
      text: ans.internalNotes.trim(),
      category: "internal_note",
      customerVisible: false,
      requireAcceptance: false,
      requireInitials: false,
      requireSignature: false,
      optionalConsent: false,
      activation: { ...defaults(), showBeforeBooking: false, showBeforeJobStart: false, requireBeforePayment: false, requireBeforeTechBegins: false },
      source: "interview",
    });
  }

  return out;
}

function toClause(
  c: StandardClause,
  source: ProposedClause["source"],
  defaults: () => ProposedClause["activation"],
  ans: InterviewAnswers,
): ProposedClause {
  return {
    id: makeClauseId(),
    title: c.title,
    text: c.text,
    category: c.category,
    customerVisible: true,
    requireAcceptance: true,
    requireInitials: c.defaultInitials ?? false,
    requireSignature: false,
    optionalConsent: false,
    activation: defaults(),
    source,
  };
}

// ─── Convert reviewed clauses → final DraftOutput (blocks + legacy fields) ─

export function buildDraftFromClauses(
  input: DraftInput,
  clauses: ProposedClause[],
): DraftOutput {
  const typeMeta = TYPE_META[input.waiverType] ?? TYPE_META.liability;

  // Customer-facing text content (legacy `content` field used by CustomerSigning
  // and PDF rendering). Internal-only clauses are excluded.
  const lines: string[] = [];
  const acknowledgments: string[] =
    input.documentClass === "informational" && !input.requiresAcknowledgment && !input.interviewCompleted
      ? []
      : [
          "I have read and understand the terms above.",
          "I am the owner of the vehicle or am authorized to make decisions about it.",
          "I voluntarily agree to the terms and conditions of this document.",
        ];

  // ── Blocks ──
  const blocks: WaiverBlock[] = [];
  let order = 0;

  // No header block — the preview shell already renders the title at the top.
  // Emitting it again here would duplicate the heading. Strip any shell-shaped
  // clauses (duplicate title, generic "Introduction", SERVICE: metadata line)
  // so the body contains meaningful terms only.
  const bodyClauses = clauses.filter(c => !isShellOnlyClause(c, typeMeta.title));

  for (const c of bodyClauses) {
    // Block representation — every clause becomes a block (incl. internal-only).
    const block: WaiverBlock = {
      id: c.id,
      type: "legalText",
      title: c.title,
      content: c.text,
      required: c.requireAcceptance || c.requireInitials || c.requireSignature,
      order: order++,
      settings: {
        clauseCategory: c.category,
        internalOnly: !c.customerVisible,
        requireAcceptance: c.requireAcceptance,
        requireInitials: c.requireInitials,
        requireSignature: c.requireSignature,
        optionalConsent: c.optionalConsent,
        activation: c.activation,
        source: c.source,
      },
    };
    blocks.push(block);

    if (c.customerVisible) {
      // Append clause to plain-text body
      lines.push(c.title.toUpperCase());
      lines.push(c.text);
      lines.push("");

      if (c.requireAcceptance && !c.optionalConsent) {
        blocks.push({
          id: makeClauseId(),
          type: "acknowledgmentCheckbox",
          title: `I acknowledge: ${c.title}.`,
          required: true,
          order: order++,
          settings: { boundClauseId: c.id },
        });
        acknowledgments.push(`I acknowledge: ${c.title}.`);
      } else if (c.optionalConsent) {
        blocks.push({
          id: makeClauseId(),
          type: "acknowledgmentCheckbox",
          title: `I consent to: ${c.title}. (Optional)`,
          required: false,
          order: order++,
          settings: { boundClauseId: c.id, optionalConsent: true },
        });
      }

      if (c.requireInitials) {
        blocks.push({
          id: makeClauseId(),
          type: "initials",
          title: `Initial — ${c.title}`,
          required: true,
          order: order++,
          settings: { boundClauseId: c.id },
        });
      }

      if (c.requireSignature) {
        blocks.push({
          id: makeClauseId(),
          type: "signature",
          title: `Signature — ${c.title}`,
          required: true,
          order: order++,
          settings: { boundClauseId: c.id, perClause: true },
        });
      }
    }
  }

  // Closer: standard customer info + date + final signature.
  // Skipped for informational documents that don't require acknowledgment.
  const isInfoNoAck = input.documentClass === "informational" && !input.requiresAcknowledgment && !input.interviewCompleted;
  if (!isInfoNoAck) {
    blocks.push({ id: makeClauseId(), type: "customerInfo", title: "Customer Information", required: true, order: order++ });
    blocks.push({ id: makeClauseId(), type: "date", title: "Date", required: true, order: order++ });
    blocks.push({ id: makeClauseId(), type: "signature", title: "Signature", required: true, order: order++ });
  }

  const anyInitials = bodyClauses.some(c => c.customerVisible && c.requireInitials);

  return {
    title: typeMeta.title,
    customerTitle: typeMeta.title,
    internalDescription:
      `${typeMeta.description}${input.serviceType ? ` Tuned for: ${input.serviceType}.` : ""}` +
      (input.prompt.trim() ? `\n\nFrom prompt: ${input.prompt.trim().slice(0, 240)}` : ""),
    category: typeMeta.category,
    riskLevel: input.riskLevel,
    content: lines.join("\n"),
    acknowledgments,
    requiresInitials: anyInitials || input.riskLevel === "high" || input.riskLevel === "critical",
    blocks,
    documentClass: input.documentClass,
    requiresAcknowledgment: input.requiresAcknowledgment,
  };
}

// ─── Informational document placeholder generator ──────────────────────────
// Produces a small structured starter document (intro + a few section headings
// matched to the document type) rather than a single blob. The owner's prompt
// becomes the body of an "Overview" section; the remaining sections are empty
// scaffolding the owner fills in.
//
// This is still deterministic — real per-type body generation requires Gemini
// (see TODO above buildProposedClauses).
function buildInformationalDraft(input: DraftInput): ProposedClause[] {
  const meta = TYPE_META[input.waiverType] ?? TYPE_META.custom_document;
  const promptText = input.prompt.trim();
  const focus = input.serviceType.trim();

  const sections = INFORMATIONAL_SECTIONS[input.waiverType] ?? INFORMATIONAL_SECTIONS.custom_document;

  const baseActivation: ProposedClause["activation"] = {
    appliesToSelectedServices: false,
    appliesToSelectedRiskFlags: false,
    showBeforeBooking: false,
    showBeforeJobStart: false,
    attachToInvoice: false,
    requireBeforePayment: false,
    requireBeforeTechBegins: false,
  };

  const overviewBody = promptText
    || `${meta.description}${focus ? ` Service focus: ${focus}.` : ""}`;

  const clauses: ProposedClause[] = [
    {
      id: makeClauseId(),
      title: "Overview",
      text: overviewBody,
      category: "custom",
      customerVisible: true,
      requireAcceptance: false,
      requireInitials: false,
      requireSignature: false,
      optionalConsent: false,
      activation: baseActivation,
      source: "prompt",
    },
  ];

  for (const section of sections) {
    clauses.push({
      id: makeClauseId(),
      title: section.title,
      text: section.placeholder,
      category: "custom",
      customerVisible: true,
      requireAcceptance: false,
      requireInitials: false,
      requireSignature: false,
      optionalConsent: false,
      activation: baseActivation,
      source: "prompt",
    });
  }

  return clauses;
}

interface InformationalSection { title: string; placeholder: string }

// Section scaffolding per informational doc type. Each `placeholder` is a
// short starter sentence the owner edits before activating.
const INFORMATIONAL_SECTIONS: Record<string, InformationalSection[]> = {
  aftercare: [
    { title: "Care Instructions",   placeholder: "Recommended washing, drying, and product guidance for the days and weeks following the service." },
    { title: "What to Avoid",       placeholder: "Activities, products, or conditions the customer should avoid while the service settles in." },
    { title: "Maintenance Tips",    placeholder: "Ongoing habits that protect the result over time." },
    { title: "When to Contact Us",  placeholder: "Signs that warrant a follow-up — and how to reach the business." },
  ],
  prep_instructions: [
    { title: "Before Your Appointment", placeholder: "What the customer should do to prepare the vehicle and the service area." },
    { title: "What to Have Ready",      placeholder: "Items, access, or information the technician will need on arrival." },
    { title: "Day-of Reminders",        placeholder: "Last-minute checks and timing notes." },
  ],
  brochure: [
    { title: "What's Included",      placeholder: "A clear description of what the service covers and the typical duration." },
    { title: "Why Choose This Service", placeholder: "Key benefits, materials used, and what makes this service worth the investment." },
    { title: "Aftercare Summary",    placeholder: "A short note on how the customer protects the result after service." },
    { title: "What's Not Covered",   placeholder: "Conditions, defects, or repairs outside the scope of this service." },
  ],
  maintenance_guide: [
    { title: "Routine Care",       placeholder: "Daily and weekly habits that maintain the finish or interior." },
    { title: "Periodic Maintenance", placeholder: "Recommended monthly or seasonal upkeep." },
    { title: "What to Avoid",      placeholder: "Products, tools, or environments that shorten the result." },
  ],
  warranty_care: [
    { title: "What's Covered",        placeholder: "The conditions and defects the warranty applies to, including the coverage period." },
    { title: "What's Not Covered",    placeholder: "Exclusions, voiding behaviors, and limitations." },
    { title: "Maintenance Required",  placeholder: "Care steps required to keep the warranty in effect." },
    { title: "How to File a Claim",   placeholder: "Steps for the customer if they believe they have a covered issue." },
  ],
  follow_up_email: [
    { title: "Thank You",         placeholder: "A short, warm thank-you that names the service performed." },
    { title: "Aftercare Reminder", placeholder: "A friendly reminder of the most important care step from the aftercare guide." },
    { title: "Next Steps",        placeholder: "Recommendations for the next service, upgrade, or maintenance window." },
    { title: "Review Request",    placeholder: "A polite ask for a review or referral, with a link if available." },
  ],
  custom_document: [
    { title: "Details", placeholder: "Add the body of your document here." },
  ],
};
