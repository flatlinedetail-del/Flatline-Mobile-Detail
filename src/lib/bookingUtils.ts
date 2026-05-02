import { startOfDay, endOfDay, addMinutes } from "date-fns";

export interface BookingDataCache {
  appointments: any[];
  blockedDates: any[];
  businessHours: any;
}

export function checkLocalAvailability({
  targetDate,
  durationMinutes,
  cache,
  ignoreAppointmentId
}: {
  targetDate: Date;
  durationMinutes: number;
  cache: BookingDataCache;
  ignoreAppointmentId?: string;
}): { isAvailable: boolean; reason: string } {
  const slotStart = targetDate;
  const slotEnd = addMinutes(targetDate, durationMinutes);

  let conflictEvent = null;
  let isBlock = false;

  for (const app of cache.appointments) {
    if (ignoreAppointmentId && app.id === ignoreAppointmentId) continue;
    if (!app.scheduledAt) continue;
    
    // Ignore waitlisted and canceled
    if (app.status === "canceled" || app.status === "waitlisted" || app.status === "pending_waitlist") continue;

    const evtStart = app.scheduledAt.toDate ? app.scheduledAt.toDate() : new Date(app.scheduledAt);
    const evtDur = app.estimatedDuration || 120;
    const evtEnd = addMinutes(evtStart, evtDur + (app.overrideBufferTimeMinutes ?? 30));

    if (slotStart < evtEnd && slotEnd > evtStart) {
      conflictEvent = app;
      break;
    }
  }

  if (!conflictEvent) {
    for (const block of cache.blockedDates) {
      if (!block.start || !block.end) continue;
      const blockStart = block.start.toDate ? block.start.toDate() : new Date(block.start);
      const blockEnd = block.end.toDate ? block.end.toDate() : new Date(block.end);
      
      if (slotStart < blockEnd && slotEnd > blockStart) {
        conflictEvent = block;
        isBlock = true;
        break;
      }
    }
  }

  if (conflictEvent) {
    if (isBlock) {
      return { isAvailable: false, reason: "Time slot is blocked off." };
    } else {
      return { isAvailable: false, reason: "Conflicts with an existing appointment and required buffer time." };
    }
  }

  // Check business hours
  if (cache.businessHours) {
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = daysOfWeek[targetDate.getDay()];
    const daySettings = cache.businessHours[dayName];
    
    if (daySettings) {
      if (!daySettings.isOpen) {
        return { isAvailable: false, reason: "Business is closed on this day." };
      }
      
      const [openH, openM] = daySettings.openTime.split(":").map(Number);
      const [closeH, closeM] = daySettings.closeTime.split(":").map(Number);
      
      const dayStart = startOfDay(targetDate);
      const bizStart = addMinutes(dayStart, openH * 60 + openM);
      const bizEnd = addMinutes(dayStart, closeH * 60 + closeM);
      
      if (slotStart < bizStart || slotEnd > bizEnd) {
        if (!cache.businessHours.allowAfterHours) {
          return { isAvailable: false, reason: "Outside of regular business hours." };
        }
      }
    }
  }

  return { isAvailable: true, reason: "" };
}

export function findLocalBackupSlots(
  baseDate: Date,
  durationMinutes: number,
  cache: BookingDataCache,
  limit: number = 3
): Date[] {
  const backups: Date[] = [];
  const searchStart = new Date(baseDate);
  searchStart.setHours(8, 0, 0, 0); // start checking from 8 AM of that day
  
  // Search for the next 14 days
  for (let i = 0; i < 14; i++) {
    const dayStart = new Date(searchStart);
    dayStart.setDate(dayStart.getDate() + i);
    
    // Check slots every 30 minutes from 8 AM to 6 PM
    for (let h = 8; h <= 17; h++) {
      for (let m = 0; m < 60; m += 30) {
        const slot = new Date(dayStart);
        slot.setHours(h, m, 0, 0);
        
        // Ensure the slot is in the future relative to the baseDate's time if it's the same day, otherwise just future
        if (slot <= new Date()) continue;
        if (i === 0 && slot <= baseDate) continue;

        const check = checkLocalAvailability({
          targetDate: slot,
          durationMinutes,
          cache
        });

        if (check.isAvailable) {
          backups.push(slot);
          if (backups.length >= limit) {
            return backups;
          }
        }
      }
    }
  }

  return backups;
}
