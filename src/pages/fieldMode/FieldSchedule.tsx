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
 * and vertical dispatch timeline with per-job quick actions.
 *
 * Data: live `onSnapshot` via useMonthAppointments — same appointments
 * collection used everywhere else. No mock data, no extra reads.
 */

const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WEEKDAY_MINI  = ["S",   "M",   "T",   "W",   "T",   "F",   "S"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Dominant status colour for a day's jobs — used on calendar dots. */
function getDayDotColor(
  jobs: FieldJob[],
): "emerald" | "amber" | "rose" | "sky" | "blue" | null {
  if (jobs.length === 0) return null;
  if (jobs.some(j => j.status === "in_progress" || j.status === "en_route")) return "amber";
  if (jobs.some(j => j.status === "canceled" || j.status === "no_show" || j.status === "missed")) {
    // Only rose if ALL are cancelled — a single cancel on a busy day is noise
    const cancelled = jobs.filter(j => j.status === "canceled" || j.status === "no_show" || j.status === "missed").length;
    if (cancelled === jobs.length) return "rose";
  }
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
      return { border: "border-emerald-500/30", bar: "bg-emerald-500",    shadow: "shadow-[0_0_12px_rgba(16,185,129,0.10)]"  };
    case "in_progress":
    case "en_route":
      return { border: "border-amber-500/35",   bar: "bg-amber-500",      shadow: "shadow-[0_0_12px_rgba(245,158,11,0.12)]"  };
    case "confirmed":
    case "approved":
      return { border: "border-sky-500/25",     bar: "bg-sky-500",        shadow: "shadow-[0_0_10px_rgba(14,165,233,0.08)]"  };
    case "canceled":
    case "no_show":
    case "missed":
    case "declined":
      return { border: "border-rose-500/20",    bar: "bg-rose-500/50",    shadow: ""                                          };
    default:
      return { border: "border-[#0A4DFF]/20",   bar: "bg-[#0A4DFF]",     shadow: "shadow-[0_0_10px_rgba(10,77,255,0.08)]"  };
  }
}

// ─── Week strip day cell ───────────────────────────────────────────────────────

function WeekDayCell({
  date,
  isToday,
  isSelected,
  jobs,
  onTap,
}: {
  date: Date;
  isToday: boolean;
  isSelected: boolean;
  jobs: FieldJob[];
  onTap: () => void;
}) {
  const dotColor = getDayDotColor(jobs);
  const count    = jobs.length;
  const dayIdx   = date.getDay(); // 0=Sun

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={format(date, "EEEE, MMMM d")}
      aria-pressed={isSelected}
      className={cn(
        "flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border transition-all duration-150",
        "active:scale-[0.92]",
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
        isSelected
          ? "text-white"
          : isToday
            ? "text-[#0A4DFF]"
            : "text-white/70",
      )}>
        {format(date, "d")}
      </span>
      {/* Day indicator */}
      <div className="h-[8px] flex items-center justify-center">
        {dotColor && count > 0 && (
          count <= 3 ? (
            <span className="flex items-center gap-[2px]">
              {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                <span
                  key={i}
                  className={cn("w-[4px] h-[4px] rounded-full", DOT_CLASSES[dotColor])}
                />
              ))}
            </span>
          ) : (
            <span className={cn(
              "text-[7px] font-black leading-none px-1 py-[1px] rounded-sm",
              `${DOT_CLASSES[dotColor]} text-white/90`,
            )}>
              {count}
            </span>
          )
        )}
      </div>
    </button>
  );
}

// ─── Full-month grid day cell (compact) ───────────────────────────────────────

