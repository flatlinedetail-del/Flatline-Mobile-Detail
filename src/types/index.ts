import { Timestamp, FieldValue } from "firebase/firestore";

export type SyncStatus = "synced" | "pending" | "failed";

export interface UserProfile extends SyncMetadata {
  uid: string;
  id: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: "owner" | "admin" | "manager" | "technician" | "office" | "read-only";
  provider?: string;
  lastLoginAt?: any;
  isOwner?: boolean;
  isAdmin?: boolean;
  accessLevel?: string;
  createdAt: Timestamp | FieldValue;
  lastLogin?: Timestamp | FieldValue;
}

export interface SyncMetadata {
  localId?: string;
  syncStatus?: SyncStatus;
  lastSyncAttempt?: Timestamp | FieldValue;
  retryCount?: number;
  syncError?: string;
}

export interface TimeBlock extends SyncMetadata {
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

export type WeatherSensitivity = "low" | "medium" | "high" | "very_high";

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
  weatherSensitivity?: WeatherSensitivity;
  hasWarranty?: boolean;
  warrantyLengthMonths?: number;
  warrantyType?: string;
  warrantyCoverageDetails?: string;
  warrantyMaintenanceRequired?: boolean;
}

export interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;
  pricingType: "flat" | "hourly" | "block30" | "blockCustom";
  rate: number;
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

export interface Client extends SyncMetadata {
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
    lat?: number;
    lng?: number;
    latitude?: number;
    longitude?: number;
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
  outstandingCancellationFee?: number;
  hasSavedPaymentMethod?: boolean;
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
  riskLevel?: "low" | "medium" | "high";
  smsConsent?: boolean;
  smsOptOut?: boolean;
  preferredContactMethod?: "email" | "sms" | "both" | "none";
  // Marketing intelligence
  lastServiceDate?: string;
  lastServiceType?: string;
  averageServiceInterval?: number;
  preferredServiceType?: string;
  totalHistoricalSpend?: number;
  serviceHistoryCount?: number;
  marketingEligibleServices?: string[];
  nextRecommendedServiceDate?: string;
  serviceHistoryNotes?: string;
}

