import { useMemo, useState } from "react";
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
  MessageSquare,
  Navigation,
  Phone,
  X,
} from "lucide-react";
import { dayKey, useMonthAppointments } from "../../hooks/useMonthAppointments";
import {
  formatJobTime,
  statusLabel,
  type FieldJob,
  type FieldJobStatus,
} from "../../services/fieldJob";

/**
 * FieldSchedule — Premium Mobile Dispatch Command Center
 *
 * Week-strip calendar (expandable to full month), day KPI summary,
 * vertical dispatch timeline with per-job quick actions, and a Route
 * Intelligence panel with multi-stop navigation launch options.
 *
 * Data: live `onSnapshot` via useMonthAppointments — same appointments
 * collection used everywhere else. No mock data, no extra reads.
 *
 * Scrolling: pb-44 ensures timeline cards are never hidden behind the
 * floating action bar or bottom nav on iPhone Safari/PWA.
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
      return { border: "border-emerald-500/30", bar: "bg-emerald-500",  shadow: "shadow-[0_0_12px_rgba(16,185,129,0.10)]" };
    case "in_progress":
    case "en_route":
      return { border: "border-amber-500/35",   bar: "bg-amber-500",    shadow: "shadow-[0_0_12px_rgba(245,158,11,0.12)]" };
    case "confirmed":
    case "approved":
      return { border: "border-sky-500/25",     bar: "bg-sky-500",      shadow: "shadow-[0_0_10px_rgba(14,165,233,0.08)]" };
    case "canceled":
    case "no_show":
    case "missed":
    case "declined":
      return { border: "border-rose-500/20",    bar: "bg-rose-500/50",  shadow: ""                                         };
    default:
      return { border: "border-[#0A4DFF]/20",   bar: "bg-[#0A4DFF]",   shadow: "shadow-[0_0_10px_rgba(10,77,255,0.08)]" };
  }
}

// Build Google Maps multi-stop URL (real API format, no fake routing)
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
          ? "bg-[#0A4DFF]/15 border-[#0A4DFF]/45 shadow-[0_0_16px_rgba(10,77,255,0.22)]"
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

// ─── Day KPI card ─────────────────────────────────────────────────────────────

function DayKpiCard({
  label, value, color,
}: {
  label: string; value: string;
  color: "blue" | "emerald" | "amber" | "rose" | "sky" | "violet";
}) {
  const C = {
    blue:    { text: "text-[#6B8FFF]",   bg: "bg-[#0A4DFF]/[0.08]",  border: "border-[#0A4DFF]/20"   },
    emerald: { text: "text-emerald-400", bg: "bg-emerald-500/[0.08]", border: "border-emerald-500/20" },
    amber:   { text: "text-amber-400",   bg: "bg-amber-500/[0.08]",   border: "border-amber-500/20"   },
    rose:    { text: "text-rose-400",    bg: "bg-rose-500/[0.08]",    border: "border-rose-500/20"    },
    sky:     { text: "text-sky-400",     bg: "bg-sky-500/[0.08]",     border: "border-sky-500/20"     },
    violet:  { text: "text-violet-400",  bg: "bg-violet-500/[0.08]",  border: "border-violet-500/20"  },
  }[color];

  return (
    <div className={cn("shrink-0 rounded-xl border px-3 py-2 min-w-[80px] text-center", C.bg, C.border)}>
      <p className={cn("text-[18px] font-black leading-none tabular-nums", C.text)}>{value}</p>
      <p className="text-[7px] font-black uppercase tracking-widest text-white/30 mt-1 leading-none">{label}</p>
    </div>
  );
}

// ─── Dispatch timeline job card ───────────────────────────────────────────────

function DispatchJobCard({ job }: { job: FieldJob }) {
  const glow        = getJobGlow(job.status);
  const isDone      = job.status === "completed" || job.status === "paid";
  const isActive    = job.status === "in_progress" || job.status === "en_route";
  const isCancelled = job.status === "canceled" || job.status === "no_show" || job.status === "missed";
  const needsPayment = isDone && job.paymentStatus === "unpaid";
  const isRisk      = job.clientRiskLevel === "high" || job.clientRiskLevel === "medium";
  const mapsUrl     = job.address ? `maps://maps.apple.com/?q=${encodeURIComponent(job.address)}` : null;

  return (
    <div className="flex items-stretch gap-0 group">
      {/* Time column */}
      <div className="shrink-0 w-14 flex flex-col items-end pr-3">
        <p className="text-[10px] font-black text-white/45 leading-none tabular-nums pt-3.5">
          {formatJobTime(job.scheduledAt)}
        </p>
        <div className="flex-1 flex justify-end pt-2 pb-0.5">
          <div className="w-px bg-white/[0.05]" />
        </div>
      </div>

      {/* Connector dot */}
      <div className="shrink-0 w-3 flex flex-col items-center">
        <div className={cn(
          "shrink-0 w-3 h-3 rounded-full mt-3 ring-2 ring-[#0C0F16]",
          isActive    ? "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
          : isDone    ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
          : isCancelled ? "bg-rose-500/50"
          : "bg-[#0A4DFF] shadow-[0_0_6px_rgba(10,77,255,0.4)]",
        )} />
        <div className="w-px bg-white/[0.05] flex-1 mt-1" />
      </div>

      {/* Card */}
      <div className={cn(
        "flex-1 ml-3 mb-3 rounded-2xl border bg-[#0C0F16]/80 overflow-hidden",
        "transition-all duration-150 active:scale-[0.985]",
        glow.border, glow.shadow,
        isCancelled && "opacity-55",
      )}>
        <div className="flex items-stretch">
          <div className={cn("w-[3px] shrink-0 rounded-l-2xl", glow.bar)} />
          <div className="flex-1 px-3 pt-3 pb-2.5">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <p className="text-[13px] font-bold text-white leading-tight truncate">{job.clientName}</p>
                {isRisk && (
                  <span className="shrink-0 text-[7px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/25 px-1.5 py-0.5 rounded-full leading-none">
                    Risk
                  </span>
                )}
              </div>
              <span className={cn("shrink-0 text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ring-1 leading-none", statusToneClass(job.status))}>
                {statusLabel(job.status)}
              </span>
            </div>

            {(job.vehicleInfo || job.serviceNames.length > 0) && (
              <p className="text-[10px] text-white/45 font-medium mt-1 leading-tight truncate">
                {[job.vehicleInfo, job.serviceNames.join(", ")].filter(Boolean).join(" · ")}
              </p>
            )}
            {job.address && (
              <p className="text-[9px] text-white/30 font-medium mt-0.5 flex items-center gap-1 truncate leading-tight">
                <MapPin className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{job.address}</span>
              </p>
            )}

            {/* Amount + badges */}
            <div className="flex items-center gap-2 mt-2">
              <span className={cn("text-[13px] font-black tabular-nums", isDone ? "text-emerald-400" : "text-white/55")}>
                {formatCurrency(job.totalAmount)}
              </span>
              {needsPayment && (
                <span className="text-[7px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25 px-1.5 py-0.5 rounded-full leading-none">
                  Collect
                </span>
              )}
              {job.paymentStatus === "paid" && (
                <span className="text-[7px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400/70 ring-1 ring-emerald-500/15 px-1.5 py-0.5 rounded-full leading-none">
                  Paid
                </span>
              )}
              {job.depositRequired && !job.depositPaid && (
                <span className="text-[7px] font-black uppercase tracking-wider bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/25 px-1.5 py-0.5 rounded-full leading-none">
                  Deposit
                </span>
              )}
            </div>

            {/* Quick actions */}
            <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-white/[0.05]">
              {mapsUrl && (
                <a href={mapsUrl} aria-label="Navigate"
                   className="flex-1 h-7 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center gap-1 text-blue-400 hover:bg-blue-500/15 transition-colors">
                  <Navigation className="w-2.5 h-2.5" />
                  <span className="text-[8px] font-black uppercase tracking-wider">Nav</span>
                </a>
              )}
              {job.telUrl && (
                <a href={job.telUrl} aria-label={`Call ${job.clientName}`}
                   className="flex-1 h-7 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center gap-1 text-emerald-400 hover:bg-emerald-500/15 transition-colors">
                  <Phone className="w-2.5 h-2.5" />
                  <span className="text-[8px] font-black uppercase tracking-wider">Call</span>
                </a>
              )}
              {job.smsUrl && (
                <a href={job.smsUrl} aria-label={`Text ${job.clientName}`}
                   className="flex-1 h-7 rounded-lg bg-sky-500/10 ring-1 ring-sky-500/20 flex items-center justify-center gap-1 text-sky-400 hover:bg-sky-500/15 transition-colors">
                  <MessageSquare className="w-2.5 h-2.5" />
                  <span className="text-[8px] font-black uppercase tracking-wider">Text</span>
                </a>
              )}
              <Link to={`/field/job/${job.id}`}
                    className="flex-1 h-7 rounded-lg bg-[#0A4DFF]/15 ring-1 ring-[#0A4DFF]/30 flex items-center justify-center gap-1 text-[#6B8FFF] hover:bg-[#0A4DFF]/20 transition-colors">
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
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-10 text-center">
      <CalendarIcon className="w-8 h-8 text-white/15 mx-auto" />
      <p className="text-[13px] font-bold text-white/40 mt-3">No jobs scheduled</p>
      <p className="text-[10px] text-white/25 mt-1 leading-relaxed">Book a new job or check another day</p>
      <button
        type="button"
        onClick={onBook}
        className="mt-5 flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl bg-[#0A4DFF]/15 ring-1 ring-[#0A4DFF]/30 text-[#6B8FFF] text-[11px] font-black uppercase tracking-wider transition-all duration-150 active:scale-95"
      >
        <CalendarPlus className="w-3.5 h-3.5" />
        Book Job
      </button>
    </div>
  );
}

