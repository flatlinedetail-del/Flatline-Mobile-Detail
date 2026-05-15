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
import { cn, formatCurrency } from "@/lib/utils";
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
 * A live operational command center for field technicians.
 *
 * Data sources (all real Firestore, no mock data):
 *   - useTodayAppointments(): live today's jobs (appointments collection)
 *   - useClientsLive(30):      recent clients for risk/VIP signals
 *   - useMonthAppointments():  this month's jobs for monthly revenue KPI
 *   - usePendingInvoices():    recent invoices, filtered in memory for pending count
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

// ─── Tone palette ─────────────────────────────────────────────────────────────

type ToneKey = "primary" | "amber" | "emerald" | "violet" | "rose" | "sky";

const TONE: Record<
  ToneKey,
  { bg: string; ring: string; icon: string; border: string; glow: string }
> = {
  primary: {
    bg:     "bg-[#0A4DFF]/10",
    ring:   "ring-[#0A4DFF]/25",
    icon:   "text-[#6B8FFF]",
    border: "border-[#0A4DFF]/20",
    glow:   "shadow-[0_0_18px_rgba(10,77,255,0.10)]",
  },
  amber: {
    bg:     "bg-amber-500/10",
    ring:   "ring-amber-500/25",
    icon:   "text-amber-400",
    border: "border-amber-500/20",
    glow:   "shadow-[0_0_18px_rgba(245,158,11,0.10)]",
  },
  emerald: {
    bg:     "bg-emerald-500/10",
    ring:   "ring-emerald-500/25",
    icon:   "text-emerald-400",
    border: "border-emerald-500/20",
    glow:   "shadow-[0_0_18px_rgba(16,185,129,0.10)]",
  },
  violet: {
    bg:     "bg-violet-500/10",
    ring:   "ring-violet-500/25",
    icon:   "text-violet-400",
    border: "border-violet-500/20",
    glow:   "shadow-[0_0_18px_rgba(139,92,246,0.10)]",
  },
  rose: {
    bg:     "bg-rose-500/10",
    ring:   "ring-rose-500/25",
    icon:   "text-rose-400",
    border: "border-rose-500/20",
    glow:   "shadow-[0_0_18px_rgba(244,63,94,0.10)]",
  },
  sky: {
    bg:     "bg-sky-500/10",
    ring:   "ring-sky-500/25",
    icon:   "text-sky-400",
    border: "border-sky-500/20",
    glow:   "shadow-[0_0_18px_rgba(14,165,233,0.10)]",
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

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  skeleton = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Activity;
  tone: ToneKey;
  skeleton?: boolean;
}) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        "shrink-0 w-[118px] rounded-xl p-3 bg-sidebar/70 border ring-1",
        t.border,
        t.ring,
        t.glow,
      )}
    >
      <div className="flex items-center gap-1.5 mb-2.5">
        <div className={cn("w-6 h-6 rounded-md flex items-center justify-center ring-1", t.bg, t.ring)}>
          <Icon className={cn("w-3.5 h-3.5", t.icon)} />
        </div>
        <span className="text-[8px] font-black uppercase tracking-widest text-white/35 leading-tight">
          {label}
        </span>
      </div>
      {skeleton ? (
        <div className="h-7 w-10 rounded bg-white/5 animate-pulse" />
      ) : (
        <p className="text-[21px] font-black text-white leading-none tracking-tight">{value}</p>
      )}
      {sub && !skeleton && (
        <p className="text-[9px] text-white/40 font-medium mt-1 leading-tight">{sub}</p>
      )}
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
        "flex flex-col gap-2",
        t.border,
        t.ring,
        !comingSoon && t.glow,
        !comingSoon && "hover:bg-sidebar/80 active:scale-[0.97]",
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
        "flex items-center gap-2.5 w-full rounded-xl border transition-colors",
        "px-3 py-2.5 min-h-[60px]",
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

export default function FieldHome() {
  const { profile } = useAuth();
  const firstName = profile?.displayName?.split(" ")[0] || "Detailer";

  // Stable "now" for the month hook — only needs to be current month at mount
  const now = useMemo(() => new Date(), []);

  // Live Firestore data
  const { jobs: todayJobs, loading: jobsLoading } = useTodayAppointments();
  const { clients } = useClientsLive(30);
  const { jobs: monthJobs } = useMonthAppointments(now);
  const { pendingCount, pendingTotal } = usePendingInvoices();

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
      <div className="-mx-2.5 px-2.5 overflow-x-auto scrollbar-none">
        <div className="flex gap-2 w-max pb-0.5">
          <KpiCard
            label="Jobs Today"
            value={jobsLoading ? "—" : todayJobs.length}
            sub={activeJobs.length > 0 ? `${activeJobs.length} active` : "on schedule"}
            icon={CalendarDays}
            tone="primary"
            skeleton={jobsLoading}
          />
          <KpiCard
            label="Revenue"
            value={todayRevenue > 0 ? formatCurrency(todayRevenue) : "—"}
            sub="today's total"
            icon={DollarSign}
            tone="emerald"
            skeleton={jobsLoading}
          />
          <KpiCard
            label="Active Now"
            value={activeJobs.length}
            sub={activeJobs.length > 0 ? "in progress" : "none running"}
            icon={Activity}
            tone="amber"
          />
          <KpiCard
            label="Invoices"
            value={pendingCount > 0 ? pendingCount : "—"}
            sub={pendingCount > 0 ? formatCurrency(pendingTotal) : "all clear"}
            icon={Receipt}
            tone={pendingCount > 2 ? "rose" : "emerald"}
          />
          <KpiCard
            label="Month Rev"
            value={monthRevenue > 0 ? formatCurrency(monthRevenue) : "—"}
            sub="paid this month"
            icon={TrendingUp}
            tone="violet"
          />
          {atRiskCount > 0 && (
            <KpiCard
              label="At Risk"
              value={atRiskCount}
              sub="clients flagged"
              icon={ShieldAlert}
              tone="rose"
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
                  "block rounded-xl border px-3 py-3 ring-1 transition-colors",
                  "border-amber-500/25 bg-amber-500/[0.07] ring-amber-500/15",
                  "hover:bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.08)]",
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
  );
}
