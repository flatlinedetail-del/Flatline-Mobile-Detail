import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../../firebase";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  TrendingUp,
  UserPlus,
  Zap,
} from "lucide-react";
import { differenceInDays } from "date-fns";

/**
 * Phone-only Leads view — intelligence-first rebuild.
 * Lead score, estimated revenue, conversion probability, urgency,
 * last contact timing, pipeline stage, and grouped action rows.
 */

interface FieldLeadRow {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  source?: string;
  status: string;
  priority?: string;
  leadScore?: number;
  estimatedRevenue?: number;
  conversionProbability?: number;
  lastContactAtMs?: number;
  pipelineStage?: string;
  createdAtMs: number;
}

// ─── Tone helpers ─────────────────────────────────────────────────────────────

function leadScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-300";
  if (score >= 60) return "text-sky-300";
  if (score >= 40) return "text-amber-300";
  return "text-rose-300";
}

function leadScoreBg(score: number): string {
  if (score >= 80) return "bg-emerald-500/15 ring-emerald-500/30";
  if (score >= 60) return "bg-sky-500/15 ring-sky-500/30";
  if (score >= 40) return "bg-amber-500/15 ring-amber-500/30";
  return "bg-rose-500/15 ring-rose-500/30";
}

function statusTone(s: string): string {
  switch (s) {
    case "new":       return "bg-[#0A4DFF]/15 text-[#0A4DFF] ring-[#0A4DFF]/30";
    case "converted": return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "lost":      return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
    case "quoted":    return "bg-violet-500/15 text-violet-300 ring-violet-500/30";
    case "contacted": return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    default:          return "bg-white/10 text-white/60 ring-white/15";
  }
}

function urgencyGlow(priority?: string, daysSinceContact?: number): string {
  if (priority === "hot") {
    return "shadow-[0_0_12px_rgba(239,68,68,0.18)] border-rose-500/25";
  }
  if (priority === "high" || (daysSinceContact != null && daysSinceContact > 7)) {
    return "border-amber-500/20";
  }
  return "border-white/5";
}

function formatDaysSince(ms: number): string {
  const days = differenceInDays(new Date(), new Date(ms));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function pipelineLabel(stage?: string, status?: string): string {
  if (stage) return stage;
  switch (status) {
    case "new":       return "New Lead";
    case "contacted": return "In Contact";
    case "quoted":    return "Quote Sent";
    case "converted": return "Converted";
    case "lost":      return "Lost";
    default:          return status ?? "—";
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LeadScoreBadge({ score }: { score: number }) {
  return (
    <div className={cn(
      "shrink-0 w-9 h-9 rounded-md ring-1 flex flex-col items-center justify-center",
      leadScoreBg(score),
    )}>
      <span className={cn("text-[11px] font-black leading-none", leadScoreColor(score))}>{score}</span>
      <span className="text-[6px] font-black uppercase tracking-widest text-white/30 leading-none mt-0.5">Score</span>
    </div>
  );
}

function ConversionPill({ prob }: { prob: number }) {
  const pct = Math.round(prob * 100);
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest leading-none px-1 py-0.5 rounded ring-1",
      pct >= 70 ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/25" :
      pct >= 40 ? "bg-amber-500/10 text-amber-400 ring-amber-500/25" :
                  "bg-white/5 text-white/35 ring-white/10",
    )}>
      <TrendingUp className="w-2 h-2" />
      {pct}%
    </span>
  );
}

