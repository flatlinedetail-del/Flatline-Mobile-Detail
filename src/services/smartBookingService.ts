import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { getAppointmentWeather } from "./weatherService";
import { startOfDay, endOfDay, addMinutes, isAfter, parse, isValid } from "date-fns";

export interface SmartRecommendation {
  id: string;
  startTime: Date;
  endTime: Date;
  rank: "Best" | "Good" | "Avoid";
  reasons: string[];
  isSelectedTime?: boolean;
}

export function parseFlexibleDate(dateInput: any): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isValid(dateInput) ? dateInput : null;
  if (typeof dateInput === 'string') {
    // Try ISO
    const iso = new Date(dateInput);
    if (isValid(iso)) return iso;

    // Try MM/DD/YYYY, hh:mm AM/PM
    try {
      const parsed = parse(dateInput, "MM/dd/yyyy, hh:mm a", new Date());
      if (isValid(parsed)) return parsed;
    } catch (e) {}

    // Try other common formats if needed
  }
  return null;
}

const DEFAULT_BUSINESS_HOURS = {
  monday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
  tuesday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
  wednesday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
  thursday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
  friday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
  saturday: { isOpen: true, openTime: "08:00", closeTime: "18:00" },
  sunday: { isOpen: false, openTime: "08:00", closeTime: "18:00" },
  allowAfterHours: false,
  afterHoursFeeAmount: 50
};

export async function checkAvailability(input: {
  targetDate: Date;
  durationMinutes: number;
  ignoreAppointmentId?: string;
  businessHours?: any;
}): Promise<{ isAvailable: boolean; reason: string }> {
  const { targetDate, durationMinutes, ignoreAppointmentId, businessHours: bHoursRaw } = input;
  const businessHours = bHoursRaw || DEFAULT_BUSINESS_HOURS;
  
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
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = daysOfWeek[targetDate.getDay()];
  const daySettings = businessHours[dayName];
  
  if (daySettings) {
    if (!daySettings.isOpen) {
      return { isAvailable: false, reason: "Business is closed on this day." };
    }
    
    const [openH, openM] = (daySettings.openTime || "08:00").split(":").map(Number);
    const [closeH, closeM] = (daySettings.closeTime || "18:00").split(":").map(Number);
    
    const workingStart = openH * 60 + (openM || 0);
    const workingEnd = closeH * 60 + (closeM || 0);
    
    const slotStartMin = slotStart.getHours() * 60 + slotStart.getMinutes();
    const slotEndMin = slotEnd.getHours() * 60 + slotEnd.getMinutes();

    if ((slotStartMin < workingStart || slotEndMin > workingEnd) && !businessHours.allowAfterHours) {
      return { isAvailable: false, reason: "Outside of business hours." };
    }
  }

  return { isAvailable: true, reason: "Available" };
}

