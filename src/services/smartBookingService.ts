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

export async function generateSmartRecommendations(input: {
  baseDate: Date;
  addressLat: number;
  addressLng: number;
  durationMinutes: number;
  rainThreshold: number;
}): Promise<SmartRecommendation[]> {
  const { baseDate, addressLat, addressLng, durationMinutes, rainThreshold } = input;
  
  const start = startOfDay(baseDate);
  const end = endOfDay(baseDate);

  // 1. Fetch appointments and blocks for the selected date
  const appointmentsRef = collection(db, "appointments");
  const qApps = query(
    appointmentsRef,
    where("scheduledAt", ">=", Timestamp.fromDate(start)),
    where("scheduledAt", "<=", Timestamp.fromDate(end))
  );
  
  const blocksRef = collection(db, "time_blocks");
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

  // 2. Generate potential slots (8 AM to 6 PM)
  const workingStartHour = 8;
  const workingEndHour = 18;
  const potentialSlots: { startTime: Date, endTime: Date }[] = [];
  
  let currentSlotTime = new Date(start);
  currentSlotTime.setHours(workingStartHour, 0, 0, 0);
  
  const closingTime = new Date(start);
  closingTime.setHours(workingEndHour, 0, 0, 0);

  const now = new Date();

  while (currentSlotTime < closingTime) {
    const slotStart = new Date(currentSlotTime);
    const slotEnd = addMinutes(slotStart, durationMinutes);
    
    // Ensure the slot respects business hours and is in the future
    if (slotEnd <= closingTime && isAfter(slotStart, now)) {
      potentialSlots.push({ startTime: slotStart, endTime: slotEnd });
    }
    currentSlotTime = addMinutes(currentSlotTime, 60); // Check every 60 mins
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
