import { addDays, addMonths, isBefore, isAfter, isSameDay, subDays } from "date-fns";
import { Timestamp } from "firebase/firestore";
import { Appointment, Service, Vehicle } from "../types";

export type DueStatus = "Current" | "Due Soon" | "Due" | "Overdue" | "Never Performed";

export interface ServiceTimingOutput {
  vehicleId: string;
  vehicleName: string;
  serviceId: string;
  serviceName: string;
  lastCompletedDate: Date | null;
  nextDueDate: Date | null;
  dueStatus: DueStatus;
  intervalUsed: string | null;
}

const DUE_SOON_THRESHOLD_DAYS = 14;

export function calculateDueStatus(nextDueDate: Date | null, lastCompletedDate: Date | null): DueStatus {
  if (!lastCompletedDate || !nextDueDate) {
    return "Never Performed";
  }

  const now = new Date();
  
  // Normalize times to midnight for date-only comparisons
  const normalizedNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const normalizedDue = new Date(nextDueDate.getFullYear(), nextDueDate.getMonth(), nextDueDate.getDate());
  const normalizedDueSoonStart = subDays(normalizedDue, DUE_SOON_THRESHOLD_DAYS);

  if (isAfter(normalizedNow, normalizedDue)) {
    return "Overdue";
  } else if (isSameDay(normalizedNow, normalizedDue)) {
    return "Due";
  } else if (isAfter(normalizedNow, normalizedDueSoonStart) || isSameDay(normalizedNow, normalizedDueSoonStart)) {
    return "Due Soon";
  } else {
    return "Current";
  }
}

function calculateNextDueDate(lastCompletedDate: Date, intervalDays?: number, intervalMonths?: number): Date | null {
  if (!intervalDays && !intervalMonths) {
    return null;
  }
  
  if (intervalMonths) {
    return addMonths(lastCompletedDate, intervalMonths);
  }
  
  if (intervalDays) {
    return addDays(lastCompletedDate, intervalDays);
  }
  
  return null;
}

function formatInterval(intervalDays?: number, intervalMonths?: number): string | null {
  if (intervalMonths) return `${intervalMonths} Month${intervalMonths > 1 ? 's' : ''}`;
  if (intervalDays) return `${intervalDays} Day${intervalDays > 1 ? 's' : ''}`;
  return null;
}

export function generateServiceTimingIntelligence(
  vehicles: Vehicle[],
  appointments: Appointment[],
  services: Service[]
): ServiceTimingOutput[] {
  const output: ServiceTimingOutput[] = [];
  
  // Only process services that have an interval defined
  const routineServices = services.filter(s => s.maintenanceIntervalDays || s.maintenanceIntervalMonths);
  
  // Filter for completed appointments
  const completedAppointments = appointments.filter(a => a.status === "completed" || a.status === "paid");
  
  for (const vehicle of vehicles) {
    const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    
    // Find appointments that involve this vehicle
    const vehicleAppointments = completedAppointments.filter(a => {
      if (a.vehicleIds && a.vehicleIds.includes(vehicle.id)) return true;
      if (a.vehicleId === vehicle.id) return true;
      return false;
    });
    
    for (const service of routineServices) {
      // Find the most recent appointment for this specific service on this vehicle
      let lastCompletedDate: Date | null = null;
      
      for (const app of vehicleAppointments) {
        if (app.serviceIds && app.serviceIds.includes(service.id)) {
          const appDate = app.scheduledAt instanceof Timestamp ? app.scheduledAt.toDate() : new Date(app.scheduledAt as any);
          if (!lastCompletedDate || isAfter(appDate, lastCompletedDate)) {
            lastCompletedDate = appDate;
          }
        }
      }
      
      const intervalUsed = formatInterval(service.maintenanceIntervalDays, service.maintenanceIntervalMonths);
      const nextDueDate = lastCompletedDate ? calculateNextDueDate(lastCompletedDate, service.maintenanceIntervalDays, service.maintenanceIntervalMonths) : null;
      const dueStatus = calculateDueStatus(nextDueDate, lastCompletedDate);
      
      if (lastCompletedDate) {
        output.push({
          vehicleId: vehicle.id,
          vehicleName,
          serviceId: service.id,
          serviceName: service.name,
          lastCompletedDate,
          nextDueDate,
          dueStatus,
          intervalUsed
        });
      }
    }
  }
  
  // Sort by next due date ascending (most overdue first)
  output.sort((a, b) => {
    if (!a.nextDueDate) return 1;
    if (!b.nextDueDate) return -1;
    return a.nextDueDate.getTime() - b.nextDueDate.getTime();
  });
  
  return output;
}
