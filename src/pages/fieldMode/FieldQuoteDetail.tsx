import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn, toJsDateOrNull } from "@/lib/utils";
import {
  ArrowLeft,
  FileText,
  Car,
  Monitor,
  ExternalLink,
  AlertCircle,
} from "lucide-react";

interface QuoteVehicle {
  id?: string;
  year?: string;
  make?: string;
  model?: string;
}

interface QuoteLineItem {
  serviceName?: string;
  name?: string;
  price?: number;
  quantity?: number;
  total?: number;
}

interface QuoteData {
  clientName?: string;
  businessName?: string;
  clientPhone?: string;
  clientEmail?: string;
  vehicles?: QuoteVehicle[];
  lineItems?: QuoteLineItem[];
  total?: number;
  status?: string;
  createdAt?: unknown;
}

function statusTone(s: string): string {
  switch (s) {
    case "approved": return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "sent":     return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "draft":    return "bg-white/10 text-white/70 ring-white/15";
    default:         return "bg-white/10 text-white/70 ring-white/15";
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

function vehicleLabel(v: QuoteVehicle): string {
  return [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle";
}

function lineItemName(item: QuoteLineItem): string {
  return item.serviceName ?? item.name ?? "Service";
}

function lineItemPrice(item: QuoteLineItem): number {
  return item.total ?? item.price ?? 0;
}

export default function FieldQuoteDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const quoteId = searchParams.get("quoteId");

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!quoteId) {
      setLoading(false);
      return;
    }
    const ref = doc(db, "quotes", quoteId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setQuote(snap.data() as QuoteData);
        } else {
          setError("Quote not found.");
        }
        setLoading(false);
      },
      (err) => {
        console.warn("[FieldQuoteDetail] snapshot error", err);
        setError(err?.message || "Failed to load quote.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [quoteId]);

  // ── No quoteId ──
  if (!quoteId) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <h1 className="text-base font-black text-white leading-none">Quote</h1>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-[12px] font-bold text-rose-300 leading-tight">No quote selected.</p>
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
          <h1 className="text-base font-black text-white leading-none">Quote</h1>
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
  if (error || !quote) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <h1 className="text-base font-black text-white leading-none">Quote</h1>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-300 leading-tight">
              Couldn't load quote
            </p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">
              {error ?? "Unknown error"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const status = quote.status ?? "draft";
  const vehicles = quote.vehicles ?? [];
  const lineItems = quote.lineItems ?? [];
  const total = quote.total ?? 0;

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
        <h1 className="text-base font-black text-white leading-none">Quote</h1>
      </div>

      {/* ── Header card ── */}
      <div className="rounded-xl border border-white/5 bg-sidebar/60 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-white leading-none truncate">
              {quote.clientName ?? "Unknown Client"}
            </p>
            {quote.businessName && (
              <p className="text-[10px] text-white/45 font-medium mt-0.5 leading-tight truncate">
                {quote.businessName}
              </p>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none",
              statusTone(status),
            )}
          >
            {status}
          </span>
        </div>
      </div>

      {/* ── Vehicles ── */}
      {vehicles.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-2.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-2">
            Vehicles
          </p>
          <div className="flex flex-wrap gap-1.5">
            {vehicles.map((v, i) => (
              <div
                key={v.id ?? i}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] border border-white/10"
              >
                <Car className="w-3 h-3 text-white/40 shrink-0" />
                <span className="text-[11px] font-bold text-white leading-none">
                  {vehicleLabel(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Line items ── */}
      {lineItems.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 divide-y divide-white/[0.04]">
          <div className="flex items-center gap-2 px-3 py-2">
            <FileText className="w-3 h-3 text-white/40 shrink-0" />
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none">
              Line Items
            </p>
          </div>
          {lineItems.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 px-3 py-2.5 min-h-[44px]"
            >
              <p className="text-[12px] font-bold text-white leading-tight flex-1 min-w-0 truncate">
                {lineItemName(item)}
              </p>
              <p className="text-[12px] font-bold text-white/70 shrink-0">
                {fmtCurrency(lineItemPrice(item))}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Total ── */}
      <div className="rounded-xl border border-white/5 bg-sidebar/60 px-3 py-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-1">
          Total
        </p>
        <p className="text-3xl font-black text-white leading-none">{fmtCurrency(total)}</p>
      </div>

      {/* ── Bridge card ── */}
      <button
        type="button"
        onClick={() => navigate(`/quotes?quoteId=${quoteId}&adminView=1`)}
        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-2.5 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-md bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
          <Monitor className="w-4 h-4 text-white/50" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-bold text-white leading-tight">Open Full Quote</p>
          <p className="text-[10px] text-white/40 leading-tight mt-0.5">
            Edit items, send to client, convert to booking
          </p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>
    </div>
  );
}
