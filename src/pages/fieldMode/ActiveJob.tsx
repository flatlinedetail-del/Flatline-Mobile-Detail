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
import { cn } from "@/lib/utils";
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
} from "lucide-react";

/**
 * Phone-friendly Active Job screen — compact layout.
 *
 * Data wiring is unchanged from Phase 2 (live `onSnapshot` on the same
 * `appointments/{id}` doc the desktop JobDetail reads; status changes
 * use the same `updateDoc({ status, updatedAt })` pattern). This pass
 * tightens spacing/typography so the screen fits a phone properly.
 *
 * Status flow uses `nextStatus()` from jobStatusFlow so only a single
 * primary action is shown at a time. Cancel / No-Show / Missed are
 * collapsed behind a "More actions" toggle.
 */

type NextJobAction = {
  targetStatus: FieldJobStatus;
  label: string;
  subLabel: string;
  icon: typeof PlayCircle;
  iconTone: string;
  buttonTone: string;
};

/**
 * Returns the single next forward action for a given job status, or null
 * when the job is already in a terminal state (completed/paid) or a
 * cancellation state. Normalises pre-flow statuses (requested, approved,
 * etc.) so anything unconfirmed shows "Confirm Job" as the first step.
 *
 * NOTE: "paid" is intentionally excluded — payment is handled via the
 * Invoice section, not a status button here.
 */
