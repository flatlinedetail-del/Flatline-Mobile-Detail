import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon, ChevronRight, AlertCircle, MapPin } from "lucide-react";
import {
  useUpcomingAppointments,
  groupJobsByDay,
  dayHeaderLabel,
} from "../../hooks/useUpcomingAppointments";
import { formatJobTime, statusLabel, type FieldJob, type FieldJobStatus } from "../../services/fieldJob";

/**
 * Phone-only Schedule view (rendered at `/calendar` when the device
 * is a phone). Replaces the desktop Calendar grid for phones because
 * the grid overflows badly on small screens.
 *
 * Data: live `onSnapshot` on the SAME `appointments` collection that
 * Dashboard/Calendar/JobDetail/ActiveJob read — no duplicate store.
 * Window: rolling 7 days starting today.
 *
 * Each card is a tap target → /field/job/:id (the phone Active Job
 * screen). Tablet/desktop continue to render the full Calendar page
 * via the CalendarSwitch in App.tsx.
 */

function statusToneClass(status: FieldJobStatus): string {
  switch (status) {
    case "in_progress":
    case "en_route":
      return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    case "completed":
    case "paid":
      return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "canceled":
    case "declined":
      return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
    case "confirmed":
    case "approved":
      return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    default:
      return "bg-white/5 text-white/70 ring-white/10";
  }
}

function JobCard({ job }: { job: FieldJob }) {
  return (
    <Link
      to={`/field/job/${job.id}`}
      className={cn(
        "flex items-stretch gap-2.5 w-full rounded-xl border border-white/5 bg-sidebar/60",
        "hover:bg-sidebar/80 active:bg-sidebar transition-colors px-2.5 py-2 min-h-[60px]",
      )}
    >
      <div className="shrink-0 w-11 flex flex-col items-center justify-center">
        <p className="text-[8px] font-black uppercase tracking-widest text-white/35 leading-none">Time</p>
        <p className="text-[12px] font-black text-white leading-tight mt-0.5">{formatJobTime(job.scheduledAt)}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-white truncate leading-tight">{job.clientName}</p>
        <p className="text-[10px] text-white/45 font-medium truncate leading-tight mt-0.5">
          {job.vehicleInfo || "Vehicle TBD"}
          {job.serviceNames.length > 0 ? ` · ${job.serviceNames.join(", ")}` : ""}
        </p>
        {job.address && (
          <p className="text-[10px] text-white/35 font-medium truncate leading-tight mt-0.5 flex items-center gap-1">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{job.address}</span>
          </p>
        )}
        <span
          className={cn(
            "inline-block mt-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none",
            statusToneClass(job.status),
          )}
        >
          {statusLabel(job.status)}
        </span>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0 self-center" />
    </Link>
  );
}

export default function FieldSchedule() {
  const { jobs, loading, error } = useUpcomingAppointments(7);
  const groups = groupJobsByDay(jobs);

  return (
    <div className="space-y-3">
      <div className="px-0.5 flex items-baseline gap-2">
        <h1 className="text-base font-black text-white leading-none">Schedule</h1>
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Next 7 days</span>
      </div>

      {loading && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-3 flex items-center justify-center min-h-[56px]">
          <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
          <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/40">Loading…</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load schedule</p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-5 text-center">
          <CalendarIcon className="w-5 h-5 text-white/30 mx-auto" />
          <p className="text-[11px] font-bold text-white/70 mt-1.5">No appointments in the next 7 days</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.key} aria-label={dayHeaderLabel(g.date)} className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-[9px] font-black uppercase tracking-widest text-white/40">
              {dayHeaderLabel(g.date)}
            </h2>
            <span className="text-[9px] font-black uppercase tracking-widest text-white/30">
              {g.jobs.length} {g.jobs.length === 1 ? "job" : "jobs"}
            </span>
          </div>
          <div className="space-y-1.5">
            {g.jobs.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
