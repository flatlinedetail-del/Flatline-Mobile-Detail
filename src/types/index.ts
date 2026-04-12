import { Timestamp, FieldValue } from "firebase/firestore";

export interface StructuredAddress {
  formattedAddress: string;
  streetNumber?: string;
  route?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  latitude: number;
  longitude: number;
  placeId?: string;
}

export type VehicleSize = "small" | "medium" | "large" | "extra_large";

export type CategoryType = "service" | "addon" | "expense" | "inventory";

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  isActive: boolean;
  sortOrder: number;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  usageLimit: number;
  usageCount: number;
  isActive: boolean;
  expiryDate?: Timestamp;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  category: string;
  basePrice: number;
  pricingBySize: Record<VehicleSize, number>;
  isTaxable: boolean;
  estimatedDuration: number; // in minutes
  bufferTimeMinutes: number; // cleanup/wrap-up time
  requiresWaiver: boolean;
  isActive: boolean;
  maintenanceReturnEnabled?: boolean;
  maintenanceIntervalDays?: number;
  maintenanceIntervalMonths?: number;
  autoCreateCalendarReturn?: boolean;
  autoCreateLeadFollowUp?: boolean;
}

export interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;
  isTaxable: boolean;
  estimatedDuration: number; // in minutes
  bufferTimeMinutes: number; // cleanup/wrap-up time
  isActive: boolean;
}

