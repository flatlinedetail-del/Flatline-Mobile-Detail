import { useEffect, useState } from "react";
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
  ChevronRight,
  Mail,
  Phone,
  UserPlus,
} from "lucide-react";

/**
 * Phone-only Leads view. Renders at `/leads` when the device is a
 * phone, via LeadsSwitch in App.tsx. Desktop/tablet continue to render
 * the existing full `Leads` page unchanged.
 *
 * Live snapshot of the same `leads` collection. Tapping a row routes
 * to `/leads?leadId=<id>` so the existing Leads page's deep-link flow
 * (or the desktop modal/edit panel) handles the detail — phone users
 * get the full feature set rather than a reduced view.
 */

interface FieldLeadRow {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  source?: string;
  status: string;
  priority?: string;
  createdAtMs: number;
}

function priorityTone(p?: string): string {
  switch (p) {
    case "hot": return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
    case "high": return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    case "medium": return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "low": return "bg-white/10 text-white/60 ring-white/15";
    default: return "bg-white/10 text-white/60 ring-white/15";
  }
}

function statusTone(s: string): string {
  switch (s) {
    case "new": return "bg-[#0A4DFF]/15 text-[#0A4DFF] ring-[#0A4DFF]/30";
    case "converted": return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "lost": return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
    case "quoted": return "bg-violet-500/15 text-violet-300 ring-violet-500/30";
    case "contacted": return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    default: return "bg-white/10 text-white/60 ring-white/15";
  }
}

export default function FieldLeads() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FieldLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: FieldLeadRow[] = [];
        snap.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          const created = x.createdAt as { toMillis?: () => number } | undefined;
          const trim = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
          next.push({
            id: d.id,
            name: String(x.name ?? "Unnamed lead"),
            phone: trim(x.phone),
            email: trim(x.email),
            source: trim(x.source),
            status: String(x.status ?? "new"),
            priority: trim(x.priority),
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

  return (
    <div className="space-y-3">
      <div className="px-0.5 flex items-baseline gap-2">
        <h1 className="text-base font-black text-white leading-none">Leads</h1>
        {!loading && (
          <span className="text-[9px] font-black uppercase tracking-widest text-white/35">{rows.length}</span>
        )}
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
            <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load leads</p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-5 text-center">
          <UserPlus className="w-5 h-5 text-white/30 mx-auto" />
          <p className="text-[11px] font-bold text-white/70 mt-1.5">No leads yet</p>
        </div>
      )}

      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-stretch gap-1 rounded-xl border border-white/5 bg-sidebar/60 hover:bg-sidebar/80 active:bg-sidebar transition-colors">
            <button
              type="button"
              onClick={() => navigate(`/leads?leadId=${encodeURIComponent(r.id)}`)}
              className="flex-1 min-w-0 text-left px-2.5 py-2 min-h-[56px] flex items-center gap-2.5"
            >
              <div className={cn("shrink-0 w-9 h-9 rounded-md ring-1 flex items-center justify-center", priorityTone(r.priority))}>
                <UserPlus className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-white truncate leading-tight">{r.name}</p>
                <p className="text-[10px] text-white/45 font-medium truncate leading-tight mt-0.5">
                  {r.source || r.phone || r.email || "—"}
                </p>
                <span className={cn("inline-block mt-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none", statusTone(r.status))}>
                  {r.status}
                </span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />
            </button>
            <div className="flex flex-col gap-0.5 justify-center pr-1.5 py-1">
              {r.phone && (
                <a
                  href={`tel:${r.phone}`}
                  aria-label={`Call ${r.name}`}
                  className="w-7 h-7 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20"
                >
                  <Phone className="w-3 h-3" />
                </a>
              )}
              {r.email && (
                <a
                  href={`mailto:${r.email}`}
                  aria-label={`Email ${r.name}`}
                  className="w-7 h-7 rounded-md bg-violet-500/10 ring-1 ring-violet-500/30 flex items-center justify-center text-violet-400 hover:bg-violet-500/20"
                >
                  <Mail className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
