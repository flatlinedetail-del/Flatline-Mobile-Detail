import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { cn } from "@/lib/utils";
import {
  generateServiceTimingIntelligence,
  type DueStatus,
  type ServiceTimingOutput,
} from "../../services/serviceTimingEngine";
import type { Appointment, Service, Vehicle } from "../../types";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Sparkles,
  Wrench,
} from "lucide-react";

/**
 * Phone-only Service Timing Intelligence screen.
 *
 * Mounted at `/field/intelligence/:id` where `:id` is an appointment ID.
 * Loads the appointment → resolves the client → fetches their vehicles +
 * service history → runs `generateServiceTimingIntelligence` → renders
 * stacked cards showing which services are Due, Overdue, or Due Soon for
 * each vehicle.
 *
 * Does NOT touch the desktop JobDetail or any AI-generation endpoints —
 * this is purely the deterministic service-interval engine. A "Full AI
 * Analysis" link opens `/calendar/:id` for the complete desktop panel.
 */

// ─── Due-status styling ───────────────────────────────────────────────────────

function statusStyle(status: DueStatus): {
  badge: string;
  card: string;
  icon: string;
} {
  switch (status) {
    case "Overdue":
      return {
        badge: "bg-rose-500/20 text-rose-300 ring-rose-500/30",
        card:  "border-rose-500/20 bg-rose-500/[0.04]",
        icon:  "text-rose-400",
      };
    case "Due":
      return {
        badge: "bg-amber-500/20 text-amber-300 ring-amber-500/30",
        card:  "border-amber-500/20 bg-amber-500/[0.04]",
        icon:  "text-amber-400",
      };
    case "Due Soon":
      return {
        badge: "bg-sky-500/20 text-sky-300 ring-sky-500/30",
        card:  "border-sky-500/20 bg-sky-500/[0.04]",
        icon:  "text-sky-400",
      };
    case "Current":
      return {
        badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
        card:  "border-white/5 bg-sidebar/40",
        icon:  "text-emerald-400",
      };
    default: // Never Performed
      return {
        badge: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
        card:  "border-violet-500/15 bg-violet-500/[0.04]",
        icon:  "text-violet-400",
      };
  }
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  }).format(d);
}

// ─── Loading placeholder ──────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-3 space-y-2 animate-pulse">
      <div className="h-3 w-32 rounded bg-white/10" />
      <div className="h-2.5 w-24 rounded bg-white/[0.06]" />
    </div>
  );
}

// ─── Intelligence card ────────────────────────────────────────────────────────

