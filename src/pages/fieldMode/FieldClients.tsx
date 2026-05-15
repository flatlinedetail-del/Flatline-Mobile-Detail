import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CalendarPlus,
  ChevronRight,
  Clock,
  Crown,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  TrendingUp,
  Users as UsersIcon,
  Zap,
} from "lucide-react";
import { useClientsLive } from "../../hooks/useClientsLive";
import type { FieldClient } from "../../services/fieldClient";

/**
 * Premium AI-powered mobile CRM — Field Mode Clients screen.
 *
 * Data: live `onSnapshot` on the `clients` collection via useClientsLive(50).
 * All KPIs, segmentation, and sorting are derived in-memory — zero extra reads.
 *
 * Design:
 * - Horizontally scrollable KPI strip
 * - Premium search + sort + filter chips
 * - Operational glow cards (VIP=amber, risk=rose, platinum=violet, value=emerald)
 * - Floating Add Client CTA
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterKey = "all" | "vip" | "active" | "inactive" | "risk" | "balance";
type SortKey = "vipFirst" | "value" | "lastService" | "name" | "riskFirst";

const FILTER_LABELS: Record<FilterKey, string> = {
  all:      "All Clients",
  vip:      "VIP",
  active:   "Active",
  inactive: "Inactive",
  risk:     "High Risk",
  balance:  "Outstanding",
};

const SORT_LABELS: Record<SortKey, string> = {
  vipFirst:    "VIP First",
  value:       "Highest Value",
  lastService: "Last Service",
  name:        "Name A–Z",
  riskFirst:   "Risk First",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecentClient(lastServiceDate?: string): boolean {
  if (!lastServiceDate) return false;
  const d = new Date(lastServiceDate);
  if (isNaN(d.getTime())) return false;
  return (Date.now() - d.getTime()) / 86_400_000 <= 30;
}

function formatSpend(n: number): string {
  if (n >= 10_000) return `$${(n / 1000).toFixed(0)}k`;
  if (n >= 1_000)  return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function formatDateShort(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

// ─── Card glow system ─────────────────────────────────────────────────────────
// Priority: risk > VIP > platinum > gold > high-value > active > default

interface GlowConfig {
  border:     string;
  shadow:     string;
  avatarBg:   string;
  avatarRing: string;
  avatarText: string;
}

function getCardGlow(c: FieldClient): GlowConfig {
  if (c.riskLevel === "high") {
    return {
      border:     "border-rose-500/30",
      shadow:     "shadow-[0_0_18px_rgba(244,63,94,0.14)]",
      avatarBg:   "bg-rose-500/15",
      avatarRing: "ring-rose-500/40",
      avatarText: "text-rose-300",
    };
  }
  if (c.riskLevel === "medium") {
    return {
      border:     "border-amber-500/25",
      shadow:     "shadow-[0_0_14px_rgba(245,158,11,0.10)]",
      avatarBg:   "bg-amber-500/[0.10]",
      avatarRing: "ring-amber-500/25",
      avatarText: "text-amber-400",
    };
  }
  if (c.isVIP) {
    return {
      border:     "border-amber-500/40",
      shadow:     "shadow-[0_0_20px_rgba(245,158,11,0.18)]",
      avatarBg:   "bg-amber-500/15",
      avatarRing: "ring-amber-500/45",
      avatarText: "text-amber-300",
    };
  }
  if (c.membershipLevel === "platinum") {
    return {
      border:     "border-violet-500/35",
      shadow:     "shadow-[0_0_18px_rgba(139,92,246,0.15)]",
      avatarBg:   "bg-violet-500/15",
      avatarRing: "ring-violet-500/40",
      avatarText: "text-violet-300",
    };
  }
  if (c.membershipLevel === "gold") {
    return {
      border:     "border-amber-500/20",
      shadow:     "shadow-[0_0_12px_rgba(245,158,11,0.08)]",
      avatarBg:   "bg-amber-500/10",
      avatarRing: "ring-amber-500/25",
      avatarText: "text-amber-400",
    };
  }
  if ((c.totalHistoricalSpend ?? 0) >= 2_000) {
    return {
      border:     "border-emerald-500/25",
      shadow:     "shadow-[0_0_16px_rgba(16,185,129,0.10)]",
      avatarBg:   "bg-emerald-500/[0.12]",
      avatarRing: "ring-emerald-500/30",
      avatarText: "text-emerald-300",
    };
  }
  if (isRecentClient(c.lastServiceDate)) {
    return {
      border:     "border-[#0A4DFF]/25",
      shadow:     "shadow-[0_0_14px_rgba(10,77,255,0.10)]",
      avatarBg:   "bg-[#0A4DFF]/[0.12]",
      avatarRing: "ring-[#0A4DFF]/30",
      avatarText: "text-[#6B8FFF]",
    };
  }
  return {
    border:     "border-white/[0.07]",
    shadow:     "",
    avatarBg:   "bg-white/[0.05]",
    avatarRing: "ring-white/[0.08]",
    avatarText: "text-white/40",
  };
}

// ─── Risk badge ───────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level?: "low" | "medium" | "high" }) {
  if (!level || level === "low") return null;
  const isHigh = level === "high";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider leading-none",
        isHigh
          ? "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30"
          : "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
      )}
    >
      <ShieldAlert className="w-2 h-2" />
      {isHigh ? "Risk" : "Watch"}
    </span>
  );
}

// ─── Disabled action placeholder ─────────────────────────────────────────────

function DisabledAction({ icon: Icon }: { icon: typeof Phone }) {
  return (
    <div className="flex-1 h-8 rounded-lg bg-white/[0.025] ring-1 ring-white/[0.05] flex items-center justify-center text-white/15">
      <Icon className="w-3 h-3" />
    </div>
  );
}

// ─── Premium client card ──────────────────────────────────────────────────────

function ClientCard({
  c,
  onOpen,
  onBook,
}: {
  c: FieldClient;
  onOpen: (id: string) => void;
  onBook: (id: string) => void;
}) {
  const glow  = getCardGlow(c);
  const spend = c.totalHistoricalSpend ?? 0;
  const jobs  = c.serviceHistoryCount  ?? 0;
  const hasMetrics = jobs > 0 || !!c.lastServiceDate || c.membershipLevel !== "none";

  return (
    <div
      className={cn(
        "w-full rounded-2xl border bg-[#0C0F16]/80 backdrop-blur-sm overflow-hidden",
        "transition-transform duration-150 active:scale-[0.985]",
        glow.border,
        glow.shadow,
      )}
    >
      {/* ── Tap-to-open profile ── */}
      <button
        type="button"
        onClick={() => onOpen(c.id)}
        className="w-full text-left px-3.5 pt-3.5 pb-2.5 flex items-start gap-3"
      >
        {/* Avatar with tier glow */}
        <div
          className={cn(
            "shrink-0 w-11 h-11 rounded-xl flex items-center justify-center",
            "text-[12px] font-black ring-1",
            glow.avatarBg,
            glow.avatarRing,
            glow.avatarText,
          )}
        >
          {getInitials(c.name)}
        </div>

        {/* Name + contact */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-bold text-white leading-tight">{c.name}</span>
            {c.isVIP && (
              <Crown className="w-3 h-3 text-amber-400 fill-amber-400/70 shrink-0" />
            )}
            <RiskBadge level={c.riskLevel} />
          </div>
          {c.businessName && c.businessName !== c.name && (
            <p className="text-[10px] text-white/40 font-medium truncate leading-tight mt-0.5">
              {c.businessName}
            </p>
          )}
          <p className="text-[10px] text-white/35 font-medium truncate leading-tight mt-0.5">
            {c.phone || c.email || "No contact on file"}
          </p>
        </div>

        {/* Lifetime value + chevron */}
        <div className="shrink-0 flex flex-col items-end gap-0.5 pt-0.5">
          {spend > 0 && (
            <>
              <span className="text-[14px] font-black text-emerald-400 tabular-nums leading-none">
                {formatSpend(spend)}
              </span>
              <span className="text-[7px] font-black uppercase tracking-widest text-emerald-400/50 leading-none">
                lifetime
              </span>
            </>
          )}
          <ChevronRight className={cn("w-3.5 h-3.5 text-white/20", spend > 0 && "mt-1")} />
        </div>
      </button>

      {/* ── Operational metrics row ── */}
      {hasMetrics && (
        <div className="flex items-center gap-3 px-3.5 py-2 border-t border-white/[0.04] flex-wrap">
          {c.lastServiceDate && (
            <div className="flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-white/25 shrink-0" />
              <span className="text-[9px] font-bold text-white/40">
                {formatDateShort(c.lastServiceDate)}
              </span>
            </div>
          )}
          {jobs > 0 && (
            <div className="flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-white/25 shrink-0" />
              <span className="text-[9px] font-bold text-white/40">
                {jobs} {jobs === 1 ? "job" : "jobs"}
              </span>
            </div>
          )}
          {spend > 0 && jobs > 1 && (
            <div className="flex items-center gap-1">
              <TrendingUp className="w-2.5 h-2.5 text-white/25 shrink-0" />
              <span className="text-[9px] font-bold text-white/40">
                avg {formatSpend(spend / jobs)}
              </span>
            </div>
          )}
          {c.lastServiceType && (
            <span className="text-[9px] font-medium text-white/30 truncate max-w-[100px]">
              {c.lastServiceType}
            </span>
          )}
          {c.membershipLevel !== "none" && (
            <span
              className={cn(
                "ml-auto text-[8px] font-black uppercase tracking-wider rounded-full px-1.5 py-0.5 ring-1",
                c.membershipLevel === "platinum" && "bg-violet-500/10 text-violet-400 ring-violet-500/20",
                c.membershipLevel === "gold"     && "bg-amber-500/10  text-amber-400  ring-amber-500/20",
                c.membershipLevel === "silver"   && "bg-slate-400/10  text-slate-400  ring-slate-400/15",
              )}
            >
              {c.membershipLevel}
            </span>
          )}
        </div>
      )}

      {/* ── 4-button action row ── */}
      <div className="flex items-center gap-1.5 px-3.5 pb-3.5 pt-2 border-t border-white/[0.04]">
        {c.telUrl ? (
          <a
            href={c.telUrl}
            aria-label={`Call ${c.name}`}
            onClick={e => e.stopPropagation()}
            className="flex-1 h-8 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/25 flex items-center justify-center gap-1 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            <Phone className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-wider">Call</span>
          </a>
        ) : (
          <DisabledAction icon={Phone} />
        )}

        {c.smsUrl ? (
          <a
            href={c.smsUrl}
            aria-label={`Text ${c.name}`}
            onClick={e => e.stopPropagation()}
            className="flex-1 h-8 rounded-lg bg-sky-500/10 ring-1 ring-sky-500/25 flex items-center justify-center gap-1 text-sky-400 hover:bg-sky-500/20 transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-wider">Text</span>
          </a>
        ) : (
          <DisabledAction icon={MessageSquare} />
        )}

        {c.mailtoUrl ? (
          <a
            href={c.mailtoUrl}
            aria-label={`Email ${c.name}`}
            onClick={e => e.stopPropagation()}
            className="flex-1 h-8 rounded-lg bg-violet-500/10 ring-1 ring-violet-500/25 flex items-center justify-center gap-1 text-violet-400 hover:bg-violet-500/20 transition-colors"
          >
            <Mail className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-wider">Email</span>
          </a>
        ) : (
          <DisabledAction icon={Mail} />
        )}

        <button
          type="button"
          onClick={e => { e.stopPropagation(); onBook(c.id); }}
          className="flex-1 h-8 rounded-lg bg-[#0A4DFF]/15 ring-1 ring-[#0A4DFF]/30 flex items-center justify-center gap-1 text-[#6B8FFF] hover:bg-[#0A4DFF]/25 transition-colors"
        >
          <CalendarPlus className="w-3 h-3" />
          <span className="text-[9px] font-black uppercase tracking-wider">Book</span>
        </button>
      </div>
    </div>
  );
}

