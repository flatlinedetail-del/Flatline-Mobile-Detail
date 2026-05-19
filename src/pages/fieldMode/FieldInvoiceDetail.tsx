import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  deleteField,
} from "firebase/firestore";
import { db } from "../../firebase";
import { messagingService } from "../../services/messagingService";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationDialog } from "../../components/DeleteConfirmationDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  Phone,
  Mail,
  DollarSign,
  CreditCard,
  FileText,
  Ban,
  Undo,
  Send,
  Copy,
  Check,
  Receipt,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import type { Invoice, BusinessSettings } from "../../types";

/**
 * Phone-only invoice detail screen — shown when InvoicesSwitch detects
 * isPhone && invoiceId in URL. Full Firestore reads/writes, all status-
 * conditional actions. No desktop-table layout on mobile.
 */

function convertTs(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (typeof ts === "string" || typeof ts === "number") return new Date(ts);
  return null;
}

function statusBadgeClasses(status: string): string {
  switch (status) {
    case "paid":   return "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30";
    case "sent":   return "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30";
    case "draft":  return "bg-white/10 text-white/60 ring-1 ring-white/15";
    case "voided": return "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30";
    default:       return "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30";
  }
}

function headerGradient(status: string): string {
  switch (status) {
    case "paid":   return "from-emerald-900/50 via-emerald-950/30 to-transparent border-emerald-500/20";
    case "voided": return "from-rose-900/50 via-rose-950/30 to-transparent border-rose-500/20";
    case "draft":  return "from-white/5 via-transparent to-transparent border-white/8";
    default:       return "from-primary/25 via-primary/10 to-transparent border-primary/20";
  }
}

