import type { FormCategory } from "../types/forms";

export type RecommendedTemplateKey =
  | "general_service_agreement"
  | "pre_existing_damage"
  | "photo_video_release"
  | "ceramic_coating_care"
  | "paint_correction_risk"
  | "payment_late_fee"
  | "mobile_service_access"
  | "cancellation_no_show"
  | "interior_stain_odor"
  | "pet_hair_limitation";

export type ProtectionStyle = "simple" | "balanced" | "stronger";

export interface RecommendedTemplate {
  key: RecommendedTemplateKey;
  title: string;
  category: FormCategory;
  shortDescription: string;
  body: Record<ProtectionStyle, string>;
  acknowledgments: Record<ProtectionStyle, string[]>;
  requiresInitials?: boolean;
}

const LEGAL_DISCLAIMER =
  "NOT LEGAL ADVICE. This is a starter document. Please have a qualified attorney review before customer use.";

export const RECOMMENDED_TEMPLATES: Record<RecommendedTemplateKey, RecommendedTemplate> = {
  general_service_agreement: {
    key: "general_service_agreement",
    title: "General Service Agreement",
    category: "service_agreement",
    shortDescription: "Confirms the customer understands the scope, results, and limits of the detailing service.",
    body: {
      simple:
        "Thank you for choosing our detailing service. By signing below, you agree to the work being performed on your vehicle and confirm that the scope and pricing have been explained to you. We will do our best to deliver excellent results, but some conditions may limit what is achievable.",
      balanced:
        "By signing this agreement, you authorize us to perform the detailing services described in your booking. You confirm that the scope of work, pricing, and estimated duration have been explained. Results depend on the existing condition of the vehicle and cannot be guaranteed in all cases. We will use industry-standard products and techniques and inform you of any unexpected findings before performing additional work.",
      stronger:
        "By signing, you authorize the detailing services described in your booking and confirm that pricing, scope, and timing have been explained. You acknowledge that final results depend on the pre-existing condition of the vehicle, environmental factors, and the materials involved. We make no guarantee of any specific outcome beyond best-effort professional workmanship. Any additional work outside the agreed scope must be approved by you in writing or by signed change order before being performed.",
    },
    acknowledgments: {
      simple: ["I understand and agree to the services being performed."],
      balanced: [
        "I understand the scope and pricing of the services to be performed.",
        "I understand that results depend on the vehicle's existing condition.",
      ],
      stronger: [
        "I authorize the detailing services described in my booking.",
        "I understand that results depend on pre-existing condition and materials.",
        "I agree that additional work outside scope requires my approval.",
      ],
    },
  },

  pre_existing_damage: {
    key: "pre_existing_damage",
    title: "Pre-Existing Damage Acknowledgment",
    category: "condition_acknowledgment",
    shortDescription: "Acknowledges scratches, chips, oxidation, dents, and other pre-existing conditions.",
    body: {
      simple:
        "Vehicles often arrive with existing scratches, chips, dents, stains, or other wear. Our service cannot repair damage that was already present, and pre-existing issues may become more visible after cleaning or polishing. By signing, you acknowledge that any prior damage is not the responsibility of the detailer.",
      balanced:
        "Many vehicles arrive with pre-existing conditions including but not limited to: scratches, rock chips, paint oxidation, swirl marks, dents, dings, failing clear coat, interior stains, odors, and prior amateur repairs. These conditions cannot be repaired by detailing alone and may become more visible after the surface is cleaned, polished, or coated. We will document the vehicle's condition before starting work where possible, and any such issues identified before or during service are not the responsibility of the detailer.",
      stronger:
        "You acknowledge that the vehicle may arrive with one or more pre-existing conditions including, without limitation: scratches, rock chips, paint oxidation, swirl marks, water spots, dents, dings, failing or delaminating clear coat, paint thinning from prior compounding, interior stains, odors, mechanical issues, broken or missing trim, and prior amateur repairs. Detailing services do not repair such damage and may make pre-existing issues more visible after cleaning, polishing, or coating. We are not liable for pre-existing conditions, for failure of compromised paint or trim during normal service, or for any damage that results from previously undisclosed modifications or repairs to the vehicle.",
    },
    acknowledgments: {
      simple: ["I understand that pre-existing damage cannot be repaired by detailing."],
      balanced: [
        "I acknowledge that my vehicle may have pre-existing damage.",
        "I understand pre-existing issues may become more visible after cleaning or polishing.",
      ],
      stronger: [
        "I acknowledge pre-existing damage including any not visible at intake.",
        "I understand that compromised paint or trim may fail during normal service.",
        "I release the detailer from liability for pre-existing conditions.",
      ],
    },
    requiresInitials: true,
  },

  photo_video_release: {
    key: "photo_video_release",
    title: "Photo / Video Release",
    category: "authorization",
    shortDescription: "Authorizes photos of the vehicle for documentation and marketing.",
    body: {
      simple:
        "We may take before-and-after photos or short videos of your vehicle for our records and to share examples of our work. By signing, you authorize us to use these photos for documentation and marketing. License plates and other identifying details will be obscured on request.",
      balanced:
        "We may capture photographs or short video clips of your vehicle before, during, and after the detailing service. These may be used for service documentation, training, social media, and marketing purposes. By signing, you grant us a non-exclusive, royalty-free license to use such images. License plates, personal items, and identifying details will be blurred or excluded if you request.",
      stronger:
        "You grant us a perpetual, non-exclusive, royalty-free, worldwide license to use photographs and video recordings of your vehicle before, during, and after service for documentation, training, marketing, social media, and promotional use across any medium. You waive any right to inspect or approve the finished material. License plates and other identifying details will be obscured on written request received prior to publication.",
    },
    acknowledgments: {
      simple: ["I authorize the use of photos of my vehicle for documentation and marketing."],
      balanced: [
        "I authorize photos and short video of my vehicle to be used for marketing and documentation.",
        "I understand identifying details will be obscured on request.",
      ],
      stronger: [
        "I grant a non-exclusive, royalty-free license to use images of my vehicle.",
        "I waive any right to approve specific use of the resulting material.",
      ],
    },
  },

  ceramic_coating_care: {
    key: "ceramic_coating_care",
    title: "Ceramic Coating Care Agreement",
    category: "service_agreement",
    shortDescription: "Sets expectations for cure time, maintenance, and warranty conditions.",
    body: {
      simple:
        "Ceramic coatings need time to cure and ongoing maintenance to perform as expected. Please avoid washing your vehicle for the first 7 days, and avoid harsh chemicals or automatic car washes. Following our care guidelines protects the coating and your warranty.",
      balanced:
        "Ceramic coatings require a curing period of approximately 7 days, during which the coated surfaces should not be washed, exposed to rain or sprinklers when avoidable, or treated with any chemical product. After cure, the coating should be maintained with pH-neutral products and hand washing only. Automatic car washes, abrasive sponges, and acidic cleaners can damage the coating and may void any warranty. Annual or semi-annual maintenance inspections may be required to keep any warranty in effect.",
      stronger:
        "Ceramic coatings require a minimum 7-day cure period before any wash or exposure to harsh weather. During cure, the coated surfaces must not be washed, waxed, polished, exposed to acidic or alkaline chemicals, or run through any automated wash. After cure, only pH-neutral products and clean wash media may be used, and only hand washing is permitted. Use of automatic car washes, brushes, abrasive sponges, acidic wheel cleaners, or non-approved products voids any coating warranty. To maintain warranty coverage, annual maintenance inspections at our facility are required at the customer's expense unless otherwise specified. We are not liable for premature coating failure caused by improper maintenance, environmental damage, accident, or modifications.",
    },
    acknowledgments: {
      simple: [
        "I will not wash my vehicle for the first 7 days after coating.",
        "I will follow the care guidelines provided.",
      ],
      balanced: [
        "I understand the 7-day cure period restrictions.",
        "I will use only pH-neutral products and hand washing.",
        "I understand that improper maintenance may void the warranty.",
      ],
      stronger: [
        "I understand the cure-period restrictions on the coating.",
        "I will not use automatic car washes, brushes, or non-approved products.",
        "I understand that annual inspections may be required to keep the warranty valid.",
      ],
    },
    requiresInitials: true,
  },

  paint_correction_risk: {
    key: "paint_correction_risk",
    title: "Paint Correction Risk Acknowledgment",
    category: "condition_acknowledgment",
    shortDescription: "Acknowledges that paint correction removes clear coat and carries inherent risks.",
    body: {
      simple:
        "Paint correction removes a thin layer of clear coat to reduce scratches and swirls. Results vary depending on paint condition, depth of damage, and prior work. Some defects may remain. By signing, you understand that paint correction is not a guarantee that every imperfection will be removed.",
      balanced:
        "Paint correction is a controlled abrasive process that removes a microscopic layer of clear coat to reduce scratches, swirls, and oxidation. Results depend on the paint's current thickness, the depth and severity of defects, prior body work or repaints, and the type of paint. Deep scratches, sand scratches, and defects through the clear coat may not be fully removable. Limited additional correction may not be possible if clear coat is already thin.",
      stronger:
        "Paint correction is an abrasive process that permanently removes a measurable layer of clear coat to reduce surface defects. Inherent risks include but are not limited to: incomplete defect removal, paint strike-through on edges or compromised areas, lifting of poorly adhered paint or trim, exposure of underlying body work or repaints, and reduced future correction capacity. We may decline to continue correction on any panel where we believe further work would compromise the paint. By signing, you accept these risks and release us from liability for cosmetic defects that cannot be fully corrected and for paint or trim failure caused by pre-existing conditions.",
    },
    acknowledgments: {
      simple: ["I understand that paint correction cannot remove every imperfection."],
      balanced: [
        "I understand paint correction removes clear coat and is not always reversible.",
        "I understand some defects may remain after correction.",
      ],
      stronger: [
        "I understand paint correction removes clear coat permanently.",
        "I accept the risks of strike-through, trim lifting, and incomplete correction.",
        "I release the detailer from liability for cosmetic defects that cannot be fully corrected.",
      ],
    },
    requiresInitials: true,
  },

  payment_late_fee: {
    key: "payment_late_fee",
    title: "Payment & Late Fee Terms",
    category: "deposit_policy",
    shortDescription: "Confirms payment is due per invoice and explains any late fees.",
    body: {
      simple:
        "Payment is due according to the terms on your invoice or booking confirmation. If payment is not received on time, a late fee may apply as described in your invoice or our published policy.",
      balanced:
        "Payment is due according to the terms on your booking or invoice. Accepted payment methods are listed at booking. If payment is not received by the due date, a late fee may be applied and additional services may be paused until the balance is resolved. Returned payments may incur a separate processing fee.",
      stronger:
        "Payment is due according to the terms shown on your booking confirmation or invoice. If payment is not received by the due date, late fees will be applied at the rate stated in our published policy, and any future service may be paused or declined until the balance is paid in full. Returned payments, charge-backs filed without first contacting us, and disputed amounts found in our favor may incur additional processing and recovery fees, and the customer remains responsible for the original balance plus any reasonable collection costs.",
    },
    acknowledgments: {
      simple: ["I agree to pay according to the invoice or booking terms."],
      balanced: [
        "I agree to the payment due date on the invoice.",
        "I understand a late fee may apply.",
      ],
      stronger: [
        "I agree to the published payment and late fee policy.",
        "I understand returned payments and improper chargebacks may incur additional fees.",
      ],
    },
  },

  mobile_service_access: {
    key: "mobile_service_access",
    title: "Mobile Service Access Permission",
    category: "authorization",
    shortDescription: "Confirms safe access to the vehicle and any required utilities at the service location.",
    body: {
      simple:
        "For mobile service, please make sure we can reach your vehicle and have access to water and a power outlet if our service requires them. By signing, you give us permission to perform the work at the address you provided.",
      balanced:
        "For mobile detailing, you agree to provide reasonable access to your vehicle at the address provided, including a safe area for us to work and, if applicable, access to water and a standard power outlet. You confirm that you have authority to permit work at this location. We will be respectful of property and follow any reasonable requests, and we are not responsible for HOA or property-rule violations of which we were not informed.",
      stronger:
        "By scheduling mobile service, you confirm that (a) you have the legal authority to permit work at the address provided, (b) you will provide a reasonably safe area for the technician and equipment, (c) you will provide access to water and a standard 110-120V outlet if requested, (d) the vehicle will be accessible and unlocked or keys made available at the scheduled time, and (e) you have informed us of any HOA, condo, or property restrictions that may affect mobile work. You agree to hold the detailer harmless for any property-rule, HOA, or municipal violation arising from work performed at your direction at the specified address.",
    },
    acknowledgments: {
      simple: [
        "I confirm I can give access to the vehicle at the address provided.",
        "I will provide water and power if needed.",
      ],
      balanced: [
        "I have the authority to permit work at this address.",
        "I will provide safe access and any required utilities.",
      ],
      stronger: [
        "I have legal authority to permit mobile service at this address.",
        "I have disclosed any HOA or property restrictions affecting the work.",
        "I agree to hold the detailer harmless for property-rule violations at my direction.",
      ],
    },
  },

  cancellation_no_show: {
    key: "cancellation_no_show",
    title: "Cancellation / No-Show Policy",
    category: "deposit_policy",
    shortDescription: "Explains cancellation windows and any fees for late cancel or no-show.",
    body: {
      simple:
        "We ask that you cancel or reschedule with as much notice as possible. Late cancellations or no-shows may be subject to a fee as described in your booking confirmation.",
      balanced:
        "Appointments may be cancelled or rescheduled up to the window specified in your booking confirmation without penalty. Cancellations made after that window, or no-shows, may incur a cancellation fee. We reserve the right to require a deposit for re-bookings after a no-show.",
      stronger:
        "Appointments may be cancelled or rescheduled without penalty only within the window stated in the booking confirmation. Cancellations made inside that window, no-shows, and same-day reschedules will incur a cancellation fee at the rate stated in our published policy or in the booking confirmation, charged to the payment method on file. Repeated cancellations or no-shows may require a non-refundable deposit for any future booking and may result in declined service.",
    },
    acknowledgments: {
      simple: ["I understand a fee may apply if I cancel late or miss my appointment."],
      balanced: [
        "I will cancel or reschedule within the window in the booking confirmation when possible.",
        "I understand a late-cancel or no-show fee may apply.",
      ],
      stronger: [
        "I understand the published cancellation and no-show policy.",
        "I authorize cancellation fees to be charged to the payment method on file.",
        "I understand repeated cancellations may require a non-refundable deposit.",
      ],
    },
  },

  interior_stain_odor: {
    key: "interior_stain_odor",
    title: "Interior Stain & Odor Limitation",
    category: "condition_acknowledgment",
    shortDescription: "Sets expectations that not every stain or odor can be fully removed.",
    body: {
      simple:
        "Interior detailing significantly improves the look and smell of most vehicles, but not every stain or odor can be fully removed. Severe stains, set-in odors, biological matter, and damaged fabric may have limited results.",
      balanced:
        "Interior detailing improves the appearance and odor of most vehicles, but some stains and odors are limited by age, depth, fabric type, and prior damage. Conditions such as smoke saturation, biological contamination, ink, dye transfer, sun damage, and water damage may not be fully removable. We will use professional products and techniques and inform you if a particular issue appears unlikely to fully resolve.",
      stronger:
        "Interior detailing improves the appearance and odor of most vehicles, but final results are subject to the type, age, and depth of contamination, the fabric and material composition, and any prior damage or treatment. Conditions including, without limitation, heavy smoke saturation, biological contamination, mildew, ink, dye transfer, sun damage, water damage, and dyes that have permanently stained the substrate may not be fully removable. We make no guarantee of complete stain or odor removal, and we are not liable for residual marks or smells caused by such pre-existing conditions.",
    },
    acknowledgments: {
      simple: ["I understand not every stain or odor can be fully removed."],
      balanced: [
        "I understand some stains and odors may have limited results.",
        "I will be informed before extra work outside the booked scope.",
      ],
      stronger: [
        "I understand certain conditions cannot be fully removed.",
        "I release the detailer from liability for residual stains or odors caused by pre-existing damage.",
      ],
    },
  },

  pet_hair_limitation: {
    key: "pet_hair_limitation",
    title: "Pet Hair Removal Limitation",
    category: "condition_acknowledgment",
    shortDescription: "Acknowledges that pet hair removal is labor-intensive and not always 100% effective.",
    body: {
      simple:
        "Pet hair removal is one of the most labor-intensive parts of detailing. We will remove as much as reasonably possible, but small amounts may remain in seams, vents, and tight areas.",
      balanced:
        "Pet hair removal is time-intensive and depends on the type of hair, the fabric or carpet, and the extent of contamination. We will perform thorough removal using professional tools, but small amounts may remain in seams, headliners, vents, and other tight areas. Heavy-contamination jobs may exceed the standard time allotted and require an additional fee, which we will explain before continuing.",
      stronger:
        "Pet hair removal is labor-intensive and limited by hair type, fabric and carpet composition, the level of contamination, and the time available in your booking. We will perform thorough removal using professional tools and techniques, but it is not always possible to remove 100% of hair from seams, headliners, vents, and similar areas. Heavy-contamination jobs may exceed the standard time allotted and require an additional fee, which we will quote before continuing. We are not liable for residual hair in inaccessible areas or for results outside the time and scope of the booked service.",
    },
    acknowledgments: {
      simple: ["I understand small amounts of pet hair may remain after detailing."],
      balanced: [
        "I understand pet hair removal time depends on the level of contamination.",
        "I will be informed before any additional fee for heavy hair removal.",
      ],
      stronger: [
        "I understand 100% pet hair removal cannot be guaranteed.",
        "I agree to any additional time-and-materials fee disclosed before extra work begins.",
      ],
    },
  },
};