// ─── KPI strip card ───────────────────────────────────────────────────────────

type KpiColor = "blue" | "amber" | "emerald" | "violet" | "rose" | "sky";

interface KpiConfig {
  label: string;
  value: string;
  sub?: string;
  color: KpiColor;
  filterTarget?: FilterKey;
}

const KPI_COLOR_MAP: Record<KpiColor, { text: string; bg: string; border: string; shadow: string }> = {
  blue:    { text: "text-[#6B8FFF]",   bg: "bg-[#0A4DFF]/[0.08]",  border: "border-[#0A4DFF]/20",   shadow: "shadow-[0_0_16px_rgba(10,77,255,0.10)]"    },
  amber:   { text: "text-amber-400",   bg: "bg-amber-500/[0.08]",   border: "border-amber-500/20",   shadow: "shadow-[0_0_16px_rgba(245,158,11,0.10)]"   },
  emerald: { text: "text-emerald-400", bg: "bg-emerald-500/[0.08]", border: "border-emerald-500/20", shadow: "shadow-[0_0_16px_rgba(16,185,129,0.10)]"   },
  violet:  { text: "text-violet-400",  bg: "bg-violet-500/[0.08]",  border: "border-violet-500/20",  shadow: "shadow-[0_0_16px_rgba(139,92,246,0.10)]"   },
  rose:    { text: "text-rose-400",    bg: "bg-rose-500/[0.08]",    border: "border-rose-500/20",    shadow: "shadow-[0_0_16px_rgba(244,63,94,0.10)]"    },
  sky:     { text: "text-sky-400",     bg: "bg-sky-500/[0.08]",     border: "border-sky-500/20",     shadow: "shadow-[0_0_16px_rgba(14,165,233,0.10)]"   },
};

