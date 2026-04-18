import { addMinutes, startOfDay, endOfDay, addDays, isBefore, isAfter, differenceInMinutes, setHours, setMinutes } from "date-fns";
import { Appointment, BusinessSettings } from "../types";
import { calculateDistance, calculateTravelFee, estimateTravelTime } from "./travelService";

export interface RecommendedSlot {
  start: Date;
  end: Date;
  score: number;
  explanation: string;
  recommendationLevel: "best" | "good" | "avoid";
  travelTimeFromPrior?: number;
  travelTimeToNext?: number;
  distanceFromPrior?: number;
  distanceToNext?: number;
}

const DEFAULT_WORKING_HOURS = {
  start: "08:00",
  end: "18:00",
  daysEnabled: [1, 2, 3, 4, 5, 6] // Mon-Sat
};

/**
 * Generates recommended appointment slots based on route efficiency and existing schedule.
 */
export function getRecommendedSlots(
  targetLat: number,
  targetLng: number,
  durationMinutes: number,
  existingAppointments: Appointment[],
  settings: BusinessSettings,
  daysToLookAhead: number = 7
): RecommendedSlot[] {
  const recommendations: RecommendedSlot[] = [];
  const workingHours = settings.workingHours || DEFAULT_WORKING_HOURS;
  
  const [startH, startM] = workingHours.start.split(":").map(Number);
  const [endH, endM] = workingHours.end.split(":").map(Number);

  const now = new Date();

  for (let i = 0; i < daysToLookAhead; i++) {
    const currentDay = addDays(startOfDay(now), i);
    
    // Skip if day is not enabled
    if (!workingHours.daysEnabled.includes(currentDay.getDay())) continue;

    const dayStart = setMinutes(setHours(currentDay, startH), startM);
    const dayEnd = setMinutes(setHours(currentDay, endH), endM);

    // Get appointments for this day
    const dayAppointments = existingAppointments.filter(app => {
      if (!app.scheduledAt) return false;
      try {
        const appDate = typeof app.scheduledAt.toDate === 'function' ? app.scheduledAt.toDate() : new Date(app.scheduledAt as any);
        return appDate >= startOfDay(currentDay) && appDate <= endOfDay(currentDay) && 
               app.status !== 'canceled' && app.status !== 'declined';
      } catch (e) {
        console.error("Error parsing appointment date:", app.id, e);
        return false;
      }
    }).sort((a, b) => {
      const aTime = typeof a.scheduledAt.toMillis === 'function' ? a.scheduledAt.toMillis() : new Date(a.scheduledAt as any).getTime();
      const bTime = typeof b.scheduledAt.toMillis === 'function' ? b.scheduledAt.toMillis() : new Date(b.scheduledAt as any).getTime();
      return aTime - bTime;
    });

    // Check slots every 30 minutes
    let checkTime = dayStart;
    if (i === 0 && isAfter(now, dayStart)) {
      // If today, start from now + 60 mins buffer for travel/prep
      checkTime = addMinutes(now, 60);
      // Round to next 15 min interval
      const minutes = checkTime.getMinutes();
      checkTime.setMinutes(minutes + (15 - (minutes % 15)));
      checkTime.setSeconds(0);
      checkTime.setMilliseconds(0);
    }

    while (isBefore(addMinutes(checkTime, durationMinutes), dayEnd)) {
      const slotStart = new Date(checkTime);
      const slotEnd = addMinutes(slotStart, durationMinutes);

      // Check for overlap with existing appointments
      const overlap = dayAppointments.find(app => {
        const appStart = app.scheduledAt.toDate();
        const duration = app.estimatedDuration || (app as any).totalDurationMinutes || 60;
        const buffer = app.overrideBufferTimeMinutes || (app as any).totalBufferMinutes || 15;
        const appEnd = addMinutes(appStart, duration + buffer);
        return (slotStart < appEnd && slotEnd > appStart);
      });

      if (!overlap) {
        // Calculate score
        const scoreResult = scoreSlot(
          slotStart,
          slotEnd,
          targetLat,
          targetLng,
          dayAppointments,
          settings
        );

        if (scoreResult.recommendationLevel !== "avoid") {
          recommendations.push({
            start: slotStart,
            end: slotEnd,
            ...scoreResult
          });
        }
      }

      checkTime = addMinutes(checkTime, 30);
    }
  }

  // Sort by score descending and return top 5
  return recommendations.sort((a, b) => b.score - a.score).slice(0, 5);
}

