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
  FileText,
  AlertOctagon,
  Crown,
  ChevronRight,
  Clipboard,
  ShieldAlert,
} from "lucide-react";
import { format } from "date-fns";
import type { Client, Vehicle, Appointment, Invoice, Quote } from "../../types";

// ─── Tab type ────────────────────────────────────────────────────────────────
type TabKey = "overview" | "appointments" | "vehicles" | "notes" | "risk";

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "appointments", label: "Appointments" },
  { key: "vehicles", label: "Vehicles" },
  { key: "notes", label: "Notes" },
  { key: "risk", label: "Risk" },
];

// ─── Status color map ────────────────────────────────────────────────────────
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
    default:
      return "bg-white/10 text-white/60 ring-white/15";
  }
}

export default function FieldClientDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId");
  const initialTab = (searchParams.get("tab") as TabKey) || "overview";

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // Related data
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  // ─── Load client ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }
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
        console.warn("[FieldClientDetail] snapshot error", err);
        setError(err?.message || "Failed to load client.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [clientId]);

  // ─── Load related data when client is available ────────────────────────────
  useEffect(() => {
    if (!clientId) return;

    // Vehicles — live listener
    const unsubVehicles = onSnapshot(
      query(collection(db, "vehicles"), where("clientId", "==", clientId)),
      (snap) => {
        setVehicles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Vehicle));
      },
      (err) => {
        if (err?.code !== "cancelled") console.warn("[FieldClientDetail] vehicles error", err);
      },
    );

    // Appointments, invoices, quotes — one-time fetch
    const fetchDetails = async () => {
      try {
        const [apptSnap, invSnap, quoteSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "appointments"),
              where("clientId", "==", clientId),
              orderBy("scheduledAt", "desc"),
              limit(30),
            ),
          ),
          getDocs(
            query(
              collection(db, "invoices"),
              where("clientId", "==", clientId),
              orderBy("createdAt", "desc"),
              limit(30),
            ),
          ),
          getDocs(
            query(
              collection(db, "quotes"),
              where("clientId", "==", clientId),
              orderBy("createdAt", "desc"),
              limit(20),
            ),
          ),
        ]);
        setAppointments(apptSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Appointment));
        setInvoices(invSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Invoice));
        setQuotes(quoteSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Quote));
      } catch (err) {
        console.warn("[FieldClientDetail] detail fetch error", err);
      }
    };
    fetchDetails();

    return () => unsubVehicles();
  }, [clientId]);

  // ─── Derived data ──────────────────────────────────────────────────────────
  const lifetimeValue = useMemo(
    () => appointments.reduce((sum, a) => sum + (a.totalAmount || 0), 0),
    [appointments],
  );
  const unpaidInvoices = useMemo(
    () => invoices.filter((inv) => inv.status !== "paid" && inv.status !== "voided"),
    [invoices],
  );
  const outstandingTotal = useMemo(
    () => unpaidInvoices.reduce((sum, inv) => sum + ((inv as any).total || (inv as any).totalAmount || 0), 0),
    [unpaidInvoices],
  );
  const completedCount = useMemo(
    () => appointments.filter((a) => a.status === "completed" || a.status === "paid").length,
    [appointments],
  );
  const lastServiceDate = useMemo(() => {
    const completed = appointments.find((a) => a.status === "completed" || a.status === "paid");
    if (!completed) return null;
    try {
      return convertToDate(completed.scheduledAt);
    } catch {
      return null;
    }
  }, [appointments]);

  // ── Guard states ──────────────────────────────────────────────────────────
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

  return (
    <div className="space-y-3 pb-4">
      {/* ── Top bar ── */}
      <TopBar onBack={() => navigate(-1)} isVIP={client.isVIP} />

      {/* ── Stacked profile header card ── */}
      <div className="rounded-xl border border-white/5 bg-gradient-to-b from-[#0A4DFF]/10 to-sidebar/60 px-3 py-4">
        {/* Row 1: Avatar + name + VIP */}
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-14 h-14 rounded-xl bg-[#0A4DFF]/15 ring-2 ring-[#0A4DFF]/30 flex items-center justify-center text-lg font-black text-[#0A4DFF] uppercase">
            {displayName.charAt(0) || <User className="w-6 h-6 text-[#0A4DFF]/70" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
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

        {/* Row 2: Risk badge + credits */}
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
          <span className="ml-auto text-[11px] font-black text-[#0A4DFF] tabular-nums">
            {client.loyaltyPoints || 0}{" "}
            <span className="text-[8px] text-[#0A4DFF]/60 uppercase tracking-widest">Credits</span>
          </span>
        </div>

        {/* Row 3: Contact info */}
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
              <span className="leading-tight">{address}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick action buttons ── */}
      <div className="flex gap-2">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-white/5 bg-emerald-500/10 hover:bg-emerald-500/15 active:bg-emerald-500/10 transition-colors"
          >
            <Phone className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-bold text-emerald-300">Call</span>
          </a>
        )}
        {phone && (
          <a
            href={`sms:${phone}`}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-white/5 bg-sky-500/10 hover:bg-sky-500/15 active:bg-sky-500/10 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[11px] font-bold text-sky-300">Text</span>
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-white/5 bg-violet-500/10 hover:bg-violet-500/15 active:bg-violet-500/10 transition-colors"
          >
            <Mail className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[11px] font-bold text-violet-300">Email</span>
          </a>
        )}
      </div>

      {/* ── Book Job button ── */}
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
            if (key === "vehicles") badge = String(vehicles.length);
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
          lastServiceDate={lastServiceDate}
          unpaidCount={unpaidInvoices.length}
          appointments={appointments}
          invoices={invoices}
          risk={risk}
        />
      )}
      {activeTab === "appointments" && (
        <AppointmentsTab appointments={appointments} />
      )}
      {activeTab === "vehicles" && (
        <VehiclesTab vehicles={vehicles} />
      )}
      {activeTab === "notes" && (
        <NotesTab notes={client.notes} />
      )}
      {activeTab === "risk" && (
        <RiskTab client={client} risk={risk} />
      )}

      {/* ── Bridge card — open full desktop profile ── */}
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

