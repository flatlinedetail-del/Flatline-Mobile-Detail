import { Service, VehicleSize, Customer, Vendor, Coupon } from "../types";

export interface PricingResult {
  baseAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  breakdown: {
    serviceId: string;
    serviceName: string;
    originalPrice: number;
    finalPrice: number;
    appliedRule: string;
  }[];
}

const TAX_RATE = 0.0825; // 8.25% Austin, TX

export function calculatePricing(
  services: Service[],
  size: VehicleSize,
  customer?: Customer,
  vendor?: Vendor,
  coupon?: Coupon,
  loyaltyDiscount: number = 0
): PricingResult {
  let baseAmount = 0;
  let discountAmount = 0;
  const breakdown: PricingResult["breakdown"] = [];

  services.forEach((service) => {
    let finalPrice = service.basePrice;
    let appliedRule = "Base Price";

    // 1. Check for Vendor Rates (Highest Priority)
    if (vendor && vendor.vendorRates[service.id]) {
      finalPrice = vendor.vendorRates[service.id];
      appliedRule = "Vendor Fixed Rate";
    } 
    // 2. Check for Customer Special Pricing
    else if (customer && customer.isVIP && customer.vipSettings?.customServicePricing?.[service.id]) {
      finalPrice = customer.vipSettings.customServicePricing[service.id];
      appliedRule = "VIP Custom Pricing";
    }
    // 3. Apply Size Multiplier
    else {
      const multiplier = service.pricingBySize?.[size] || 0;
      if (multiplier > 0) {
        finalPrice = multiplier;
        appliedRule = `Size Pricing (${size})`;
      } else {
        finalPrice = service.basePrice;
        appliedRule = "Base Price";
      }
    }

    baseAmount += finalPrice;
    breakdown.push({
      serviceId: service.id,
      serviceName: service.name,
      originalPrice: service.basePrice,
      finalPrice,
      appliedRule,
    });
  });

  // Apply Coupon
  if (coupon && coupon.isActive) {
    if (coupon.discountType === "percentage") {
      discountAmount += baseAmount * (coupon.discountValue / 100);
    } else {
      discountAmount += coupon.discountValue;
    }
  }

  // Apply Loyalty Discount
  discountAmount += loyaltyDiscount;

  // Ensure discount doesn't exceed base
  discountAmount = Math.min(discountAmount, baseAmount);

  const taxableAmount = baseAmount - discountAmount;
  const taxAmount = taxableAmount * TAX_RATE;
  const totalAmount = taxableAmount + taxAmount;

  return {
    baseAmount,
    discountAmount,
    taxAmount,
    totalAmount: Math.round(totalAmount * 100) / 100,
    breakdown,
  };
}

export function calculateLoyaltyPoints(amount: number): number {
  // 1 point for every $10 spent
  return Math.floor(amount / 10);
}

export function calculateCommission(amount: number, rate: number = 0.3): number {
  // Default 30% commission for technicians
  return Math.round(amount * rate * 100) / 100;
}
