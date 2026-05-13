import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfToday,
} from "date-fns";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from "lucide-react";
import { dayKey, useMonthAppointments } from "../../hooks/useMonthAppointments";
import {
  formatJobTime,
  statusLabel,
  type FieldJob,
  type FieldJobStatus,
} from "../../services/fieldJob";

/**
 * Phone-only Schedule view (rendered at `/calendar` when the device
 * is a phone, via CalendarSwitch in App.tsx).
 *
 * Renders a TRUE 7-column month grid (5 or 6 rows depending on the
 * month) that fits the phone screen without horizontal scrolling.
 * Tablet/desktop continue to render the full Calendar page — this
 * file is never imported on those devices.
 *
 * Interaction model:
 *   - Month header with prev/next month navigation + Today button.
 *   - Each day cell shows the day number and a compact indicator:
 *       1–3 appointments → dots,
 *       4+ appointments → "Nx" count badge.
 *   - Tapping a day selects it; that day's appointments expand
 *     beneath the grid as compact cards.
 *   - Each appointment card taps through to the existing phone
 *     Active Job screen (/field/job/:id).
 *
 * Data: live `onSnapshot` of the same `appointments` collection used
 * everywhere else in the app — no duplicate store.
 *
 * Mobile-first sizing notes:
 *   - 7-column CSS grid with `aspect-square` cells. On the smallest
 *     supported phone (iPhone SE ≈ 320px width, page padding `px-2.5`)
 *     each cell is ~41px, comfortably tappable.
 *   - All text uses `leading-none` / `truncate` to avoid wrapping.
 *   - No fixed widths anywhere; the whole layout flexes to viewport.
 */

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

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

function DayCell({
  date,
  inMonth,
  isToday,
  isSelected,
  count,
  onTap,
}: {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  count: number;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${format(date, "EEEE, MMMM d")}${count > 0 ? `, ${count} appointment${count === 1 ? "" : "s"}` : ""}`}
      aria-pressed={isSelected}
      className={cn(
        // Square cell; aspect-square keeps the grid tidy across phone widths.
        "aspect-square flex flex-col items-center justify-between py-1 rounded-md transition-colors",
        // Touch target: aspect-square on a 7-col grid inside px-2.5 keeps cells ≥40px wide on iPhone SE.
        "border border-transparent",
        // Tone by selection / today / month.
        isSelected
          ? "bg-[#0A4DFF]/20 border-[#0A4DFF]/50 text-white"
          : isToday
            ? "bg-white/[0.04] border-white/10 text-white"
            : inMonth
              ? "bg-sidebar/40 hover:bg-sidebar/60 text-white/85"
              : "bg-transparent text-white/30",
        // Tap feedback
        "active:bg-[#0A4DFF]/30",
      )}
    >
      <span
        className={cn(
          "text-[11px] font-black leading-none",
          isToday && !isSelected && "text-[#0A4DFF]",
        )}
      >
        {format(date, "d")}
      </span>
      <DayIndicator count={count} muted={!inMonth} />
    </button>
  );
}

function DayIndicator({ count, muted }: { count: number; muted: boolean }) {
  if (count <= 0) {
    // Reserve vertical space so day numbers align consistently.
    return <span className="block h-[6px]" />;
  }
  if (count <= 3) {
    return (
      <span className="flex items-center gap-[2px] h-[6px]" aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "w-[4px] h-[4px] rounded-full",
              muted ? "bg-white/25" : "bg-[#0A4DFF]",
            )}
          />
        ))}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "text-[8px] font-black leading-none px-1 py-[1px] rounded-sm",
        muted
          ? "bg-white/10 text-white/40"
          : "bg-[#0A4DFF]/30 text-white ring-1 ring-[#0A4DFF]/50",
      )}
      aria-hidden="true"
    >
      {count}
    </span>
  );
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
        <p className="text-[12px] font-black text-white leading-tight mt-0.5">
          {formatJobTime(job.scheduledAt)}
        </p>
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
  const today = useMemo(() => startOfToday(), []);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => startOfMonth(today));
  const [selected, setSelected] = useState<Date>(() => today);

  const { byDayKey, gridStart, gridEnd, loading, error } = useMonthAppointments(visibleMonth);

  // Build the 42-cell (max) grid array. Always 7 columns; row count is
  // determined by gridStart..gridEnd which is whole weeks.
  const cells = useMemo(() => {
    const arr: Date[] = [];
    let cursor = gridStart;
    while (cursor.getTime() <= gridEnd.getTime()) {
      arr.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return arr;
  }, [gridStart, gridEnd]);

  const selectedJobs = byDayKey.get(dayKey(selected)) ?? [];

  const goPrev = () => setVisibleMonth((m) => addMonths(m, -1));
  const goNext = () => setVisibleMonth((m) => addMonths(m, 1));
  const goToday = () => {
    setVisibleMonth(startOfMonth(today));
    setSelected(today);
  };

  return (
    <div className="space-y-3">
      {/* Sticky month header — visible while the day list scrolls. The
          `top` offset matches the FieldModeLayout header height (h-12). */}
      <div className="sticky top-12 z-20 -mx-2.5 px-2.5 py-2 bg-background/95 backdrop-blur-md flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous month"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none">Schedule</p>
          <h1 className="text-sm font-black text-white leading-tight mt-0.5 truncate">
            {format(visibleMonth, "MMMM yyyy")}
          </h1>
        </div>

        <div className="flex items-center gap-1">
          {!isSameMonth(visibleMonth, today) && (
            <button
              type="button"
              onClick={goToday}
              className="h-9 px-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={goNext}
            aria-label="Next month"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday row */}
      <div className="grid grid-cols-7 gap-0.5 px-0.5">
        {WEEKDAYS.map((w, i) => (
          <div
            key={`${w}-${i}`}
            className="text-center text-[9px] font-black uppercase tracking-widest text-white/40 py-0.5"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Month grid (5 or 6 rows depending on month) */}
      <div role="grid" aria-label={`Calendar for ${format(visibleMonth, "MMMM yyyy")}`} className="grid grid-cols-7 gap-0.5 px-0.5">
        {cells.map((d) => {
          const inMonth = isSameMonth(d, visibleMonth);
          const isToday = isSameDay(d, today);
          const isSelected = isSameDay(d, selected);
          const count = byDayKey.get(dayKey(d))?.length ?? 0;
          return (
            <DayCell
              key={d.toISOString()}
              date={d}
              inMonth={inMonth}
              isToday={isToday}
              isSelected={isSelected}
              count={count}
              onTap={() => setSelected(d)}
            />
          );
        })}
      </div>

      {/* Loading / error states stay above the day-detail list so
          users see them in context. */}
      {loading && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-2 flex items-center justify-center min-h-[40px]">
          <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
          <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/40">Loading…</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load month</p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">{error}</p>
          </div>
        </div>
      )}

      {/* Selected-day events */}
      <section aria-label="Selected day" className="space-y-1.5">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-[9px] font-black uppercase tracking-widest text-white/40">
            {isSameDay(selected, today) ? "Today" : format(selected, "EEE, MMM d")}
          </h2>
          <span className="text-[9px] font-black uppercase tracking-widest text-white/30">
            {selectedJobs.length} {selectedJobs.length === 1 ? "job" : "jobs"}
          </span>
        </div>

        {selectedJobs.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-4 text-center">
            <CalendarIcon className="w-4 h-4 text-white/30 mx-auto" />
            <p className="text-[11px] font-bold text-white/70 mt-1">No appointments</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {selectedJobs.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