export interface ServiceOption { value: string; label: string }
export interface ProtectionOption { value: string; label: string }
export interface StyleOption { value: ProtectionStyle; label: string; description: string }
export interface TimingOption {
  value: "before_booking" | "before_start" | "before_payment" | "high_risk_only";
  label: string;
  description: string;
}

export const SERVICE_OPTIONS: ServiceOption[] = [
  { value: "basic_wash", label: "Basic wash / detail" },
  { value: "interior", label: "Interior detailing" },
  { value: "exterior", label: "Exterior detailing" },
  { value: "paint_correction", label: "Paint correction" },
  { value: "ceramic_coating", label: "Ceramic coating" },
  { value: "pet_hair", label: "Pet hair removal" },
  { value: "stain_odor", label: "Stain / odor removal" },
  { value: "mobile", label: "Mobile service at customer location" },
  { value: "fleet", label: "Fleet / commercial work" },
  { value: "other", label: "Other" },
];

export const PROTECTION_OPTIONS: ProtectionOption[] = [
  { value: "pre_existing_damage", label: "Pre-existing vehicle damage" },
  { value: "paint_condition", label: "Paint condition / clear coat issues" },
  { value: "interior_stains", label: "Interior stains that may not fully come out" },
  { value: "pet_hair", label: "Pet hair limitations" },
  { value: "odor", label: "Odor removal limitations" },
  { value: "ceramic_cure", label: "Ceramic coating cure and maintenance" },
  { value: "access", label: "Customer access to vehicle / property" },
  { value: "payment_terms", label: "Payment terms" },
  { value: "late_fees", label: "Late fees" },
  { value: "cancellation", label: "Cancellation / no-show" },
  { value: "photo_video", label: "Photo / video authorization" },
  { value: "belongings", label: "Customer belongings left in vehicle" },
];

export const STYLE_OPTIONS: StyleOption[] = [
  {
    value: "simple",
    label: "Simple & customer-friendly",
    description: "Plain language, lighter tone, fewer acknowledgments.",
  },
  {
    value: "balanced",
    label: "Balanced & professional",
    description: "Clear protection without sounding heavy-handed. Recommended.",
  },
  {
    value: "stronger",
    label: "Stronger protection",
    description: "More thorough liability language and explicit acknowledgments.",
  },
];

export const TIMING_OPTIONS: TimingOption[] = [
  {
    value: "before_booking",
    label: "Before online booking is confirmed",
    description: "Customers sign as part of the online booking flow.",
  },
  {
    value: "before_start",
    label: "Before the job starts",
    description: "Customers sign on arrival, before any work begins.",
  },
  {
    value: "before_payment",
    label: "Before payment",
    description: "Required to be signed before invoice payment is collected.",
  },
  {
    value: "high_risk_only",
    label: "Only for selected high-risk services",
    description: "Sign only for ceramic, paint correction, or other premium services.",
  },
];

export { LEGAL_DISCLAIMER };
