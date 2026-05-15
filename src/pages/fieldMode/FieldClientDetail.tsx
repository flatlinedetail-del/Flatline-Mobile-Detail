/**
 * FieldClientDetail — full mobile client profile with 6 tabs.
 *
 * Tabs: Overview · Profile · Appointments · Vehicles · Notes · Risk
 *
 * Rules enforced:
 *   - No JSX IIFEs ((() => …)() inside JSX)
 *   - No mock data — all Firestore reads
 *   - No desktop tables, no horizontal overflow
 *   - Mobile-first stacked cards throughout
 *   - Risk wired to riskUtils (getEffectiveRisk / getRiskBadgeClass)
 */
import { useEffect, useState, useMemo } from "react";
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
} from "firebase/firestore";
import { db } from "../../firebase";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
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
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Star,
  User,
  Monitor,
  ExternalLink,
  AlertCircle,
  MessageSquare,
  Calendar,
  Car,
  Receipt,
  History,
  AlertOctagon,
  Crown,
  ChevronRight,
  ShieldAlert,
  Edit2,
  Save,
  X,
  Building2,
  CheckCircle2,
  Clipboard,
  AlertTriangle,
  UserX,
  CreditCard,
  BadgeCheck,
} from "lucide-react";
import { format } from "date-fns";
import type { Client, Vehicle, Appointment, Invoice, Quote } from "../../types";

// ─── Tab definitions ─────────────────────────────────────────────────────────
type TabKey = "overview" | "profile" | "appointments" | "vehicles" | "notes" | "risk";

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: "overview",      label: "Overview"      },
  { key: "profile",       label: "Profile"       },
  { key: "appointments",  label: "Appts"         },
  { key: "vehicles",      label: "Vehicles"      },
  { key: "notes",         label: "Notes"         },
  { key: "risk",          label: "Risk"          },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function statusColor(status: string): string {
  switch (status) {
    case "completed":
    case "paid":       return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "in_progress":
    case "en_route":   return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    case "confirmed":
    case "approved":   return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "canceled":
    case "declined":
    case "no_show":    return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
    case "scheduled":  return "bg-[#0A4DFF]/15 text-[#4D8AFF] ring-[#0A4DFF]/30";
    default:           return "bg-white/10 text-white/60 ring-white/15";
  }
}