function KpiStripCard({
  card,
  onFilter,
}: {
  card: KpiConfig;
  onFilter: (f: FilterKey) => void;
}) {
  const c = KPI_COLOR_MAP[card.color];
  return (
    <button
      type="button"
      onClick={() => card.filterTarget && onFilter(card.filterTarget)}
      className={cn(
        "shrink-0 rounded-2xl border px-4 py-3 text-left min-w-[108px]",
        "transition-all duration-150 active:scale-[0.93]",
        card.filterTarget && "cursor-pointer",
        c.bg, c.border, c.shadow,
      )}
    >
      <p className={cn("text-[22px] font-black leading-none tabular-nums tracking-tight", c.text)}>
        {card.value}
      </p>
      <p className="text-[8px] font-black uppercase tracking-widest text-white/35 mt-1.5 leading-none">
        {card.label}
      </p>
      {card.sub && (
        <p className={cn("text-[9px] font-bold mt-1 leading-none opacity-65", c.text)}>
          {card.sub}
        </p>
      )}
    </button>
  );
}

// ─── Sort dropdown ────────────────────────────────────────────────────────────

function SortDropdown({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (s: SortKey) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as SortKey)}
      className={cn(
        "h-9 pl-2.5 pr-5 rounded-xl appearance-none outline-none cursor-pointer",
        "bg-white/[0.04] border border-white/[0.07]",
        "text-[10px] font-black uppercase tracking-wider text-white/50",
        "focus:ring-1 focus:ring-white/15",
      )}
    >
      {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([key, label]) => (
        <option key={key} value={key} className="bg-[#0C0F16] text-white normal-case">
          {label}
        </option>
      ))}
    </select>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FieldClients() {
  const { clients, loading, error } = useClientsLive(50);
  const [q,      setQ]      = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort,   setSort]   = useState<SortKey>("vipFirst");
  const navigate = useNavigate();

  const openProfile = useCallback(
    (id: string) => navigate(`/clients?clientId=${encodeURIComponent(id)}&tab=overview`),
    [navigate],
  );

  const bookJob = useCallback(
    (id: string) => navigate(`/field/book-job?clientId=${encodeURIComponent(id)}`),
    [navigate],
  );

  // ── KPI strip (all derived from loaded clients — zero extra reads) ──────────
  const kpiCards = useMemo<KpiConfig[]>(() => {
    const total    = clients.length;
    const vipCount = clients.filter(c => c.isVIP).length;
    const revenue  = clients.reduce((s, c) => s + (c.totalHistoricalSpend ?? 0), 0);
    const active   = clients.filter(c => isRecentClient(c.lastServiceDate)).length;
    const avgSpend = total > 0 ? revenue / total : 0;
    const riskHigh = clients.filter(c => c.riskLevel === "high").length;
    const members  = clients.filter(c => c.membershipLevel !== "none").length;
    const returners = clients.filter(c => (c.serviceHistoryCount ?? 0) > 1).length;
    const retention = total > 0 ? Math.round((returners / total) * 100) : 0;

    return [
      {
        label:        "Total Clients",
        value:        String(total),
        color:        "blue",
        filterTarget: "all",
      },
      {
        label:        "VIP Clients",
        value:        String(vipCount),
        color:        "amber",
        filterTarget: "vip",
      },
      {
        label:  "Lifetime Rev",
        value:  revenue > 0 ? formatSpend(revenue) : "$0",
        color:  "emerald",
      },
      {
        label:        "Active This Mo",
        value:        String(active),
        color:        "sky",
        filterTarget: "active",
      },
      {
        label: "Avg Spend",
        value: avgSpend > 0 ? formatSpend(avgSpend) : "$0",
        color: "violet",
      },
      {
        label:  "Members",
        value:  String(members),
        color:  "violet",
      },
      {
        label:  "Retention",
        value:  `${retention}%`,
        sub:    returners > 0 ? `${returners} repeat` : undefined,
        color:  "emerald",
      },
      {
        label:        "High Risk",
        value:        String(riskHigh),
        color:        "rose",
        filterTarget: "risk",
      },
    ];
  }, [clients]);

  // ── Segment + search + sort (all in-memory) ─────────────────────────────────
  const filtered = useMemo(() => {
    let list: FieldClient[] = clients;

    if (filter === "vip")      list = list.filter(c => c.isVIP);
    else if (filter === "active")   list = list.filter(c => isRecentClient(c.lastServiceDate));
    else if (filter === "inactive") list = list.filter(c => !isRecentClient(c.lastServiceDate));
    else if (filter === "risk")     list = list.filter(c => c.riskLevel === "high" || c.riskLevel === "medium");
    else if (filter === "balance")  list = list.filter(c => c.riskLevel === "high" || c.riskLevel === "medium");

    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(c =>
        c.name.toLowerCase().includes(needle) ||
        (c.businessName ?? "").toLowerCase().includes(needle) ||
        (c.phone       ?? "").toLowerCase().includes(needle) ||
        (c.email       ?? "").toLowerCase().includes(needle),
      );
    }

    return [...list].sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name);

        case "lastService": {
          const da = a.lastServiceDate ? new Date(a.lastServiceDate).getTime() : 0;
          const dB = b.lastServiceDate ? new Date(b.lastServiceDate).getTime() : 0;
          return dB - da;
        }

        case "value":
          return (b.totalHistoricalSpend ?? 0) - (a.totalHistoricalSpend ?? 0);

        case "riskFirst": {
          const rank = (c: FieldClient) =>
            c.riskLevel === "high" ? 0 : c.riskLevel === "medium" ? 1 : 2;
          return rank(a) - rank(b);
        }

        case "vipFirst":
        default: {
          if (a.isVIP && !b.isVIP) return -1;
          if (!a.isVIP && b.isVIP) return 1;
          return (b.totalHistoricalSpend ?? 0) - (a.totalHistoricalSpend ?? 0);
        }
      }
    });
  }, [clients, q, filter, sort]);

  return (
    <div className="relative space-y-3 pb-28">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-0.5">
        <div>
          <h1 className="text-base font-black text-white leading-none">Clients</h1>
          {!loading && (
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-0.5">
              {filtered.length} of {clients.length}
            </p>
          )}
        </div>
      </div>

      {/* ── KPI strip ── */}
      {!loading && !error && clients.length > 0 && (
        <div className="-mx-2.5 px-2.5 overflow-x-auto scrollbar-none">
          <div className="flex gap-2 min-w-max pb-0.5">
            {kpiCards.map((card, i) => (
              <KpiStripCard key={i} card={card} onFilter={setFilter} />
            ))}
          </div>
        </div>
      )}

      {/* ── Search + sort row ── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by name, phone, email…"
            className={cn(
              "w-full h-10 pl-9 pr-3 rounded-xl",
              "border border-white/[0.07] bg-white/[0.04]",
              "text-[12px] font-bold text-white placeholder-white/20",
              "focus:outline-none focus:ring-1 focus:ring-[#0A4DFF]/40 focus:border-[#0A4DFF]/30",
            )}
          />
        </div>
        <SortDropdown value={sort} onChange={setSort} />
      </div>

      {/* ── Filter chips ── */}
      <div className="-mx-2.5 px-2.5 overflow-x-auto scrollbar-none">
        <div className="flex gap-1.5 min-w-max pb-0.5">
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "shrink-0 h-7 px-3 rounded-full text-[9px] font-black uppercase tracking-wider",
                "transition-all duration-150",
                filter === key
                  ? "bg-[#0A4DFF] text-white shadow-[0_0_14px_rgba(10,77,255,0.40)]"
                  : "bg-white/[0.04] border border-white/[0.08] text-white/40 hover:text-white/70 hover:border-white/15",
              )}
            >
              {FILTER_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-5 flex items-center justify-center gap-2">
          <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
          <span className="text-[9px] font-black uppercase tracking-widest text-white/30">
            Loading clients…
          </span>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2.5 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load clients</p>
            <p className="text-[9px] text-rose-300/60 mt-0.5 break-words leading-tight">{error}</p>
          </div>
        </div>
      )}

      {/* ── Empty — no clients in collection ── */}
      {!loading && !error && clients.length === 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-10 text-center">
          <UsersIcon className="w-7 h-7 text-white/20 mx-auto" />
          <p className="text-[12px] font-bold text-white/45 mt-2.5">No clients yet</p>
          <p className="text-[10px] text-white/25 mt-1">Add your first client from the desktop</p>
        </div>
      )}

      {/* ── Empty — filter / search no results ── */}
      {!loading && !error && clients.length > 0 && filtered.length === 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-6 text-center">
          <p className="text-[11px] font-bold text-white/45">
            {q
              ? `No matches for "${q}"`
              : `No ${FILTER_LABELS[filter].toLowerCase()}`}
          </p>
        </div>
      )}

      {/* ── Client card list ── */}
      <div className="space-y-2.5">
        {filtered.map(c => (
          <ClientCard key={c.id} c={c} onOpen={openProfile} onBook={bookJob} />
        ))}
      </div>

      {/* ── Floating Add Client CTA ── */}
      <div className="fixed bottom-24 right-4 z-30 pointer-events-none">
        <button
          type="button"
          onClick={() => navigate("/clients?adminView=1")}
          className={cn(
            "pointer-events-auto flex items-center gap-2 pl-4 pr-5 h-11 rounded-full",
            "bg-[#0A4DFF]",
            "shadow-[0_0_24px_rgba(10,77,255,0.50),0_4px_16px_rgba(0,0,0,0.45)]",
            "text-white font-black text-[11px] uppercase tracking-wider",
            "transition-all duration-150 active:scale-95",
            "hover:shadow-[0_0_32px_rgba(10,77,255,0.65),0_4px_16px_rgba(0,0,0,0.45)]",
          )}
        >
          <Plus className="w-4 h-4" />
          Add Client
        </button>
      </div>

    </div>
  );
}
