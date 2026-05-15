import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useNavigate } from "react-router-dom";
import { cn, toJsDateOrNull } from "@/lib/utils";
import {
  AlertCircle,
  Clock,
  ExternalLink,
  Monitor,
  Users,
} from "lucide-react";

/**
 * Phone-only Waitlist view for field workers.
 * Renders at `/waitlist` on phones. Desktop/tablet continue to render
 * the full Waitlist page via a switch in App.tsx.
 *
 * Shows all waitlisted, pending-waitlist, and offered appointments so
 * field staff can see who's waiting. The bridge card routes to the full
 * admin view for managing slot offers, notifications, and auto-fill.
 */

type WaitlistStatus = "waitlisted" | "pending_waitlist" | "offered";

interface WaitlistRow {
  id: string;
  customerName: string;
  serviceNames: string[];
  scheduledAtMs: number | null;
  status: WaitlistStatus | string;
  totalAmount: number;
}

function statusTone(status: string): string {
  switch (status) {
    case "waitlisted":
      return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    case "offered":
      return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "pending_waitlist":
      return "bg-white/10 text-white/50 ring-white/15";
    default:
      return "bg-white/10 text-white/50 ring-white/15";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "waitlisted":       return "Waitlisted";
    case "offered":          return "Offered";
    case "pending_waitlist": return "Pending";
    default:                 return status;
  }
}

function fmtDateTime(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export default function FieldWaitlist() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "appointments"),
      where("status", "in", ["waitlisted", "pending_waitlist", "offered"]),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: WaitlistRow[] = [];
        snap.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          const jsDate = toJsDateOrNull(x.scheduledAt);
          const rawServices = x.serviceNames;
          const serviceNames: string[] = Array.isArray(rawServices)
            ? rawServices.map((s) => String(s)).filter(Boolean)
            : [];
          next.push({
            id: d.id,
            customerName: String(x.customerName ?? "Unknown customer"),
            serviceNames,
            scheduledAtMs: jsDate ? jsDate.getTime() : null,
            status: String(x.status ?? "waitlisted"),
            totalAmount:
              typeof x.totalAmount === "number" ? (x.totalAmount as number) : 0,
          });
        });
        // Sort: offered first, then waitlisted, then pending; within each group by scheduledAt asc
        next.sort((a, b) => {
          const order: Record<string, number> = { offered: 0, waitlisted: 1, pending_waitlist: 2 };
          const ao = order[a.status] ?? 3;
          const bo = order[b.status] ?? 3;
          if (ao !== bo) return ao - bo;
          const at = a.scheduledAtMs ?? Infinity;
          const bt = b.scheduledAtMs ?? Infinity;
          return at - bt;
        });
        setRows(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("[FieldWaitlist] snapshot error", err);
        setError(err?.message || "Failed to load waitlist");
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="px-0.5 flex items-baseline gap-2">
        <h1 className="text-base font-black text-white leading-none">Waitlist</h1>
        {!loading && (
          <span className="text-[9px] font-black uppercase tracking-widest text-white/35">
            {rows.length} on waitlist
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
            <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load waitlist</p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">{error}</p>
          </div>
        </div>
      )}

      {/* Count banner */}
      {!loading && !error && rows.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-2.5 flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-white/40 shrink-0" />
          <p className="text-[11px] font-bold text-white/70 leading-tight">
            {rows.length} customer{rows.length !== 1 ? "s" : ""} on waitlist
          </p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && rows.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-5 text-center">
          <Users className="w-5 h-5 text-white/30 mx-auto" />
          <p className="text-[11px] font-bold text-white/70 mt-1.5">No one on the waitlist</p>
        </div>
      )}

      {/* Waitlist rows */}
      {!loading && !error && rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.id}
              className="w-full rounded-xl border border-white/5 bg-sidebar/60 flex items-start gap-2.5 px-2.5 py-2.5 min-h-[48px]"
            >
              <div className="shrink-0 w-8 h-8 rounded-md bg-white/[0.06] ring-1 ring-white/15 flex items-center justify-center mt-0.5">
                <Clock className="w-3.5 h-3.5 text-white/45" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[12px] font-bold text-white truncate leading-tight">
                    {r.customerName}
                  </p>
                  <span
                    className={cn(
                      "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none shrink-0",
                      statusTone(r.status),
                    )}
                  >
                    {statusLabel(r.status)}
                  </span>
                </div>

                {r.serviceNames.length > 0 && (
                  <p className="text-[10px] text-white/45 leading-tight mt-0.5 truncate">
                    {r.serviceNames.join(", ")}
                  </p>
                )}

                {r.scheduledAtMs !== null && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="w-2.5 h-2.5 text-white/30 shrink-0" />
                    <p className="text-[10px] text-white/40 leading-tight">
                      {fmtDateTime(r.scheduledAtMs)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bridge card */}
      <button
        type="button"
        onClick={() => navigate("/waitlist?adminView=1")}
        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-2.5 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-md bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
          <Monitor className="w-4 h-4 text-white/50" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-bold text-white leading-tight">Open Full Admin View</p>
          <p className="text-[10px] text-white/40 leading-tight mt-0.5">Manage slot offers, notifications, and auto-fill</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>
    </div>
  );
}
