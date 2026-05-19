import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../../firebase";
import { cn, toJsDateOrNull } from "@/lib/utils";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Receipt as ReceiptIcon,
} from "lucide-react";

/**
 * Phone-only Invoices view. Renders at `/invoices` when the device is
 * a phone, via InvoicesSwitch in App.tsx. Desktop/tablet continue to
 * render the existing full `Invoices` page unchanged.
 *
 * Live snapshot of the SAME `invoices` collection used by the desktop
 * page. Invoices are grouped by client — each group shows an expandable
 * header (client name, invoice count, group total, unpaid badge) with
 * individual invoice rows inside.
 *
 * Tapping a row navigates to `/invoices?invoiceId=<id>` — InvoicesSwitch
 * falls through to the full Invoices page when the URL carries `invoiceId`,
 * so the user gets every desktop action (send, mark paid, PDF, refund)
 * without a reduced phone-only feature set.
 *
 * No duplicate Firestore store, no schema divergence.
 */

interface FieldInvoiceRow {
  id: string;
  /** Canonical Firestore client reference — may be empty on legacy docs */
  clientId: string;
  invoiceNumber?: string;
  clientName: string;
  total: number;
  status: string;
  paymentStatus: string;
  createdAtMs: number;
}

type GlowStatus = "paid" | "amber" | "voided" | "draft" | "mixed";

interface ClientGroup {
  /** Stable key: clientId when present, else clientName */
  key: string;
  clientName: string;
  invoices: FieldInvoiceRow[];
  groupTotal: number;
  /** Timestamp of the most recent invoice in this group */
  latestMs: number;
  /** Count of invoices that haven't been paid or voided yet */
  unpaidCount: number;
  glowStatus: GlowStatus;
}

