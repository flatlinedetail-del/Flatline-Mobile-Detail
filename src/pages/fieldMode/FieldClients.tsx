import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Star,
  Users as UsersIcon,
} from "lucide-react";
import { useClientsLive } from "../../hooks/useClientsLive";
import type { FieldClient } from "../../services/fieldClient";

/**
 * Phone-only Clients view (rendered at `/clients` when the device is
 * a phone). Replaces the desktop Clients management table for phones
 * because the wide table overflows.
 *
 * Data: live `onSnapshot` on the SAME `clients` collection that the
 * desktop Clients page reads — no duplicate store. Default load is
 * the most recently created 50 clients (mirrors desktop default).
 *
 * In-memory search filters by name/business/phone/email. There is no
 * standalone `/clients/:id` route in the app today (desktop opens a
 * modal), so each card surfaces quick `tel:` / `sms:` / `mailto:`
 * links instead of a deep-link to a detail page. Tablet/desktop
 * continue to render the full Clients page via the ClientsSwitch in
 * App.tsx.
 */

function ClientCard({ c, onOpen }: { c: FieldClient; onOpen: (id: string) => void }) {
  return (
    <div
      className={cn(
        "w-full rounded-xl border border-white/5 bg-sidebar/60",
        "min-h-[56px] flex items-stretch",
      )}
    >
      {/* Card body is now a tap target that opens the full client profile
          via /clients?clientId=<id>. ClientsSwitch detects the param and
          falls through to the full Clients page, which auto-opens the
          detail dialog (no reduced phone-only profile). */}
      <button
        type="button"
        onClick={() => onOpen(c.id)}
        className="flex-1 min-w-0 text-left px-2.5 py-2 flex items-center gap-2.5 hover:bg-sidebar/80 active:bg-sidebar transition-colors rounded-l-xl"
      >
        <div className="shrink-0 w-9 h-9 rounded-md bg-[#0A4DFF]/15 ring-1 ring-[#0A4DFF]/30 flex items-center justify-center text-[10px] font-black text-[#0A4DFF] uppercase">
          {c.name
            .split(" ")
            .map((n) => n[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[12px] font-bold text-white truncate leading-tight">{c.name}</p>
            {c.isVIP && <Star className="w-3 h-3 text-amber-400 shrink-0 fill-amber-400/70" />}
          </div>
          {c.businessName && c.businessName !== c.name && (
            <p className="text-[10px] text-white/45 font-medium truncate leading-tight">{c.businessName}</p>
          )}
          <p className="text-[10px] text-white/45 font-medium truncate leading-tight">
            {c.phone || c.email || "No contact on file"}
          </p>
        </div>
      </button>

      <div className="shrink-0 flex items-center gap-1 pr-1.5">
        {c.telUrl ? (
          <a
            href={c.telUrl}
            aria-label={`Call ${c.name}`}
            className="w-8 h-8 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
          </a>
        ) : (
          <Disabled icon={Phone} />
        )}
        {c.smsUrl ? (
          <a
            href={c.smsUrl}
            aria-label={`Text ${c.name}`}
            className="w-8 h-8 rounded-md bg-sky-500/10 ring-1 ring-sky-500/30 flex items-center justify-center text-sky-400 hover:bg-sky-500/20 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </a>
        ) : (
          <Disabled icon={MessageSquare} />
        )}
        {c.mailtoUrl ? (
          <a
            href={c.mailtoUrl}
            aria-label={`Email ${c.name}`}
            className="w-8 h-8 rounded-md bg-violet-500/10 ring-1 ring-violet-500/30 flex items-center justify-center text-violet-400 hover:bg-violet-500/20 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
          </a>
        ) : (
          <Disabled icon={Mail} />
        )}
      </div>
    </div>
  );
}

function Disabled({ icon: Icon }: { icon: typeof Phone }) {
  return (
    <div className="w-8 h-8 rounded-md bg-white/[0.02] ring-1 ring-white/5 flex items-center justify-center text-white/25">
      <Icon className="w-3.5 h-3.5" />
    </div>
  );
}

export default function FieldClients() {
  const { clients, loading, error } = useClientsLive(50);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const openProfile = useCallback(
    (id: string) => {
      navigate(`/clients?clientId=${encodeURIComponent(id)}&tab=overview`);
    },
    [navigate],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((c) => {
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.businessName ?? "").toLowerCase().includes(needle) ||
        (c.phone ?? "").toLowerCase().includes(needle) ||
        (c.email ?? "").toLowerCase().includes(needle)
      );
    });
  }, [clients, q]);

  return (
    <div className="space-y-3">
      <div className="px-0.5 flex items-baseline gap-2">
        <h1 className="text-base font-black text-white leading-none">Clients</h1>
        {!loading && (
          <span className="text-[9px] font-black uppercase tracking-widest text-white/35">
            {filtered.length}/{clients.length}
          </span>
        )}
      </div>

      {/* Search */}
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
            <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load clients</p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && clients.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-5 text-center">
          <UsersIcon className="w-5 h-5 text-white/30 mx-auto" />
          <p className="text-[11px] font-bold text-white/70 mt-1.5">No clients yet</p>
        </div>
      )}

      {!loading && !error && clients.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-4 text-center">
          <p className="text-[11px] font-bold text-white/70">No matches for "{q}"</p>
        </div>
      )}

      <div className="space-y-1.5">
        {filtered.map((c) => (
          <ClientCard key={c.id} c={c} onOpen={openProfile} />
        ))}
      </div>
    </div>
  );
}
