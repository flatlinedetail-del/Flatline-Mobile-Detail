import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { startOfMonth, endOfMonth } from "date-fns";
import { db } from "../../firebase";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  BarChart2,
  Clock,
  ExternalLink,
  Monitor as MonitorIcon,
  TrendingUp,
} from "lucide-react";

/**
 * Phone-only Reports view. Rendered at `/reports` when the device is a
 * phone. Subscribes to the `appointments` collection for the current
 * calendar month and surfaces four KPI cards: Revenue, Jobs Completed,
 * Jobs Pending, and Completion Rate.
 *
 * No duplicate store — reads the same `appointments` collection the
 * desktop Reports page uses. Passing `?adminView=1` falls through to the
 * full desktop Reports page with all charts and exports.
 */

interface MonthStats {
  jobsThisMonth: number;
  completedThisMonth: number;
  revenueThisMonth: number;
  pendingCount: number;
}

const COMPLETED_STATUSES = new Set(["completed", "paid"]);
const PENDING_STATUSES = new Set([
  "scheduled",
  "confirmed",
  "en_route",
  "in_progress",
]);

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  iconClass: string;
  iconBgClass: string;
}

function KpiCard({ label, value, icon: Icon, iconClass, iconBgClass }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-3 flex flex-col gap-2 min-h-[80px]">
      <div className={cn("w-7 h-7 rounded-md ring-1 flex items-center justify-center shrink-0", iconBgClass)}>
        <Icon className={cn("w-3.5 h-3.5", iconClass)} />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-bold text-white leading-tight">{value}</p>
        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-tight mt-0.5">
          {label}
        </p>
      </div>
    </div>
  );
}

export default function FieldReports() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<MonthStats>({
    jobsThisMonth: 0,
    completedThisMonth: 0,
    revenueThisMonth: 0,
    pendingCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const start = Timestamp.fromDate(startOfMonth(now));
    const end = Timestamp.fromDate(endOfMonth(now));

    const q = query(
      collection(db, "appointments"),
      where("scheduledAt", ">=", start),
      where("scheduledAt", "<=", end),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        let completedThisMonth = 0;
        let revenueThisMonth = 0;
        let pendingCount = 0;

        snap.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const status = String(data.status ?? "");

          if (COMPLETED_STATUSES.has(status)) {
            completedThisMonth++;
            const amt = typeof data.totalAmount === "number" ? (data.totalAmount as number) : 0;
            revenueThisMonth += amt;
          }
          if (PENDING_STATUSES.has(status)) {
            pendingCount++;
          }
        });

        setStats({
          jobsThisMonth: snap.size,
          completedThisMonth,
          revenueThisMonth,
          pendingCount,
        });
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("[FieldReports] snapshot error", err);
        setError(err?.message || "Failed to load report data");
        setLoading(false);
      },
    );

    return () => unsub();
  }, []);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="px-0.5 flex items-baseline gap-2">
        <h1 className="text-base font-black text-white leading-none">Reports</h1>
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">
          This Month
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-3 flex items-center justify-center min-h-[56px]">
          <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
          <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/40">
            Loading…
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-300 leading-tight">
              Couldn't load report data
            </p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* KPI 2×2 grid */}
      {!loading && !error && (
        <div className="grid grid-cols-2 gap-2">
          <KpiCard
            label="Revenue"
            value={fmtCurrency(stats.revenueThisMonth)}
            icon={TrendingUp}
            iconClass="text-emerald-400"
            iconBgClass="bg-emerald-500/10 ring-emerald-500/25"
          />
          <KpiCard
            label="Completed"
            value={String(stats.completedThisMonth)}
            icon={BarChart2}
            iconClass="text-sky-400"
            iconBgClass="bg-sky-500/10 ring-sky-500/25"
          />
          <KpiCard
            label="Pending"
            value={String(stats.pendingCount)}
            icon={Clock}
            iconClass="text-amber-400"
            iconBgClass="bg-amber-500/10 ring-amber-500/25"
          />
          <KpiCard
            label="Completion Rate"
            value={fmtPct(stats.completedThisMonth, stats.jobsThisMonth)}
            icon={TrendingUp}
            iconClass="text-violet-400"
            iconBgClass="bg-violet-500/10 ring-violet-500/25"
          />
        </div>
      )}

      {/* Bridge card */}
      <button
        type="button"
        onClick={() => navigate("/reports?adminView=1")}
        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-2.5 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-md bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
          <MonitorIcon className="w-4 h-4 text-white/50" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-bold text-white leading-tight">Open Full Admin View</p>
          <p className="text-[10px] text-white/40 leading-tight mt-0.5">
            All charts, exports, and editing tools
          </p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>
    </div>
  );
}
