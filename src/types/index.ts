import { Timestamp } from "firebase/firestore";

export type VehicleSize = "small" | "medium" | "large" | "extra_large";

export interface Service {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  sizeMultipliers: Record<VehicleSize, number>;
  category: "interior" | "exterior" | "protection" | "correction" | "other";
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
  loyaltyPoints: number;
  membershipLevel: "none" | "silver" | "gold" | "platinum";
  specialPricing?: Record<string, number>; // serviceId -> customPrice
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
  scheduledAt: Timestamp;
  status: "scheduled" | "confirmed" | "en_route" | "in_progress" | "completed" | "paid" | "canceled";
  technicianId: string;
  technicianName: string;
  serviceIds: string[];
  serviceNames: string[];
  baseAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  depositAmount: number;
  isDepositPaid: boolean;
  paymentStatus: "unpaid" | "partial" | "paid";
  paymentMethod?: "cash" | "card" | "venmo" | "check" | "invoice";
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Expense {
  id: string;
  category: "fuel" | "supplies" | "marketing" | "insurance" | "other";
  amount: number;
  description: string;
  date: Timestamp;
  technicianId?: string;
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
