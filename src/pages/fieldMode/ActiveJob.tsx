import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { Appointment } from "../../types";
import {
  formatJobTime,
  statusLabel,
  toFieldJob,
  type FieldJob,
  type FieldJobStatus,
} from "../../services/fieldJob";
import { handleWaitlistRouting } from "../../services/waitlistRouting";
import { isCancellationStatus, nextStatus } from "../../services/jobStatusFlow";
import CancellationReasonDialog, { type CancellationKind, type CancellationReasonResult } from "../../components/CancellationReasonDialog";
import { getEffectiveRisk } from "../../lib/riskUtils";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Phone,
  MessageSquare,
  Mail,
  Navigation,
  PlayCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Car,
  Receipt,
  MapPin,
  Sparkles,
  UserX,
  CalendarX,
  ChevronDown,
  ChevronUp,
  Shield,
  Star,
  Map,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type NextJobAction = {
  targetStatus: FieldJobStatus;
  label: string;
  subLabel: string;
  icon: typeof PlayCircle;
  iconTone: string;
  buttonTone: string;
};

type ClientRiskInfo = {
  label: string;
  badgeClass: string;
  navTarget: "clients" | "protected-clients";
};

type MapsProvider = "apple" | "google" | "waze";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the single next forward action for a given job status, or null
 * when the job is already in a terminal state (completed/paid) or a
 * cancellation state.
 */
function getNextJobStatusAction(status: FieldJobStatus): NextJobAction | null {
  const onFlow: FieldJobStatus = (
    ["pending", "requested", "approved", "pending_approval",
     "suggested", "declined", "reschedule_suggested"] as string[]
  ).includes(status)
    ? "scheduled"
    : status;

  const target = nextStatus(onFlow);
  if (!target || target === "paid") return null;

  switch (target) {
    case "confirmed":
      return {
        targetStatus: "confirmed",
        label: "Confirm Job",
        subLabel: "Lock in the appointment",
        icon: CheckCircle2,
        iconTone: "bg-sky-500/20 ring-1 ring-sky-400/30 text-sky-300",
        buttonTone: "bg-sky-500/10 border border-sky-500/25 hover:bg-sky-500/15 active:bg-sky-500/20 text-sky-100",
      };
    case "en_route":
      return {
        targetStatus: "en_route",
        label: "En Route",
        subLabel: "You're heading to the client",
        icon: Navigation,
        iconTone: "bg-amber-500/20 ring-1 ring-amber-400/30 text-amber-300",
        buttonTone: "bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/15 active:bg-amber-500/20 text-amber-100",
      };
    case "in_progress":
      return {
        targetStatus: "in_progress",
        label: "Start Job",
        subLabel: "You've arrived — work begins now",
        icon: PlayCircle,
        iconTone: "bg-violet-500/20 ring-1 ring-violet-400/30 text-violet-300",
        buttonTone: "bg-violet-500/10 border border-violet-500/25 hover:bg-violet-500/15 active:bg-violet-500/20 text-violet-100",
      };
    case "completed":
      return {
        targetStatus: "completed",
        label: "Complete Job",
        subLabel: "Mark the job as finished",
        icon: CheckCircle2,
        iconTone: "bg-emerald-500/20 ring-1 ring-emerald-400/30 text-emerald-300",
        buttonTone: "bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/15 active:bg-emerald-500/20 text-emerald-100",
      };
    default:
      return null;
  }
}

function paymentTone(p: FieldJob["paymentStatus"]): string {
  switch (p) {
    case "paid":    return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "partial": return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    default:        return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
  }
}

function paymentLabel(p: FieldJob["paymentStatus"]): string {
  switch (p) {
    case "paid":    return "Paid";
    case "partial": return "Partial";
    default:        return "Unpaid";
  }
}

/**
 * Derive client risk display info from the live client doc + appointment-level
 * protected-client match data. Priority order (highest wins):
 *   Protected (High/Block) → VIP → High Risk → Payment Risk → Medium Risk
 *   → Watchlist (Med protected) → Low Risk (default)
 */
