/**
 * Public Booking — centralized travel-fee engine.
 *
 * Pure (no Firestore, no React). Shared by:
 *   - `onlineBookingGateCore.ts` (server-side authoritative computation)
 *   - `PublicBooking.tsx` (client-side preview)
 *
 * Wraps the lower-level travelService.ts (haversine + zone matching) and
 * produces a stable, consistent output shape with safe defaults:
 *
 *   - travelFee: number — capped, never NaN, never negative
 *   - travelDistanceMiles: number
 *   - estimatedTravelMinutes: number
 *   - travelZone: string — "" when not applicable
 *   - travelFeeReason: string — generic, customer-safe
 *   - travelReviewRequired: boolean — true when location falls outside
 *     the configured service area; the booking gate uses this to route the
 *     booking to owner review instead of instant-confirm.
 *
 * Business home / technician-start coordinates are NEVER returned. Only the
 * derived fee, distance, and minutes are exposed to the public client.
 */

import type { BusinessSettings } from "../types";
import {
  calculateDistance,
  calculateTravelFee,
  estimateTravelTime,
} from "./travelService.js";

/** Output shape — written verbatim onto the appointment doc. */
export interface PublicBookingTravelResult {
  travelFee: number;
  travelDistanceMiles: number;
  estimatedTravelMinutes: number;
  travelZone: string;
  travelFeeReason: string;
  travelReviewRequired: boolean;
}

const ZERO_RESULT: PublicBookingTravelResult = {
  travelFee: 0,
  travelDistanceMiles: 0,
  estimatedTravelMinutes: 0,
  travelZone: "",
  travelFeeReason: "Travel pricing not configured",
  travelReviewRequired: false,
};

const safeNum = (v: unknown): number =>
  typeof v === "number" && isFinite(v) ? v : 0;

const isValidCoord = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === "number" &&
  typeof lng === "number" &&
  isFinite(lat) &&
  isFinite(lng) &&
  !(lat === 0 && lng === 0);

/**
 * Pick the travel origin: prefer the private travelStart coordinates (never
 * shown to customers) and fall back to the public baseLatitude/baseLongitude.
 * Returns null when no usable origin is configured.
 */
function pickOrigin(
  settings: BusinessSettings,
): { lat: number; lng: number } | null {
  const startLat = safeNum(settings.travelStartLatitude);
  const startLng = safeNum(settings.travelStartLongitude);
  if (isValidCoord(startLat, startLng)) return { lat: startLat, lng: startLng };

  const baseLat = safeNum(settings.baseLatitude);
  const baseLng = safeNum(settings.baseLongitude);
  if (isValidCoord(baseLat, baseLng)) return { lat: baseLat, lng: baseLng };

  return null;
}

export interface ComputeTravelInput {
  customerLat: number;
  customerLng: number;
  settings: Pick<
    BusinessSettings,
    | "travelPricing"
    | "baseLatitude"
    | "baseLongitude"
    | "travelStartLatitude"
    | "travelStartLongitude"
  >;
}

/**
 * Compute the full public-booking travel result. Never throws; on any missing
 * input it returns a zeroed result with a descriptive reason string.
 */
export function computePublicBookingTravel(
  input: ComputeTravelInput,
): PublicBookingTravelResult {
  const { customerLat, customerLng, settings } = input;

  const pricing = settings?.travelPricing;
  if (!pricing || pricing.enabled !== true) {
    return { ...ZERO_RESULT, travelFeeReason: "Travel pricing disabled" };
  }

  if (!isValidCoord(customerLat, customerLng)) {
    return {
      ...ZERO_RESULT,
      travelFeeReason: "Customer location not geocoded yet",
    };
  }

  const origin = pickOrigin(settings as BusinessSettings);
  if (!origin) {
    return {
      ...ZERO_RESULT,
      travelFeeReason: "Service origin not configured",
    };
  }

  const distanceRaw = calculateDistance(
    origin.lat,
    origin.lng,
    customerLat,
    customerLng,
  );
  const distance = safeNum(distanceRaw);

  // Hard cap unreasonable distances to prevent runaway fees.
  const MAX_DISTANCE_MILES = 500;
  if (distance > MAX_DISTANCE_MILES) {
    return {
      travelFee: 0,
      travelDistanceMiles: parseFloat(distance.toFixed(2)),
      estimatedTravelMinutes: 0,
      travelZone: "Outside Service Area",
      travelFeeReason:
        "Location is well outside our service area — owner review required",
      travelReviewRequired: true,
    };
  }

  const calc = calculateTravelFee(distance, pricing, {
    lat: customerLat,
    lng: customerLng,
  });

  const miles = Math.max(0, safeNum(calc.miles));
  const feeRaw = Math.max(0, safeNum(calc.fee));

  // Cap fee at a sane absolute ceiling regardless of configured maxTravelFee.
  // 10,000 is a defensive bound — real-world fees never approach it.
  const ABSOLUTE_FEE_CAP = 10_000;
  const fee = Math.min(feeRaw, ABSOLUTE_FEE_CAP);

  const zoneName = typeof calc.zoneName === "string" ? calc.zoneName : "";
  const isOutside =
    zoneName === "Outside Service Area" ||
    (pricing.mode === "map_zones" && fee === 0 && zoneName === "Outside Service Area");

  return {
    travelFee: parseFloat(fee.toFixed(2)),
    travelDistanceMiles: parseFloat(miles.toFixed(2)),
    estimatedTravelMinutes: estimateTravelTime(miles),
    travelZone: zoneName,
    travelFeeReason: isOutside
      ? "Location is outside our standard service area"
      : zoneName
        ? `Travel zone: ${zoneName}`
        : `${miles.toFixed(1)} miles from service origin`,
    travelReviewRequired: isOutside,
  };
}