export interface ClientType {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ClientCategory {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
}

export interface Client {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  contactPerson?: string;
  email: string;
  phone: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  placeId?: string;
  addresses?: {
    id: string;
    label: string;
    address: string;
    latitude: number;
    longitude: number;
    isDefault?: boolean;
  }[];
  latitude?: number;
  longitude?: number;
  clientTypeId: string;
  categoryIds: string[];
  loyaltyPoints: number;
  membershipLevel: "none" | "silver" | "gold" | "platinum";
  isVIP: boolean;
  vipSettings?: {
    customServicePricing?: Record<string, number>;
    travelFeeDiscount?: number;
    waiveTravelFee?: boolean;
    exemptFromFees?: boolean;
    specialDiscountRules?: string;
  };
  billingCycle?: "weekly" | "biweekly" | "monthly";
  customRates?: Record<string, number>;
  notes?: string;
  createdAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
  legacyId?: string;
  legacyType?: "customer" | "vendor";
  followUpStatus?: {
    lastSentAt?: Timestamp;
    status: "pending" | "sent" | "failed" | "opted_out";
    channel?: "email" | "sms" | "both";
  };
  marketingTags?: string[];
  isOneTime?: boolean;
}

export interface Vehicle {
  id: string;
  ownerId: string;
  clientId?: string; // New unified reference
  ownerType: "customer" | "vendor" | "client";
  year: string;
  make: string;
  model: string;
  color?: string;
  vin?: string;
  licensePlate?: string;
  size: VehicleSize;
  inspectionPhotos?: string[];
  roNumber?: string;
  notes?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  latitude?: number;
  longitude?: number;
  loyaltyPoints: number;
  membershipLevel: "none" | "silver" | "gold" | "platinum";
  isVIP: boolean;
  vipSettings?: {
    customServicePricing?: Record<string, number>; // serviceId -> price
    travelFeeDiscount?: number; // percentage or fixed
    waiveTravelFee?: boolean;
    exemptFromFees?: boolean; // deposit, cancellation, late fees
    specialDiscountRules?: string;
  };
  notes?: string;
  createdAt: Timestamp;
}

export interface Vendor {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  latitude?: number;
  longitude?: number;
  billingCycle: "weekly" | "biweekly" | "monthly";
  vendorRates: Record<string, number>; // serviceId -> fixedRate
  notes?: string;
  createdAt: Timestamp;
  inspectionPhotos?: string[];
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  vehicleInfo: string;
  requestedService: string;
  source: string;
  status: "new" | "contacted" | "quoted" | "converted" | "lost";
  priority: "low" | "medium" | "high" | "hot";
  lastFollowUp?: Timestamp;
  nextFollowUpAt?: Timestamp;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Appointment {
  id: string;
  customerId: string;
  clientId?: string; // New unified reference
  customerName: string;
  customerType: "retail" | "vendor" | "client";
  vendorId?: string;
  vehicleId?: string; // Kept for compatibility
  vehicleIds?: string[]; // New: Supports multiple vehicles
  vehicleInfo: string;
  vin?: string;
  roNumber?: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  scheduledAt: Timestamp;
  status: "scheduled" | "confirmed" | "en_route" | "in_progress" | "completed" | "paid" | "canceled" | "suggested" | "requested" | "pending_approval" | "approved" | "declined" | "reschedule_suggested";
  technicianId: string;
  technicianName: string;
  serviceIds: string[];
  serviceNames: string[];
  serviceSelections?: { id: string; qty: number; price: number }[];
  addOnIds?: string[];
  addOnNames?: string[];
  addOnSelections?: { id: string; qty: number; price: number }[];
  baseAmount: number;
  travelFee: number;
  travelFeeBreakdown?: {
    miles: number;
    rate: number;
    adjustment: number;
    isRoundTrip: boolean;
  };
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  depositAmount: number;
  depositType: "fixed" | "percentage"; // New
  depositPaid: boolean; 
  depositPaidAt?: Timestamp; // New
  depositPaymentProvider?: string; // New
  paymentStatus: "unpaid" | "partial" | "paid";
  paymentMethod?: "cash" | "card" | "venmo" | "check" | "invoice";
  commissionAmount?: number;
  completedTasks: Record<string, string[]>; // serviceName -> taskList
  internalNotes?: string;
  customerNotes?: string;
  signatureUrl?: string;
  waiverAccepted: boolean;
  photos: {
    before: string[];
    after: string[];
    damage: string[];
  };
  recurringInfo?: {
    isRecurring: boolean;
    frequency: "daily" | "weekly" | "biweekly" | "monthly" | "custom";
    interval?: number;
    endDate?: Timestamp;
    seriesId: string;
    parentAppointmentId?: string;
  };
  estimatedTravelTime?: number; // in minutes
  estimatedTravelDistance?: number; // in miles
  estimatedDuration?: number; // in minutes
  followUpSent?: boolean;
  followUpSentAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  overrideBufferTimeMinutes?: number;
  smartSchedulingData?: {
    score: number;
    explanation: string;
    travelTimeFromPrior?: number;
    travelTimeToNext?: number;
    distanceFromPrior?: number;
    distanceToNext?: number;
    isRecommended: boolean;
    recommendationLevel: "best" | "good" | "avoid";
  };
  cancellationFeeEnabled: boolean; // New
  cancellationFeeAmount: number; // New
  cancellationFeeType: "fixed" | "percentage"; // New
  cancellationCutoffHours: number; // New
  cancellationStatus?: "none" | "applied" | "waived"; // New
  cancellationFeeApplied?: number; // New
  cancellationTimestamp?: Timestamp; // New
}

export interface LineItem {
  serviceName: string;
  price: number;
}

export interface Invoice {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  businessName?: string;
  vehicles: {
    id: string;
    year: string;
    make: string;
    model: string;
    roNumber?: string;
  }[];
  vehicleInfo?: string;
  dueDate?: Timestamp | FieldValue;
  lineItems: LineItem[];
  total: number;
  status: "draft" | "sent" | "paid";
  paymentStatus: "unpaid" | "partial" | "paid";
  paymentProvider?: "stripe" | "square" | "paypal" | "clover" | "manual";
  transactionReference?: string;
  amountPaid: number;
  paidAt?: Timestamp | FieldValue;
  lateFeeEnabled: boolean; // New
  lateFeeType: "fixed" | "percentage"; // New
  lateFeeAmount: number; // New
  lateFeeGracePeriodDays: number; // New
  lateFeeApplied?: number; // New
  lateFeeAppliedAt?: Timestamp; // New
  createdAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

export interface Quote {
  id: string;
  clientId?: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  businessName?: string;
  isPotentialClient?: boolean;
  vehicles: {
    id: string;
    year: string;
    make: string;
    model: string;
    roNumber?: string;
  }[];
  lineItems: LineItem[];
  total: number;
  status: "draft" | "sent" | "approved";
  createdAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

export interface BusinessSettings {
  businessName: string;
  businessPhone?: string;
  businessEmail?: string;
  logoUrl?: string;
  showLogoOnDocuments?: boolean;
  taxRate: number;
  currency: string;
  timezone: string;
  commissionRate: number;
  commissionType: "percentage" | "flat";
  baseAddress: string;
  baseLatitude: number;
  baseLongitude: number;
  travelPricing: {
    pricePerMile: number;
    freeMilesThreshold: number;
    minTravelFee: number;
    maxTravelFee: number;
    roundTripToggle: boolean;
  };
  loyaltySettings: {
    pointsPerDollar: number;
    pointsPerVisit: number;
    redemptionRate: number; // points per dollar off
    minPointsToRedeem: number;
    stackWithCoupons: boolean;
  };
  technicianOverrides?: Record<string, {
    commissionRate: number;
    commissionType: "percentage" | "flat";
  }>;
  automationSettings?: {
    followUpEnabled: boolean;
    delayHours: number;
    maintenanceReturnWeeks?: number;
    autoCreateLeads?: boolean;
    channels: "email" | "sms" | "both";
    includeReviewLink: boolean;
    googleReviewUrl?: string;
    emailSubject?: string;
    emailBody?: string;
    smsBody?: string;
  };
  workingHours?: {
    start: string; // "HH:mm"
    end: string;   // "HH:mm"
    daysEnabled: number[]; // 0-6 (Sun-Sat)
  };
  paymentIntegrations?: {
    stripe?: {
      enabled: boolean;
      publishableKey: string;
      secretKey: string;
      webhookSecret?: string;
    };
    square?: {
      enabled: boolean;
      applicationId: string;
      accessToken: string;
      locationId: string;
    };
    paypal?: {
      enabled: boolean;
      clientId: string;
      clientSecret: string;
    };
    clover?: {
      enabled: boolean;
      merchantId: string;
      accessToken: string;
    };
  };
}

export interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string;
  date: Timestamp;
  technicianId?: string;
  receiptUrl?: string;
  linkedAppointmentId?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  minThreshold: number;
  unit: string;
  costPerUnit: number;
  lastRestocked: Timestamp;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  templateId: string;
  audienceFilters: {
    clientTypeIds?: string[];
    categoryIds?: string[];
    isVIP?: boolean;
    isInactive?: boolean;
    isOneTime?: boolean;
  };
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  scheduledAt?: Timestamp;
  sentAt?: Timestamp;
  stats: {
    targetCount: number;
    sentCount: number;
    failedCount: number;
  };
  createdAt: Timestamp;
}

export interface CampaignLog {
  id: string;
  campaignId: string;
  clientId: string;
  status: "sent" | "failed";
  error?: string;
  sentAt: Timestamp;
}
