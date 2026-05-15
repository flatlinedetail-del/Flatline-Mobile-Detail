import { useEffect, useState, useMemo, useCallback } from "react";
import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  deleteField,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  cn,
  formatPhoneNumber,
  getClientDisplayName,
  formatCurrency,
  convertToDate,
} from "@/lib/utils";
import {
  getEffectiveRisk,
  getRiskBadgeClass,
  getRiskBadgeLabel,
} from "@/lib/riskUtils";
import { useAuth } from "../../hooks/useAuth";
import { messagingService } from "../../services/messagingService";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Star,
  User,
  AlertCircle,
  MessageSquare,
  Calendar,
  Car,
  Receipt,
  History,
  AlertOctagon,
  Crown,
  Clipboard,
  ShieldAlert,
  Navigation,
  Sparkles,
  TrendingUp,
  RefreshCw,
  Zap,
  DollarSign,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Send,
  Undo2,
  Ban,
  Shield,
  ShieldCheck,
  Brain,
  BarChart3,
  Users,
  Repeat,
  BookOpen,
  MessageCircle,
} from "lucide-react";
import type { Client, Vehicle, Appointment, Invoice, Quote, Service, ProtectedClient } from "../../types";
import { computeUpsells, computeClientAnalytics, type UpsellRecommendation } from "../../services/upsellEngine";

// ─── Tab type ────────────────────────────────────────────────────────────────
type TabKey = "overview" | "jobs" | "vehicles" | "billing" | "notes" | "risk" | "ai";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "jobs", label: "Jobs" },
  { key: "vehicles", label: "Vehicles" },
  { key: "billing", label: "Billing" },
  { key: "notes", label: "Notes" },
  { key: "risk", label: "Risk" },
  { key: "ai", label: "AI" },
];

// ─── Status helpers ───────────────────────────────────────────────────────────
function statusColor(status: string): string {
  switch (status) {
    case "completed":
    case "paid":
      return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "in_progress":
    case "en_route":
      return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    case "confirmed":
    case "approved":
      return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "canceled":
    case "declined":
    case "no_show":
      return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
    case "scheduled":
      return "bg-[#0A4DFF]/15 text-[#4D8AFF] ring-[#0A4DFF]/30";
    case "voided":
      return "bg-white/10 text-white/40 ring-white/10";
    case "partial":
      return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    case "draft":
    case "pending":
    case "sent":
      return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    default:
      return "bg-white/10 text-white/60 ring-white/15";
  }
}

function statusGlow(status: string): string {
  switch (status) {
    case "completed":
    case "paid":
      return "border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.12)]";
    case "in_progress":
    case "en_route":
      return "border-amber-500/25 shadow-[0_0_12px_rgba(245,158,11,0.12)]";
    case "canceled":
    case "no_show":
      return "border-rose-500/20 shadow-[0_0_8px_rgba(239,68,68,0.08)]";
    case "confirmed":
    case "scheduled":
      return "border-sky-500/20 shadow-[0_0_8px_rgba(14,165,233,0.08)]";
    default:
      return "border-white/5";
  }
}

// ─── Maps helpers ─────────────────────────────────────────────────────────────
function buildMapsUrls(address: string) {
  const encoded = encodeURIComponent(address);
  return {
    apple: `maps:?daddr=${encoded}`,
    google: `https://maps.google.com/?daddr=${encoded}`,
    waze: `https://waze.com/ul?q=${encoded}`,
  };
}