function toRow(id: string, data: Record<string, unknown>): FieldInvoiceRow {
  // Guard against legacy docs where createdAt is an ISO string or numeric
  // millis instead of a Firestore Timestamp.
  const d = toJsDateOrNull(data.createdAt);
  return {
    id,
    clientId: String(data.clientId ?? data.customerId ?? ""),
    invoiceNumber: (data.invoiceNumber as string | undefined) || undefined,
    clientName: String(data.clientName ?? "Unknown client"),
    total: typeof data.total === "number" ? (data.total as number) : 0,
    status: String(data.status ?? "draft"),
    paymentStatus: String(data.paymentStatus ?? "unpaid"),
    createdAtMs: d ? d.getTime() : 0,
  };
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

function getGlowStatus(invoices: FieldInvoiceRow[]): GlowStatus {
  const statuses = new Set(invoices.map((i) => i.status));
  if (statuses.size === 1) {
    const s = [...statuses][0];
    if (s === "paid") return "paid";
    if (s === "voided") return "voided";
    if (s === "draft") return "draft";
    return "amber";
  }
  const hasUnpaid = invoices.some((i) => i.status !== "paid" && i.status !== "voided");
  return hasUnpaid ? "amber" : "mixed";
}

function glowCardClasses(gs: GlowStatus): string {
  switch (gs) {
    case "paid":   return "border-emerald-500/30 shadow-[0_0_14px_rgba(52,211,153,0.10)]";
    case "amber":  return "border-amber-500/30 shadow-[0_0_14px_rgba(245,158,11,0.10)]";
    case "voided": return "border-rose-500/30 shadow-[0_0_14px_rgba(244,63,94,0.10)]";
    case "draft":  return "border-white/8";
    case "mixed":  return "border-violet-500/30 shadow-[0_0_14px_rgba(139,92,246,0.10)]";
  }
}

function glowAvatarClasses(gs: GlowStatus): string {
  switch (gs) {
    case "paid":   return "bg-emerald-500/10 ring-1 ring-emerald-500/30 text-emerald-300";
    case "amber":  return "bg-amber-500/10 ring-1 ring-amber-500/30 text-amber-300";
    case "voided": return "bg-rose-500/10 ring-1 ring-rose-500/30 text-rose-300";
    case "draft":  return "bg-white/8 ring-1 ring-white/10 text-white/50";
    case "mixed":  return "bg-violet-500/10 ring-1 ring-violet-500/30 text-violet-300";
  }
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(ms: number): string {
  if (!ms) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

export default function FieldInvoices() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FieldInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Set of group keys that have been manually collapsed by the user */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query(
      collection(db, "invoices"),
      orderBy("createdAt", "desc"),
      limit(50),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: FieldInvoiceRow[] = [];
        snap.forEach((doc) =>
          next.push(toRow(doc.id, doc.data() as Record<string, unknown>)),
        );
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

  /**
   * Group rows by clientId (preferred) or clientName (fallback for legacy docs).
   * Groups are sorted by their most-recent invoice date, desc.
   * Invoices within each group are already desc-ordered by the Firestore query.
   */
  const groups = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, ClientGroup>();
    for (const row of rows) {
      const key = row.clientId || row.clientName;
      if (!map.has(key)) {
        map.set(key, {
          key,
          clientName: row.clientName,
          invoices: [],
          groupTotal: 0,
          latestMs: 0,
          unpaidCount: 0,
          glowStatus: "draft",
        });
      }
      const g = map.get(key)!;
      g.invoices.push(row);
      g.groupTotal += row.total;
      if (row.createdAtMs > g.latestMs) g.latestMs = row.createdAtMs;
      const isPaid = row.status === "paid" || row.paymentStatus === "paid" || row.status === "voided";
      if (!isPaid) g.unpaidCount++;
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, glowStatus: getGlowStatus(g.invoices) }))
      .sort((a, b) => b.latestMs - a.latestMs);
  }, [rows]);

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="px-0.5 flex items-baseline gap-2">
        <h1 className="text-base font-black text-white leading-none">Invoices</h1>
        {!loading && (
          <span className="text-[9px] font-black uppercase tracking-widest text-white/35">
            {groups.length} {groups.length === 1 ? "client" : "clients"} · {rows.length} recent
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-3 flex items-center justify-center min-h-[56px]">
          <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
          <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/40">Loading…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load invoices</p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">{error}</p>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && groups.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-5 text-center">
          <ReceiptIcon className="w-5 h-5 text-white/30 mx-auto" />
          <p className="text-[11px] font-bold text-white/70 mt-1.5">No invoices yet</p>
        </div>
      )}

      {/* Client groups */}
      <div className="space-y-2">
        {groups.map((g) => {
          const isOpen = !collapsed.has(g.key);
          return (
            <div
              key={g.key}
              className={cn("rounded-xl border overflow-hidden transition-shadow duration-300", glowCardClasses(g.glowStatus))}
            >
              {/* ── Group header (tap to expand/collapse) ── */}
              <button
                type="button"
                onClick={() => toggleGroup(g.key)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.10] transition-colors"
              >
                {/* Avatar */}
                <div className={cn("shrink-0 w-8 h-8 rounded-md flex items-center justify-center", glowAvatarClasses(g.glowStatus))}>
                  <span className="text-[11px] font-black uppercase leading-none">
                    {g.clientName.charAt(0)}
                  </span>
                </div>

                {/* Meta */}
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[12px] font-bold text-white truncate leading-tight">
                    {g.clientName}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[9px] font-black text-white/40">
                      {g.invoices.length} invoice{g.invoices.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-[9px] text-white/20">·</span>
                    <span className="text-[9px] font-black text-white/55">
                      {fmtCurrency(g.groupTotal)}
                    </span>
                    {g.unpaidCount > 0 && (
                      <>
                        <span className="text-[9px] text-white/20">·</span>
                        <span className="inline-block text-[8px] font-black uppercase tracking-widest px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30 leading-none">
                          {g.unpaidCount} unpaid
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Chevron */}
                {isOpen
                  ? <ChevronUp   className="w-3.5 h-3.5 text-white/30 shrink-0" />
                  : <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
                }
              </button>

              {/* ── Individual invoice rows ── */}
              {isOpen && (
                <div className="divide-y divide-white/[0.04]">
                  {g.invoices.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() =>
                        navigate(`/invoices?invoiceId=${encodeURIComponent(r.id)}`, { state: { returnTo: "/field/invoices" } })
                      }
                      className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 bg-sidebar/40 hover:bg-sidebar/70 active:bg-sidebar transition-colors min-h-[48px]"
                    >
                      {/* Receipt icon */}
                      <div className="shrink-0 w-7 h-7 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center">
                        <ReceiptIcon className="w-3.5 h-3.5 text-emerald-400" />
                      </div>

                      {/* Invoice meta */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-white truncate leading-tight">
                          {r.invoiceNumber ? `Invoice #${r.invoiceNumber}` : "Invoice"}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[9px] text-white/55 font-medium">
                            {fmtCurrency(r.total)}
                          </span>
                          {r.createdAtMs > 0 && (
                            <>
                              <span className="text-[9px] text-white/20">·</span>
                              <span className="text-[9px] text-white/35">
                                {fmtDate(r.createdAtMs)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Status badge */}
                      <span
                        className={cn(
                          "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none shrink-0",
                          statusTone(r.status),
                        )}
                      >
                        {r.status}
                      </span>

                      <ChevronRight className="w-3 h-3 text-white/25 shrink-0" />
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
