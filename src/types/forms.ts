import type { Timestamp } from "firebase/firestore";

export type FormCategory =
  | "liability"
  | "service_agreement"
  | "condition_acknowledgment"
  | "deposit_policy"
  | "disclosure"
  | "authorization"
  | "custom";

export type SignatureFrequency =
  | "every_job"
  | "once_per_client"
  | "once_per_vehicle"
  | "expires_after"
  | "optional";

export type FormEnforcement = "before_start" | "before_booking" | "optional";

export interface FormTemplate {
  id: string;
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type FormInstanceStatus = "pending" | "sent" | "signed" | "expired" | "waived";

export interface FormInstance {
  id: string;
  templateId: string;
  templateTitle: string;
  templateVersion: number;
  appointmentId: string;
  clientId: string;
  vehicleId?: string;
  status: FormInstanceStatus;
  required: boolean;
  signingToken?: string;
  sentAt?: Timestamp;
  signedAt?: Timestamp;
  waivedAt?: Timestamp;
  waivedBy?: string;
  waivedReason?: string;
  createdAt: Timestamp;
}

export interface SignedFormRecord {
  id: string;
  formId: string;
  formVersion: number;
  formTitle: string;
  appointmentId: string;
  clientId: string;
  vehicleId?: string;
  signature: string;
  printedName: string;
  date: string;
  initials: string;
  photos: string[];
  acknowledgments: boolean[];
  signedAt: Timestamp;
  ipAddress?: string;
  userAgent?: string;
}

export interface FormRequirement {
  template: FormTemplate;
  reason: string;
  required: boolean;
}

export interface FormComplianceStatus {
  allSigned: boolean;
  required: FormRequirement[];
  signed: SignedFormRecord[];
  pending: FormRequirement[];
  canStartJob: boolean;
}
