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
import { AlertCircle, ChevronRight, FileText } from "lucide-react";

/**
 * Phone-only Quotes view. Renders at `/quotes` when the device is a
 * phone, via QuotesSwitch in App.tsx. Desktop/tablet continue to
 * render the existing Smart Quote page unchanged.
 *
 * Tapping a row routes to `/quotes?quoteId=<id>` so the existing Quotes
 * page's detail handling (Smart Quote editor / send / accept / convert)
 * runs unmodified. No reduced phone-only feature set.
 */

interface FieldQuoteRow {
  id: string;
  clientName: string;
  total: number;
  status: string;
  createdAtMs: number;
}

function statusTone(s: string): string {
  switch (s) {
    case "approved": return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "sent": return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "draft": return "bg-white/10 text-white/70 ring-white/15";
    default: return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
  }
}

export default function FieldQuotes() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FieldQuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "quotes"), orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: FieldQuoteRow[] = [];
        snap.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          const created = x.createdAt as { toMillis?: () => number } | undefined;
          next.push({
            id: d.id,
            clientName: String(x.clientName ?? "Unknown client"),
            total: typeof x.total === "number" ? (x.total as number) : 0,
            status: String(x.status ?? "draft"),
            createdAtMs: typeof created?.toMillis === "function" ? created.toMillis() : 0,
          });
        });
        setRows(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("[FieldQuotes] snapshot error", err);
        setError(err?.message || "Failed to load quotes");
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  return (
    <div className="space-y-3">
      <div className="px-0.5 flex items-baseline gap-2">
        <h1 className="text-base font-black text-white leading-none">Smart Quotes</h1>
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
            <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load quotes</p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-5 text-center">
          <FileText className="w-5 h-5 text-white/30 mx-auto" />
          <p className="text-[11px] font-bold text-white/70 mt-1.5">No quotes yet</p>
          <button
            type="button"
            onClick={() => navigate("/quotes?new=1")}
            className="mt-2 text-[9px] font-black uppercase tracking-widest text-[#0A4DFF]"
          >
            Create quote
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => navigate(`/quotes?quoteId=${encodeURIComponent(r.id)}`)}
            className={cn(
              "w-full text-left rounded-xl border border-white/5 bg-sidebar/60",
              "hover:bg-sidebar/80 active:bg-sidebar transition-colors px-2.5 py-2 min-h-[56px]",
              "flex items-center gap-2.5",
            )}
          >
            <div className="shrink-0 w-9 h-9 rounded-md bg-sky-500/10 ring-1 ring-sky-500/30 flex items-center justify-center">
              <FileText className="w-4 h-4 text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-white truncate leading-tight">{r.clientName}</p>
              <p className="text-[10px] text-white/45 font-medium truncate leading-tight mt-0.5">
                ${r.total.toFixed(2)}
              </p>
              <span className={cn("inline-block mt-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none", statusTone(r.status))}>
                {r.status}
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