function safeDate(ts: any): Date | null {
  try { return convertToDate(ts); } catch { return null; }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FieldClientDetail() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId       = searchParams.get("clientId");
  const initialTab     = (searchParams.get("tab") as TabKey) || "overview";

  const [client,      setClient]      = useState<Client | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [activeTab,   setActiveTab]   = useState<TabKey>(initialTab);

  // Related data
  const [vehicles,     setVehicles]     = useState<Vehicle[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [invoices,     setInvoices]     = useState<Invoice[]>([]);
  const [quotes,       setQuotes]       = useState<Quote[]>([]);
  // Protected-client entry for Risk tab
  const [protectedEntry, setProtectedEntry] = useState<any | null>(null);

  // ── Load client (live) ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId) { setLoading(false); return; }
    const unsub = onSnapshot(
      doc(db, "clients", clientId),
      (snap) => {
        if (snap.exists()) setClient({ id: snap.id, ...(snap.data() as any) } as Client);
        else setError("Client not found.");
        setLoading(false);
      },
      (err) => {
        console.warn("[FieldClientDetail] client error", err);
        setError(err?.message || "Failed to load client.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [clientId]);

  // ── Load related data ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId) return;

    // Vehicles — live listener
    const unsubVehicles = onSnapshot(
      query(collection(db, "vehicles"), where("clientId", "==", clientId)),
      (snap) => setVehicles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Vehicle)),
      (err) => { if (err?.code !== "cancelled") console.warn("[FieldClientDetail] vehicles", err); },
    );

    // Protected clients — live listener
    const unsubProtected = onSnapshot(
      query(collection(db, "protected_clients"), where("clientId", "==", clientId), limit(1)),
      (snap) => setProtectedEntry(snap.empty ? null : { id: snap.docs[0].id, ...(snap.docs[0].data() as any) }),
      (err) => { if (err?.code !== "cancelled") console.warn("[FieldClientDetail] protected", err); },
    );

    // Appointments + invoices + quotes — one-time batch fetch
    const fetchDetails = async () => {
      try {
        const [apptSnap, invSnap, quoteSnap] = await Promise.all([
          getDocs(query(collection(db, "appointments"), where("clientId", "==", clientId), orderBy("scheduledAt", "desc"), limit(50))),
          getDocs(query(collection(db, "invoices"),     where("clientId", "==", clientId), orderBy("createdAt",   "desc"), limit(30))),
          getDocs(query(collection(db, "quotes"),       where("clientId", "==", clientId), orderBy("createdAt",   "desc"), limit(20))),
        ]);
        setAppointments(apptSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Appointment));
        setInvoices(invSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Invoice));
        setQuotes(quoteSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Quote));
      } catch (err) {
        console.warn("[FieldClientDetail] detail fetch", err);
      }
    };
    fetchDetails();

    return () => { unsubVehicles(); unsubProtected(); };
  }, [clientId]);

  // ── Derived values ───────────────────────────────────────────────────────────
  const lifetimeValue = useMemo(
    () => appointments.reduce((s, a) => s + (a.totalAmount || 0), 0),
    [appointments],
  );
  const unpaidInvoices = useMemo(
    () => invoices.filter((i) => i.status !== "paid" && i.status !== "voided"),
    [invoices],
  );
  const outstandingTotal = useMemo(
    () => unpaidInvoices.reduce((s, i) => s + ((i as any).total || (i as any).totalAmount || 0), 0),
    [unpaidInvoices],
  );
  const completedCount = useMemo(
    () => appointments.filter((a) => a.status === "completed" || a.status === "paid").length,
    [appointments],
  );
  const noShowCount = useMemo(
    () => appointments.filter((a) => a.status === "no_show").length,
    [appointments],
  );
  const cancelCount = useMemo(
    () => appointments.filter((a) => a.status === "canceled").length,
    [appointments],
  );
  const lastServiceDate = useMemo(() => {
    const done = appointments.find((a) => a.status === "completed" || a.status === "paid");
    return done ? safeDate(done.scheduledAt) : null;
  }, [appointments]);
  const avgOrderValue = useMemo(() => {
    if (!completedCount) return 0;
    return appointments
      .filter((a) => a.status === "completed" || a.status === "paid")
      .reduce((s, a) => s + (a.totalAmount || 0), 0) / completedCount;
  }, [appointments, completedCount]);

  // ── Guard states ─────────────────────────────────────────────────────────────
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
  const risk        = getEffectiveRisk(client);
  const phone       = client.phone ?? "";
  const email       = client.email ?? "";
  const address     = client.address ?? "";

  return (
    <div className="space-y-3 pb-4">

      {/* ── Top bar ── */}
      <TopBar onBack={() => navigate(-1)} isVIP={client.isVIP} />

      {/* ── Profile header card ── */}
      <div className="rounded-xl border border-white/5 bg-gradient-to-b from-[#0A4DFF]/10 to-sidebar/60 px-3 py-4">
        {/* Avatar + name */}
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-14 h-14 rounded-xl bg-[#0A4DFF]/15 ring-2 ring-[#0A4DFF]/30 flex items-center justify-center text-lg font-black text-[#0A4DFF] uppercase">
            {displayName.charAt(0) || <User className="w-6 h-6 text-[#0A4DFF]/70" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-base font-black text-white leading-none truncate">{displayName}</p>
              {client.isVIP && <Crown className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />}
            </div>
            {client.businessName && client.businessName !== displayName && (
              <p className="text-[11px] text-white/45 font-medium mt-0.5 truncate leading-tight">
                {client.businessName}
              </p>
            )}
          </div>
        </div>

        {/* Badges row */}
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full ring-1 leading-none",
              getRiskBadgeClass(risk),
            )}
          >
            {getRiskBadgeLabel(risk)}
          </span>
          {client.isVIP && (
            <span className="inline-flex items-center text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full ring-1 leading-none bg-amber-500/15 text-amber-300 ring-amber-500/30">
              VIP
            </span>
          )}
          {client.membershipLevel && client.membershipLevel !== "none" && (
            <span className="inline-flex items-center text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full ring-1 leading-none bg-violet-500/15 text-violet-300 ring-violet-500/30">
              {client.membershipLevel}
            </span>
          )}
          <span className="ml-auto text-[11px] font-black text-[#0A4DFF] tabular-nums shrink-0">
            {client.loyaltyPoints || 0}
            <span className="text-[8px] text-[#0A4DFF]/60 uppercase tracking-widest ml-1">Credits</span>
          </span>
        </div>

        {/* Contact summary */}
        <div className="mt-3 space-y-1">
          {phone && (
            <a href={`tel:${phone}`} className="flex items-center gap-2 text-[12px] font-bold text-white/80 hover:text-white transition-colors">
              <Phone className="w-3.5 h-3.5 text-white/40 shrink-0" />
              <span className="truncate">{formatPhoneNumber(phone)}</span>
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="flex items-center gap-2 text-[12px] font-bold text-white/80 hover:text-white transition-colors">
              <Mail className="w-3.5 h-3.5 text-white/40 shrink-0" />
              <span className="truncate">{email}</span>
            </a>
          )}
          {address && (
            <div className="flex items-start gap-2 text-[12px] font-bold text-white/60">
              <MapPin className="w-3.5 h-3.5 text-white/40 shrink-0 mt-0.5" />
              <span className="leading-tight break-words">{address}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="flex gap-2">
        {phone && (
          <a href={`tel:${phone}`} className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-white/5 bg-emerald-500/10 hover:bg-emerald-500/15 active:bg-emerald-500/10 transition-colors">
            <Phone className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-bold text-emerald-300">Call</span>
          </a>
        )}
        {phone && (
          <a href={`sms:${phone}`} className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-white/5 bg-sky-500/10 hover:bg-sky-500/15 active:bg-sky-500/10 transition-colors">
            <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[11px] font-bold text-sky-300">Text</span>
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-white/5 bg-violet-500/10 hover:bg-violet-500/15 active:bg-violet-500/10 transition-colors">
            <Mail className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[11px] font-bold text-violet-300">Email</span>
          </a>
        )}
      </div>

      {/* ── Book Job ── */}
      <button
        type="button"
        onClick={() => navigate(`/field/book-job?clientId=${clientId}`)}
        className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-[#0A4DFF] hover:bg-[#0A4DFF]/90 active:bg-[#0A4DFF]/80 transition-colors"
      >
        <Calendar className="w-4 h-4 text-white" />
        <span className="text-[13px] font-black text-white">Book Job</span>
      </button>

      {/* ── Scrollable tab bar ── */}
      <div className="overflow-x-auto -mx-2.5 px-2.5 scrollbar-none">
        <div className="flex gap-1 min-w-max">
          {TAB_LABELS.map(({ key, label }) => {
            const isActive = activeTab === key;
            let badge: string | null = null;
            if (key === "appointments") badge = String(appointments.length);
            if (key === "vehicles")     badge = String(vehicles.length);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cn(
                  "px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors min-h-[36px]",
                  isActive
                    ? "bg-[#0A4DFF]/15 text-[#0A4DFF] ring-1 ring-[#0A4DFF]/30"
                    : "text-white/45 hover:text-white/70 hover:bg-white/5",
                )}
              >
                {label}
                {badge && badge !== "0" && (
                  <span className={cn("ml-1.5 text-[8px]", isActive ? "text-[#0A4DFF]/70" : "text-white/30")}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      {activeTab === "overview" && (
        <OverviewTab
          lifetimeValue={lifetimeValue}
          outstandingTotal={outstandingTotal}
          completedCount={completedCount}
          avgOrderValue={avgOrderValue}
          lastServiceDate={lastServiceDate}
          unpaidCount={unpaidInvoices.length}
          noShowCount={noShowCount}
          cancelCount={cancelCount}
          appointments={appointments}
          invoices={invoices}
          membershipLevel={client.membershipLevel}
          risk={risk}
        />
      )}
      {activeTab === "profile" && (
        <ProfileTab client={client} clientId={clientId!} />
      )}
      {activeTab === "appointments" && (
        <AppointmentsTab appointments={appointments} clientId={clientId!} />
      )}
      {activeTab === "vehicles" && (
        <VehiclesTab vehicles={vehicles} />
      )}
      {activeTab === "notes" && (
        <NotesTab clientId={clientId!} initialNotes={client.notes} />
      )}
      {activeTab === "risk" && (
        <RiskTab
          client={client}
          risk={risk}
          noShowCount={noShowCount}
          cancelCount={cancelCount}
          outstandingFee={client.outstandingCancellationFee}
          protectedEntry={protectedEntry}
        />
      )}

      {/* ── Bridge to full desktop profile ── */}
      <button
        type="button"
        onClick={() => navigate(`/clients?clientId=${clientId}&adminView=1`)}
        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-2.5 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-md bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
          <Monitor className="w-4 h-4 text-white/50" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-bold text-white leading-tight">Open Full Client Profile</p>
          <p className="text-[10px] text-white/40 leading-tight mt-0.5">
            Billing, forms, AI strategy, service timing, gallery
          </p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>
    </div>
  );
}

// ─── Shared chrome ────────────────────────────────────────────────────────────

function TopBar({ onBack, isVIP }: { onBack: () => void; isVIP?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onBack}
        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
      >
        <ArrowLeft className="w-4 h-4 text-white/60" />
      </button>
      <h1 className="text-base font-black text-white leading-none flex-1">Client</h1>
      {isVIP && <Star className="w-4 h-4 text-amber-400 fill-amber-400/70 shrink-0" />}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-4 flex items-center justify-center min-h-[56px]">
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

// ─── InfoRow ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 min-h-[40px] gap-3">
      <span className="text-[9px] font-black uppercase tracking-widest text-white/40 shrink-0">{label}</span>
      <span className="text-[11px] font-bold text-white text-right break-words min-w-0">{value}</span>
    </div>
  );
}

// ─── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Receipt;
  iconColor: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-sidebar/60 px-3 py-3 min-w-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{label}</span>
        <Icon className={cn("w-3.5 h-3.5 shrink-0", iconColor)} />
      </div>
      <p className="text-xl font-black text-white tracking-tight leading-none">{value}</p>
      {sub && <p className="text-[9px] text-white/40 font-bold mt-1 leading-none">{sub}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════════════

function OverviewTab({
  lifetimeValue,
  outstandingTotal,
  completedCount,
  avgOrderValue,
  lastServiceDate,
  unpaidCount,
  noShowCount,
  cancelCount,
  appointments,
  invoices,
  membershipLevel,
  risk,
}: {
  lifetimeValue: number;
  outstandingTotal: number;
  completedCount: number;
  avgOrderValue: number;
  lastServiceDate: Date | null;
  unpaidCount: number;
  noShowCount: number;
  cancelCount: number;
  appointments: Appointment[];
  invoices: Invoice[];
  membershipLevel?: string;
  risk: ReturnType<typeof getEffectiveRisk>;
}) {
  const isBlocked   = risk === "block_booking" || risk === "do_not_book";
  const isElevated  = risk && risk !== "low";

  // Recent activity feed — appointments + invoices merged by date
  const recentActivity = useMemo(() => {
    const items: { type: "appt" | "invoice"; label: string; sub: string; status: string; date: Date }[] = [];
    for (const a of appointments.slice(0, 15)) {
      const d = safeDate(a.scheduledAt);
      if (!d) continue;
      items.push({
        type: "appt",
        label: a.serviceNames?.join(", ") || "Appointment",
        sub: a.vehicleInfo || "",
        status: a.status,
        date: d,
      });
    }
    for (const inv of invoices.slice(0, 15)) {
      const d = safeDate((inv as any).createdAt);
      if (!d) continue;
      items.push({
        type: "invoice",
        label: `Invoice #${(inv as any).invoiceNumber || (inv as any).number || "—"}`,
        sub: formatCurrency((inv as any).total || (inv as any).totalAmount || 0),
        status: inv.status || "pending",
        date: d,
      });
    }
    items.sort((a, b) => b.date.getTime() - a.date.getTime());
    return items.slice(0, 10);
  }, [appointments, invoices]);

  return (
    <div className="space-y-2.5">
      {/* Risk alert banner */}
      {isElevated && (
        <div className={cn(
          "rounded-xl border px-3 py-2.5 flex items-start gap-2.5",
          isBlocked ? "bg-red-900/20 border-red-700/40" : "bg-red-500/10 border-red-500/20",
        )}>
          <div className={cn(
            "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
            isBlocked ? "bg-red-900/40 text-red-400" : "bg-red-500/20 text-red-500",
          )}>
            <AlertOctagon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-red-400 uppercase tracking-tight">
              {getRiskBadgeLabel(risk)} — Risk Alert
            </p>
            <p className="text-[10px] text-white/60 font-medium mt-0.5 leading-tight">
              {isBlocked
                ? "Account restricted. Manager approval required."
                : "Flagged client — history of no-shows or payment issues."}
              {(risk === "high" || risk === "critical" || isBlocked) && (
                <span className="text-red-400 font-black"> COLLECT DEPOSIT.</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2">
        <KpiCard
          label="Lifetime Value"
          value={formatCurrency(lifetimeValue)}
          sub={unpaidCount > 0 ? `${formatCurrency(outstandingTotal)} outstanding` : undefined}
          icon={Receipt}
          iconColor="text-[#0A4DFF]"
        />
        <KpiCard
          label="Services Done"
          value={String(completedCount)}
          sub={lastServiceDate ? `Last: ${format(lastServiceDate, "MMM d")}` : undefined}
          icon={History}
          iconColor="text-emerald-400"
        />
        <KpiCard
          label="Avg Order"
          value={avgOrderValue > 0 ? formatCurrency(avgOrderValue) : "—"}
          icon={CreditCard}
          iconColor="text-violet-400"
        />
        <KpiCard
          label="No-shows"
          value={noShowCount > 0 ? String(noShowCount) : "None"}
          sub={cancelCount > 0 ? `${cancelCount} canceled` : undefined}
          icon={UserX}
          iconColor={noShowCount > 0 ? "text-rose-400" : "text-white/30"}
        />
      </div>

      {/* Membership banner */}
      {membershipLevel && membershipLevel !== "none" && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2.5 flex items-center gap-2.5">
          <BadgeCheck className="w-4 h-4 text-violet-400 shrink-0" />
          <p className="text-[11px] font-black text-violet-300 uppercase tracking-widest">
            {membershipLevel} Member
          </p>
        </div>
      )}

      {/* Recent activity */}
      {recentActivity.length > 0 ? (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-2.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Recent Activity</p>
          <div className="space-y-1.5">
            {recentActivity.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 min-h-[36px]">
                <div className={cn(
                  "shrink-0 w-7 h-7 rounded-lg flex items-center justify-center",
                  item.status === "paid" || item.status === "completed"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : item.status === "canceled" || item.status === "no_show"
                      ? "bg-rose-500/10 text-rose-400"
                      : "bg-white/5 text-white/40",
                )}>
                  {item.type === "appt"
                    ? <Calendar className="w-3 h-3" />
                    : <Receipt className="w-3 h-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-white truncate leading-tight">{item.label}</p>
                  {item.sub && <p className="text-[9px] text-white/40 truncate leading-tight">{item.sub}</p>}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-0.5">
                  <span className={cn(
                    "text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none",
                    statusColor(item.status),
                  )}>
                    {item.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-[8px] text-white/30 font-bold tabular-nums">
                    {format(item.date, "MMM d")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-6 text-center">
          <History className="w-5 h-5 text-white/20 mx-auto" />
          <p className="text-[11px] font-bold text-white/40 mt-1.5">No activity yet</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE TAB — editable contact + membership info
// ═══════════════════════════════════════════════════════════════════════════════

type ProfileFormData = {
  firstName:       string;
  lastName:        string;
  businessName:    string;
  phone:           string;
  email:           string;
  address:         string;
  membershipLevel: "none" | "silver" | "gold" | "platinum";
  isVIP:           boolean;
  isOneTime:       boolean;
};

function ProfileTab({ client, clientId }: { client: Client; clientId: string }) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState<ProfileFormData>({
    firstName:       client.firstName       ?? "",
    lastName:        client.lastName        ?? "",
    businessName:    client.businessName    ?? "",
    phone:           client.phone           ?? "",
    email:           client.email           ?? "",
    address:         client.address         ?? "",
    membershipLevel: (client.membershipLevel as any) ?? "none",
    isVIP:           client.isVIP           ?? false,
    isOneTime:       client.isOneTime       ?? false,
  });

  // Sync form when client updates from Firestore
  useEffect(() => {
    if (!editing) {
      setForm({
        firstName:       client.firstName       ?? "",
        lastName:        client.lastName        ?? "",
        businessName:    client.businessName    ?? "",
        phone:           client.phone           ?? "",
        email:           client.email           ?? "",
        address:         client.address         ?? "",
        membershipLevel: (client.membershipLevel as any) ?? "none",
        isVIP:           client.isVIP           ?? false,
        isOneTime:       client.isOneTime       ?? false,
      });
    }
  }, [client, editing]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const derivedName = form.businessName ||
        [form.firstName, form.lastName].filter(Boolean).join(" ") ||
        "Unnamed";
      await updateDoc(doc(db, "clients", clientId), {
        firstName:       form.firstName.trim()    || null,
        lastName:        form.lastName.trim()     || null,
        businessName:    form.businessName.trim() || null,
        name:            derivedName,
        phone:           form.phone.trim(),
        email:           form.email.trim().toLowerCase(),
        address:         form.address.trim(),
        membershipLevel: form.membershipLevel,
        isVIP:           form.isVIP,
        isOneTime:       form.isOneTime,
        updatedAt:       serverTimestamp(),
      });
      toast.success("Client updated");
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.message?.slice(0, 80) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setForm({
      firstName:       client.firstName       ?? "",
      lastName:        client.lastName        ?? "",
      businessName:    client.businessName    ?? "",
      phone:           client.phone           ?? "",
      email:           client.email           ?? "",
      address:         client.address         ?? "",
      membershipLevel: (client.membershipLevel as any) ?? "none",
      isVIP:           client.isVIP           ?? false,
      isOneTime:       client.isOneTime       ?? false,
    });
  };

  const field = (
    key: keyof ProfileFormData,
    label: string,
    type: string = "text",
    placeholder: string = "",
  ) => (
    <div className="px-3 py-2.5 border-b border-white/[0.04] last:border-none">
      <label className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none block mb-1">
        {label}
      </label>
      <input
        type={type}
        value={form[key] as string}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full bg-transparent text-[12px] font-bold text-white placeholder-white/20 outline-none leading-tight"
        autoCapitalize={type === "email" ? "none" : "words"}
        autoCorrect="off"
        autoComplete="off"
        inputMode={type === "email" ? "email" : type === "tel" ? "tel" : "text"}
      />
    </div>
  );

  // ── Read-only view ──
  if (!editing) {
    return (
      <div className="space-y-2.5">
        {/* Edit button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-[10px] font-black uppercase tracking-widest text-white/60"
          >
            <Edit2 className="w-3 h-3" />
            Edit
          </button>
        </div>

        {/* Name & business */}
        <div className="rounded-xl border border-white/5 bg-sidebar/40 divide-y divide-white/[0.04]">
          <InfoRow label="First Name"    value={client.firstName    || "—"} />
          <InfoRow label="Last Name"     value={client.lastName     || "—"} />
          <InfoRow label="Business"      value={client.businessName || "—"} />
        </div>

        {/* Contact */}
        <div className="rounded-xl border border-white/5 bg-sidebar/40 divide-y divide-white/[0.04]">
          {client.phone && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 min-h-[44px]">
              <Phone className="w-3.5 h-3.5 text-white/40 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-0.5">Phone</p>
                <a href={`tel:${client.phone}`} className="text-[12px] font-bold text-white hover:text-[#0A4DFF] transition-colors">
                  {formatPhoneNumber(client.phone)}
                </a>
              </div>
            </div>
          )}
          {client.email && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 min-h-[44px]">
              <Mail className="w-3.5 h-3.5 text-white/40 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-0.5">Email</p>
                <a href={`mailto:${client.email}`} className="text-[12px] font-bold text-white truncate block hover:text-[#0A4DFF] transition-colors">
                  {client.email}
                </a>
              </div>
            </div>
          )}
          {client.address && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 min-h-[44px]">
              <MapPin className="w-3.5 h-3.5 text-white/40 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-0.5">Address</p>
                <p className="text-[12px] font-bold text-white leading-tight break-words">{client.address}</p>
              </div>
            </div>
          )}
        </div>

        {/* Account settings */}
        <div className="rounded-xl border border-white/5 bg-sidebar/40 divide-y divide-white/[0.04]">
          <InfoRow label="Membership"  value={(client.membershipLevel && client.membershipLevel !== "none") ? client.membershipLevel : "Standard"} />
          <InfoRow label="VIP Status"  value={client.isVIP      ? "Yes" : "No"} />
          <InfoRow label="One-Time"    value={client.isOneTime   ? "Yes" : "No"} />
          <InfoRow label="Loyalty Pts" value={String(client.loyaltyPoints || 0)} />
        </div>
      </div>
    );
  }

  // ── Edit view ──
  return (
    <div className="space-y-2.5">
      {/* Save / Cancel — ABOVE fields so keyboard doesn't obscure them */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-[11px] font-black uppercase tracking-widest text-white/60 disabled:opacity-40"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl bg-[#0A4DFF] hover:bg-[#0A4DFF]/90 transition-colors text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-50"
        >
          {saving
            ? <div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" />
            : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Name fields */}
      <div className="rounded-xl border border-white/5 bg-sidebar/60">
        <p className="px-3 pt-2.5 text-[9px] font-black uppercase tracking-widest text-white/40">Name</p>
        {field("firstName",    "First Name",      "text", "First")}
        {field("lastName",     "Last Name",       "text", "Last")}
        {field("businessName", "Business / Fleet","text", "Optional")}
      </div>

      {/* Contact fields */}
      <div className="rounded-xl border border-white/5 bg-sidebar/60">
        <p className="px-3 pt-2.5 text-[9px] font-black uppercase tracking-widest text-white/40">Contact</p>
        {field("phone",   "Phone",   "tel",   "(555) 000-0000")}
        {field("email",   "Email",   "email", "name@example.com")}
        {field("address", "Address", "text",  "Street address")}
      </div>

      {/* Account fields */}
      <div className="rounded-xl border border-white/5 bg-sidebar/60">
        <p className="px-3 pt-2.5 text-[9px] font-black uppercase tracking-widest text-white/40">Account</p>

        {/* Membership select */}
        <div className="px-3 py-2.5 border-b border-white/[0.04]">
          <label className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none block mb-1">
            Membership
          </label>
          <select
            value={form.membershipLevel}
            onChange={(e) => setForm((f) => ({ ...f, membershipLevel: e.target.value as any }))}
            className="w-full bg-transparent text-[12px] font-bold text-white outline-none leading-tight appearance-none"
          >
            <option value="none"     className="bg-[#0D1117]">Standard</option>
            <option value="silver"   className="bg-[#0D1117]">Silver</option>
            <option value="gold"     className="bg-[#0D1117]">Gold</option>
            <option value="platinum" className="bg-[#0D1117]">Platinum</option>
          </select>
        </div>

        {/* VIP toggle */}
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, isVIP: !f.isVIP }))}
          className="w-full flex items-center justify-between px-3 py-2.5 border-b border-white/[0.04] min-h-[44px]"
        >
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">VIP Status</span>
          <div className={cn(
            "w-9 h-5 rounded-full transition-colors flex items-center",
            form.isVIP ? "bg-amber-500" : "bg-white/10",
          )}>
            <div className={cn(
              "w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5",
              form.isVIP ? "translate-x-4" : "translate-x-0",
            )} />
          </div>
        </button>

        {/* One-time toggle */}
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, isOneTime: !f.isOneTime }))}
          className="w-full flex items-center justify-between px-3 py-2.5 min-h-[44px]"
        >
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">One-Time Client</span>
          <div className={cn(
            "w-9 h-5 rounded-full transition-colors flex items-center",
            form.isOneTime ? "bg-[#0A4DFF]" : "bg-white/10",
          )}>
            <div className={cn(
              "w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5",
              form.isOneTime ? "translate-x-4" : "translate-x-0",
            )} />
          </div>
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPOINTMENTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function AppointmentsTab({
  appointments,
  clientId,
}: {
  appointments: Appointment[];
  clientId: string;
}) {
  const navigate = useNavigate();

  if (appointments.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-8 text-center">
        <Calendar className="w-6 h-6 text-white/20 mx-auto" />
        <p className="text-[11px] font-bold text-white/40 mt-2">No appointments</p>
        <button
          type="button"
          onClick={() => navigate(`/field/book-job?clientId=${clientId}`)}
          className="mt-3 px-4 py-1.5 rounded-lg bg-[#0A4DFF]/20 text-[10px] font-black uppercase tracking-widest text-[#0A4DFF]"
        >
          Book First Job
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {appointments.map((appt) => {
        const d     = safeDate(appt.scheduledAt);
        const dateStr = d ? format(d, "MMM d, yyyy · h:mm a") : "Date unavailable";
        return (
          <button
            key={appt.id}
            type="button"
            onClick={() => navigate(`/calendar/${appt.id}`)}
            className="w-full rounded-xl border border-white/5 bg-sidebar/60 px-3 py-2.5 flex items-start gap-2.5 min-h-[60px] text-left hover:bg-sidebar/80 active:bg-sidebar transition-colors"
          >
            <div className={cn(
              "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5",
              appt.status === "completed" || appt.status === "paid"
                ? "bg-emerald-500/10 text-emerald-400"
                : appt.status === "canceled" || appt.status === "no_show"
                  ? "bg-rose-500/10 text-rose-400"
                  : "bg-[#0A4DFF]/10 text-[#0A4DFF]",
            )}>
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-white truncate leading-tight">
                {appt.serviceNames?.join(", ") || "Appointment"}
              </p>
              <p className="text-[10px] text-white/45 font-medium leading-tight mt-0.5 truncate">
                {appt.vehicleInfo || "No vehicle"}
              </p>
              <p className="text-[9px] text-white/30 font-bold leading-tight mt-0.5">{dateStr}</p>
              <span className={cn(
                "inline-block mt-1 text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none",
                statusColor(appt.status),
              )}>
                {appt.status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="shrink-0 text-right pl-1">
              <p className="text-[12px] font-black text-white tabular-nums">
                {formatCurrency(appt.totalAmount || 0)}
              </p>
              <ChevronRight className="w-3 h-3 text-white/20 ml-auto mt-1" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VEHICLES TAB
// ═══════════════════════════════════════════════════════════════════════════════

function VehiclesTab({ vehicles }: { vehicles: Vehicle[] }) {
  if (vehicles.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-8 text-center">
        <Car className="w-6 h-6 text-white/20 mx-auto" />
        <p className="text-[11px] font-bold text-white/40 mt-2">No vehicles on file</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {vehicles.map((v) => (
        <div
          key={v.id}
          className="rounded-xl border border-white/5 bg-sidebar/60 px-3 py-3"
        >
          {/* Header row */}
          <div className="flex items-start gap-2.5">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-sky-500/10 ring-1 ring-sky-500/30 flex items-center justify-center">
              <Car className="w-4 h-4 text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-black text-white leading-tight truncate">
                {[v.year, v.make, v.model].filter(Boolean).join(" ") || "Unknown Vehicle"}
              </p>
              {/* Detail pills */}
              <div className="flex flex-wrap gap-1 mt-1">
                {v.color && (
                  <span className="text-[8px] font-bold text-white/50 bg-white/5 px-1.5 py-0.5 rounded">
                    {v.color}
                  </span>
                )}
                {v.size && (
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/40 bg-white/5 ring-1 ring-white/10 px-1.5 py-0.5 rounded">
                    {v.size}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Extra detail rows */}
          {(v.vin || v.licensePlate || v.roNumber) && (
            <div className="mt-2.5 pt-2.5 border-t border-white/5 space-y-1">
              {v.vin && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/30">VIN</span>
                  <span className="text-[9px] font-mono text-white/50 truncate">{v.vin}</span>
                </div>
              )}
              {v.licensePlate && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Plate</span>
                  <span className="text-[9px] font-bold text-white/50">{v.licensePlate}</span>
                </div>
              )}
              {v.roNumber && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/30">RO #</span>
                  <span className="text-[9px] font-bold text-white/50">{v.roNumber}</span>
                </div>
              )}
            </div>
          )}
          {v.notes && (
            <p className="mt-2 text-[10px] text-white/40 leading-tight italic">{v.notes}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTES TAB — read + compose/edit
// ═══════════════════════════════════════════════════════════════════════════════

function NotesTab({ clientId, initialNotes }: { clientId: string; initialNotes?: string }) {
  const [draft,   setDraft]   = useState(initialNotes ?? "");
  const [saving,  setSaving]  = useState(false);
  const [editing, setEditing] = useState(false);

  // Keep draft fresh when Firestore update arrives (if not currently editing)
  useEffect(() => {
    if (!editing) setDraft(initialNotes ?? "");
  }, [initialNotes, editing]);

  const hasNotes  = Boolean(initialNotes?.trim());
  const hasChange = draft.trim() !== (initialNotes ?? "").trim();

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "clients", clientId), {
        notes:     draft.trim() || null,
        updatedAt: serverTimestamp(),
      });
      toast.success("Notes saved");
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.message?.slice(0, 80) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(initialNotes ?? "");
    setEditing(false);
  };

  return (
    <div className="space-y-2.5">
      {/* Action bar — ABOVE the textarea so keyboard never covers it */}
      {editing ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-[11px] font-black uppercase tracking-widest text-white/60 disabled:opacity-40"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChange}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl bg-[#0A4DFF] hover:bg-[#0A4DFF]/90 transition-colors text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-40"
          >
            {saving
              ? <div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" />
              : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : "Save Notes"}
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-[10px] font-black uppercase tracking-widest text-white/60"
          >
            <Edit2 className="w-3 h-3" />
            {hasNotes ? "Edit Notes" : "Add Notes"}
          </button>
        </div>
      )}

      {/* Composer — always visible when editing */}
      {editing && (
        <div className="rounded-xl border border-white/10 bg-sidebar/60">
          <p className="px-3 pt-2.5 text-[9px] font-black uppercase tracking-widest text-white/40">
            Internal Notes
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add internal notes about this client…"
            rows={5}
            className="w-full bg-transparent px-3 py-2.5 text-[12px] font-medium text-white placeholder-white/25 outline-none resize-none leading-relaxed"
            autoFocus
          />
        </div>
      )}

      {/* Existing note display (read-only when not editing) */}
      {!editing && hasNotes && (
        <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-2">
            Internal Notes
          </p>
          <p className="text-[12px] font-medium text-white/70 leading-relaxed whitespace-pre-wrap">{initialNotes}</p>
        </div>
      )}

      {/* Empty state */}
      {!editing && !hasNotes && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-8 text-center">
          <Clipboard className="w-6 h-6 text-white/20 mx-auto" />
          <p className="text-[11px] font-bold text-white/40 mt-2">No notes yet</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-3 px-4 py-1.5 rounded-lg bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/50"
          >
            Add Note
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RISK TAB — wired to riskUtils + protected_clients + appointment history
// ═══════════════════════════════════════════════════════════════════════════════

function RiskTab({
  client,
  risk,
  noShowCount,
  cancelCount,
  outstandingFee,
  protectedEntry,
}: {
  client: Client;
  risk: ReturnType<typeof getEffectiveRisk>;
  noShowCount: number;
  cancelCount: number;
  outstandingFee?: number;
  protectedEntry: any | null;
}) {
  const riskLabel  = getRiskBadgeLabel(risk);
  const isBlocked  = risk === "block_booking" || risk === "do_not_book";
  const isElevated = risk === "medium" || risk === "high" || risk === "critical" || isBlocked;

  return (
    <div className="space-y-2.5">
      {/* Risk status hero */}
      <div className={cn(
        "rounded-xl border px-3 py-3",
        isBlocked   ? "bg-red-900/20 border-red-700/40"
        : isElevated ? "bg-red-500/10 border-red-500/20"
        :              "bg-emerald-500/5 border-emerald-500/15",
      )}>
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
            isBlocked   ? "bg-red-900/40 text-red-400"
            : isElevated ? "bg-red-500/20 text-red-500"
            :              "bg-emerald-500/15 text-emerald-400",
          )}>
            {isElevated
              ? <ShieldAlert className="w-5 h-5" />
              : <CheckCircle2 className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-sm font-black uppercase tracking-tight leading-none",
              isElevated ? "text-red-400" : "text-emerald-400",
            )}>
              {riskLabel}
            </p>
            <p className="text-[10px] text-white/50 font-medium mt-1 leading-tight">
              {isBlocked  && "Account restricted. Do not book without manager approval."}
              {risk === "high"     && "History of no-shows or payment issues. Collect deposit."}
              {risk === "critical" && "Critical risk. Deposit required for all services."}
              {risk === "medium"   && "Moderate risk. Deposit may be required."}
              {risk === "low"      && "Good standing. No elevated risk flags."}
              {!risk               && "No risk assessment on file."}
            </p>
          </div>
        </div>
      </div>

      {/* Policy details */}
      <div className="rounded-xl border border-white/5 bg-sidebar/40 divide-y divide-white/[0.04]">
        <RiskRow label="Risk Level"      value={riskLabel} />
        <RiskRow
          label="Deposit Required"
          value={risk === "medium" || risk === "high" || risk === "critical" || isBlocked ? "Yes" : "No"}
          highlight={risk === "high" || isBlocked}
        />
        <RiskRow
          label="Booking Status"
          value={isBlocked ? "🚫 Blocked" : "✓ Allowed"}
          highlight={isBlocked}
        />
        <RiskRow
          label="Payment Method"
          value={client.hasSavedPaymentMethod ? "On File" : "Not Saved"}
        />
      </div>

      {/* Appointment history risk signals */}
      <div className="rounded-xl border border-white/5 bg-sidebar/40 divide-y divide-white/[0.04]">
        <div className="px-3 py-2 bg-white/[0.02]">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Appointment History</p>
        </div>
        <RiskRow
          label="No-Shows"
          value={noShowCount > 0 ? `${noShowCount} recorded` : "None"}
          highlight={noShowCount >= 2}
        />
        <RiskRow
          label="Cancellations"
          value={cancelCount > 0 ? `${cancelCount} recorded` : "None"}
          highlight={cancelCount >= 3}
        />
        {outstandingFee != null && outstandingFee > 0 && (
          <RiskRow
            label="Outstanding Cancel Fee"
            value={formatCurrency(outstandingFee)}
            highlight
          />
        )}
      </div>

      {/* Protected client entry (from ProtectedClients collection) */}
      {protectedEntry && (
        <div className="rounded-xl border border-red-500/25 bg-red-900/10 px-3 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-[11px] font-black text-red-400 uppercase tracking-tight">
              Protected Client Entry
            </p>
          </div>
          <div className="space-y-1">
            {protectedEntry.protectionLevel && (
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Level</span>
                <span className="text-[10px] font-bold text-red-300">{protectedEntry.protectionLevel}</span>
              </div>
            )}
            {protectedEntry.riskReason && (
              <p className="text-[10px] text-white/50 leading-tight mt-1 italic">{protectedEntry.riskReason}</p>
            )}
            {protectedEntry.notes && (
              <p className="text-[10px] text-white/40 leading-tight mt-0.5 italic">{protectedEntry.notes}</p>
            )}
          </div>
        </div>
      )}

      {/* Client-level risk fields (riskManagement object if present) */}
      {client.riskLevel && client.riskLevel !== "low" && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-2.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">Risk Profile</p>
          <div className="flex flex-wrap gap-1.5">
            <span className={cn(
              "text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full ring-1 leading-none",
              getRiskBadgeClass(risk),
            )}>
              {riskLabel}
            </span>
            {(client as any).riskManagement?.reason && (
              <p className="w-full text-[10px] text-white/40 leading-tight italic mt-1">
                {(client as any).riskManagement.reason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bridge to full desktop risk management */}
      <button
        type="button"
        onClick={() => window.location.assign(`/clients?clientId=${client.id}&adminView=1&tab=profile`)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left min-h-[44px]"
      >
        <Building2 className="w-3.5 h-3.5 text-white/30 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-white leading-tight">Manage Risk Profile</p>
          <p className="text-[9px] text-white/35 leading-tight">Full risk settings, deposit rules, block booking</p>
        </div>
        <ExternalLink className="w-3 h-3 text-white/25 shrink-0" />
      </button>
    </div>
  );
}

function RiskRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 min-h-[40px] gap-3">
      <span className="text-[9px] font-black uppercase tracking-widest text-white/40 shrink-0">{label}</span>
      <span className={cn(
        "text-[11px] font-bold text-right min-w-0 break-words",
        highlight ? "text-red-400" : "text-white",
      )}>
        {value}
      </span>
    </div>
  );
}
