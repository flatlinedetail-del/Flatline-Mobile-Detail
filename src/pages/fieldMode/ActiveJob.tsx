import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { Appointment, Client, Invoice, Service, Vehicle } from "../../types";
import {
  formatJobTime,
  statusLabel,
  toFieldJob,
  type FieldJob,
  type FieldJobStatus,
} from "../../services/fieldJob";
import { handleWaitlistRouting } from "../../services/waitlistRouting";
import { isCancellationStatus, nextStatus } from "../../services/jobStatusFlow";
import { computeUpsells, type UpsellRecommendation } from "../../services/upsellEngine";
import { messagingService } from "../../services/messagingService";
import CancellationReasonDialog, { type CancellationKind, type CancellationReasonResult } from "../../components/CancellationReasonDialog";
import { cn, formatCurrency } from "@/lib/utils";
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
  MapPin,
  Sparkles,
  UserX,
  CalendarX,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Plus,
  Minus,
  RefreshCw,
  Star,
  CalendarPlus,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type NextJobAction = {
  targetStatus: FieldJobStatus;
  label: string;
  subLabel: string;
  icon: typeof PlayCircle;
  iconTone: string;
  buttonTone: string;
};

type PaymentMethod = "cash" | "card" | "zelle" | "apple_pay" | "check";

