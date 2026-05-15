import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ExternalLink,
  Monitor,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

/**
 * Phone-only Protected Clients view for field workers.
 * Renders at `/protected-clients` on phones. Desktop/tablet continue to
 * render the full ProtectedClients page via a switch in App.tsx.
 *
 * Shows all active protection rules as a quick-reference list so field
 * staff can check risk levels before a job. The bridge card routes to
 * the full admin view for adding, editing, and managing risk rules.
 */

type ProtectionLevel = "Low" | "Med" | "High" | "Normal" | "Block Booking";

interface ProtectedClientRow {
  id: string;
  fullName: string;
  phone?: string;
  protectionLevel: ProtectionLevel | string;
  riskReason?: string;
  isActive: boolean;
}

function levelTone(level: string): string {
  switch (level) {
    case "High":
      return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
    case "Block Booking":
      return "bg-rose-600/20 text-rose-200 ring-rose-600/40";
    case "Med":
      return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    case "Low":
      return "bg-white/10 text-white/60 ring-white/15";
    default:
      return "bg-white/10 text-white/60 ring-white/15";
  }
}

function levelIconColor(level: string): string {
  switch (level) {
    case "High":
      return "text-rose-400";
    case "Block Booking":
      return "text-rose-300";
    case "Med":
      return "text-amber-400";
    default:
      return "text-white/40";
  }
}

export default function FieldProtectedClients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ProtectedClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "protected_clients"),
      where("isActive", "==", true),
      orderBy("createdAt", "desc"),
      limit(50),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: ProtectedClientRow[] = [];
        snap.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          const trim = (v: unknown) =>
            typeof v === "string" && v.trim() ? v.trim() : undefined;
          next.push({
            id: d.id,
            fullName: String(x.fullName ?? "Unknown"),
            phone: trim(x.phone),
            protectionLevel: String(x.protectionLevel ?? "Low"),
            riskReason: trim(x.riskReason),
            isActive: Boolean(x.isActive),
          });
        });
        setClients(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("[FieldProtectedClients] snapshot error", err);
        setError(err?.message || "Failed to load protected clients");
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="px-0.5 flex items-baseline gap-2">
        <h1 className="text-base font-black text-white leading-none">Protected Clients</h1>
        {!loading && (
          <span className="text-[9px] font-black uppercase tracking-widest text-white/35">
            {clients.length} active
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-3 flex items-center justify-center min-h-[56px]">
          <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
          <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/40">Loading…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load restrictions</p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">{error}</p>
          </div>
        </div>
      )}

      {/* Count summary banner */}
      {!loading && !error && clients.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-[11px] font-bold text-amber-300 leading-tight">
            {clients.length} active restriction{clients.length !== 1 ? "s" : ""} — review before booking
          </p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && clients.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-5 text-center">
          <ShieldCheck className="w-5 h-5 text-white/30 mx-auto" />
          <p className="text-[11px] font-bold text-white/70 mt-1.5">No active restrictions</p>
        </div>
      )}

      {/* Client list */}
      {!loading && !error && clients.length > 0 && (
        <div className="space-y-1.5">
          {clients.map((c) => (
            <div
              key={c.id}
              className="w-full rounded-xl border border-white/5 bg-sidebar/60 flex items-start gap-2.5 px-2.5 py-2.5 min-h-[48px]"
            >
              <div
                className={cn(
                  "shrink-0 w-8 h-8 rounded-md ring-1 flex items-center justify-center mt-0.5",
                  levelTone(c.protectionLevel),
                )}
              >
                <ShieldAlert className={cn("w-3.5 h-3.5", levelIconColor(c.protectionLevel))} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[12px] font-bold text-white truncate leading-tight">
                    {c.fullName}
                  </p>
                  <span
                    className={cn(
                      "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none shrink-0",
                      levelTone(c.protectionLevel),
                    )}
                  >
                    {c.protectionLevel}
                  </span>
                </div>
                {c.riskReason && (
                  <p className="text-[10px] text-white/45 leading-tight mt-0.5 line-clamp-2">
                    {c.riskReason}
                  </p>
                )}
                {c.phone && (
                  <p className="text-[10px] text-white/30 leading-tight mt-0.5">{c.phone}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bridge card */}
      <button
        type="button"
        onClick={() => navigate("/protected-clients?adminView=1")}
        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-2.5 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-md bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
          <Monitor className="w-4 h-4 text-white/50" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-bold text-white leading-tight">Open Full Admin View</p>
          <p className="text-[10px] text-white/40 leading-tight mt-0.5">Add, edit, and manage all risk rules</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>
    </div>
  );
}
