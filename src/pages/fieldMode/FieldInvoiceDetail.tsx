import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn, toJsDateOrNull } from "@/lib/utils";
import {
  ArrowLeft,
  Receipt,
  Monitor,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface InvoiceData {
  clientName?: string;
  invoiceNumber?: string;
  status?: string;
  paymentStatus?: string;
  total?: number;
  totalAmount?: number;
  serviceNames?: string[];
  createdAt?: unknown;
}

function statusTone(s: string): string {
  switch (s) {
    case "paid":   return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "sent":   return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "draft":  return "bg-white/10 text-white/70 ring-white/15";
    case "voided": return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
    default:       return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
  }
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export default function FieldInvoiceDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invoiceId = searchParams.get("invoiceId");

  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) {
      setLoading(false);
      return;
    }
    const ref = doc(db, "invoices", invoiceId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setInvoice(snap.data() as InvoiceData);
        } else {
          setError("Invoice not found.");
        }
        setLoading(false);
      },
      (err) => {
        console.warn("[FieldInvoiceDetail] snapshot error", err);
        setError(err?.message || "Failed to load invoice.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [invoiceId]);

  // ── No invoiceId ──
  if (!invoiceId) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <h1 className="text-base font-black text-white leading-none">Invoice</h1>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-[12px] font-bold text-rose-300 leading-tight">No invoice selected.</p>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <h1 className="text-base font-black text-white leading-none">Invoice</h1>
        </div>
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-3 flex items-center justify-center min-h-[56px]">
          <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
          <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/40">
            Loading…
          </span>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error || !invoice) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <h1 className="text-base font-black text-white leading-none">Invoice</h1>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-300 leading-tight">
              Couldn't load invoice
            </p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">
              {error ?? "Unknown error"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const status = invoice.status ?? "draft";
  const amount = invoice.total ?? invoice.totalAmount ?? 0;
  const createdDate = toJsDateOrNull(invoice.createdAt);
  const services = invoice.serviceNames?.join(", ") || "—";
  const isPaid = status === "paid";

  return (
    <div className="space-y-3">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <h1 className="text-base font-black text-white leading-none">Invoice</h1>
      </div>

      {/* ── Header card ── */}
      <div className="rounded-xl border border-white/5 bg-sidebar/60 px-3 py-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-white leading-tight truncate">
              {invoice.clientName ?? "Unknown Client"}
            </p>
            <p className="text-[10px] text-white/45 font-medium mt-0.5 leading-tight">
              {invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : "Invoice"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isPaid && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span
              className={cn(
                "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none",
                statusTone(status),
              )}
            >
              {status}
            </span>
          </div>
        </div>

        {/* Amount */}
        <div className="mt-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-1">
            Total
          </p>
          <p className="text-3xl font-black text-white leading-none">
            {fmtCurrency(amount)}
          </p>
        </div>
      </div>

      {/* ── Info rows ── */}
      <div className="rounded-xl border border-white/5 bg-sidebar/40 divide-y divide-white/[0.04]">
        {/* Date */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 min-h-[48px]">
          <Receipt className="w-3.5 h-3.5 text-white/40 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-0.5">
              Date
            </p>
            <p className="text-[12px] font-bold text-white leading-tight">
              {createdDate ? fmtDate(createdDate) : "—"}
            </p>
          </div>
        </div>
        {/* Services */}
        <div className="flex items-start gap-2.5 px-3 py-2.5 min-h-[48px]">
          <CheckCircle2 className="w-3.5 h-3.5 text-white/40 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-0.5">
              Services
            </p>
            <p className="text-[12px] font-bold text-white leading-tight">{services}</p>
          </div>
        </div>
      </div>

      {/* ── Bridge card ── */}
      <button
        type="button"
        onClick={() =>
          navigate(`/invoices?invoiceId=${invoiceId}&adminView=1`)
        }
        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-2.5 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-md bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
          <Monitor className="w-4 h-4 text-white/50" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-bold text-white leading-tight">Open Full Invoice</p>
          <p className="text-[10px] text-white/40 leading-tight mt-0.5">
            Send, mark paid, generate PDF, process refund
          </p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>
    </div>
  );
}
