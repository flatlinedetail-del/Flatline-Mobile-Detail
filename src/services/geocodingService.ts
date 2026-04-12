import { BusinessSettings } from "../types";

/**
 * Geocodes an address using Google Maps Geocoding API.
 * Requires VITE_GOOGLE_MAPS_API_KEY to be set.
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    throw new Error("Google Maps API Key missing.");
  }

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
  );
  const data = await response.json();

  if (data.status === "OK" && data.results.length > 0) {
    const { lat, lng } = data.results[0].geometry.location;
    return { lat, lng };
  }
  
  throw new Error(`Geocoding failed: ${data.status} - ${data.error_message || "No results"}`);
}
