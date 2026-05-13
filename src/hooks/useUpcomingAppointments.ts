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
 * Live "upcoming appointments" hook for phone Field Mode Schedule tab.
 *
 * Subscribes to the SAME `appointments` Firestore collection used by
 * Dashboard, Calendar, JobDetail, and `useTodayAppointments`. This is
 * a configurable-window variant — by default it returns appointments
 * from start-of-today through the end of the day `days - 1` later
 * (e.g. days=7 covers a rolling week).
 *
 * Returned jobs are mapped through `toFieldJob` (the same adapter the
 * other phone screens use) so the UI gets pre-computed deep links.
 */
export interface UseUpcomingAppointmentsResult {
  jobs: FieldJob[];
  loading: boolean;
  error: string | null;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(offsetDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function useUpcomingAppointments(days = 7): UseUpcomingAppointmentsResult {
  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const startTs = Timestamp.fromDate(startOfToday());
    const endTs = Timestamp.fromDate(endOfDay(Math.max(0, days - 1)));

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
        console.warn("[useUpcomingAppointments] snapshot error", err);
        setError(err?.message || "Failed to load schedule");
        setLoading(false);
      },
    );

    return () => unsub();
  }, [days]);

  return { jobs, loading, error };
}

/**
 * Group jobs by local-day bucket. The key is `YYYY-MM-DD`. Sort is
 * stable: jobs are already sorted ascending by scheduledAt from the
 * Firestore query, so each day's list is naturally chronological.
 */
export function groupJobsByDay(jobs: FieldJob[]): Array<{ key: string; date: Date; jobs: FieldJob[] }> {
  const map = new Map<string, { key: string; date: Date; jobs: FieldJob[] }>();
  for (const job of jobs) {
    if (!job.scheduledAt) continue;
    const d = job.scheduledAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let bucket = map.get(key);
    if (!bucket) {
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      bucket = { key, date: dayStart, jobs: [] };
      map.set(key, bucket);
    }
    bucket.jobs.push(job);
  }
  return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Friendly day-header label: "Today", "Tomorrow", or "Wed, May 14".
 */
export function dayHeaderLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === tomorrow.getTime()) return "Tomorrow";
  try {
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return date.toDateString();
  }
}
