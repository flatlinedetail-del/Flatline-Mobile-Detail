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
import { cn, toJsDateOrNull } from "@/lib/utils";
import {
  AlertCircle,
  Clock,
  ExternalLink,
  MessageSquare,
  Monitor as MonitorIcon,
  Send,
} from "lucide-react";

/**
 * Phone-only Marketing view. Rendered at `/marketing` when the device is
 * a phone. Subscribes to the `marketing_campaigns` collection (most
 * recently created first, capped at 10) and lists campaign name, status
 * badge, type, creation date, and optional recipient count.
 *
 * No duplicate store — reads the same collection the desktop Marketing
 * page uses. Passing `?adminView=1` falls through to the full desktop
 * Marketing Suite with campaign creation, templates, and analytics.
 */

type CampaignStatus = "draft" | "sent" | "scheduled" | "completed" | string;

interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  type: string;
  createdAtMs: number;
  recipientCount?: number;
}

function toCampaign(id: string, data: Record<string, unknown>): Campaign {
  const d = toJsDateOrNull(data.createdAt);
  return {
    id,
    name: String(data.name ?? "Untitled Campaign"),
    status: String(data.status ?? "draft"),
    type: String(data.type ?? ""),
    createdAtMs: d ? d.getTime() : 0,
    recipientCount:
      typeof data.recipientCount === "number"
        ? (data.recipientCount as number)
        : undefined,
  };
}

function statusTone(status: CampaignStatus): string {
  switch (status) {
    case "sent":
    case "completed":
      return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "scheduled":
      return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "draft":
      return "bg-white/10 text-white/50 ring-white/15";
    default:
      return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
  }
}

function statusIcon(status: CampaignStatus) {
  switch (status) {
    case "sent":
    case "completed":
      return Send;
    case "scheduled":
      return Clock;
    default:
      return MessageSquare;
  }
}

function fmtDate(ms: number): string {
  if (!ms) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

export default function FieldMarketing() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "marketing_campaigns"),
      orderBy("createdAt", "desc"),
      limit(10),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Campaign[] = [];
        snap.forEach((docSnap) =>
          next.push(toCampaign(docSnap.id, docSnap.data() as Record<string, unknown>)),
        );
        setCampaigns(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("[FieldMarketing] snapshot error", err);
        setError(err?.message || "Failed to load campaigns");
        setLoading(false);
      },
    );

    return () => unsub();
  }, []);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="px-0.5 flex items-baseline gap-2">
        <h1 className="text-base font-black text-white leading-none">Marketing</h1>
        {!loading && (
          <span className="text-[9px] font-black uppercase tracking-widest text-white/35">
            {campaigns.length} recent
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-3 flex items-center justify-center min-h-[56px]">
          <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
          <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/40">
            Loading…
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-300 leading-tight">
              Couldn't load campaigns
            </p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && campaigns.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-5 text-center">
          <MessageSquare className="w-5 h-5 text-white/30 mx-auto" />
          <p className="text-[11px] font-bold text-white/70 mt-1.5">No campaigns yet</p>
          <p className="text-[10px] text-white/40 mt-0.5">
            Create your first campaign in the full admin view
          </p>
        </div>
      )}

      {/* Campaign list */}
      {!loading && !error && campaigns.length > 0 && (
        <div className="space-y-1.5">
          {campaigns.map((c) => {
            const StatusIcon = statusIcon(c.status);
            return (
              <div
                key={c.id}
                className="rounded-xl border border-white/5 bg-sidebar/40 px-2.5 py-2 flex items-center gap-2.5 min-h-[48px]"
              >
                {/* Icon */}
                <div className="shrink-0 w-8 h-8 rounded-md bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center">
                  <StatusIcon className="w-3.5 h-3.5 text-white/50" />
                </div>

                {/* Meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-white truncate leading-tight">
                    {c.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {c.type && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/40">
                        {c.type}
                      </span>
                    )}
                    {c.type && c.createdAtMs > 0 && (
                      <span className="text-[9px] text-white/20">·</span>
                    )}
                    {c.createdAtMs > 0 && (
                      <span className="text-[9px] text-white/35">{fmtDate(c.createdAtMs)}</span>
                    )}
                    {c.recipientCount !== undefined && (
                      <>
                        <span className="text-[9px] text-white/20">·</span>
                        <span className="text-[9px] text-white/40">
                          {c.recipientCount.toLocaleString()} recipients
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <span
                  className={cn(
                    "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none shrink-0",
                    statusTone(c.status),
                  )}
                >
                  {c.status}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Bridge card */}
      <button
        type="button"
        onClick={() => navigate("/marketing?adminView=1")}
        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-2.5 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-md bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
          <MonitorIcon className="w-4 h-4 text-white/50" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-bold text-white leading-tight">Open Full Marketing Suite</p>
          <p className="text-[10px] text-white/40 leading-tight mt-0.5">
            Create campaigns, manage templates, view analytics
          </p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>
    </div>
  );
}
