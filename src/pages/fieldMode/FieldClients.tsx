import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CalendarPlus,
  Mail,
  MessageSquare,
  Phone,
  Search,
  ShieldAlert,
  Star,
  Users as UsersIcon,
} from "lucide-react";
import { useClientsLive } from "../../hooks/useClientsLive";
import type { FieldClient } from "../../services/fieldClient";

/**
 * Premium AI-powered mobile CRM — Phone-only Clients view.
 *
 * Data: live `onSnapshot` on the SAME `clients` Firestore collection used
 * by the desktop Clients page — no duplicate store, no extra queries.
 *
 * Intelligence signals (spend, job count, risk) come from FieldClient fields
 * already loaded by useClientsLive. All segmentation (VIP / At Risk / Recent)
 * is computed in-memory from the single live snapshot — zero extra Firestore reads.
 */

type FilterKey = "all" | "vip" | "risk" | "recent";

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All",
  vip: "VIP",
  risk: "At Risk",
  recent: "Recent",
};

/** Tier avatar colour tokens — VIP override always shows amber star separately */
const TIER_COLORS: Record<
  "platinum" | "gold" | "silver" | "none",
  { bg: string; ring: string; text: string }
> = {
  platinum: {
    bg: "bg-violet-500/20",
    ring: "ring-violet-500/40",
    text: "text-violet-300",
  },
  gold: {
    bg: "bg-amber-500/20",
    ring: "ring-amber-500/40",
    text: "text-amber-300",
  },
  silver: {
    bg: "bg-slate-400/15",
    ring: "ring-slate-400/30",
    text: "text-slate-300",
  },
  none: {
    bg: "bg-[#0A4DFF]/15",
    ring: "ring-[#0A4DFF]/30",
    text: "text-[#6B8FFF]",
  },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatSpend(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function isRecentClient(lastServiceDate?: string): boolean {
  if (!lastServiceDate) return false;
  const d = new Date(lastServiceDate);
  if (isNaN(d.getTime())) return false;
  const diffDays = (Date.now() - d.getTime()) / 86_400_000;
  return diffDays <= 30;
}

// ---------------------------------------------------------------------------
// Risk badge
// ---------------------------------------------------------------------------
function RiskBadge({ level }: { level?: "low" | "medium" | "high" }) {
  if (!level || level === "low") return null;
  const isHigh = level === "high";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider",
        isHigh
          ? "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30"
          : "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
      )}
    >
      <ShieldAlert className="w-2.5 h-2.5" />
      {isHigh ? "At Risk" : "Watch"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Disabled action placeholder
// ---------------------------------------------------------------------------
function DisabledAction({ icon: Icon, label }: { icon: typeof Phone; label: string }) {
  return (
    <div className="flex-1 h-8 rounded-lg bg-white/[0.02] ring-1 ring-white/[0.06] flex items-center justify-center gap-1 text-white/20">
      <Icon className="w-3 h-3" />
      <span className="text-[9px] font-black uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Premium client card
// ---------------------------------------------------------------------------
function ClientCard({
  c,
  onOpen,
  onBook,
}: {
  c: FieldClient;
  onOpen: (id: string) => void;
  onBook: (id: string) => void;
}) {
  const tier = c.membershipLevel ?? "none";
  const colors = TIER_COLORS[tier] ?? TIER_COLORS.none;
  const isAtRisk = c.riskLevel === "high" || c.riskLevel === "medium";

  return (
    <div
      className={cn(
        "w-full rounded-xl border bg-sidebar/60 overflow-hidden",
        isAtRisk ? "border-rose-500/20" : "border-white/5",
      )}
    >
      {/* Tap-to-open profile */}
      <button
        type="button"
        onClick={() => onOpen(c.id)}
        className="w-full text-left px-3 pt-3 pb-2.5 flex items-start gap-3 hover:bg-sidebar/80 active:bg-sidebar transition-colors"
      >
        {/* Tier-coloured avatar */}
        <div
          className={cn(
            "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-black ring-1",
            colors.bg,
            colors.ring,
            colors.text,
          )}
        >
          {getInitials(c.name)}
        </div>

        {/* Name / contact / intelligence signals */}
        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[13px] font-bold text-white leading-tight">{c.name}</p>
            {c.isVIP && (
              <Star className="w-3 h-3 text-amber-400 shrink-0 fill-amber-400/70" />
            )}
            <RiskBadge level={c.riskLevel} />
          </div>

          {/* Business name (if distinct) */}
          {c.businessName && c.businessName !== c.name && (
            <p className="text-[10px] text-white/45 font-medium truncate leading-tight mt-0.5">
              {c.businessName}
            </p>
          )}

          {/* Contact line */}
          <p className="text-[10px] text-white/40 font-medium truncate leading-tight mt-0.5">
            {c.phone || c.email || "No contact on file"}
          </p>

          {/* Intelligence signal pills */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {c.totalHistoricalSpend !== undefined && c.totalHistoricalSpend > 0 && (
              <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20 rounded-full px-1.5 py-0.5">
                {formatSpend(c.totalHistoricalSpend)} spent
              </span>
            )}
            {c.serviceHistoryCount !== undefined && c.serviceHistoryCount > 0 && (
              <span className="text-[9px] font-black text-white/50 bg-white/[0.05] ring-1 ring-white/10 rounded-full px-1.5 py-0.5">
                {c.serviceHistoryCount} {c.serviceHistoryCount === 1 ? "job" : "jobs"}
              </span>
            )}
            {c.lastServiceType && (
              <span className="text-[9px] font-medium text-white/35 truncate max-w-[110px]">
                Last: {c.lastServiceType}
              </span>
            )}
            {tier !== "none" && (
              <span
                className={cn(
                  "text-[9px] font-black uppercase tracking-wider rounded-full px-1.5 py-0.5 ring-1",
                  tier === "platinum" &&
                    "bg-violet-500/10 text-violet-400 ring-violet-500/20",
                  tier === "gold" &&
                    "bg-amber-500/10 text-amber-400 ring-amber-500/20",
                  tier === "silver" &&
                    "bg-slate-400/10 text-slate-400 ring-slate-400/20",
                )}
              >
                {tier}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* 4-button action bar */}
      <div className="flex items-center gap-1 px-3 pb-2.5 pt-0.5 border-t border-white/[0.04]">
        {c.telUrl ? (
          <a
            href={c.telUrl}
            aria-label={`Call ${c.name}`}
            className="flex-1 h-8 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/25 flex items-center justify-center gap-1 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            <Phone className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-wider">Call</span>
          </a>
        ) : (
          <DisabledAction icon={Phone} label="Call" />
        )}

        {c.smsUrl ? (
          <a
            href={c.smsUrl}
            aria-label={`Text ${c.name}`}
            className="flex-1 h-8 rounded-lg bg-sky-500/10 ring-1 ring-sky-500/25 flex items-center justify-center gap-1 text-sky-400 hover:bg-sky-500/20 transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-wider">Text</span>
          </a>
        ) : (
          <DisabledAction icon={MessageSquare} label="Text" />
        )}

        {c.mailtoUrl ? (
          <a
            href={c.mailtoUrl}
            aria-label={`Email ${c.name}`}
            className="flex-1 h-8 rounded-lg bg-violet-500/10 ring-1 ring-violet-500/25 flex items-center justify-center gap-1 text-violet-400 hover:bg-violet-500/20 transition-colors"
          >
            <Mail className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-wider">Email</span>
          </a>
        ) : (
          <DisabledAction icon={Mail} label="Email" />
        )}

        <button
          type="button"
          onClick={() => onBook(c.id)}
          className="flex-1 h-8 rounded-lg bg-[#0A4DFF]/15 ring-1 ring-[#0A4DFF]/30 flex items-center justify-center gap-1 text-[#6B8FFF] hover:bg-[#0A4DFF]/25 transition-colors"
        >
          <CalendarPlus className="w-3 h-3" />
          <span className="text-[9px] font-black uppercase tracking-wider">Book</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function FieldClients() {
  const { clients, loading, error } = useClientsLive(50);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const navigate = useNavigate();

  const openProfile = useCallback(
    (id: string) => {
      navigate(`/clients?clientId=${encodeURIComponent(id)}&tab=overview`);
    },
    [navigate],
  );

  const bookJob = useCallback(
    (id: string) => {
      navigate(`/field/book-job?clientId=${encodeURIComponent(id)}`);
    },
    [navigate],
  );

  // KPI summary counts (all from in-memory list — no extra reads)
  const kpis = useMemo(() => {
    const vipCount = clients.filter((c) => c.isVIP).length;
    const atRiskCount = clients.filter(
      (c) => c.riskLevel === "high" || c.riskLevel === "medium",
    ).length;
    const recentCount = clients.filter((c) => isRecentClient(c.lastServiceDate)).length;
    return { vipCount, atRiskCount, recentCount };
  }, [clients]);

  // Segment + search filter, VIPs always float to top
  const filtered = useMemo(() => {
    let list: FieldClient[] = clients;

    if (filter === "vip") list = list.filter((c) => c.isVIP);
    else if (filter === "risk")
      list = list.filter((c) => c.riskLevel === "high" || c.riskLevel === "medium");
    else if (filter === "recent")
      list = list.filter((c) => isRecentClient(c.lastServiceDate));

    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          (c.businessName ?? "").toLowerCase().includes(needle) ||
          (c.phone ?? "").toLowerCase().includes(needle) ||
          (c.email ?? "").toLowerCase().includes(needle),
      );
    }

    // VIP-first, then by lifetime spend descending
    return [...list].sort((a, b) => {
      if (a.isVIP && !b.isVIP) return -1;
      if (!a.isVIP && b.isVIP) return 1;
      return (b.totalHistoricalSpend ?? 0) - (a.totalHistoricalSpend ?? 0);
    });
  }, [clients, q, filter]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="px-0.5 flex items-baseline justify-between">
        <h1 className="text-base font-black text-white leading-none">Clients</h1>
        {!loading && (
          <span className="text-[9px] font-black uppercase tracking-widest text-white/35">
            {filtered.length} / {clients.length}
          </span>
        )}
      </div>

      {/* KPI summary strip */}
      {!loading && !error && clients.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-2 py-2 text-center">
            <p className="text-[18px] font-black text-amber-400 leading-none">
              {kpis.vipCount}
            </p>
            <p className="text-[8px] font-black uppercase tracking-widest text-amber-400/55 mt-0.5">
              VIP
            </p>
          </div>
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-2 py-2 text-center">
            <p className="text-[18px] font-black text-rose-400 leading-none">
              {kpis.atRiskCount}
            </p>
            <p className="text-[8px] font-black uppercase tracking-widest text-rose-400/55 mt-0.5">
              At Risk
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-2 py-2 text-center">
            <p className="text-[18px] font-black text-emerald-400 leading-none">
              {kpis.recentCount}
            </p>
            <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400/55 mt-0.5">
              Active
            </p>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search clients"
          className={cn(
            "w-full h-10 pl-8 pr-2.5 rounded-xl border border-white/5 bg-sidebar/60",
            "text-[12px] font-bold text-white placeholder-white/35",
            "focus:outline-none focus:ring-1 focus:ring-[#0A4DFF]/50 focus:border-[#0A4DFF]/50",
          )}
        />
      </div>

      {/* Segment filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
        {(["all", "vip", "risk", "recent"] as FilterKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "shrink-0 h-7 px-3 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors",
              filter === key
                ? "bg-[#0A4DFF] text-white shadow-[0_0_12px_rgba(10,77,255,0.35)]"
                : "bg-sidebar/60 border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20",
            )}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-4 flex items-center justify-center gap-2 min-h-[56px]">
          <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">
            Loading…
          </span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-300 leading-tight">
              Couldn't load clients
            </p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* Empty — no clients in collection */}
      {!loading && !error && clients.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-6 text-center">
          <UsersIcon className="w-6 h-6 text-white/25 mx-auto" />
          <p className="text-[11px] font-bold text-white/60 mt-2">No clients yet</p>
          <p className="text-[10px] text-white/35 mt-0.5">
            Add your first client from the desktop
          </p>
        </div>
      )}

      {/* Empty — filter / search produced no results */}
      {!loading && !error && clients.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-4 text-center">
          <p className="text-[11px] font-bold text-white/60">
            {q
              ? `No matches for "${q}"`
              : `No ${FILTER_LABELS[filter].toLowerCase()} clients`}
          </p>
        </div>
      )}

      {/* Client card list */}
      <div className="space-y-2">
        {filtered.map((c) => (
          <ClientCard key={c.id} c={c} onOpen={openProfile} onBook={bookJob} />
        ))}
      </div>
    </div>
  );
}