// ─── Route Intelligence Panel ─────────────────────────────────────────────────

/**
 * Route Intelligence Panel — bottom sheet showing ordered stop list,
 * scheduled revenue, address coverage, and multi-app navigation launch.
 *
 * Drive time and mileage are NOT computed — no distance API is connected.
 * These fields are clearly labelled "unavailable" rather than estimated.
 *
 * Route order:
 *   1. Active (in_progress / en_route) jobs with addresses first
 *   2. Then remaining non-cancelled jobs sorted by scheduledAt ascending
 *   3. Cancelled / no-show / missed jobs are excluded
 *   4. Jobs without addresses are excluded from routing (shown separately)
 */
function RouteIntelligencePanel({
  jobs,
  date,
  onClose,
}: {
  jobs: FieldJob[];
  date: Date;
  onClose: () => void;
}) {
  // --- Route order computation ---
  const isCancelledStatus = (s: FieldJobStatus) =>
    s === "canceled" || s === "no_show" || s === "missed" || s === "declined";

  const activeWithAddr = jobs.filter(
    j => (j.status === "in_progress" || j.status === "en_route") && j.address,
  );
  const scheduledWithAddr = jobs
    .filter(
      j =>
        !isCancelledStatus(j.status) &&
        j.status !== "in_progress" &&
        j.status !== "en_route" &&
        j.address,
    )
    .sort((a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0));

  const routableJobs = [...activeWithAddr, ...scheduledWithAddr];

  // Jobs that are active/scheduled but have no address
  const noAddressJobs = jobs.filter(
    j => !isCancelledStatus(j.status) && !j.address,
  );

  const scheduledRevenue = routableJobs.reduce((s, j) => s + j.totalAmount, 0);
  const addresses        = routableJobs.map(j => j.address as string);

  // Navigation URLs (real URLs only — no fake routing)
  const appleMapsUrl  = addresses[0]
    ? `maps://maps.apple.com/?q=${encodeURIComponent(addresses[0])}`
    : null;
  const googleMapsUrl = buildGoogleMapsUrl(addresses);
  const wazeUrl       = addresses[0]
    ? `waze://ul?q=${encodeURIComponent(addresses[0])}`
    : null;

  const isMultiStop   = addresses.length > 1;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal
      aria-label="Route Intelligence"
    >
      {/* Tap-to-close overlay */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />

      {/* Panel */}
      <div className="relative z-10 bg-[#0C0F16] border-t border-white/10 rounded-t-3xl max-h-[88vh] flex flex-col">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-white/[0.06]">
          <div>
            <h2 className="text-[15px] font-black text-white leading-none">Route Intelligence</h2>
            <p className="text-[10px] text-white/40 font-bold mt-1 leading-none">
              {format(date, "EEEE, MMMM d")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/50 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

          {/* ── Empty: no jobs at all ── */}
          {jobs.length === 0 && (
            <div className="py-8 text-center">
              <CalendarIcon className="w-7 h-7 text-white/15 mx-auto" />
              <p className="text-[12px] font-bold text-white/40 mt-2.5">No jobs to route for this day</p>
            </div>
          )}

          {/* ── Empty: jobs exist but none have addresses ── */}
          {jobs.length > 0 && routableJobs.length === 0 && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-6 text-center">
              <MapPin className="w-6 h-6 text-white/15 mx-auto" />
              <p className="text-[12px] font-bold text-white/40 mt-2">No routable addresses</p>
              <p className="text-[10px] text-white/25 mt-1 leading-relaxed">
                Add addresses to jobs to enable routing.
              </p>
            </div>
          )}

          {/* ── Route summary ── */}
          {routableJobs.length > 0 && (
            <div className="rounded-2xl border border-[#0A4DFF]/20 bg-[#0A4DFF]/[0.06] px-4 py-3.5 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-[#6B8FFF]">
                Route Summary
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <SummaryRow label="Total Stops"     value={`${routableJobs.length} stop${routableJobs.length === 1 ? "" : "s"}`} />
                <SummaryRow label="Scheduled Rev"   value={formatCurrency(scheduledRevenue)} highlight="emerald" />
                <SummaryRow label="Addresses Ready" value={`${addresses.length}`} highlight="emerald" />
                {noAddressJobs.length > 0 && (
                  <SummaryRow label="Missing Address" value={`${noAddressJobs.length}`} highlight="amber" />
                )}
                <SummaryRow label="Drive Time"      value="Unavailable" muted />
                <SummaryRow label="Mileage"         value="Unavailable" muted />
              </div>
              <p className="text-[8px] text-white/25 leading-tight mt-1">
                Route follows schedule order. Optimization not available.
              </p>
            </div>
          )}

          {/* ── Stop list ── */}
          {routableJobs.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/35">
                Stop Order
              </p>
              {routableJobs.map((job, idx) => (
                <RouteStopCard key={job.id} job={job} stopNumber={idx + 1} />
              ))}
            </div>
          )}

          {/* ── Missing address jobs ── */}
          {noAddressJobs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/60">
                Excluded — No Address
              </p>
              {noAddressJobs.map(job => (
                <div
                  key={job.id}
                  className="flex items-center gap-2.5 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2.5"
                >
                  <MapPin className="w-3.5 h-3.5 text-amber-400/60 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-white/60 truncate leading-tight">{job.clientName}</p>
                    <p className="text-[9px] text-amber-400/50 font-bold leading-tight">No address on file</p>
                  </div>
                  <Link
                    to={`/field/job/${job.id}`}
                    onClick={onClose}
                    className="shrink-0 text-[8px] font-black uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors"
                  >
                    Open
                  </Link>
                </div>
              ))}
            </div>
          )}

          {/* ── Connect service note ── */}
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">
              Distance Services
            </p>
            <p className="text-[9px] text-white/25 leading-relaxed">
              Connect a distance service to enable drive time and mileage estimates.
              Current route reflects schedule order only.
            </p>
          </div>

          {/* ── Navigation launch ── */}
          {routableJobs.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/35">
                {isMultiStop ? "Launch Navigation" : "Open in Maps"}
              </p>

              {/* Apple Maps */}
              {appleMapsUrl && (
                <a
                  href={appleMapsUrl}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3.5 py-3 hover:bg-white/[0.07] transition-colors active:scale-[0.98]"
                >
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-sky-500/15 ring-1 ring-sky-500/25 flex items-center justify-center">
                    <Navigation className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-white leading-tight">Apple Maps</p>
                    <p className="text-[9px] text-white/35 leading-tight">
                      {isMultiStop ? "Open first stop" : "Open destination"}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/25 shrink-0" />
                </a>
              )}

              {/* Google Maps */}
              {googleMapsUrl && (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3.5 py-3 hover:bg-white/[0.07] transition-colors active:scale-[0.98]"
                >
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/25 flex items-center justify-center">
                    <Navigation className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-white leading-tight">Google Maps</p>
                    <p className="text-[9px] text-white/35 leading-tight">
                      {isMultiStop ? `Route all ${addresses.length} stops` : "Open destination"}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/25 shrink-0" />
                </a>
              )}

              {/* Waze */}
              {wazeUrl && (
                <a
                  href={wazeUrl}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3.5 py-3 hover:bg-white/[0.07] transition-colors active:scale-[0.98]"
                >
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-violet-500/15 ring-1 ring-violet-500/25 flex items-center justify-center">
                    <Navigation className="w-4 h-4 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-white leading-tight">Waze</p>
                    <p className="text-[9px] text-white/35 leading-tight">
                      {isMultiStop ? "Open first stop" : "Open destination"}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/25 shrink-0" />
                </a>
              )}
            </div>
          )}

          {/* Safe area bottom spacer */}
          <div className="h-4" style={{ height: "max(1rem, env(safe-area-inset-bottom, 0px))" }} />
        </div>
      </div>
    </div>
  );
}

