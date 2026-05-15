import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../hooks/useAuth";
import { cn, formatCurrency, toJsDateOrNull } from "@/lib/utils";
import {
  Activity,
  AlertCircle,
  CalendarDays,
  ChevronRight,
  DollarSign,
  FileText,
  Plus,
  Receipt,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { useTodayAppointments } from "../../hooks/useTodayAppointments";
import { useClientsLive } from "../../hooks/useClientsLive";
import { useMonthAppointments } from "../../hooks/useMonthAppointments";
import {
  formatJobTime,
  statusLabel,
  type FieldJob,
  type FieldJobStatus,
} from "../../services/fieldJob";

/**
 * FieldHome — Premium Field Mode Dashboard
 *
 * Live operational command center. Every KPI card is tappable and
 * navigates to a real filtered operational view.
 *
 * Data sources (all real Firestore, no mock data):
 *   - useTodayAppointments(): live today's jobs (appointments collection)
 *   - useClientsLive(30):      recent clients for risk/VIP signals
 *   - useMonthAppointments():  this month's jobs for monthly revenue KPI
 *   - usePendingInvoices():    recent invoices, filtered in memory for pending count
 *
 * KPI card destinations:
 *   Jobs Today    → /calendar  (today pre-selected by FieldSchedule default)
 *   Revenue       → /invoices  (full billing view)
 *   Active Now    → inline ActiveJobsPanel overlay (in-progress/en-route filter)
 *   Invoices      → /invoices  (unpaid prominently highlighted)
 *   Month Rev     → /invoices  (full billing view)
 *   At Risk       → /protected-clients (risk management screen)
 */

// ─── Pending invoice mini-hook ────────────────────────────────────────────────
// Reads the 50 most recent invoices (same query as FieldInvoices) and counts
// non-paid ones in memory — avoids composite Firestore index requirements.

interface PendingInvoiceSummary {
  pendingCount: number;
  pendingTotal: number;
  ready: boolean;
}

function usePendingInvoices(): PendingInvoiceSummary {
  const [rows, setRows] = useState<{ paymentStatus: string; total: number }[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "invoices"),
      orderBy("createdAt", "desc"),
      limit(50),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: { paymentStatus: string; total: number }[] = [];
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          next.push({
            paymentStatus: String(data.paymentStatus ?? data.status ?? ""),
            total: typeof data.total === "number" ? (data.total as number) : 0,
          });
        });
        setRows(next);
        setReady(true);
      },
      () => setReady(true),
    );
    return () => unsub();
  }, []);

  const pending = rows.filter(
    (r) => !["paid", "voided", "refunded"].includes(r.paymentStatus),
  );

  return {
    pendingCount: pending.length,
    pendingTotal: pending.reduce((s, r) => s + r.total, 0),
    ready,
  };
}

// ─── Trend-based revenue targets hook ────────────────────────────────────────
// Derives forward-looking KPI goals purely from real paid-invoice history.
// No hardcoded values. No settings reads. Trend only.
//
// DAILY GOAL
//   1. Collect all paid invoices from the last 30 calendar days.
//   2. Group revenue by date → count "active business days" (days with > $0 paid).
//   3. Average daily revenue = total / active-day count.
//   4. Daily Goal = average × 1.10 (10 % growth target).
//   If no active days in the last 30 days → null ("No trend yet").
//
// MONTHLY GOAL
//   1. Collect all paid invoices from the last 5 months.
//   2. Group by YYYY-MM, exclude the current (incomplete) month.
//   3. Take the 3 most-recent complete months; average their totals.
//   4. Monthly Goal = average × 1.10.
//   Fallback A — fewer than 3 complete months exist:
//     use whatever complete months are available (1–2) × 1.10.
//   Fallback B — no complete months but current month has revenue:
//     pace current-month revenue to end-of-month × 1.10.
//   Fallback C — no paid revenue at all → null ("No trend yet").
//
// Data source: `invoices` collection, same as usePendingInvoices.
// Query: orderBy("createdAt", "desc") + limit(500) — no composite index.

interface TrendTargets {
  /** null = no paid history available */
  dailyTarget: number | null;
  /** null = no paid history available */
  monthlyTarget: number | null;
  /** Human-readable note shown inside the card */
  dailyMeta: string;
  /** Human-readable note shown inside the card */
  monthlyMeta: string;
  ready: boolean;
}

