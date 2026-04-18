import { Timestamp, FieldValue } from "firebase/firestore";

export interface TimeBlock {
  id: string;
  title: string;
  type: "time_off" | "busy" | "unavailable";
  start: Timestamp;
  end: Timestamp;
  userId: string;
  notes?: string;
  googleEventId?: string;
}

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
  title?: string;
  description?: string;
  campaignId?: string;
  discountType: "percentage" | "fixed" | "free_addon";
  discountValue: number;
  usageLimit?: number;
  usageCount: number;
  isActive: boolean;
  startDate?: Timestamp;
  expiryDate?: Timestamp;
  targetServiceIds?: string[];
  targetAudience?: string;
  createdAt: Timestamp;
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
  depositRequired?: boolean;
  depositType?: "fixed" | "percentage";
  depositAmount?: number;
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
    vipVehiclePricing?: Record<string, Record<string, number>>; // vehicleId -> serviceId -> price
    travelFeeDiscount?: number;
    waiveTravelFee?: boolean;
    exemptFromFees?: boolean;
    specialDiscountRules?: string;
    customCollisionServices?: { id: string; name: string; price: number }[];
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
  gallery?: string[];
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
  status: "new" | "contacted" | "quoted" | "converted" | "lost" | "reactivation" | "maintenance_due";
  priority: "low" | "medium" | "high" | "hot";
  lastFollowUp?: Timestamp;
  nextFollowUpAt?: Timestamp;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // AI Lead Engine Fields
  aiScore?: number; // 0-100
  aiClassification?: string; // "retail", "fleet", "dealership", "collision_center", etc.
  aiValueEstimate?: number;
  aiRecommendedAction?: string;
  aiOutreachDrafts?: {
    sms?: string;
    email?: string;
    callScript?: string;
  };
  contactedAt?: Timestamp;
  quotedAt?: Timestamp;
  convertedAt?: Timestamp;
  paidAt?: Timestamp;
  distanceFromBase?: number;
  isInternal?: boolean;
  internalSourceType?: "inactive" | "maintenance" | "quote_followup" | "canceled" | "no_response" | "upsell";
  businessWebsite?: string;
  businessType?: string;
}

export interface ServiceSelection {
  id: string;
  qty: number;
  price: number;
  vehicleId?: string;
  vehicleName?: string;
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
  serviceSelections?: ServiceSelection[];
  addOnIds?: string[];
  addOnNames?: string[];
  addOnSelections?: ServiceSelection[];
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
    occurrences?: number;
    occurrenceIndex?: number;
    totalOccurrences?: number;
    seriesId: string;
    parentAppointmentId?: string;
  };
  estimatedTravelTime?: number; // in minutes
  estimatedTravelDistance?: number; // in miles
  estimatedDuration?: number; // in minutes
  followUpSent?: boolean;
  followUpSentAt?: Timestamp;
  leadId?: string;
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
  description?: string;
  attachedFormIds?: string[];
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
  leadId?: string;
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
  description?: string;
  attachedFormIds?: string[];
  leadId?: string;
  createdAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

export interface MapZone {
  id: string;
  name: string;
  fee: number;
  color: string;
  type?: 'polygon' | 'circle';
  paths?: { lat: number; lng: number }[];
  center?: { lat: number; lng: number };
  radius?: number;
}

export interface TravelZone {
  id: string;
  name: string;
  minDistance: number;
  maxDistance: number;
  fee: number;
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
  // Internal address for distance calculations
  baseAddress: string;
  baseLatitude: number;
  baseLongitude: number;
  // Separate address for invoices and customer documents
  invoiceAddress?: string;
  travelPricing: {
    enabled: boolean;
    mode: "mileage" | "zones" | "map_zones";
    pricePerMile: number;
    freeMilesThreshold: number;
    minTravelFee: number;
    maxTravelFee: number;
    roundTripToggle: boolean;
    useZones?: boolean; // Deprecated in favor of mode
    zones?: TravelZone[]; // Distance based zones
    mapZones?: MapZone[]; // Polygon based zones
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
  title?: string;
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
  // AI Generated Fields
  targetAudience?: string;
  offer?: string;
  channel?: string;
  timing?: string;
  goal?: string;
  messageAngle?: string;
  cta?: string;
  couponId?: string;
  socialMedia?: {
    reelIdea: string;
    caption: string;
    hook: string;
    cta: string;
    storyIdea: string;
    hashtags?: string[];
  };
  createdAt: Timestamp;
  updatedAt?: Timestamp | FieldValue;
}

export interface WeatherInfo {
  current: {
    temp: number;
    condition: string;
    icon: string;
    description: string;
  };
  forecast: {
    date: string;
    temp: { min: number; max: number };
    condition: string;
    description: string;
  }[];
  businessGuidance: string;
}

export interface CampaignLog {
  id: string;
  campaignId: string;
  clientId: string;
  status: "sent" | "failed";
  error?: string;
  sentAt: Timestamp;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "booking" | "client" | "system" | "message";
  relatedId?: string;
  relatedType?: "appointment" | "client" | "lead" | "invoice" | "quote";
  read: boolean;
  createdAt: Timestamp | FieldValue;
}

export interface CommunicationLog {
  id: string;
  clientId: string;
  type: "sms" | "email" | "note" | "alert";
  content: string;
  subject?: string;
  senderId?: string;
  senderName?: string;
  status?: "sent" | "delivered" | "failed" | "logged";
  createdAt: Timestamp | FieldValue;
}