function getNextJobStatusAction(status: FieldJobStatus): NextJobAction | null {
  // Map pre-flow booking statuses to "scheduled" so the confirm step shows.
  const onFlow: FieldJobStatus = (
    ["pending", "requested", "approved", "pending_approval",
     "suggested", "declined", "reschedule_suggested"] as string[]
  ).includes(status)
    ? "scheduled"
    : status;

  const target = nextStatus(onFlow);
  // Treat "paid" as terminal — don't surface a "Mark Paid" button here.
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

export default function ActiveJob() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<FieldJob | null>(null);
  // Keep the raw Appointment alongside the FieldJob view-model so the
  // cancellation-fee preview can read existing fields (cancellationFeeEnabled,
  // cancellationCutoffHours, etc.) without re-fetching.
  const [raw, setRaw] = useState<Appointment | null>(null);
  const [rawStatus, setRawStatus] = useState<FieldJobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<FieldJobStatus | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  // Cancellation/no-show/missed reason dialog state.
  const [reasonKind, setReasonKind] = useState<CancellationKind | null>(null);
  const [reasonSubmitting, setReasonSubmitting] = useState(false);
  // Collapsed "More actions" toggle for Cancel / No-Show / Missed.
  const [showDangerActions, setShowDangerActions] = useState(false);

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

  // Cancellation-fee preview, mirroring the desktop JobDetail.tsx logic
  // (this is a READ-ONLY display preview — the actual fee is computed
  // and applied by the existing desktop code path on cancel; on phone
  // we surface the same math so the technician knows before submitting).
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

  /**
   * Cancellation / no-show / missed flow. The status change is GATED on
   * a reason being submitted via the shared CancellationReasonDialog.
   *
   * On submit we:
   *   1. Write the reason field appropriate to the kind.
   *   2. Set the status to the matching value.
   *   3. Set `bookingIntelligenceActive: false` (item 8: once a job is
   *      cancelled/no_show/missed, all per-job booking intelligence is
   *      disabled across surfaces).
   *   4. For cancellations: record cancellationTimestamp + cancellationStatus
   *      reflecting whether a fee applies (we mirror the existing JobDetail
   *      math so analytics agree; the desktop page's own fee handler still
   *      runs for cancellations originating there).
   *   5. After a successful cancellation, fire `handleWaitlistRouting`
   *      so admins are notified if a waitlist candidate can fill the slot.
   */
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
          // Fire-and-forget waitlist notification; surface any error to the
          // user without blocking the status change that already succeeded.
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

  // Compute once per render — pure, fast switch fn, no useMemo needed.
  // Placed BEFORE the early returns so the value is always initialised even
  // though the status section only renders when !loading && !error && !!job.
  const nextAction = getNextJobStatusAction(rawStatus ?? "scheduled");

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

      {/* Header card */}
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
      </div>

      {/* Vehicle + service summary */}
      <section className="rounded-xl border border-white/5 bg-sidebar/60 p-3 space-y-2">
        <SummaryRow icon={Car} tone="primary" label="Vehicle" value={job.vehicleInfo || "Not specified"} />
        <SummaryRow
          icon={CheckCircle2}
          tone="emerald"
          label="Services"
          value={job.serviceNames.length > 0 ? job.serviceNames.join(", ") : "No services listed"}
        />
        {job.address && (
          <SummaryRow icon={MapPin} tone="sky" label="Address" value={job.address} multiline />
        )}
      </section>

      {/* Contact actions */}
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

      {/* Navigation widgets removed pending the backend-driven default provider.
          Address still renders in the summary card above. */}

      {/* Status controls — single next-action button + collapsed danger actions */}
      <section aria-label="Status" className="space-y-2">
        <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40">Job Status</h2>

        {/* ── Terminal cancellation state ───────────────────────────── */}
        {isCancellationStatus(rawStatus ?? "scheduled") ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-3 flex items-center gap-2.5">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-rose-500/15 ring-1 ring-rose-500/30 flex items-center justify-center">
              <XCircle className="w-4.5 h-4.5 text-rose-400" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-rose-300 leading-none">
                {statusLabel(rawStatus!)}
              </p>
              <p className="text-[10px] text-rose-300/60 mt-0.5 leading-tight">Booking intelligence disabled</p>
            </div>
          </div>

        ) : !nextAction ? (
          /* ── Completed / paid — no forward action remaining ──────── */
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 flex items-center gap-2.5">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-300 leading-none">
                {statusLabel(rawStatus ?? "completed")}
              </p>
              <p className="text-[10px] text-emerald-300/60 mt-0.5 leading-tight">No further actions required</p>
            </div>
          </div>
        ) : (
          /* ── Primary single-action button ─────────────────────────── */
          <button
            type="button"
            disabled={updating !== null}
            onClick={() => onChangeStatus(nextAction.targetStatus)}
            className={cn(
              "w-full rounded-2xl px-3.5 py-4 min-h-[76px]",
              "flex items-center gap-3.5 text-left transition-all",
              "active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
              nextAction.buttonTone,
              updating !== null && "opacity-60 pointer-events-none",
            )}
          >
            {/* Icon */}
            <div className={cn("shrink-0 w-11 h-11 rounded-xl flex items-center justify-center", nextAction.iconTone)}>
              {updating === nextAction.targetStatus
                ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : <nextAction.icon className="w-5 h-5" />
              }
            </div>
            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-black uppercase tracking-wide leading-none">
                {updating === nextAction.targetStatus ? "Updating…" : nextAction.label}
              </p>
              <p className="text-[10px] font-medium opacity-55 leading-tight mt-1">
                {nextAction.subLabel}
              </p>
            </div>
          </button>
        )}

        {/* ── More actions: Cancel / No-Show / Missed ──────────────────
            Collapsed by default so the primary flow stays clean.
            Gate: hidden once the job is already in a cancellation state. */}
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

      {/* Upsell Intelligence — link to the existing feature.
          Hidden once the job is cancelled / no-show / missed, OR when
          the booking-intelligence flag has been explicitly set to false
          (item 8: no booking intelligence on a cancelled job). */}
      {!isCancellationStatus(rawStatus ?? "scheduled") &&
        raw?.bookingIntelligenceActive !== false && (
          <section aria-label="Upsell Intelligence" className="space-y-1.5">
            <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40">Upsell Intelligence</h2>
            <Link
              to={`/calendar/${job.id}`}
              className="flex items-center gap-2.5 w-full rounded-xl border border-violet-500/20 bg-violet-500/[0.06] hover:bg-violet-500/10 active:bg-violet-500/15 transition-colors px-2.5 py-2 min-h-[48px]"
            >
              <div className="shrink-0 w-8 h-8 rounded-md bg-violet-500/15 ring-1 ring-violet-500/30 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-violet-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-white truncate leading-tight">Run Revenue Optimization</p>
                <p className="text-[10px] text-white/55 leading-tight mt-0.5 break-words">
                  Opens the full Upsell Intelligence panel in job detail
                </p>
              </div>
            </Link>
          </section>
        )}

      {/* Open full job */}
      <section aria-label="Invoice" className="space-y-1.5">
        <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40">Invoice & Detail</h2>
        <Link
          to={`/calendar/${job.id}`}
          className="flex items-center gap-2.5 w-full rounded-xl border border-white/5 bg-sidebar/60 hover:bg-sidebar/80 active:bg-sidebar transition-colors px-2.5 py-2 min-h-[48px]"
        >
          <div className="shrink-0 w-8 h-8 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center">
            <Receipt className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-white truncate leading-tight">Open full job detail</p>
            <p className="text-[10px] text-white/45 truncate leading-tight mt-0.5">Invoice, payment, photos, signature</p>
          </div>
        </Link>
      </section>

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
    </div>
  );
}

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