function useTrendTargets(): TrendTargets {
  const [result, setResult] = useState<TrendTargets>({
    dailyTarget: null,
    monthlyTarget: null,
    dailyMeta: "",
    monthlyMeta: "",
    ready: false,
  });

  useEffect(() => {
    const q = query(
      collection(db, "invoices"),
      orderBy("createdAt", "desc"),
      limit(500),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        interface InvRow { total: number; dateMs: number; status: string; paymentStatus: string }
        const rows: InvRow[] = [];
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const jsDate = toJsDateOrNull(data.createdAt);
          if (!jsDate) return;
          rows.push({
            total: typeof data.total === "number" ? (data.total as number) : 0,
            dateMs: jsDate.getTime(),
            status: String(data.status ?? ""),
            paymentStatus: String(data.paymentStatus ?? ""),
          });
        });

        const isPaid = (r: InvRow) =>
          r.status === "paid" || r.paymentStatus === "paid";

        const now = new Date();
        const nowMs = now.getTime();

        // ── Daily trend ────────────────────────────────────────────────────
        const thirtyDaysAgoMs = nowMs - 30 * 24 * 60 * 60 * 1000;
        const recentPaid = rows.filter((r) => isPaid(r) && r.dateMs >= thirtyDaysAgoMs);

        // Group by YYYY-MM-DD
        const byDay: Record<string, number> = {};
        for (const r of recentPaid) {
          const d = new Date(r.dateMs);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          byDay[key] = (byDay[key] ?? 0) + r.total;
        }
        const activeDayTotals = Object.values(byDay).filter((v) => v > 0);

        let dailyTarget: number | null = null;
        let dailyMeta = "No trend yet";
        if (activeDayTotals.length > 0) {
          const avgDaily =
            activeDayTotals.reduce((s, v) => s + v, 0) / activeDayTotals.length;
          dailyTarget = Math.round(avgDaily * 1.10);
          dailyMeta = `${activeDayTotals.length}-day avg ×1.1`;
        }

        // ── Monthly trend ──────────────────────────────────────────────────
        // Cover last 5 months so we reliably find 3 complete ones.
        const fiveMonthsAgoMs = nowMs - 5 * 31 * 24 * 60 * 60 * 1000;
        const historicalPaid = rows.filter(
          (r) => isPaid(r) && r.dateMs >= fiveMonthsAgoMs,
        );

        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        const byMonth: Record<string, number> = {};
        for (const r of historicalPaid) {
          const d = new Date(r.dateMs);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          byMonth[key] = (byMonth[key] ?? 0) + r.total;
        }

        // Completed months: strictly before current month, most-recent first
        const completedMonths = Object.entries(byMonth)
          .filter(([key]) => key < currentMonthKey)
          .sort(([a], [b]) => b.localeCompare(a))
          .slice(0, 3);

        let monthlyTarget: number | null = null;
        let monthlyMeta = "No trend yet";

        if (completedMonths.length > 0) {
          const avgMonthly =
            completedMonths.reduce((s, [, v]) => s + v, 0) / completedMonths.length;
          monthlyTarget = Math.round(avgMonthly * 1.10);
          monthlyMeta =
            completedMonths.length === 3
              ? "3-mo avg ×1.1"
              : `${completedMonths.length}-mo avg ×1.1`;
        } else {
          // Fallback B: pace current month revenue to end of month
          const currentMonthRev = byMonth[currentMonthKey] ?? 0;
          if (currentMonthRev > 0) {
            const dayOfMonth = now.getDate();
            const daysInMonth = new Date(
              now.getFullYear(),
              now.getMonth() + 1,
              0,
            ).getDate();
            const paced = (currentMonthRev / dayOfMonth) * daysInMonth;
            monthlyTarget = Math.round(paced * 1.10);
            monthlyMeta = "month pace ×1.1";
          }
          // else: target stays null, meta stays "No trend yet"
        }

        setResult({ dailyTarget, monthlyTarget, dailyMeta, monthlyMeta, ready: true });
      },
      // On Firestore error: mark ready, targets remain null
      () => setResult((prev) => ({ ...prev, ready: true })),
    );

    return () => unsub();
  }, []);

  return result;
}

// ─── Tone palette ─────────────────────────────────────────────────────────────

type ToneKey = "primary" | "amber" | "emerald" | "violet" | "rose" | "sky";

const TONE: Record<
  ToneKey,
  { bg: string; ring: string; icon: string; border: string; glow: string; glowPress: string }