export async function generateSmartRecommendations(input: {
  baseDate: Date;
  addressLat: number;
  addressLng: number;
  durationMinutes: number;
  rainThreshold: number;
  businessHours?: any;
  selectedTime?: Date;
}): Promise<SmartRecommendation[]> {
  const { baseDate, addressLat, addressLng, durationMinutes, rainThreshold, businessHours: bHoursRaw, selectedTime } = input;
  const businessHours = bHoursRaw || DEFAULT_BUSINESS_HOURS;
  
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
    if (app.status === "canceled" || app.status === "waitlisted" || app.status === "pending_waitlist") return;
    
    const evtStart = app.scheduledAt.toDate ? app.scheduledAt.toDate() : new Date(app.scheduledAt);
    const evtDur = app.estimatedDuration || 120;
    const evtEnd = addMinutes(evtStart, evtDur + (app.overrideBufferTimeMinutes || 30));
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

  allowAfterHours = businessHours.allowAfterHours;
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = daysOfWeek[start.getDay()];
  const daySettings = businessHours[dayName];
  
  if (daySettings) {
    if (!daySettings.isOpen) {
      isClosed = true;
    } else {
      const [openH, openM] = (daySettings.openTime || "08:00").split(":").map(Number);
      const [closeH, closeM] = (daySettings.closeTime || "18:00").split(":").map(Number);
      workingStartHour = openH;
      workingStartMin = openM || 0;
      workingEndHour = closeH;
      workingEndMin = closeM || 0;
    }
  }

  // If closed entirely, return empty unless allowAfterHours is true
  if (isClosed && !allowAfterHours) return [];

  // Generate potential slots
  const scanStartHour = allowAfterHours ? 6 : workingStartHour;
  const scanEndHour = allowAfterHours ? 22 : workingEndHour;

  const potentialSlots: { startTime: Date, endTime: Date, isSelected?: boolean }[] = [];
  
  // Include specifically selected time if it's within business hours OR after hours allowed
  if (selectedTime) {
    const selStart = new Date(selectedTime);
    const selEnd = addMinutes(selStart, durationMinutes);
    potentialSlots.push({ startTime: selStart, endTime: selEnd, isSelected: true });
  }

  let currentSlotTime = new Date(start);
  currentSlotTime.setHours(scanStartHour, allowAfterHours ? 0 : workingStartMin, 0, 0);
  
  const scanLimitTime = new Date(start);
  scanLimitTime.setHours(scanEndHour, allowAfterHours ? 0 : workingEndMin, 0, 0);

  const now = new Date();

  while (currentSlotTime < scanLimitTime) {
    const slotStart = new Date(currentSlotTime);
    const slotEnd = addMinutes(slotStart, durationMinutes);
    
    if (slotEnd <= scanLimitTime && isAfter(slotStart, now)) {
      // Avoid adding duplicate of selected time if it's already there
      if (!selectedTime || Math.abs(selectedTime.getTime() - slotStart.getTime()) > 5 * 60000) {
        potentialSlots.push({ startTime: slotStart, endTime: slotEnd });
      }
    }
    currentSlotTime = addMinutes(currentSlotTime, 60);
  }

  // Filter overlapping slots
  const availableSlots = potentialSlots.filter(slot => {
    return !existingEvents.some(evt => {
      return slot.startTime < evt.end && slot.endTime > evt.start;
    });
  });

  if (availableSlots.length === 0) return [];

  const recommendations: SmartRecommendation[] = [];

  for (let i = 0; i < availableSlots.length; i++) {
    const slot = availableSlots[i];
    let rank: "Best" | "Good" | "Avoid" = "Good";
    const reasons: string[] = [];
    
    // Routing check
    const prevEvent = existingEvents.slice().reverse().find(e => e.end <= slot.startTime);
    const nextEvent = existingEvents.find(e => e.start >= slot.endTime);
    
    let travelBonus = false;

    if (addressLat && addressLng) {
      if (prevEvent && prevEvent.lat && prevEvent.lng) {
          const latDiff = Math.abs(prevEvent.lat - addressLat);
          const lngDiff = Math.abs(prevEvent.lng - addressLng);
          if (latDiff < 0.05 && lngDiff < 0.05) {
              travelBonus = true;
              reasons.push("Nearby previous appointment (Route Sync)");
          }
      }

      if (nextEvent && nextEvent.lat && nextEvent.lng && !travelBonus) {
          const latDiff = Math.abs(nextEvent.lat - addressLat);
          const lngDiff = Math.abs(nextEvent.lng - addressLng);
          if (latDiff < 0.05 && lngDiff < 0.05) {
              travelBonus = true;
              reasons.push("Nearby next appointment (Route Sync)");
          }
      }
    }

    // Gap check
    if (prevEvent && nextEvent) {
      const gapStart = prevEvent.end;
      const gapEnd = nextEvent.start;
      const gapMinutes = (gapEnd.getTime() - gapStart.getTime()) / 60000;
      if (gapMinutes >= durationMinutes && gapMinutes <= durationMinutes + 45) {
        reasons.push("Perfect schedule overlap (Zero idle time)");
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
      reasons.push("After-hours window");
    }

    // Weather check
    let weatherData = null;
    try {
      if (addressLat && addressLng) {
        weatherData = await getAppointmentWeather(addressLat, addressLng, slot.startTime.getTime());
      }
    } catch (err) {}
    
    if (weatherData) {
      if (weatherData.rainProbability >= rainThreshold) {
        rank = "Avoid";
        reasons.push(`High rain risk (${weatherData.rainProbability}%)`);
      } else if (weatherData.rainProbability === 0) {
        reasons.push("Clear sky conditions verified");
      }
    }

    if (reasons.length === 0) {
      reasons.push("Verified available slot");
    }

    recommendations.push({
      id: `slot-${slot.startTime.getTime()}`,
      startTime: slot.startTime,
      endTime: slot.endTime,
      rank,
      reasons,
      isSelectedTime: slot.isSelected
    });
  }

  const rankVal = { "Best": 1, "Good": 2, "Avoid": 3 };
  recommendations.sort((a, b) => {
    if (a.isSelectedTime && a.rank !== "Avoid") return -1;
    if (b.isSelectedTime && b.rank !== "Avoid") return 1;
    if (rankVal[a.rank] !== rankVal[b.rank]) return rankVal[a.rank] - rankVal[b.rank];
    return a.startTime.getTime() - b.startTime.getTime();
  });

  return recommendations.slice(0, 4);
}

