import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Calendar as CalendarIcon,
  PlayCircle,
  Phone,
  CheckSquare,
  Car,
  Camera,
  Receipt,
  Sparkles,
  ChevronRight,
  AlertCircle,
  Plus,
  UserPlus,
  FileText,
} from "lucide-react";
import { useTodayAppointments } from "../../hooks/useTodayAppointments";
import { formatJobTime, statusLabel, type FieldJob, type FieldJobStatus } from "../../services/fieldJob";

/**
 * Phone Field Mode home — compact layout.
 *
 * Live data is unchanged from Phase 2 (subscribes to the same
 * `appointments` collection used by Dashboard/Calendar — no
 * duplicate store). This pass tightens spacing, typography, and
 * card density so it feels like a native phone app rather than a
 * shrunken desktop layout.
 *
 * Tablet/desktop still see the existing Dashboard at "/".
 */

type ToneKey = "primary" | "amber" | "emerald" | "violet" | "rose" | "sky";

const TONE: Record<ToneKey, { bg: string; ring: string; icon: string }> = {
  primary: { bg: "bg-[#0A4DFF]/10", ring: "ring-[#0A4DFF]/30", icon: "text-[#0A4DFF]" },
  amber:   { bg: "bg-amber-500/10",  ring: "ring-amber-500/30",  icon: "text-amber-400" },
  emerald: { bg: "bg-emerald-500/10",ring: "ring-emerald-500/30",icon: "text-emerald-400" },
  violet:  { bg: "bg-violet-500/10", ring: "ring-violet-500/30", icon: "text-violet-400" },
  rose:    { bg: "bg-rose-500/10",   ring: "ring-rose-500/30",   icon: "text-rose-400" },
  sky:     { bg: "bg-sky-500/10",    ring: "ring-sky-500/30",    icon: "text-sky-400" },
};

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

