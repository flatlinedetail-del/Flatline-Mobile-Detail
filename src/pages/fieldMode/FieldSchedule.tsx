import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfToday,
  startOfWeek,
  subDays,
} from "date-fns";
import { cn, formatCurrency } from "@/lib/utils";
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  MapPin,
  Navigation,
  X,
} from "lucide-react";
import { dayKey, useMonthAppointments } from "../../hooks/useMonthAppointments";
import {
  formatJobTime,
  statusLabel,
  type FieldJob,
  type FieldJobStatus,
} from "../../services/fieldJob";
import { getOrCreateJobNumber } from "../../services/jobNumberService";

/**
 * FieldSchedule — Premium Mobile Dispatch Command Center
 *
 * Interaction model (rebuilt per Track A spec):
 *   COMMAND DOCK: auto-hides on scroll-down, reappears on scroll-up.
 *     Uses window scroll + rAF throttle + CSS translateY transition.
 *   CALENDAR: week strip default. Drag DOWN on the handle bar to
 *     expand to full month; drag UP to collapse. CSS max-height
 *     transition for smooth in/out.
 *   HEADER: compact stat pills replace the old heavy KPI card row.
 *   TIMELINE: tighter vertical rhythm — reduced card padding, shorter
 *     connector rails, lower glow intensity.
 *   ROUTE INTELLIGENCE: bottom sheet with stop order, summary stats,
 *     and Apple Maps / Google Maps / Waze launch buttons.
 *
 * Data: live onSnapshot via useMonthAppointments — same collection.
 * No mock data, no extra reads, no new Firestore rules needed.
 */

