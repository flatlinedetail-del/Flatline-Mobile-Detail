import { addMinutes, startOfDay, endOfDay, addDays, isBefore, isAfter, differenceInMinutes, setHours, setMinutes, format } from "date-fns";
import { Appointment, BusinessSettings } from "../types";
import { calculateDistance, calculateTravelFee, estimateTravelTime } from "./travelService";

export const DEFAULT_WORKING_HOURS = {
  start: "08:00",
  end: "18:00",
  daysEnabled: [1, 2, 3, 4, 5, 6] // Mon-Sat
};