function deriveClientRisk(
  client: Record<string, unknown> | null,
  protectedMatch: boolean,
  protectionLevel: string | null | undefined,
): ClientRiskInfo {
  // Protected / Block Booking (appointment was flagged at booking time)
  if (protectedMatch && (protectionLevel === "High" || protectionLevel === "Block Booking")) {
    return {
      label: "Protected",
      badgeClass: "bg-red-900/40 text-red-300 border-red-500/30",
      navTarget: "protected-clients",
    };
  }

  // VIP
  if (client?.isVIP) {
    return {
      label: "VIP",
      badgeClass: "bg-violet-500/20 text-violet-300 border-violet-500/30",
      navTarget: "clients",
    };
  }

  // High Risk (from client doc risk fields via riskUtils)
  const canonicalRisk = getEffectiveRisk(client);
  if (canonicalRisk === "high" || canonicalRisk === "critical" || canonicalRisk === "do_not_book" || canonicalRisk === "block_booking") {
    return {
      label: "High Risk",
      badgeClass: "bg-red-500/20 text-red-300 border-red-500/20",
      navTarget: "clients",
    };
  }

  // Payment Risk (outstanding cancellation fee)
  if (typeof client?.outstandingCancellationFee === "number" && (client.outstandingCancellationFee as number) > 0) {
    return {
      label: "Payment Risk",
      badgeClass: "bg-rose-500/20 text-rose-300 border-rose-500/20",
      navTarget: "clients",
    };
  }

  // Medium Risk
  if (canonicalRisk === "medium") {
    return {
      label: "Medium Risk",
      badgeClass: "bg-orange-500/20 text-orange-300 border-orange-500/20",
      navTarget: "clients",
    };
  }

  // Watchlist — protected match with Med level
  if (protectedMatch && protectionLevel === "Med") {
    return {
      label: "Watchlist",
      badgeClass: "bg-amber-900/30 text-amber-300 border-amber-500/30",
      navTarget: "protected-clients",
    };
  }

  // Default: Low Risk (no flags)
  return {
    label: "No Risk Flags",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
    navTarget: "clients",
  };
}