/** Compact tap target shared by quick actions + placeholder tiles. */
function Tile({
  title,
  subtitle,
  icon: Icon,
  tone,
  to,
  href,
  external,
  comingSoon,
}: {
  title: string;
  subtitle?: string;
  icon: typeof CalendarIcon;
  tone: ToneKey;
  to?: string;
  href?: string;
  external?: boolean;
  comingSoon?: boolean;
}) {
  const t = TONE[tone];
  const inner = (
    <>
      <div className={cn("shrink-0 w-8 h-8 rounded-lg ring-1 flex items-center justify-center", t.bg, t.ring)}>
        <Icon className={cn("w-4 h-4", t.icon)} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[12px] font-bold text-white truncate leading-tight">{title}</p>
        {subtitle && <p className="text-[10px] text-white/45 font-medium truncate leading-tight mt-0.5">{subtitle}</p>}
      </div>
      {comingSoon ? (
        <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Soon</span>
      ) : (
        <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />
      )}
    </>
  );

  const className = cn(
    "w-full rounded-xl border border-white/5 bg-sidebar/60 hover:bg-sidebar/80 active:bg-sidebar transition-colors",
    "px-2.5 py-2 min-h-[48px] flex items-center gap-2.5",
    comingSoon && "opacity-50",
  );

  if (href && !comingSoon) {
    return (
      <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className={className}>
        {inner}
      </a>
    );
  }
  if (to && !comingSoon) {
    return (
      <Link to={to} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" disabled={comingSoon} className={className}>
      {inner}
    </button>
  );
}

function JobRow({ job }: { job: FieldJob }) {
  return (
    <Link
      to={`/field/job/${job.id}`}
      className={cn(
        "flex items-center gap-2.5 w-full rounded-xl border border-white/5 bg-sidebar/60",
        "hover:bg-sidebar/80 active:bg-sidebar transition-colors px-2.5 py-2 min-h-[56px]",
      )}
    >
      <div className="shrink-0 w-11 text-center">
        <p className="text-[8px] font-black uppercase tracking-widest text-white/35 leading-none">Time</p>
        <p className="text-[12px] font-black text-white leading-tight mt-0.5">{formatJobTime(job.scheduledAt)}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-white truncate leading-tight">{job.clientName}</p>
        <p className="text-[10px] text-white/45 font-medium truncate leading-tight mt-0.5">
          {job.vehicleInfo || "Vehicle TBD"}
          {job.serviceNames.length > 0 ? ` · ${job.serviceNames.join(", ")}` : ""}
        </p>
        <span
          className={cn(
            "inline-block mt-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none",
            statusToneClass(job.status),
          )}
        >
          {statusLabel(job.status)}
        </span>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />
    </Link>
  );
}

function TodayJobs() {
  const { jobs, loading, error } = useTodayAppointments();

  if (loading) {
    return (
      <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-3 flex items-center justify-center min-h-[56px]">
        <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
        <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/40">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load today's jobs</p>
          <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">{error}</p>
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-4 text-center">
        <CalendarIcon className="w-5 h-5 text-white/30 mx-auto" />
        <p className="text-[11px] font-bold text-white/70 mt-1.5">No jobs scheduled today</p>
        <Link
          to="/calendar"
          className="inline-block mt-1.5 text-[9px] font-black uppercase tracking-widest text-[#0A4DFF]"
        >
          Open Schedule
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {jobs.map((j) => (
        <JobRow key={j.id} job={j} />
      ))}
    </div>
  );
}

export default function FieldHome() {
  const { profile } = useAuth();
  const firstName = profile?.displayName?.split(" ")[0] || "Detailer";
  const { jobs } = useTodayAppointments();

  // "Active" = the first job that's currently in_progress or en_route,
  // else the next scheduled/confirmed job, else the first today's job.
  const activeJob =
    jobs.find((j) => j.status === "in_progress") ||
    jobs.find((j) => j.status === "en_route") ||
    jobs.find((j) => j.status === "confirmed" || j.status === "scheduled") ||
    jobs[0];

  return (
    <div className="space-y-3">
      {/* Compact greeting — one line */}
      <div className="px-0.5 flex items-baseline gap-2">
        <h1 className="text-base font-black text-white leading-none">Hey {firstName}</h1>
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Field Mode</span>
      </div>

      {/* Today's jobs (live) */}
      <section aria-label="Today" className="space-y-1.5">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-[9px] font-black uppercase tracking-widest text-white/40">Today's Jobs</h2>
          <Link to="/calendar" className="text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white/70">
            All
          </Link>
        </div>
        <TodayJobs />
      </section>

      {/* Active job shortcut */}
      {activeJob && (
        <section aria-label="Active Job" className="space-y-1.5">
          <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40">Active Job</h2>
          <Tile
            title={activeJob.clientName}
            subtitle={`${formatJobTime(activeJob.scheduledAt)} · ${statusLabel(activeJob.status)}`}
            icon={PlayCircle}
            tone="amber"
            to={`/field/job/${activeJob.id}`}
          />
        </section>
      )}

      {/* Quick actions — only render when there's an active job with a phone. The
          maps-provider tile was removed pending the backend default-provider decision. */}
      {activeJob?.telUrl && (
        <section aria-label="Quick Actions" className="space-y-1.5">
          <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40">Quick Actions</h2>
          <div className="grid grid-cols-1 gap-1.5">
            <Tile
              title="Call"
              subtitle={activeJob.phone}
              icon={Phone}
              tone="emerald"
              href={activeJob.telUrl}
            />
          </div>
        </section>
      )}

      {/* Tools — compact 2-col grid with placeholders collapsed */}
      <section aria-label="Tools" className="space-y-1.5">
        <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40">Tools</h2>
        <div className="grid grid-cols-2 gap-1.5">
          <Tile title="Book Job" icon={Plus} tone="primary" to="/field/book-job" />
          <Tile title="Invoices" icon={Receipt} tone="emerald" to="/invoices" />
          <Tile title="Schedule" icon={CalendarIcon} tone="primary" to="/calendar" />
          <Tile title="Leads" icon={UserPlus} tone="amber" to="/leads" />
          <Tile title="Quotes" icon={FileText} tone="sky" to="/quotes" />
          <Tile title="Vehicle Info" icon={Car} tone="primary" comingSoon />
          <Tile title="Checklist" icon={CheckSquare} tone="emerald" comingSoon />
          <Tile title="Photos" icon={Camera} tone="rose" comingSoon />
          <Tile title="AI Assist" icon={Sparkles} tone="violet" comingSoon />
        </div>
      </section>
    </div>
  );
}