// ─── Shared chrome components ────────────────────────────────────────────────

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

// ─── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  subLabel,
  subValue,
  icon: Icon,
  iconColor,
}: {
  label: string;
  value: string;
  subLabel?: string;
  subValue?: string;
  icon: typeof Receipt;
  iconColor: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-sidebar/60 px-3 py-3 space-y-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{label}</span>
        <Icon className={cn("w-3.5 h-3.5 shrink-0", iconColor)} />
      </div>
      <p className="text-xl font-black text-white tracking-tight leading-none">{value}</p>
      {subLabel && (
        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{subLabel}</span>
          <span className="text-[10px] font-black text-white tabular-nums">{subValue}</span>
        </div>
      )}
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({
  lifetimeValue,
  outstandingTotal,
  completedCount,
  lastServiceDate,
  unpaidCount,
  appointments,
  invoices,
  risk,
}: {
  lifetimeValue: number;
  outstandingTotal: number;
  completedCount: number;
  lastServiceDate: Date | null;
  unpaidCount: number;
  appointments: Appointment[];
  invoices: Invoice[];
  risk: ReturnType<typeof getEffectiveRisk>;
}) {
  // Risk alert banner (for medium+ risk)
  const showRiskAlert = risk && risk !== "low";
  const isBlocked = risk === "block_booking" || risk === "do_not_book";

  // Recent activity — merge appointments + invoices, sort by date desc, take 8
  const recentActivity = useMemo(() => {
    const items: { type: "appt" | "invoice"; label: string; sub: string; status: string; date: Date }[] = [];
    for (const a of appointments.slice(0, 10)) {
      try {
        items.push({
          type: "appt",
          label: a.serviceNames?.join(", ") || "Appointment",
          sub: a.vehicleInfo || "",
          status: a.status,
          date: convertToDate(a.scheduledAt),
        });
      } catch { /* skip bad dates */ }
    }
    for (const inv of invoices.slice(0, 10)) {
      try {
        items.push({
          type: "invoice",
          label: `Invoice #${(inv as any).invoiceNumber || (inv as any).number || "—"}`,
          sub: formatCurrency((inv as any).total || (inv as any).totalAmount || 0),
          status: inv.status || "pending",
          date: convertToDate((inv as any).createdAt),
        });
      } catch { /* skip */ }
    }
    items.sort((a, b) => b.date.getTime() - a.date.getTime());
    return items.slice(0, 8);
  }, [appointments, invoices]);

  return (
    <div className="space-y-2.5">
      {/* Risk alert banner */}
      {showRiskAlert && (
        <div
          className={cn(
            "rounded-xl border px-3 py-2.5 flex items-start gap-2.5",
            isBlocked ? "bg-red-900/20 border-red-700/40" : "bg-red-500/10 border-red-500/20",
          )}
        >
          <div
            className={cn(
              "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
              isBlocked ? "bg-red-900/40 text-red-400" : "bg-red-500/20 text-red-500",
            )}
          >
            <AlertOctagon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-red-400 uppercase tracking-tight leading-tight">
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

      {/* KPI grid — 2 columns, compact */}
      <div className="grid grid-cols-2 gap-2">
        <KpiCard
          label="Lifetime Value"
          value={formatCurrency(lifetimeValue)}
          subLabel="Outstanding"
          subValue={unpaidCount > 0 ? formatCurrency(outstandingTotal) : "—"}
          icon={Receipt}
          iconColor="text-[#0A4DFF]"
        />
        <KpiCard
          label="Services"
          value={String(completedCount)}
          subLabel="Last Service"
          subValue={lastServiceDate ? format(lastServiceDate, "MMM d") : "None"}
          icon={History}
          iconColor="text-emerald-400"
        />
      </div>

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-2.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Recent Activity</p>
          <div className="space-y-1.5">
            {recentActivity.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 min-h-[36px]">
                <div
                  className={cn(
                    "shrink-0 w-7 h-7 rounded-lg flex items-center justify-center",
                    item.status === "paid" || item.status === "completed"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : item.status === "canceled" || item.status === "no_show"
                        ? "bg-rose-500/10 text-rose-400"
                        : "bg-white/5 text-white/40",
                  )}
                >
                  {item.type === "appt" ? (
                    <Calendar className="w-3 h-3" />
                  ) : (
                    <Receipt className="w-3 h-3" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-white truncate leading-tight">{item.label}</p>
                  {item.sub && (
                    <p className="text-[9px] text-white/40 truncate leading-tight">{item.sub}</p>
                  )}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-0.5">
                  <span
                    className={cn(
                      "text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none",
                      statusColor(item.status),
                    )}
                  >
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
      )}

      {recentActivity.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-6 text-center">
          <History className="w-5 h-5 text-white/20 mx-auto" />
          <p className="text-[11px] font-bold text-white/40 mt-1.5">No activity yet</p>
        </div>
      )}
    </div>
  );
}

// ─── Appointments Tab ────────────────────────────────────────────────────────

function AppointmentsTab({ appointments }: { appointments: Appointment[] }) {
  if (appointments.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-6 text-center">
        <Calendar className="w-5 h-5 text-white/20 mx-auto" />
        <p className="text-[11px] font-bold text-white/40 mt-1.5">No appointments</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {appointments.map((appt) => {
        let dateStr = "";
        try {
          dateStr = format(convertToDate(appt.scheduledAt), "MMM d, yyyy · h:mm a");
        } catch {
          dateStr = "Date unavailable";
        }
        return (
          <div
            key={appt.id}
            className="rounded-xl border border-white/5 bg-sidebar/60 px-3 py-2.5 flex items-center gap-2.5 min-h-[56px]"
          >
            <div
              className={cn(
                "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                appt.status === "completed" || appt.status === "paid"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : appt.status === "canceled" || appt.status === "no_show"
                    ? "bg-rose-500/10 text-rose-400"
                    : "bg-[#0A4DFF]/10 text-[#0A4DFF]",
              )}
            >
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-white truncate leading-tight">
                {appt.serviceNames?.join(", ") || "Appointment"}
              </p>
              <p className="text-[10px] text-white/45 font-medium truncate leading-tight mt-0.5">
                {appt.vehicleInfo || "No vehicle"} · {dateStr}
              </p>
              <span
                className={cn(
                  "inline-block mt-1 text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none",
                  statusColor(appt.status),
                )}
              >
                {appt.status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[12px] font-black text-white tabular-nums">
                {formatCurrency(appt.totalAmount || 0)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Vehicles Tab ────────────────────────────────────────────────────────────

function VehiclesTab({ vehicles }: { vehicles: Vehicle[] }) {
  if (vehicles.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-6 text-center">
        <Car className="w-5 h-5 text-white/20 mx-auto" />
        <p className="text-[11px] font-bold text-white/40 mt-1.5">No vehicles on file</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {vehicles.map((v) => (
        <div
          key={v.id}
          className="rounded-xl border border-white/5 bg-sidebar/60 px-3 py-2.5 flex items-center gap-2.5 min-h-[52px]"
        >
          <div className="shrink-0 w-8 h-8 rounded-lg bg-sky-500/10 ring-1 ring-sky-500/30 flex items-center justify-center">
            <Car className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-white truncate leading-tight">
              {[v.year, v.make, v.model].filter(Boolean).join(" ") || "Unknown Vehicle"}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {v.color && (
                <span className="text-[9px] text-white/45 font-medium">{v.color}</span>
              )}
              {v.size && (
                <span className="text-[8px] font-black uppercase tracking-widest text-white/30 px-1.5 py-0.5 rounded bg-white/5 ring-1 ring-white/10">
                  {v.size}
                </span>
              )}
              {v.vin && (
                <span className="text-[9px] text-white/30 font-mono truncate">VIN: {v.vin}</span>
              )}
            </div>
          </div>
          <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ─── Notes Tab ───────────────────────────────────────────────────────────────

function NotesTab({ notes }: { notes?: string }) {
  if (!notes) {
    return (
      <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-6 text-center">
        <Clipboard className="w-5 h-5 text-white/20 mx-auto" />
        <p className="text-[11px] font-bold text-white/40 mt-1.5">No notes</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-2">
        Internal Notes
      </p>
      <p className="text-[12px] font-medium text-white/70 leading-relaxed whitespace-pre-wrap">{notes}</p>
    </div>
  );
}

// ─── Risk Tab ────────────────────────────────────────────────────────────────

function RiskTab({
  client,
  risk,
}: {
  client: Client;
  risk: ReturnType<typeof getEffectiveRisk>;
}) {
  const riskLabel = getRiskBadgeLabel(risk);
  const isBlocked = risk === "block_booking" || risk === "do_not_book";
  const isElevated = risk === "medium" || risk === "high" || risk === "critical" || isBlocked;

  return (
    <div className="space-y-2.5">
      {/* Risk status card */}
      <div
        className={cn(
          "rounded-xl border px-3 py-3",
          isBlocked
            ? "bg-red-900/20 border-red-700/40"
            : isElevated
              ? "bg-red-500/10 border-red-500/20"
              : "bg-emerald-500/5 border-emerald-500/15",
        )}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
              isBlocked
                ? "bg-red-900/40 text-red-400"
                : isElevated
                  ? "bg-red-500/20 text-red-500"
                  : "bg-emerald-500/15 text-emerald-400",
            )}
          >
            {isElevated ? (
              <ShieldAlert className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-sm font-black uppercase tracking-tight leading-none",
                isElevated ? "text-red-400" : "text-emerald-400",
              )}
            >
              {riskLabel}
            </p>
            <p className="text-[10px] text-white/50 font-medium mt-1 leading-tight">
              {isBlocked && "This account is restricted. Do not book without manager approval."}
              {risk === "high" && "History of no-shows or payment issues. Collect deposit before booking."}
              {risk === "critical" && "Critical risk. Deposit required for all services."}
              {risk === "medium" && "Moderate risk flag. Deposit may be required."}
              {risk === "low" && "Good standing. No risk flags."}
              {!risk && "No risk assessment on file."}
            </p>
          </div>
        </div>
      </div>

      {/* Risk details from client fields */}
      <div className="rounded-xl border border-white/5 bg-sidebar/40 divide-y divide-white/[0.04]">
        <RiskRow label="Risk Level" value={riskLabel} />
        <RiskRow
          label="Deposit Required"
          value={
            risk === "medium" || risk === "high" || risk === "critical" || isBlocked
              ? "Yes"
              : "No"
          }
        />
        <RiskRow
          label="Booking Status"
          value={isBlocked ? "Blocked" : "Allowed"}
        />
        {client.outstandingCancellationFee != null && client.outstandingCancellationFee > 0 && (
          <RiskRow
            label="Outstanding Cancel Fee"
            value={formatCurrency(client.outstandingCancellationFee)}
          />
        )}
        <RiskRow
          label="Payment Method"
          value={client.hasSavedPaymentMethod ? "On File" : "Not Saved"}
        />
      </div>
    </div>
  );
}

function RiskRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 min-h-[40px]">
      <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{label}</span>
      <span className="text-[11px] font-bold text-white">{value}</span>
    </div>
  );
}
