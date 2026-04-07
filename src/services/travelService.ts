import { BusinessSettings } from "../types";

/**
 * Calculates the distance between two points in miles using the Haversine formula.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Radius of the Earth in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates the travel fee based on business settings and distance.
 */
export function calculateTravelFee(
  distance: number,
  settings: BusinessSettings["travelPricing"]
) {
  const { pricePerMile, freeMilesThreshold, minTravelFee, maxTravelFee, roundTripToggle } = settings;

  let billableMiles = Math.max(0, distance - freeMilesThreshold);
  if (roundTripToggle) {
    billableMiles *= 2;
  }

  let fee = billableMiles * pricePerMile;
  fee = Math.max(minTravelFee, Math.min(maxTravelFee, fee));

  return {
    fee: parseFloat(fee.toFixed(2)),
    miles: parseFloat(distance.toFixed(2)),
    billableMiles: parseFloat(billableMiles.toFixed(2)),
    rate: pricePerMile,
    isRoundTrip: roundTripToggle,
  };
}

/**
 * Estimates travel time in minutes based on distance (rough estimate: 2 mins per mile).
 * In a real app, use Google Distance Matrix API for accurate results.
 */
export function estimateTravelTime(distance: number): number {
  return Math.round(distance * 2); // 30mph average
}
