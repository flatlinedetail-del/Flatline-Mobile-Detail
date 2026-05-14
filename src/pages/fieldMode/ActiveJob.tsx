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
import { isCancellationStatus } from "../../services/jobStatusFlow";
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
} from "lucide-react";

/**
 * Phone-friendly Active Job screen — compact layout.
 *
 * Data wiring is unchanged from Phase 2 (live `onSnapshot` on the same
 * `appointments/{id}` doc the desktop JobDetail reads; status changes
 * use the same `updateDoc({ status, updatedAt })` pattern). This pass
 * tightens spacing/typography so the screen fits a phone properly.
 */

const STATUS_FLOW: { value: FieldJobStatus; label: string; icon: typeof PlayCircle; tone: string }[] = [
  { value: "confirmed",   label: "Confirm",  icon: CheckCircle2, tone: "bg-sky-500/15 text-sky-300 ring-sky-500/30" },
  { value: "en_route",    label: "En Route", icon: Navigation,   tone: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  { value: "in_progress", label: "Start",    icon: PlayCircle,   tone: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  { value: "completed",   label: "Complete", icon: CheckCircle2, tone: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
];

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

      {/* Status controls */}
      <section aria-label="Status" className="space-y-1.5">
        <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40">Job Status</h2>
        <div className="grid grid-cols-2 gap-1.5">
          {STATUS_FLOW.map((s) => {
            const active = rawStatus === s.value;
            const isUpdating = updating === s.value;
            return (
              <button
                key={s.value}
                type="button"
                disabled={isUpdating || active}
                onClick={() => onChangeStatus(s.value)}
                className={cn(
                  "rounded-xl border border-white/5 bg-sidebar/60 hover:bg-sidebar/80 active:bg-sidebar transition-colors px-2.5 py-2 min-h-[52px]",
                  "flex items-center gap-2 text-left",
                  active && "ring-1 ring-[#0A4DFF]/50 bg-[#0A4DFF]/10",
                  isUpdating && "opacity-60",
                )}
              >
                <span className={cn("shrink-0 w-7 h-7 rounded-md ring-1 flex items-center justify-center", s.tone)}>
                  <s.icon className="w-3.5 h-3.5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-white leading-none">
                    {s.label}
                  </span>
                  <span className="block text-[8px] font-medium text-white/40 truncate leading-tight mt-0.5">
                    {active ? "Current" : `→ ${statusLabel(s.value)}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {/* Cancellation / no-show / missed — three triggers, each opens
            the shared reason dialog. The status change is GATED on a
            reason being submitted. Disabled when the job is already in a
            terminal cancellation-class state. */}
        {!isCancellationStatus(rawStatus ?? "scheduled") && (
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => setReasonKind("canceled")}
              className="rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 active:bg-rose-500/15 transition-colors px-2 py-2 min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-rose-300"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest leading-none">Cancel</span>
            </button>
            <button
              type="button"
              onClick={() => setReasonKind("no_show")}
              className="rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 active:bg-rose-500/15 transition-colors px-2 py-2 min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-rose-300"
            >
              <UserX className="w-3.5 h-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest leading-none">No-show</span>
            </button>
            <button
              type="button"
              onClick={() => setReasonKind("missed")}
              className="rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 active:bg-rose-500/15 transition-colors px-2 py-2 min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-rose-300"
            >
              <CalendarX className="w-3.5 h-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest leading-none">Missed</span>
            </button>
          </div>
        )}
        {isCancellationStatus(rawStatus ?? "scheduled") && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-rose-300 text-center">
            {statusLabel(rawStatus!)} — booking intelligence disabled
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
