import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { Appointment, AddOn, Client, Invoice, Service, ServiceSelection, Vehicle } from "../../types/index";
import {
  formatJobTime,
  statusLabel,
  toFieldJob,
  type FieldJob,
  type FieldJobStatus,
} from "../../services/fieldJob";
import { handleWaitlistRouting } from "../../services/waitlistRouting";
import { isCancellationStatus, nextStatus } from "../../services/jobStatusFlow";
import CancellationReasonDialog, {
  type CancellationKind,
  type CancellationReasonResult,
} from "../../components/CancellationReasonDialog";
import { getEffectiveRisk } from "../../lib/riskUtils";
import { computeUpsells, type UpsellRecommendation } from "../../services/upsellEngine";
import { useAuth } from "../../hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CreditCard,
  DollarSign,
  Mail,
  Map,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  PlayCircle,
  Receipt,
  RefreshCw,
  Shield,
  Sparkles,
  Star,
  UserX,
  CalendarX,
  Wrench,
  X,
  XCircle,
  Zap,
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

// Step 1 = Revenue Optimization, 2 = Add-ons, 3 = Recurring, 4 = Payment
type TerminalStep = 1 | 2 | 3 | 4;

const PAYMENT_METHODS = ["Cash", "Card", "Check", "Zelle", "Venmo", "CashApp", "Other"];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function deriveClientRisk(
  client: Record<string, unknown> | null,
  protectedMatch: boolean,
  protectionLevel: string | null | undefined,
): ClientRiskInfo {
  if (protectedMatch && (protectionLevel === "High" || protectionLevel === "Block Booking")) {
    return {
      label: "Protected",
      badgeClass: "bg-red-900/40 text-red-300 border-red-500/30",
      navTarget: "protected-clients",
    };
  }
  if (client?.isVIP) {
    return {
      label: "VIP",
      badgeClass: "bg-violet-500/20 text-violet-300 border-violet-500/30",
      navTarget: "clients",
    };
  }
  const canonicalRisk = getEffectiveRisk(client);
  if (canonicalRisk === "high" || canonicalRisk === "critical" || canonicalRisk === "do_not_book" || canonicalRisk === "block_booking") {
    return {
      label: "High Risk",
      badgeClass: "bg-red-500/20 text-red-300 border-red-500/20",
      navTarget: "clients",
    };
  }
  if (typeof client?.outstandingCancellationFee === "number" && (client.outstandingCancellationFee as number) > 0) {
    return {
      label: "Payment Risk",
      badgeClass: "bg-rose-500/20 text-rose-300 border-rose-500/20",
      navTarget: "clients",
    };
  }
  if (canonicalRisk === "medium") {
    return {
      label: "Medium Risk",
      badgeClass: "bg-orange-500/20 text-orange-300 border-orange-500/20",
      navTarget: "clients",
    };
  }
  if (protectedMatch && protectionLevel === "Med") {
    return {
      label: "Watchlist",
      badgeClass: "bg-amber-900/30 text-amber-300 border-amber-500/30",
      navTarget: "protected-clients",
    };
  }
  return {
    label: "No Risk Flags",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
    navTarget: "clients",
  };
}

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

function priorityColor(p: UpsellRecommendation["priority"]): string {
  switch (p) {
    case "critical": return "text-rose-300";
    case "high":     return "text-amber-300";
    case "medium":   return "text-sky-300";
    default:         return "text-white/50";
  }
}

function priorityBadge(p: UpsellRecommendation["priority"]): string {
  switch (p) {
    case "critical": return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
    case "high":     return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    case "medium":   return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    default:         return "bg-white/5 text-white/40 ring-white/10";
  }
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

function ActionTile({ href, icon: Icon, label, tone }: { href: string; icon: typeof Phone; label: string; tone: string }) {
  return (
    <a
      href={href}
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

function WorkflowChip({ icon: Icon, label, onClick, comingSoon }: {
  icon: typeof Camera;
  label: string;
  onClick?: () => void;
  comingSoon?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={comingSoon}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/8 bg-white/4 transition-colors",
        comingSoon ? "opacity-40" : "hover:bg-white/8 active:bg-white/12",
      )}
    >
      <Icon className="w-3 h-3 text-white/50 shrink-0" />
      <span className="text-[9px] font-black uppercase tracking-widest text-white/60 whitespace-nowrap leading-none">{label}</span>
      {comingSoon && <span className="text-[7px] font-black uppercase tracking-widest text-white/25 leading-none">Soon</span>}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Completion Terminal — 4-step bottom sheet
// ─────────────────────────────────────────────────────────────────────────────

function TerminalStepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-full transition-all duration-200",
            i + 1 === current
              ? "w-4 h-1.5 bg-emerald-400"
              : i + 1 < current
                ? "w-1.5 h-1.5 bg-emerald-400/40"
                : "w-1.5 h-1.5 bg-white/15",
          )}
        />
      ))}
    </div>
  );
}