function MonthGridCell({
  date,
  inMonth,
  isToday,
  isSelected,
  jobs,
  onTap,
}: {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  jobs: FieldJob[];
  onTap: () => void;
}) {
  const dotColor = getDayDotColor(jobs);
  const count    = jobs.length;

  return (
    <button
      type="button"
      onClick={onTap}
      className={cn(
        "aspect-square flex flex-col items-center justify-between py-1 rounded-lg border transition-colors",
        isSelected
          ? "bg-[#0A4DFF]/20 border-[#0A4DFF]/50 text-white"
          : isToday
            ? "bg-white/[0.04] border-white/10 text-white"
            : inMonth
              ? "bg-sidebar/30 hover:bg-sidebar/50 border-transparent text-white/75"
              : "bg-transparent border-transparent text-white/25",
        "active:bg-[#0A4DFF]/25",
      )}
    >
      <span className={cn(
        "text-[10px] font-black leading-none",
        isToday && !isSelected && "text-[#0A4DFF]",
      )}>
        {format(date, "d")}
      </span>
      <div className="h-[6px] flex items-center justify-center">
        {dotColor && count > 0 && (
          count <= 3 ? (
            <span className="flex gap-[2px]">
              {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "w-[4px] h-[4px] rounded-full",
                    inMonth ? DOT_CLASSES[dotColor] : "bg-white/25",
                  )}
                />
              ))}
            </span>
          ) : (
            <span className={cn(
              "text-[7px] font-black px-0.5 py-[1px] rounded leading-none",
              inMonth
                ? "bg-[#0A4DFF]/30 text-white ring-1 ring-[#0A4DFF]/50"
                : "bg-white/10 text-white/40",
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
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "blue" | "emerald" | "amber" | "rose" | "sky" | "violet";
}) {
  const C = {
    blue:    { text: "text-[#6B8FFF]",   bg: "bg-[#0A4DFF]/[0.08]",  border: "border-[#0A4DFF]/20"    },
    emerald: { text: "text-emerald-400", bg: "bg-emerald-500/[0.08]", border: "border-emerald-500/20"  },
    amber:   { text: "text-amber-400",   bg: "bg-amber-500/[0.08]",   border: "border-amber-500/20"    },
    rose:    { text: "text-rose-400",    bg: "bg-rose-500/[0.08]",    border: "border-rose-500/20"     },
    sky:     { text: "text-sky-400",     bg: "bg-sky-500/[0.08]",     border: "border-sky-500/20"      },
    violet:  { text: "text-violet-400",  bg: "bg-violet-500/[0.08]",  border: "border-violet-500/20"   },
  }[color];

  return (
    <div className={cn(
      "shrink-0 rounded-xl border px-3 py-2 min-w-[80px] text-center",
      C.bg, C.border,
    )}>
      <p className={cn("text-[18px] font-black leading-none tabular-nums", C.text)}>{value}</p>
      <p className="text-[7px] font-black uppercase tracking-widest text-white/30 mt-1 leading-none">{label}</p>
    </div>
  );
}

// ─── Dispatch timeline job card ───────────────────────────────────────────────

function DispatchJobCard({ job }: { job: FieldJob }) {
  const glow         = getJobGlow(job.status);
  const isDone       = job.status === "completed" || job.status === "paid";
  const isActive     = job.status === "in_progress" || job.status === "en_route";
  const isCancelled  = job.status === "canceled" || job.status === "no_show" || job.status === "missed";
  const needsPayment = isDone && job.paymentStatus === "unpaid";
  const isRisk       = job.clientRiskLevel === "high" || job.clientRiskLevel === "medium";

  const mapsUrl = job.address
    ? `maps://maps.apple.com/?q=${encodeURIComponent(job.address)}`
    : null;

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

      {/* Job card */}
      <div className={cn(
        "flex-1 ml-3 mb-3 rounded-2xl border bg-[#0C0F16]/80 overflow-hidden",
        "transition-all duration-150 active:scale-[0.985]",
        glow.border,
        glow.shadow,
        isCancelled && "opacity-55",
      )}>
        {/* Left status bar */}
        <div className="flex items-stretch">
          <div className={cn("w-[3px] shrink-0 rounded-l-2xl", glow.bar)} />

          <div className="flex-1 px-3 pt-3 pb-2.5">
            {/* Header row: name + status badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <p className="text-[13px] font-bold text-white leading-tight truncate">
                  {job.clientName}
                </p>
                {isRisk && (
                  <span className="shrink-0 text-[7px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/25 px-1.5 py-0.5 rounded-full leading-none">
                    Risk
                  </span>
                )}
              </div>
              <span className={cn(
                "shrink-0 text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ring-1 leading-none",
                statusToneClass(job.status),
              )}>
                {statusLabel(job.status)}
              </span>
            </div>

            {/* Vehicle + services */}
            {(job.vehicleInfo || job.serviceNames.length > 0) && (
              <p className="text-[10px] text-white/45 font-medium mt-1 leading-tight truncate">
                {[job.vehicleInfo, job.serviceNames.join(", ")].filter(Boolean).join(" · ")}
              </p>
            )}

            {/* Address */}
            {job.address && (
              <p className="text-[9px] text-white/30 font-medium mt-0.5 flex items-center gap-1 truncate leading-tight">
                <MapPin className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{job.address}</span>
              </p>
            )}

            {/* Amount + payment state */}
            <div className="flex items-center gap-2 mt-2">
              <span className={cn(
                "text-[13px] font-black tabular-nums",
                isDone ? "text-emerald-400" : "text-white/55",
              )}>
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

            {/* Quick action row */}
            <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-white/[0.05]">
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  aria-label="Navigate"
                  className="flex-1 h-7 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center gap-1 text-blue-400 hover:bg-blue-500/15 transition-colors"
                >
                  <Navigation className="w-2.5 h-2.5" />
                  <span className="text-[8px] font-black uppercase tracking-wider">Nav</span>
                </a>
              )}
              {job.telUrl && (
                <a
                  href={job.telUrl}
                  aria-label={`Call ${job.clientName}`}
                  className="flex-1 h-7 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center gap-1 text-emerald-400 hover:bg-emerald-500/15 transition-colors"
                >
                  <Phone className="w-2.5 h-2.5" />
                  <span className="text-[8px] font-black uppercase tracking-wider">Call</span>
                </a>
              )}
              {job.smsUrl && (
                <a
                  href={job.smsUrl}
                  aria-label={`Text ${job.clientName}`}
                  className="flex-1 h-7 rounded-lg bg-sky-500/10 ring-1 ring-sky-500/20 flex items-center justify-center gap-1 text-sky-400 hover:bg-sky-500/15 transition-colors"
                >
                  <MessageSquare className="w-2.5 h-2.5" />
                  <span className="text-[8px] font-black uppercase tracking-wider">Text</span>
                </a>
              )}
              <Link
                to={`/field/job/${job.id}`}
                className="flex-1 h-7 rounded-lg bg-[#0A4DFF]/15 ring-1 ring-[#0A4DFF]/30 flex items-center justify-center gap-1 text-[#6B8FFF] hover:bg-[#0A4DFF]/20 transition-colors"
              >
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
      <p className="text-[10px] text-white/25 mt-1 leading-relaxed">
        Book a new job or check another day
      </p>
      <button
        type="button"
        onClick={onBook}
        className={cn(
          "mt-5 flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl",
          "bg-[#0A4DFF]/15 ring-1 ring-[#0A4DFF]/30",
          "text-[#6B8FFF] text-[11px] font-black uppercase tracking-wider",
          "transition-all duration-150 active:scale-95",
        )}
      >
        <CalendarPlus className="w-3.5 h-3.5" />
        Book Job
      </button>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FieldSchedule() {
  const today        = useMemo(() => startOfToday(), []);
  const navigate     = useNavigate();

  const [selected,         setSelected]         = useState<Date>(() => today);
  const [visibleMonth,     setVisibleMonth]     = useState<Date>(() => startOfMonth(today));
  const [showFullCalendar, setShowFullCalendar] = useState(false);

  const { byDayKey, gridStart, gridEnd, loading, error } = useMonthAppointments(visibleMonth);

  // ── Week strip: 7 days starting Sunday of selected's week ─────────────────
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
    const pending   = selectedJobs.filter(j => j.status === "scheduled" || j.status === "requested" || j.status === "pending_approval").length;
    const confirmed = selectedJobs.filter(j => j.status === "confirmed" || j.status === "approved").length;
    return {
      total:     selectedJobs.length,
      revenue,
      completed: completed.length,
      active,
      pending,
      confirmed,
    };
  }, [selectedJobs]);

  // ── Navigate to first job address for routing ─────────────────────────────
  const firstJobAddress = useMemo(() => {
    const job = selectedJobs.find(j => j.address && j.status !== "canceled" && j.status !== "no_show");
    return job?.address ?? null;
  }, [selectedJobs]);

  // ── Day selection — also syncs visibleMonth ───────────────────────────────
  const handleSelectDay = (d: Date) => {
    setSelected(d);
    setVisibleMonth(prev => {
      const newMonth = startOfMonth(d);
      return isSameMonth(prev, newMonth) ? prev : newMonth;
    });
  };

  const handlePrevWeek = () => handleSelectDay(subDays(selected, 7));
  const handleNextWeek = () => handleSelectDay(addDays(selected, 7));

  const handleToday = () => {
    setSelected(today);
    setVisibleMonth(startOfMonth(today));
  };

  const bookJob = () => navigate("/field/book-job");

  const isCurrentWeek = useMemo(() => {
    const todaySun = startOfWeek(today, { weekStartsOn: 0 }).getTime();
    const selSun   = startOfWeek(selected, { weekStartsOn: 0 }).getTime();
    return todaySun === selSun;
  }, [today, selected]);

  // ── Day header label ──────────────────────────────────────────────────────
  const dayLabel = isSameDay(selected, today)
    ? "Today"
    : format(selected, "EEEE, MMM d");

  // ── Day summary subtitle (revenue + job count + status) ───────────────────
  const daySummary = useMemo(() => {
    if (dayKpis.total === 0) return "No jobs";
    const parts: string[] = [];
    parts.push(`${dayKpis.total} ${dayKpis.total === 1 ? "job" : "jobs"}`);
    if (dayKpis.revenue > 0) parts.push(formatCurrency(dayKpis.revenue));
    if (dayKpis.active > 0)   parts.push("In progress");
    else if (dayKpis.completed === dayKpis.total) parts.push("All done");
    return parts.join(" · ");
  }, [dayKpis]);

  return (
    <div className="relative space-y-3 pb-28">

      {/* ── Sticky header ── */}
      <div className="sticky top-12 z-20 -mx-2.5 px-2.5 py-2 bg-background/95 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          {/* Prev week */}
          <button
            type="button"
            onClick={handlePrevWeek}
            aria-label="Previous week"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Center: date + summary */}
          <button
            type="button"
            onClick={handleToday}
            className="flex flex-col items-center min-w-0 group"
          >
            <div className="flex items-center gap-1.5">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/35 leading-none">
                Schedule
              </p>
              {!loading && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]" />
              )}
            </div>
            <h1 className="text-[13px] font-black text-white leading-tight mt-0.5 truncate">
              {dayLabel}
            </h1>
            {dayKpis.total > 0 && (
              <p className="text-[9px] text-white/35 font-bold leading-none mt-0.5">
                {daySummary}
              </p>
            )}
          </button>

          {/* Next week */}
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
        {weekDays.map((d, i) => {
          const jobs = byDayKey.get(dayKey(d)) ?? [];
          return (
            <WeekDayCell
              key={`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`}
              date={d}
              isToday={isSameDay(d, today)}
              isSelected={isSameDay(d, selected)}
              jobs={jobs}
              onTap={() => handleSelectDay(d)}
            />
          );
        })}
      </div>

      {/* ── Expand/collapse full month grid ── */}
      <button
        type="button"
        onClick={() => setShowFullCalendar(v => !v)}
        className="w-full flex items-center justify-center gap-1.5 py-1 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white/55 transition-colors"
      >
        {showFullCalendar ? (
          <>
            <ChevronUp className="w-3 h-3" />
            {format(visibleMonth, "MMMM yyyy")}
          </>
        ) : (
          <>
            <ChevronDown className="w-3 h-3" />
            {format(visibleMonth, "MMMM yyyy")}
          </>
        )}
      </button>

      {/* ── Full month grid (expandable) ── */}
      {showFullCalendar && (
        <div className="space-y-1.5">
          {/* Month nav */}
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

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-0.5 px-0.5">
            {WEEKDAY_MINI.map((w, i) => (
              <div
                key={`${w}-${i}`}
                className="text-center text-[9px] font-black uppercase tracking-widest text-white/30 py-0.5"
              >
                {w}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 gap-0.5 px-0.5">
            {monthCells.map(d => {
              const jobs = byDayKey.get(dayKey(d)) ?? [];
              return (
                <MonthGridCell
                  key={d.toISOString()}
                  date={d}
                  inMonth={isSameMonth(d, visibleMonth)}
                  isToday={isSameDay(d, today)}
                  isSelected={isSameDay(d, selected)}
                  jobs={jobs}
                  onTap={() => {
                    handleSelectDay(d);
                    setShowFullCalendar(false);
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Loading / error states ── */}
      {loading && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-2 flex items-center justify-center min-h-[40px]">
          <div className="w-3 h-3 border border-white/10 border-t-white/40 rounded-full animate-spin" />
          <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/35">
            Loading…
          </span>
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

      {/* ── Day KPI strip (only when jobs exist) ── */}
      {!loading && !error && dayKpis.total > 0 && (
        <div className="-mx-2.5 px-2.5 overflow-x-auto scrollbar-none">
          <div className="flex gap-2 min-w-max pb-0.5">
            {dayKpis.revenue > 0 && (
              <DayKpiCard
                label="Day Revenue"
                value={formatCurrency(dayKpis.revenue)}
                color="emerald"
              />
            )}
            <DayKpiCard
              label="Total Jobs"
              value={String(dayKpis.total)}
              color="blue"
            />
            {dayKpis.completed > 0 && (
              <DayKpiCard
                label="Completed"
                value={String(dayKpis.completed)}
                color="emerald"
              />
            )}
            {dayKpis.active > 0 && (
              <DayKpiCard
                label="Active"
                value={String(dayKpis.active)}
                color="amber"
              />
            )}
            {dayKpis.confirmed > 0 && (
              <DayKpiCard
                label="Confirmed"
                value={String(dayKpis.confirmed)}
                color="sky"
              />
            )}
            {dayKpis.pending > 0 && (
              <DayKpiCard
                label="Pending"
                value={String(dayKpis.pending)}
                color="violet"
              />
            )}
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
            {selectedJobs.map(j => (
              <DispatchJobCard key={j.id} job={j} />
            ))}
          </div>
        )}
      </section>

      {/* ── Floating action bar ── */}
      <div className="fixed bottom-20 left-0 right-0 px-4 z-30 pointer-events-none">
        <div className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-2xl",
          "bg-[#0C0F16]/90 backdrop-blur-md border border-white/[0.08]",
          "shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)]",
          "px-3 py-2.5",
        )}>
          <button
            type="button"
            onClick={bookJob}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl",
              "bg-[#0A4DFF] text-white text-[10px] font-black uppercase tracking-wider",
              "shadow-[0_0_16px_rgba(10,77,255,0.40)]",
              "transition-all duration-150 active:scale-95",
            )}
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Book Job
          </button>

          {firstJobAddress && (
            <a
              href={`maps://maps.apple.com/?q=${encodeURIComponent(firstJobAddress)}`}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl",
                "bg-blue-500/15 ring-1 ring-blue-500/30 text-blue-400",
                "text-[10px] font-black uppercase tracking-wider",
                "transition-all duration-150 active:scale-95",
              )}
            >
              <Navigation className="w-3.5 h-3.5" />
              Route
            </a>
          )}
        </div>
      </div>

    </div>
  );
}
