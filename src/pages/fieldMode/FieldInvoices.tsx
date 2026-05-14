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
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ChevronRight,
  Receipt as ReceiptIcon,
} from "lucide-react";

/**
 * Phone-only Invoices view. Renders at `/invoices` when the device is
 * a phone, via InvoicesSwitch in App.tsx. Desktop/tablet continue to
 * render the existing full `Invoices` page unchanged.
 *
 * Live snapshot of the SAME `invoices` collection used by the desktop
 * page. Tapping a row navigates to `/invoices?invoiceId=<id>` —
 * InvoicesSwitch falls through to the full Invoices page when the URL
 * carries `invoiceId`, so the user gets every desktop action (send,
 * mark paid, PDF, refund) without a reduced phone-only feature set.
 *
 * No duplicate Firestore store, no schema divergence.
 */

interface FieldInvoiceRow {
  id: string;
  invoiceNumber?: string;
  clientName: string;
  total: number;
  status: string;
  paymentStatus: string;
  createdAtMs: number;
}

function toRow(id: string, data: Record<string, unknown>): FieldInvoiceRow {
  const created = data.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    invoiceNumber: (data.invoiceNumber as string | undefined) || undefined,
    clientName: String(data.clientName ?? "Unknown client"),
    total: typeof data.total === "number" ? (data.total as number) : 0,
    status: String(data.status ?? "draft"),
    paymentStatus: String(data.paymentStatus ?? "unpaid"),
    createdAtMs: typeof created?.toMillis === "function" ? created.toMillis() : 0,
  };
}

function statusTone(s: string): string {
  switch (s) {
    case "paid": return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "sent": return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "draft": return "bg-white/10 text-white/70 ring-white/15";
    case "voided": return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
    default: return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
  }
}

export default function FieldInvoices() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FieldInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: FieldInvoiceRow[] = [];
        snap.forEach((doc) => next.push(toRow(doc.id, doc.data() as Record<string, unknown>)));
        setRows(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("[FieldInvoices] snapshot error", err);
        setError(err?.message || "Failed to load invoices");
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  return (
    <div className="space-y-3">
      <div className="px-0.5 flex items-baseline gap-2">
        <h1 className="text-base font-black text-white leading-none">Invoices</h1>
        {!loading && (
          <span className="text-[9px] font-black uppercase tracking-widest text-white/35">{rows.length} recent</span>
        )}
      </div>

      {loading && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-3 flex items-center justify-center min-h-[56px]">
          <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
          <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/40">Loading…</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load invoices</p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-5 text-center">
          <ReceiptIcon className="w-5 h-5 text-white/30 mx-auto" />
          <p className="text-[11px] font-bold text-white/70 mt-1.5">No invoices yet</p>
        </div>
      )}

      <div className="space-y-1.5">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => navigate(`/invoices?invoiceId=${encodeURIComponent(r.id)}`)}
            className={cn(
              "w-full text-left rounded-xl border border-white/5 bg-sidebar/60",
              "hover:bg-sidebar/80 active:bg-sidebar transition-colors px-2.5 py-2 min-h-[56px]",
              "flex items-center gap-2.5",
            )}
          >
            <div className="shrink-0 w-9 h-9 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center">
              <ReceiptIcon className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-white truncate leading-tight">{r.clientName}</p>
              <p className="text-[10px] text-white/45 font-medium truncate leading-tight mt-0.5">
                {r.invoiceNumber ? `#${r.invoiceNumber} · ` : ""}${r.total.toFixed(2)}
              </p>
              <span className={cn("inline-block mt-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none", statusTone(r.status))}>
                {r.status}
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