/** Open a maps/navigation app deep link. Falls back to web URL for Google/Waze. */
function openMaps(address: string, provider: MapsProvider) {
  const enc = encodeURIComponent(address);
  switch (provider) {
    case "apple":
      window.location.href = `maps:?daddr=${enc}`;
      break;
    case "google":
      window.open(`https://maps.google.com/?daddr=${enc}`, "_blank", "noopener,noreferrer");
      break;
    case "waze":
      window.open(`https://waze.com/ul?q=${enc}&navigate=yes`, "_blank", "noopener,noreferrer");
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ActiveJob() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<FieldJob | null>(null);
  const [raw, setRaw] = useState<Appointment | null>(null);
  const [rawStatus, setRawStatus] = useState<FieldJobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<FieldJobStatus | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [reasonKind, setReasonKind] = useState<CancellationKind | null>(null);
  const [reasonSubmitting, setReasonSubmitting] = useState(false);
  const [showDangerActions, setShowDangerActions] = useState(false);

  // Client risk state — live Firestore subscription
  const [clientRisk, setClientRisk] = useState<ClientRiskInfo | null>(null);
  const [clientRiskLoading, setClientRiskLoading] = useState(false);

  // Maps navigation selector dialog
  const [showMapsDialog, setShowMapsDialog] = useState(false);

  // ── Appointment subscription ────────────────────────────────────────────
  useEffect(() => {
    if (!id) {
      setError("Missing job id");
      setLoading(false);
      return;
    }
    const ref = doc(db, "appointments", id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setError("Job not found");
          setJob(null);
          setRaw(null);
          setRawStatus(null);
          setLoading(false);
          return;
        }
        const data = { id: snap.id, ...(snap.data() as object) } as Appointment;
        const mapped = toFieldJob(data);
        setRaw(data);
        setJob(mapped);
        setRawStatus(mapped.status);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("[ActiveJob] snapshot error", err);
        setError(err?.message || "Failed to load job");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [id]);

  // ── Client risk live subscription ───────────────────────────────────────
  useEffect(() => {
    if (!raw) return;

    const aptProtectedMatch = raw.protectedClientMatch === true;
    const aptProtectionLevel = (raw.protectionLevel as string | null) ?? null;

    const clientId = (raw.clientId as string | undefined) || (raw.customerId as string | undefined);
    if (!clientId) {
      // No client doc — derive from appointment-level data only
      setClientRisk(deriveClientRisk(null, aptProtectedMatch, aptProtectionLevel));
      return;
    }

    setClientRiskLoading(true);
    const clientRef = doc(db, "clients", clientId);
    const unsub = onSnapshot(
      clientRef,
      (snap) => {
        if (!snap.exists()) {
          setClientRisk(deriveClientRisk(null, aptProtectedMatch, aptProtectionLevel));
        } else {
          const clientData = { id: snap.id, ...(snap.data() as Record<string, unknown>) };
          setClientRisk(deriveClientRisk(clientData, aptProtectedMatch, aptProtectionLevel));
        }
        setClientRiskLoading(false);
      },
      (err) => {
        console.warn("[ActiveJob] client risk snapshot error", err);
        setClientRisk(deriveClientRisk(null, aptProtectedMatch, aptProtectionLevel));
        setClientRiskLoading(false);
      },
    );
    return () => unsub();
  }, [raw]);

  // ── Cancellation fee preview ────────────────────────────────────────────
  const feePreview = useMemo(() => {
    if (!raw || !raw.scheduledAt) return { willApply: false, amount: 0 };
    const scheduledMs = (raw.scheduledAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0;
    if (!scheduledMs) return { willApply: false, amount: 0 };
    const hoursUntilJob = (scheduledMs - Date.now()) / (1000 * 60 * 60);
    const cutoff = typeof raw.cancellationCutoffHours === "number" ? raw.cancellationCutoffHours : 24;
    const afterCutoff = hoursUntilJob < cutoff;
    if (!raw.cancellationFeeEnabled || !afterCutoff) return { willApply: false, amount: 0 };
    let fee = 0;
    if (raw.cancellationFeeType === "percentage") {
      fee = ((raw.totalAmount || 0) * (raw.cancellationFeeAmount || 0)) / 100;
    } else {
      fee = raw.cancellationFeeAmount || 0;
    }
    return { willApply: fee > 0, amount: fee };
  }, [raw]);

  // ── Status change ───────────────────────────────────────────────────────
  const onChangeStatus = useCallback(
    async (next: FieldJobStatus) => {
      if (!id || !job) return;
      setUpdating(next);
      setUpdateError(null);
      try {
        await updateDoc(doc(db, "appointments", id), {
          status: next,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Status update failed";
        console.warn("[ActiveJob] status update failed", e);
        setUpdateError(msg);
      } finally {
        setUpdating(null);
      }
    },
    [id, job],
  );

  // ── Cancellation / no-show / missed reason submit ───────────────────────
  const onSubmitReason = useCallback(
    async (result: CancellationReasonResult) => {
      if (!id || !raw || !reasonKind) return;
      setReasonSubmitting(true);
      setUpdateError(null);
      try {
        const update: Record<string, unknown> = {
          status: reasonKind,
          updatedAt: serverTimestamp(),
          bookingIntelligenceActive: false,
        };
        if (reasonKind === "canceled") {
          update.cancellationReason = result.reason;
          update.cancellationReasonCategory = result.category;
          update.cancellationTimestamp = serverTimestamp();
          update.cancellationStatus = feePreview.willApply ? "applied" : "none";
          update.cancellationFeeApplied = feePreview.willApply ? feePreview.amount : 0;
        } else if (reasonKind === "no_show") {
          update.noShowReason = result.reason;
          update.cancellationReasonCategory = result.category;
        } else if (reasonKind === "missed") {
          update.missedReason = result.reason;
          update.cancellationReasonCategory = result.category;
        }
        await updateDoc(doc(db, "appointments", id), update);

        if (reasonKind === "canceled") {
          try {
            await handleWaitlistRouting({ ...raw, id, status: "canceled" });
          } catch (e) {
            console.warn("[ActiveJob] waitlist routing failed (non-fatal)", e);
          }
        }

        setReasonKind(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Update failed";
        console.warn("[ActiveJob] reason submit failed", e);
        setUpdateError(msg);
      } finally {
        setReasonSubmitting(false);
      }
    },
    [id, raw, reasonKind, feePreview],
  );

  const nextAction = getNextJobStatusAction(rawStatus ?? "scheduled");

  // ── Early returns ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <div className="w-4 h-4 border border-white/10 border-t-white/40 rounded-full animate-spin" />
        <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Loading…</span>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="space-y-2.5 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2.5 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-rose-300">{error || "Job unavailable"}</p>
            <p className="text-[10px] text-rose-300/70 mt-0.5">
              Try opening it from the Schedule or check your connection.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Helpers for risk navigation ─────────────────────────────────────────
  const riskNavTo = clientRisk ? `/${clientRisk.navTarget}` : "/clients";
  const showsProtectedNav = clientRisk?.navTarget === "protected-clients";

  return (
    <div className="space-y-3">
      {/* Back nav */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      {/* ── Header card ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/5 bg-sidebar/60 p-3 space-y-1.5">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 leading-none">Active Job</p>
        <h1 className="text-base font-black text-white leading-tight break-words">{job.clientName}</h1>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-0.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/50 leading-none">
            {formatJobTime(job.scheduledAt)}
          </span>
          <span className="text-white/20 leading-none">·</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-white/70 leading-none">
            {statusLabel(job.status)}
          </span>
          <span
            className={cn(
              "ml-auto text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none",
              paymentTone(job.paymentStatus),
            )}
          >
            {paymentLabel(job.paymentStatus)}
            {job.totalAmount > 0 ? ` · $${job.totalAmount.toFixed(2)}` : ""}
          </span>
        </div>

        {/* Client risk badge — live, tappable */}
        {!clientRiskLoading && clientRisk && (
          <Link
            to={riskNavTo}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[9px] font-black uppercase tracking-widest leading-none transition-opacity hover:opacity-80 active:opacity-60",
              clientRisk.badgeClass,
            )}
          >
            {showsProtectedNav ? (
              <Shield className="w-2.5 h-2.5" />
            ) : clientRisk.label === "VIP" ? (
              <Star className="w-2.5 h-2.5" />
            ) : (
              <AlertCircle className="w-2.5 h-2.5" />
            )}
            {clientRisk.label}
          </Link>
        )}
      </div>

      {/* ── Vehicle + service summary ─────────────────────────────────────── */}
      <section className="rounded-xl border border-white/5 bg-sidebar/60 p-3 space-y-2">
        <SummaryRow icon={Car} tone="primary" label="Vehicle" value={job.vehicleInfo || "Not specified"} />
        <SummaryRow
          icon={CheckCircle2}
          tone="emerald"
          label="Services"
          value={job.serviceNames.length > 0 ? job.serviceNames.join(", ") : "No services listed"}
        />
        {/* Address — tappable navigation launcher */}
        {job.address && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowMapsDialog(true)}
            onKeyDown={(e) => e.key === "Enter" && setShowMapsDialog(true)}
            className="flex items-start gap-2.5 cursor-pointer group active:opacity-70 transition-opacity"
          >
            <div className="shrink-0 w-7 h-7 rounded-md ring-1 bg-sky-500/10 ring-sky-500/30 flex items-center justify-center">
              <MapPin className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none">Address</p>
              <p className="text-[12px] font-bold text-white leading-tight mt-0.5 break-words group-hover:text-sky-300 transition-colors">
                {job.address}
              </p>
              <p className="text-[9px] font-medium text-sky-400/60 leading-none mt-0.5 flex items-center gap-0.5">
                <Navigation className="w-2.5 h-2.5" /> Tap to navigate
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── Contact actions ───────────────────────────────────────────────── */}
      {(job.telUrl || job.smsUrl || job.mailtoUrl) && (
        <section aria-label="Contact" className="space-y-1.5">
          <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40">Contact</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {job.telUrl ? (
              <ActionTile href={job.telUrl} icon={Phone} label="Call" tone="text-emerald-400" />
            ) : (
              <ActionDisabled icon={Phone} label="Call" />
            )}
            {job.smsUrl ? (
              <ActionTile href={job.smsUrl} icon={MessageSquare} label="Text" tone="text-sky-400" />
            ) : (
              <ActionDisabled icon={MessageSquare} label="Text" />
            )}
            {job.mailtoUrl ? (
              <ActionTile href={job.mailtoUrl} icon={Mail} label="Email" tone="text-violet-400" />
            ) : (
              <ActionDisabled icon={Mail} label="Email" />
            )}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PRIMARY ACTION ROW — 2-column: [Job Status] [Invoice & Detail]
      ══════════════════════════════════════════════════════════════════════ */}
      <section aria-label="Actions" className="space-y-2">
        <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40">Job Status</h2>

        <div className="grid grid-cols-2 gap-2 items-stretch">

          {/* ── LEFT: Job Status ─────────────────────────────────────────── */}
          <div className="flex flex-col">
            {isCancellationStatus(rawStatus ?? "scheduled") ? (
              /* Terminal cancellation */
              <div className="flex-1 rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-3 flex flex-col items-center justify-center gap-1.5 text-center min-h-[90px]">
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 ring-1 ring-rose-500/30 flex items-center justify-center">
                  <XCircle className="w-4.5 h-4.5 text-rose-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-rose-300 leading-none">
                    {statusLabel(rawStatus!)}
                  </p>
                  <p className="text-[9px] text-rose-300/50 mt-0.5 leading-tight">Intelligence disabled</p>
                </div>
              </div>

            ) : !nextAction ? (
              /* Completed / paid — no further actions */
              <div className="flex-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-3 flex flex-col items-center justify-center gap-1.5 text-center min-h-[90px]">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center">
                  <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300 leading-none">
                    {statusLabel(rawStatus ?? "completed")}
                  </p>
                  <p className="text-[9px] text-emerald-300/50 mt-0.5 leading-tight">No further actions</p>
                </div>
              </div>

            ) : (
              /* Primary single-action button */
              <button
                type="button"
                disabled={updating !== null}
                onClick={() => onChangeStatus(nextAction.targetStatus)}
                className={cn(
                  "flex-1 rounded-2xl px-2.5 py-3 min-h-[90px]",
                  "flex flex-col items-center justify-center gap-2 text-center transition-all",
                  "active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                  nextAction.buttonTone,
                  updating !== null && "opacity-60 pointer-events-none",
                )}
              >
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", nextAction.iconTone)}>
                  {updating === nextAction.targetStatus
                    ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    : <nextAction.icon className="w-5 h-5" />
                  }
                </div>
                <div>
                  <p className="text-[12px] font-black uppercase tracking-wide leading-none">
                    {updating === nextAction.targetStatus ? "Updating…" : nextAction.label}
                  </p>
                  <p className="text-[9px] font-medium opacity-55 leading-tight mt-0.5">
                    {nextAction.subLabel}
                  </p>
                </div>
              </button>
            )}
          </div>

          {/* ── RIGHT: Invoice & Detail — premium glowing red ────────────── */}
          <Link
            to={`/calendar/${job.id}`}
            className={cn(
              "flex flex-col items-center justify-center gap-2 text-center",
              "rounded-2xl min-h-[90px] px-2.5 py-3",
              "border border-rose-500/50",
              "bg-gradient-to-br from-rose-950/90 via-rose-900/60 to-red-950/80",
              "shadow-[0_0_18px_rgba(239,68,68,0.28),inset_0_1px_0_rgba(255,100,100,0.12)]",
              "hover:shadow-[0_0_28px_rgba(239,68,68,0.45),inset_0_1px_0_rgba(255,100,100,0.18)]",
              "hover:border-rose-500/70",
              "active:scale-[0.97] active:shadow-[0_0_12px_rgba(239,68,68,0.2)]",
              "transition-all duration-150",
            )}
          >
            <div className="w-10 h-10 rounded-xl bg-rose-500/25 ring-2 ring-rose-500/50 flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.3)]">
              <Receipt className="w-5 h-5 text-rose-200" />
            </div>
            <div>
              <p className="text-[12px] font-black uppercase tracking-wide text-rose-100 leading-none">Invoice</p>
              <p className="text-[9px] font-bold text-rose-300/80 leading-tight mt-0.5">&amp; Detail</p>
              <p className="text-[8px] text-rose-300/50 leading-tight mt-0.5">Pay · Photos · Sign</p>
            </div>
          </Link>
        </div>

        {/* ── More actions: Cancel / No-Show / Missed (full width, below) ── */}
        {!isCancellationStatus(rawStatus ?? "scheduled") && (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setShowDangerActions((v) => !v)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-white/30 hover:text-white/50 transition-colors"
            >
              <span className="text-[9px] font-black uppercase tracking-widest">More actions</span>
              {showDangerActions
                ? <ChevronUp className="w-3 h-3" />
                : <ChevronDown className="w-3 h-3" />
              }
            </button>
            {showDangerActions && (
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setReasonKind("canceled")}
                  className="rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 active:bg-rose-500/15 transition-colors px-2 py-2.5 min-h-[48px] flex flex-col items-center justify-center gap-1 text-rose-300"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-black uppercase tracking-widest leading-none">Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReasonKind("no_show")}
                  className="rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 active:bg-rose-500/15 transition-colors px-2 py-2.5 min-h-[48px] flex flex-col items-center justify-center gap-1 text-rose-300"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-black uppercase tracking-widest leading-none">No-Show</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReasonKind("missed")}
                  className="rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 active:bg-rose-500/15 transition-colors px-2 py-2.5 min-h-[48px] flex flex-col items-center justify-center gap-1 text-rose-300"
                >
                  <CalendarX className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-black uppercase tracking-widest leading-none">Missed</span>
                </button>
              </div>
            )}
          </div>
        )}

        {updateError && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-2 py-1.5 flex items-start gap-1.5">
            <AlertCircle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
            <p className="text-[9px] text-rose-300 break-words leading-tight">{updateError}</p>
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          UPSELL INTELLIGENCE — full-width premium AI card, below action row
          Hidden when job is cancelled or booking intelligence is disabled.
      ══════════════════════════════════════════════════════════════════════ */}
      {!isCancellationStatus(rawStatus ?? "scheduled") &&
        raw?.bookingIntelligenceActive !== false && (
          <section aria-label="Upsell Intelligence">
            <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">Upsell Intelligence</h2>
            <Link
              to={`/calendar/${job.id}`}
              className={cn(
                "flex items-center gap-3 w-full rounded-xl px-3 py-3 min-h-[60px]",
                "border border-violet-500/30",
                "bg-gradient-to-r from-violet-950/80 via-violet-900/50 to-purple-950/70",
                "shadow-[0_0_14px_rgba(139,92,246,0.2),inset_0_1px_0_rgba(167,139,250,0.1)]",
                "hover:shadow-[0_0_22px_rgba(139,92,246,0.35)]",
                "hover:border-violet-500/45",
                "active:scale-[0.98] transition-all duration-150",
              )}
            >
              <div className="shrink-0 w-10 h-10 rounded-xl bg-violet-500/20 ring-2 ring-violet-500/40 flex items-center justify-center shadow-[0_0_8px_rgba(139,92,246,0.25)]">
                <Sparkles className="w-4.5 h-4.5 text-violet-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-black text-violet-100 truncate leading-tight">Run Revenue Optimization</p>
                <p className="text-[10px] text-violet-300/60 leading-tight mt-0.5 break-words">
                  Upsell Intelligence · AI recommendations
                </p>
              </div>
              <Sparkles className="w-3.5 h-3.5 text-violet-400/60 shrink-0" />
            </Link>
          </section>
        )}

      {/* ── Cancellation reason dialog ────────────────────────────────────── */}
      <CancellationReasonDialog
        open={reasonKind !== null}
        kind={reasonKind ?? "canceled"}
        feePreview={reasonKind === "canceled" ? feePreview : undefined}
        busy={reasonSubmitting}
        onOpenChange={(next) => {
          if (!next && !reasonSubmitting) setReasonKind(null);
        }}
        onSubmit={onSubmitReason}
      />

      {/* ── Maps navigation selector dialog ──────────────────────────────── */}
      <Dialog open={showMapsDialog} onOpenChange={setShowMapsDialog}>
        <DialogContent className="max-w-xs mx-auto bg-[#0D0D0D] border border-white/10 rounded-2xl p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-[12px] font-black uppercase tracking-widest text-white/70 text-left">
              Open in Maps
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-[10px] text-white/40 leading-tight truncate">{job.address}</p>
            <div className="space-y-1.5 pt-1">
              <MapsOption
                label="Apple Maps"
                icon={Map}
                tone="text-sky-300"
                iconBg="bg-sky-500/15 ring-sky-500/30"
                onSelect={() => { openMaps(job.address!, "apple"); setShowMapsDialog(false); }}
              />
              <MapsOption
                label="Google Maps"
                icon={Map}
                tone="text-emerald-300"
                iconBg="bg-emerald-500/15 ring-emerald-500/30"
                onSelect={() => { openMaps(job.address!, "google"); setShowMapsDialog(false); }}
              />
              <MapsOption
                label="Waze"
                icon={Navigation}
                tone="text-violet-300"
                iconBg="bg-violet-500/15 ring-violet-500/30"
                onSelect={() => { openMaps(job.address!, "waze"); setShowMapsDialog(false); }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SummaryRow({
  icon: Icon,
  tone,
  label,
  value,
  multiline,
}: {
  icon: typeof Car;
  tone: "primary" | "emerald" | "sky";
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const toneClass =
    tone === "primary" ? "bg-[#0A4DFF]/10 ring-[#0A4DFF]/30 text-[#0A4DFF]" :
    tone === "emerald" ? "bg-emerald-500/10 ring-emerald-500/30 text-emerald-400" :
    "bg-sky-500/10 ring-sky-500/30 text-sky-400";
  return (
    <div className="flex items-start gap-2.5">
      <div className={cn("shrink-0 w-7 h-7 rounded-md ring-1 flex items-center justify-center", toneClass)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none">{label}</p>
        <p className={cn("text-[12px] font-bold text-white leading-tight mt-0.5", multiline ? "break-words" : "truncate")}>
          {value}
        </p>
      </div>
    </div>
  );
}

function ActionTile({ href, icon: Icon, label, tone, external }: { href: string; icon: typeof Phone; label: string; tone: string; external?: boolean }) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-white/5 bg-sidebar/60 hover:bg-sidebar/80 active:bg-sidebar transition-colors py-2 min-h-[52px]"
    >
      <Icon className={cn("w-4 h-4", tone)} />
      <span className="text-[9px] font-black uppercase tracking-widest text-white leading-none">{label}</span>
    </a>
  );
}

function ActionDisabled({ icon: Icon, label }: { icon: typeof Phone; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-white/5 bg-sidebar/30 opacity-50 py-2 min-h-[52px]">
      <Icon className="w-4 h-4 text-white/40" />
      <span className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none">{label}</span>
    </div>
  );
}

function MapsOption({
  label,
  icon: Icon,
  tone,
  iconBg,
  onSelect,
}: {
  label: string;
  icon: typeof Map;
  tone: string;
  iconBg: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-2.5 rounded-xl border border-white/5 bg-sidebar/60 hover:bg-sidebar/80 active:bg-sidebar transition-colors px-2.5 py-2.5"
    >
      <div className={cn("shrink-0 w-8 h-8 rounded-md ring-1 flex items-center justify-center", iconBg)}>
        <Icon className={cn("w-4 h-4", tone)} />
      </div>
      <span className="text-[12px] font-bold text-white">{label}</span>
    </button>
  );
}