function TimingCard({
  item,
  clientId,
}: {
  item: ServiceTimingOutput;
  clientId: string;
}) {
  const navigate = useNavigate();
  const style = statusStyle(item.dueStatus);
  const isActionable =
    item.dueStatus === "Overdue" ||
    item.dueStatus === "Due" ||
    item.dueStatus === "Due Soon" ||
    item.dueStatus === "Never Performed";

  return (
    <div className={cn("rounded-xl border px-3 py-3 space-y-2", style.card)}>
      {/* Header row */}
      <div className="flex items-start gap-2.5">
        <div className={cn("shrink-0 w-8 h-8 rounded-md bg-white/5 ring-1 ring-white/10 flex items-center justify-center mt-0.5")}>
          <Wrench className={cn("w-3.5 h-3.5", style.icon)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold text-white truncate leading-tight">
            {item.serviceName}
          </p>
          <p className="text-[10px] text-white/45 truncate leading-tight mt-0.5">
            {item.vehicleName}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none",
            style.badge,
          )}
        >
          {item.dueStatus}
        </span>
      </div>

      {/* Date rows */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg bg-black/20 px-2 py-1.5">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Last done</p>
          <p className="text-[10px] font-bold text-white/70 mt-0.5">{fmtDate(item.lastCompletedDate)}</p>
        </div>
        <div className="rounded-lg bg-black/20 px-2 py-1.5">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Next due</p>
          <p className={cn("text-[10px] font-bold mt-0.5", isActionable ? "text-white" : "text-white/70")}>
            {fmtDate(item.nextDueDate)}
          </p>
        </div>
      </div>

      {/* Quick Book button — only for actionable statuses */}
      {isActionable && (
        <button
          type="button"
          onClick={() =>
            navigate(
              `/field/book-job?clientId=${encodeURIComponent(clientId)}`,
            )
          }
          className="w-full h-8 rounded-lg bg-[#0A4DFF]/20 border border-[#0A4DFF]/30 text-[#0A4DFF] text-[10px] font-black uppercase tracking-widest hover:bg-[#0A4DFF]/30 active:bg-[#0A4DFF]/10 transition-colors"
        >
          Quick Book
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FieldBookingIntelligence() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Raw Firestore data
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [pastAppointments, setPastAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  // Loading / error state
  const [apptLoading, setApptLoading]   = useState(true);
  const [dataLoading, setDataLoading]   = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // ── Load appointment ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return;
    const unsub = onSnapshot(
      doc(db, "appointments", jobId),
      (snap) => {
        if (snap.exists()) {
          setAppointment({ id: snap.id, ...(snap.data() as Omit<Appointment, "id">) });
        } else {
          setError("Appointment not found.");
        }
        setApptLoading(false);
      },
      (err) => {
        console.warn("[FieldBookingIntelligence] appointment error", err);
        setError(err.message || "Failed to load appointment.");
        setApptLoading(false);
      },
    );
    return () => unsub();
  }, [jobId]);

  // ── Once we have a clientId, load vehicles + history + services ───────────
  useEffect(() => {
    const clientId = appointment?.clientId;
    if (!clientId) return;

    setDataLoading(true);

    const vehiclesQ = query(
      collection(db, "vehicles"),
      where("clientId", "==", clientId),
    );
    const historyQ = query(
      collection(db, "appointments"),
      where("clientId", "==", clientId),
      where("status", "in", ["completed", "paid"]),
    );

    Promise.all([
      getDocs(vehiclesQ),
      getDocs(historyQ),
      getDocs(collection(db, "services")),
    ])
      .then(([vehicleSnap, historySnap, servicesSnap]) => {
        setVehicles(
          vehicleSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Vehicle, "id">) })),
        );
        setPastAppointments(
          historySnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Appointment, "id">) })),
        );
        setServices(
          servicesSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Service, "id">) }))
            .filter((s) => s.maintenanceIntervalDays || s.maintenanceIntervalMonths),
        );
      })
      .catch((err) => {
        console.warn("[FieldBookingIntelligence] data error", err);
        setError(err.message || "Failed to load client data.");
      })
      .finally(() => setDataLoading(false));
  }, [appointment?.clientId]);

  // ── Run service timing engine ─────────────────────────────────────────────
  const timingResults = useMemo<ServiceTimingOutput[]>(() => {
    if (!vehicles.length || !services.length) return [];
    return generateServiceTimingIntelligence(vehicles, pastAppointments, services);
  }, [vehicles, pastAppointments, services]);

  // ── Sort: Overdue → Due → Due Soon → Never Performed → Current ───────────
  const sortedResults = useMemo(() => {
    const order: Record<DueStatus, number> = {
      Overdue:          0,
      Due:              1,
      "Due Soon":       2,
      "Never Performed": 3,
      Current:          4,
    };
    return [...timingResults].sort(
      (a, b) => order[a.dueStatus] - order[b.dueStatus],
    );
  }, [timingResults]);

  const actionableCount = useMemo(
    () =>
      sortedResults.filter(
        (r) =>
          r.dueStatus === "Overdue" ||
          r.dueStatus === "Due" ||
          r.dueStatus === "Due Soon",
      ).length,
    [sortedResults],
  );

  const clientId = appointment?.clientId ?? "";

  const isLoading = apptLoading || dataLoading;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/[0.04] transition-colors flex items-center justify-center shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-black text-white leading-none">Service Intelligence</h1>
          {appointment?.customerName && (
            <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mt-0.5 truncate">
              {appointment.customerName}
            </p>
          )}
        </div>
        <div className="shrink-0 w-8 h-8 rounded-md bg-violet-500/15 ring-1 ring-violet-500/30 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-violet-300" />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-300">Couldn't load intelligence</p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words">{error}</p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !error && (
        <div className="space-y-2">
          {[1, 2, 3].map((n) => <CardSkeleton key={n} />)}
        </div>
      )}

      {/* No vehicles or no interval services */}
      {!isLoading && !error && sortedResults.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-6 text-center space-y-1.5">
          <CheckCircle2 className="w-6 h-6 text-white/20 mx-auto" />
          <p className="text-[11px] font-bold text-white/60">
            {vehicles.length === 0
              ? "No vehicles on file for this client."
              : "No scheduled maintenance services found."}
          </p>
          <p className="text-[9px] text-white/30">
            {vehicles.length === 0
              ? "Add vehicles to the client profile to see service timing."
              : "Enable maintenance intervals on services in Settings to track due dates."}
          </p>
        </div>
      )}

      {/* Summary banner */}
      {!isLoading && !error && sortedResults.length > 0 && (
        <div className={cn(
          "rounded-xl border px-3 py-2.5 flex items-center gap-2.5",
          actionableCount > 0
            ? "border-amber-500/20 bg-amber-500/[0.06]"
            : "border-emerald-500/20 bg-emerald-500/[0.05]",
        )}>
          {actionableCount > 0 ? (
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={cn("text-[11px] font-bold leading-tight", actionableCount > 0 ? "text-amber-200" : "text-emerald-300")}>
              {actionableCount > 0
                ? `${actionableCount} service${actionableCount !== 1 ? "s" : ""} need attention`
                : "All services are current"}
            </p>
            <p className="text-[9px] text-white/40 mt-0.5">
              {sortedResults.length} service{sortedResults.length !== 1 ? "s" : ""} tracked
              across {vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      )}

      {/* Intelligence cards */}
      {!isLoading && sortedResults.length > 0 && (
        <div className="space-y-2">
          {sortedResults.map((item) => (
            <TimingCard
              key={`${item.vehicleId}-${item.serviceId}`}
              item={item}
              clientId={clientId}
            />
          ))}
        </div>
      )}

      {/* Revenue upsell note — runs natively inside the Active Job screen */}
      {!apptLoading && (
        <div className="rounded-xl border border-white/5 bg-sidebar/30 px-3 py-2.5 flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 text-violet-400/60 shrink-0 mt-0.5" />
          <p className="text-[9px] text-white/35 font-medium leading-snug">
            Revenue optimization and upsell recommendations run automatically
            inside the <strong className="text-white/50">Active Job</strong> screen
            for this appointment.
          </p>
        </div>
      )}
    </div>
  );
}