> = {
  primary: {
    bg:       "bg-[#0A4DFF]/10",
    ring:     "ring-[#0A4DFF]/25",
    icon:     "text-[#6B8FFF]",
    border:   "border-[#0A4DFF]/20",
    glow:     "shadow-[0_0_18px_rgba(10,77,255,0.10)]",
    glowPress:"shadow-[0_0_28px_rgba(10,77,255,0.28)]",
  },
  amber: {
    bg:       "bg-amber-500/10",
    ring:     "ring-amber-500/25",
    icon:     "text-amber-400",
    border:   "border-amber-500/20",
    glow:     "shadow-[0_0_18px_rgba(245,158,11,0.10)]",
    glowPress:"shadow-[0_0_28px_rgba(245,158,11,0.28)]",
  },
  emerald: {
    bg:       "bg-emerald-500/10",
    ring:     "ring-emerald-500/25",
    icon:     "text-emerald-400",
    border:   "border-emerald-500/20",
    glow:     "shadow-[0_0_18px_rgba(16,185,129,0.10)]",
    glowPress:"shadow-[0_0_28px_rgba(16,185,129,0.28)]",
  },
  violet: {
    bg:       "bg-violet-500/10",
    ring:     "ring-violet-500/25",
    icon:     "text-violet-400",
    border:   "border-violet-500/20",
    glow:     "shadow-[0_0_18px_rgba(139,92,246,0.10)]",
    glowPress:"shadow-[0_0_28px_rgba(139,92,246,0.28)]",
  },
  rose: {
    bg:       "bg-rose-500/10",
    ring:     "ring-rose-500/25",
    icon:     "text-rose-400",
    border:   "border-rose-500/20",
    glow:     "shadow-[0_0_18px_rgba(244,63,94,0.10)]",
    glowPress:"shadow-[0_0_28px_rgba(244,63,94,0.28)]",
  },
  sky: {
    bg:       "bg-sky-500/10",
    ring:     "ring-sky-500/25",
    icon:     "text-sky-400",
    border:   "border-sky-500/20",
    glow:     "shadow-[0_0_18px_rgba(14,165,233,0.10)]",
    glowPress:"shadow-[0_0_28px_rgba(14,165,233,0.28)]",
  },
};

// ─── Status badge helper ──────────────────────────────────────────────────────

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
      return "bg-white/5 text-white/60 ring-white/10";
  }
}

// ─── Interactive KPI Card ─────────────────────────────────────────────────────
// Supports three interaction modes:
//   to        → rendered as a <Link> (most common — simple navigation)
//   onClick   → rendered as a <button> (overlay panels, custom logic)
//   neither   → static display (skeleton / loading states)

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Activity;
  tone: ToneKey;
  skeleton?: boolean;
  /** Navigate to this route on tap */
  to?: string;
  /** Custom tap handler (overrides `to`) */
  onClick?: () => void;
}

