import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import {
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { db } from "../firebase";
import type { Appointment } from "../types";
import { toFieldJob, type FieldJob } from "../services/fieldJob";

/**
 * Live appointments hook scoped to the visible 6-week month grid.
 *
 * The query covers the FULL visible grid (start-of-week of the 1st of
 * the visible month through end-of-week of the last of the visible
 * month) so leading/trailing cells from adjacent months also show
 * their indicators.
 *
 * Same `appointments` Firestore collection used by Dashboard, Calendar,
 * JobDetail, ActiveJob, FieldHome, and FieldClients — no duplicate
 * store. Returns slim `FieldJob` records pre-computed with deep links.
 *
 * Subscribes via `onSnapshot` so calendar dots update live when a job
 * is rescheduled or completed elsewhere.
 */
export interface UseMonthAppointmentsResult {
  jobs: FieldJob[];
  /** Keyed by local-day `YYYY-MM-DD` for O(1) cell lookups. */
  byDayKey: Map<string, FieldJob[]>;
  gridStart: Date;
  gridEnd: Date;
  loading: boolean;
  error: string | null;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function useMonthAppointments(visibleMonth: Date): UseMonthAppointmentsResult {
  const gridStart = useMemo(() => {
    // weekStartsOn: 0 = Sunday (matches the weekday header below).
    return startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 0 });
  }, [visibleMonth]);

  const gridEnd = useMemo(() => {
    return endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 0 });
  }, [visibleMonth]);

  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const startTs = Timestamp.fromDate(gridStart);
    const endTs = Timestamp.fromDate(gridEnd);

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
        console.warn("[useMonthAppointments] snapshot error", err);
        setError(err?.message || "Failed to load month");
        setLoading(false);
      },
    );

    return () => unsub();
  }, [gridStart, gridEnd]);

  const byDayKey = useMemo(() => {
    const m = new Map<string, FieldJob[]>();
    for (const j of jobs) {
      if (!j.scheduledAt) continue;
      const k = dayKey(j.scheduledAt);
      const arr = m.get(k);
      if (arr) arr.push(j);
      else m.set(k, [j]);
    }
    return m;
  }, [jobs]);

  return { jobs, byDayKey, gridStart, gridEnd, loading, error };
}
