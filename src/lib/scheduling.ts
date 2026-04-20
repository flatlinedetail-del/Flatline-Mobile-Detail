import { Appointment, BusinessSettings } from "../types";
import { Timestamp, collection, query, where, getDocs, orderBy, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { calculateDistance, estimateTravelTime } from "../services/travelService";
import { geocodeAddress } from "../services/geocodingService";

export interface RouteStop {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  scheduledAt: Timestamp;
  customerName: string;
  vehicleInfo: string;
  status: string;
  priority: number;
  totalAmount: number;
  estimatedDuration: number; // in minutes
  recurringInfo?: Appointment["recurringInfo"];
  travelTimeFromPrevious?: number; // in minutes
  distanceFromPrevious?: number; // in miles
  optimizationNote?: string;
}

/**
 * Route Optimization Logic
 * 1. Fetches appointments for the day
 * 2. Geocodes missing coordinates
 * 3. Uses Nearest Neighbor algorithm to suggest optimal sequence
 * 4. Calculates real travel estimates
 */
export async function optimizeRoute(date: Date): Promise<{ stops: RouteStop[], error?: string }> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  try {
    const q = query(
      collection(db, "appointments"),
      where("scheduledAt", ">=", Timestamp.fromDate(start)),
      where("scheduledAt", "<=", Timestamp.fromDate(end)),
      orderBy("scheduledAt", "asc")
    );

    const [snapshot, settingsSnap] = await Promise.all([
      getDocs(q),
      getDoc(doc(db, "settings", "business"))
    ]);

    const settings = settingsSnap.exists() ? settingsSnap.data() as BusinessSettings : null;
    
    // 1. Prepare stops and geocode if necessary
    const errors: string[] = [];
    const rawStopsResults = await Promise.all(snapshot.docs.map(async (appointmentDoc) => {
      const data = appointmentDoc.data() as Appointment;
      let lat = data.latitude;
      let lng = data.longitude;

      // Fallback to geocoding if coordinates are missing
      if ((!lat || !lng) && data.address) {
        try {
          const coords = await geocodeAddress(data.address);
          lat = coords.lat;
          lng = coords.lng;
          // Update the document with coordinates for future use
          await updateDoc(doc(db, "appointments", appointmentDoc.id), {
            latitude: lat,
            longitude: lng
          });
        } catch (error) {
          console.error(`Geocoding failed for ${data.address}:`, error);
          errors.push(`Missing coordinates for appointment: ${data.customerName} - ${data.address}`);
        }
      }

      if (!lat || !lng) {
        return null;
      }

      return {
        id: appointmentDoc.id,
        address: data.address,
        latitude: lat,
        longitude: lng,
        scheduledAt: data.scheduledAt,
        customerName: data.customerName,
        vehicleInfo: data.vehicleInfo,
        status: data.status,
        priority: data.status === "en_route" ? 1 : 2,
        totalAmount: data.totalAmount || 0,
        estimatedDuration: data.estimatedDuration || 120,
        recurringInfo: data.recurringInfo || null,
      };
    }));

    const rawStops = rawStopsResults.filter(Boolean) as RouteStop[];

    if (rawStops.length === 0) return { stops: [], error: errors.length > 0 ? errors.join("\n") : undefined };

    // 2. Optimization Algorithm (Nearest Neighbor)
    // We start from the business base location
    let currentLat = settings?.baseLatitude || 0;
    let currentLng = settings?.baseLongitude || 0;
    
    const unvisited = [...rawStops];
    const optimized: RouteStop[] = [];

    while (unvisited.length > 0) {
      let closestIndex = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const stop = unvisited[i];
        if (stop.latitude && stop.longitude) {
          const dist = calculateDistance(currentLat, currentLng, stop.latitude, stop.longitude);
          if (dist < minDistance) {
            minDistance = dist;
            closestIndex = i;
          }
        }
      }

      const nextStop = unvisited.splice(closestIndex, 1)[0];
      const travelTime = estimateTravelTime(minDistance === Infinity ? 0 : minDistance);

      optimized.push({
        ...nextStop,
        distanceFromPrevious: minDistance === Infinity ? 0 : Math.round(minDistance * 10) / 10,
        travelTimeFromPrevious: travelTime,
        optimizationNote: optimized.length === 0 ? "Starting from Base" : undefined
      });

      currentLat = nextStop.latitude;
      currentLng = nextStop.longitude;
    }

    return { 
      stops: optimized,
      error: errors.length > 0 ? errors.join("\n") : undefined
    };
  } catch (error) {
    console.error("Route optimization failed:", error);
    // Fallback: Return time-sorted stops without distance calculations if everything fails
    const qFallback = query(
      collection(db, "appointments"),
      where("scheduledAt", ">=", Timestamp.fromDate(start)),
      where("scheduledAt", "<=", Timestamp.fromDate(end)),
      orderBy("scheduledAt", "asc")
    );
    const snapshot = await getDocs(qFallback);
    const stops = snapshot.docs.map(doc => {
      const data = doc.data() as Appointment;
      return {
        id: doc.id,
        address: data.address,
        latitude: data.latitude || 0,
        longitude: data.longitude || 0,
        scheduledAt: data.scheduledAt,
        customerName: data.customerName,
        vehicleInfo: data.vehicleInfo,
        status: data.status,
        priority: 2,
        totalAmount: data.totalAmount || 0,
        estimatedDuration: data.estimatedDuration || 120,
        recurringInfo: data.recurringInfo || null,
        optimizationNote: "Fallback: Sorted by time"
      };
    });
    return { stops, error: "Route optimization failed. Showing time-sorted list." };
  }
}

/**
 * Projected vs Actual Sales Calculation
 */
export async function calculateDailyPerformance(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, "appointments"),
    where("scheduledAt", ">=", Timestamp.fromDate(start)),
    where("scheduledAt", "<=", Timestamp.fromDate(end))
  );

  const snapshot = await getDocs(q);
  let projected = 0;
  let completed = 0;
  let pending = 0;

  snapshot.docs.forEach(doc => {
    const data = doc.data() as Appointment;
    projected += data.totalAmount;
    if (data.status === "completed" || data.status === "paid") {
      completed += data.totalAmount;
    } else if (data.status !== "canceled") {
      pending += data.totalAmount;
    }
  });

  return { projected, completed, pending };
}

/**
 * Recurring Membership Logic
 * Checks if a customer is due for their recurring maintenance
 */
export function isMaintenanceDue(lastService: Date, frequency: "monthly" | "biweekly" | "weekly"): boolean {
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - lastService.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const threshold = frequency === "monthly" ? 30 : frequency === "biweekly" ? 14 : 7;
  return diffDays >= threshold;
}
