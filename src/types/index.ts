import { Timestamp } from "firebase/firestore";

export type VehicleSize = "small" | "medium" | "large" | "extra_large";

export type CategoryType = "service" | "addon" | "expense" | "inventory";

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  isActive: boolean;
  sortOrder: number;
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
  requiresWaiver: boolean;
  isActive: boolean;
}

export interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;
  isTaxable: boolean;
  estimatedDuration: number; // in minutes
  isActive: boolean;
}

export interface Vehicle {
  id: string;
  ownerId: string;
  ownerType: "customer" | "vendor";
  year: string;
  make: string;
  model: string;
  color?: string;
  vin?: string;
  licensePlate?: string;
  size: VehicleSize;
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
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
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
  customerName: string;
  customerType: "retail" | "vendor";
  vendorId?: string;
  vehicleId: string;
  vehicleInfo: string;
  vin?: string;
  roNumber?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  scheduledAt: Timestamp;
  status: "scheduled" | "confirmed" | "en_route" | "in_progress" | "completed" | "paid" | "canceled";
  technicianId: string;
  technicianName: string;
  serviceIds: string[];
  serviceNames: string[];
  addOnIds?: string[];
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
  isDepositPaid: boolean;
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BusinessSettings {
  businessName: string;
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

export interface Coupon {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  minPurchase?: number;
  expiryDate: Timestamp;
  isActive: boolean;
}
