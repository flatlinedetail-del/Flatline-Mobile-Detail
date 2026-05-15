import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../hooks/useAuth";
import { useClientsLive } from "../../hooks/useClientsLive";
import type { FieldClient } from "../../services/fieldClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Car,
  Check,
  ChevronRight,
  Loader2,
  MapPin,
  Search,
  User,
  Wrench,
  X,
} from "lucide-react";
import { format, addHours, startOfHour } from "date-fns";

/**
 * Phone-only mobile booking wizard. Renders at `/field/book-job` for
 * phone users. Desktop / tablet continue to use the full BookAppointment
 * page at `/book-appointment`.
 *
 * Five steps: Client → Vehicle → Services → Schedule + Address → Review.
 *
 * Writes to the SAME `appointments` collection as BookAppointment.tsx —
 * no duplicate schema, no divergence.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;

interface ServiceDoc {
  id: string;
  name: string;
  basePrice: number;
  category?: string;
  isActive?: boolean;
  estimatedDuration?: number;
}

interface VehicleDoc {
  id: string;
  year?: string;
  make: string;
  model: string;
  color?: string;
  size?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Default to the top of the next hour from now. */
function defaultScheduledAt(): string {
  const next = addHours(startOfHour(new Date()), 1);
  // datetime-local value format: "YYYY-MM-DDTHH:mm"
  return format(next, "yyyy-MM-dd'T'HH:mm");
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

// ─── Step indicator ──────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: Step; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-1 rounded-full transition-all",
            i + 1 === current
              ? "w-4 bg-[#0A4DFF]"
              : i + 1 < current
              ? "w-2 bg-[#0A4DFF]/40"
              : "w-2 bg-white/15",
          )}
        />
      ))}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function FieldBookJob() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();

  // ── Step state ──
  const [step, setStep] = useState<Step>(1);

  // ── Step 1: Client ──
  const { clients, loading: clientsLoading } = useClientsLive(100);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<FieldClient | null>(null);
  const [isWalkIn, setIsWalkIn] = useState(false);

  // ── Step 2: Vehicle ──
  const [clientVehicles, setClientVehicles] = useState<VehicleDoc[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");

  // ── Step 3: Services ──
  const [allServices, setAllServices] = useState<ServiceDoc[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [serviceSearch, setServiceSearch] = useState("");

  // ── Step 4: Schedule + Address ──
  const [scheduledAtValue, setScheduledAtValue] = useState(defaultScheduledAt);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  // ── Step 5: Submit ──
  const [saving, setSaving] = useState(false);

  // ─── Pre-fill from URL params (e.g. from FieldClients) ─────────────────────
  useEffect(() => {
    const prefillClientId = searchParams.get("clientId");
    if (prefillClientId && clients.length > 0) {
      const match = clients.find((c) => c.id === prefillClientId);
      if (match) {
        setSelectedClient(match);
        // Skip straight to step 2 if client is already chosen
        setStep(2);
      }
    }
  }, [searchParams, clients]);

  // ─── Load all services once on mount ───────────────────────────────────────
  useEffect(() => {
    getDocs(collection(db, "services"))
      .then((snap) => {
        const docs: ServiceDoc[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ServiceDoc, "id">) }))
          .filter((s) => s.isActive !== false)
          .sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name));
        setAllServices(docs);
      })
      .catch(() => toast.error("Couldn't load services"))
      .finally(() => setServicesLoading(false));
  }, []);

  // ─── Load vehicles when a client is selected ────────────────────────────────
  useEffect(() => {
    if (!selectedClient) {
      setClientVehicles([]);
      setSelectedVehicleId(null);
      return;
    }
    setVehiclesLoading(true);
    const q = query(
      collection(db, "vehicles"),
      where("clientId", "==", selectedClient.id),
    );
    // One-shot read — vehicles don't update mid-booking
    getDocs(q)
      .then((snap) => {
        const docs: VehicleDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<VehicleDoc, "id">),
        }));
        setClientVehicles(docs);
      })
      .catch(() => {/* silently ignore — manual entry still works */})
      .finally(() => setVehiclesLoading(false));
  }, [selectedClient]);

  // ─── Derived values ─────────────────────────────────────────────────────────

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.trim().toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.businessName ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
    );
  }, [clients, clientSearch]);

  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return allServices;
    const q = serviceSearch.trim().toLowerCase();
    return allServices.filter((s) => s.name.toLowerCase().includes(q));
  }, [allServices, serviceSearch]);

  const selectedServices = useMemo(
    () => allServices.filter((s) => selectedServiceIds.includes(s.id)),
    [allServices, selectedServiceIds],
  );

  const estimatedTotal = useMemo(
    () => selectedServices.reduce((sum, s) => sum + (s.basePrice ?? 0), 0),
    [selectedServices],
  );

  /** Resolved vehicle string for display and Firestore write */
  const vehicleInfo = useMemo(() => {
    if (selectedVehicleId) {
      const v = clientVehicles.find((v) => v.id === selectedVehicleId);
      if (v) return [v.year, v.make, v.model].filter(Boolean).join(" ");
    }
    return [vehicleYear, vehicleMake, vehicleModel].filter(Boolean).join(" ");
  }, [selectedVehicleId, clientVehicles, vehicleYear, vehicleMake, vehicleModel]);

  // ─── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const scheduledDate = new Date(scheduledAtValue);
      if (isNaN(scheduledDate.getTime())) {
        toast.error("Please choose a valid date and time.");
        setSaving(false);
        return;
      }

      const clientName = isWalkIn
        ? "Walk-in"
        : selectedClient?.name ?? "Walk-in";

      await addDoc(collection(db, "appointments"), {
        // Client
        clientId:       selectedClient?.id ?? null,
        customerId:     selectedClient?.id ?? null,
        customerName:   clientName,
        customerPhone:  selectedClient?.phone ?? "",
        customerEmail:  selectedClient?.email ?? "",
        customerType:   selectedClient ? "client" : "walk_in",
        // Vehicle
        vehicleInfo:    vehicleInfo,
        vehicleId:      selectedVehicleId ?? null,
        vehicleIds:     selectedVehicleId ? [selectedVehicleId] : [],
        vehicleNames:   vehicleInfo ? [vehicleInfo] : [],
        // Services
        serviceIds:     selectedServiceIds,
        serviceNames:   selectedServices.map((s) => s.name),
        // Schedule
        scheduledAt:    scheduledDate,
        status:         "scheduled",
        // Location
        address:        address,
        // Pricing
        baseAmount:     estimatedTotal,
        totalAmount:    estimatedTotal,
        travelFee:      0,
        discountAmount: 0,
        // Staff
        technicianId:   profile?.uid ?? "",
        technicianName: profile?.displayName ?? "",
        // Notes
        notes:          notes,
        // Timestamps
        createdAt:      serverTimestamp(),
        updatedAt:      serverTimestamp(),
        // Field booking source marker
        bookedViaFieldMode: true,
      });

      toast.success("Job booked!");
      navigate("/");
    } catch (err) {
      console.error("[FieldBookJob] submit error", err);
      toast.error("Couldn't save the booking — please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Navigation helpers ─────────────────────────────────────────────────────

  const goBack = () => {
    if (step === 1) navigate(-1);
    else setStep((s) => (s - 1) as Step);
  };

  const goNext = () => setStep((s) => (s + 1) as Step);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={goBack}
          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/[0.04] transition-colors flex items-center justify-center shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-black text-white leading-none">Book Job</h1>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mt-0.5">
            {step === 1 && "Choose client"}
            {step === 2 && "Vehicle"}
            {step === 3 && "Services"}
            {step === 4 && "Date, time & location"}
            {step === 5 && "Review & confirm"}
          </p>
        </div>
        <StepDots current={step} total={5} />
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* STEP 1 — CLIENT                                                     */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
            <input
              type="text"
              placeholder="Search clients…"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-[12px] text-white placeholder:text-white/30 focus:outline-none focus:border-[#0A4DFF]/50 focus:bg-white/[0.07] transition-colors"
            />
          </div>

          {/* Walk-in option */}
          <button
            type="button"
            onClick={() => {
              setSelectedClient(null);
              setIsWalkIn(true);
              goNext();
            }}
            className="w-full flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-2.5 py-2.5 min-h-[48px]"
          >
            <div className="shrink-0 w-8 h-8 rounded-md bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
              <User className="w-4 h-4 text-white/50" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[12px] font-bold text-white leading-tight">Walk-in / New client</p>
              <p className="text-[10px] text-white/40 leading-tight mt-0.5">Book without a client profile</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-white/25 shrink-0" />
          </button>

          {/* Client list */}
          {clientsLoading ? (
            <div className="flex items-center justify-center py-6 gap-2">
              <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Loading clients…</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredClients.length === 0 && clientSearch && (
                <p className="text-[11px] text-white/40 text-center py-4">No clients match "{clientSearch}"</p>
              )}
              {filteredClients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedClient(c);
                    setIsWalkIn(false);
                    goNext();
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl border border-white/5 bg-sidebar/50 hover:bg-sidebar/80 active:bg-sidebar transition-colors px-2.5 py-2 min-h-[48px]"
                >
                  <div className="shrink-0 w-8 h-8 rounded-md bg-[#0A4DFF]/10 ring-1 ring-[#0A4DFF]/20 flex items-center justify-center">
                    <span className="text-[11px] font-black text-[#0A4DFF] uppercase leading-none">
                      {c.name.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[12px] font-bold text-white truncate leading-tight">{c.name}</p>
                    {c.phone && (
                      <p className="text-[10px] text-white/40 truncate leading-tight mt-0.5">{c.phone}</p>
                    )}
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-white/25 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* STEP 2 — VEHICLE                                                    */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-3">
          {/* Selected client chip */}
          {selectedClient && (
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-[#0A4DFF]/10 border border-[#0A4DFF]/20">
              <User className="w-3.5 h-3.5 text-[#0A4DFF] shrink-0" />
              <p className="text-[11px] font-bold text-[#0A4DFF] truncate">{selectedClient.name}</p>
            </div>
          )}

          {/* Client's existing vehicles */}
          {vehiclesLoading ? (
            <div className="flex items-center justify-center py-6 gap-2">
              <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Loading vehicles…</span>
            </div>
          ) : clientVehicles.length > 0 ? (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 px-0.5">
                Client vehicles
              </p>
              <div className="space-y-1.5">
                {clientVehicles.map((v) => {
                  const label = [v.year, v.make, v.model].filter(Boolean).join(" ");
                  const isSelected = selectedVehicleId === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVehicleId(isSelected ? null : v.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-xl border px-2.5 py-2.5 min-h-[48px] transition-colors",
                        isSelected
                          ? "border-[#0A4DFF]/40 bg-[#0A4DFF]/10"
                          : "border-white/5 bg-sidebar/50 hover:bg-sidebar/80",
                      )}
                    >
                      <div className={cn(
                        "shrink-0 w-8 h-8 rounded-md flex items-center justify-center ring-1",
                        isSelected
                          ? "bg-[#0A4DFF]/20 ring-[#0A4DFF]/40"
                          : "bg-white/10 ring-white/15",
                      )}>
                        <Car className={cn("w-4 h-4", isSelected ? "text-[#0A4DFF]" : "text-white/50")} />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className={cn("text-[12px] font-bold truncate leading-tight", isSelected ? "text-[#0A4DFF]" : "text-white")}>
                          {label || "Unknown vehicle"}
                        </p>
                        {v.color && (
                          <p className="text-[10px] text-white/40 leading-tight mt-0.5">{v.color}</p>
                        )}
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#0A4DFF] shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 px-0.5 pt-1">
                Or enter manually
              </p>
            </>
          ) : null}

          {/* Manual vehicle entry */}
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Year"
                value={vehicleYear}
                onChange={(e) => { setVehicleYear(e.target.value); setSelectedVehicleId(null); }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-[12px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A4DFF]/50 transition-colors"
              />
              <input
                type="text"
                placeholder="Make*"
                value={vehicleMake}
                onChange={(e) => { setVehicleMake(e.target.value); setSelectedVehicleId(null); }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-[12px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A4DFF]/50 transition-colors"
              />
              <input
                type="text"
                placeholder="Model*"
                value={vehicleModel}
                onChange={(e) => { setVehicleModel(e.target.value); setSelectedVehicleId(null); }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-[12px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A4DFF]/50 transition-colors"
              />
            </div>
            <p className="text-[9px] text-white/30 px-0.5">* Required if not selecting a saved vehicle</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={goNext}
              disabled={!selectedVehicleId && !vehicleMake && !vehicleModel}
              className="flex-1 h-11 rounded-xl bg-[#0A4DFF] text-white text-[12px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0A4DFF]/90 active:bg-[#0A4DFF]/80 transition-colors"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={goNext}
              className="px-4 h-11 rounded-xl bg-white/5 border border-white/10 text-white/50 text-[11px] font-bold hover:bg-white/10 active:bg-white/[0.04] transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* STEP 3 — SERVICES                                                   */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
            <input
              type="text"
              placeholder="Search services…"
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-[12px] text-white placeholder:text-white/30 focus:outline-none focus:border-[#0A4DFF]/50 transition-colors"
            />
          </div>

          {/* Selected summary */}
          {selectedServiceIds.length > 0 && (
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <p className="text-[11px] font-bold text-emerald-300 flex-1">
                {selectedServiceIds.length} service{selectedServiceIds.length !== 1 ? "s" : ""} · {fmtCurrency(estimatedTotal)}
              </p>
            </div>
          )}

          {/* Service list */}
          {servicesLoading ? (
            <div className="flex items-center justify-center py-6 gap-2">
              <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Loading services…</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredServices.length === 0 && (
                <p className="text-[11px] text-white/40 text-center py-4">No services found</p>
              )}
              {filteredServices.map((s) => {
                const isSelected = selectedServiceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setSelectedServiceIds((prev) =>
                        isSelected ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                      )
                    }
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-xl border px-2.5 py-2.5 min-h-[48px] transition-colors",
                      isSelected
                        ? "border-[#0A4DFF]/40 bg-[#0A4DFF]/10"
                        : "border-white/5 bg-sidebar/50 hover:bg-sidebar/80",
                    )}
                  >
                    <div className={cn(
                      "shrink-0 w-8 h-8 rounded-md flex items-center justify-center ring-1",
                      isSelected ? "bg-[#0A4DFF]/20 ring-[#0A4DFF]/40" : "bg-white/10 ring-white/15",
                    )}>
                      <Wrench className={cn("w-3.5 h-3.5", isSelected ? "text-[#0A4DFF]" : "text-white/50")} />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className={cn("text-[12px] font-bold truncate leading-tight", isSelected ? "text-[#0A4DFF]" : "text-white")}>
                        {s.name}
                      </p>
                      <p className="text-[10px] text-white/40 leading-tight mt-0.5">
                        {fmtCurrency(s.basePrice)}
                        {s.estimatedDuration ? ` · ${s.estimatedDuration} min` : ""}
                      </p>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#0A4DFF] shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={goNext}
              className="flex-1 h-11 rounded-xl bg-[#0A4DFF] text-white text-[12px] font-black uppercase tracking-widest hover:bg-[#0A4DFF]/90 active:bg-[#0A4DFF]/80 transition-colors"
            >
              {selectedServiceIds.length > 0 ? "Continue" : "Skip"}
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* STEP 4 — SCHEDULE + LOCATION                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {step === 4 && (
        <div className="space-y-3">
          {/* Date + time */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />
              Date & Time *
            </label>
            <input
              type="datetime-local"
              value={scheduledAtValue}
              onChange={(e) => setScheduledAtValue(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-[12px] text-white focus:outline-none focus:border-[#0A4DFF]/50 transition-colors [color-scheme:dark]"
            />
          </div>

          {/* Address */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5">
              <MapPin className="w-3 h-3" />
              Job Location
            </label>
            <input
              type="text"
              placeholder="e.g. 123 Main St, Austin, TX"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-[12px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A4DFF]/50 transition-colors"
            />
            {selectedClient?.address && !address && (
              <button
                type="button"
                onClick={() => setAddress(selectedClient!.address!)}
                className="text-[10px] text-[#0A4DFF] font-bold hover:underline"
              >
                Use client's address: {selectedClient.address}
              </button>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-white/40">
              Notes
            </label>
            <textarea
              placeholder="Any special instructions…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-[12px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A4DFF]/50 transition-colors resize-none"
            />
          </div>

          {/* Continue */}
          <button
            type="button"
            onClick={goNext}
            disabled={!scheduledAtValue}
            className="w-full h-11 rounded-xl bg-[#0A4DFF] text-white text-[12px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0A4DFF]/90 active:bg-[#0A4DFF]/80 transition-colors"
          >
            Review Booking
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* STEP 5 — REVIEW + SUBMIT                                            */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {step === 5 && (
        <div className="space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 px-0.5">
            Booking summary
          </p>

          {/* Summary card */}
          <div className="rounded-xl border border-white/5 bg-white/[0.03] divide-y divide-white/[0.05] overflow-hidden">
            {/* Client */}
            <SummaryRow
              label="Client"
              value={isWalkIn ? "Walk-in" : (selectedClient?.name ?? "—")}
            />
            {/* Vehicle */}
            <SummaryRow
              label="Vehicle"
              value={vehicleInfo || "Not specified"}
            />
            {/* Services */}
            <SummaryRow
              label={`Services (${selectedServiceIds.length})`}
              value={
                selectedServices.length > 0
                  ? selectedServices.map((s) => s.name).join(", ")
                  : "None selected"
              }
            />
            {/* Date/time */}
            <SummaryRow
              label="Scheduled"
              value={
                scheduledAtValue
                  ? format(new Date(scheduledAtValue), "EEE, MMM d, yyyy 'at' h:mm a")
                  : "—"
              }
            />
            {/* Address */}
            {address && <SummaryRow label="Location" value={address} />}
            {/* Notes */}
            {notes && <SummaryRow label="Notes" value={notes} />}
          </div>

          {/* Price */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-3 flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-300">Estimated total</span>
            <span className="text-[16px] font-black text-white">{fmtCurrency(estimatedTotal)}</span>
          </div>

          <p className="text-[9px] text-white/30 text-center leading-tight px-2">
            Base price only — travel fees, add-ons, and discounts can be
            adjusted in the full job detail.
          </p>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="w-full h-12 rounded-xl bg-[#0A4DFF] text-white text-[13px] font-black uppercase tracking-widest disabled:opacity-50 hover:bg-[#0A4DFF]/90 active:bg-[#0A4DFF]/80 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Booking…
              </>
            ) : (
              "Confirm Booking"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Summary row ─────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 px-3 py-2.5">
      <span className="text-[9px] font-black uppercase tracking-widest text-white/35 w-20 shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-[11px] font-medium text-white/80 flex-1 leading-tight break-words">
        {value}
      </span>
    </div>
  );
}
