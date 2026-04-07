import { Appointment, BusinessSettings } from "../types";
import { Timestamp, collection, query, where, getDocs, orderBy, startAt, endAt, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { calculateDistance, estimateTravelTime } from "../services/travelService";

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
  travelTimeFromPrevious?: number; // in minutes
  distanceFromPrevious?: number; // in miles
}

/**
 * Simple Route Optimization Logic
 * 1. Groups appointments by day
 * 2. Sorts by scheduled time
 * 3. Calculates distance/time between stops (simulated for now)
 * 4. Suggests re-ordering if it saves travel time
 */
export async function optimizeRoute(date: Date): Promise<RouteStop[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

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
  
  let stops: RouteStop[] = snapshot.docs.map(doc => {
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
      priority: data.status === "en_route" ? 1 : 2,
      totalAmount: data.totalAmount || 0,
    };
  });

  // Sort by time first
  stops.sort((a, b) => a.scheduledAt.toMillis() - b.scheduledAt.toMillis());

  // Calculate travel estimates between stops
  let prevLat = settings?.baseLatitude || 0;
  let prevLng = settings?.baseLongitude || 0;

  stops = stops.map(stop => {
    if (stop.latitude && stop.longitude && prevLat && prevLng) {
      const distance = calculateDistance(prevLat, prevLng, stop.latitude, stop.longitude);
      const time = estimateTravelTime(distance);
      
      const updatedStop = {
        ...stop,
        distanceFromPrevious: Math.round(distance * 10) / 10,
        travelTimeFromPrevious: time
      };

      prevLat = stop.latitude;
      prevLng = stop.longitude;
      return updatedStop;
    }
    return stop;
  });

  return stops;
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
