import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, formatCurrency } from "@/lib/utils";
import { AlertCircle, ChevronDown, ChevronRight, Receipt as ReceiptIcon } from "lucide-react";

/**
 * Phone-only invoice list — grouped by client, with status-aware glow rings.
 * Tapping an invoice row navigates to /invoices?invoiceId=<id>, which
 * InvoicesSwitch now routes to FieldInvoiceDetail on phones.
 *
 * Same Firestore collection as the desktop Invoices page, no schema divergence.
 */

interface FieldInvoiceRow {
  id: string;
  invoiceNumber?: string;
  clientName: string;
  clientId?: string;
  total: number;
  status: string;
  paymentStatus: string;
  createdAtMs: number;
}

interface ClientGroup {
  groupKey: string;
  clientName: string;
  invoices: FieldInvoiceRow[];
  totalAmount: number;
  unpaidCount: number;
  glowStatus: "paid" | "amber" | "voided" | "draft" | "mixed";
}

function toRow(id: string, data: Record<string, unknown>): FieldInvoiceRow {
  const created = data.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    invoiceNumber: (data.invoiceNumber as string | undefined) || undefined,
    clientName: String(data.clientName ?? "Unknown client"),
    clientId: (data.clientId as string | undefined) || undefined,
    total: typeof data.total === "number" ? (data.total as number) : 0,
    status: String(data.status ?? "draft"),
    paymentStatus: String(data.paymentStatus ?? "unpaid"),
    createdAtMs: typeof created?.toMillis === "function" ? created.toMillis() : 0,
  };
}

function getGroupGlowStatus(invoices: FieldInvoiceRow[]): ClientGroup["glowStatus"] {
  const statuses = new Set(invoices.map((i) => i.status));
  if (statuses.size === 1) {
    const s = [...statuses][0];
    if (s === "paid") return "paid";
    if (s === "voided") return "voided";
    if (s === "draft") return "draft";
    return "amber";
  }
  const hasUnpaid = invoices.some((i) => i.status !== "paid" && i.status !== "voided");
  if (hasUnpaid) return "amber";
  return "mixed";
}

function glowClasses(gs: ClientGroup["glowStatus"]): string {
  switch (gs) {
    case "paid":   return "ring-1 ring-emerald-500/40 shadow-[0_0_14px_rgba(52,211,153,0.12)]";
    case "amber":  return "ring-1 ring-amber-500/40 shadow-[0_0_14px_rgba(245,158,11,0.12)]";
    case "voided": return "ring-1 ring-rose-500/40 shadow-[0_0_14px_rgba(244,63,94,0.12)]";
    case "draft":  return "ring-1 ring-white/15 shadow-none";
    case "mixed":  return "ring-1 ring-violet-500/40 shadow-[0_0_14px_rgba(139,92,246,0.12)]";
  }
}

function glowIconClasses(gs: ClientGroup["glowStatus"]): string {
  switch (gs) {
    case "paid":   return "text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/30";
    case "amber":  return "text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/30";
    case "voided": return "text-rose-400 bg-rose-500/10 ring-1 ring-rose-500/30";
    case "draft":  return "text-white/40 bg-white/5 ring-1 ring-white/10";
    case "mixed":  return "text-violet-400 bg-violet-500/10 ring-1 ring-violet-500/30";
  }
}

function statusTone(s: string): string {
  switch (s) {
    case "paid":   return "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30";
    case "sent":   return "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30";
    case "draft":  return "bg-white/10 text-white/60 ring-1 ring-white/15";
    case "voided": return "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30";
    default:       return "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30";
  }
}

function dotColor(status: string): string {
  switch (status) {
    case "paid":   return "#34d399";
    case "voided": return "#fb7185";
    case "draft":  return "rgba(255,255,255,0.25)";
    default:       return "#fbbf24";
  }
}

function groupByClient(rows: FieldInvoiceRow[]): ClientGroup[] {
  const map = new Map<string, FieldInvoiceRow[]>();
  for (const row of rows) {
    const key = row.clientId || row.clientName;
    const existing = map.get(key) || [];
    map.set(key, [...existing, row]);
  }
  return Array.from(map.entries()).map(([key, invoices]) => ({
    groupKey: key,
    clientName: invoices[0].clientName,
    invoices,
    totalAmount: invoices.reduce((acc, i) => acc + i.total, 0),
    unpaidCount: invoices.filter((i) => i.status !== "paid" && i.status !== "voided").length,
    glowStatus: getGroupGlowStatus(invoices),
  }));
}

export default function FieldInvoices() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FieldInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: FieldInvoiceRow[] = [];
        snap.forEach((d) => next.push(toRow(d.id, d.data() as Record<string, unknown>)));
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

  const groups = groupByClient(rows);

  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="px-0.5 flex items-baseline gap-2">
        <h1 className="text-base font-black text-white leading-none">Invoices</h1>
        {!loading && (
          <span className="text-[9px] font-black uppercase tracking-widest text-white/35">
            {rows.length} total · {groups.length} clients
          </span>
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

      <div className="space-y-2.5">
        {groups.map((group) => {
          const isExpanded = expanded.has(group.groupKey);
          return (
            <div
              key={group.groupKey}
              className={cn(
                "rounded-2xl bg-sidebar/60 overflow-hidden transition-shadow duration-300",
                glowClasses(group.glowStatus),
              )}
            >
              {/* Group header */}
              <button
                type="button"
                onClick={() => toggleGroup(group.groupKey)}
                className="w-full text-left px-3 py-3 flex items-center gap-2.5"
              >
                <div className={cn("shrink-0 w-9 h-9 rounded-xl flex items-center justify-center", glowIconClasses(group.glowStatus))}>
                  <ReceiptIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[13px] font-black text-white truncate leading-tight">{group.clientName}</p>
                    {group.unpaidCount > 0 && (
                      <span className="shrink-0 bg-amber-500/20 text-amber-300 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 ring-amber-500/30 leading-none">
                        {group.unpaidCount} unpaid
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-white/45 font-medium mt-0.5 leading-tight">
                    {group.invoices.length} invoice{group.invoices.length !== 1 ? "s" : ""} · {formatCurrency(group.totalAmount)}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
                )}
              </button>

              {/* Expanded invoice rows */}
              {isExpanded && (
                <div className="border-t border-white/8">
                  {group.invoices.map((inv, idx) => (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => navigate(`/invoices?invoiceId=${encodeURIComponent(inv.id)}`)}
                      className={cn(
                        "w-full text-left flex items-center gap-2.5 px-3 py-2.5",
                        "hover:bg-white/5 active:bg-white/10 transition-colors",
                        idx > 0 && "border-t border-white/5",
                      )}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0 ml-1"
                        style={{ background: dotColor(inv.status) }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-white/80 truncate leading-tight">
                          {inv.invoiceNumber ? `#${inv.invoiceNumber}` : `#${inv.id.slice(-6).toUpperCase()}`}
                        </p>
                        <p className="text-[10px] text-white/40 font-medium leading-tight">
                          {formatCurrency(inv.total)}
                        </p>
                      </div>
                      <span className={cn("text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded leading-none", statusTone(inv.status))}>
                        {inv.status}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-white/25 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