function KpiCard({ label, value, sub, icon: Icon, tone, skeleton = false, to, onClick }: KpiCardProps) {
  const t = TONE[tone];
  const interactive = Boolean(to || onClick);

  const inner = (
    <div
      className={cn(
        "shrink-0 w-[118px] rounded-xl p-3 bg-sidebar/70 border ring-1 select-none",
        "transition-all duration-150",
        t.border,
        t.ring,
        t.glow,
        interactive && [
          "cursor-pointer",
          "hover:bg-sidebar/85",
          "active:scale-[0.94]",
          t.glowPress.replace("shadow-[", "active:shadow-["),
          "active:border-opacity-60",
        ],
      )}
    >
      {/* Icon + label row */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <div className={cn("w-6 h-6 rounded-md flex items-center justify-center ring-1", t.bg, t.ring)}>
          <Icon className={cn("w-3.5 h-3.5", t.icon)} />
        </div>
        <span className="text-[8px] font-black uppercase tracking-widest text-white/35 leading-tight flex-1">
          {label}
        </span>
        {interactive && (
          <ChevronRight className="w-2.5 h-2.5 text-white/20 shrink-0" />
        )}
      </div>

      {/* Value */}
      {skeleton ? (
        <div className="h-7 w-10 rounded bg-white/5 animate-pulse" />
      ) : (
        <p className="text-[21px] font-black text-white leading-none tracking-tight">{value}</p>
      )}

      {/* Sub-label */}
      {sub && !skeleton && (
        <p className="text-[9px] text-white/40 font-medium mt-1 leading-tight">{sub}</p>
      )}
    </div>
  );

  if (to && !onClick) {
    return (
      <Link to={to} className="block shrink-0">
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block shrink-0 text-left">
        {inner}
      </button>
    );
  }

  return <div className="shrink-0">{inner}</div>;
}

// ─── Revenue KPI Card (with progress bar + target) ───────────────────────────
// A specialised variant of KpiCard for the two revenue tiles.
// Displays:
//   • The live revenue value (large, bold)
//   • A thin progress bar that fills to actual/target %
//   • "XX% · $X,XXX target" line below the bar
//
// Tone auto-selects based on progress:
//   ≥ 80 %  → emerald  (on target / above)
//   ≥ 50 %  → amber    (behind but recoverable)
//   < 50 %  → rose     (significantly behind)
//
// The card preserves all existing interactive affordances (tap → navigate).

interface RevenueKpiCardProps {
  label: string;
  /** Formatted string shown as the headline value, e.g. "$640" */
  value: string;
  /** Raw numeric actual (used for % calculation) */
  actual: number;
  /**
   * Trend-derived target. null = no history available — card shows
   * "No trend yet" with no progress bar instead of a fake number.
   */
  target: number | null;
  /**
   * Short provenance label shown below the progress bar,
   * e.g. "30-day avg ×1.1" or "month pace ×1.1".
   */
  meta?: string;
  icon: typeof Activity;
  to?: string;
  skeleton?: boolean;
}

function RevenueKpiCard({
  label,
  value,
  actual,
  target,
  meta,
  icon: Icon,
  to,
  skeleton = false,
}: RevenueKpiCardProps) {
  const hasTarget = target !== null && target > 0;
  const pct = hasTarget ? Math.min((actual / target!) * 100, 100) : 0;

  // Dynamic tone: shifts with progress when a target exists; stays primary when no trend.
  const tone: ToneKey = !hasTarget
    ? "primary"
    : pct >= 80
    ? "emerald"
    : pct >= 50
    ? "amber"
    : "rose";
  const t = TONE[tone];

  // Progress bar fill colour
  const barColor =
    pct >= 80 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-rose-400";

  // Percentage text colour
  const pctColor =
    pct >= 80 ? "text-emerald-400/90" : pct >= 50 ? "text-amber-400/90" : "text-rose-400/90";

  const inner = (
    <div
      className={cn(
        "shrink-0 w-[136px] rounded-xl p-3 bg-sidebar/70 border ring-1 transition-all duration-150 select-none",
        t.border,
        t.ring,
        t.glow,
        to && [
          "cursor-pointer",
          "hover:bg-sidebar/85",
          "active:scale-[0.94]",
          t.glowPress.replace("shadow-[", "active:shadow-["),
        ],
      )}
    >
      {/* Icon + label row */}
      <div className="flex items-center gap-1.5 mb-2">
        <div className={cn("w-6 h-6 rounded-md flex items-center justify-center ring-1 shrink-0", t.bg, t.ring)}>
          <Icon className={cn("w-3.5 h-3.5", t.icon)} />
        </div>
        <span className="text-[8px] font-black uppercase tracking-widest text-white/35 leading-tight flex-1 truncate">
          {label}
        </span>
        {to && <ChevronRight className="w-2.5 h-2.5 text-white/20 shrink-0" />}
      </div>

      {/* Headline value */}
      {skeleton ? (
        <div className="h-7 w-12 rounded bg-white/5 animate-pulse" />
      ) : (
        <p className="text-[20px] font-black text-white leading-none tracking-tight truncate">
          {value}
        </p>
      )}

      {/* Bottom section: progress bar OR no-trend message */}
      {!skeleton && (
        <div className="mt-2.5">
          {hasTarget ? (
            <div className="space-y-1.5">
              {/* Track */}
              <div className="h-[3px] w-full rounded-full bg-white/8 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-700 ease-out", barColor)}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {/* Percentage + trend target */}
              <div className="flex items-center justify-between gap-1">
                <span className={cn("text-[9px] font-black leading-none tabular-nums", pctColor)}>
                  {Math.round(pct)}%
                </span>
                <span className="text-[8px] text-white/28 font-medium leading-none truncate">
                  {formatCurrency(target!)} trend
                </span>
              </div>
              {/* Provenance note */}
              {meta && (
                <p className="text-[7px] font-medium text-white/20 leading-none truncate uppercase tracking-wide">
                  {meta}
                </p>
              )}
            </div>
          ) : (
            /* No trend yet */
            <p className="text-[9px] text-white/28 font-medium leading-tight">
              No trend yet
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block shrink-0">
        {inner}
      </Link>
    );
  }
  return <div className="shrink-0">{inner}</div>;
}

// ─── Active Jobs Overlay Panel ────────────────────────────────────────────────
// Slide-up overlay showing in_progress/en_route jobs only.
// Invoked when the "Active Now" KPI card is tapped.

function ActiveJobsPanel({
  jobs,
  onClose,
}: {
  jobs: FieldJob[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      aria-modal="true"
      role="dialog"
      aria-label="Active jobs"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          "relative w-full max-w-md z-10",
          "bg-[#0d0d14] border-t border-amber-500/25 rounded-t-2xl",
          "shadow-[0_-6px_40px_rgba(245,158,11,0.13)]",
          "pb-[max(env(safe-area-inset-bottom),1rem)]",
          "animate-in slide-in-from-bottom-2 duration-200",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            {/* Pull handle */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-white/15" />
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/25 flex items-center justify-center shrink-0">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div>
              <p className="text-[13px] font-black text-white leading-none">Active Now</p>
              <p className="text-[9px] font-bold text-white/35 uppercase tracking-widest leading-none mt-0.5">
                {jobs.length > 0
                  ? `${jobs.length} job${jobs.length > 1 ? "s" : ""} in progress`
                  : "Live operations"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/5 ring-1 ring-white/8 flex items-center justify-center text-white/50 hover:text-white/80 transition-colors"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-3 pt-3 pb-1 max-h-[60vh] overflow-y-auto scrollbar-none space-y-1.5">
          {jobs.length === 0 ? (
            /* Premium empty state */
            <div className="py-8 flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/[0.07] ring-1 ring-amber-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-400/50" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-white/50 leading-tight">No active jobs running</p>
                <p className="text-[10px] text-white/30 font-medium leading-tight mt-1">
                  Jobs in progress or en route will appear here
                </p>
              </div>
              <Link
                to="/field/book-job"
                onClick={onClose}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors",
                  "bg-[#0A4DFF]/15 ring-1 ring-[#0A4DFF]/25 text-[#6B8FFF] hover:bg-[#0A4DFF]/25",
                )}
              >
                <Plus className="w-3.5 h-3.5" />
                Book a Job
              </Link>
            </div>
          ) : (
            jobs.map((job) => (
              <Link
                key={job.id}
                to={`/field/job/${job.id}`}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 w-full rounded-xl border transition-colors",
                  "px-3 py-3 min-h-[64px]",
                  "border-amber-500/20 bg-amber-500/[0.06] hover:bg-amber-500/10",
                  "shadow-[0_0_12px_rgba(245,158,11,0.07)]",
                )}
              >
                {/* Pulse indicator */}
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-white truncate leading-tight">
                    {job.clientName}
                  </p>
                  <p className="text-[10px] text-white/45 font-medium leading-tight mt-0.5 truncate">
                    {formatJobTime(job.scheduledAt)}
                    {job.serviceNames.length > 0 ? ` · ${job.serviceNames[0]}` : ""}
                    {job.vehicleInfo ? ` · ${job.vehicleInfo}` : ""}
                  </p>
                  <span
                    className={cn(
                      "inline-block mt-1 text-[8px] font-black uppercase tracking-widest",
                      "px-1.5 py-0.5 rounded ring-1 leading-none",
                      statusToneClass(job.status),
                    )}
                  >
                    {statusLabel(job.status)}
                  </span>
                </div>

                {/* Amount + arrow */}
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <p className="text-[12px] font-black text-amber-300/80">
                    {formatCurrency(job.totalAmount)}
                  </p>
                  <ChevronRight className="w-3.5 h-3.5 text-amber-400/40" />
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Footer CTA — only when jobs exist */}
        {jobs.length > 0 && (
          <div className="px-3 pt-3 pb-2 border-t border-white/[0.06] mt-1">
            <Link
              to="/calendar"
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-white/5 ring-1 ring-white/8 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white/75 hover:bg-white/8 transition-colors"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Full Schedule
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Action module tile ───────────────────────────────────────────────────────

function ActionModule({
  title,
  subtitle,
  icon: Icon,
  tone,
  to,
  comingSoon = false,
}: {
  title: string;
  subtitle?: string;
  icon: typeof Activity;
  tone: ToneKey;
  to?: string;
  comingSoon?: boolean;
}) {
  const t = TONE[tone];

  const inner = (
    <div
      className={cn(
        "rounded-xl p-3 bg-sidebar/60 border ring-1 transition-all min-h-[84px]",
        "flex flex-col gap-2 select-none",
        t.border,
        t.ring,
        !comingSoon && t.glow,
        !comingSoon && "hover:bg-sidebar/80 active:scale-[0.96]",
        comingSoon && "opacity-40",
      )}
    >
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center ring-1", t.bg, t.ring)}>
        <Icon className={cn("w-[18px] h-[18px]", t.icon)} />
      </div>
      <div className="flex-1">
        <p className="text-[12px] font-bold text-white leading-tight">{title}</p>
        {subtitle && (
          <p className="text-[9px] text-white/40 font-medium leading-tight mt-0.5">{subtitle}</p>
        )}
        {comingSoon && (
          <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mt-0.5">Soon</p>
        )}
      </div>
    </div>
  );

  if (to && !comingSoon) {
    return <Link to={to}>{inner}</Link>;
  }
  return <div>{inner}</div>;
}

// ─── Individual job row ───────────────────────────────────────────────────────

function JobRow({ job }: { job: FieldJob }) {
  const isActive = job.status === "in_progress" || job.status === "en_route";
  return (
    <Link
      to={`/field/job/${job.id}`}
      className={cn(
        "flex items-center gap-2.5 w-full rounded-xl border transition-all",
        "px-3 py-2.5 min-h-[60px] select-none active:scale-[0.98]",
        isActive
          ? "border-amber-500/20 bg-amber-500/[0.06] hover:bg-amber-500/10"
          : "border-white/5 bg-sidebar/60 hover:bg-sidebar/80",
      )}
    >
      {/* Time */}
      <div className="shrink-0 w-12 text-center border-r border-white/[0.06] pr-2.5">
        <p className="text-[8px] font-black uppercase tracking-widest text-white/25 leading-none">Time</p>
        <p className="text-[12px] font-black text-white leading-tight mt-0.5">
          {formatJobTime(job.scheduledAt)}
        </p>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-white truncate leading-tight">{job.clientName}</p>
        <p className="text-[10px] text-white/40 font-medium truncate leading-tight mt-0.5">
          {job.vehicleInfo || "Vehicle TBD"}
          {job.serviceNames.length > 0 ? ` · ${job.serviceNames[0]}` : ""}
          {job.serviceNames.length > 1 ? ` +${job.serviceNames.length - 1}` : ""}
        </p>
        <span
          className={cn(
            "inline-block mt-1 text-[8px] font-black uppercase tracking-widest",
            "px-1.5 py-0.5 rounded ring-1 leading-none",
            statusToneClass(job.status),
          )}
        >
          {statusLabel(job.status)}
        </span>
      </div>

      {/* Amount + arrow */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <p className="text-[11px] font-black text-white/75">{formatCurrency(job.totalAmount)}</p>
        <ChevronRight className="w-3.5 h-3.5 text-white/25" />
      </div>
    </Link>
  );
}

// ─── Empty operations state ───────────────────────────────────────────────────

function NoJobsCard() {
  return (
    <div className="rounded-xl border border-white/5 bg-sidebar/40 p-5 text-center">
      <div className="w-10 h-10 rounded-full bg-white/[0.04] ring-1 ring-white/8 flex items-center justify-center mx-auto mb-3">
        <CalendarDays className="w-5 h-5 text-white/20" />
      </div>
      <p className="text-[12px] font-bold text-white/55 leading-tight">No jobs scheduled today</p>
      <p className="text-[10px] text-white/30 font-medium mt-1 leading-tight">
        Start building your day
      </p>
      <div className="flex gap-2 mt-3 justify-center flex-wrap">
        <Link
          to="/field/book-job"
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors",
            "bg-[#0A4DFF]/15 ring-1 ring-[#0A4DFF]/25 text-[#6B8FFF] hover:bg-[#0A4DFF]/25",
          )}
        >
          <Plus className="w-3 h-3" />
          Book Job
        </Link>
        <Link
          to="/calendar"
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors",
            "bg-white/[0.04] ring-1 ring-white/8 text-white/45 hover:bg-white/[0.07]",
          )}
        >
          <CalendarDays className="w-3 h-3" />
          Schedule
        </Link>
        <Link
          to="/leads"
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors",
            "bg-amber-500/10 ring-1 ring-amber-500/20 text-amber-400 hover:bg-amber-500/15",
          )}
        >
          <UserPlus className="w-3 h-3" />
          Leads
        </Link>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/** Which overlay panel is currently open. null = none. */
type ActivePanel = "active-jobs" | null;

export default function FieldHome() {
  const { profile } = useAuth();
  const firstName = profile?.displayName?.split(" ")[0] || "Detailer";

  // Panel state
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const closePanel = () => setActivePanel(null);

  // Stable "now" for the month hook — only needs to be current month at mount
  const now = useMemo(() => new Date(), []);

  // Live Firestore data
  const { jobs: todayJobs, loading: jobsLoading } = useTodayAppointments();
  const { clients } = useClientsLive(30);
  const { jobs: monthJobs } = useMonthAppointments(now);
  const { pendingCount, pendingTotal } = usePendingInvoices();
  const { dailyTarget, monthlyTarget, dailyMeta, monthlyMeta } = useTrendTargets();

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const activeJobs = useMemo(
    () => todayJobs.filter((j) => j.status === "in_progress" || j.status === "en_route"),
    [todayJobs],
  );

  const todayRevenue = useMemo(
    () => todayJobs.reduce((sum, j) => sum + j.totalAmount, 0),
    [todayJobs],
  );

  const monthRevenue = useMemo(
    () =>
      monthJobs
        .filter((j) => j.paymentStatus === "paid" || j.status === "paid" || j.status === "completed")
        .reduce((sum, j) => sum + j.totalAmount, 0),
    [monthJobs],
  );

  const atRiskCount = useMemo(
    () => clients.filter((c) => c.riskLevel === "high" || c.riskLevel === "medium").length,
    [clients],
  );

  const unpaidTodayCount = useMemo(
    () =>
      todayJobs.filter((j) => j.paymentStatus !== "paid" && j.status !== "canceled").length,
    [todayJobs],
  );

  // The "hero" active job for the banner — in_progress/en_route first,
  // then the next confirmed/scheduled job as a preview.
  const heroJob = useMemo(
    () =>
      activeJobs[0] ||
      todayJobs.find((j) => j.status === "confirmed" || j.status === "scheduled"),
    [activeJobs, todayJobs],
  );

  // ── Greeting ──────────────────────────────────────────────────────────────
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return "Good morning";
    if (h >= 12 && h < 17) return "Good afternoon";
    if (h >= 17 && h < 22) return "Good evening";
    return "Hey";
  }, []);

  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
    [],
  );

  // ── Intelligence signals (real data only) ─────────────────────────────────
  const signals = useMemo(() => {
    const s: string[] = [];
    if (activeJobs.length > 0) {
      s.push(
        `${activeJobs.length} job${activeJobs.length > 1 ? "s" : ""} currently in progress`,
      );
    }
    if (pendingCount > 0) {
      s.push(
        `${pendingCount} invoice${pendingCount > 1 ? "s" : ""} pending — ${formatCurrency(pendingTotal)} outstanding`,
      );
    }
    const todayHighRisk = todayJobs.filter((j) => {
      const client = clients.find((c) => c.id === j.clientId);
      return client?.riskLevel === "high";
    });
    if (todayHighRisk.length > 0) {
      s.push(
        `High-risk client booked at ${formatJobTime(todayHighRisk[0].scheduledAt)} — review before job`,
      );
    }
    if (todayJobs.length > 0 && unpaidTodayCount === 0) {
      s.push("All today's jobs are marked paid");
    } else if (unpaidTodayCount > 0 && todayJobs.length > 0) {
      s.push(
        `${unpaidTodayCount} job${unpaidTodayCount > 1 ? "s" : ""} today with unpaid balance`,
      );
    }
    return s.slice(0, 4);
  }, [activeJobs, pendingCount, pendingTotal, clients, todayJobs, unpaidTodayCount]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-4 pb-2">

        {/* ── Section 1: Header ── */}
        <div className="flex items-center justify-between px-0.5">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 leading-none mb-0.5">
              {dateLabel}
            </p>
            <h1 className="text-[18px] font-black text-white leading-tight">
              {greeting}, {firstName}
            </h1>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/25">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400">Live</span>
          </div>
        </div>

        {/* ── Section 2: KPI Cards (horizontal scroll) ── */}
        {/*
          Each KPI card is now fully interactive:
            Jobs Today  → /calendar  (today auto-selected in FieldSchedule)
            Revenue     → /invoices  (full billing view)
            Active Now  → ActiveJobsPanel overlay (in-progress/en-route filter)
            Invoices    → /invoices  (unpaid entries highlighted)
            Month Rev   → /invoices
            At Risk     → /protected-clients
        */}
        <div className="-mx-2.5 px-2.5 overflow-x-auto scrollbar-none">
          <div className="flex gap-2 w-max pb-0.5">

            {/* Jobs Today → /calendar */}
            <KpiCard
              label="Jobs Today"
              value={jobsLoading ? "—" : todayJobs.length}
              sub={activeJobs.length > 0 ? `${activeJobs.length} active` : "on schedule"}
              icon={CalendarDays}
              tone="primary"
              skeleton={jobsLoading}
              to="/calendar"
            />

            {/* Revenue → /invoices (trend-based daily target) */}
            <RevenueKpiCard
              label="Today Revenue"
              value={formatCurrency(todayRevenue)}
              actual={todayRevenue}
              target={dailyTarget}
              meta={dailyMeta}
              icon={DollarSign}
              skeleton={jobsLoading}
              to="/invoices"
            />

            {/* Active Now → ActiveJobsPanel overlay */}
            <KpiCard
              label="Active Now"
              value={activeJobs.length}
              sub={activeJobs.length > 0 ? "in progress" : "none running"}
              icon={Activity}
              tone="amber"
              onClick={() => setActivePanel("active-jobs")}
            />

            {/* Invoices → /invoices */}
            <KpiCard
              label="Invoices"
              value={pendingCount > 0 ? pendingCount : "—"}
              sub={pendingCount > 0 ? formatCurrency(pendingTotal) : "all clear"}
              icon={Receipt}
              tone={pendingCount > 2 ? "rose" : "emerald"}
              to="/invoices"
            />

            {/* Month Revenue → /invoices (trend-based monthly target) */}
            <RevenueKpiCard
              label="Month Revenue"
              value={formatCurrency(monthRevenue)}
              actual={monthRevenue}
              target={monthlyTarget}
              meta={monthlyMeta}
              icon={TrendingUp}
              to="/invoices"
            />

            {/* At Risk → /protected-clients (only shown when clients are flagged) */}
            {atRiskCount > 0 && (
              <KpiCard
                label="At Risk"
                value={atRiskCount}
                sub="clients flagged"
                icon={ShieldAlert}
                tone="rose"
                to="/protected-clients"
              />
            )}

          </div>
        </div>

        {/* ── Section 3: Today's Operations ── */}
        <section aria-label="Today's Operations" className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-[9px] font-black uppercase tracking-widest text-white/40">
              Today's Operations
            </h2>
            <Link
              to="/calendar"
              className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white/55 transition-colors"
            >
              Full Schedule →
            </Link>
          </div>

          {jobsLoading ? (
            <div className="space-y-1.5">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/5 bg-sidebar/40 h-[60px] animate-pulse"
                />
              ))}
            </div>
          ) : todayJobs.length === 0 ? (
            <NoJobsCard />
          ) : (
            <div className="space-y-1.5">
              {/* Active job highlight banner */}
              {heroJob && (heroJob.status === "in_progress" || heroJob.status === "en_route") && (
                <Link
                  to={`/field/job/${heroJob.id}`}
                  className={cn(
                    "block rounded-xl border px-3 py-3 ring-1 transition-all select-none",
                    "border-amber-500/25 bg-amber-500/[0.07] ring-amber-500/15",
                    "hover:bg-amber-500/10 active:scale-[0.98]",
                    "shadow-[0_0_20px_rgba(245,158,11,0.08)]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-amber-400">
                      Active Now
                    </span>
                  </div>
                  <p className="text-[13px] font-bold text-white mt-1 leading-tight">
                    {heroJob.clientName}
                  </p>
                  <p className="text-[10px] text-white/50 font-medium leading-tight">
                    {formatJobTime(heroJob.scheduledAt)}
                    {heroJob.serviceNames.length > 0 ? ` · ${heroJob.serviceNames[0]}` : ""}
                    {" · "}
                    {statusLabel(heroJob.status)}
                  </p>
                </Link>
              )}

              {/* Full job list */}
              {todayJobs.map((j) => (
                <JobRow key={j.id} job={j} />
              ))}
            </div>
          )}
        </section>

        {/* ── Section 4: Quick Launch ── */}
        <section aria-label="Quick Launch" className="space-y-2">
          <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40">
            Quick Launch
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <ActionModule
              title="Book Job"
              subtitle="New appointment"
              icon={Plus}
              tone="primary"
              to="/field/book-job"
            />
            <ActionModule
              title="Invoices"
              subtitle="Billing & payments"
              icon={Receipt}
              tone="emerald"
              to="/invoices"
            />
            <ActionModule
              title="Schedule"
              subtitle="Calendar view"
              icon={CalendarDays}
              tone="sky"
              to="/calendar"
            />
            <ActionModule
              title="Leads"
              subtitle="Pipeline"
              icon={UserPlus}
              tone="amber"
              to="/leads"
            />
            <ActionModule
              title="Quotes"
              subtitle="Estimates"
              icon={FileText}
              tone="violet"
              to="/quotes"
            />
            <ActionModule
              title="AI Assist"
              subtitle="Coming soon"
              icon={Sparkles}
              tone="violet"
              comingSoon
            />
          </div>
        </section>

        {/* ── Section 5: Intelligence signals ── */}
        {signals.length > 0 && (
          <section aria-label="Intelligence" className="space-y-2">
            <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40">
              Intelligence
            </h2>
            <div
              className={cn(
                "rounded-xl border border-violet-500/15 bg-violet-950/25 ring-1 ring-violet-500/10",
                "p-3 space-y-2.5 shadow-[0_0_20px_rgba(139,92,246,0.07)]",
              )}
            >
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[8px] font-black uppercase tracking-widest text-violet-400">
                  Operational Signals
                </span>
              </div>
              {signals.map((sig, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-violet-400/50 mt-1.5 shrink-0" />
                  <p className="text-[11px] text-white/60 font-medium leading-snug">{sig}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Overlay Panels ── */}
      {activePanel === "active-jobs" && (
        <ActiveJobsPanel jobs={activeJobs} onClose={closePanel} />
      )}
    </>
  );
}
