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
 * Checks if a coordinate is inside a polygon defined by paths.
 */
export function isPointInPolygon(point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[]): boolean {
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > point.lng) !== (yj > point.lng)) &&
        (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
}

/**
 * Checks if a coordinate is inside a circle defined by center and radius (meters).
 */
export function isPointInCircle(point: { lat: number; lng: number }, center: { lat: number; lng: number }, radius: number): boolean {
  const distance = calculateDistance(point.lat, point.lng, center.lat, center.lng);
  const radiusMiles = radius / 1609.34;
  return distance <= radiusMiles;
}

/**
 * Calculates the travel fee based on business settings, distance, and coordinates.
 */
export function calculateTravelFee(
  distance: number,
  settings: BusinessSettings["travelPricing"],
  coordinates?: { lat: number; lng: number }
) {
  if (!settings.enabled) {
    return { fee: 0, miles: distance, zoneName: "", rate: 0, isRoundTrip: false };
  }

  const { pricePerMile, freeMilesThreshold, minTravelFee, maxTravelFee, roundTripToggle, mode, zones, mapZones } = settings;

  let fee = 0;
  let zoneName = "";

  // 1. Map-based Zones (Highest Priority)
  if (mode === "map_zones" && mapZones && mapZones.length > 0 && coordinates) {
    const matchingZone = mapZones.find(zone => {
      if (zone.type === 'circle' && zone.center && zone.radius) {
        return isPointInCircle(coordinates, zone.center, zone.radius);
      }
      return zone.paths ? isPointInPolygon(coordinates, zone.paths) : false;
    });
    if (matchingZone) {
      fee = matchingZone.fee;
      zoneName = matchingZone.name;
    } else {
      // Fallback if no map zone matches
      fee = 0;
      zoneName = "Outside Service Area";
    }
  } 
  // 2. Distance-based Zones
  else if (mode === "zones" && zones && zones.length > 0) {
    const matchingZone = zones.find(z => distance >= z.minDistance && distance < z.maxDistance);
    if (matchingZone) {
      fee = matchingZone.fee;
      zoneName = matchingZone.name;
    } else {
      const lastZone = [...zones].sort((a,b) => b.maxDistance - a.maxDistance)[0];
      if (distance >= lastZone.maxDistance) {
        fee = lastZone.fee;
        zoneName = lastZone.name;
      }
    }
  } 
  // 3. Mileage-based
  else {
    let billableMiles = Math.max(0, distance - freeMilesThreshold);
    if (roundTripToggle) {
      billableMiles *= 2;
    }
    fee = billableMiles * pricePerMile;
    fee = Math.max(minTravelFee, Math.min(maxTravelFee, fee));
  }

  return {
    fee: parseFloat(fee.toFixed(2)),
    miles: parseFloat(distance.toFixed(2)), // For internal use
    zoneName,
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