export interface ServiceHistoryEntry {
  id: string;
  clientId: string;
  serviceType: string;
  serviceDate: string;
  vehicleInfo?: string;
  priceCharged?: number;
  notes?: string;
  conditionTags?: string[];
  source: "imported" | "manual" | "completed_job";
  createdAt?: any;
  updatedAt?: any;
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

export interface Customer extends SyncMetadata {
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
  name: string;
  description: string;
  qty: number;
  price: number;
  total?: number;
  source: "manual" | "deployment_intelligence" | "ai_revenue_intelligence" | "standard" | "bundle";
  protocolAccepted: boolean;
  vehicleId?: string;
  vehicleName?: string;
  reason?: string;
}

export interface CustomFee {
  id: string;
  name: string;
  amount: number;
  isTaxable?: boolean;
}

export interface Appointment extends SyncMetadata {
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
  customerAddressId?: string; // New: References the specific address ID chosen
  addressLabel?: string; // New: "Home", "Work", etc.
  city?: string;
  state?: string;
  zipCode?: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  scheduledAt: Timestamp;
  status: "scheduled" | "confirmed" | "en_route" | "in_progress" | "completed" | "paid" | "canceled" | "no_show" | "missed" | "suggested" | "requested" | "pending_approval" | "approved" | "declined" | "reschedule_suggested";
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
  customFees?: CustomFee[];
  depositType: "fixed" | "percentage";
  depositPaid: boolean;
  depositPaidAt?: Timestamp;
  depositPaymentProvider?: string;
  depositRequired?: boolean;
  depositReasons?: string[];
  depositSource?: "risk" | "risk_rule" | "service" | "settings" | "mixed" | "none";
  clientRiskLevelAtBooking?: "low" | "medium" | "high" | null;
  paymentStatus: "unpaid" | "partial" | "paid" | "deposit_pending" | "voided" | "refunded";
  paymentMethod?: "cash" | "card" | "venmo" | "check" | "invoice";
  commissionAmount?: number;
  // ── Online booking gate fields ──────────────────────────────────────────────
  bookingMode?: "instant_confirm" | "pending_owner_review" | "blocked_review" | "deposit_required";
  pendingOwnerReview?: boolean;
  matchedProtectedClientId?: string | null;
  matchedClientId?: string | null;
  protectedClientMatch?: boolean;
  protectionLevel?: string | null;
  riskReason?: string | null;
  balanceDue?: number;
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
  unacceptedRecommendations?: any[];
  unacceptedBundles?: any[];
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
  cancellationFeeProcessed?: boolean; // New: Prevents double charging
  // Reason captured when a job is cancelled, marked no-show, or marked
  // missed. Required UX-side before the status change completes. These
  // feed business analytics (canceled / no_show / missed reason buckets).
  cancellationReason?: string;
  cancellationReasonCategory?: "client_request" | "weather" | "vehicle_unavailable" | "scheduling_conflict" | "duplicate" | "other";
  noShowReason?: string;
  missedReason?: string;
  // Disabled when a job is cancelled / no-show / missed. Any UI surface
  // that displays booking intelligence (smart scheduling rank, upsell
  // recommendations, AI suggestions for THIS job) checks this flag and
  // hides itself. Defaults to true on existing docs. Set explicitly to
  // false when the appointment moves to cancelled / no_show / missed.
  bookingIntelligenceActive?: boolean;
  weatherInfo?: {
    temp?: number;
    condition?: string;
    rainProbability?: number;
    checkedAt?: Timestamp;
    alertStatus?: "pending" | "notified" | "handled";
    userAction?: "proceed" | "switch_to_interior" | "reschedule" | "none";
  };
  productCosts?: JobProductCost[];
  pricingAnalysis?: PricingAnalysis;
  afterHoursRecord?: {
    isAfterHours: boolean;
    afterHoursFee: number;
    afterHoursReason?: string;
    businessHoursSnapshot?: any;
  };
  invoiceNumber?: string;
  smsStatus?: {
    confirmationSent?: boolean;
    reminderSent?: boolean;
    onTheWaySent?: boolean;
    arrivedSent?: boolean;
    reviewRequestSent?: boolean;
    completedSent?: boolean;
    rescheduleSent?: boolean;
    canceledSent?: boolean;
    noShowFeeSent?: boolean;
  };
  // ── FormsStudio Smart Protection assessment (Phase 1, Slice 1) ───────────
  // Persisted assessment of this appointment's form-protection state so the
  // recommendation surface can show consistent state across renders and
  // respect owner "skip for now" dismissals. All optional and additive.
  formProtectionStatus?: {
    level: "low" | "medium" | "high";
    recommendedTemplateIds: string[];
    dismissedAt?: Timestamp;
    dismissedByUid?: string;
    lastAssessedAt: Timestamp;
  };
}

/** Catalog entry stored in Firestore `productCatalog` collection */
export interface ProductCatalogItem {
  id: string;
  businessId?: string;
  productName: string;
  category: string;
  unitType: "bottle" | "ounce" | "gallon" | "pad" | "towel" | "job" | "kit" | "each" | "other";
  defaultUnitCost: number;
  defaultQuantity: number;
  active: boolean;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface JobProductCost {
  id: string;
  name: string;
  productName?: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  category?: "chemical" | "pad" | "towel" | "tool" | "disposable" | "misc";
  costType?: "inventory" | "must_buy" | "partial_use" | "pass_through";
  associatedServiceId?: string;
  associatedServiceName?: string;
  notes?: string;
}

export interface PricingAnalysis {
  laborTarget: number;
  overhead: number;
  travelFee: number;
  totalProductCost: number;
  floorPrice: number;
  recommendedPrice: number;
  premiumPrice: number;
  estimatedMarginDollars: number;
  estimatedMarginPercent: number;
  netAfterProductCost: number;
  // Condition-detection fields (populated by conditionParser when notes contain special conditions)
  detectedConditions?: string[];
  pricingExplanation?: string;
  manualReviewRecommended?: boolean;
  suggestedServices?: string[];
  conditionSurcharge?: number;
}

export interface AdminPricingBreakdown {
  /** Raw market-rate service subtotal before condition adjustments */
  baseServicePrice: number;
  /** Multiplier applied for vehicle condition (severity × intensity × complexity) */
  conditionMultiplier: number;
  /** Dollar delta from vehicle-size multipliers */
  vehicleSizeAdjustment: number;
  /** Internal labor cost allocation */
  laborCost: number;
  /** Internal material/supply cost (= totalProductCost) */
  materialCost: number;
  /** Travel fee applied */
  travelCost: number;
  /** Sum of all customer-facing add-ons */
  addonTotal: number;
  /** Any discounts applied */
  discountTotal: number;
  /** AI or benchmark recommended price (already includes materialCost) */
  aiRecommendedPrice: number;
  /** Tier the user chose (low/safe/recommended/premium) */
  selectedTier: string;
  /** Final customer-facing price */
  finalQuoteTotal: number;
  estimatedProfit: number;
  marginPercent: number;
  /** 0-100 confidence score from AI, or 60 for benchmark */
  pricingConfidence: number;
  /** Map of condition flags that increased price, e.g. { mold: 0.45, smoke: 0.35 } */
  conditionAdjustments: Record<string, number>;
  /** AI/benchmark explanation text for internal reference */
  internalNotes?: string;
  /** "ai" | "benchmark" | "manual" */
  source: string;
}

export interface ClientVisibleAddOn {
  id: string;
  name: string;
  price: number;
  selected: boolean;
}

export interface LineItem {
  serviceName: string;
  description: string;
  quantity: number;
  price: number;
  total: number;
  source: string;
  protocolAccepted: boolean;
}

export interface Invoice extends SyncMetadata {
  id: string;
  clientId: string;
  appointmentId?: string;
  jobId?: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  serviceAddress?: string;
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
  status: "draft" | "sent" | "paid" | "voided" | "pending";
  description?: string;
  attachedFormIds?: string[];
  paymentStatus: "unpaid" | "partial" | "paid" | "voided" | "refunded";
  paymentProvider?: "stripe" | "square" | "paypal" | "clover" | "manual";
  transactionReference?: string;
  paymentMethodDetails?: string;
  paymentHistory?: {
    action: "paid" | "voided" | "undone";
    timestamp: any; // using any for Timestamp | FieldValue
    method?: string;
    amount?: number;
    provider?: string;
    notes?: string;
  }[];
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
  invoiceNumber?: string;
  recommendedItems?: LineItem[];
  subtotal?: number;
  discountAmount?: number;
  travelFeeAmount?: number;
  unacceptedBundles?: any[];
  customFees?: CustomFee[];
}

export interface Quote {
  id: string;
  clientId?: string;
  clientName: string;
  clientFirstName?: string;
  clientLastName?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  serviceAddress?: string;
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
  // ── Internal cost tracking ──
  productCosts?: JobProductCost[];
  totalProductCost?: number;
  internalJobCost?: number;
  estimatedProfit?: number;
  estimatedMarginPercent?: number;
  pricingAnalysis?: PricingAnalysis;
  // ── AI quote provenance ──
  quoteSource?: "standard" | "ai";
  aiQuoteId?: string;
  // ── Service metadata (primary selected service) ──
  selectedServiceId?: string;
  selectedServiceName?: string;
  baseServicePrice?: number;
  // ── AI pricing components ──
  aiRecommendedPrice?: number;
  laborCost?: number;
  materialCost?: number;
  travelCost?: number;
  conditionAdjustments?: Record<string, number>;
  vehicleSizeAdjustment?: number;
  addonTotal?: number;
  discountTotal?: number;
  // ── Full admin breakdown (internal only) ──
  adminPricingBreakdown?: AdminPricingBreakdown;
  // ── Client-facing data ──
  clientDisplayPrice?: number;
  clientVisibleAddOns?: ClientVisibleAddOn[];
  finalQuoteTotal?: number;
  // ── Metadata ──
  pricingConfidence?: number;
  internalNotes?: string;
  clientQuoteMessage?: string;
  createdAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;

