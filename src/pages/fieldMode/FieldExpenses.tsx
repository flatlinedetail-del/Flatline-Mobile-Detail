import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { cn, toJsDateOrNull } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Monitor,
  PlusCircle,
  Wallet,
} from "lucide-react";

/**
 * Phone-only Expenses page for field workers to log expenses on-site.
 * Renders at `/expenses` on phones. Desktop/tablet continue to render
 * the full Expenses page via ExpensesSwitch in App.tsx.
 *
 * Quick-add form writes directly to the `expenses` collection. The
 * bridge card at the bottom routes to the full admin view for editing,
 * deleting, exporting, and full reporting.
 */

interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  category: string;
  dateMs: number;
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

function todayInputValue(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function FieldExpenses() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick-add form
  const [quickAdd, setQuickAdd] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [category, setCategory] = useState("Other");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "expenses"),
      orderBy("date", "desc"),
      limit(25),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: ExpenseRow[] = [];
        snap.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          const jsDate = toJsDateOrNull(x.date);
          next.push({
            id: d.id,
            description: String(x.description ?? "Untitled expense"),
            amount: typeof x.amount === "number" ? (x.amount as number) : 0,
            category: String(x.category ?? "Other"),
            dateMs: jsDate ? jsDate.getTime() : 0,
          });
        });
        setExpenses(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("[FieldExpenses] snapshot error", err);
        setError(err?.message || "Failed to load expenses");
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const totalAmount = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amount, 0),
    [expenses],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !amount) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "expenses"), {
        description: description.trim(),
        amount: parseFloat(amount),
        date: Timestamp.fromDate(new Date(date)),
        category: category.trim() || "Other",
        createdAt: serverTimestamp(),
        ...(user?.uid ? { createdBy: user.uid } : {}),
      });
      setQuickAdd(false);
      setDescription("");
      setAmount("");
      setDate(todayInputValue());
      setCategory("Other");
      toast.success("Expense added");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save expense";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="px-0.5 flex items-baseline gap-2">
        <h1 className="text-base font-black text-white leading-none">Expenses</h1>
        {!loading && (
          <span className="text-[9px] font-black uppercase tracking-widest text-white/35">
            {expenses.length} recent · {fmtCurrency(totalAmount)}
          </span>
        )}
      </div>

      {/* Quick-add toggle */}
      <button
        type="button"
        onClick={() => setQuickAdd((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2.5 rounded-xl border px-2.5 py-2.5 min-h-[48px] transition-colors",
          quickAdd
            ? "border-white/10 bg-white/[0.06] hover:bg-white/[0.08]"
            : "border-white/5 bg-sidebar/60 hover:bg-sidebar/80",
        )}
      >
        <div className="shrink-0 w-8 h-8 rounded-md bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center">
          <PlusCircle className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-bold text-white leading-tight">
            {quickAdd ? "Cancel" : "Quick Add"}
          </p>
          <p className="text-[10px] text-white/40 leading-tight mt-0.5">
            {quickAdd ? "Discard and close form" : "Log an expense right now"}
          </p>
        </div>
        {quickAdd
          ? <ChevronUp className="w-3.5 h-3.5 text-white/30 shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
        }
      </button>

      {/* Quick-add form */}
      {quickAdd && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden"
        >
          <div className="divide-y divide-white/[0.05]">
            {/* Description */}
            <div className="px-3 py-2.5">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">
                Description
              </label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What was this for?"
                className="w-full bg-transparent text-[12px] font-bold text-white placeholder-white/25 focus:outline-none"
              />
            </div>

            {/* Amount + Category side-by-side */}
            <div className="grid grid-cols-2 divide-x divide-white/[0.05]">
              <div className="px-3 py-2.5">
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">
                  Amount
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent text-[12px] font-bold text-white placeholder-white/25 focus:outline-none"
                />
              </div>
              <div className="px-3 py-2.5">
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Other"
                  className="w-full bg-transparent text-[12px] font-bold text-white placeholder-white/25 focus:outline-none"
                />
              </div>
            </div>

            {/* Date */}
            <div className="px-3 py-2.5">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">
                Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-transparent text-[12px] font-bold text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="px-3 py-2.5 bg-white/[0.02]">
            <button
              type="submit"
              disabled={saving || !description.trim() || !amount}
              className={cn(
                "w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 min-h-[44px] transition-colors",
                "bg-emerald-500/20 ring-1 ring-emerald-500/40 text-emerald-300 font-bold text-[12px]",
                "hover:bg-emerald-500/30 active:bg-emerald-500/20",
                "disabled:opacity-50 disabled:pointer-events-none",
              )}
            >
              {saving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Check className="w-3.5 h-3.5" />
              }
              {saving ? "Saving…" : "Save Expense"}
            </button>
          </div>
        </form>
      )}

      {/* Loading */}
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
            <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load expenses</p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">{error}</p>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && expenses.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-5 text-center">
          <Wallet className="w-5 h-5 text-white/30 mx-auto" />
          <p className="text-[11px] font-bold text-white/70 mt-1.5">No expenses recorded</p>
        </div>
      )}

      {/* Expense list */}
      {!loading && !error && expenses.length > 0 && (
        <div className="space-y-1.5">
          {expenses.map((exp) => (
            <div
              key={exp.id}
              className="w-full rounded-xl border border-white/5 bg-sidebar/60 flex items-center gap-2.5 px-2.5 py-2 min-h-[48px]"
            >
              <div className="shrink-0 w-8 h-8 rounded-md bg-white/[0.06] ring-1 ring-white/15 flex items-center justify-center">
                <Wallet className="w-3.5 h-3.5 text-white/50" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-white truncate leading-tight">
                  {exp.description}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[10px] font-bold text-white/70 leading-tight">
                    {fmtCurrency(exp.amount)}
                  </span>
                  {exp.dateMs > 0 && (
                    <>
                      <span className="text-[9px] text-white/20">·</span>
                      <span className="text-[10px] text-white/45 leading-tight">{fmtDate(exp.dateMs)}</span>
                    </>
                  )}
                </div>
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 bg-white/10 text-white/60 ring-white/15 leading-none shrink-0">
                {exp.category}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bridge card */}
      <button
        type="button"
        onClick={() => navigate("/expenses?adminView=1")}
        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-2.5 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-md bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
          <Monitor className="w-4 h-4 text-white/50" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-bold text-white leading-tight">Open Full Admin View</p>
          <p className="text-[10px] text-white/40 leading-tight mt-0.5">Edit, delete, export, and full reporting</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>
    </div>
  );
}