function UpsellCard({
  rec,
  selected,
  onToggle,
}: {
  rec: UpsellRecommendation;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "w-full text-left rounded-xl border transition-all duration-150 px-3 py-2.5",
        selected
          ? "border-emerald-500/40 bg-emerald-500/8 shadow-[0_0_12px_rgba(16,185,129,0.12)]"
          : "border-white/8 bg-white/3 hover:bg-white/5",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className={cn(
          "shrink-0 w-5 h-5 rounded-md ring-1 flex items-center justify-center mt-0.5 transition-all",
          selected
            ? "bg-emerald-500/20 ring-emerald-500/40 text-emerald-400"
            : "bg-white/5 ring-white/15 text-white/30",
        )}>
          {selected
            ? <CheckCircle2 className="w-3 h-3" />
            : <div className="w-2 h-2 rounded-full bg-white/20" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[12px] font-bold text-white leading-tight">{rec.title}</p>
            <span className={cn("text-[8px] font-black uppercase tracking-widest px-1 py-0.5 rounded ring-1 leading-none", priorityBadge(rec.priority))}>
              {rec.priority}
            </span>
          </div>
          <p className="text-[10px] text-white/50 leading-tight mt-0.5 break-words">{rec.reason}</p>
          {rec.estimatedPriceImpact != null && rec.estimatedPriceImpact > 0 && (
            <p className={cn("text-[10px] font-bold mt-1 leading-none", priorityColor(rec.priority))}>
              +${rec.estimatedPriceImpact.toFixed(0)} est. revenue
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

interface CompletionTerminalProps {
  jobId: string;
  job: FieldJob;
  invoice: Invoice | null;
  upsellRecs: UpsellRecommendation[];
  addonRecs: UpsellRecommendation[];
  isRecurringClient: boolean;
  onClose: () => void;
  onCompleted: (markedPaid: boolean) => void;
}

function CompletionTerminal({
  jobId,
  job,
  invoice,
  upsellRecs,
  addonRecs,
  isRecurringClient,
  onClose,
  onCompleted,
}: CompletionTerminalProps) {
  const [step, setStep] = useState<TerminalStep>(1);
  const [selectedUpsells, setSelectedUpsells] = useState<Set<string>>(new Set());
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [bookNextAppt, setBookNextAppt] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Total steps: skip Step 2 if no addons, skip Step 3 if not recurring
  const hasAddons = addonRecs.length > 0;
  const totalSteps = hasAddons ? 4 : 3;

  function stepLabel(s: TerminalStep) {
    if (!hasAddons) {
      if (s === 1) return "Revenue";
      if (s === 2) return "Recurring";
      return "Payment";
    }
    if (s === 1) return "Revenue";
    if (s === 2) return "Add-ons";
    if (s === 3) return "Recurring";
    return "Payment";
  }

  // Map visual step number to logical step accounting for collapsed steps
  function nextStep() {
    if (!hasAddons) {
      if (step === 1) setStep(2); // Skip to recurring
      else if (step === 2) setStep(3); // Skip to payment (displayed as 3 but logical 4)
    } else {
      if (step < 4) setStep((step + 1) as TerminalStep);
    }
  }

  function prevStep() {
    if (!hasAddons) {
      if (step === 3) setStep(2);
      else if (step === 2) setStep(1);
    } else {
      if (step > 1) setStep((step - 1) as TerminalStep);
    }
  }

  // Derive "visual step" for dots
  const visualStep = !hasAddons && step === 4 ? 3 : !hasAddons && step === 3 ? 2 : !hasAddons && step === 2 ? 2 : step;

  const balance = invoice ? (invoice.total || 0) - (invoice.amountPaid || 0) : 0;

  // Derive accepted / declined arrays from terminal selections.
  // "Accepted" = technician toggled the card on.
  // "Declined" = card was shown but not selected (implicit skip).
  function buildUpsellOutcome() {
    const acceptedUpsellIds = [
      ...Array.from(selectedUpsells),
      ...Array.from(selectedAddons),
    ];
    const declinedUpsellIds = [
      ...upsellRecs.filter((r) => !selectedUpsells.has(r.id)).map((r) => r.id),
      ...addonRecs.filter((r) => !selectedAddons.has(r.id)).map((r) => r.id),
    ];
    return { acceptedUpsellIds, declinedUpsellIds };
  }

  const handleCompleteNoPayment = async () => {
    setProcessing(true);
    setPaymentError(null);
    try {
      const { acceptedUpsellIds, declinedUpsellIds } = buildUpsellOutcome();
      await updateDoc(doc(db, "appointments", jobId), {
        status: "completed",
        acceptedUpsellIds,
        declinedUpsellIds,
        bookNextAppt,
        updatedAt: serverTimestamp(),
      });
      onCompleted(false);
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : "Failed to complete job");
    } finally {
      setProcessing(false);
    }
  };

  const handleCompleteWithPayment = async () => {
    if (!invoice) {
      await handleCompleteNoPayment();
      return;
    }
    if (balance <= 0) {
      await handleCompleteNoPayment();
      return;
    }
    setProcessing(true);
    setPaymentError(null);
    try {
      const { acceptedUpsellIds, declinedUpsellIds } = buildUpsellOutcome();
      const newPaid = (invoice.amountPaid || 0) + balance;
      const entry = {
        action: "paid" as const,
        timestamp: serverTimestamp(),
        method: paymentMethod,
        amount: balance,
        provider: "manual",
      };
      const invoiceUpd: Record<string, unknown> = {
        amountPaid: newPaid,
        paymentStatus: "paid",
        status: "paid",
        paidAt: serverTimestamp(),
        paymentMethodDetails: paymentMethod,
        paymentProvider: "manual",
        paymentHistory: arrayUnion(entry),
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, "invoices", invoice.id), invoiceUpd);
      await updateDoc(doc(db, "appointments", jobId), {
        status: "completed",
        paymentStatus: "paid",
        acceptedUpsellIds,
        declinedUpsellIds,
        bookNextAppt,
        updatedAt: serverTimestamp(),
      });
      onCompleted(true);
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setProcessing(false);
    }
  };

  // Determine which step content to show
  const isPaymentStep = !hasAddons ? step === 3 : step === 4;
  const isRecurringStep = !hasAddons ? step === 2 : step === 3;
  const isAddonStep = hasAddons && step === 2;
  const isRevenueStep = step === 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative z-10 bg-[#0A0A0A] border-t border-white/10 rounded-t-2xl max-h-[88vh] flex flex-col">
        {/* Handle + Header */}
        <div className="flex-none px-4 pt-3 pb-3 border-b border-white/8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400/70 leading-none">
                Completion Terminal
              </p>
              <p className="text-[13px] font-black text-white leading-tight mt-0.5">{job.clientName}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <X className="w-3.5 h-3.5 text-white/60" />
            </button>
          </div>

          {/* Step dots + label */}
          <div className="flex items-center gap-3">
            <TerminalStepDots current={visualStep} total={totalSteps} />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">
              Step {visualStep} of {totalSteps} · {stepLabel(step)}
            </span>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

          {/* ── Step 1: Revenue Optimization ───────────────────────────────── */}
          {isRevenueStep && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-500/15 ring-1 ring-violet-500/30 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-violet-300" />
                </div>
                <div>
                  <p className="text-[12px] font-black text-white leading-none">Revenue Optimization</p>
                  <p className="text-[9px] text-white/40 leading-none mt-0.5">Select any opportunities to note</p>
                </div>
              </div>

              {upsellRecs.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/3 px-3 py-4 text-center">
                  <Sparkles className="w-5 h-5 text-white/20 mx-auto" />
                  <p className="text-[11px] font-bold text-white/50 mt-1.5">No smart upsells right now</p>
                  <p className="text-[9px] text-white/30 mt-0.5">All opportunities are current</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {upsellRecs.map((rec) => (
                    <UpsellCard
                      key={rec.id}
                      rec={rec}
                      selected={selectedUpsells.has(rec.id)}
                      onToggle={() => setSelectedUpsells((prev) => {
                        const next = new Set(prev);
                        if (next.has(rec.id)) next.delete(rec.id);
                        else next.add(rec.id);
                        return next;
                      })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Add-ons (only when hasAddons) ──────────────────────── */}
          {isAddonStep && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-500/15 ring-1 ring-sky-500/30 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-sky-300" />
                </div>
                <div>
                  <p className="text-[12px] font-black text-white leading-none">Recommended Add-ons</p>
                  <p className="text-[9px] text-white/40 leading-none mt-0.5">Based on vehicle &amp; service history</p>
                </div>
              </div>

              <div className="space-y-2">
                {addonRecs.map((rec) => (
                  <UpsellCard
                    key={rec.id}
                    rec={rec}
                    selected={selectedAddons.has(rec.id)}
                    onToggle={() => setSelectedAddons((prev) => {
                      const next = new Set(prev);
                      if (next.has(rec.id)) next.delete(rec.id);
                      else next.add(rec.id);
                      return next;
                    })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: Recurring Scheduling ───────────────────────────────── */}
          {isRecurringStep && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 ring-1 ring-amber-500/30 flex items-center justify-center">
                  <RefreshCw className="w-3.5 h-3.5 text-amber-300" />
                </div>
                <div>
                  <p className="text-[12px] font-black text-white leading-none">Recurring Scheduling</p>
                  <p className="text-[9px] text-white/40 leading-none mt-0.5">Attach next appointment</p>
                </div>
              </div>

              {isRecurringClient ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setBookNextAppt((v) => !v)}
                    className={cn(
                      "w-full text-left rounded-xl border transition-all px-3 py-3",
                      bookNextAppt
                        ? "border-amber-500/40 bg-amber-500/8"
                        : "border-white/8 bg-white/3 hover:bg-white/5",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        "w-5 h-5 rounded-md ring-1 flex items-center justify-center transition-all",
                        bookNextAppt
                          ? "bg-amber-500/20 ring-amber-500/40 text-amber-400"
                          : "bg-white/5 ring-white/15 text-white/30",
                      )}>
                        {bookNextAppt
                          ? <CheckCircle2 className="w-3 h-3" />
                          : <div className="w-2 h-2 rounded-full bg-white/20" />
                        }
                      </div>
                      <div>
                        <p className="text-[12px] font-bold text-white leading-tight">Book next appointment</p>
                        <p className="text-[10px] text-white/45 leading-tight mt-0.5">
                          Flag for scheduling after this session
                        </p>
                      </div>
                    </div>
                  </button>

                  {bookNextAppt && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                      <p className="text-[10px] text-amber-300/80 leading-tight">
                        Next appointment will be flagged for scheduling based on this client's recurring cycle.
                        Book from the Schedule or Client profile after completing this job.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-white/5 bg-white/3 px-3 py-4 text-center">
                  <RefreshCw className="w-5 h-5 text-white/20 mx-auto" />
                  <p className="text-[11px] font-bold text-white/50 mt-1.5">Client is not recurring</p>
                  <p className="text-[9px] text-white/30 mt-0.5">No recurring schedule to attach</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Payment Terminal ────────────────────────────────────── */}
          {isPaymentStep && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-300" />
                </div>
                <div>
                  <p className="text-[12px] font-black text-white leading-none">Payment Terminal</p>
                  <p className="text-[9px] text-white/40 leading-none mt-0.5">Record payment &amp; complete</p>
                </div>
              </div>

              {/* Invoice summary */}
              {invoice ? (
                <div className="rounded-xl border border-white/10 bg-white/3 px-3 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Invoice Total</span>
                    <span className="text-[14px] font-black text-white">${(invoice.total || 0).toFixed(2)}</span>
                  </div>
                  {(invoice.amountPaid || 0) > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Paid</span>
                      <span className="text-[12px] font-bold text-emerald-400">${(invoice.amountPaid || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-white/8 pt-2 flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/60">Balance Due</span>
                    <span className={cn("text-[14px] font-black", balance > 0 ? "text-rose-300" : "text-emerald-400")}>
                      ${balance.toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Job Value</span>
                    <span className="text-[14px] font-black text-white">
                      {job.totalAmount > 0 ? `$${job.totalAmount.toFixed(2)}` : "—"}
                    </span>
                  </div>
                  <p className="text-[9px] text-white/30 mt-1.5 leading-tight">No invoice linked to this appointment</p>
                </div>
              )}

              {/* Payment method selector */}
              {invoice && balance > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/40 px-0.5">Payment Method</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all",
                          paymentMethod === m
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : "border-white/10 bg-white/3 text-white/50 hover:bg-white/6",
                        )}
                      >
                        {m === "Card" && <CreditCard className="w-3 h-3" />}
                        {m === "Cash" && <DollarSign className="w-3 h-3" />}
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {paymentError && (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
                  <AlertCircle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-[9px] text-rose-300 break-words leading-tight">{paymentError}</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-2 pt-1">
                {invoice && balance > 0 && (
                  <button
                    type="button"
                    disabled={processing}
                    onClick={handleCompleteWithPayment}
                    className={cn(
                      "w-full rounded-xl px-3 py-3.5 flex items-center justify-center gap-2",
                      "bg-gradient-to-r from-emerald-600/90 to-emerald-500/80",
                      "border border-emerald-500/50",
                      "shadow-[0_0_16px_rgba(16,185,129,0.25)]",
                      "hover:shadow-[0_0_24px_rgba(16,185,129,0.4)]",
                      "active:scale-[0.98] transition-all duration-150",
                      "text-white font-black text-[13px] uppercase tracking-wide",
                      processing && "opacity-60 pointer-events-none",
                    )}
                  >
                    {processing
                      ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <CheckCircle2 className="w-4 h-4" />
                    }
                    {processing ? "Processing…" : `Complete + Collect $${balance.toFixed(2)}`}
                  </button>
                )}

                <button
                  type="button"
                  disabled={processing}
                  onClick={handleCompleteNoPayment}
                  className={cn(
                    "w-full rounded-xl px-3 py-3 flex items-center justify-center gap-2",
                    "border border-white/10 bg-white/5",
                    "hover:bg-white/8 active:bg-white/12",
                    "text-white/70 font-bold text-[12px] uppercase tracking-wide",
                    "transition-all",
                    processing && "opacity-60 pointer-events-none",
                  )}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {invoice && balance > 0 ? "Complete — Collect Later" : "Mark Job Complete"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        {!isPaymentStep && (
          <div className="flex-none px-4 py-3 border-t border-white/8 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={step === 1 ? onClose : prevStep}
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              {step === 1 ? "Close" : "Back"}
            </button>
            <button
              type="button"
              onClick={nextStep}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/8 hover:bg-white/12 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white transition-colors"
            >
              {isRecurringStep && !hasAddons ? "Go to Payment" : isAddonStep ? "Recurring" : "Next"}
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
        {isPaymentStep && (
          <div className="flex-none px-4 py-3 border-t border-white/8">
            <button
              type="button"
              onClick={prevStep}
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ActiveJob() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { services, addons } = useAuth();

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

  // Terminal client context — loaded for upsell computation
  const [terminalClient, setTerminalClient] = useState<Client | null>(null);
  const [terminalAppts, setTerminalAppts] = useState<Appointment[]>([]);
  const [terminalVehicles, setTerminalVehicles] = useState<Vehicle[]>([]);

  // Invoice for this appointment
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  // Completion terminal
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalCompleted, setTerminalCompleted] = useState(false);

  // Job Intelligence panel (collapsible)
  const [showJobIntelligence, setShowJobIntelligence] = useState(false);

  // Maps navigation selector dialog
  const [showMapsDialog, setShowMapsDialog] = useState(false);

  // Add Add-On sheet
  const [showAddAddonSheet, setShowAddAddonSheet] = useState(false);
  const [pendingAddonIds, setPendingAddonIds] = useState<Set<string>>(new Set());
  const [addingAddons, setAddingAddons] = useState(false);

  // Current Charges sheet (Invoice button)
  const [showChargesSheet, setShowChargesSheet] = useState(false);

  // Change / Upgrade Service sheet
  const [showChangeServiceSheet, setShowChangeServiceSheet] = useState(false);
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(null);
  const [changingService, setChangingService] = useState(false);

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

  // ── Invoice subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, "invoices"), where("appointmentId", "==", id), limit(3));
    const unsub = onSnapshot(
      q,
      (snap) => setInvoices(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Invoice))),
      (err) => console.warn("[ActiveJob] invoice snapshot error", err),
    );
    return () => unsub();
  }, [id]);

  // ── Client subscription — risk badge + terminal context ─────────────────
  useEffect(() => {
    if (!raw) return;

    const aptProtectedMatch = raw.protectedClientMatch === true;
    const aptProtectionLevel = (raw.protectionLevel as string | null) ?? null;
    const clientId = (raw.clientId as string | undefined) || (raw.customerId as string | undefined);

    if (!clientId) {
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
          setTerminalClient(null);
        } else {
          const clientData = { id: snap.id, ...(snap.data() as Record<string, unknown>) };
          setClientRisk(deriveClientRisk(clientData, aptProtectedMatch, aptProtectionLevel));
          setTerminalClient(clientData as unknown as Client);
        }
        setClientRiskLoading(false);
      },
      (err) => {
        console.warn("[ActiveJob] client risk snapshot error", err);
        setClientRisk(deriveClientRisk(null, aptProtectedMatch, aptProtectionLevel));
        setClientRiskLoading(false);
      },
    );

    // Load client appointments for upsell context
    const apptQ = query(
      collection(db, "appointments"),
      where("clientId", "==", clientId),
      orderBy("scheduledAt", "desc"),
      limit(20),
    );
    getDocs(apptQ)
      .then((snap) => setTerminalAppts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Appointment))))
      .catch(() => {});

    // Load client vehicles so service-timing upsell rules have real vehicle data
    const vehicleQ = query(collection(db, "vehicles"), where("clientId", "==", clientId));
    getDocs(vehicleQ)
      .then((snap) => setTerminalVehicles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Vehicle))))
      .catch(() => {});

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

  // ── Upsell computation ──────────────────────────────────────────────────
  const { upsellRecs, addonRecs } = useMemo(() => {
    if (!terminalClient) return { upsellRecs: [], addonRecs: [] };
    const all = computeUpsells({
      client: terminalClient,
      appointments: terminalAppts.length > 0 ? terminalAppts : raw ? [raw as unknown as Appointment] : [],
      vehicles: terminalVehicles,
      services: services as any[],
      addons: addons as any[],
    });
    const actionable = all.filter((r) => !r.blockedBy);
    return {
      upsellRecs: actionable.filter((r) => r.type !== "addon"),
      addonRecs: actionable.filter((r) => r.type === "addon"),
    };
  }, [terminalClient, terminalAppts, terminalVehicles, raw, services, addons]);

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

  // ── Cancellation / no-show / missed ────────────────────────────────────
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

  // ── Add Add-On ──────────────────────────────────────────────────────────
  const handleAddAddons = useCallback(async () => {
    if (!id || pendingAddonIds.size === 0 || addingAddons) return;
    setAddingAddons(true);
    try {
      const inv = invoices[0] ?? null;
      const existingIds = new Set<string>(raw?.addOnIds ?? []);
      const toAdd = (addons as AddOn[]).filter(
        (a) => a.isActive && pendingAddonIds.has(a.id) && !existingIds.has(a.id),
      );
      if (toAdd.length === 0) {
        setShowAddAddonSheet(false);
        setPendingAddonIds(new Set());
        return;
      }

      const newSelections: ServiceSelection[] = toAdd.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description ?? "",
        qty: 1,
        price: a.price,
        total: a.price,
        source: "manual" as const,
        protocolAccepted: true,
      }));

      const updatedIds   = [...(raw?.addOnIds         ?? []), ...toAdd.map((a) => a.id)];
      const updatedNames = [...(raw?.addOnNames        ?? []), ...toAdd.map((a) => a.name)];
      const updatedSels  = [...(raw?.addOnSelections   ?? []), ...newSelections];
      const addedTotal   = toAdd.reduce((s, a) => s + a.price, 0);

      // Update appointment — additive, never overwrites existing data
      await updateDoc(doc(db, "appointments", id), {
        addOnIds:        updatedIds,
        addOnNames:      updatedNames,
        addOnSelections: updatedSels,
        totalAmount:     (raw?.totalAmount ?? 0) + addedTotal,
        updatedAt:       serverTimestamp(),
      });

      // If an invoice already exists, keep it in sync so the balance is correct
      if (inv) {
        const newLineItems = [
          ...(inv.lineItems ?? []),
          ...newSelections.map((s) => ({
            serviceName:      s.name,
            description:      s.description || "Add-on",
            quantity:         1,
            price:            s.price,
            total:            s.price,
            source:           "manual",
            protocolAccepted: true,
          })),
        ];
        await updateDoc(doc(db, "invoices", inv.id), {
          lineItems:  newLineItems,
          total:      (inv.total ?? 0) + addedTotal,
          updatedAt:  serverTimestamp(),
        });
      }

      setShowAddAddonSheet(false);
      setPendingAddonIds(new Set());
    } catch (e) {
      console.warn("[ActiveJob] add-on write failed", e);
    } finally {
      setAddingAddons(false);
    }
  }, [id, raw, addons, invoices, pendingAddonIds, addingAddons]);

  // Derived from selection state — used in the add-on sheet footer
  const pendingAddonsToAdd = useMemo(() => {
    const existingIds = new Set<string>(raw?.addOnIds ?? []);
    return (addons as AddOn[]).filter(
      (a) => a.isActive && pendingAddonIds.has(a.id) && !existingIds.has(a.id),
    );
  }, [pendingAddonIds, addons, raw]);

  const pendingAddonsTotal = useMemo(
    () => pendingAddonsToAdd.reduce((s, a) => s + a.price, 0),
    [pendingAddonsToAdd],
  );

  // ── Change / Upgrade Service ─────────────────────────────────────────────

  /** The Service object the technician has selected in the change-service sheet. */
  const pendingService = useMemo(
    () => (services as Service[]).find((s) => s.id === pendingServiceId) ?? null,
    [pendingServiceId, services],
  );

  /**
   * Price delta = new service basePrice − current service subtotal.
   * We derive the current subtotal from serviceSelections when available,
   * falling back to raw.baseAmount (which should equal services-only price).
   * The delta is then applied to totalAmount so travel/discount/tax/add-ons
   * are preserved correctly.
   */
  const currentServiceSubtotal = useMemo(() => {
    if ((raw?.serviceSelections ?? []).length > 0) {
      return (raw!.serviceSelections!).reduce((s, sel) => s + (sel.price ?? sel.total ?? 0), 0);
    }
    return raw?.baseAmount ?? 0;
  }, [raw]);

  const serviceChangeDelta = pendingService
    ? pendingService.basePrice - currentServiceSubtotal
    : 0;

  const newServiceTotal = Math.max(0, (raw?.totalAmount ?? 0) + serviceChangeDelta);

  const handleChangeService = useCallback(async () => {
    if (!id || !pendingService || changingService) return;
    setChangingService(true);
    try {
      const newSelection: ServiceSelection = {
        id: pendingService.id,
        name: pendingService.name,
        description: pendingService.description ?? "",
        qty: 1,
        price: pendingService.basePrice,
        total: pendingService.basePrice,
        source: "manual" as const,
        protocolAccepted: true,
      };

      const delta = pendingService.basePrice - currentServiceSubtotal;
      const updatedTotal = Math.max(0, (raw?.totalAmount ?? 0) + delta);

      await updateDoc(doc(db, "appointments", id), {
        serviceIds: [pendingService.id],
        serviceNames: [pendingService.name],
        serviceSelections: [newSelection],
        baseAmount: pendingService.basePrice,
        totalAmount: updatedTotal,
        updatedAt: serverTimestamp(),
      });

      // Sync invoice if one exists — replace service line items, keep add-on
      // items and anything else (travel, custom fees) intact.
      const inv = invoices[0] ?? null;
      if (inv) {
        const currentServiceNames = new Set(raw?.serviceNames ?? []);
        const otherItems = (inv.lineItems ?? []).filter(
          (li) => !currentServiceNames.has(li.serviceName),
        );
        const newServiceItem = {
          serviceName: newSelection.name,
          description: newSelection.description || "",
          quantity: 1,
          price: newSelection.price,
          total: newSelection.price,
          source: "manual",
          protocolAccepted: true,
        };
        await updateDoc(doc(db, "invoices", inv.id), {
          lineItems: [newServiceItem, ...otherItems],
          total: Math.max(0, (inv.total ?? 0) + delta),
          updatedAt: serverTimestamp(),
        });
      }

      setShowChangeServiceSheet(false);
      setPendingServiceId(null);
    } catch (e) {
      console.warn("[ActiveJob] service change failed", e);
    } finally {
      setChangingService(false);
    }
  }, [id, raw, pendingService, currentServiceSubtotal, invoices, changingService]);

  const nextAction = getNextJobStatusAction(rawStatus ?? "scheduled");
  const isCompleteAction = nextAction?.targetStatus === "completed";
  const invoice = invoices[0] ?? null;
  const isRecurringClient = Boolean((terminalClient as any)?.billingCycle || (raw as any)?.isRecurring);

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
      <div className="rounded-xl border border-white/8 bg-gradient-to-br from-sidebar/80 via-sidebar/60 to-sidebar/40 p-3 space-y-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/35 leading-none">Job Command Center</p>
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

        {/* Client risk badge */}
        {!clientRiskLoading && clientRisk && (
          <div
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[9px] font-black uppercase tracking-widest leading-none",
              clientRisk.badgeClass,
            )}
          >
            {clientRisk.navTarget === "protected-clients" ? (
              <Shield className="w-2.5 h-2.5" />
            ) : clientRisk.label === "VIP" ? (
              <Star className="w-2.5 h-2.5" />
            ) : (
              <AlertCircle className="w-2.5 h-2.5" />
            )}
            {clientRisk.label}
          </div>
        )}

        {/* Completed indicator */}
        {terminalCompleted && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Job completed via terminal</span>
          </div>
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

      {/* ── Job Intelligence ─────────────────────────────────────────────── */}
      {!isCancellationStatus(rawStatus ?? "scheduled") && !terminalCompleted && (
        <section className="rounded-xl border border-white/5 bg-sidebar/60 overflow-hidden">
          {/* Collapsed header — always visible */}
          <button
            type="button"
            onClick={() => setShowJobIntelligence((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5"
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="w-6 h-6 rounded-md bg-violet-500/15 ring-1 ring-violet-500/30 flex items-center justify-center shrink-0">
                <Sparkles className="w-3 h-3 text-violet-300" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Job Intelligence</span>
              {job.depositRequired && !job.depositPaid && (
                <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30 leading-none">Deposit</span>
              )}
              {job.pendingOwnerReview && (
                <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30 leading-none">Review</span>
              )}
              {upsellRecs.length > 0 && (
                <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30 leading-none">
                  {upsellRecs.length} opp{upsellRecs.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {showJobIntelligence
              ? <ChevronUp className="w-3 h-3 text-white/30 shrink-0" />
              : <ChevronDown className="w-3 h-3 text-white/30 shrink-0" />}
          </button>

          {/* Expanded content */}
          {showJobIntelligence && (
            <div className="border-t border-white/5 px-3 py-3 space-y-3">

              {/* ── Booking status flags ── */}
              {(job.depositRequired || job.pendingOwnerReview || (raw?.balanceDue ?? 0) > 0) && (
                <div className="space-y-1.5">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Booking Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {job.depositRequired && !job.depositPaid && (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 ring-1 ring-amber-500/25 text-amber-300">
                        <DollarSign className="w-2.5 h-2.5 shrink-0" />
                        <span className="text-[9px] font-bold leading-none">
                          Deposit Required{raw && raw.depositAmount > 0 ? ` · $${raw.depositAmount.toFixed(0)}` : ""}
                        </span>
                      </div>
                    )}
                    {job.depositPaid && (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/25 text-emerald-300">
                        <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                        <span className="text-[9px] font-bold leading-none">Deposit Paid</span>
                      </div>
                    )}
                    {job.pendingOwnerReview && (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-orange-500/10 ring-1 ring-orange-500/25 text-orange-300">
                        <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                        <span className="text-[9px] font-bold leading-none">Pending Review</span>
                      </div>
                    )}
                    {(raw?.balanceDue ?? 0) > 0 && (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 ring-1 ring-rose-500/25 text-rose-300">
                        <CreditCard className="w-2.5 h-2.5 shrink-0" />
                        <span className="text-[9px] font-bold leading-none">Balance Due · ${(raw?.balanceDue ?? 0).toFixed(0)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Add-ons booked ── */}
              {(raw?.addOnNames?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Add-Ons</p>
                  <div className="flex flex-wrap gap-1">
                    {raw!.addOnNames!.map((n) => (
                      <span key={n} className="text-[9px] font-bold text-white/60 bg-white/5 px-1.5 py-0.5 rounded leading-none">{n}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Customer booking notes ── */}
              {raw?.customerNotes && (
                <div className="space-y-1">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Customer Notes</p>
                  <p className="text-[11px] text-white/55 leading-snug break-words">{raw.customerNotes}</p>
                </div>
              )}

              {/* ── Client saved notes ── */}
              {terminalClient?.notes && (
                <div className="space-y-1">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Client Notes</p>
                  <p className="text-[11px] text-white/55 leading-snug break-words">{terminalClient.notes}</p>
                </div>
              )}

              {/* ── Membership / outstanding fee ── */}
              {terminalClient && (
                terminalClient.membershipLevel !== "none" ||
                (terminalClient.outstandingCancellationFee ?? 0) > 0
              ) && (
                <div className="flex flex-wrap gap-1.5">
                  {terminalClient!.membershipLevel !== "none" && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-violet-500/10 ring-1 ring-violet-500/20 text-violet-300">
                      <Star className="w-2.5 h-2.5 shrink-0" />
                      <span className="text-[9px] font-bold capitalize leading-none">{terminalClient!.membershipLevel} Member</span>
                    </div>
                  )}
                  {(terminalClient!.outstandingCancellationFee ?? 0) > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 ring-1 ring-rose-500/25 text-rose-300">
                      <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                      <span className="text-[9px] font-bold leading-none">
                        Cancellation Fee · ${(terminalClient!.outstandingCancellationFee ?? 0).toFixed(0)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Vehicle details from terminalVehicles ── */}
              {terminalVehicles.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Vehicle Details</p>
                  {terminalVehicles.map((v) => (
                    <div key={v.id} className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {v.size && (
                          <span className="text-[9px] font-bold text-white/50 capitalize leading-none">
                            {v.size.replace("_", " ")}
                          </span>
                        )}
                        {v.color && (
                          <span className="text-[9px] font-bold text-white/50 leading-none">· {v.color}</span>
                        )}
                        {v.licensePlate && (
                          <span className="text-[9px] font-black uppercase tracking-widest text-white/70 bg-white/8 px-1.5 py-0.5 rounded leading-none">
                            {v.licensePlate}
                          </span>
                        )}
                      </div>
                      {v.notes && (
                        <p className="text-[9px] text-white/35 italic leading-tight">{v.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Revenue opportunities preview ── */}
              <div className="space-y-1.5">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Revenue Opportunities</p>
                {upsellRecs.length === 0 ? (
                  <p className="text-[10px] text-white/30 italic">No smart recommendations for this client yet</p>
                ) : (
                  <div className="rounded-lg border border-violet-500/15 bg-violet-500/5 px-2.5 py-2 space-y-1">
                    <div className="flex items-start gap-1.5">
                      <Sparkles className="w-3 h-3 text-violet-300 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-[10px] font-bold text-white leading-tight">{upsellRecs[0].title}</p>
                          <span className={cn("text-[7px] font-black uppercase tracking-widest px-1 py-0.5 rounded ring-1 leading-none", priorityBadge(upsellRecs[0].priority))}>
                            {upsellRecs[0].priority}
                          </span>
                        </div>
                        <p className="text-[9px] text-white/40 leading-tight mt-0.5 line-clamp-2">{upsellRecs[0].reason}</p>
                      </div>
                    </div>
                    {upsellRecs.length > 1 && (
                      <p className="text-[8px] font-black text-violet-300/60 leading-none pl-4">
                        +{upsellRecs.length - 1} more opportunit{upsellRecs.length - 1 !== 1 ? "ies" : "y"}
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowTerminal(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-violet-500/20 bg-violet-500/8 hover:bg-violet-500/12 active:bg-violet-500/18 transition-colors"
                >
                  <Zap className="w-3 h-3 text-violet-300" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-violet-300">
                    {upsellRecs.length > 0
                      ? `Review ${upsellRecs.length} Opportunit${upsellRecs.length !== 1 ? "ies" : "y"}`
                      : "Open Job Terminal"}
                  </span>
                </button>
              </div>

            </div>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PRIMARY ACTION — single CTA, full width
      ══════════════════════════════════════════════════════════════════════ */}
      <section aria-label="Primary Action" className="space-y-2">

        {isCancellationStatus(rawStatus ?? "scheduled") ? (
          /* Terminal cancellation state */
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 ring-1 ring-rose-500/30 flex items-center justify-center shrink-0">
              <XCircle className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-rose-300 leading-none">
                {statusLabel(rawStatus!)}
              </p>
              <p className="text-[9px] text-rose-300/50 mt-0.5 leading-tight">Intelligence disabled</p>
            </div>
          </div>

        ) : !nextAction ? (
          /* Completed / paid — no forward action */
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-300 leading-none">
                {statusLabel(rawStatus ?? "completed")}
              </p>
              <p className="text-[9px] text-emerald-300/50 mt-0.5 leading-tight">Job complete · No further actions</p>
            </div>
          </div>

        ) : isCompleteAction ? (
          /* COMPLETE JOB — opens Completion Terminal */
          <button
            type="button"
            onClick={() => setShowTerminal(true)}
            className={cn(
              "w-full rounded-2xl px-4 py-4 min-h-[96px]",
              "flex flex-col items-center justify-center gap-2 text-center",
              "bg-gradient-to-br from-emerald-700/90 via-emerald-600/80 to-teal-700/80",
              "border border-emerald-500/50",
              "shadow-[0_0_24px_rgba(16,185,129,0.30),inset_0_1px_0_rgba(255,255,255,0.08)]",
              "hover:shadow-[0_0_36px_rgba(16,185,129,0.45),inset_0_1px_0_rgba(255,255,255,0.12)]",
              "hover:border-emerald-400/60",
              "active:scale-[0.97] transition-all duration-150 focus:outline-none",
            )}
          >
            <div className="w-12 h-12 rounded-2xl bg-white/15 ring-2 ring-white/20 flex items-center justify-center shadow-[0_0_12px_rgba(255,255,255,0.1)]">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-[15px] font-black uppercase tracking-wide text-white leading-none">Complete Job</p>
              <p className="text-[10px] font-bold text-emerald-100/70 leading-tight mt-1">Pay · Invoice · Upsell</p>
            </div>
          </button>

        ) : (
          /* Standard forward status button — full width */
          <button
            type="button"
            disabled={updating !== null}
            onClick={() => onChangeStatus(nextAction.targetStatus)}
            className={cn(
              "w-full rounded-2xl px-4 py-4 min-h-[80px]",
              "flex items-center justify-center gap-3 text-center transition-all",
              "active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
              nextAction.buttonTone,
              updating !== null && "opacity-60 pointer-events-none",
            )}
          >
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", nextAction.iconTone)}>
              {updating === nextAction.targetStatus
                ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : <nextAction.icon className="w-5 h-5" />
              }
            </div>
            <div className="text-left">
              <p className="text-[13px] font-black uppercase tracking-wide leading-none">
                {updating === nextAction.targetStatus ? "Updating…" : nextAction.label}
              </p>
              <p className="text-[9px] font-medium opacity-55 leading-tight mt-0.5">{nextAction.subLabel}</p>
            </div>
          </button>
        )}

        {/* ── Workflow chips ─────────────────────────────────────────────── */}
        {!isCancellationStatus(rawStatus ?? "scheduled") && !terminalCompleted && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <WorkflowChip icon={Camera} label="Photos" comingSoon />
            <WorkflowChip
              icon={Wrench}
              label="Service"
              onClick={() => { setPendingServiceId(null); setShowChangeServiceSheet(true); }}
            />
            <WorkflowChip
              icon={Zap}
              label="Add-On"
              onClick={() => { setPendingAddonIds(new Set()); setShowAddAddonSheet(true); }}
            />
            <WorkflowChip icon={Receipt} label="Invoice" onClick={() => setShowChargesSheet(true)} />
          </div>
        )}

        {/* ── More actions: Cancel / No-Show / Missed ────────────────────── */}
        {!isCancellationStatus(rawStatus ?? "scheduled") && !terminalCompleted && (
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

      {/* ── Completion Terminal ───────────────────────────────────────────── */}
      {showTerminal && job && (
        <CompletionTerminal
          jobId={id!}
          job={job}
          invoice={invoice}
          upsellRecs={upsellRecs}
          addonRecs={addonRecs}
          isRecurringClient={isRecurringClient}
          onClose={() => setShowTerminal(false)}
          onCompleted={(markedPaid) => {
            setShowTerminal(false);
            setTerminalCompleted(true);
            void markedPaid;
          }}
        />
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

      {/* ── Add Add-On sheet ──────────────────────────────────────────────── */}
      <Dialog
        open={showAddAddonSheet}
        onOpenChange={(v) => {
          if (!addingAddons) {
            setShowAddAddonSheet(v);
            if (!v) setPendingAddonIds(new Set());
          }
        }}
      >
        <DialogContent className="max-w-sm mx-auto bg-[#0D0D0D] border border-white/10 rounded-2xl p-0 overflow-hidden flex flex-col" style={{ maxHeight: "80vh" }}>
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-white/8 flex-none">
            <DialogTitle className="text-[12px] font-black uppercase tracking-widest text-white/70 text-left flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-sky-300" />
              Add Add-On to Job
            </DialogTitle>
          </DialogHeader>

          {/* Add-on list */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {(addons as AddOn[]).filter((a) => a.isActive).length === 0 ? (
              <p className="text-[11px] text-white/30 text-center py-6 italic">No add-ons in catalog</p>
            ) : (
              (addons as AddOn[])
                .filter((a) => a.isActive)
                .map((addon) => {
                  const alreadyAdded = (raw?.addOnIds ?? []).includes(addon.id);
                  const selected = pendingAddonIds.has(addon.id);
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => {
                        if (alreadyAdded) return;
                        setPendingAddonIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(addon.id)) next.delete(addon.id);
                          else next.add(addon.id);
                          return next;
                        });
                      }}
                      className={cn(
                        "w-full text-left rounded-xl border transition-all px-3 py-2.5",
                        alreadyAdded
                          ? "border-white/5 bg-white/2 opacity-40 cursor-not-allowed"
                          : selected
                            ? "border-sky-500/40 bg-sky-500/8 shadow-[0_0_8px_rgba(14,165,233,0.10)]"
                            : "border-white/8 bg-white/3 hover:bg-white/6 active:bg-white/8",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {selected && !alreadyAdded && (
                              <CheckCircle2 className="w-3 h-3 text-sky-400 shrink-0" />
                            )}
                            <p className="text-[11px] font-bold text-white leading-tight truncate">{addon.name}</p>
                          </div>
                          {addon.description && (
                            <p className="text-[9px] text-white/40 leading-tight mt-0.5 line-clamp-1">{addon.description}</p>
                          )}
                          {alreadyAdded && (
                            <p className="text-[9px] text-emerald-400/70 font-bold mt-0.5 leading-none">✓ Already on this job</p>
                          )}
                          {addon.estimatedDuration > 0 && !alreadyAdded && (
                            <p className="text-[8px] text-white/25 mt-0.5 leading-none">{addon.estimatedDuration} min</p>
                          )}
                        </div>
                        <span className="text-[12px] font-black text-white/80 shrink-0 tabular-nums">
                          ${addon.price.toFixed(0)}
                        </span>
                      </div>
                    </button>
                  );
                })
            )}
          </div>

          {/* Footer: running total + confirm */}
          <div className="flex-none px-3 py-3 border-t border-white/8 space-y-2">
            {pendingAddonsToAdd.length > 0 && (
              <div className="flex items-center justify-between px-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/40">
                  {pendingAddonsToAdd.length} add-on{pendingAddonsToAdd.length !== 1 ? "s" : ""} selected
                </span>
                <span className="text-[12px] font-black text-sky-300 tabular-nums">
                  +${pendingAddonsTotal.toFixed(2)}
                </span>
              </div>
            )}
            <button
              type="button"
              disabled={pendingAddonsToAdd.length === 0 || addingAddons}
              onClick={handleAddAddons}
              className={cn(
                "w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all",
                pendingAddonsToAdd.length === 0 || addingAddons
                  ? "bg-white/5 text-white/25 cursor-not-allowed"
                  : "bg-sky-500/20 border border-sky-500/30 text-sky-200 hover:bg-sky-500/30 active:bg-sky-500/40",
              )}
            >
              {addingAddons
                ? "Adding…"
                : pendingAddonsToAdd.length === 0
                  ? "Select Add-Ons Above"
                  : `Add ${pendingAddonsToAdd.length} Add-On${pendingAddonsToAdd.length !== 1 ? "s" : ""} · +$${pendingAddonsTotal.toFixed(2)}`}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Current Charges / Invoice sheet ──────────────────────────────── */}
      <Dialog open={showChargesSheet} onOpenChange={setShowChargesSheet}>
        <DialogContent
          className="max-w-sm mx-auto bg-[#0D0D0D] border border-white/10 rounded-2xl p-0 overflow-hidden flex flex-col"
          style={{ maxHeight: "82vh" }}
        >
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-white/8 flex-none">
            <DialogTitle className="text-[12px] font-black uppercase tracking-widest text-white/70 text-left flex items-center gap-2">
              <Receipt className="w-3.5 h-3.5 text-emerald-300" />
              {invoice ? "Invoice" : "Current Charges"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {invoice ? (
              <>
                {/* Status row */}
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg",
                    invoice.paymentStatus === "paid"
                      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                      : invoice.paymentStatus === "partial"
                        ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
                        : "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
                  )}>
                    {invoice.paymentStatus === "paid" ? "Paid" : invoice.paymentStatus === "partial" ? "Partial" : "Unpaid"}
                  </span>
                  {invoice.invoiceNumber && (
                    <span className="text-[9px] font-bold text-white/30">#{invoice.invoiceNumber}</span>
                  )}
                </div>

                {/* Line items */}
                {(invoice.lineItems ?? []).length > 0 && (
                  <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 px-3 pt-2.5 pb-1.5">
                      Line Items
                    </p>
                    <div className="divide-y divide-white/5">
                      {invoice.lineItems.map((li, i) => (
                        <div key={i} className="flex items-start justify-between px-3 py-2 gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold text-white leading-tight truncate">{li.serviceName}</p>
                            {li.description && (
                              <p className="text-[9px] text-white/40 leading-tight mt-0.5 truncate">{li.description}</p>
                            )}
                          </div>
                          <span className="text-[11px] font-black text-white/80 tabular-nums shrink-0">
                            ${(li.total ?? li.price ?? 0).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Totals */}
                    <div className="border-t border-white/8 px-3 py-2.5 space-y-1">
                      <div className="flex justify-between text-[12px]">
                        <span className="font-black text-white">Total</span>
                        <span className="font-black text-white">${(invoice.total ?? 0).toFixed(2)}</span>
                      </div>
                      {(invoice.amountPaid ?? 0) > 0 && (
                        <div className="flex justify-between text-[10px]">
                          <span className="text-emerald-400 font-bold">Paid</span>
                          <span className="text-emerald-400 font-bold">${(invoice.amountPaid ?? 0).toFixed(2)}</span>
                        </div>
                      )}
                      {(() => {
                        const bal = (invoice.total ?? 0) - (invoice.amountPaid ?? 0);
                        return bal > 0 ? (
                          <div className="flex justify-between text-[11px] pt-1 border-t border-white/8">
                            <span className="font-black text-rose-300">Balance Due</span>
                            <span className="font-black text-rose-300">${bal.toFixed(2)}</span>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                )}

                {/* Deposit info */}
                {raw?.depositPaid && (
                  <div className="flex items-center gap-2 px-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <p className="text-[10px] font-bold text-emerald-300">
                      Deposit paid · ${(raw.depositAmount ?? 0).toFixed(2)}
                    </p>
                  </div>
                )}

                {/* View full invoice button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowChargesSheet(false);
                    navigate(`/invoices?invoiceId=${invoice.id}`);
                  }}
                  className="w-full py-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 hover:bg-emerald-500/15 active:bg-emerald-500/20 transition-colors flex items-center justify-center gap-2"
                >
                  <Receipt className="w-3.5 h-3.5 text-emerald-300" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
                    View Full Invoice
                  </span>
                </button>
              </>
            ) : (
              /* No invoice — synthesise charges from appointment fields */
              <>
                {/* Services */}
                {((raw?.serviceSelections ?? []).length > 0 || (raw?.serviceNames ?? []).length > 0) && (
                  <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 px-3 pt-2.5 pb-1.5">
                      Services
                    </p>
                    <div className="divide-y divide-white/5">
                      {(raw?.serviceSelections ?? []).length > 0
                        ? (raw!.serviceSelections!).map((sel, i) => (
                            <div key={i} className="flex items-start justify-between px-3 py-2 gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-bold text-white leading-tight">{sel.name}</p>
                                {sel.description && (
                                  <p className="text-[9px] text-white/40 leading-tight mt-0.5 truncate">{sel.description}</p>
                                )}
                              </div>
                              {(sel.price ?? 0) > 0 && (
                                <span className="text-[11px] font-black text-white/80 tabular-nums shrink-0">
                                  ${(sel.price ?? 0).toFixed(2)}
                                </span>
                              )}
                            </div>
                          ))
                        : (raw?.serviceNames ?? []).map((name, i) => (
                            <div key={i} className="px-3 py-2">
                              <p className="text-[11px] font-bold text-white leading-tight">{name}</p>
                            </div>
                          ))}
                    </div>
                  </div>
                )}

                {/* Add-ons */}
                {((raw?.addOnSelections ?? []).length > 0 || (raw?.addOnNames ?? []).length > 0) && (
                  <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 px-3 pt-2.5 pb-1.5">
                      Add-Ons
                    </p>
                    <div className="divide-y divide-white/5">
                      {(raw?.addOnSelections ?? []).length > 0
                        ? (raw!.addOnSelections!).map((sel, i) => (
                            <div key={i} className="flex items-start justify-between px-3 py-2 gap-2">
                              <p className="text-[11px] font-bold text-white leading-tight">{sel.name}</p>
                              {(sel.price ?? 0) > 0 && (
                                <span className="text-[11px] font-black text-white/80 tabular-nums shrink-0">
                                  ${(sel.price ?? 0).toFixed(2)}
                                </span>
                              )}
                            </div>
                          ))
                        : (raw?.addOnNames ?? []).map((name, i) => (
                            <div key={i} className="px-3 py-2">
                              <p className="text-[11px] font-bold text-white leading-tight">{name}</p>
                            </div>
                          ))}
                    </div>
                  </div>
                )}

                {/* Total summary */}
                {(raw?.totalAmount ?? 0) > 0 && (
                  <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-3 space-y-1.5">
                    {(raw?.travelFee ?? 0) > 0 && (
                      <div className="flex justify-between text-[10px]">
                        <span className="text-white/50 font-bold">Travel Fee</span>
                        <span className="text-white font-bold">${(raw!.travelFee!).toFixed(2)}</span>
                      </div>
                    )}
                    {(raw?.discountAmount ?? 0) > 0 && (
                      <div className="flex justify-between text-[10px]">
                        <span className="text-emerald-400 font-bold">Discount</span>
                        <span className="text-emerald-400 font-bold">−${(raw!.discountAmount!).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[12px] pt-1 border-t border-white/8">
                      <span className="font-black text-white">Total</span>
                      <span className="font-black text-white">${raw!.totalAmount.toFixed(2)}</span>
                    </div>
                    {raw?.depositPaid && (
                      <div className="flex justify-between text-[10px]">
                        <span className="text-emerald-400 font-bold">Deposit Paid</span>
                        <span className="text-emerald-400 font-bold">${(raw.depositAmount ?? 0).toFixed(2)}</span>
                      </div>
                    )}
                    {(raw?.balanceDue ?? 0) > 0 && (
                      <div className="flex justify-between text-[11px] pt-1 border-t border-white/8">
                        <span className="text-rose-300 font-black">Balance Due</span>
                        <span className="text-rose-300 font-black">${(raw!.balanceDue as number).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-[9px] text-white/25 text-center px-2 leading-snug">
                  No invoice generated yet. Charges shown from appointment record.
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Change / Upgrade Service sheet ───────────────────────────────── */}
      <Dialog
        open={showChangeServiceSheet}
        onOpenChange={(v) => {
          if (!changingService) {
            setShowChangeServiceSheet(v);
            if (!v) setPendingServiceId(null);
          }
        }}
      >
        <DialogContent
          className="max-w-sm mx-auto bg-[#0D0D0D] border border-white/10 rounded-2xl p-0 overflow-hidden flex flex-col"
          style={{ maxHeight: "82vh" }}
        >
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-white/8 flex-none">
            <DialogTitle className="text-[12px] font-black uppercase tracking-widest text-white/70 text-left flex items-center gap-2">
              <Wrench className="w-3.5 h-3.5 text-amber-300" />
              Change / Upgrade Service
            </DialogTitle>
          </DialogHeader>

          {/* Current service indicator */}
          {(raw?.serviceNames ?? []).length > 0 && (
            <div className="px-4 py-2 border-b border-white/5 flex-none">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Current Service</p>
              <p className="text-[11px] font-bold text-white/60 mt-0.5 leading-tight truncate">
                {raw!.serviceNames!.join(", ")}
              </p>
            </div>
          )}

          {/* Service catalog list */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {(services as Service[]).filter((s) => s.isActive).length === 0 ? (
              <p className="text-[11px] text-white/30 text-center py-6 italic">No services in catalog</p>
            ) : (
              (services as Service[])
                .filter((s) => s.isActive)
                .map((svc) => {
                  const isCurrent = (raw?.serviceIds ?? []).includes(svc.id);
                  const isSelected = pendingServiceId === svc.id;
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => setPendingServiceId(isSelected ? null : svc.id)}
                      className={cn(
                        "w-full text-left rounded-xl border transition-all px-3 py-2.5",
                        isCurrent
                          ? "border-emerald-500/20 bg-emerald-500/5 cursor-default"
                          : isSelected
                            ? "border-amber-500/40 bg-amber-500/8 shadow-[0_0_8px_rgba(245,158,11,0.10)]"
                            : "border-white/8 bg-white/3 hover:bg-white/6 active:bg-white/8",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {isSelected && (
                              <CheckCircle2 className="w-3 h-3 text-amber-400 shrink-0" />
                            )}
                            {isCurrent && (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                            )}
                            <p className="text-[11px] font-bold text-white leading-tight truncate">{svc.name}</p>
                          </div>
                          {svc.description && (
                            <p className="text-[9px] text-white/40 leading-tight mt-0.5 line-clamp-1">{svc.description}</p>
                          )}
                          {isCurrent && (
                            <p className="text-[9px] text-emerald-400/70 font-bold mt-0.5 leading-none">✓ Currently booked</p>
                          )}
                          {svc.estimatedDuration > 0 && !isCurrent && (
                            <p className="text-[8px] text-white/25 mt-0.5 leading-none">{svc.estimatedDuration} min</p>
                          )}
                        </div>
                        <span className="text-[12px] font-black text-white/80 shrink-0 tabular-nums">
                          ${svc.basePrice.toFixed(0)}
                        </span>
                      </div>
                    </button>
                  );
                })
            )}
          </div>

          {/* Footer: price diff preview + confirm */}
          <div className="flex-none px-3 py-3 border-t border-white/8 space-y-2">
            {pendingService && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/50 font-bold">Price change</span>
                  <span className={cn("font-black tabular-nums", serviceChangeDelta >= 0 ? "text-amber-300" : "text-rose-300")}>
                    {serviceChangeDelta >= 0 ? "+" : ""}${serviceChangeDelta.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-white/70 font-black">New Total</span>
                  <span className="text-white font-black tabular-nums">${newServiceTotal.toFixed(2)}</span>
                </div>
              </div>
            )}
            <button
              type="button"
              disabled={!pendingServiceId || changingService}
              onClick={handleChangeService}
              className={cn(
                "w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all",
                !pendingServiceId || changingService
                  ? "bg-white/5 text-white/25 cursor-not-allowed"
                  : "bg-amber-500/20 border border-amber-500/30 text-amber-200 hover:bg-amber-500/30 active:bg-amber-500/40",
              )}
            >
              {changingService
                ? "Updating…"
                : pendingService
                  ? `Upgrade to ${pendingService.name} · $${pendingService.basePrice.toFixed(0)}`
                  : "Select a Service Above"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