// ─── Loading / Error primitives ───────────────────────────────────────────────
function LoadingCard() {
  return (
    <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-3 flex items-center justify-center min-h-[56px]">
      <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
      <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/40">Loading…</span>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-rose-300 leading-tight">Couldn't load client</p>
        <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">{message}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, label }: { icon: typeof Calendar; label: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-6 text-center">
      <Icon className="w-5 h-5 text-white/20 mx-auto" />
      <p className="text-[11px] font-bold text-white/40 mt-1.5">{label}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FieldClientDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId");
  const initialTab = (searchParams.get("tab") as TabKey) || "overview";
  const { services, settings } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [protectedMatch, setProtectedMatch] = useState<ProtectedClient | null>(null);

  // Maps dialog state
  const [showMaps, setShowMaps] = useState(false);

  // Payment dialog state
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [processingPayment, setProcessingPayment] = useState(false);

  // Note edit state
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // ── Client listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId) { setLoading(false); return; }
    const ref = doc(db, "clients", clientId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setClient({ id: snap.id, ...(snap.data() as any) } as Client);
        } else {
          setError("Client not found.");
        }
        setLoading(false);
      },
      (err) => {
        console.warn("[FieldClientDetail] client snapshot error", err);
        setError(err?.message || "Failed to load client.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [clientId]);

  // ── Vehicles listener ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId) return;
    const unsub = onSnapshot(
      query(collection(db, "vehicles"), where("clientId", "==", clientId)),
      (snap) => setVehicles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Vehicle)),
      (err) => { if (err?.code !== "cancelled") console.warn("[FieldClientDetail] vehicles", err); },
    );
    return () => unsub();
  }, [clientId]);

  // ── Invoices listener (live) ────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId) return;
    const unsub = onSnapshot(
      query(collection(db, "invoices"), where("clientId", "==", clientId), orderBy("createdAt", "desc"), limit(50)),
      (snap) => setInvoices(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Invoice)),
      (err) => { if (err?.code !== "cancelled") console.warn("[FieldClientDetail] invoices", err); },
    );
    return () => unsub();
  }, [clientId]);

  // ── Appointments + quotes one-time fetch ─────────────────────────────────────
  useEffect(() => {
    if (!clientId) return;
    const run = async () => {
      try {
        const [apptSnap, quoteSnap] = await Promise.all([
          getDocs(query(collection(db, "appointments"), where("clientId", "==", clientId), orderBy("scheduledAt", "desc"), limit(50))),
          getDocs(query(collection(db, "quotes"), where("clientId", "==", clientId), orderBy("createdAt", "desc"), limit(20))),
        ]);
        setAppointments(apptSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Appointment));
        setQuotes(quoteSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Quote));
      } catch (err) {
        console.warn("[FieldClientDetail] appointments/quotes fetch", err);
      }
    };
    run();
  }, [clientId]);

  // ── Protected client match ───────────────────────────────────────────────────
  useEffect(() => {
    if (!client) return;
    const check = async () => {
      try {
        const snap = await getDocs(collection(db, "protected_clients"));
        const phone = client.phone?.replace(/\D/g, "") ?? "";
        const email = (client.email ?? "").toLowerCase();
        const nameLower = getClientDisplayName(client).toLowerCase();
        const match = snap.docs.find((d) => {
          const pc = d.data() as ProtectedClient;
          if (!pc.isActive) return false;
          const pcPhone = (pc.phone ?? "").replace(/\D/g, "");
          const pcEmail = (pc.email ?? "").toLowerCase();
          const pcName = (pc.fullName ?? "").toLowerCase();
          return (
            (phone && pcPhone && phone === pcPhone) ||
            (email && pcEmail && email === pcEmail) ||
            (nameLower && pcName && nameLower === pcName)
          );
        });
        setProtectedMatch(match ? ({ id: match.id, ...match.data() } as ProtectedClient) : null);
      } catch (err) {
        console.warn("[FieldClientDetail] protected_clients check", err);
      }
    };
    check();
  }, [client]);

  // ── Derived analytics ────────────────────────────────────────────────────────
  const completedJobs = useMemo(
    () => appointments.filter((a) => a.status === "completed" || a.status === "paid"),
    [appointments],
  );
  const lifetimeValue = useMemo(
    () => completedJobs.reduce((s, a) => s + (a.totalAmount || 0), 0),
    [completedJobs],
  );
  const outstandingInvoices = useMemo(
    () => invoices.filter((inv) => inv.status !== "paid" && inv.status !== "voided"),
    [invoices],
  );
  const outstandingTotal = useMemo(
    () => outstandingInvoices.reduce((s, inv) => s + ((inv as any).total || 0), 0),
    [outstandingInvoices],
  );
  const noShowCount = useMemo(
    () => appointments.filter((a) => a.status === "no_show").length,
    [appointments],
  );
  const cancelCount = useMemo(
    () => appointments.filter((a) => a.status === "canceled").length,
    [appointments],
  );
  const lastService = useMemo(() => {
    const job = completedJobs[0];
    if (!job) return null;
    try { return convertToDate(job.scheduledAt); } catch { return null; }
  }, [completedJobs]);
  const nextJob = useMemo(() => {
    const now = Date.now();
    const upcoming = appointments.filter((a) => {
      if (a.status === "canceled" || a.status === "no_show" || a.status === "completed" || a.status === "paid") return false;
      try { return convertToDate(a.scheduledAt).getTime() > now; } catch { return false; }
    });
    return upcoming[upcoming.length - 1] || null; // earliest upcoming
  }, [appointments]);

  // ── Payment actions ──────────────────────────────────────────────────────────
  const handleRecordPayment = useCallback(async (invoice: Invoice) => {
    if (processingPayment) return;
    const alreadyPaid = (invoice.amountPaid || 0) >= invoice.total || invoice.status === "paid" || invoice.status === "voided";
    if (alreadyPaid) { toast.info("Invoice already settled."); return; }
    const balance = invoice.total - (invoice.amountPaid || 0);
    const newPaid = (invoice.amountPaid || 0) + balance;
    const isFull = newPaid >= invoice.total;
    setProcessingPayment(true);
    try {
      toast.loading("Processing payment…", { id: "pay" });
      const ref = doc(db, "invoices", invoice.id);
      const entry = { action: "paid" as const, timestamp: serverTimestamp(), method: paymentMethod, amount: balance, provider: "manual" };
      const upd: Record<string, any> = {
        amountPaid: newPaid,
        paymentStatus: isFull ? "paid" : "partial",
        paymentMethodDetails: paymentMethod,
        paymentProvider: "manual",
        paymentHistory: arrayUnion(entry),
        updatedAt: serverTimestamp(),
      };
      if (isFull) { upd.status = "paid"; upd.paidAt = serverTimestamp(); }
      await updateDoc(ref, upd);
      if (invoice.clientPhone) {
        messagingService.sendSms({ to: invoice.clientPhone, body: `Payment of ${formatCurrency(balance)} received via ${paymentMethod}. Thank you!` }).catch(() => {});
      }
      if (invoice.appointmentId) {
        await updateDoc(doc(db, "appointments", invoice.appointmentId), { paymentStatus: isFull ? "paid" : "partial" });
      }
      toast.success(isFull ? "Invoice marked paid" : "Partial payment recorded", { id: "pay" });
      setPayingInvoice(null);
    } catch (e) {
      console.error("Payment error", e);
      toast.error("Failed to record payment", { id: "pay" });
    } finally {
      setProcessingPayment(false);
    }
  }, [processingPayment, paymentMethod]);

  const handleVoid = useCallback(async (invoice: Invoice) => {
    try {
      toast.loading("Voiding invoice…", { id: "void" });
      const ref = doc(db, "invoices", invoice.id);
      await updateDoc(ref, {
        status: "voided",
        paymentStatus: "voided",
        paymentHistory: arrayUnion({ action: "voided", timestamp: serverTimestamp(), method: invoice.paymentMethodDetails || "unknown" }),
      });
      if (invoice.appointmentId) {
        await updateDoc(doc(db, "appointments", invoice.appointmentId), { paymentStatus: "voided" });
      }
      toast.success("Invoice voided", { id: "void" });
    } catch (e) {
      toast.error("Failed to void", { id: "void" });
    }
  }, []);

  const handleUndoPayment = useCallback(async (invoice: Invoice) => {
    try {
      toast.loading("Reversing payment…", { id: "undo" });
      const ref = doc(db, "invoices", invoice.id);
      await updateDoc(ref, {
        status: "pending",
        paymentStatus: "unpaid",
        paymentProvider: deleteField(),
        paymentMethodDetails: deleteField(),
        paidAt: deleteField(),
        transactionReference: deleteField(),
        paymentHistory: arrayUnion({ action: "undone", timestamp: serverTimestamp(), method: invoice.paymentMethodDetails || "unknown" }),
      } as any);
      if (invoice.appointmentId) {
        await updateDoc(doc(db, "appointments", invoice.appointmentId), { paymentStatus: "unpaid" });
      }
      toast.success("Payment reversed", { id: "undo" });
    } catch (e) {
      toast.error("Failed to undo payment", { id: "undo" });
    }
  }, []);

  const handleSendInvoice = useCallback(async (invoice: Invoice) => {
    try {
      toast.loading("Sending invoice…", { id: "send-inv" });
      if (invoice.clientEmail) {
        await messagingService.sendEmail({
          to: invoice.clientEmail,
          subject: `Invoice ${invoice.invoiceNumber || ""} from ${settings?.businessName || "Us"}`,
          html: `<p>Hi ${invoice.clientName},</p><p>Your invoice <strong>${invoice.invoiceNumber}</strong> is ready.</p><p>Total: <strong>${formatCurrency(invoice.total)}</strong></p><p>Thank you!</p>`,
        });
      }
      if (invoice.clientPhone) {
        await messagingService.sendSms({ to: invoice.clientPhone, body: `Your invoice is ready. Total: ${formatCurrency(invoice.total)}. Thank you!` }).catch(() => {});
      }
      toast.success("Invoice sent", { id: "send-inv" });
    } catch (e: any) {
      toast.error(e.message || "Failed to send", { id: "send-inv" });
    }
  }, [settings]);

  // ── Note save ────────────────────────────────────────────────────────────────
  const handleSaveNote = useCallback(async () => {
    if (!clientId) return;
    setSavingNote(true);
    try {
      await updateDoc(doc(db, "clients", clientId), { notes: noteDraft, updatedAt: serverTimestamp() });
      toast.success("Note saved");
      setEditingNote(false);
    } catch (e) {
      toast.error("Failed to save note");
    } finally {
      setSavingNote(false);
    }
  }, [clientId, noteDraft]);

  // ── Guard states ──────────────────────────────────────────────────────────────
  if (!clientId) {
    return (
      <div className="space-y-3">
        <TopBar onBack={() => navigate(-1)} />
        <ErrorCard message="No client selected." />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="space-y-3">
        <TopBar onBack={() => navigate(-1)} />
        <LoadingCard />
      </div>
    );
  }
  if (error || !client) {
    return (
      <div className="space-y-3">
        <TopBar onBack={() => navigate(-1)} />
        <ErrorCard message={error ?? "Unknown error"} />
      </div>
    );
  }

  const displayName = getClientDisplayName(client);
  const risk = getEffectiveRisk(client);
  const phone = client.phone ?? "";
  const email = client.email ?? "";
  const address = client.address ?? "";
  const mapsUrls = address ? buildMapsUrls(address) : null;

  const isHighRisk = risk === "high" || risk === "critical" || risk === "block_booking" || risk === "do_not_book";
  const isBlocked = risk === "block_booking" || risk === "do_not_book";
  const hasUnpaid = outstandingTotal > 0;

  return (
    <div className="space-y-2 pb-4">
      <TopBar onBack={() => navigate(-1)} isVIP={client.isVIP} displayName={displayName} />

      {/* ── Premium header card ── */}
      <div className="rounded-2xl border border-white/8 bg-gradient-to-b from-[#0A4DFF]/12 via-sidebar/70 to-sidebar/50 px-3 py-3">
        {/* Avatar + name row */}
        <div className="flex items-start gap-3">
          <div className={cn(
            "shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-base font-black uppercase",
            client.isVIP
              ? "bg-amber-500/15 ring-2 ring-amber-500/40 text-amber-300"
              : "bg-[#0A4DFF]/15 ring-2 ring-[#0A4DFF]/30 text-[#0A4DFF]",
          )}>
            {displayName.charAt(0) || <User className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-[15px] font-black text-white leading-none truncate">{displayName}</p>
              {client.isVIP && <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
            </div>
            {client.businessName && client.businessName !== displayName && (
              <p className="text-[10px] text-white/45 font-medium mt-0.5 truncate">{client.businessName}</p>
            )}
            {/* Badges row */}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className={cn("text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ring-1 leading-none", getRiskBadgeClass(risk))}>
                {getRiskBadgeLabel(risk)}
              </span>
              {client.isVIP && (
                <span className="text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ring-1 leading-none bg-amber-500/15 text-amber-300 ring-amber-500/30">
                  VIP
                </span>
              )}
              {client.membershipLevel && client.membershipLevel !== "none" && (
                <span className="text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ring-1 leading-none bg-violet-500/15 text-violet-300 ring-violet-500/30">
                  {client.membershipLevel}
                </span>
              )}
              {protectedMatch && (
                <span className="text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ring-1 leading-none bg-red-900/30 text-red-300 ring-red-700/40">
                  Protected
                </span>
              )}
              <span className="ml-auto text-[10px] font-black text-[#0A4DFF] tabular-nums">
                {client.loyaltyPoints || 0} <span className="text-[7px] text-[#0A4DFF]/60 uppercase tracking-widest">pts</span>
              </span>
            </div>
          </div>
        </div>

        {/* Contact rows */}
        <div className="mt-2.5 space-y-1">
          {phone && (
            <a href={`tel:${phone}`} className="flex items-center gap-2 min-h-[28px]">
              <Phone className="w-3 h-3 text-white/30 shrink-0" />
              <span className="text-[11px] font-bold text-white/75 hover:text-white truncate">{formatPhoneNumber(phone)}</span>
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="flex items-center gap-2 min-h-[28px]">
              <Mail className="w-3 h-3 text-white/30 shrink-0" />
              <span className="text-[11px] font-bold text-white/75 hover:text-white truncate">{email}</span>
            </a>
          )}
          {address && (
            <button
              type="button"
              onClick={() => setShowMaps(true)}
              className="flex items-start gap-2 min-h-[28px] w-full text-left hover:opacity-80 transition-opacity"
            >
              <MapPin className="w-3 h-3 text-white/30 shrink-0 mt-0.5" />
              <span className="text-[11px] font-bold text-white/75 leading-tight">{address}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Smart action dock ── */}
      <SmartActionDock
        phone={phone}
        email={email}
        address={address}
        hasUnpaid={hasUnpaid}
        nextJob={nextJob}
        noShowCount={noShowCount}
        clientId={clientId}
        onNavigate={() => setShowMaps(true)}
        onCollectPayment={() => {
          const first = outstandingInvoices[0];
          if (first) { setPayingInvoice(first); setPaymentMethod("Cash"); }
          else setActiveTab("billing");
        }}
        onBookJob={() => navigate(`/field/book-job?clientId=${clientId}`)}
      />

      {/* ── Maps dialog ── */}
      {showMaps && mapsUrls && (
        <MapsDialog
          address={address}
          urls={mapsUrls}
          onClose={() => setShowMaps(false)}
        />
      )}

      {/* ── Payment dialog ── */}
      {payingInvoice && (
        <PaymentDialog
          invoice={payingInvoice}
          method={paymentMethod}
          onMethodChange={setPaymentMethod}
          processing={processingPayment}
          onConfirm={() => handleRecordPayment(payingInvoice)}
          onClose={() => setPayingInvoice(null)}
        />
      )}

      {/* ── Tab bar ── */}
      <div className="overflow-x-auto -mx-2.5 px-2.5 scrollbar-none">
        <div className="flex gap-1 min-w-max">
          {TABS.map(({ key, label }) => {
            const isActive = activeTab === key;
            let badge: number | null = null;
            if (key === "jobs") badge = appointments.length;
            if (key === "vehicles") badge = vehicles.length;
            if (key === "billing") badge = outstandingInvoices.length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all min-h-[32px]",
                  isActive
                    ? "bg-[#0A4DFF]/15 text-[#0A4DFF] ring-1 ring-[#0A4DFF]/30 shadow-[0_0_8px_rgba(10,77,255,0.2)]"
                    : "text-white/40 hover:text-white/65 hover:bg-white/5",
                )}
              >
                {label}
                {badge != null && badge > 0 && (
                  <span className={cn("ml-1 text-[7px] font-black", isActive ? "text-[#0A4DFF]/70" : "text-white/30")}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="min-h-[200px]">
        {activeTab === "overview" && (
          <OverviewTab
            client={client}
            lifetimeValue={lifetimeValue}
            outstandingTotal={outstandingTotal}
            completedCount={completedJobs.length}
            lastService={lastService}
            nextJob={nextJob}
            noShowCount={noShowCount}
            cancelCount={cancelCount}
            appointments={appointments}
            invoices={invoices}
            risk={risk}
            protectedMatch={protectedMatch}
          />
        )}
        {activeTab === "jobs" && (
          <JobsTab appointments={appointments} vehicles={vehicles} />
        )}
        {activeTab === "vehicles" && (
          <VehiclesTab vehicles={vehicles} appointments={appointments} />
        )}
        {activeTab === "billing" && (
          <BillingTab
            invoices={invoices}
            outstandingTotal={outstandingTotal}
            onCollectPayment={(inv) => { setPayingInvoice(inv); setPaymentMethod("Cash"); }}
            onSend={handleSendInvoice}
            onVoid={handleVoid}
            onUndo={handleUndoPayment}
          />
        )}
        {activeTab === "notes" && (
          <NotesTab
            notes={client.notes}
            editing={editingNote}
            draft={noteDraft}
            saving={savingNote}
            onStartEdit={() => { setNoteDraft(client.notes || ""); setEditingNote(true); }}
            onDraftChange={setNoteDraft}
            onSave={handleSaveNote}
            onCancel={() => setEditingNote(false)}
            client={client}
            appointments={appointments}
          />
        )}
        {activeTab === "risk" && (
          <RiskTab
            client={client}
            risk={risk}
            protectedMatch={protectedMatch}
            noShowCount={noShowCount}
            cancelCount={cancelCount}
            outstandingTotal={outstandingTotal}
          />
        )}
        {activeTab === "ai" && (
          <AITab
            client={client}
            appointments={appointments}
            invoices={invoices}
            vehicles={vehicles}
            services={services}
          />
        )}
      </div>
    </div>
  );
}

// ─── Top bar ─────────────────────────────────────────────────────────────────
function TopBar({ onBack, isVIP, displayName }: { onBack: () => void; isVIP?: boolean; displayName?: string }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center shrink-0"
      >
        <ArrowLeft className="w-4 h-4 text-white/60" />
      </button>
      <h1 className="text-[13px] font-black text-white leading-none flex-1 truncate">{displayName || "Client"}</h1>
      {isVIP && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400/70 shrink-0" />}
    </div>
  );
}

// ─── Smart Action Dock ────────────────────────────────────────────────────────
function SmartActionDock({
  phone, email, address, hasUnpaid, nextJob, noShowCount, clientId,
  onNavigate, onCollectPayment, onBookJob,
}: {
  phone: string; email: string; address: string; hasUnpaid: boolean;
  nextJob: Appointment | null; noShowCount: number; clientId: string;
  onNavigate: () => void; onCollectPayment: () => void; onBookJob: () => void;
}) {
  const actions: { label: string; icon: typeof Phone; action: () => void; color: string; priority?: boolean }[] = [];

  if (hasUnpaid) {
    actions.push({ label: "Collect", icon: DollarSign, action: onCollectPayment, color: "bg-rose-500/15 text-rose-300 ring-rose-500/30 hover:bg-rose-500/25", priority: true });
  }
  if (phone) {
    actions.push({ label: "Call", icon: Phone, action: () => window.location.href = `tel:${phone}`, color: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25 hover:bg-emerald-500/20" });
    actions.push({ label: "Text", icon: MessageSquare, action: () => window.location.href = `sms:${phone}`, color: "bg-sky-500/10 text-sky-300 ring-sky-500/25 hover:bg-sky-500/20" });
  }
  if (email) {
    actions.push({ label: "Email", icon: Mail, action: () => window.location.href = `mailto:${email}`, color: "bg-violet-500/10 text-violet-300 ring-violet-500/25 hover:bg-violet-500/20" });
  }
  if (address) {
    actions.push({ label: "Navigate", icon: Navigation, action: onNavigate, color: "bg-amber-500/10 text-amber-300 ring-amber-500/25 hover:bg-amber-500/20" });
  }
  actions.push({ label: "Book", icon: Calendar, action: onBookJob, color: "bg-[#0A4DFF]/15 text-[#4D8AFF] ring-[#0A4DFF]/30 hover:bg-[#0A4DFF]/25" });

  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-2.5 px-2.5">
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.action}
          className={cn(
            "shrink-0 flex flex-col items-center justify-center gap-1 rounded-xl ring-1 px-3 min-h-[52px] min-w-[56px] transition-colors",
            a.color,
          )}
        >
          <a.icon className="w-3.5 h-3.5" />
          <span className="text-[8px] font-black uppercase tracking-widest leading-none">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Maps dialog ──────────────────────────────────────────────────────────────
function MapsDialog({ address, urls, onClose }: { address: string; urls: ReturnType<typeof buildMapsUrls>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="w-full mx-auto max-w-sm bg-sidebar border border-white/10 rounded-t-2xl px-4 pt-4 pb-8 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="w-8 h-1 bg-white/20 rounded-full mx-auto mb-3" />
        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">Navigate to</p>
        <p className="text-[12px] font-bold text-white mb-3 leading-tight">{address}</p>
        {[
          { label: "Apple Maps", url: urls.apple, color: "text-sky-300" },
          { label: "Google Maps", url: urls.google, color: "text-emerald-300" },
          { label: "Waze", url: urls.waze, color: "text-violet-300" },
        ].map((opt) => (
          <a
            key={opt.label}
            href={opt.url}
            rel="noopener noreferrer"
            className="flex items-center justify-between min-h-[48px] rounded-xl border border-white/8 bg-white/5 hover:bg-white/8 px-3 transition-colors"
            onClick={onClose}
          >
            <span className={cn("text-[13px] font-black", opt.color)}>{opt.label}</span>
            <Navigation className="w-3.5 h-3.5 text-white/30" />
          </a>
        ))}
        <button type="button" onClick={onClose} className="w-full mt-1 text-[10px] font-black uppercase tracking-widest text-white/30 py-2">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Payment dialog ───────────────────────────────────────────────────────────
const PAYMENT_METHODS = ["Cash", "Card", "Check", "Zelle", "Venmo", "CashApp", "ACH", "Other"];

function PaymentDialog({
  invoice, method, onMethodChange, processing, onConfirm, onClose,
}: {
  invoice: Invoice; method: string; onMethodChange: (m: string) => void;
  processing: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const balance = invoice.total - (invoice.amountPaid || 0);
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="w-full mx-auto max-w-sm bg-sidebar border border-white/10 rounded-t-2xl px-4 pt-4 pb-8 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="w-8 h-1 bg-white/20 rounded-full mx-auto" />
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Record Payment</p>
          <p className="text-[18px] font-black text-white mt-0.5">{formatCurrency(balance)}</p>
          <p className="text-[10px] text-white/50 mt-0.5">Invoice {invoice.invoiceNumber || invoice.id.slice(0, 8)}</p>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">Payment Method</p>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onMethodChange(m)}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-[10px] font-black ring-1 transition-colors",
                  method === m
                    ? "bg-[#0A4DFF]/20 text-[#4D8AFF] ring-[#0A4DFF]/40"
                    : "text-white/50 ring-white/10 hover:bg-white/5",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onConfirm}
          disabled={processing}
          className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 font-black text-[13px] text-white transition-colors"
        >
          {processing ? "Processing…" : `Collect ${formatCurrency(balance)}`}
        </button>
        <button type="button" onClick={onClose} className="w-full text-[10px] font-black uppercase tracking-widest text-white/30 py-1">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({
  client, lifetimeValue, outstandingTotal, completedCount, lastService, nextJob,
  noShowCount, cancelCount, appointments, invoices, risk, protectedMatch,
}: {
  client: Client; lifetimeValue: number; outstandingTotal: number; completedCount: number;
  lastService: Date | null; nextJob: Appointment | null; noShowCount: number;
  cancelCount: number; appointments: Appointment[]; invoices: Invoice[];
  risk: ReturnType<typeof getEffectiveRisk>; protectedMatch: ProtectedClient | null;
}) {
  const isBlocked = risk === "block_booking" || risk === "do_not_book";
  const isElevated = risk && risk !== "low";

  // Service frequency
  const completedAppts = appointments.filter((a) => a.status === "completed" || a.status === "paid");
  let avgDays: number | null = null;
  if (completedAppts.length > 1) {
    try {
      const first = convertToDate(completedAppts[completedAppts.length - 1].scheduledAt).getTime();
      const last = convertToDate(completedAppts[0].scheduledAt).getTime();
      avgDays = Math.round((last - first) / (completedAppts.length - 1) / 86400000);
    } catch { avgDays = null; }
  }

  // Booking health
  const totalJobs = appointments.length;
  const noShowRate = totalJobs > 0 ? Math.round((noShowCount / totalJobs) * 100) : 0;

  // Recent activity
  const recentActivity = useMemo(() => {
    const items: { type: "appt" | "invoice"; label: string; sub: string; status: string; date: Date }[] = [];
    for (const a of appointments.slice(0, 8)) {
      try { items.push({ type: "appt", label: a.serviceNames?.join(", ") || "Appointment", sub: a.vehicleInfo || "", status: a.status, date: convertToDate(a.scheduledAt) }); } catch {}
    }
    for (const inv of invoices.slice(0, 6)) {
      try { items.push({ type: "invoice", label: `Invoice ${(inv as any).invoiceNumber || ""}`, sub: formatCurrency((inv as any).total || 0), status: inv.status || "pending", date: convertToDate((inv as any).createdAt) }); } catch {}
    }
    items.sort((a, b) => b.date.getTime() - a.date.getTime());
    return items.slice(0, 8);
  }, [appointments, invoices]);

  return (
    <div className="space-y-2">
      {/* Risk / block alert */}
      {(isElevated || protectedMatch) && (
        <div className={cn(
          "rounded-xl border px-3 py-2.5 flex items-start gap-2.5",
          isBlocked || protectedMatch?.protectionLevel === "Block Booking"
            ? "bg-red-950/40 border-red-800/40"
            : "bg-red-500/8 border-red-500/20",
        )}>
          <AlertOctagon className={cn("w-4 h-4 shrink-0 mt-0.5", (isBlocked || protectedMatch?.protectionLevel === "Block Booking") ? "text-red-400" : "text-red-500")} />
          <div className="min-w-0">
            <p className="text-[10px] font-black text-red-400 uppercase tracking-tight leading-tight">
              {protectedMatch ? `Protected — ${protectedMatch.protectionLevel}` : getRiskBadgeLabel(risk)}
            </p>
            <p className="text-[9px] text-white/55 font-medium mt-0.5 leading-tight">
              {isBlocked ? "Account restricted. Manager approval required." : "Flagged client — verify deposit requirements."}
            </p>
          </div>
        </div>
      )}

      {/* KPI grid — 4 compact cells */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCell
          label="Lifetime Value"
          value={formatCurrency(lifetimeValue)}
          sub={outstandingTotal > 0 ? `${formatCurrency(outstandingTotal)} outstanding` : "No outstanding balance"}
          subColor={outstandingTotal > 0 ? "text-rose-400" : "text-emerald-400"}
          icon={DollarSign}
          iconColor="text-[#0A4DFF]"
        />
        <MetricCell
          label="Completed Jobs"
          value={String(completedCount)}
          sub={lastService ? `Last: ${format(lastService, "MMM d")}` : "No history"}
          subColor="text-white/40"
          icon={CheckCircle2}
          iconColor="text-emerald-400"
        />
        <MetricCell
          label="Booking Health"
          value={noShowCount > 0 ? `${noShowRate}% miss` : "Good"}
          sub={`${noShowCount} no-shows · ${cancelCount} cancels`}
          subColor={noShowCount > 1 ? "text-amber-400" : "text-white/40"}
          icon={Calendar}
          iconColor={noShowCount > 1 ? "text-amber-400" : "text-emerald-400"}
        />
        <MetricCell
          label="Service Frequency"
          value={avgDays != null ? `~${avgDays}d` : "—"}
          sub={nextJob ? `Next: ${(() => { try { return format(convertToDate(nextJob.scheduledAt), "MMM d"); } catch { return "—"; } })()}` : "No upcoming"}
          subColor="text-white/40"
          icon={RefreshCw}
          iconColor="text-violet-400"
        />
      </div>

      {/* Status pills row */}
      <div className="flex gap-1.5 flex-wrap">
        {client.membershipLevel !== "none" && (
          <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full ring-1 bg-violet-500/10 text-violet-300 ring-violet-500/25">
            {client.membershipLevel} Member
          </span>
        )}
        {client.isVIP && (
          <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full ring-1 bg-amber-500/10 text-amber-300 ring-amber-500/25">
            VIP
          </span>
        )}
        {client.hasSavedPaymentMethod && (
          <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full ring-1 bg-emerald-500/10 text-emerald-300 ring-emerald-500/25">
            Payment on File
          </span>
        )}
        {client.preferredContactMethod && client.preferredContactMethod !== "none" && (
          <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full ring-1 bg-sky-500/10 text-sky-300 ring-sky-500/25">
            Prefers {client.preferredContactMethod}
          </span>
        )}
        {client.smsOptOut && (
          <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full ring-1 bg-white/5 text-white/40 ring-white/10">
            SMS Opt-Out
          </span>
        )}
      </div>

      {/* Next appointment */}
      {nextJob && (
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2.5 flex items-center gap-2.5">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center">
            <Calendar className="w-3.5 h-3.5 text-sky-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-sky-400/70">Upcoming</p>
            <p className="text-[11px] font-black text-white truncate leading-tight">
              {nextJob.serviceNames?.join(", ") || "Appointment"}
            </p>
            <p className="text-[9px] text-sky-300/60 font-medium leading-tight">
              {(() => { try { return format(convertToDate(nextJob.scheduledAt), "EEE, MMM d · h:mm a"); } catch { return "Date unavailable"; } })()}
            </p>
          </div>
        </div>
      )}

      {/* Recent activity */}
      {recentActivity.length > 0 ? (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-2.5">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/35 mb-2">Recent Activity</p>
          <div className="space-y-1">
            {recentActivity.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 min-h-[32px]">
                <div className={cn(
                  "shrink-0 w-6 h-6 rounded-md flex items-center justify-center",
                  item.status === "paid" || item.status === "completed" ? "bg-emerald-500/10 text-emerald-400"
                    : item.status === "canceled" || item.status === "no_show" ? "bg-rose-500/10 text-rose-400"
                    : "bg-white/5 text-white/35",
                )}>
                  {item.type === "appt" ? <Calendar className="w-2.5 h-2.5" /> : <Receipt className="w-2.5 h-2.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-white truncate leading-tight">{item.label}</p>
                  {item.sub && <p className="text-[8px] text-white/35 truncate leading-tight">{item.sub}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <span className={cn("text-[6px] font-black uppercase tracking-widest px-1 py-0.5 rounded ring-1 leading-none", statusColor(item.status))}>
                    {item.status.replace(/_/g, " ")}
                  </span>
                  <p className="text-[7px] text-white/25 mt-0.5 tabular-nums">{format(item.date, "MMM d")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon={History} label="No activity yet" />
      )}
    </div>
  );
}

function MetricCell({ label, value, sub, subColor, icon: Icon, iconColor }: {
  label: string; value: string; sub: string; subColor: string; icon: typeof DollarSign; iconColor: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-sidebar/60 px-2.5 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-black uppercase tracking-widest text-white/35">{label}</span>
        <Icon className={cn("w-3 h-3 shrink-0", iconColor)} />
      </div>
      <p className="text-[18px] font-black text-white tracking-tight leading-none">{value}</p>
      <p className={cn("text-[8px] font-bold leading-tight", subColor)}>{sub}</p>
    </div>
  );
}

// ─── Jobs Tab ─────────────────────────────────────────────────────────────────
function JobsTab({ appointments, vehicles }: { appointments: Appointment[]; vehicles: Vehicle[] }) {
  const vehicleById = useMemo(() => {
    const m: Record<string, Vehicle> = {};
    vehicles.forEach((v) => { m[v.id] = v; });
    return m;
  }, [vehicles]);

  const grouped = useMemo(() => {
    const upcoming: Appointment[] = [];
    const active: Appointment[] = [];
    const completed: Appointment[] = [];
    const canceled: Appointment[] = [];
    const noShows: Appointment[] = [];
    const now = Date.now();
    for (const a of appointments) {
      if (a.status === "in_progress" || a.status === "en_route") { active.push(a); continue; }
      if (a.status === "completed" || a.status === "paid") { completed.push(a); continue; }
      if (a.status === "no_show") { noShows.push(a); continue; }
      if (a.status === "canceled" || a.status === "declined") { canceled.push(a); continue; }
      try {
        if (convertToDate(a.scheduledAt).getTime() > now) upcoming.push(a);
        else completed.push(a);
      } catch { upcoming.push(a); }
    }
    return { active, upcoming, completed, canceled, noShows };
  }, [appointments]);

  if (appointments.length === 0) return <EmptyState icon={Calendar} label="No jobs on record" />;

  return (
    <div className="space-y-3">
      {grouped.active.length > 0 && (
        <JobSection title="Active" color="text-amber-400" jobs={grouped.active} vehicleById={vehicleById} />
      )}
      {grouped.upcoming.length > 0 && (
        <JobSection title="Upcoming" color="text-sky-400" jobs={grouped.upcoming} vehicleById={vehicleById} />
      )}
      {grouped.completed.length > 0 && (
        <JobSection title={`Completed (${grouped.completed.length})`} color="text-emerald-400" jobs={grouped.completed} vehicleById={vehicleById} />
      )}
      {grouped.noShows.length > 0 && (
        <JobSection title={`No-Shows (${grouped.noShows.length})`} color="text-rose-400" jobs={grouped.noShows} vehicleById={vehicleById} />
      )}
      {grouped.canceled.length > 0 && (
        <JobSection title={`Canceled (${grouped.canceled.length})`} color="text-white/35" jobs={grouped.canceled} vehicleById={vehicleById} />
      )}
    </div>
  );
}

function JobSection({ title, color, jobs, vehicleById }: {
  title: string; color: string; jobs: Appointment[]; vehicleById: Record<string, Vehicle>;
}) {
  return (
    <div className="space-y-1">
      <p className={cn("text-[8px] font-black uppercase tracking-widest px-0.5", color)}>{title}</p>
      {jobs.map((appt) => {
        let dateStr = "";
        try { dateStr = format(convertToDate(appt.scheduledAt), "EEE MMM d · h:mm a"); } catch { dateStr = "—"; }
        const vehicleId = (appt as any).vehicleId || (appt as any).vehicles?.[0]?.id;
        const vehicle = vehicleId ? vehicleById[vehicleId] : null;
        return (
          <div
            key={appt.id}
            className={cn(
              "rounded-xl border bg-sidebar/60 px-3 py-2.5 flex items-center gap-2.5 min-h-[60px] transition-all active:scale-[0.98]",
              statusGlow(appt.status),
            )}
          >
            <div className={cn(
              "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
              appt.status === "completed" || appt.status === "paid" ? "bg-emerald-500/10 text-emerald-400"
                : appt.status === "no_show" || appt.status === "canceled" ? "bg-rose-500/10 text-rose-400"
                : appt.status === "in_progress" || appt.status === "en_route" ? "bg-amber-500/10 text-amber-400"
                : "bg-[#0A4DFF]/10 text-[#4D8AFF]",
            )}>
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black text-white truncate leading-tight">
                {appt.serviceNames?.join(", ") || "Appointment"}
              </p>
              <p className="text-[9px] text-white/40 font-medium truncate leading-tight mt-0.5">
                {vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : appt.vehicleInfo || "Vehicle TBD"}
              </p>
              <p className="text-[9px] text-white/30 leading-tight mt-0.5">{dateStr}</p>
            </div>
            <div className="shrink-0 text-right space-y-1">
              <p className="text-[11px] font-black text-white tabular-nums">{formatCurrency(appt.totalAmount || 0)}</p>
              <span className={cn("text-[6px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none", statusColor(appt.status))}>
                {appt.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Vehicles Tab ─────────────────────────────────────────────────────────────
function VehiclesTab({ vehicles, appointments }: { vehicles: Vehicle[]; appointments: Appointment[] }) {
  const revenueByVehicle = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of appointments) {
      const vid = (a as any).vehicleId || (a as any).vehicles?.[0]?.id;
      if (!vid) continue;
      m[vid] = (m[vid] || 0) + (a.totalAmount || 0);
    }
    return m;
  }, [appointments]);

  const servicesByVehicle = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const a of appointments) {
      const vid = (a as any).vehicleId || (a as any).vehicles?.[0]?.id;
      if (!vid) continue;
      if (!m[vid]) m[vid] = [];
      m[vid].push(...(a.serviceNames || []));
    }
    return m;
  }, [appointments]);

  if (vehicles.length === 0) return <EmptyState icon={Car} label="No vehicles on file" />;

  return (
    <div className="space-y-2">
      {vehicles.map((v) => {
        const services = servicesByVehicle[v.id] || [];
        const hasCeramic = services.some((s) => s.toLowerCase().includes("ceramic"));
        const revenue = revenueByVehicle[v.id] || 0;
        const sizeLabel: Record<string, string> = { small: "Small", medium: "Medium", large: "Large", extra_large: "XL" };

        return (
          <div key={v.id} className="rounded-xl border border-sky-500/15 bg-gradient-to-b from-sky-950/20 to-sidebar/60 px-3 py-3">
            {/* Header */}
            <div className="flex items-center gap-2.5">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-sky-500/10 ring-1 ring-sky-500/25 flex items-center justify-center">
                <Car className="w-4 h-4 text-sky-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-black text-white truncate leading-tight">
                  {[v.year, v.make, v.model].filter(Boolean).join(" ") || "Unknown Vehicle"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {v.color && <span className="text-[8px] text-white/45 font-medium">{v.color}</span>}
                  {v.size && (
                    <span className="text-[7px] font-black uppercase tracking-widest text-sky-300/70 px-1.5 py-0.5 rounded bg-sky-500/10 ring-1 ring-sky-500/20">
                      {sizeLabel[v.size] || v.size}
                    </span>
                  )}
                  {hasCeramic && (
                    <span className="text-[7px] font-black uppercase tracking-widest text-violet-300 px-1.5 py-0.5 rounded bg-violet-500/10 ring-1 ring-violet-500/20">
                      Ceramic
                    </span>
                  )}
                </div>
              </div>
              {revenue > 0 && (
                <div className="shrink-0 text-right">
                  <p className="text-[12px] font-black text-white tabular-nums">{formatCurrency(revenue)}</p>
                  <p className="text-[7px] text-white/30 uppercase tracking-widest">revenue</p>
                </div>
              )}
            </div>
            {/* Details */}
            {(v.vin || v.licensePlate || v.roNumber || v.notes) && (
              <div className="mt-2.5 pt-2.5 border-t border-white/5 space-y-1">
                {v.vin && <DetailRow label="VIN" value={v.vin} mono />}
                {v.licensePlate && <DetailRow label="Plate" value={v.licensePlate} />}
                {v.roNumber && <DetailRow label="RO #" value={v.roNumber} />}
                {v.notes && <p className="text-[9px] text-white/45 font-medium italic mt-1 leading-tight">{v.notes}</p>}
              </div>
            )}
            {/* AI upsell hint */}
            {!hasCeramic && (revenue > 200 || services.length >= 2) && (
              <div className="mt-2.5 pt-2 border-t border-violet-500/10 flex items-start gap-1.5">
                <Sparkles className="w-3 h-3 text-violet-400 shrink-0 mt-0.5" />
                <p className="text-[8px] text-violet-300/70 font-bold leading-tight">
                  Ceramic coating candidate — high service frequency detected.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[8px] font-black uppercase tracking-widest text-white/30">{label}</span>
      <span className={cn("text-[9px] font-bold text-white/60", mono && "font-mono")}>{value}</span>
    </div>
  );
}

// ─── Billing Tab ──────────────────────────────────────────────────────────────
function BillingTab({
  invoices, outstandingTotal, onCollectPayment, onSend, onVoid, onUndo,
}: {
  invoices: Invoice[]; outstandingTotal: number;
  onCollectPayment: (inv: Invoice) => void;
  onSend: (inv: Invoice) => Promise<void>;
  onVoid: (inv: Invoice) => Promise<void>;
  onUndo: (inv: Invoice) => Promise<void>;
}) {
  const outstanding = invoices.filter((inv) => inv.status !== "paid" && inv.status !== "voided");
  const paid = invoices.filter((inv) => inv.status === "paid");
  const voided = invoices.filter((inv) => inv.status === "voided");

  const totalPaid = paid.reduce((s, inv) => s + (inv.amountPaid || inv.total || 0), 0);

  if (invoices.length === 0) return <EmptyState icon={Receipt} label="No invoices on file" />;

  return (
    <div className="space-y-3">
      {/* Summary row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2.5">
          <p className="text-[8px] font-black uppercase tracking-widest text-rose-400/70">Outstanding</p>
          <p className="text-[18px] font-black text-rose-300 tabular-nums mt-0.5">{formatCurrency(outstandingTotal)}</p>
          <p className="text-[8px] text-rose-400/50 font-bold mt-0.5">{outstanding.length} invoice{outstanding.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-2.5 py-2.5">
          <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400/70">Collected</p>
          <p className="text-[18px] font-black text-emerald-300 tabular-nums mt-0.5">{formatCurrency(totalPaid)}</p>
          <p className="text-[8px] text-emerald-400/50 font-bold mt-0.5">{paid.length} paid</p>
        </div>
      </div>

      {/* Outstanding */}
      {outstanding.length > 0 && (
        <div className="space-y-1">
          <p className="text-[8px] font-black uppercase tracking-widest text-rose-400/80 px-0.5">Outstanding</p>
          {outstanding.map((inv) => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              onCollect={() => onCollectPayment(inv)}
              onSend={() => onSend(inv)}
              onVoid={() => onVoid(inv)}
              onUndo={() => onUndo(inv)}
            />
          ))}
        </div>
      )}

      {/* Paid */}
      {paid.length > 0 && (
        <div className="space-y-1">
          <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400/70 px-0.5">Paid</p>
          {paid.map((inv) => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              onCollect={() => onCollectPayment(inv)}
              onSend={() => onSend(inv)}
              onVoid={() => onVoid(inv)}
              onUndo={() => onUndo(inv)}
            />
          ))}
        </div>
      )}

      {/* Voided */}
      {voided.length > 0 && (
        <div className="space-y-1">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/25 px-0.5">Voided</p>
          {voided.map((inv) => (
            <InvoiceCard key={inv.id} invoice={inv} onCollect={() => {}} onSend={() => onSend(inv)} onVoid={async () => {}} onUndo={async () => {}} />
          ))}
        </div>
      )}
    </div>
  );
}

function InvoiceCard({
  invoice, onCollect, onSend, onVoid, onUndo,
}: {
  invoice: Invoice;
  onCollect: () => void;
  onSend: () => Promise<void>;
  onVoid: () => Promise<void>;
  onUndo: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPaid = invoice.status === "paid";
  const isVoided = invoice.status === "voided";
  const balance = invoice.total - (invoice.amountPaid || 0);

  return (
    <div className={cn(
      "rounded-xl border bg-sidebar/60 overflow-hidden transition-all",
      statusGlow(isPaid ? "paid" : isVoided ? "voided" : invoice.status || "pending"),
    )}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-3 py-2.5 flex items-center gap-2.5 min-h-[56px] text-left"
      >
        <div className={cn(
          "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
          isPaid ? "bg-emerald-500/10 text-emerald-400" : isVoided ? "bg-white/5 text-white/25" : "bg-rose-500/10 text-rose-400",
        )}>
          <Receipt className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black text-white truncate leading-tight">
            {invoice.invoiceNumber ? `Invoice ${invoice.invoiceNumber}` : `Invoice`}
          </p>
          <p className="text-[9px] text-white/40 font-medium truncate leading-tight mt-0.5">
            {invoice.vehicleInfo || invoice.vehicles?.[0]?.make || ""}
            {(invoice.paymentMethodDetails && isPaid) ? ` · ${invoice.paymentMethodDetails}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-[12px] font-black tabular-nums", isPaid ? "text-emerald-300" : isVoided ? "text-white/25" : "text-white")}>
            {formatCurrency(invoice.total)}
          </p>
          {!isPaid && !isVoided && balance > 0 && balance < invoice.total && (
            <p className="text-[8px] text-amber-300 font-bold">Partial</p>
          )}
          <span className={cn("text-[6px] font-black uppercase tracking-widest px-1 py-0.5 rounded ring-1 leading-none", statusColor(invoice.paymentStatus || invoice.status || ""))}>
            {(invoice.paymentStatus || invoice.status || "").replace(/_/g, " ")}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-white/5 space-y-2.5 pt-2.5">
          {/* Payment history */}
          {(invoice.paymentHistory?.length ?? 0) > 0 && (
            <div className="space-y-0.5">
              <p className="text-[7px] font-black uppercase tracking-widest text-white/30 mb-1">Payment History</p>
              {invoice.paymentHistory!.slice(0, 5).map((h, i) => (
                <div key={i} className="flex items-center justify-between text-[9px]">
                  <span className="text-white/50 font-bold capitalize">{h.action} — {h.method || "unknown"}</span>
                  {h.amount != null && <span className="text-white/40 tabular-nums font-bold">{formatCurrency(h.amount)}</span>}
                </div>
              ))}
            </div>
          )}
          {/* Actions */}
          <div className="flex flex-wrap gap-1.5">
            {!isPaid && !isVoided && (
              <button
                type="button"
                onClick={onCollect}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-[9px] font-black transition-colors"
              >
                <DollarSign className="w-2.5 h-2.5" />
                Collect {formatCurrency(balance)}
              </button>
            )}
            <button
              type="button"
              onClick={onSend}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-[9px] font-black ring-1 ring-sky-500/25 transition-colors"
            >
              <Send className="w-2.5 h-2.5" />
              {isPaid ? "Resend" : "Send"}
            </button>
            {isPaid && (
              <button
                type="button"
                onClick={onUndo}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[9px] font-black ring-1 ring-amber-500/25 transition-colors"
              >
                <Undo2 className="w-2.5 h-2.5" />
                Undo
              </button>
            )}
            {!isVoided && (
              <button
                type="button"
                onClick={onVoid}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-300 text-[9px] font-black ring-1 ring-white/10 hover:ring-rose-500/25 transition-colors"
              >
                <Ban className="w-2.5 h-2.5" />
                Void
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Notes Tab ────────────────────────────────────────────────────────────────
function NotesTab({
  notes, editing, draft, saving, onStartEdit, onDraftChange, onSave, onCancel, client, appointments,
}: {
  notes?: string; editing: boolean; draft: string; saving: boolean;
  onStartEdit: () => void; onDraftChange: (v: string) => void;
  onSave: () => void; onCancel: () => void;
  client: Client; appointments: Appointment[];
}) {
  // Infer preferences from appointment and client data
  const signals: string[] = [];
  if (client.preferredContactMethod === "sms") signals.push("Prefers text over calls");
  if (client.smsOptOut) signals.push("SMS opted out — use email or call");
  if (client.isVIP) signals.push("VIP client — premium service expected");
  if (client.membershipLevel && client.membershipLevel !== "none") signals.push(`${client.membershipLevel} membership holder`);
  if (client.outstandingCancellationFee && client.outstandingCancellationFee > 0) signals.push(`Outstanding cancellation fee: ${formatCurrency(client.outstandingCancellationFee)}`);
  const serviceNames = appointments.flatMap((a) => a.serviceNames || []);
  if (serviceNames.some((s) => s.toLowerCase().includes("interior"))) signals.push("Interior services performed");
  if (serviceNames.some((s) => s.toLowerCase().includes("ceramic"))) signals.push("Ceramic coating history");

  return (
    <div className="space-y-2">
      {/* Preference signals */}
      {signals.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-2.5">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/35 mb-2">Client Intelligence</p>
          <div className="space-y-1">
            {signals.map((sig, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <div className="shrink-0 w-1 h-1 rounded-full bg-[#0A4DFF]/60 mt-1.5" />
                <p className="text-[10px] font-bold text-white/60 leading-tight">{sig}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes editor */}
      <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/35">Internal Notes</p>
          {!editing && (
            <button
              type="button"
              onClick={onStartEdit}
              className="text-[8px] font-black uppercase tracking-widest text-[#0A4DFF] hover:text-[#4D8AFF]"
            >
              {notes ? "Edit" : "+ Add Note"}
            </button>
          )}
        </div>
        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              rows={5}
              placeholder="Service preferences, damage warnings, staff notes…"
              className="w-full bg-transparent border border-white/10 rounded-lg px-2.5 py-2 text-[11px] font-medium text-white placeholder-white/25 focus:outline-none focus:border-[#0A4DFF]/50 resize-none"
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="flex-1 min-h-[36px] rounded-lg bg-[#0A4DFF] hover:bg-[#0A4DFF]/90 disabled:opacity-50 text-[10px] font-black text-white transition-colors"
              >
                {saving ? "Saving…" : "Save Note"}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="px-4 min-h-[36px] rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-black text-white/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : notes ? (
          <p className="text-[11px] font-medium text-white/65 leading-relaxed whitespace-pre-wrap">{notes}</p>
        ) : (
          <p className="text-[10px] text-white/25 font-medium italic">No notes added yet.</p>
        )}
      </div>
    </div>
  );
}

// ─── Risk Tab ─────────────────────────────────────────────────────────────────
function RiskTab({
  client, risk, protectedMatch, noShowCount, cancelCount, outstandingTotal,
}: {
  client: Client; risk: ReturnType<typeof getEffectiveRisk>;
  protectedMatch: ProtectedClient | null; noShowCount: number;
  cancelCount: number; outstandingTotal: number;
}) {
  const isBlocked = risk === "block_booking" || risk === "do_not_book";
  const isElevated = risk === "medium" || risk === "high" || risk === "critical" || isBlocked;
  const requireDeposit = isElevated || (protectedMatch?.requiredDepositValue ?? 0) > 0;

  return (
    <div className="space-y-2">
      {/* Risk status hero */}
      <div className={cn(
        "rounded-xl border px-3 py-3",
        isBlocked || protectedMatch?.protectionLevel === "Block Booking"
          ? "bg-red-950/40 border-red-800/40"
          : isElevated ? "bg-red-500/8 border-red-500/20"
          : "bg-emerald-500/5 border-emerald-500/15",
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
            isElevated ? "bg-red-500/15 text-red-400" : "bg-emerald-500/10 text-emerald-400",
          )}>
            {isElevated ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn("text-[13px] font-black uppercase tracking-tight leading-none", isElevated ? "text-red-400" : "text-emerald-400")}>
              {getRiskBadgeLabel(risk)}
            </p>
            <p className="text-[9px] text-white/50 font-medium mt-1 leading-tight">
              {isBlocked && "Account restricted. Do not book without manager approval."}
              {risk === "critical" && "Critical risk — deposit required for all services."}
              {risk === "high" && "High risk — collect deposit before booking."}
              {risk === "medium" && "Moderate risk — deposit may be required."}
              {risk === "low" && "Good standing. No active risk flags."}
              {!risk && "No risk assessment on file."}
            </p>
          </div>
        </div>
      </div>

      {/* Protected client match */}
      {protectedMatch && (
        <div className="rounded-xl border border-red-800/40 bg-red-950/30 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Shield className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-red-400 uppercase tracking-tight">Protected Client Match</p>
              <p className="text-[9px] text-white/55 font-medium mt-0.5 leading-tight">{protectedMatch.riskReason}</p>
              {protectedMatch.internalNotes && (
                <p className="text-[9px] text-white/40 font-medium mt-0.5 leading-tight italic">{protectedMatch.internalNotes}</p>
              )}
              <div className="flex gap-2 mt-1.5 flex-wrap">
                <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-red-900/30 text-red-300 ring-1 ring-red-700/30">
                  {protectedMatch.protectionLevel}
                </span>
                {protectedMatch.requiredDepositValue > 0 && (
                  <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-300 ring-1 ring-amber-700/30">
                    Deposit: {protectedMatch.requiredDepositType === "percentage"
                      ? `${protectedMatch.requiredDepositValue}%`
                      : formatCurrency(protectedMatch.requiredDepositValue)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Risk metrics grid */}
      <div className="rounded-xl border border-white/5 bg-sidebar/40 divide-y divide-white/[0.04]">
        <RiskRow label="Risk Level" value={getRiskBadgeLabel(risk)} highlight={isElevated} />
        <RiskRow label="Deposit Required" value={requireDeposit ? "Yes" : "No"} highlight={requireDeposit} />
        <RiskRow label="Booking Status" value={isBlocked ? "⛔ Blocked" : "✓ Allowed"} highlight={isBlocked} />
        <RiskRow label="No-Shows" value={String(noShowCount)} highlight={noShowCount > 0} />
        <RiskRow label="Cancellations" value={String(cancelCount)} highlight={cancelCount > 2} />
        {outstandingTotal > 0 && (
          <RiskRow label="Outstanding Balance" value={formatCurrency(outstandingTotal)} highlight />
        )}
        {(client.outstandingCancellationFee ?? 0) > 0 && (
          <RiskRow label="Cancellation Fee" value={formatCurrency(client.outstandingCancellationFee!)} highlight />
        )}
        <RiskRow label="Payment on File" value={client.hasSavedPaymentMethod ? "Yes" : "No"} />
        <RiskRow label="Protected Client" value={protectedMatch ? "Yes — " + protectedMatch.protectionLevel : "No"} highlight={!!protectedMatch} />
      </div>

      {/* Trust score */}
      <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-2.5">
        <p className="text-[8px] font-black uppercase tracking-widest text-white/35 mb-2">Trust Indicators</p>
        <div className="space-y-1.5">
          <TrustIndicator label="Payment Reliability" ok={!outstandingTotal && !client.outstandingCancellationFee} />
          <TrustIndicator label="Show Rate" ok={noShowCount === 0} warn={noShowCount === 1} />
          <TrustIndicator label="Cancellation History" ok={cancelCount === 0} warn={cancelCount <= 2} />
          <TrustIndicator label="Protected List" ok={!protectedMatch} warn={protectedMatch?.protectionLevel === "Low"} />
        </div>
      </div>
    </div>
  );
}

function RiskRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 min-h-[38px]">
      <span className="text-[8px] font-black uppercase tracking-widest text-white/35">{label}</span>
      <span className={cn("text-[10px] font-black", highlight ? "text-rose-300" : "text-white/70")}>{value}</span>
    </div>
  );
}

function TrustIndicator({ label, ok, warn }: { label: string; ok: boolean; warn?: boolean }) {
  const color = ok ? "text-emerald-400" : warn ? "text-amber-400" : "text-rose-400";
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("w-3 h-3 shrink-0", color)} />
      <span className="text-[9px] font-bold text-white/55">{label}</span>
    </div>
  );
}

// ─── AI Tab ───────────────────────────────────────────────────────────────────
// Uses the shared upsell engine — same logic as desktop ClientAIStrategy.
function AITab({
  client, appointments, invoices, vehicles, services,
}: {
  client: Client; appointments: Appointment[]; invoices: Invoice[];
  vehicles: Vehicle[]; services: Service[];
}) {
  // Shared analytics + shared engine output
  const analytics = useMemo(() => computeClientAnalytics(appointments), [appointments]);
  const allRecs = useMemo(
    () => computeUpsells({ client, appointments, vehicles, services, invoices }),
    [client, appointments, vehicles, services, invoices],
  );

  const { avgSpend, daysSinceLast, avgDaysBetween, retentionStatus, projectedMonthly, projectedAnnual, topServices, completedCount } = analytics;

  // Split into customer-facing and internal
  const actionable = allRecs.filter((r) => r.id !== "outstanding-balance" && r.id !== "deposit-required");
  const flags = allRecs.filter((r) => r.id === "outstanding-balance" || r.id === "deposit-required");

  const displayName = getClientDisplayName(client);
  const firstName = client.firstName || displayName.split(" ")[0];

  if (completedCount === 0) {
    return (
      <div className="space-y-2">
        <EmptyState icon={Brain} label="No completed jobs to analyze" />
        <p className="text-[9px] text-white/30 font-bold text-center">AI intelligence activates after first completed service</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Financial flags — always first */}
      {flags.map((f) => (
        <div key={f.id} className="rounded-xl border border-rose-500/25 bg-rose-950/25 px-3 py-2.5 flex items-start gap-2">
          <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[10px] font-black text-rose-300 leading-tight">{f.title}</p>
            <p className="text-[8px] text-rose-300/60 font-medium mt-0.5 leading-tight">{f.reason}</p>
          </div>
        </div>
      ))}

      {/* Retention status */}
      <div className={cn(
        "rounded-xl border px-3 py-3 flex items-center gap-3",
        retentionStatus === "active" ? "border-emerald-500/20 bg-emerald-500/5"
          : retentionStatus === "at_risk" ? "border-amber-500/20 bg-amber-500/5"
          : "border-rose-500/20 bg-rose-500/5",
      )}>
        <div className={cn(
          "shrink-0 w-9 h-9 rounded-xl flex items-center justify-center",
          retentionStatus === "active" ? "bg-emerald-500/15 text-emerald-400"
            : retentionStatus === "at_risk" ? "bg-amber-500/15 text-amber-400"
            : "bg-rose-500/15 text-rose-400",
        )}>
          <Users className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-[10px] font-black uppercase tracking-widest leading-none",
            retentionStatus === "active" ? "text-emerald-400"
              : retentionStatus === "at_risk" ? "text-amber-400"
              : "text-rose-400",
          )}>
            {retentionStatus === "active" ? "Active Client" : retentionStatus === "at_risk" ? "At Risk" : "Inactive"}
          </p>
          <p className="text-[9px] text-white/50 font-medium mt-0.5 leading-tight">
            {daysSinceLast === Infinity ? "No services yet" : `Last service ${Math.round(daysSinceLast)} days ago`}
            {avgDaysBetween ? ` · avg every ${avgDaysBetween}d` : ""}
          </p>
        </div>
      </div>

      {/* Revenue intelligence */}
      {projectedAnnual != null && (
        <div className="rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-950/30 to-sidebar/60 px-3 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart3 className="w-3.5 h-3.5 text-violet-400" />
            <p className="text-[8px] font-black uppercase tracking-widest text-violet-400/80">Revenue Intelligence</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[7px] font-black uppercase tracking-widest text-white/30">Avg Ticket</p>
              <p className="text-[13px] font-black text-white tabular-nums">{formatCurrency(avgSpend)}</p>
            </div>
            <div>
              <p className="text-[7px] font-black uppercase tracking-widest text-white/30">Proj/Month</p>
              <p className="text-[13px] font-black text-violet-300 tabular-nums">{formatCurrency(projectedMonthly!)}</p>
            </div>
            <div>
              <p className="text-[7px] font-black uppercase tracking-widest text-white/30">Proj/Year</p>
              <p className="text-[13px] font-black text-violet-300 tabular-nums">{formatCurrency(projectedAnnual)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations from shared engine */}
      {actionable.length > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-0.5">
            <Sparkles className="w-3 h-3 text-violet-400" />
            <p className="text-[8px] font-black uppercase tracking-widest text-violet-400/80">Smart Recommendations</p>
          </div>
          {actionable.map((rec) => (
            <UpsellCard key={rec.id} rec={rec} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-4 text-center">
          <CheckCircle2 className="w-5 h-5 text-emerald-400/30 mx-auto" />
          <p className="text-[10px] font-black text-white/40 mt-1.5">No smart upsells right now</p>
          <p className="text-[8px] text-white/25 font-medium mt-0.5">Client is on an optimal service cycle</p>
        </div>
      )}

      {/* Field talking points */}
      {topServices.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <MessageCircle className="w-3 h-3 text-sky-400" />
            <p className="text-[8px] font-black uppercase tracking-widest text-sky-400/70">Field Talking Points</p>
          </div>
          <div className="space-y-1">
            {topServices.length > 0 && (
              <TalkingPoint text={`Top services: ${topServices.join(", ")}`} />
            )}
            {client.isVIP && <TalkingPoint text="VIP client — acknowledge their loyalty" />}
            {avgDaysBetween > 0 && <TalkingPoint text={`Returns every ~${avgDaysBetween} days — consistent client`} />}
            {avgSpend > 0 && <TalkingPoint text={`Average ticket: ${formatCurrency(avgSpend)}`} />}
            {actionable.length > 0 && <TalkingPoint text={`Key opportunity: ${actionable[0].title}`} />}
          </div>
        </div>
      )}

      {/* Follow-up message */}
      {retentionStatus !== "active" && (
        <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Zap className="w-3 h-3 text-amber-400" />
            <p className="text-[8px] font-black uppercase tracking-widest text-amber-400/80">Suggested Follow-Up</p>
          </div>
          <p className="text-[10px] font-bold text-white/65 leading-tight">
            {retentionStatus === "at_risk"
              ? `"Hey ${firstName}, it's been a while! Your ${vehicles[0] ? `${vehicles[0].make} ${vehicles[0].model}` : "vehicle"} might be due for a detail. Want to get something on the calendar?"`
              : `"Hi ${firstName}! We'd love to have you back. We're running a loyalty offer for returning clients — want details?"`}
          </p>
        </div>
      )}
    </div>
  );
}

function UpsellCard({ rec }: { rec: UpsellRecommendation }) {
  const typeStyle: Record<string, { border: string; icon: string; badge: string }> = {
    timing:      { border: "border-sky-500/25 bg-sky-950/20",      icon: "bg-sky-500/15 text-sky-400",      badge: "bg-sky-500/10 text-sky-300 ring-sky-500/20" },
    maintenance: { border: "border-sky-500/25 bg-sky-950/20",      icon: "bg-sky-500/15 text-sky-400",      badge: "bg-sky-500/10 text-sky-300 ring-sky-500/20" },
    upsell:      { border: "border-violet-500/20 bg-violet-950/20", icon: "bg-violet-500/15 text-violet-400", badge: "bg-violet-500/10 text-violet-300 ring-violet-500/20" },
    package:     { border: "border-emerald-500/20 bg-emerald-950/20", icon: "bg-emerald-500/15 text-emerald-400", badge: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20" },
    reactivation:{ border: "border-amber-500/20 bg-amber-950/20",  icon: "bg-amber-500/15 text-amber-400",  badge: "bg-amber-500/10 text-amber-300 ring-amber-500/20" },
    addon:       { border: "border-violet-500/15 bg-violet-950/15", icon: "bg-violet-500/10 text-violet-300", badge: "bg-violet-500/10 text-violet-300 ring-violet-500/20" },
    condition:   { border: "border-rose-500/20 bg-rose-950/15",    icon: "bg-rose-500/15 text-rose-400",    badge: "bg-rose-500/10 text-rose-300 ring-rose-500/20" },
  };
  const style = typeStyle[rec.type] ?? typeStyle.upsell;

  const IconMap: Record<string, typeof TrendingUp> = {
    timing: RefreshCw, maintenance: RefreshCw, upsell: TrendingUp,
    package: BookOpen, reactivation: Repeat, addon: TrendingUp, condition: AlertTriangle,
  };
  const Icon = IconMap[rec.type] ?? TrendingUp;

  return (
    <div className={cn("rounded-xl border px-3 py-2.5", style.border, rec.blockedBy ? "opacity-60" : "")}>
      <div className="flex items-start gap-2.5">
        <div className={cn("shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5", style.icon)}>
          <Icon className="w-3 h-3" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[10px] font-black text-white leading-tight">{rec.title}</p>
            {rec.estimatedPriceImpact != null && (
              <span className="text-[8px] font-black text-emerald-300">+{formatCurrency(rec.estimatedPriceImpact)}</span>
            )}
          </div>
          <p className="text-[8px] text-white/50 font-medium mt-0.5 leading-tight">{rec.reason}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={cn("text-[6px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none", style.badge)}>
              {rec.type}
            </span>
            <span className="text-[6px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none bg-white/5 text-white/30 ring-white/10">
              {rec.priority}
            </span>
            {!rec.isCustomerFacing && (
              <span className="text-[6px] font-black uppercase tracking-widest text-white/20">Internal</span>
            )}
          </div>
          {rec.blockedBy && (
            <p className="text-[7px] text-rose-400/70 font-bold mt-1 leading-tight">⛔ {rec.blockedBy}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TalkingPoint({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <div className="shrink-0 w-1 h-1 rounded-full bg-sky-400/50 mt-1.5" />
      <p className="text-[9px] font-bold text-white/60 leading-tight">{text}</p>
    </div>
  );
}
