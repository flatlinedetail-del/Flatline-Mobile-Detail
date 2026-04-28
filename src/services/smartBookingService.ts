import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { getAppointmentWeather } from "./weatherService";
import { startOfDay, endOfDay, addMinutes, isAfter } from "date-fns";

export interface SmartRecommendation {
  id: string;
  startTime: Date;
  endTime: Date;
  rank: "Best" | "Good" | "Avoid";
  reasons: string[];
}

export async function checkAvailability(input: {
  targetDate: Date;
  durationMinutes: number;
  ignoreAppointmentId?: string;
  businessHours?: any;
}): Promise<{ isAvailable: boolean; reason: string }> {
  const { targetDate, durationMinutes, ignoreAppointmentId, businessHours } = input;
  
  const start = startOfDay(targetDate);
  const end = endOfDay(targetDate);
  const slotStart = targetDate;
  const slotEnd = addMinutes(targetDate, durationMinutes);

  const appointmentsRef = collection(db, "appointments");
  const qApps = query(
    appointmentsRef,
    where("scheduledAt", ">=", Timestamp.fromDate(start)),
    where("scheduledAt", "<=", Timestamp.fromDate(end))
  );
  
  const blocksRef = collection(db, "blocked_dates");
  const qBlocks = query(
    blocksRef,
    where("start", ">=", Timestamp.fromDate(start)),
    where("start", "<=", Timestamp.fromDate(end))
  );

  const [appsSnap, blocksSnap] = await Promise.all([getDocs(qApps), getDocs(qBlocks)]);
  
  let conflictEvent = null;
  let isBlock = false;

  for (const d of appsSnap.docs) {
    if (ignoreAppointmentId && d.id === ignoreAppointmentId) continue;
    const app = d.data();
    if (!app.scheduledAt) continue;
    
    // Ignore waitlisted and canceled appointments as conflicts
    if (app.status === "canceled" || app.status === "waitlisted" || app.status === "pending_waitlist") continue;

    const evtStart = app.scheduledAt.toDate ? app.scheduledAt.toDate() : new Date(app.scheduledAt);
    const evtDur = app.estimatedDuration || 120;
    const evtEnd = addMinutes(evtStart, evtDur + (app.overrideBufferTimeMinutes || 30)); // 30 min buffer is standard

    if (slotStart < evtEnd && slotEnd > evtStart) {
      conflictEvent = app;
      break;
    }
  }

  if (!conflictEvent) {
    for (const d of blocksSnap.docs) {
      const block = d.data();
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
  if (businessHours) {
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = daysOfWeek[targetDate.getDay()];
    const daySettings = businessHours[dayName];
    
    if (daySettings) {
      if (!daySettings.isOpen) {
        return { isAvailable: false, reason: "Business is closed on this day." };
      }
      
      const [openH, openM] = daySettings.openTime.split(":").map(Number);
      const [closeH, closeM] = daySettings.closeTime.split(":").map(Number);
      
      const workingStart = openH * 60 + (openM || 0);
      const workingEnd = closeH * 60 + (closeM || 0);
      
      const slotStartMin = slotStart.getHours() * 60 + slotStart.getMinutes();
      const slotEndMin = slotEnd.getHours() * 60 + slotEnd.getMinutes();

      if ((slotStartMin < workingStart || slotEndMin > workingEnd) && !businessHours.allowAfterHours) {
        return { isAvailable: false, reason: "Time slot is outside of normal business hours." };
      }
    }
  }

  return { isAvailable: true, reason: "Time slot is open and has enough service duration + buffer time." };
}

export async function generateSmartRecommendations(input: {
  baseDate: Date;
  addressLat: number;
  addressLng: number;
  durationMinutes: number;
  rainThreshold: number;
  businessHours?: any;
}): Promise<SmartRecommendation[]> {
  const { baseDate, addressLat, addressLng, durationMinutes, rainThreshold, businessHours } = input;
  
  const start = startOfDay(baseDate);
  const end = endOfDay(baseDate);

  // 1. Fetch appointments and blocks for the selected date
  const appointmentsRef = collection(db, "appointments");
  const qApps = query(
    appointmentsRef,
    where("scheduledAt", ">=", Timestamp.fromDate(start)),
    where("scheduledAt", "<=", Timestamp.fromDate(end))
  );
  
  const blocksRef = collection(db, "blocked_dates");
  const qBlocks = query(
    blocksRef,
    where("start", ">=", Timestamp.fromDate(start)),
    where("start", "<=", Timestamp.fromDate(end))
  );

  const [appsSnap, blocksSnap] = await Promise.all([getDocs(qApps), getDocs(qBlocks)]);
  
  const existingEvents: { start: Date, end: Date, lat?: number, lng?: number, type: string }[] = [];
  
  appsSnap.forEach(d => {
    const app = d.data();
    if (!app.scheduledAt) return;
    const evtStart = app.scheduledAt.toDate ? app.scheduledAt.toDate() : new Date(app.scheduledAt);
    const evtDur = app.estimatedDuration || 120;
    const evtEnd = addMinutes(evtStart, evtDur + (app.overrideBufferTimeMinutes || 0));
    existingEvents.push({ start: evtStart, end: evtEnd, lat: app.latitude, lng: app.longitude, type: "appointment" });
  });

  blocksSnap.forEach(d => {
    const block = d.data();
    if (!block.start || !block.end) return;
    const blockStart = block.start.toDate ? block.start.toDate() : new Date(block.start);
    const blockEnd = block.end.toDate ? block.end.toDate() : new Date(block.end);
    existingEvents.push({ start: blockStart, end: blockEnd, type: "block" });
  });

  // Sort events by start time
  existingEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

  // 2. Determine operating hours
  let workingStartHour = 8;
  let workingEndHour = 18;
  let workingStartMin = 0;
  let workingEndMin = 0;
  let isClosed = false;
  let allowAfterHours = false;

  if (businessHours) {
    allowAfterHours = businessHours.allowAfterHours;
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = daysOfWeek[start.getDay()];
    const daySettings = businessHours[dayName];
    
    if (daySettings) {
      if (!daySettings.isOpen) {
        isClosed = true;
      } else {
        const [openH, openM] = daySettings.openTime.split(":").map(Number);
        const [closeH, closeM] = daySettings.closeTime.split(":").map(Number);
        workingStartHour = openH;
        workingStartMin = openM || 0;
        workingEndHour = closeH;
        workingEndMin = closeM || 0;
      }
    }
  }

  // If closed entirely, skip unless allowAfterHours is true (if true, we could theoretically still allow slots, but typically "closed implies no normal slots". For now, if closed and no after hours, return [])
  if (isClosed && !allowAfterHours) return [];

  // If after hours allowed or not closed, generate slots
  // Generate slots from 6AM to 10PM to look for available spots
  const scanStartHour = allowAfterHours ? 6 : workingStartHour;
  const scanEndHour = allowAfterHours ? 22 : workingEndHour;

  const potentialSlots: { startTime: Date, endTime: Date }[] = [];
  
  let currentSlotTime = new Date(start);
  currentSlotTime.setHours(scanStartHour, allowAfterHours ? 0 : workingStartMin, 0, 0);
  
  const scanLimitTime = new Date(start);
  scanLimitTime.setHours(scanEndHour, allowAfterHours ? 0 : workingEndMin, 0, 0);

  const now = new Date();

  while (currentSlotTime < scanLimitTime) {
    const slotStart = new Date(currentSlotTime);
    const slotEnd = addMinutes(slotStart, durationMinutes);
    
    if (slotEnd <= scanLimitTime && isAfter(slotStart, now)) {
      potentialSlots.push({ startTime: slotStart, endTime: slotEnd });
    }
    currentSlotTime = addMinutes(currentSlotTime, 60);
  }

  // Filter overlapping slots
  const availableSlots = potentialSlots.filter(slot => {
    return !existingEvents.some(evt => {
      // Overlap logic: slot.start < evt.end && slot.end > evt.start
      return slot.startTime < evt.end && slot.endTime > evt.start;
    });
  });

  if (availableSlots.length === 0) return [];

  const recommendations: SmartRecommendation[] = [];

  for (let i = 0; i < availableSlots.length; i++) {
    const slot = availableSlots[i];
    let rank: "Best" | "Good" | "Avoid" = "Good";
    const reasons: string[] = [];
    
    // Routing check: previous and next appointments
    const prevEvent = existingEvents.slice().reverse().find(e => e.end <= slot.startTime);
    const nextEvent = existingEvents.find(e => e.start >= slot.endTime);
    
    let travelBonus = false;

    if (addressLat && addressLng) {
      if (prevEvent && prevEvent.lat && prevEvent.lng) {
          const latDiff = Math.abs(prevEvent.lat - addressLat);
          const lngDiff = Math.abs(prevEvent.lng - addressLng);
          if (latDiff < 0.05 && lngDiff < 0.05) {
              travelBonus = true;
              reasons.push("Clustered with nearby appointment (High Route Efficiency)");
          } else if (latDiff > 0.5 || lngDiff > 0.5) {
              reasons.push("Long travel distance from previous appointment");
          }
      }

      if (nextEvent && nextEvent.lat && nextEvent.lng && !travelBonus) {
          const latDiff = Math.abs(nextEvent.lat - addressLat);
          const lngDiff = Math.abs(nextEvent.lng - addressLng);
          if (latDiff < 0.05 && lngDiff < 0.05) {
              travelBonus = true;
              reasons.push("Clustered with next appointment (High Route Efficiency)");
          }
      }
    }

    // Gap check
    if (prevEvent && nextEvent) {
      const gapStart = prevEvent.end;
      const gapEnd = nextEvent.start;
      const gapMinutes = (gapEnd.getTime() - gapStart.getTime()) / 60000;
      if (gapMinutes >= durationMinutes && gapMinutes <= durationMinutes + 60) {
        reasons.push("Perfect schedule fit (Reduces idle time)");
        rank = "Best";
      }
    } else if (travelBonus) {
      rank = "Best";
    }

    // After hours check
    const isSlotAfterHours = isClosed || 
      (slot.startTime.getHours() * 60 + slot.startTime.getMinutes() < workingStartHour * 60 + workingStartMin) || 
      (slot.endTime.getHours() * 60 + slot.endTime.getMinutes() > workingEndHour * 60 + workingEndMin);
      
    if (isSlotAfterHours) {
      rank = "Avoid";
      reasons.push(`After-hours fee applies ($${businessHours?.afterHoursFeeAmount || 0})`);
    }

    // Weather check per slot
    let weatherData = null;
    try {
      if (addressLat && addressLng) {
        weatherData = await getAppointmentWeather(addressLat, addressLng, slot.startTime.getTime());
      }
    } catch (err) {
      console.warn("Weather fetch failed for slot", err);
    }
    
    if (weatherData) {
      if (weatherData.rainProbability >= rainThreshold) {
        rank = "Avoid";
        reasons.push(`High rain risk (${weatherData.rainProbability}%)`);
      } else if (weatherData.rainProbability === 0) {
        reasons.push("Clear weather conditions verified");
      }
    }

    if (reasons.length === 0) {
      reasons.push("Standard available time slot");
    }

    recommendations.push({
      id: `slot-${slot.startTime.getTime()}`,
      startTime: slot.startTime,
      endTime: slot.endTime,
      rank,
      reasons
    });
  }

  const rankVal = { "Best": 1, "Good": 2, "Avoid": 3 };
  recommendations.sort((a, b) => {
    if (rankVal[a.rank] !== rankVal[b.rank]) return rankVal[a.rank] - rankVal[b.rank];
    return a.startTime.getTime() - b.startTime.getTime();
  });

  return recommendations.slice(0, 4); // return up to 4 best slots
}