function scoreSlot(
  start: Date,
  end: Date,
  lat: number,
  lng: number,
  dayAppointments: Appointment[],
  settings: BusinessSettings
) {
  let score = 50; // Base score
  let explanation = "Standard available slot.";
  let level: "best" | "good" | "avoid" = "good";
  
  // Tactical Service Area Evaluation
  if (settings.travelPricing.enabled && settings.travelPricing.mode === "map_zones") {
    const feeData = calculateTravelFee(0, settings.travelPricing, { lat, lng });
    if (feeData.zoneName === "Outside Service Area") {
      score -= 50;
      explanation = "Location flagged as outside tactical service perimeters.";
      level = "avoid";
    }
  }

  // Find prior and next appointments
  const prior = [...dayAppointments].reverse().find(app => app.scheduledAt.toDate() < start);
  const next = dayAppointments.find(app => app.scheduledAt.toDate() > end);

  let travelFrom = 0;
  let travelTo = 0;
  let distFrom = 0;
  let distTo = 0;

  if (prior) {
    const duration = prior.estimatedDuration || (prior as any).totalDurationMinutes || 60;
    const buffer = prior.overrideBufferTimeMinutes || (prior as any).totalBufferMinutes || 15;
    const priorEnd = addMinutes(prior.scheduledAt.toDate(), duration + buffer);
    const gap = differenceInMinutes(start, priorEnd);
    
    distFrom = calculateDistance(prior.latitude || settings.baseLatitude, prior.longitude || settings.baseLongitude, lat, lng);
    travelFrom = estimateTravelTime(distFrom);

    if (gap < travelFrom) {
      score -= 60; // Not enough time to travel
      explanation = `Conflict: Only ${gap}m gap but travel takes ${travelFrom}m.`;
      level = "avoid";
    } else if (gap < travelFrom + 20) {
      score += 40; // Tight but efficient
      explanation = `Excellent! Only ${gap}m gap after previous job (${travelFrom}m travel).`;
      level = "best";
    } else if (distFrom < 5) {
      score += 30;
      explanation = "Great! Very close to previous job location.";
      level = "best";
    } else if (distFrom > 25) {
      score -= 20;
      explanation = "Long drive from previous job location.";
      level = "good";
    }
  } else {
    // Distance from base
    distFrom = calculateDistance(settings.baseLatitude, settings.baseLongitude, lat, lng);
    travelFrom = estimateTravelTime(distFrom);
    
    if (distFrom < 5) {
      score += 10;
      explanation = "Conveniently close to home base.";
    }
  }

  if (next) {
    const nextStart = next.scheduledAt.toDate();
    const gap = differenceInMinutes(nextStart, end);
    
    distTo = calculateDistance(lat, lng, next.latitude || settings.baseLatitude, next.longitude || settings.baseLongitude);
    travelTo = estimateTravelTime(distTo);

    if (gap < travelTo) {
      score -= 60;
      explanation = `Conflict: Only ${gap}m gap before next job but travel takes ${travelTo}m.`;
      level = "avoid";
    } else if (gap < travelTo + 20) {
      score += 40;
      explanation = `Excellent! Fits perfectly before next job (${travelTo}m travel).`;
      level = "best";
    }
  }

  // Final level determination
  if (score >= 80) level = "best";
  else if (score < 40) level = "avoid";
  else level = "good";

  return { score, explanation, recommendationLevel: level, travelFrom, travelTo, distFrom, distTo };
}