const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WEEKDAY_MINI  = ["S",   "M",   "T",   "W",   "T",   "F",   "S"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDayDotColor(
  jobs: FieldJob[],
): "emerald" | "amber" | "rose" | "sky" | "blue" | null {
  if (jobs.length === 0) return null;
  if (jobs.some(j => j.status === "in_progress" || j.status === "en_route")) return "amber";
  const cancelled = jobs.filter(
    j => j.status === "canceled" || j.status === "no_show" || j.status === "missed",
  ).length;
  if (cancelled === jobs.length) return "rose";
  if (jobs.every(j => j.status === "completed" || j.status === "paid")) return "emerald";
  if (jobs.some(j => j.status === "confirmed" || j.status === "approved")) return "sky";
  return "blue";
}

const DOT_CLASSES: Record<NonNullable<ReturnType<typeof getDayDotColor>>, string> = {
  emerald: "bg-emerald-400",
  amber:   "bg-amber-400",
  rose:    "bg-rose-400",
  sky:     "bg-sky-400",
  blue:    "bg-[#0A4DFF]",
};

function statusToneClass(status: FieldJobStatus): string {
  switch (status) {
    case "in_progress":
    case "en_route":       return "bg-amber-500/15  text-amber-300  ring-amber-500/30";
    case "completed":
    case "paid":           return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "canceled":
    case "declined":
    case "no_show":
    case "missed":         return "bg-rose-500/15   text-rose-300   ring-rose-500/30";
    case "confirmed":
    case "approved":       return "bg-sky-500/15    text-sky-300    ring-sky-500/30";
    case "scheduled":      return "bg-[#0A4DFF]/15  text-[#4D8AFF]  ring-[#0A4DFF]/30";
    default:               return "bg-white/5        text-white/70   ring-white/10";
  }
}

interface JobGlow { border: string; bar: string; shadow: string }

function getJobGlow(status: FieldJobStatus): JobGlow {
  switch (status) {
    case "completed":
    case "paid":
      return { border: "border-emerald-500/20", bar: "bg-emerald-500",  shadow: "shadow-[0_0_8px_rgba(16,185,129,0.07)]" };
    case "in_progress":
    case "en_route":
      return { border: "border-amber-500/30",   bar: "bg-amber-500",    shadow: "shadow-[0_0_10px_rgba(245,158,11,0.10)]" };
    case "confirmed":
    case "approved":
      return { border: "border-sky-500/20",     bar: "bg-sky-500",      shadow: "shadow-[0_0_6px_rgba(14,165,233,0.06)]" };
    case "canceled":
    case "no_show":
    case "missed":
    case "declined":
      return { border: "border-rose-500/15",    bar: "bg-rose-500/40",  shadow: "" };
    default:
      return { border: "border-[#0A4DFF]/15",   bar: "bg-[#0A4DFF]",   shadow: "shadow-[0_0_6px_rgba(10,77,255,0.06)]" };
  }
}

// Build Google Maps multi-stop URL (real API format)
function buildGoogleMapsUrl(addresses: string[]): string {
  if (addresses.length === 0) return "";
  if (addresses.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`;
  }
  const origin      = encodeURIComponent(addresses[0]);
  const destination = encodeURIComponent(addresses[addresses.length - 1]);
  const waypoints   = addresses.slice(1, -1).map(encodeURIComponent).join("%7C");
  const base = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
  return waypoints ? `${base}&waypoints=${waypoints}` : base;
}

// ─── Week strip day cell ───────────────────────────────────────────────────────

function WeekDayCell({
  date, isToday, isSelected, jobs, onTap,
}: {
  date: Date; isToday: boolean; isSelected: boolean; jobs: FieldJob[]; onTap: () => void;
}) {
  const dotColor = getDayDotColor(jobs);
  const count    = jobs.length;
  const dayIdx   = date.getDay();

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={format(date, "EEEE, MMMM d")}
      aria-pressed={isSelected}
      className={cn(
        "flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border transition-all duration-150 active:scale-[0.92]",
        isSelected
          ? "bg-[#0A4DFF]/15 border-[#0A4DFF]/45 shadow-[0_0_14px_rgba(10,77,255,0.18)]"
          : isToday
            ? "bg-white/[0.04] border-white/10"
            : "bg-transparent border-transparent hover:bg-white/[0.03]",
      )}
    >
      <span className={cn(
        "text-[8px] font-black uppercase tracking-widest leading-none",
        isSelected ? "text-[#6B8FFF]" : isToday ? "text-white/60" : "text-white/30",
      )}>
        {WEEKDAY_SHORT[dayIdx]}
      </span>
      <span className={cn(
        "text-[15px] font-black leading-none tabular-nums",
        isSelected ? "text-white" : isToday ? "text-[#0A4DFF]" : "text-white/70",
      )}>
        {format(date, "d")}
      </span>
      <div className="h-[8px] flex items-center justify-center">
        {dotColor && count > 0 && (
          count <= 3 ? (
            <span className="flex items-center gap-[2px]">
              {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                <span key={i} className={cn("w-[4px] h-[4px] rounded-full", DOT_CLASSES[dotColor])} />
              ))}
            </span>
          ) : (
            <span className={cn("text-[7px] font-black leading-none px-1 py-[1px] rounded-sm", DOT_CLASSES[dotColor], "text-white/90")}>
              {count}
            </span>
          )
        )}
      </div>
    </button>
  );
}

// ─── Full-month grid day cell ──────────────────────────────────────────────────

function MonthGridCell({
  date, inMonth, isToday, isSelected, jobs, onTap,
}: {
  date: Date; inMonth: boolean; isToday: boolean; isSelected: boolean;
  jobs: FieldJob[]; onTap: () => void;
}) {
  const dotColor = getDayDotColor(jobs);
  const count    = jobs.length;

  return (
    <button
      type="button"
      onClick={onTap}
      className={cn(
        "aspect-square flex flex-col items-center justify-between py-1 rounded-lg border transition-colors active:bg-[#0A4DFF]/25",
        isSelected
          ? "bg-[#0A4DFF]/20 border-[#0A4DFF]/50 text-white"
          : isToday
            ? "bg-white/[0.04] border-white/10 text-white"
            : inMonth
              ? "bg-sidebar/30 hover:bg-sidebar/50 border-transparent text-white/75"
              : "bg-transparent border-transparent text-white/25",
      )}
    >
      <span className={cn("text-[10px] font-black leading-none", isToday && !isSelected && "text-[#0A4DFF]")}>
        {format(date, "d")}
      </span>
      <div className="h-[6px] flex items-center justify-center">
        {dotColor && count > 0 && (
          count <= 3 ? (
            <span className="flex gap-[2px]">
              {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                <span key={i} className={cn("w-[4px] h-[4px] rounded-full", inMonth ? DOT_CLASSES[dotColor] : "bg-white/25")} />
              ))}
            </span>
          ) : (
            <span className={cn(
              "text-[7px] font-black px-0.5 py-[1px] rounded leading-none",
              inMonth ? "bg-[#0A4DFF]/30 text-white ring-1 ring-[#0A4DFF]/50" : "bg-white/10 text-white/40",
            )}>
              {count}
            </span>
          )
        )}
      </div>
    </button>
  );
}

// ─── Compact stat pill ────────────────────────────────────────────────────────
// Replaces the heavy DayKpiCard floating blocks. Single line, lighter weight.

type StatPillColor = "blue" | "emerald" | "amber" | "sky" | "violet";

function StatPill({ value, color }: { value: string; color: StatPillColor }) {
  const C: Record<StatPillColor, string> = {
    blue:    "bg-[#0A4DFF]/10 text-[#6B8FFF] ring-[#0A4DFF]/20",
    emerald: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
    amber:   "bg-amber-500/10  text-amber-400  ring-amber-500/20",
    sky:     "bg-sky-500/10    text-sky-400    ring-sky-500/20",
    violet:  "bg-violet-500/10 text-violet-400 ring-violet-500/20",
  };
  return (
    <span className={cn(
      "inline-flex items-center shrink-0 px-2 py-0.5 rounded-full ring-1",
      "text-[9px] font-black leading-none whitespace-nowrap",
      C[color],
    )}>
      {value}
    </span>
  );
}

// ─── Dispatch timeline job card ───────────────────────────────────────────────
// Tightened layout: reduced padding, shorter rail, lower glow intensity.

function DispatchJobCard({ job }: { job: FieldJob }) {
  const glow        = getJobGlow(job.status);
  const isDone      = job.status === "completed" || job.status === "paid";
  const isActive    = job.status === "in_progress" || job.status === "en_route";
  const isCancelled = job.status === "canceled" || job.status === "no_show" || job.status === "missed";
  const needsPayment = isDone && job.paymentStatus === "unpaid";
  const isRisk      = job.clientRiskLevel === "high" || job.clientRiskLevel === "medium";

  const [displayJobNum, setDisplayJobNum] = useState(job.jobNumber ?? "");
  useEffect(() => {
    if (job.jobNumber) { setDisplayJobNum(job.jobNumber); return; }
    if (!job.id) return;
    getOrCreateJobNumber(job.id, job.jobNumber)
      .then(setDisplayJobNum)
      .catch(() => {});
  }, [job.id, job.jobNumber]);

  return (
    <div className="flex items-stretch gap-0 group">
      {/* Time column — narrower, tighter */}
      <div className="shrink-0 w-12 flex flex-col items-end pr-2.5">
        <p className="text-[9px] font-black text-white/40 leading-none tabular-nums pt-3">
          {formatJobTime(job.scheduledAt)}
        </p>
        <div className="flex-1 flex justify-end pt-1.5 pb-0.5">
          <div className="w-px bg-white/[0.04]" />
        </div>
      </div>

      {/* Connector dot — smaller */}
      <div className="shrink-0 w-2.5 flex flex-col items-center">
        <div className={cn(
          "shrink-0 w-2.5 h-2.5 rounded-full mt-[11px] ring-2 ring-[#0C0F16]",
          isActive     ? "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.45)]"
          : isDone     ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.35)]"
          : isCancelled ? "bg-rose-500/40"
          : "bg-[#0A4DFF] shadow-[0_0_5px_rgba(10,77,255,0.35)]",
        )} />
        <div className="w-px bg-white/[0.04] flex-1 mt-1" />
      </div>

      {/* Card — tighter padding, softer glow */}
      <div className={cn(
        "flex-1 ml-2.5 mb-2 rounded-xl border bg-[#0C0F16]/80 overflow-hidden",
        "transition-all duration-150 active:scale-[0.985]",
        glow.border, glow.shadow,
        isCancelled && "opacity-50",
      )}>
        <div className="flex items-stretch">
          <div className={cn("w-[3px] shrink-0 rounded-l-xl", glow.bar)} />
          <div className="flex-1 px-2.5 pt-2.5 pb-2">
            {/* Header row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <p className="text-[12px] font-bold text-white leading-tight truncate">{job.clientName}</p>
                {isRisk && (
                  <span className="shrink-0 text-[7px] font-black uppercase tracking-wider bg-rose-500/12 text-rose-400 ring-1 ring-rose-500/22 px-1.5 py-0.5 rounded-full leading-none">
                    Risk
                  </span>
                )}
              </div>
              <span className={cn("shrink-0 text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ring-1 leading-none", statusToneClass(job.status))}>
                {statusLabel(job.status)}
              </span>
            </div>

            {/* Job number — backfilled on mount for existing jobs via getOrCreateJobNumber */}
            {displayJobNum && (
              <p className="text-[8px] font-black text-white tracking-widest leading-none -mt-0.5">
                {displayJobNum}
              </p>
            )}

            {/* Vehicle / services */}
            {(job.vehicleInfo || job.serviceNames.length > 0) && (
              <p className="text-[9px] text-white/40 font-medium mt-0.5 leading-tight truncate">
                {[job.vehicleInfo, job.serviceNames.join(", ")].filter(Boolean).join(" · ")}
              </p>
            )}

            {/* Address */}
            {job.address && (
              <p className="text-[9px] text-white/28 font-medium mt-0.5 flex items-center gap-1 truncate leading-tight">
                <MapPin className="w-2.5 h-2.5 shrink-0 text-white/25" />
                <span className="truncate">{job.address}</span>
              </p>
            )}

            {/* Amount + badges */}
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={cn("text-[12px] font-black tabular-nums", isDone ? "text-emerald-400" : "text-white/50")}>
                {formatCurrency(job.totalAmount)}
              </span>
              {needsPayment && (
                <span className="text-[7px] font-black uppercase tracking-wider bg-amber-500/12 text-amber-400 ring-1 ring-amber-500/22 px-1.5 py-0.5 rounded-full leading-none">
                  Collect
                </span>
              )}
              {job.paymentStatus === "paid" && (
                <span className="text-[7px] font-black uppercase tracking-wider bg-emerald-500/8 text-emerald-400/65 ring-1 ring-emerald-500/12 px-1.5 py-0.5 rounded-full leading-none">
                  Paid
                </span>
              )}
              {job.depositRequired && !job.depositPaid && (
                <span className="text-[7px] font-black uppercase tracking-wider bg-violet-500/12 text-violet-400 ring-1 ring-violet-500/22 px-1.5 py-0.5 rounded-full leading-none">
                  Deposit
                </span>
              )}
            </div>

            {/* Primary action */}
            <div className="mt-2 pt-1.5 border-t border-white/[0.04]">
              <Link to={`/field/job/${job.id}`}
                    className="w-full h-7 rounded-lg bg-[#0A4DFF]/12 ring-1 ring-[#0A4DFF]/25 flex items-center justify-center gap-1 text-[#6B8FFF] hover:bg-[#0A4DFF]/18 transition-colors">
                <ChevronRight className="w-2.5 h-2.5" />
                <span className="text-[8px] font-black uppercase tracking-wider">Open</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Empty day state ──────────────────────────────────────────────────────────

function EmptyDayState({ onBook }: { onBook: () => void }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-8 text-center">
      <CalendarIcon className="w-7 h-7 text-white/12 mx-auto" />
      <p className="text-[12px] font-bold text-white/35 mt-2.5">No jobs scheduled</p>
      <p className="text-[10px] text-white/22 mt-1 leading-relaxed">Book a new job or check another day</p>
      <button
        type="button"
        onClick={onBook}
        className="mt-4 flex items-center gap-1.5 mx-auto px-4 py-2 rounded-xl bg-[#0A4DFF]/15 ring-1 ring-[#0A4DFF]/30 text-[#6B8FFF] text-[10px] font-black uppercase tracking-wider transition-all duration-150 active:scale-95"
      >
        <CalendarPlus className="w-3.5 h-3.5" />
        Book Job
      </button>
    </div>
  );
}

// ─── Route Intelligence Panel ─────────────────────────────────────────────────
// Bottom sheet showing ordered stop list, summary stats, and multi-app navigation.
//
// Route order:
//   1. Active (in_progress / en_route) jobs with addresses first
//   2. Non-cancelled jobs sorted by scheduledAt
//   3. Cancelled jobs excluded
//   4. Jobs without addresses shown separately as "excluded"
//
// Drive time and mileage are NOT computed (no distance API connected).
// Clearly labelled as unavailable rather than estimated.

function RouteIntelligencePanel({
  jobs,
  date,
  onClose,
}: {
  jobs: FieldJob[];
  date: Date;
  onClose: () => void;
}) {
  const isCancelledStatus = (s: FieldJobStatus) =>
    s === "canceled" || s === "no_show" || s === "missed" || s === "declined";

  const activeWithAddr = jobs.filter(
    j => (j.status === "in_progress" || j.status === "en_route") && j.address,
  );
  const scheduledWithAddr = jobs
    .filter(j =>
      !isCancelledStatus(j.status) &&
      j.status !== "in_progress" && j.status !== "en_route" &&
      j.address,
    )
    .sort((a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0));

  const routableJobs     = [...activeWithAddr, ...scheduledWithAddr];
  const noAddressJobs    = jobs.filter(j => !isCancelledStatus(j.status) && !j.address);
  const scheduledRevenue = routableJobs.reduce((s, j) => s + j.totalAmount, 0);
  const addresses        = routableJobs.map(j => j.address as string);

  // Navigation deep-links (real URLs only)
  const appleMapsUrl  = addresses[0]
    ? `maps://maps.apple.com/?q=${encodeURIComponent(addresses[0])}`
    : null;
  const googleMapsUrl = buildGoogleMapsUrl(addresses);
  const wazeUrl       = addresses[0]
    ? `waze://ul?q=${encodeURIComponent(addresses[0])}`
    : null;

  const isMultiStop = addresses.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal
      aria-label="Route Intelligence"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div
        className={cn(
          "relative z-10 rounded-t-3xl max-h-[88vh] flex flex-col",
          "bg-[#0C0F16] border-t border-white/[0.08]",
          "shadow-[0_-4px_32px_rgba(0,0,0,0.50)]",
          "animate-in slide-in-from-bottom-2 duration-200",
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-8 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-white/[0.05]">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#0A4DFF]/15 ring-1 ring-[#0A4DFF]/25 flex items-center justify-center shrink-0">
                <Navigation className="w-3 h-3 text-[#6B8FFF]" />
              </div>
              <h2 className="text-[14px] font-black text-white leading-none">Route Intelligence</h2>
            </div>
            <p className="text-[9px] text-white/35 font-bold mt-1.5 ml-8 leading-none">
              {format(date, "EEEE, MMMM d")}
              {routableJobs.length > 0 && ` · ${routableJobs.length} stop${routableJobs.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/5 ring-1 ring-white/8 flex items-center justify-center text-white/45 hover:text-white/75 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5 space-y-3.5">

          {/* No jobs at all */}
          {jobs.length === 0 && (
            <div className="py-8 text-center">
              <CalendarIcon className="w-7 h-7 text-white/12 mx-auto" />
              <p className="text-[12px] font-bold text-white/35 mt-2.5">No jobs to route for this day</p>
            </div>
          )}

          {/* Jobs exist but none have addresses */}
          {jobs.length > 0 && routableJobs.length === 0 && (
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-5 text-center">
              <MapPin className="w-5 h-5 text-white/12 mx-auto" />
              <p className="text-[12px] font-bold text-white/35 mt-2">No routable addresses</p>
              <p className="text-[10px] text-white/22 mt-1 leading-relaxed">
                Add addresses to jobs to enable routing.
              </p>
            </div>
          )}

          {/* Route summary card */}
          {routableJobs.length > 0 && (
            <div className="rounded-xl border border-[#0A4DFF]/18 bg-[#0A4DFF]/[0.05] px-3.5 py-3 space-y-2">
              <p className="text-[8px] font-black uppercase tracking-widest text-[#6B8FFF]">
                Route Summary
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <SummaryRow label="Total Stops"     value={`${routableJobs.length} stop${routableJobs.length === 1 ? "" : "s"}`} />
                <SummaryRow label="Scheduled Rev"   value={formatCurrency(scheduledRevenue)} highlight="emerald" />
                <SummaryRow label="Routable Stops"  value={`${addresses.length}`}            highlight="emerald" />
                {noAddressJobs.length > 0 && (
                  <SummaryRow label="Missing Address" value={`${noAddressJobs.length}`}      highlight="amber" />
                )}
                <SummaryRow label="Drive Time"      value="Unavailable" muted />
                <SummaryRow label="Mileage"         value="Unavailable" muted />
              </div>
              <p className="text-[8px] text-white/22 leading-tight mt-0.5">
                Route follows schedule order. Distance service not connected.
              </p>
            </div>
          )}

          {/* Stop order list */}
          {routableJobs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/30">
                Stop Order
              </p>
              {routableJobs.map((job, idx) => (
                <RouteStopCard key={job.id} job={job} stopNumber={idx + 1} onClose={onClose} />
              ))}
            </div>
          )}

          {/* No-address exclusions */}
          {noAddressJobs.length > 0 && (
            <div className="space-y-1">
              <p className="text-[8px] font-black uppercase tracking-widest text-amber-400/55">
                Excluded — No Address
              </p>
              {noAddressJobs.map(job => (
                <div
                  key={job.id}
                  className="flex items-center gap-2 rounded-xl border border-amber-500/12 bg-amber-500/[0.03] px-3 py-2"
                >
                  <MapPin className="w-3 h-3 text-amber-400/50 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-white/55 truncate leading-tight">{job.clientName}</p>
                    <p className="text-[9px] text-amber-400/45 font-bold leading-tight">No address on file</p>
                  </div>
                  <Link
                    to={`/field/job/${job.id}`}
                    onClick={onClose}
                    className="shrink-0 text-[8px] font-black uppercase tracking-wider text-white/28 hover:text-white/55 transition-colors"
                  >
                    Open
                  </Link>
                </div>
              ))}
            </div>
          )}

          {/* Navigation launch — Apple Maps, Google Maps, Waze */}
          {routableJobs.length > 0 && (
            <div className="space-y-2">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/30">
                {isMultiStop ? "Launch Navigation" : "Open in Maps"}
              </p>

              {appleMapsUrl && (
                <a
                  href={appleMapsUrl}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.06] transition-colors active:scale-[0.98]"
                >
                  <div className="shrink-0 w-8 h-8 rounded-xl bg-sky-500/12 ring-1 ring-sky-500/22 flex items-center justify-center">
                    <Navigation className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-white leading-tight">Apple Maps</p>
                    <p className="text-[9px] text-white/32 leading-tight">
                      {isMultiStop ? "Opens first stop · navigate in app" : "Open destination"}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-white/22 shrink-0" />
                </a>
              )}

              {googleMapsUrl && (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.06] transition-colors active:scale-[0.98]"
                >
                  <div className="shrink-0 w-8 h-8 rounded-xl bg-emerald-500/12 ring-1 ring-emerald-500/22 flex items-center justify-center">
                    <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-white leading-tight">Google Maps</p>
                    <p className="text-[9px] text-white/32 leading-tight">
                      {isMultiStop ? `Routes all ${addresses.length} stops` : "Open destination"}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-white/22 shrink-0" />
                </a>
              )}

              {wazeUrl && (
                <a
                  href={wazeUrl}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.06] transition-colors active:scale-[0.98]"
                >
                  <div className="shrink-0 w-8 h-8 rounded-xl bg-violet-500/12 ring-1 ring-violet-500/22 flex items-center justify-center">
                    <Navigation className="w-3.5 h-3.5 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-white leading-tight">Waze</p>
                    <p className="text-[9px] text-white/32 leading-tight">
                      {isMultiStop ? "Opens first stop · navigate in app" : "Open destination"}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-white/22 shrink-0" />
                </a>
              )}
            </div>
          )}

          {/* Safe area spacer */}
          <div style={{ height: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }} />
        </div>
      </div>
    </div>
  );
}

// Summary row helper (inside route panel)
function SummaryRow({
  label, value, highlight, muted = false,
}: {
  label: string; value: string; highlight?: "emerald" | "amber"; muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[8px] font-black uppercase tracking-wider text-white/28 shrink-0">{label}</span>
      <span className={cn(
        "text-[10px] font-bold text-right",
        muted             ? "text-white/22 italic"
        : highlight === "emerald" ? "text-emerald-400"
        : highlight === "amber"   ? "text-amber-400"
        : "text-white/65",
      )}>
        {value}
      </span>
    </div>
  );
}

// Individual stop card inside route panel
function RouteStopCard({
  job, stopNumber, onClose,
}: {
  job: FieldJob; stopNumber: number; onClose: () => void;
}) {
  const isActive = job.status === "in_progress" || job.status === "en_route";
  const mapsUrl  = job.address ? `maps://maps.apple.com/?q=${encodeURIComponent(job.address)}` : null;

  return (
    <div className={cn(
      "rounded-xl border px-3 py-2.5",
      isActive ? "border-amber-500/22 bg-amber-500/[0.04]" : "border-white/[0.05] bg-white/[0.02]",
    )}>
      <div className="flex items-start gap-2">
        <div className={cn(
          "shrink-0 w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black ring-1 mt-0.5",
          isActive
            ? "bg-amber-500/18 text-amber-400 ring-amber-500/28"
            : "bg-[#0A4DFF]/12 text-[#6B8FFF] ring-[#0A4DFF]/22",
        )}>
          {stopNumber}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-bold text-white leading-tight truncate">{job.clientName}</p>
            {isActive && (
              <span className="shrink-0 text-[7px] font-black uppercase tracking-wider bg-amber-500/12 text-amber-400 ring-1 ring-amber-500/22 px-1.5 py-0.5 rounded-full leading-none">
                Active
              </span>
            )}
          </div>
          <p className="text-[9px] text-white/45 font-medium mt-0.5 leading-tight">
            {formatJobTime(job.scheduledAt)}
            {job.serviceNames.length > 0 && ` · ${job.serviceNames.join(", ")}`}
          </p>
          {job.address && (
            <p className="text-[8px] text-white/30 mt-0.5 flex items-center gap-1 leading-tight">
              <MapPin className="w-2 h-2 shrink-0" />
              <span className="break-words">{job.address}</span>
            </p>
          )}
          <span className="text-[10px] font-black text-white/55 tabular-nums mt-1 block">
            {formatCurrency(job.totalAmount)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-white/[0.04]">
        {mapsUrl && (
          <a
            href={mapsUrl}
            className="flex-1 h-6 rounded-lg bg-blue-500/8 ring-1 ring-blue-500/18 flex items-center justify-center gap-1 text-blue-400 transition-colors hover:bg-blue-500/14"
          >
            <Navigation className="w-2.5 h-2.5" />
            <span className="text-[8px] font-black uppercase tracking-wider">Navigate</span>
          </a>
        )}
        <Link
          to={`/field/job/${job.id}`}
          onClick={onClose}
          className="flex-1 h-6 rounded-lg bg-white/[0.04] ring-1 ring-white/8 flex items-center justify-center gap-1 text-white/45 transition-colors hover:bg-white/[0.07]"
        >
          <ChevronRight className="w-2.5 h-2.5" />
          <span className="text-[8px] font-black uppercase tracking-wider">Open</span>
        </Link>
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FieldSchedule() {
  const today    = useMemo(() => startOfToday(), []);
  const navigate = useNavigate();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [selected,         setSelected]         = useState<Date>(() => today);
  const [visibleMonth,     setVisibleMonth]     = useState<Date>(() => startOfMonth(today));
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [showRoutePanel,   setShowRoutePanel]   = useState(false);

  // ── Auto-hide dock state ─────────────────────────────────────────────────────
  // Tracks window scroll direction via rAF-throttled listener.
  // Dock hides when scrolling down past 80px; reappears scrolling up.
  const [dockHidden,  setDockHidden]  = useState(false);
  const lastScrollY   = useRef(0);
  const scrollTicking = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      if (!scrollTicking.current) {
        requestAnimationFrame(() => {
          const y = window.scrollY;
          const delta = y - lastScrollY.current;
          // Only react to intentional scrolls (>4px) above the fold boundary
          if (Math.abs(delta) > 4) {
            setDockHidden(delta > 0 && y > 80);
            lastScrollY.current = y;
          }
          scrollTicking.current = false;
        });
        scrollTicking.current = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ── Calendar drag gesture ────────────────────────────────────────────────────
  // Drag DOWN on the handle bar → expand to full month.
  // Drag UP on the handle bar  → collapse to week strip.
  // setPointerCapture ensures the drag tracks even if cursor leaves the element.
  const dragStartY = useRef<number | null>(null);

  const handleCalendarDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleCalendarDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return;
    const delta = e.clientY - dragStartY.current;
    dragStartY.current = null;
    if (delta > 24 && !showFullCalendar) { setShowFullCalendar(true);  return; }
    if (delta < -24 && showFullCalendar) { setShowFullCalendar(false); return; }
  };

  // ── Data ─────────────────────────────────────────────────────────────────────
  const { byDayKey, gridStart, gridEnd, loading, error } = useMonthAppointments(visibleMonth);

  // ── Week strip ───────────────────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    const sun = startOfWeek(selected, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(sun, i));
  }, [selected]);

  // ── Full month grid cells ─────────────────────────────────────────────────
  const monthCells = useMemo(() => {
    const arr: Date[] = [];
    let cursor = gridStart;
    while (cursor.getTime() <= gridEnd.getTime()) {
      arr.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return arr;
  }, [gridStart, gridEnd]);

  // ── Selected day ─────────────────────────────────────────────────────────────
  const selectedJobs = useMemo(
    () => byDayKey.get(dayKey(selected)) ?? [],
    [byDayKey, selected],
  );

  // ── Day KPI summary ───────────────────────────────────────────────────────
  const dayKpis = useMemo(() => {
    const completed = selectedJobs.filter(j => j.status === "completed" || j.status === "paid");
    const revenue   = completed.reduce((s, j) => s + j.totalAmount, 0);
    const active    = selectedJobs.filter(j => j.status === "in_progress" || j.status === "en_route").length;
    const pending   = selectedJobs.filter(
      j => j.status === "scheduled" || j.status === "requested" || j.status === "pending_approval",
    ).length;
    const confirmed = selectedJobs.filter(j => j.status === "confirmed" || j.status === "approved").length;
    return { total: selectedJobs.length, revenue, completed: completed.length, active, pending, confirmed };
  }, [selectedJobs]);

  // ── Routable jobs check ──────────────────────────────────────────────────────
  const hasRoutableJobs = useMemo(
    () => selectedJobs.some(
      j => j.address &&
        j.status !== "canceled" && j.status !== "no_show" &&
        j.status !== "missed"   && j.status !== "declined",
    ),
    [selectedJobs],
  );

  // ── Day selection helpers ─────────────────────────────────────────────────
  const handleSelectDay = (d: Date) => {
    setSelected(d);
    setVisibleMonth(prev => {
      const newMonth = startOfMonth(d);
      return isSameMonth(prev, newMonth) ? prev : newMonth;
    });
  };

  const handlePrevWeek = () => handleSelectDay(subDays(selected, 7));
  const handleNextWeek = () => handleSelectDay(addDays(selected, 7));
  const handleToday    = () => { setSelected(today); setVisibleMonth(startOfMonth(today)); };
  const bookJob        = () => navigate("/field/book-job");

  const isCurrentWeek = useMemo(() => {
    const todaySun = startOfWeek(today,    { weekStartsOn: 0 }).getTime();
    const selSun   = startOfWeek(selected, { weekStartsOn: 0 }).getTime();
    return todaySun === selSun;
  }, [today, selected]);

  const dayLabel = isSameDay(selected, today) ? "Today" : format(selected, "EEEE, MMM d");

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/*
        pb-32 ensures the last timeline card clears the auto-hide dock (~44px)
        + bottom nav (~56px) + safe area. The inline paddingBottom extends this
        on notched iPhones via env(safe-area-inset-bottom).
      */}
      <div
        className="relative space-y-2.5 pb-32"
        style={{ paddingBottom: "max(8rem, calc(6.5rem + env(safe-area-inset-bottom, 0px)))" }}
      >

        {/* ── Sticky header ── */}
        <div className="sticky top-12 z-20 -mx-2.5 px-2.5 py-2 bg-background/95 backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            {/* Prev week */}
            <button
              type="button"
              onClick={handlePrevWeek}
              aria-label="Previous week"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Center: date + inline summary */}
            <button type="button" onClick={handleToday} className="flex flex-col items-center min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30 leading-none">Schedule</p>
                {!loading && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.55)]" />
                )}
              </div>
              <h1 className="text-[13px] font-black text-white leading-tight mt-0.5 truncate">{dayLabel}</h1>
              {/* Compact inline KPI summary — replaces DayKpiCard floating blocks */}
              {dayKpis.total > 0 && (
                <p className="text-[9px] text-white/32 font-bold leading-none mt-0.5">
                  {dayKpis.total} {dayKpis.total === 1 ? "job" : "jobs"}
                  {dayKpis.revenue > 0 && ` · ${formatCurrency(dayKpis.revenue)}`}
                  {dayKpis.active > 0 ? " · In progress" : dayKpis.completed === dayKpis.total && dayKpis.total > 0 ? " · All done" : ""}
                </p>
              )}
            </button>

            {/* Right controls */}
            <div className="flex items-center gap-0.5">
              {!isCurrentWeek && (
                <button
                  type="button"
                  onClick={handleToday}
                  className="h-8 px-2 rounded-lg text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Today
                </button>
              )}
              <button
                type="button"
                onClick={handleNextWeek}
                aria-label="Next week"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Week strip ── */}
        <div className="flex items-center gap-1">
          {weekDays.map(d => (
            <WeekDayCell
              key={`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`}
              date={d}
              isToday={isSameDay(d, today)}
              isSelected={isSameDay(d, selected)}
              jobs={byDayKey.get(dayKey(d)) ?? []}
              onTap={() => handleSelectDay(d)}
            />
          ))}
        </div>

        {/*
          ── Calendar drag handle ──
          Drag DOWN → expand to full month  (Fantastical / Google Calendar gesture)
          Drag UP   → collapse to week strip
          Click     → toggles as before (fallback for non-drag users)
          setPointerCapture tracks the gesture even if pointer leaves the element.
        */}
        <div
          role="button"
          aria-label={showFullCalendar ? "Collapse month calendar" : "Expand month calendar"}
          aria-expanded={showFullCalendar}
          tabIndex={0}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 cursor-row-resize select-none touch-none"
          onPointerDown={handleCalendarDragStart}
          onPointerUp={handleCalendarDragEnd}
          onClick={() => {
            // Only toggle if not ending a drag (dragStartY already cleared)
            if (dragStartY.current === null) setShowFullCalendar(v => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setShowFullCalendar(v => !v);
          }}
        >
          {/* Visual handle pill */}
          <div className="w-7 h-1 rounded-full bg-white/15" />
          <span className="text-[9px] font-black uppercase tracking-widest text-white/28">
            {format(visibleMonth, "MMMM yyyy")}
          </span>
          {showFullCalendar
            ? <ChevronUp   className="w-3 h-3 text-white/28" />
            : <ChevronDown className="w-3 h-3 text-white/28" />
          }
        </div>

        {/*
          ── Full month grid (CSS-animated expand/collapse) ──
          Element stays in DOM; max-height + opacity transition avoids the
          conditional-render "no animation on mount" problem.
          Duration 300ms open, 200ms close (snappier collapse).
        */}
        <div
          className={cn(
            "overflow-hidden transition-[max-height,opacity]",
            showFullCalendar
              ? "max-h-[520px] opacity-100 ease-out duration-300"
              : "max-h-0 opacity-0 ease-in duration-200",
          )}
        >
          <div className="space-y-1.5 pt-0.5">
            {/* Month nav */}
            <div className="flex items-center justify-between px-0.5">
              <button
                type="button"
                onClick={() => setVisibleMonth(m => addMonths(m, -1))}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/45">
                {format(visibleMonth, "MMMM yyyy")}
              </span>
              <button
                type="button"
                onClick={() => setVisibleMonth(m => addMonths(m, 1))}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-0.5 px-0.5">
              {WEEKDAY_MINI.map((w, i) => (
                <div key={`${w}-${i}`} className="text-center text-[9px] font-black uppercase tracking-widest text-white/28 py-0.5">
                  {w}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-0.5 px-0.5">
              {monthCells.map(d => (
                <MonthGridCell
                  key={d.toISOString()}
                  date={d}
                  inMonth={isSameMonth(d, visibleMonth)}
                  isToday={isSameDay(d, today)}
                  isSelected={isSameDay(d, selected)}
                  jobs={byDayKey.get(dayKey(d)) ?? []}
                  onTap={() => { handleSelectDay(d); setShowFullCalendar(false); }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Loading / error ── */}
        {loading && (
          <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-2 flex items-center justify-center min-h-[36px]">
            <div className="w-3 h-3 border border-white/10 border-t-white/40 rounded-full animate-spin" />
            <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/30">Loading…</span>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-rose-500/18 bg-rose-500/[0.04] px-2.5 py-2 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load schedule</p>
              <p className="text-[9px] text-rose-300/55 mt-0.5 break-words leading-tight">{error}</p>
            </div>
          </div>
        )}

        {/*
          ── Compact day stat pills ──
          Replaces the old heavy DayKpiCard floating row.
          Inline, lightweight, no vertical waste.
        */}
        {!loading && !error && dayKpis.total > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatPill value={`${dayKpis.total} ${dayKpis.total === 1 ? "job" : "jobs"}`} color="blue" />
            {dayKpis.revenue   > 0 && <StatPill value={formatCurrency(dayKpis.revenue)}          color="emerald" />}
            {dayKpis.active    > 0 && <StatPill value={`${dayKpis.active} active`}               color="amber"   />}
            {dayKpis.completed > 0 && <StatPill value={`${dayKpis.completed} done`}              color="emerald" />}
            {dayKpis.confirmed > 0 && <StatPill value={`${dayKpis.confirmed} confirmed`}         color="sky"     />}
            {dayKpis.pending   > 0 && <StatPill value={`${dayKpis.pending} pending`}             color="violet"  />}
          </div>
        )}

        {/* ── Dispatch timeline ── */}
        <section aria-label="Selected day timeline">
          <div className="flex items-center justify-between px-0.5 mb-1.5">
            <h2 className="text-[9px] font-black uppercase tracking-widest text-white/30">
              {isSameDay(selected, today) ? "Today's Dispatch" : format(selected, "EEE, MMM d")}
            </h2>
            {dayKpis.total > 0 && (
              <span className="text-[9px] font-black uppercase tracking-widest text-white/22">
                {dayKpis.total} {dayKpis.total === 1 ? "job" : "jobs"}
              </span>
            )}
          </div>

          {selectedJobs.length === 0 ? (
            <EmptyDayState onBook={bookJob} />
          ) : (
            <div>
              {selectedJobs.map(j => <DispatchJobCard key={j.id} job={j} />)}
            </div>
          )}
        </section>

      </div>

      {/*
        ── Auto-hide command dock ──
        Sits just above the bottom nav (bottom-[4.5rem] ≈ 72px).
        Slides off-screen on scroll-down (translateY(calc(100%+4rem))),
        reappears on scroll-up (translateY(0)).
        Duration-300 ease-out = smooth, non-snapping native feel.
        z-30 < bottom nav z-40 → dock naturally disappears behind nav when hidden.

        Visual: thinner, more glassmorphism, lower glow = less obtrusive.
      */}
      <div
        className={cn(
          "fixed left-0 right-0 px-3 z-30 pointer-events-none",
          "bottom-[4.5rem]",
          "transition-transform duration-300 ease-out",
          dockHidden ? "translate-y-[calc(100%+4rem)]" : "translate-y-0",
        )}
      >
        <div className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-2xl",
          "bg-[#0C0F16]/72 backdrop-blur-xl border border-white/[0.07]",
          "shadow-[0_2px_16px_rgba(0,0,0,0.40),0_0_0_1px_rgba(255,255,255,0.03)]",
          "px-2.5 py-2",
        )}>
          {/* Book Job */}
          <button
            type="button"
            onClick={bookJob}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl",
              "bg-[#0A4DFF] text-white text-[9px] font-black uppercase tracking-wider",
              "shadow-[0_0_12px_rgba(10,77,255,0.30)] transition-all duration-150 active:scale-95",
            )}
          >
            <CalendarPlus className="w-3 h-3" />
            Book Job
          </button>

          {/* Route Intelligence — only when addressable jobs exist */}
          {hasRoutableJobs && (
            <button
              type="button"
              onClick={() => setShowRoutePanel(true)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl",
                "bg-blue-500/12 ring-1 ring-blue-500/25 text-blue-400 text-[9px] font-black uppercase tracking-wider",
                "transition-all duration-150 active:scale-95",
              )}
            >
              <Navigation className="w-3 h-3" />
              Route
            </button>
          )}
        </div>
      </div>

      {/* ── Route Intelligence Panel ── */}
      {showRoutePanel && (
        <RouteIntelligencePanel
          jobs={selectedJobs}
          date={selected}
          onClose={() => setShowRoutePanel(false)}
        />
      )}
    </>
  );
}
