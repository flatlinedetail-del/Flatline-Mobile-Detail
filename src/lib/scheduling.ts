import { Appointment } from "../types";
import { Timestamp, collection, query, where, getDocs, orderBy, startAt, endAt } from "firebase/firestore";
import { db } from "../firebase";

export interface RouteStop {
  id: string;
  address: string;
  scheduledAt: Timestamp;
  customerName: string;
  vehicleInfo: string;
  status: string;
  priority: number;
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

  const snapshot = await getDocs(q);
  const stops: RouteStop[] = snapshot.docs.map(doc => {
    const data = doc.data() as Appointment;
    return {
      id: doc.id,
      address: data.address,
      scheduledAt: data.scheduledAt,
      customerName: data.customerName,
      vehicleInfo: data.vehicleInfo,
      status: data.status,
      priority: data.status === "en_route" ? 1 : 2,
    };
  });

  // Simple heuristic: Sort by time first
  // In a real app, we'd use Google Maps Distance Matrix API here
  return stops.sort((a, b) => a.scheduledAt.toMillis() - b.scheduledAt.toMillis());
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