// Appointment extended with cached AI fields not yet in the strict type.
type RawWithAI = Appointment & {
  fieldAiRecs?: UpsellRecommendation[];
  fieldAiRecsAt?: unknown;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNextJobStatusAction(status: FieldJobStatus): NextJobAction | null {
  const onFlow: FieldJobStatus = (
    ["pending", "requested", "approved", "pending_approval",
     "suggested", "declined", "reschedule_suggested"] as string[]
  ).includes(status) ? "scheduled" : status;

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

const PAYMENT_METHODS: { id: PaymentMethod; label: string; emoji: string }[] = [
  { id: "cash",      label: "Cash",      emoji: "💵" },
  { id: "card",      label: "Card",      emoji: "💳" },
  { id: "zelle",     label: "Zelle",     emoji: "⚡" },
  { id: "apple_pay", label: "Apple Pay", emoji: "🍎" },
  { id: "check",     label: "Check",     emoji: "📄" },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ActiveJob() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // ── Core job state ──────────────────────────────────────────────────────────
  const [job, setJob]           = useState<FieldJob | null>(null);
  const [raw, setRaw]           = useState<RawWithAI | null>(null);
  const [rawStatus, setRawStatus] = useState<FieldJobStatus | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [updating, setUpdating] = useState<FieldJobStatus | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // ── Danger actions ──────────────────────────────────────────────────────────
  const [reasonKind, setReasonKind]           = useState<CancellationKind | null>(null);
  const [reasonSubmitting, setReasonSubmitting] = useState(false);
  const [showDangerActions, setShowDangerActions] = useState(false);

  // ── Upsell / AI recs ────────────────────────────────────────────────────────
  const [upsells, setUpsells]           = useState<UpsellRecommendation[]>([]);
  const [upsellsLoading, setUpsellsLoading] = useState(false);
  const [upsellsReady, setUpsellsReady]   = useState(false);
  const [showUpsellPanel, setShowUpsellPanel] = useState(false);
  const [acceptedRecIds, setAcceptedRecIds] = useState<Set<string>>(new Set());
  const upsellLoadRef = useRef(false); // Prevent duplicate fetches

  // ── Payment ─────────────────────────────────────────────────────────────────
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError]   = useState<string | null>(null);
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string | null>(null);
  const [linkedInvoiceTotal, setLinkedInvoiceTotal] = useState<number>(0);

  // ── Completion tools ────────────────────────────────────────────────────────
  const [completionNotes, setCompletionNotes] = useState("");
  const [reviewRequestSent, setReviewRequestSent] = useState(false);
  const [reviewSending, setReviewSending] = useState(false);

  // ── Firestore snapshot ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) { setError("Missing job id"); setLoading(false); return; }
    const ref = doc(db, "appointments", id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setError("Job not found");
          setJob(null); setRaw(null); setRawStatus(null);
          setLoading(false);
          return;
        }
        const data = { id: snap.id, ...(snap.data() as object) } as RawWithAI;
        const mapped = toFieldJob(data);
        setRaw(data);
        setJob(mapped);
        setRawStatus(mapped.status);
        setLoading(false);
        setError(null);
        // Pre-seed review request state from the appointment's smsStatus
        if (data.smsStatus?.reviewRequestSent) setReviewRequestSent(true);
      },
      (err) => {
        console.warn("[ActiveJob] snapshot error", err);
        setError(err?.message || "Failed to load job");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [id]);

  // ── Find linked invoice once job is loaded ──────────────────────────────────
  useEffect(() => {
    if (!id || linkedInvoiceId !== null) return;
    const run = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "invoices"), where("appointmentId", "==", id), limit(1)),
        );
        if (!snap.empty) {
          const d = snap.docs[0];
          setLinkedInvoiceId(d.id);
          setLinkedInvoiceTotal((d.data() as Invoice).total ?? 0);
        }
      } catch (e) {
        console.warn("[ActiveJob] invoice lookup failed", e);
      }
    };
    if (id) run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Auto-load upsells once when the job document first arrives ─────────────
  // Fires for any non-cancelled status so results are cached before completion.
  // Auto-opens the panel only when the job is already completed+unpaid.
  useEffect(() => {
    if (!raw || !job) return;
    if (isCancellationStatus(rawStatus ?? "scheduled")) return;
    if (upsellsReady || upsellLoadRef.current) return;
    upsellLoadRef.current = true;
    loadUpsells(raw);
    if (rawStatus === "completed" && job.paymentStatus !== "paid") {
      setShowUpsellPanel(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw?.id]);

  // ── Cancellation fee preview ────────────────────────────────────────────────
  const feePreview = useMemo(() => {
    if (!raw?.scheduledAt) return { willApply: false, amount: 0 };
    const scheduledMs = (raw.scheduledAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0;
    if (!scheduledMs) return { willApply: false, amount: 0 };
    const hoursUntilJob = (scheduledMs - Date.now()) / (1000 * 60 * 60);
    const cutoff = typeof raw.cancellationCutoffHours === "number" ? raw.cancellationCutoffHours : 24;
    if (!raw.cancellationFeeEnabled || hoursUntilJob >= cutoff) return { willApply: false, amount: 0 };
    const fee = raw.cancellationFeeType === "percentage"
      ? ((raw.totalAmount || 0) * (raw.cancellationFeeAmount || 0)) / 100
      : (raw.cancellationFeeAmount || 0);
    return { willApply: fee > 0, amount: fee };
  }, [raw]);

  const nextAction = getNextJobStatusAction(rawStatus ?? "scheduled");

  // ── Status update ───────────────────────────────────────────────────────────
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
        setUpdateError(e instanceof Error ? e.message : "Status update failed");
        console.warn("[ActiveJob] status update failed", e);
      } finally {
        setUpdating(null);
      }
    },
    [id, job],
  );

  // When "Complete Job" is tapped: update status AND open upsell panel
  const handleCompleteJob = useCallback(async () => {
    await onChangeStatus("completed");
    if (job?.paymentStatus !== "paid") {
      setShowUpsellPanel(true);
    }
  }, [onChangeStatus, job?.paymentStatus]);

  // ── Cancellation flow ───────────────────────────────────────────────────────
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
          try { await handleWaitlistRouting({ ...raw, id, status: "canceled" }); }
          catch (e) { console.warn("[ActiveJob] waitlist routing failed (non-fatal)", e); }
        }
        setReasonKind(null);
      } catch (e) {
        setUpdateError(e instanceof Error ? e.message : "Update failed");
        console.warn("[ActiveJob] reason submit failed", e);
      } finally {
        setReasonSubmitting(false);
      }
    },
    [id, raw, reasonKind, feePreview],
  );

  // ── AI Upsell Load ──────────────────────────────────────────────────────────
  const loadUpsells = useCallback(async (rawDoc: RawWithAI) => {
    // Use cached recs if available and recent (< 4 hours old)
    if (rawDoc.fieldAiRecs && Array.isArray(rawDoc.fieldAiRecs) && rawDoc.fieldAiRecs.length > 0) {
      setUpsells(rawDoc.fieldAiRecs);
      setUpsellsReady(true);
      return;
    }
    setUpsellsLoading(true);
    try {
      const clientId = (rawDoc.clientId as string | undefined) || (rawDoc.customerId as string | undefined);
      if (!clientId) { setUpsells([]); setUpsellsReady(true); return; }

      const [clientSnap, vehiclesSnap, apptsSnap, servicesSnap] = await Promise.all([
        getDoc(doc(db, "clients", clientId)),
        getDocs(query(collection(db, "vehicles"), where("clientId", "==", clientId), limit(10))),
        getDocs(query(collection(db, "appointments"), where("clientId", "==", clientId), orderBy("scheduledAt", "desc"), limit(20))),
        getDocs(query(collection(db, "services"), limit(80))),
      ]);

      if (!clientSnap.exists()) { setUpsells([]); setUpsellsReady(true); return; }

      const client = { id: clientSnap.id, ...clientSnap.data() } as Client;
      const vehicles = vehiclesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Vehicle[];
      const appointments = apptsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Appointment[];
      const services = servicesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Service[];

      const recs = computeUpsells({ client, appointments, vehicles, services });

      // Cache on appointment doc so subsequent opens skip the fetch
      if (id) {
        await updateDoc(doc(db, "appointments", id), {
          fieldAiRecs: recs,
          fieldAiRecsAt: serverTimestamp(),
        });
      }

      setUpsells(recs);
    } catch (e) {
      console.warn("[ActiveJob] upsell computation failed", e);
      setUpsells([]);
    } finally {
      setUpsellsLoading(false);
      setUpsellsReady(true);
    }
  }, [id]);

  const handleForceRefreshUpsells = useCallback(async () => {
    if (!raw || !id) return;
    // Clear cache then re-compute
    try {
      await updateDoc(doc(db, "appointments", id), { fieldAiRecs: [] });
    } catch (_) { /* non-fatal */ }
    upsellLoadRef.current = false;
    setUpsellsReady(false);
    setUpsells([]);
    const cleared = { ...raw, fieldAiRecs: [] } as RawWithAI;
    loadUpsells(cleared);
  }, [raw, id, loadUpsells]);

  const toggleRec = (recId: string) => {
    setAcceptedRecIds((prev) => {
      const next = new Set(prev);
      if (next.has(recId)) next.delete(recId);
      else next.add(recId);
      return next;
    });
  };

  // ── Payment recording ───────────────────────────────────────────────────────
  const handleRecordPayment = useCallback(async () => {
    if (!id || !selectedPaymentMethod || !job) return;
    setPaymentBusy(true);
    setPaymentError(null);
    try {
      const now = serverTimestamp();
      const methodLabel = PAYMENT_METHODS.find((m) => m.id === selectedPaymentMethod)?.label ?? selectedPaymentMethod;
      const amount = linkedInvoiceTotal || job.totalAmount;

      // Build recommendation line items to persist on invoice
      const acceptedLineItems = upsells
        .filter((r) => acceptedRecIds.has(r.id))
        .map((r) => ({
          serviceName: r.title,
          description: r.reason,
          quantity: 1,
          price: r.estimatedPriceImpact ?? 0,
          total: r.estimatedPriceImpact ?? 0,
          source: "ai_recommendation",
          protocolAccepted: false,
        }));

      const declinedLineItems = upsells
        .filter((r) => !acceptedRecIds.has(r.id))
        .map((r) => ({
          serviceName: r.title,
          description: r.reason,
          quantity: 1,
          price: 0,
          total: 0,
          source: "ai_recommendation_declined",
          protocolAccepted: false,
        }));

      // Update invoice if one is linked
      if (linkedInvoiceId) {
        const invoiceUpdate: Record<string, unknown> = {
          paymentStatus: "paid",
          status: "paid",
          paidAt: now,
          paymentMethodDetails: methodLabel,
          amountPaid: amount,
          updatedAt: now,
          paymentHistory: arrayUnion({
            action: "paid",
            timestamp: new Date().toISOString(),
            method: methodLabel,
            amount,
          }),
        };
        if (acceptedLineItems.length > 0) {
          invoiceUpdate.lineItems = arrayUnion(...acceptedLineItems);
        }
        if (declinedLineItems.length > 0) {
          invoiceUpdate.recommendedItems = declinedLineItems;
        }
        await updateDoc(doc(db, "invoices", linkedInvoiceId), invoiceUpdate);
        sessionStorage.removeItem("invoices_cache");
        sessionStorage.removeItem("invoices_cache_time");
      }

      // Always update appointment payment status
      await updateDoc(doc(db, "appointments", id), {
        paymentStatus: "paid",
        paymentMethod: selectedPaymentMethod,
        updatedAt: now,
      });

      // Send SMS confirmation (non-fatal if it fails)
      try {
        if (raw?.customerPhone) {
          await messagingService.sendTemplateSms(
            raw.customerPhone,
            "payment_received",
            {
              customerName: job.clientName,
              businessName: "DetailFlow",
              serviceName: job.serviceNames.join(", "),
              amount: formatCurrency(amount),
            },
            id,
            job.clientId,
          );
        }
      } catch (e) {
        console.warn("[ActiveJob] payment SMS failed (non-fatal)", e);
      }

      setShowPaymentDialog(false);
      setSelectedPaymentMethod(null);
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : "Payment recording failed");
      console.warn("[ActiveJob] payment failed", e);
    } finally {
      setPaymentBusy(false);
    }
  }, [id, selectedPaymentMethod, job, linkedInvoiceId, linkedInvoiceTotal, upsells, acceptedRecIds, raw]);

  // ── Review request ──────────────────────────────────────────────────────────
  const handleRequestReview = useCallback(async () => {
    if (!raw?.customerPhone || !id || reviewRequestSent) return;
    setReviewSending(true);
    try {
      await messagingService.sendTemplateSms(
        raw.customerPhone,
        "review_request",
        {
          customerName: job?.clientName ?? "there",
          businessName: "DetailFlow",
          serviceName: job?.serviceNames.join(", ") ?? "",
        },
        id,
        job?.clientId,
      );
      await updateDoc(doc(db, "appointments", id), {
        "smsStatus.reviewRequestSent": true,
        updatedAt: serverTimestamp(),
      });
      setReviewRequestSent(true);
    } catch (e) {
      console.warn("[ActiveJob] review request failed", e);
    } finally {
      setReviewSending(false);
    }
  }, [raw, id, job, reviewRequestSent]);

  // ── Save completion notes ───────────────────────────────────────────────────
  const handleSaveNotes = useCallback(async () => {
    if (!id || !completionNotes.trim()) return;
    try {
      await updateDoc(doc(db, "appointments", id), {
        completionNotes: completionNotes.trim(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("[ActiveJob] save notes failed", e);
    }
  }, [id, completionNotes]);

  // ─────────────────────────────────────────────────────────────────────────────

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
        <button type="button" onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2.5 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-rose-300">{error || "Job unavailable"}</p>
            <p className="text-[10px] text-rose-300/70 mt-0.5">Try opening it from the Schedule or check your connection.</p>
          </div>
        </div>
      </div>
    );
  }

  const isCompleted = rawStatus === "completed";
  const isPaid      = job.paymentStatus === "paid";
  const isCancelled = isCancellationStatus(rawStatus ?? "scheduled");

  return (
    <div className="space-y-3 pb-6">
      {/* ── Back nav ── */}
      <button type="button" onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      {/* ── Header card ── */}
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
          <span className={cn(
            "ml-auto text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none",
            paymentTone(job.paymentStatus),
          )}>
            {paymentLabel(job.paymentStatus)}
            {job.totalAmount > 0 ? ` · ${formatCurrency(job.totalAmount)}` : ""}
          </span>
        </div>
        {/* Deposit / risk flags */}
        {(job.depositRequired && !job.depositPaid) && (
          <p className="text-[9px] font-black uppercase tracking-widest text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/20 rounded px-1.5 py-0.5 leading-none w-fit">
            Deposit Required
          </p>
        )}
        {job.clientRiskLevel === "high" && (
          <p className="text-[9px] font-black uppercase tracking-widest text-rose-300 bg-rose-500/10 ring-1 ring-rose-500/20 rounded px-1.5 py-0.5 leading-none w-fit">
            High-Risk Client
          </p>
        )}
      </div>

      {/* ── Vehicle + service summary ── */}
      <section className="rounded-xl border border-white/5 bg-sidebar/60 p-3 space-y-2">
        <SummaryRow icon={Car} tone="primary" label="Vehicle" value={job.vehicleInfo || "Not specified"} />
        <SummaryRow
          icon={CheckCircle2} tone="emerald" label="Services"
          value={job.serviceNames.length > 0 ? job.serviceNames.join(", ") : "No services listed"}
        />
        {job.address && (
          <SummaryRow icon={MapPin} tone="sky" label="Address" value={job.address} multiline />
        )}
      </section>

      {/* ── Contact actions ── */}
      {(job.telUrl || job.smsUrl || job.mailtoUrl) && (
        <section aria-label="Contact" className="space-y-1.5">
          <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40">Contact</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {job.telUrl
              ? <ActionTile href={job.telUrl} icon={Phone} label="Call" tone="text-emerald-400" />
              : <ActionDisabled icon={Phone} label="Call" />}
            {job.smsUrl
              ? <ActionTile href={job.smsUrl} icon={MessageSquare} label="Text" tone="text-sky-400" />
              : <ActionDisabled icon={MessageSquare} label="Text" />}
            {job.mailtoUrl
              ? <ActionTile href={job.mailtoUrl} icon={Mail} label="Email" tone="text-violet-400" />
              : <ActionDisabled icon={Mail} label="Email" />}
          </div>
        </section>
      )}

      {/* ── Status controls ── */}
      <section aria-label="Status" className="space-y-2">
        <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40">Job Status</h2>

        {isCancelled ? (
          /* Cancelled terminal */
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

        ) : isCompleted && isPaid ? (
          /* Completed + paid — all done */
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 flex items-center gap-2.5">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-300 leading-none">
                Job Complete
              </p>
              <p className="text-[10px] text-emerald-300/60 mt-0.5 leading-tight">Payment received · No further actions</p>
            </div>
          </div>

        ) : isCompleted && !isPaid ? (
          /* Completed + unpaid — payment required */
          <div className="space-y-2">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-3">
              <div className="flex items-center gap-2.5">
                <div className="shrink-0 w-9 h-9 rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30 flex items-center justify-center">
                  <DollarSign className="w-4.5 h-4.5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-widest text-amber-300 leading-none">
                    Payment Required
                  </p>
                  <p className="text-[10px] text-amber-300/60 mt-0.5 leading-tight">
                    {linkedInvoiceTotal > 0
                      ? `${formatCurrency(linkedInvoiceTotal)} outstanding`
                      : job.totalAmount > 0
                      ? `${formatCurrency(job.totalAmount)} outstanding`
                      : "Invoice not yet generated"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentDialog(true)}
                className="mt-3 w-full rounded-xl bg-amber-500/20 hover:bg-amber-500/30 active:bg-amber-500/40 border border-amber-500/30 text-amber-200 font-black text-[12px] uppercase tracking-wide px-3 py-2.5 transition-colors"
              >
                Record Payment
              </button>
            </div>
          </div>

        ) : nextAction ? (
          /* Pre-completion — primary action button */
          <button
            type="button"
            disabled={updating !== null}
            onClick={nextAction.targetStatus === "completed" ? handleCompleteJob : () => onChangeStatus(nextAction.targetStatus)}
            className={cn(
              "w-full rounded-2xl px-3.5 py-4 min-h-[76px]",
              "flex items-center gap-3.5 text-left transition-all",
              "active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
              nextAction.buttonTone,
              updating !== null && "opacity-60 pointer-events-none",
            )}
          >
            <div className={cn("shrink-0 w-11 h-11 rounded-xl flex items-center justify-center", nextAction.iconTone)}>
              {updating === nextAction.targetStatus
                ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : <nextAction.icon className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-black uppercase tracking-wide leading-none">
                {updating === nextAction.targetStatus ? "Updating…" : nextAction.label}
              </p>
              <p className="text-[10px] font-medium opacity-55 leading-tight mt-1">{nextAction.subLabel}</p>
            </div>
          </button>
        ) : null}

        {updateError && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-2 py-1.5 flex items-start gap-1.5">
            <AlertCircle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
            <p className="text-[9px] text-rose-300 break-words leading-tight">{updateError}</p>
          </div>
        )}
      </section>

      {/* ── Revenue Optimization — 4-state card + inline recommendations ── */}
      {!isCancelled && raw?.bookingIntelligenceActive !== false && (
        <section aria-label="Revenue Optimization" className="space-y-1.5">

          {/* ── State: Loading ── */}
          {upsellsLoading && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-3 py-3 flex items-center gap-2.5">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-violet-500/15 ring-1 ring-violet-500/25 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wide text-violet-200 leading-none">Optimizing Revenue…</p>
                <p className="text-[9px] text-violet-300/50 font-medium mt-0.5 leading-tight">Analyzing service history and opportunities</p>
              </div>
            </div>
          )}

          {/* ── State: Not yet run (manual trigger) ── */}
          {!upsellsLoading && !upsellsReady && (
            <button
              type="button"
              onClick={() => {
                upsellLoadRef.current = false;
                setUpsells([]);
                setUpsellsReady(false);
                if (raw) loadUpsells(raw);
              }}
              className="w-full rounded-xl border border-violet-500/25 bg-gradient-to-r from-violet-950/60 to-purple-950/40 px-3 py-3 flex items-center gap-2.5 transition-all active:scale-[0.985] shadow-[0_0_12px_rgba(139,92,246,0.12)]"
            >
              <div className="shrink-0 w-9 h-9 rounded-xl bg-violet-500/20 ring-1 ring-violet-500/35 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-violet-300" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[12px] font-black uppercase tracking-wide text-violet-100 leading-none">Run Revenue Optimization</p>
                <p className="text-[9px] text-violet-300/55 font-medium mt-0.5 leading-tight">AI upsell &amp; service recommendations</p>
              </div>
              <Sparkles className="w-3.5 h-3.5 text-violet-400/40 shrink-0" />
            </button>
          )}

          {/* ── State: No recommendations ── */}
          {!upsellsLoading && upsellsReady && upsells.length === 0 && (
            <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-3 flex items-center gap-2.5">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-400/55" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wide text-white/45 leading-none">No Smart Upsells Right Now</p>
                <p className="text-[9px] text-white/25 font-medium mt-0.5 leading-tight">Client is on an optimal service cycle</p>
              </div>
              <button
                type="button"
                onClick={handleForceRefreshUpsells}
                className="shrink-0 p-1.5 text-white/20 hover:text-white/50 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ── State: Results ready ── */}
          {!upsellsLoading && upsellsReady && upsells.length > 0 && (
            <div className="space-y-2">
              {/* Ready card — tap to expand / collapse */}
              <button
                type="button"
                onClick={() => setShowUpsellPanel((v) => !v)}
                className="w-full rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-950/60 to-purple-950/40 px-3 py-3 flex items-center gap-2.5 transition-all active:scale-[0.985] shadow-[0_0_14px_rgba(139,92,246,0.15)]"
              >
                <div className="shrink-0 w-9 h-9 rounded-xl bg-violet-500/20 ring-2 ring-violet-500/40 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-violet-300" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[12px] font-black uppercase tracking-wide text-violet-100 leading-none">Revenue Optimization Ready</p>
                    <span className="text-[8px] font-black uppercase tracking-widest bg-violet-500/30 text-violet-200 ring-1 ring-violet-500/40 px-1.5 py-0.5 rounded leading-none">
                      {upsells.length}
                    </span>
                  </div>
                  <p className="text-[9px] text-violet-300/55 font-medium mt-0.5 leading-tight">
                    {upsells.length} revenue opportunit{upsells.length !== 1 ? "ies" : "y"} identified
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleForceRefreshUpsells(); }}
                    className="p-1 text-violet-400/35 hover:text-violet-400/70 transition-colors"
                    title="Refresh recommendations"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                  {showUpsellPanel
                    ? <ChevronUp className="w-3.5 h-3.5 text-violet-400/55" />
                    : <ChevronDown className="w-3.5 h-3.5 text-violet-400/55" />}
                </div>
              </button>

              {/* Inline recommendations panel */}
              {showUpsellPanel && (
                <div className="space-y-2">
                  {upsells.map((rec) => {
                    const isAccepted = acceptedRecIds.has(rec.id);
                    const isBlocked  = Boolean(rec.blockedBy);
                    return (
                      <div
                        key={rec.id}
                        className={cn(
                          "rounded-xl border px-3 py-2.5 transition-all",
                          isAccepted
                            ? "border-emerald-500/30 bg-emerald-500/[0.08]"
                            : isBlocked
                            ? "border-white/5 bg-sidebar/30 opacity-50"
                            : "border-violet-500/15 bg-violet-500/5",
                        )}
                      >
                        {/* Rec header */}
                        <div className="flex items-start gap-2.5">
                          <div className={cn(
                            "shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5",
                            isAccepted
                              ? "bg-emerald-500/15 ring-1 ring-emerald-500/30 text-emerald-400"
                              : "bg-violet-500/10 ring-1 ring-violet-500/20 text-violet-400",
                          )}>
                            <Sparkles className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1.5">
                              <p className="text-[11px] font-bold text-white leading-tight">{rec.title}</p>
                              {rec.estimatedPriceImpact != null && rec.estimatedPriceImpact > 0 && (
                                <span className="shrink-0 text-[9px] font-black text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/20 rounded px-1.5 py-0.5 leading-none">
                                  +{formatCurrency(rec.estimatedPriceImpact)}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-white/45 leading-tight mt-0.5">{rec.reason}</p>
                            {/* Time + data source row */}
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {rec.estimatedTimeImpact != null && rec.estimatedTimeImpact > 0 && (
                                <span className="text-[8px] text-white/30 font-medium">+{rec.estimatedTimeImpact} min</span>
                              )}
                              {rec.dataSource && (
                                <span className="text-[8px] text-white/20 font-medium truncate">{rec.dataSource}</span>
                              )}
                            </div>
                            {rec.blockedBy && (
                              <p className="text-[9px] text-rose-300/70 leading-tight mt-0.5">⛔ {rec.blockedBy}</p>
                            )}
                          </div>
                        </div>
                        {/* Accept / defer / decline actions */}
                        {!isBlocked && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleRec(rec.id)}
                              className={cn(
                                "flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors",
                                isAccepted
                                  ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 ring-1 ring-emerald-500/20"
                                  : "bg-emerald-500/8 text-emerald-400/60 hover:bg-emerald-500/15 ring-1 ring-emerald-500/15",
                              )}
                            >
                              <Plus className="w-2.5 h-2.5" />
                              {isAccepted ? "Added" : "Accept"}
                            </button>
                            {isAccepted && (
                              <button
                                type="button"
                                onClick={() => toggleRec(rec.id)}
                                className="flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors bg-white/5 text-white/35 hover:bg-white/10 ring-1 ring-white/8"
                              >
                                <Minus className="w-2.5 h-2.5" />
                                Defer
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Completion Tools (shown when job is complete) ── */}
      {isCompleted && !isCancelled && (
        <section aria-label="Completion" className="space-y-2">
          <h2 className="px-0.5 text-[9px] font-black uppercase tracking-widest text-white/40">Wrap Up</h2>

          {/* Completion notes */}
          <div className="rounded-xl border border-white/5 bg-sidebar/60 p-3 space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Completion Notes</p>
            <textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              onBlur={handleSaveNotes}
              placeholder="Any notes about the job…"
              rows={2}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-2 text-[11px] text-white placeholder-white/25 resize-none focus:outline-none focus:border-white/25 leading-tight"
            />
          </div>

          {/* Review request */}
          <button
            type="button"
            onClick={handleRequestReview}
            disabled={reviewRequestSent || reviewSending || !raw?.customerPhone}
            className={cn(
              "w-full flex items-center gap-2.5 rounded-xl border px-2.5 py-2 min-h-[48px] transition-colors",
              reviewRequestSent
                ? "border-emerald-500/20 bg-emerald-500/5 opacity-70 cursor-default"
                : "border-white/8 bg-sidebar/60 hover:bg-sidebar/80 active:bg-sidebar",
            )}
          >
            <div className="shrink-0 w-7 h-7 rounded-md bg-amber-500/10 ring-1 ring-amber-500/20 flex items-center justify-center">
              {reviewSending
                ? <div className="w-3 h-3 border border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
                : <Star className="w-3.5 h-3.5 text-amber-400" />}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[11px] font-bold text-white truncate leading-tight">
                {reviewRequestSent ? "Review Request Sent" : "Request Google Review"}
              </p>
              <p className="text-[9px] text-white/40 leading-tight">
                {!raw?.customerPhone ? "No phone on file" : "Sends SMS link to client"}
              </p>
            </div>
            {reviewRequestSent && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
          </button>

          {/* Rebook */}
          <button
            type="button"
            onClick={() => navigate(`/book-appointment?clientId=${job.clientId ?? ""}`)}
            className="w-full flex items-center gap-2.5 rounded-xl border border-white/8 bg-sidebar/60 hover:bg-sidebar/80 active:bg-sidebar transition-colors px-2.5 py-2 min-h-[48px]"
          >
            <div className="shrink-0 w-7 h-7 rounded-md bg-sky-500/10 ring-1 ring-sky-500/20 flex items-center justify-center">
              <CalendarPlus className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[11px] font-bold text-white truncate leading-tight">Book Next Appointment</p>
              <p className="text-[9px] text-white/40 leading-tight">Schedule the next service for this client</p>
            </div>
          </button>
        </section>
      )}

      {/* ── More actions: Cancel / No-Show / Missed ── */}
      {!isCancelled && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowDangerActions((v) => !v)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-white/30 hover:text-white/50 transition-colors"
          >
            <span className="text-[9px] font-black uppercase tracking-widest">More actions</span>
            {showDangerActions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showDangerActions && (
            <div className="grid grid-cols-3 gap-1.5">
              <button type="button" onClick={() => setReasonKind("canceled")}
                className="rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 active:bg-rose-500/15 transition-colors px-2 py-2.5 min-h-[48px] flex flex-col items-center justify-center gap-1 text-rose-300">
                <XCircle className="w-3.5 h-3.5" />
                <span className="text-[9px] font-black uppercase tracking-widest leading-none">Cancel</span>
              </button>
              <button type="button" onClick={() => setReasonKind("no_show")}
                className="rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 active:bg-rose-500/15 transition-colors px-2 py-2.5 min-h-[48px] flex flex-col items-center justify-center gap-1 text-rose-300">
                <UserX className="w-3.5 h-3.5" />
                <span className="text-[9px] font-black uppercase tracking-widest leading-none">No-Show</span>
              </button>
              <button type="button" onClick={() => setReasonKind("missed")}
                className="rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 active:bg-rose-500/15 transition-colors px-2 py-2.5 min-h-[48px] flex flex-col items-center justify-center gap-1 text-rose-300">
                <CalendarX className="w-3.5 h-3.5" />
                <span className="text-[9px] font-black uppercase tracking-widest leading-none">Missed</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Payment dialog ── */}
      {showPaymentDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center" onClick={() => !paymentBusy && setShowPaymentDialog(false)}>
          <div
            className="w-full max-w-md bg-[#0f0f12] border border-white/10 rounded-t-2xl p-4 pb-8 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Record Payment</p>
                <p className="text-[14px] font-black text-white leading-tight">
                  {formatCurrency(linkedInvoiceTotal || job.totalAmount)}
                </p>
              </div>
              <button type="button" onClick={() => !paymentBusy && setShowPaymentDialog(false)}
                className="text-white/30 hover:text-white/60 text-[10px] font-black uppercase tracking-widest">
                Cancel
              </button>
            </div>

            {acceptedRecIds.size > 0 && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300 leading-none">
                  {acceptedRecIds.size} recommendation{acceptedRecIds.size !== 1 ? "s" : ""} will be added to invoice
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedPaymentMethod(m.id)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-xl border py-3 transition-all min-h-[60px]",
                    selectedPaymentMethod === m.id
                      ? "border-emerald-500/40 bg-emerald-500/10 ring-1 ring-emerald-500/30"
                      : "border-white/8 bg-sidebar/60 hover:bg-sidebar/80",
                  )}
                >
                  <span className="text-lg leading-none">{m.emoji}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white leading-none">{m.label}</span>
                </button>
              ))}
            </div>

            {paymentError && (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-2 py-1.5 flex items-start gap-1.5">
                <AlertCircle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                <p className="text-[9px] text-rose-300 break-words leading-tight">{paymentError}</p>
              </div>
            )}

            <button
              type="button"
              disabled={!selectedPaymentMethod || paymentBusy}
              onClick={handleRecordPayment}
              className={cn(
                "w-full rounded-xl px-4 py-3 font-black text-[13px] uppercase tracking-wide transition-all",
                selectedPaymentMethod && !paymentBusy
                  ? "bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-black"
                  : "bg-white/5 text-white/25 cursor-not-allowed",
              )}
            >
              {paymentBusy
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                    Processing…
                  </span>
                : "Confirm Payment"}
            </button>
          </div>
        </div>
      )}

      <CancellationReasonDialog
        open={reasonKind !== null}
        kind={reasonKind ?? "canceled"}
        feePreview={reasonKind === "canceled" ? feePreview : undefined}
        busy={reasonSubmitting}
        onOpenChange={(next) => { if (!next && !reasonSubmitting) setReasonKind(null); }}
        onSubmit={onSubmitReason}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryRow({
  icon: Icon, tone, label, value, multiline,
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
        <p className={cn("text-[12px] font-bold text-white leading-tight mt-0.5", multiline ? "break-words" : "truncate")}>{value}</p>
      </div>
    </div>
  );
}

function ActionTile({ href, icon: Icon, label, tone }: { href: string; icon: typeof Phone; label: string; tone: string }) {
  return (
    <a href={href}
      className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-white/5 bg-sidebar/60 hover:bg-sidebar/80 active:bg-sidebar transition-colors py-2 min-h-[52px]">
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