// Small helper rows used inside the summary card
function SummaryRow({
  label,
  value,
  highlight,
  muted = false,
}: {
  label: string;
  value: string;
  highlight?: "emerald" | "amber";
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[8px] font-black uppercase tracking-wider text-white/30 shrink-0">{label}</span>
      <span className={cn(
        "text-[10px] font-bold text-right",
        muted       ? "text-white/25 italic"
        : highlight === "emerald" ? "text-emerald-400"
        : highlight === "amber"   ? "text-amber-400"
        : "text-white/70",
      )}>
        {value}
      </span>
    </div>
  );
}

// Individual stop card inside the route panel
function RouteStopCard({ job, stopNumber }: { job: FieldJob; stopNumber: number }) {
  const isActive = job.status === "in_progress" || job.status === "en_route";
  const mapsUrl  = job.address ? `maps://maps.apple.com/?q=${encodeURIComponent(job.address)}` : null;

  return (
    <div className={cn(
      "rounded-xl border px-3 py-2.5",
      isActive ? "border-amber-500/25 bg-amber-500/[0.05]" : "border-white/[0.06] bg-white/[0.03]",
    )}>
      <div className="flex items-start gap-2.5">
        {/* Stop number badge */}
        <div className={cn(
          "shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ring-1 mt-0.5",
          isActive
            ? "bg-amber-500/20 text-amber-400 ring-amber-500/30"
            : "bg-[#0A4DFF]/15 text-[#6B8FFF] ring-[#0A4DFF]/25",
        )}>
          {stopNumber}
        </div>

        {/* Stop details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[12px] font-bold text-white leading-tight truncate">{job.clientName}</p>
            {isActive && (
              <span className="shrink-0 text-[7px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25 px-1.5 py-0.5 rounded-full leading-none">
                Active
              </span>
            )}
          </div>
          <p className="text-[10px] text-white/50 font-medium mt-0.5 leading-tight">
            {formatJobTime(job.scheduledAt)}
            {job.serviceNames.length > 0 && ` · ${job.serviceNames.join(", ")}`}
          </p>
          {job.address && (
            <p className="text-[9px] text-white/35 mt-0.5 flex items-center gap-1 leading-tight">
              <MapPin className="w-2.5 h-2.5 shrink-0" />
              <span className="break-words">{job.address}</span>
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-[11px] font-black text-white/60 tabular-nums">
              {formatCurrency(job.totalAmount)}
            </span>
          </div>
        </div>
      </div>

      {/* Stop actions */}
      <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-white/[0.04]">
        {mapsUrl && (
          <a
            href={mapsUrl}
            className="flex-1 h-7 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center gap-1 text-blue-400 transition-colors hover:bg-blue-500/15"
          >
            <Navigation className="w-2.5 h-2.5" />
            <span className="text-[8px] font-black uppercase tracking-wider">Navigate</span>
          </a>
        )}
        <Link
          to={`/field/job/${job.id}`}
          className="flex-1 h-7 rounded-lg bg-white/[0.05] ring-1 ring-white/10 flex items-center justify-center gap-1 text-white/50 transition-colors hover:bg-white/[0.08]"
        >
          <ChevronRight className="w-2.5 h-2.5" />
          <span className="text-[8px] font-black uppercase tracking-wider">Open Job</span>
        </Link>
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FieldSchedule() {
  const today    = useMemo(() => startOfToday(), []);
  const navigate = useNavigate();

  const [selected,         setSelected]         = useState<Date>(() => today);
  const [visibleMonth,     setVisibleMonth]     = useState<Date>(() => startOfMonth(today));
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [showRoutePanel,   setShowRoutePanel]   = useState(false);

  const { byDayKey, gridStart, gridEnd, loading, error } = useMonthAppointments(visibleMonth);

  // ── Week strip ────────────────────────────────────────────────────────────
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

  // ── Selected day jobs ─────────────────────────────────────────────────────
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

  // ── Has routable jobs (determines if Route button shows) ──────────────────
  const hasRoutableJobs = useMemo(
    () => selectedJobs.some(
      j => j.address &&
        j.status !== "canceled" && j.status !== "no_show" &&
        j.status !== "missed" && j.status !== "declined",
    ),
    [selectedJobs],
  );

  // ── Day selection helper ──────────────────────────────────────────────────
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

  const daySummary = useMemo(() => {
    if (dayKpis.total === 0) return "No jobs";
    const parts: string[] = [`${dayKpis.total} ${dayKpis.total === 1 ? "job" : "jobs"}`];
    if (dayKpis.revenue > 0) parts.push(formatCurrency(dayKpis.revenue));
    if (dayKpis.active > 0) parts.push("In progress");
    else if (dayKpis.completed === dayKpis.total) parts.push("All done");
    return parts.join(" · ");
  }, [dayKpis]);

  return (
    <>
      {/*
        pb-44 (176px) ensures the last timeline card clears both the floating
        action bar (~56px) and the bottom nav (~56px) on all iPhone models.
        The inline paddingBottom extends this further on notched iPhones using
        the CSS env() safe-area-inset-bottom value.
      */}
      <div
        className="relative space-y-3 pb-44"
        style={{ paddingBottom: "max(11rem, calc(8rem + env(safe-area-inset-bottom, 0px)))" }}
      >

        {/* ── Sticky header ── */}
        <div className="sticky top-12 z-20 -mx-2.5 px-2.5 py-2 bg-background/95 backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handlePrevWeek}
              aria-label="Previous week"
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button type="button" onClick={handleToday} className="flex flex-col items-center min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/35 leading-none">Schedule</p>
                {!loading && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]" />
                )}
              </div>
              <h1 className="text-[13px] font-black text-white leading-tight mt-0.5 truncate">{dayLabel}</h1>
              {dayKpis.total > 0 && (
                <p className="text-[9px] text-white/35 font-bold leading-none mt-0.5">{daySummary}</p>
              )}
            </button>

            <div className="flex items-center gap-1">
              {!isCurrentWeek && (
                <button
                  type="button"
                  onClick={handleToday}
                  className="h-9 px-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/55 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Today
                </button>
              )}
              <button
                type="button"
                onClick={handleNextWeek}
                aria-label="Next week"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors"
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

        {/* ── Expand/collapse full month grid toggle ── */}
        <button
          type="button"
          onClick={() => setShowFullCalendar(v => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-1 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white/55 transition-colors"
        >
          {showFullCalendar ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {format(visibleMonth, "MMMM yyyy")}
        </button>

        {/* ── Full month grid (expandable) ── */}
        {showFullCalendar && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <button
                type="button"
                onClick={() => setVisibleMonth(m => addMonths(m, -1))}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                {format(visibleMonth, "MMMM yyyy")}
              </span>
              <button
                type="button"
                onClick={() => setVisibleMonth(m => addMonths(m, 1))}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 px-0.5">
              {WEEKDAY_MINI.map((w, i) => (
                <div key={`${w}-${i}`} className="text-center text-[9px] font-black uppercase tracking-widest text-white/30 py-0.5">
                  {w}
                </div>
              ))}
            </div>

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
        )}

        {/* ── Loading / error ── */}
        {loading && (
          <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-2 flex items-center justify-center min-h-[40px]">
            <div className="w-3 h-3 border border-white/10 border-t-white/40 rounded-full animate-spin" />
            <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/35">Loading…</span>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load schedule</p>
              <p className="text-[9px] text-rose-300/60 mt-0.5 break-words leading-tight">{error}</p>
            </div>
          </div>
        )}

        {/* ── Day KPI strip ── */}
        {!loading && !error && dayKpis.total > 0 && (
          <div className="-mx-2.5 px-2.5 overflow-x-auto scrollbar-none">
            <div className="flex gap-2 min-w-max pb-0.5">
              {dayKpis.revenue > 0 && <DayKpiCard label="Day Revenue" value={formatCurrency(dayKpis.revenue)} color="emerald" />}
              <DayKpiCard label="Total Jobs"  value={String(dayKpis.total)}     color="blue"   />
              {dayKpis.completed > 0 && <DayKpiCard label="Completed" value={String(dayKpis.completed)} color="emerald" />}
              {dayKpis.active    > 0 && <DayKpiCard label="Active"    value={String(dayKpis.active)}    color="amber"  />}
              {dayKpis.confirmed > 0 && <DayKpiCard label="Confirmed" value={String(dayKpis.confirmed)} color="sky"    />}
              {dayKpis.pending   > 0 && <DayKpiCard label="Pending"   value={String(dayKpis.pending)}   color="violet" />}
            </div>
          </div>
        )}

        {/* ── Dispatch timeline ── */}
        <section aria-label="Selected day timeline">
          <div className="flex items-center justify-between px-0.5 mb-2">
            <h2 className="text-[9px] font-black uppercase tracking-widest text-white/35">
              {isSameDay(selected, today) ? "Today's Dispatch" : format(selected, "EEE, MMM d")}
            </h2>
            <span className="text-[9px] font-black uppercase tracking-widest text-white/25">
              {dayKpis.total} {dayKpis.total === 1 ? "job" : "jobs"}
            </span>
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

      {/* ── Floating action bar (outside scroll div so it doesn't affect layout) ── */}
      <div className="fixed bottom-20 left-0 right-0 px-4 z-30 pointer-events-none">
        <div className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-2xl",
          "bg-[#0C0F16]/92 backdrop-blur-md border border-white/[0.08]",
          "shadow-[0_4px_24px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)]",
          "px-3 py-2.5",
        )}>
          <button
            type="button"
            onClick={bookJob}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-[#0A4DFF] text-white text-[10px] font-black uppercase tracking-wider shadow-[0_0_16px_rgba(10,77,255,0.40)] transition-all duration-150 active:scale-95"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Book Job
          </button>

          {/* Route button — only shown when routable jobs exist on the selected day */}
          {hasRoutableJobs && (
            <button
              type="button"
              onClick={() => setShowRoutePanel(true)}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-blue-500/15 ring-1 ring-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-wider transition-all duration-150 active:scale-95"
            >
              <Navigation className="w-3.5 h-3.5" />
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
