import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Appointment } from "../types";
import { toFieldJob, type FieldJob } from "../services/fieldJob";

/**
 * Live "today's scheduled jobs" hook for phone Field Mode.
 *
 * Subscribes to the same `appointments` Firestore collection that
 * Dashboard.tsx and Calendar.tsx use — this is NOT a duplicate store.
 * The query mirrors Dashboard's "upcoming today" pattern but uses
 * `onSnapshot` so the phone UI updates live when a job moves status,
 * is rescheduled, or a new appointment is created mid-shift.
 *
 * Returned jobs are mapped through `toFieldJob` so the UI gets a slim
 * presentation view-model with deep links pre-computed.
 *
 * Time window: from start-of-today through end-of-today (local time).
 * Sorted by scheduledAt ascending.
 *
 * Failure mode: silently returns `[]` and surfaces the error string so
 * the caller can show a soft "couldn't load today's jobs" state.
 */
export interface UseTodayAppointmentsResult {
  jobs: FieldJob[];
  loading: boolean;
  error: string | null;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export function useTodayAppointments(): UseTodayAppointmentsResult {
  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const startTs = Timestamp.fromDate(startOfToday());
    const endTs = Timestamp.fromDate(endOfToday());

    const q = query(
      collection(db, "appointments"),
      where("scheduledAt", ">=", startTs),
      where("scheduledAt", "<=", endTs),
      orderBy("scheduledAt", "asc"),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: FieldJob[] = [];
        snap.forEach((docSnap) => {
          const data = { id: docSnap.id, ...(docSnap.data() as object) } as Appointment;
          next.push(toFieldJob(data));
        });
        setJobs(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("[useTodayAppointments] snapshot error", err);
        setError(err?.message || "Failed to load today's jobs");
        setLoading(false);
      },
    );

    return () => unsub();
  }, []);

  return { jobs, loading, error };
}