  invoiceNumber?: string;
  subtotal?: number;
  discountAmount?: number;
  travelFeeAmount?: number;
  customFees?: CustomFee[];
  // ── Skipped/declined upsell tracking (non-billable; for display + later follow-up) ──
  recommendedItems?: LineItem[];
  unacceptedBundles?: any[];
  unacceptedRecommendations?: any[];
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

export interface WatermarkSettings {
  logoUrl?: string;
  opacity: number;
  position: "center" | "right" | "left";
  size?: "small" | "medium" | "large" | "full";
}

export interface BusinessSettings {
  businessName: string;
  businessPhone?: string;
  businessEmail?: string;
  logoUrl?: string;
  showLogoOnDocuments?: boolean;
  adminOnlyAccess?: boolean;
  watermarkSettings?: WatermarkSettings;
  taxRate: number;
  serviceFeeLabel?: string; // New: Display name for the primary service/travel fee
  currency: string;
  timezone: string;
  commissionRate: number;
  commissionType: "percentage" | "flat";
  cancellationFeeAmount?: number;
  cancellationFeeType?: "flat" | "percentage";
  marginTargets: {
    floor: number;
    recommended: number;
    premium: number;
  };
  /** Daily revenue goal shown as a progress target on the Field Mode dashboard KPI card. */
  dailyRevenueTarget?: number;
  /** Monthly revenue goal shown as a progress target on the Field Mode dashboard KPI card. */
  monthlyRevenueTarget?: number;
  logoSettings?: {
    scale: number;
    x: number;
    y: number;
    rotation?: number;
    fit?: 'contain' | 'cover';
  };
  // Internal address for distance calculations
  baseAddress: string;
  baseLatitude: number;
  baseLongitude: number;
  // Optional private travel origin — when set, used as the start point for
  // travel-fee distance calculation in customer-facing flows (PublicBooking)
  // INSTEAD of baseAddress, and is never displayed to customers. Falls back
  // to baseAddress/baseLatitude/baseLongitude when not set.
  travelStartAddress?: string;
  travelStartLatitude?: number;
  travelStartLongitude?: number;
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
  communicationAutomation?: {
    enabled: boolean;
    bookingConfirmation: boolean;
    reminder24h: boolean;
    reminder2h: boolean;
  };
  weatherAutomation?: {
    enabled: boolean;
    checkTimingHours: number;
    rainProbabilityThreshold: number;
    autoNotifyClient: boolean;
  };
  workingHours?: {
    start: string; // "HH:mm"
    end: string;   // "HH:mm"
    daysEnabled: number[]; // 0-6 (Sun-Sat)
  };
  twilioSettings?: {
    enabled: boolean;
    accountSid: string;
    authToken: string;
    phoneNumber: string;
    businessPhone?: string; // default business phone number
    testPhone?: string;
  };
  businessHours?: {
    monday: { isOpen: boolean; openTime: string; closeTime: string; };
    tuesday: { isOpen: boolean; openTime: string; closeTime: string; };
    wednesday: { isOpen: boolean; openTime: string; closeTime: string; };
    thursday: { isOpen: boolean; openTime: string; closeTime: string; };
    friday: { isOpen: boolean; openTime: string; closeTime: string; };
    saturday: { isOpen: boolean; openTime: string; closeTime: string; };
    sunday: { isOpen: boolean; openTime: string; closeTime: string; };
    allowAfterHours: boolean;
    afterHoursFeeAmount: number;
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
  };
  activePaymentProvider?: "stripe" | "square" | "paypal" | "manual";
  smsTemplates?: Record<string, string>;
  calendarColors?: Record<string, string>;
  serviceColors?: Record<string, string>;
  aiSettings?: {
    aiEnabled: boolean;
    aiMode: "off" | "manual_only" | "smart_scheduled";
    preferredModelTier: "smart_saver" | "balanced_intelligence" | "deep_strategy";
    allowModelEscalation: boolean;
    dailyAICallLimit: number;
    weeklyAICallLimit: number;
    monthlyAICallLimit: number;
    enableDailyBusinessAdvisor: boolean;
    enableWeeklyBusinessReport: boolean;
    enableAILeadEngine: boolean;
    enableClientMessageAI: boolean;
    enableEstimateAI: boolean;
    enableRevenueIntelligenceAI: boolean;
    enableRiskExplanationAI: boolean;
    lastDailyAdvisorRunAt?: any;
    lastWeeklyReportRunAt?: any;
    lastAILeadEngineRunAt?: any;
  };
  formsSetupCompleted?: boolean;
  formsSetupAnswers?: FormsSetupAnswers;
}

export interface FormsSetupAnswers {
  services: string[];
  protections: string[];
  style: "simple" | "balanced" | "stronger";
  timing: "before_booking" | "before_start" | "before_payment" | "high_risk_only";
  completedAt?: any;
}

export interface Payment {
  id: string;
  clientId: string;
  appointmentId?: string;
  amount: number;
  provider: string;
  transactionId?: string;
  paymentType: "service" | "cancellation_fee" | "deposit";
  status: "paid" | "failed" | "waived" | "pending";
  failureReason?: string;
  timestamp: Timestamp | FieldValue;
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
    rainProbability: number;
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
  type: "new_booking_request" | "waitlist_request" | "cancellation" | "reschedule" | "slot_opened" | "upcoming_appointment" | "en_route" | "arrived" | "payment_received" | "invoice_overdue" | "booking_error" | "sms_failed" | "scheduling_conflict" | string;
  category?: "Booking Requests" | "Schedule Changes" | "Today's Operations" | "Payments" | "System Alerts" | string;
  actionType?: string;
  relatedId?: string;
  relatedType?: "booking" | "appointment" | "waitlist" | "invoice" | "system" | string;
  priority?: "low" | "medium" | "high";
  waitlistId?: string;
  appointmentId?: string;
  bookingRequestId?: string;
  clientName?: string;
  requestedDateTime?: any;
  backupDateTime?: any;
  read: boolean;
  createdAt: Timestamp | FieldValue;
}

export interface CommunicationLog extends SyncMetadata {
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

export interface ProtectedClient {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  address: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vin?: string;
  licensePlate?: string;
  riskReason: string;
  internalNotes?: string;
  protectionLevel: "Low" | "Med" | "High" | "Normal" | "Block Booking"; // Keeping old for migration if needed, but primary focus is Low, Med, High
  requiredDepositType: "percentage" | "fixed";
  requiredDepositValue: number;
  isActive: boolean;
  linkedClientId?: string;
  createdAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

export interface RiskNetworkSettings {
  sharedNetworkEnabled: boolean;
  shareHighRiskAlerts: boolean;
  shareDoNotBookAlerts: boolean;
  allowContactRequests: boolean;
  requireApprovalBeforeSharing: boolean;
  depositForHighRisk: boolean;
  depositForCritical: boolean;
  depositForSharedMatch: boolean;
  cardOnFileForHighRisk: boolean;
  managerApprovalForCritical: boolean;
}