export default function FieldInvoiceDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const invoiceId = searchParams.get("invoiceId") || "";

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!invoiceId) {
      navigate("/invoices", { replace: true });
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [invSnap, settingsSnap] = await Promise.all([
          getDoc(doc(db, "invoices", invoiceId)),
          getDoc(doc(db, "settings", "business")),
        ]);
        if (!active) return;
        if (invSnap.exists()) {
          setInvoice({ id: invSnap.id, ...invSnap.data() } as Invoice);
        }
        if (settingsSnap.exists()) {
          setSettings(settingsSnap.data() as BusinessSettings);
        }
      } catch (e) {
        console.error("[FieldInvoiceDetail] load failed:", e);
        toast.error("Failed to load invoice");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [invoiceId, navigate]);

  const MANUAL_METHODS = new Set(["Cash", "Zelle", "Check"]);

  const handleMarkAsPaid = async (method: string) => {
    if (!invoice?.id || isProcessingPayment) return;
    if (invoice.status === "paid" || invoice.status === "voided") {
      toast.info("Invoice already settled.");
      setShowPaymentDialog(false);
      return;
    }

    // Card / Apple Pay are not wired to a real processor in this screen.
    // Don't push a half-baked write through the manual path — surface a clear message.
    if (!MANUAL_METHODS.has(method)) {
      toast.error(
        "Card payment is not configured yet. Use Cash, Zelle, or Check for manual payment.",
        { id: "fi-payment" },
      );
      return;
    }

    const invoiceId = invoice.id;
    const appointmentId = invoice.appointmentId;
    const total = Number(invoice.total) || 0;
    const previouslyPaid = Number(invoice.amountPaid) || 0;
    const balance = Math.max(0, total - previouslyPaid);
    const newAmountPaid = previouslyPaid + balance;
    const isFullyPaid = newAmountPaid >= total && total > 0;

    setIsProcessingPayment(true);
    toast.loading("Processing…", { id: "fi-payment" });

    // serverTimestamp() is not allowed inside arrayUnion — use new Date() for array entries.
    const paymentHistoryEntry: Record<string, any> = {
      action: "paid",
      timestamp: new Date(),
      method,
      amount: balance,
      provider: "manual",
    };

    // Build update payloads conditionally so Firestore never receives undefined values.
    const invoiceUpdate: Record<string, any> = {
      amountPaid: newAmountPaid,
      balanceDue: isFullyPaid ? 0 : Math.max(0, total - newAmountPaid),
      paymentStatus: isFullyPaid ? "paid" : "partial",
      paymentMethod: method,
      paymentMethodDetails: method,
      paymentProvider: "manual",
      paymentHistory: arrayUnion(paymentHistoryEntry),
      updatedAt: serverTimestamp(),
    };
    if (isFullyPaid) {
      invoiceUpdate.status = "paid";
      invoiceUpdate.paidAt = serverTimestamp();
    }

    try {
      await updateDoc(doc(db, "invoices", invoiceId), invoiceUpdate);
    } catch (error: any) {
      console.error("[FieldInvoiceDetail] payment failed", {
        invoiceId,
        appointmentId,
        method,
        error,
      });
      const msg = error?.message ?? String(error);
      toast.error(`Payment failed: ${msg.slice(0, 140)}`, { id: "fi-payment" });
      setIsProcessingPayment(false);
      return;
    }

    // Update linked appointment — report failure separately, don't roll back the invoice.
    let appointmentSyncFailed = false;
    if (appointmentId) {
      const appointmentUpdate: Record<string, any> = {
        paymentStatus: isFullyPaid ? "paid" : "partial",
        paymentMethod: method,
      };
      if (isFullyPaid) {
        appointmentUpdate.balanceDue = 0;
        appointmentUpdate.paidAt = serverTimestamp();
      }
      try {
        await updateDoc(doc(db, "appointments", appointmentId), appointmentUpdate);
      } catch (error: any) {
        appointmentSyncFailed = true;
        console.error("[FieldInvoiceDetail] payment failed", {
          invoiceId,
          appointmentId,
          method,
          error,
        });
      }
    }

    setInvoice((prev) =>
      prev
        ? ({
            ...prev,
            amountPaid: newAmountPaid,
            balanceDue: isFullyPaid ? 0 : Math.max(0, total - newAmountPaid),
            paymentStatus: isFullyPaid ? "paid" : "partial",
            status: isFullyPaid ? "paid" : prev.status,
            paymentMethodDetails: method,
            paymentProvider: "manual",
            paymentHistory: [
              ...(prev.paymentHistory || []),
              { ...paymentHistoryEntry, timestamp: new Date() },
            ],
          } as Invoice)
        : null,
    );

    if (invoice.clientPhone && balance > 0) {
      messagingService
        .sendSms({
          to: invoice.clientPhone,
          body: `DetailFlow: Payment of ${formatCurrency(balance)} received via ${method}. Thank you! Reply STOP to opt out.`,
        })
        .catch((e) => console.error("Receipt SMS failed:", e));
    }

    sessionStorage.removeItem("invoices_cache");
    sessionStorage.removeItem("invoices_cache_time");

    if (appointmentSyncFailed) {
      toast.warning(
        "Payment recorded — but linked appointment could not be updated.",
        { id: "fi-payment" },
      );
    } else {
      toast.success("Payment recorded", { id: "fi-payment" });
    }
    setShowPaymentDialog(false);
    setIsProcessingPayment(false);
  };

  const handleVoidInvoice = async () => {
    if (!invoice?.id) return;
    try {
      toast.loading("Voiding…", { id: "fi-void" });
      const entry = {
        action: "voided",
        timestamp: new Date(),
        method: invoice.paymentMethodDetails || invoice.paymentProvider || "unknown",
      };
      await updateDoc(doc(db, "invoices", invoice.id), {
        status: "voided",
        paymentStatus: "voided",
        paymentHistory: arrayUnion(entry),
      });
      setInvoice((prev) =>
        prev
          ? ({
              ...prev,
              status: "voided",
              paymentStatus: "voided",
              paymentHistory: [...(prev.paymentHistory || []), { ...entry, timestamp: new Date() }],
            } as Invoice)
          : null,
      );
      if (invoice.appointmentId) {
        updateDoc(doc(db, "appointments", invoice.appointmentId), {
          paymentStatus: "voided",
        }).catch(() => {});
      }
      sessionStorage.removeItem("invoices_cache");
      sessionStorage.removeItem("invoices_cache_time");
      toast.success("Invoice voided", { id: "fi-void" });
    } catch (error) {
      console.error("Void error:", error);
      toast.error("Failed to void invoice", { id: "fi-void" });
    }
  };

  const handleUndoPayment = async () => {
    if (!invoice?.id) return;
    try {
      toast.loading("Reversing payment…", { id: "fi-undo" });
      const entry = {
        action: "undone",
        timestamp: new Date(),
        method: invoice.paymentMethodDetails || invoice.paymentProvider || "unknown",
      };
      await updateDoc(doc(db, "invoices", invoice.id), {
        status: "pending",
        paymentStatus: "unpaid",
        paymentProvider: deleteField(),
        paymentMethodDetails: deleteField(),
        paidAt: deleteField(),
        transactionReference: deleteField(),
        paymentHistory: arrayUnion(entry),
      } as any);
      setInvoice((prev) => {
        if (!prev) return null;
        const next: any = { ...prev };
        next.status = "pending";
        next.paymentStatus = "unpaid";
        delete next.paymentProvider;
        delete next.paymentMethodDetails;
        delete next.paidAt;
        delete next.transactionReference;
        next.paymentHistory = [
          ...(prev.paymentHistory || []),
          { ...entry, timestamp: new Date() },
        ];
        return next as Invoice;
      });
      if (invoice.appointmentId) {
        updateDoc(doc(db, "appointments", invoice.appointmentId), {
          paymentStatus: "unpaid",
        }).catch(() => {});
      }
      sessionStorage.removeItem("invoices_cache");
      sessionStorage.removeItem("invoices_cache_time");
      toast.success("Payment reversed to unpaid", { id: "fi-undo" });
    } catch (error) {
      console.error("Undo error:", error);
      toast.error("Failed to reverse payment", { id: "fi-undo" });
    }
  };

  const handleSendInvoice = async () => {
    if (!invoice) return;
    const to = invoice.clientEmail;
    if (!to) {
      toast.error("No email address on file for this client.");
      return;
    }
    try {
      toast.loading("Sending…", { id: "fi-send" });
      await messagingService.sendEmail({
        to,
        subject: `Invoice ${invoice.invoiceNumber ?? invoice.id.slice(-6).toUpperCase()} from ${settings?.businessName ?? "Us"}`,
        html: `<p>Hi ${invoice.clientName},</p><p>Your invoice <strong>${invoice.invoiceNumber ?? ""}</strong> is ready.</p><p>Total: <strong>${formatCurrency(invoice.total)}</strong></p><p>Thank you for your business!</p>`,
      });
      if (invoice.clientPhone) {
        messagingService
          .sendSms({
            to: invoice.clientPhone,
            body: `DetailFlow: Your invoice is ready. Please complete payment at your convenience. Reply STOP to opt out.`,
          })
          .catch((e) => console.error("Invoice SMS failed:", e));
      }
      if (invoice.status === "draft") {
        await updateDoc(doc(db, "invoices", invoice.id), { status: "sent" });
        setInvoice((prev) => (prev ? ({ ...prev, status: "sent" } as Invoice) : null));
      }
      toast.success("Invoice sent", { id: "fi-send" });
    } catch (e: any) {
      toast.error(e.message || "Failed to send invoice", { id: "fi-send" });
    }
  };

  const handleCopyPaymentLink = () => {
    const link = (invoice as any)?.paymentLink as string | undefined;
    if (!link) {
      toast.error("No payment link on file for this invoice.");
      return;
    }
    navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopiedLink(true);
        toast.success("Payment link copied!");
        setTimeout(() => setCopiedLink(false), 2000);
      })
      .catch(() => toast.error("Failed to copy link."));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="w-5 h-5 border-2 border-white/10 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-12 space-y-3">
        <Receipt className="w-8 h-8 text-white/30 mx-auto" />
        <p className="text-sm font-bold text-white/60">Invoice not found</p>
        <Button
          variant="ghost"
          onClick={() => navigate("/invoices")}
          className="text-primary text-xs font-black uppercase tracking-widest"
        >
          Back to Invoices
        </Button>
      </div>
    );
  }

  const status = invoice.status || "draft";
  const isPaid = status === "paid";
  const isVoided = status === "voided";
  const isDraft = status === "draft";
  const isUnpaid = !isPaid && !isVoided;
  const balanceRemaining = Math.max(0, (invoice.total || 0) - (invoice.amountPaid || 0));
  const createdDate = convertTs(invoice.createdAt);
  const paidDate = convertTs((invoice as any).paidAt);
  const hasPaymentLink = !!(invoice as any).paymentLink;
  const taxAmount = (invoice as any).taxAmount as number | undefined;
  const afterHoursFeeAmount = (invoice as any).afterHoursFeeAmount as number | undefined;
  const invoiceNotes = (invoice as any).notes as string | undefined;

  return (
    <div className="space-y-3 pb-6">
      {/* Back — returnTo state from ActiveJob wins, then browser history, then fallback */}
      <button
        type="button"
        onClick={() => {
          const returnTo = (location.state as any)?.returnTo as string | undefined;
          if (returnTo) {
            navigate(returnTo);
          } else if (window.history.length > 1) {
            navigate(-1);
          } else if (invoice?.appointmentId) {
            navigate(`/field/job/${invoice.appointmentId}`);
          } else {
            navigate("/invoices");
          }
        }}
        className="flex items-center gap-1 text-white/50 hover:text-white text-xs font-black uppercase tracking-widest transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <div
        className={cn(
          "rounded-2xl bg-gradient-to-br border p-4 space-y-3",
          headerGradient(status),
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Invoice</p>
            <p className="text-2xl font-black text-white tracking-tighter leading-tight">
              {invoice.invoiceNumber
                ? `#${invoice.invoiceNumber}`
                : `#${invoice.id.slice(-6).toUpperCase()}`}
            </p>
          </div>
          <span
            className={cn(
              "text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full leading-none mt-1",
              statusBadgeClasses(status),
            )}
          >
            {status}
          </span>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
            {isPaid ? "Total Paid" : isVoided ? "Voided Amount" : "Amount Due"}
          </p>
          <p className="text-3xl font-black text-white tracking-tighter leading-none">
            {formatCurrency(isPaid ? invoice.total || 0 : balanceRemaining)}
          </p>
          {(invoice.amountPaid || 0) > 0 && !isPaid && (
            <p className="text-[10px] text-white/40 font-bold mt-0.5">
              {formatCurrency(invoice.amountPaid)} paid · {formatCurrency(invoice.total)} total
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-white/40 uppercase tracking-widest">
          {createdDate && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(createdDate, "MMM d, yyyy")}
            </span>
          )}
          {isPaid && paidDate && (
            <span className="flex items-center gap-1 text-emerald-400">
              <Check className="w-3 h-3" />
              Paid {format(paidDate, "MMM d")}
            </span>
          )}
        </div>
      </div>

      {/* Client */}
      <div className="rounded-xl bg-white/5 border border-white/8 p-3 space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Client</p>
        <p className="text-sm font-black text-white">{invoice.clientName}</p>
        <div className="flex gap-2 flex-wrap">
          {invoice.clientPhone && (
            <a
              href={`tel:${invoice.clientPhone}`}
              className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/70 transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-primary" /> Call
            </a>
          )}
          {invoice.clientEmail && (
            <a
              href={`mailto:${invoice.clientEmail}`}
              className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/70 transition-colors"
            >
              <Mail className="w-3.5 h-3.5 text-primary" /> Email
            </a>
          )}
        </div>
      </div>

      {/* Vehicles */}
      {invoice.vehicles && invoice.vehicles.length > 0 && (
        <div className="rounded-xl bg-white/5 border border-white/8 px-3 py-2.5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-1.5">Vehicles</p>
          <div className="space-y-1">
            {invoice.vehicles.map((v, idx) => (
              <p key={idx} className="text-[12px] font-bold text-white/80">
                {v.year} {v.make} {v.model}
                {v.roNumber && (
                  <span className="text-white/40 ml-2 text-[10px]">RO #{v.roNumber}</span>
                )}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Line items */}
      {invoice.lineItems && invoice.lineItems.length > 0 && (
        <div className="rounded-xl bg-white/5 border border-white/8 overflow-hidden">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 px-3 pt-3 pb-2">
            Services
          </p>
          <div className="divide-y divide-white/5">
            {invoice.lineItems.map((item, idx) => (
              <div key={idx} className="flex items-start justify-between px-3 py-2.5 gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-white truncate">{item.serviceName}</p>
                  {item.description && (
                    <p className="text-[10px] text-white/40 truncate leading-tight mt-0.5">
                      {item.description}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-black text-white">
                    {formatCurrency(item.total ?? item.price ?? 0)}
                  </p>
                  {(item.quantity ?? 1) > 1 && (
                    <p className="text-[9px] text-white/40">×{item.quantity}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Totals footer */}
          <div className="border-t border-white/10 px-3 py-2.5 space-y-1">
            {invoice.subtotal != null && invoice.subtotal !== invoice.total && (
              <div className="flex justify-between text-[11px]">
                <span className="text-white/50 font-bold">Subtotal</span>
                <span className="text-white font-bold">{formatCurrency(invoice.subtotal)}</span>
              </div>
            )}
            {(invoice.discountAmount ?? 0) > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-emerald-400 font-bold">Discount</span>
                <span className="text-emerald-400 font-bold">
                  −{formatCurrency(invoice.discountAmount ?? 0)}
                </span>
              </div>
            )}
            {(invoice.travelFeeAmount ?? 0) > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-white/50 font-bold">Travel Fee</span>
                <span className="text-white font-bold">
                  {formatCurrency(invoice.travelFeeAmount ?? 0)}
                </span>
              </div>
            )}
            {(afterHoursFeeAmount ?? 0) > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-white/50 font-bold">After Hours</span>
                <span className="text-white font-bold">{formatCurrency(afterHoursFeeAmount ?? 0)}</span>
              </div>
            )}
            {(taxAmount ?? 0) > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-white/50 font-bold">Tax</span>
                <span className="text-white font-bold">{formatCurrency(taxAmount ?? 0)}</span>
              </div>
            )}
            {invoice.lateFeeApplied != null && invoice.lateFeeApplied > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-amber-400 font-bold">Late Fee</span>
                <span className="text-amber-400 font-bold">
                  {formatCurrency(invoice.lateFeeApplied)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-[13px] pt-1 border-t border-white/10">
              <span className="text-white font-black">Total</span>
              <span className="text-white font-black">{formatCurrency(invoice.total || 0)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Payment history */}
      {invoice.paymentHistory && invoice.paymentHistory.length > 0 && (
        <div className="rounded-xl bg-white/5 border border-white/8 overflow-hidden">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 px-3 pt-3 pb-2">
            Payment History
          </p>
          <div className="divide-y divide-white/5">
            {invoice.paymentHistory.map((entry: any, idx: number) => {
              const entryDate = convertTs(entry.timestamp);
              return (
                <div key={idx} className="flex items-center justify-between px-3 py-2.5 gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-white capitalize">{entry.action}</p>
                    <p className="text-[9px] text-white/40 font-medium">
                      {entry.method || "unknown"}
                      {entryDate ? ` · ${format(entryDate, "MMM d, h:mm a")}` : ""}
                    </p>
                  </div>
                  {entry.amount != null && (
                    <p className="text-[12px] font-black text-white shrink-0">
                      {formatCurrency(entry.amount)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes */}
      {invoiceNotes && (
        <div className="rounded-xl bg-white/5 border border-white/8 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">Notes</p>
          <p className="text-[12px] text-white/70 font-medium leading-relaxed">{invoiceNotes}</p>
        </div>
      )}

      {/* ── Status-conditional actions ── */}
      {!isVoided && (
        <div className="space-y-2 pt-1">
          {/* PRIMARY: record payment (pending/sent/partial) */}
          {isUnpaid && (
            <Button
              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-900/30"
              onClick={() => setShowPaymentDialog(true)}
              disabled={isProcessingPayment}
            >
              <DollarSign className="w-4 h-4 mr-2" />
              {isProcessingPayment ? "Processing…" : "Record Payment"}
            </Button>
          )}

          {/* SECONDARY row */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="h-11 rounded-xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-[10px] hover:bg-white/10"
              onClick={handleSendInvoice}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {isDraft ? "Send" : "Resend"}
            </Button>

            {hasPaymentLink && isUnpaid && (
              <Button
                className="h-11 rounded-xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-[10px] hover:bg-white/10"
                onClick={handleCopyPaymentLink}
              >
                {copiedLink ? (
                  <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                )}
                {copiedLink ? "Copied!" : "Copy Link"}
              </Button>
            )}

            {isPaid && (
              <DeleteConfirmationDialog
                title="Undo Payment"
                description="This will revert the invoice to unpaid status."
                onConfirm={handleUndoPayment}
                trigger={
                  <Button className="h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 font-black uppercase tracking-widest text-[10px] hover:bg-amber-500/20">
                    <Undo className="w-3.5 h-3.5 mr-1.5" /> Undo
                  </Button>
                }
              />
            )}
          </div>

          {/* DESTRUCTIVE — separated, lower priority */}
          {isUnpaid && (
            <DeleteConfirmationDialog
              title="Void Invoice"
              description="This will mark the invoice as voided and retain it for records. This cannot be undone."
              onConfirm={handleVoidInvoice}
              trigger={
                <Button
                  variant="ghost"
                  className="w-full h-10 rounded-xl text-rose-400 hover:bg-rose-500/10 font-black uppercase tracking-widest text-[9px] border border-rose-500/10"
                >
                  <Ban className="w-3.5 h-3.5 mr-1.5" /> Void Invoice
                </Button>
              }
            />
          )}
        </div>
      )}

      {/* Voided read-only notice */}
      {isVoided && (
        <div className="rounded-xl bg-rose-500/5 border border-rose-500/20 p-3 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <div>
            <p className="text-xs font-black text-rose-300 uppercase tracking-widest">Invoice Voided</p>
            <p className="text-[10px] text-rose-300/60 mt-0.5">No further actions available.</p>
          </div>
        </div>
      )}

      {/* Payment method dialog */}
      {showPaymentDialog && (
        <Dialog
          open={showPaymentDialog}
          onOpenChange={(open) => {
            if (!isProcessingPayment) setShowPaymentDialog(open);
          }}
        >
          <DialogContent className="sm:max-w-[420px] p-0 bg-card border-none rounded-3xl overflow-hidden shadow-2xl shadow-black">
            <DialogHeader className="p-5 border-b border-white/5 bg-black/40">
              <DialogTitle className="font-black text-base uppercase tracking-widest text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" /> Record Payment
              </DialogTitle>
              <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">
                {invoice.clientName} · Balance: {formatCurrency(balanceRemaining)}
              </p>
            </DialogHeader>
            <div className="p-4 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30 px-1">Manual / Cash</p>
              {[
                { label: "Cash", icon: DollarSign },
                { label: "Zelle", icon: DollarSign },
                { label: "Check", icon: FileText },
              ].map(({ label, icon: Icon }) => (
                <Button
                  key={label}
                  disabled={isProcessingPayment}
                  variant="ghost"
                  className="w-full h-12 rounded-xl font-black uppercase tracking-widest text-[10px] bg-white/5 border border-white/10 text-white hover:bg-white/10 justify-start px-4 gap-3 disabled:opacity-50"
                  onClick={() => handleMarkAsPaid(label)}
                >
                  <Icon className="w-4 h-4 text-emerald-400 shrink-0" />
                  {isProcessingPayment ? "Processing…" : label}
                </Button>
              ))}

              <p className="text-[9px] font-black uppercase tracking-widest text-white/30 px-1 pt-2">
                In-Person Card
              </p>
              {[
                { label: "Credit / Debit Card", icon: CreditCard },
                { label: "Apple Pay", icon: DollarSign },
              ].map(({ label, icon: Icon }) => (
                <Button
                  key={label}
                  disabled={isProcessingPayment}
                  variant="ghost"
                  className="w-full h-12 rounded-xl font-black uppercase tracking-widest text-[10px] bg-white/5 border border-white/10 text-white hover:bg-white/10 justify-start px-4 gap-3 disabled:opacity-50"
                  onClick={() => handleMarkAsPaid(label)}
                >
                  <Icon className="w-4 h-4 text-sky-400 shrink-0" />
                  {isProcessingPayment ? "Processing…" : label}
                </Button>
              ))}
              <p className="text-[9px] text-white/28 font-medium text-center pt-1 leading-relaxed px-2">
                Card &amp; Apple Pay processing is not configured.
                Use Cash, Zelle, or Check for manual payment.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