function ActionButton({
  href,
  icon: Icon,
  label,
  tone,
  onClick,
}: {
  href?: string;
  icon: typeof Phone;
  label: string;
  tone: string;
  onClick?: () => void;
}) {
  const cls = cn(
    "flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest leading-none transition-colors",
    tone,
  );
  if (href) {
    return (
      <a href={href} className={cls}>
        <Icon className="w-2.5 h-2.5" />
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      <Icon className="w-2.5 h-2.5" />
      {label}
    </button>
  );
}

function LeadCard({ r, onTap }: { r: FieldLeadRow; onTap: () => void }) {
  const daysSinceContact = r.lastContactAtMs
    ? differenceInDays(new Date(), new Date(r.lastContactAtMs))
    : r.createdAtMs
      ? differenceInDays(new Date(), new Date(r.createdAtMs))
      : undefined;

  const score = r.leadScore ?? 0;
  const hasScore = r.leadScore != null;
  const hasRevenue = r.estimatedRevenue != null && r.estimatedRevenue > 0;
  const hasProb = r.conversionProbability != null;

  return (
    <div className={cn(
      "rounded-xl border bg-sidebar/60 overflow-hidden transition-all",
      urgencyGlow(r.priority, daysSinceContact),
    )}>
      {/* Hot lead accent strip */}
      {r.priority === "hot" && (
        <div className="h-0.5 bg-gradient-to-r from-rose-500/60 via-rose-400/40 to-transparent" />
      )}

      {/* Main row */}
      <button
        type="button"
        onClick={onTap}
        className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 min-h-[60px]"
      >
        {/* Lead score or fallback icon */}
        {hasScore ? (
          <LeadScoreBadge score={score} />
        ) : (
          <div className={cn(
            "shrink-0 w-9 h-9 rounded-md ring-1 flex items-center justify-center",
            r.priority === "hot" ? "bg-rose-500/15 ring-rose-500/30" :
            r.priority === "high" ? "bg-amber-500/15 ring-amber-500/30" :
            "bg-white/5 ring-white/10",
          )}>
            <UserPlus className={cn(
              "w-4 h-4",
              r.priority === "hot" ? "text-rose-400" :
              r.priority === "high" ? "text-amber-400" :
              "text-white/40",
            )} />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] font-bold text-white truncate leading-tight">{r.name}</p>
            {/* Revenue estimate */}
            {hasRevenue && (
              <span className="shrink-0 text-[10px] font-black text-emerald-400 leading-none whitespace-nowrap">
                ${(r.estimatedRevenue!).toFixed(0)}
              </span>
            )}
          </div>

          {/* Pipeline stage + source */}
          <p className="text-[10px] text-white/40 font-medium truncate leading-tight mt-0.5">
            {pipelineLabel(r.pipelineStage, r.status)}
            {r.source ? ` · ${r.source}` : ""}
          </p>

          {/* Badges row */}
          <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
            <span className={cn("text-[8px] font-black uppercase tracking-widest px-1 py-0.5 rounded ring-1 leading-none", statusTone(r.status))}>
              {r.status}
            </span>
            {hasProb && <ConversionPill prob={r.conversionProbability!} />}
            {daysSinceContact != null && (
              <span className={cn(
                "inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest leading-none px-1 py-0.5 rounded ring-1",
                daysSinceContact > 7
                  ? "bg-rose-500/10 text-rose-400 ring-rose-500/20"
                  : "bg-white/5 text-white/35 ring-white/10",
              )}>
                <Clock className="w-2 h-2" />
                {formatDaysSince(r.lastContactAtMs ?? r.createdAtMs)}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Action row */}
      <div className="flex items-center gap-1.5 px-3 pb-2.5">
        {r.phone && (
          <ActionButton
            href={`tel:${r.phone}`}
            icon={Phone}
            label="Call"
            tone="border-emerald-500/25 bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/15"
          />
        )}
        {r.phone && (
          <ActionButton
            href={`sms:${r.phone}`}
            icon={MessageSquare}
            label="Text"
            tone="border-sky-500/25 bg-sky-500/8 text-sky-400 hover:bg-sky-500/15"
          />
        )}
        {r.email && (
          <ActionButton
            href={`mailto:${r.email}`}
            icon={Mail}
            label="Email"
            tone="border-violet-500/25 bg-violet-500/8 text-violet-400 hover:bg-violet-500/15"
          />
        )}
        <ActionButton
          icon={Zap}
          label="Quote"
          tone="border-white/10 bg-white/5 text-white/50 hover:bg-white/8 ml-auto"
          onClick={() => window.location.href = `/leads?leadId=${encodeURIComponent(r.id)}`}
        />
      </div>
    </div>
  );
}

// ─── Filters ──────────────────────────────────────────────────────────────────

type FilterKey = "all" | "hot" | "new" | "quoted" | "contacted";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "hot", label: "Hot" },
  { key: "new", label: "New" },
  { key: "quoted", label: "Quoted" },
  { key: "contacted", label: "In Contact" },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FieldLeads() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FieldLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    const q = query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: FieldLeadRow[] = [];
        snap.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          const created = x.createdAt as { toMillis?: () => number } | undefined;
          const lastContact = x.lastContactAt as { toMillis?: () => number } | undefined;
          const trim = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
          const numOrUndef = (v: unknown) => (typeof v === "number" ? v : undefined);
          next.push({
            id: d.id,
            name: String(x.name ?? "Unnamed lead"),
            phone: trim(x.phone),
            email: trim(x.email),
            source: trim(x.source),
            status: String(x.status ?? "new"),
            priority: trim(x.priority),
            leadScore: numOrUndef(x.leadScore),
            estimatedRevenue: numOrUndef(x.estimatedRevenue) ?? numOrUndef(x.value) ?? numOrUndef(x.estimatedValue),
            conversionProbability: numOrUndef(x.conversionProbability),
            lastContactAtMs: typeof lastContact?.toMillis === "function" ? lastContact.toMillis() : undefined,
            pipelineStage: trim(x.pipelineStage),
            createdAtMs: typeof created?.toMillis === "function" ? created.toMillis() : 0,
          });
        });
        setRows(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("[FieldLeads] snapshot error", err);
        setError(err?.message || "Failed to load leads");
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "hot") return rows.filter((r) => r.priority === "hot");
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  // Revenue summary
  const totalRevenue = useMemo(
    () => rows.reduce((sum, r) => sum + (r.estimatedRevenue ?? 0), 0),
    [rows],
  );
  const hotCount = rows.filter((r) => r.priority === "hot").length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="px-0.5 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-black text-white leading-none">Leads</h1>
          {!loading && (
            <span className="text-[9px] font-black uppercase tracking-widest text-white/35">{rows.length}</span>
          )}
        </div>
        {hotCount > 0 && (
          <span className="text-[8px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-1.5 py-0.5">
            {hotCount} Hot
          </span>
        )}
      </div>

      {/* Revenue intelligence strip */}
      {!loading && rows.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-2.5 flex items-center gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/35 leading-none">Pipeline Value</p>
            <p className="text-[13px] font-black text-white leading-tight mt-0.5">
              {totalRevenue > 0 ? `$${totalRevenue.toFixed(0)}` : "—"}
            </p>
          </div>
          <div className="w-px h-6 bg-white/8" />
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/35 leading-none">Open Leads</p>
            <p className="text-[13px] font-black text-white leading-tight mt-0.5">
              {rows.filter((r) => r.status !== "converted" && r.status !== "lost").length}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      {!loading && rows.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 scrollbar-none">
          {FILTERS.map((f) => {
            const count = f.key === "all"
              ? rows.length
              : f.key === "hot"
                ? rows.filter((r) => r.priority === "hot").length
                : rows.filter((r) => r.status === f.key).length;
            if (f.key !== "all" && count === 0) return null;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest leading-none transition-all whitespace-nowrap",
                  filter === f.key
                    ? f.key === "hot"
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                      : "border-white/20 bg-white/10 text-white"
                    : "border-white/8 bg-white/3 text-white/40 hover:text-white/60",
                )}
              >
                {f.label}
                <span className={cn(
                  "text-[8px] leading-none",
                  filter === f.key ? "text-white/60" : "text-white/25",
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* States */}
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
            <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load leads</p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-6 text-center">
          <UserPlus className="w-5 h-5 text-white/30 mx-auto" />
          <p className="text-[11px] font-bold text-white/70 mt-1.5">No leads yet</p>
          <p className="text-[9px] text-white/30 mt-0.5">Leads you add will appear here</p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-4 text-center">
          <p className="text-[11px] font-bold text-white/50">No leads in this filter</p>
        </div>
      )}

      {/* Lead cards */}
      <div className="space-y-2">
        {filtered.map((r) => (
          <LeadCard
            key={r.id}
            r={r}
            onTap={() => navigate(`/leads?leadId=${encodeURIComponent(r.id)}`)}
          />
        ))}
      </div>
    </div>
  );
}
