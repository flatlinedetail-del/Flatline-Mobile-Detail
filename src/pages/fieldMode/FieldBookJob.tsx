import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { allocateJobNumber } from "../../services/jobNumberService";
import {
  collection,
  query,
  getDocs,
  addDoc,
  onSnapshot,
  orderBy,
  limit,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../hooks/useAuth";
import { toast } from "sonner";
import {
  getMakesForYear,
  getModelsForMakeYear,
  type VehicleMake,
  type VehicleModel,
} from "../../services/vehicleService";
import { normalizeRiskLevel } from "../../lib/riskUtils";
import { getClientDisplayName } from "@/lib/utils";
import { format } from "date-fns";
import { messagingService } from "../../services/messagingService";
import { syncService } from "../../services/syncService";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Search,
  Car,
  Wrench,
  Calendar,
  FileText,
  CheckCircle2,
  XCircle,
  Plus,
  Minus,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  User,
  UserPlus,
} from "lucide-react";
import type { VehicleSize } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1989 }, (_, i) =>
  String(CURRENT_YEAR + 1 - i)
);

const VEHICLE_SIZES: { value: VehicleSize; label: string }[] = [
  { value: "small", label: "Small (Motorcycle, Compact)" },
  { value: "medium", label: "Medium (Sedan, Crossover)" },
  { value: "large", label: "Large (SUV, Truck)" },
  { value: "extra_large", label: "XL (Van, RV, Semi)" },
];

function defaultScheduledAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

function sectionClass(className?: string) {
  return cn(
    "rounded-xl border border-white/5 bg-sidebar/60 p-3 space-y-3",
    className
  );
}

function labelClass() {
  return "text-[9px] font-black uppercase tracking-[0.2em] text-white/40 leading-none";
}

function inputClass(error?: boolean) {
  return cn(
    "w-full bg-white/[0.06] border rounded-xl px-3 py-2.5",
    "text-[13px] font-medium text-white placeholder-white/25",
    "focus:outline-none focus:ring-1 transition-colors",
    error
      ? "border-rose-500/40 focus:ring-rose-500/30"
      : "border-white/10 focus:ring-white/20"
  );
}

function selectClass() {
  return cn(
    "w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5",
    "text-[13px] font-medium text-white",
    "focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors",
    "appearance-none"
  );
}

// Price for a service given vehicle size
function servicePrice(svc: any, size: VehicleSize): number {
  return svc?.pricingBySize?.[size] ?? svc?.basePrice ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function FieldBookJob() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  // ── Client ────────────────────────────────────────────────────────────────
  const [clientMode, setClientMode] = useState<"existing" | "walkin">("walkin");
  const [clientSearch, setClientSearch] = useState("");
  const [clients, setClients] = useState<any[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  // Walk-in fields
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInEmail, setWalkInEmail] = useState("");

  // ── Vehicle ───────────────────────────────────────────────────────────────
  const [savedVehicles, setSavedVehicles] = useState<any[]>([]);
  const [selectedSavedVehicle, setSelectedSavedVehicle] = useState<any | null>(null);
  const [addingNewVehicle, setAddingNewVehicle] = useState(false);
  // Unified vehicle fields (from saved or new entry)
  const [vYear, setVYear] = useState("");
  const [vMake, setVMake] = useState("");
  const [vModel, setVModel] = useState("");
  const [vSize, setVSize] = useState<VehicleSize>("medium");
  // NHTSA cascades
  const [makes, setMakes] = useState<VehicleMake[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [makesLoading, setMakesLoading] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);

  // ── Services ──────────────────────────────────────────────────────────────
  const [services, setServices] = useState<any[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [servicesOpen, setServicesOpen] = useState(true);

  // ── Date / address / notes ────────────────────────────────────────────────
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  // ── Form meta ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ── Load clients ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (clientMode !== "existing") return;
    setClientsLoading(true);
    const unsub = onSnapshot(
      query(collection(db, "clients"), orderBy("createdAt", "desc"), limit(200)),
      (snap) => {
        setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setClientsLoading(false);
      },
      (err) => {
        console.warn("[FieldBookJob] clients error", err);
        setClientsLoading(false);
      }
    );
    return () => unsub();
  }, [clientMode]);

  // ── Load saved vehicles when existing client is selected ──────────────────
  useEffect(() => {
    if (!selectedClient?.id) {
      setSavedVehicles([]);
      setSelectedSavedVehicle(null);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(db, "vehicles"),
        where("clientId", "==", selectedClient.id)
      ),
      (snap) => {
        const vehicles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSavedVehicles(vehicles);
        // Auto-select first vehicle if only one
        if (vehicles.length === 1 && !selectedSavedVehicle) {
          selectSavedVehicle(vehicles[0]);
        }
      },
      (err) => console.warn("[FieldBookJob] vehicles error", err)
    );
    return () => unsub();
    // selectedSavedVehicle intentionally not in deps — we only auto-select on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient?.id]);

  // ── Load services ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "services"), orderBy("name", "asc")),
      (snap) => setServices(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s: any) => s.isActive !== false)),
      (err) => console.warn("[FieldBookJob] services error", err)
    );
    return () => unsub();
  }, []);

  // ── NHTSA cascade: year → makes ───────────────────────────────────────────
  useEffect(() => {
    if (!vYear || vYear.length !== 4) {
      setMakes([]);
      setModels([]);
      setVMake("");
      setVModel("");
      return;
    }
    let cancelled = false;
    setMakesLoading(true);
    getMakesForYear(vYear).then((result) => {
      if (cancelled) return;
      setMakes(result);
      setMakesLoading(false);
    });
    return () => { cancelled = true; };
  }, [vYear]);

  // ── NHTSA cascade: make → models ──────────────────────────────────────────
  useEffect(() => {
    if (!vYear || !vMake) {
      setModels([]);
      setVModel("");
      return;
    }
    let cancelled = false;
    setModelsLoading(true);
    getModelsForMakeYear(vMake, vYear).then((result) => {
      if (cancelled) return;
      setModels(result);
      setModelsLoading(false);
    });
    return () => { cancelled = true; };
  }, [vYear, vMake]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const selectSavedVehicle = useCallback((v: any) => {
    setSelectedSavedVehicle(v);
    setAddingNewVehicle(false);
    // Auto-populate vehicle fields from saved vehicle
    setVYear(v.year ?? "");
    setVMake(v.make ?? "");
    setVModel(v.model ?? "");
    setVSize((v.size as VehicleSize) ?? "medium");
  }, []);

  const clearSavedVehicle = useCallback(() => {
    setSelectedSavedVehicle(null);
    setVYear("");
    setVMake("");
    setVModel("");
    setVSize("medium");
  }, []);

  const toggleService = useCallback((id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }, []);

  const effectiveVehicleSize: VehicleSize =
    (selectedSavedVehicle?.size as VehicleSize) ?? vSize;

  const filteredClients = useMemo(() => {
    const q = clientSearch.toLowerCase();
    if (!q) return clients.slice(0, 30);
    return clients
      .filter((c) => {
        const name = getClientDisplayName(c).toLowerCase();
        const phone = (c.phone ?? "").toLowerCase();
        return name.includes(q) || phone.includes(q);
      })
      .slice(0, 20);
  }, [clients, clientSearch]);

  const filteredServices = useMemo(() => {
    const q = serviceSearch.toLowerCase();
    if (!q) return services;
    return services.filter((s) =>
      (s.name ?? "").toLowerCase().includes(q)
    );
  }, [services, serviceSearch]);

  const totalAmount = useMemo(() => {
    return selectedServiceIds.reduce((acc, id) => {
      const svc = services.find((s) => s.id === id);
      return acc + servicePrice(svc, effectiveVehicleSize);
    }, 0);
  }, [selectedServiceIds, services, effectiveVehicleSize]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setValidationError(null);

    // ── Validation ──────────────────────────────────────────────────────────
    const clientName =
      clientMode === "existing"
        ? getClientDisplayName(selectedClient)
        : walkInName.trim();
    const clientPhone =
      clientMode === "existing" ? selectedClient?.phone ?? "" : walkInPhone.trim();

    if (!clientName) {
      setValidationError("Client name is required.");
      return;
    }
    if (!clientPhone) {
      setValidationError("Client phone is required.");
      return;
    }
    if (!vYear || !vMake || !vModel) {
      setValidationError("Vehicle year, make, and model are required.");
      return;
    }
    if (selectedServiceIds.length === 0) {
      setValidationError("Select at least one service.");
      return;
    }
    if (!scheduledAt) {
      setValidationError("Date and time are required.");
      return;
    }

    setSaving(true);

    try {
      // ── Job number ─────────────────────────────────────────────────────────
      const apptSnap = await getDocs(
        query(
          collection(db, "appointments"),
          orderBy("createdAt", "desc"),
          limit(100)
        )
      );
      let maxNum = 1000;
      apptSnap.docs.forEach((d) => {
        const jn: string = d.data().jobNum ?? "";
        const m = jn.match(/(\d+)$/);
        if (m) {
          const n = parseInt(m[1]);
          if (n > maxNum) maxNum = n;
        }
      });
      const finalJobNum = `JOB${maxNum + 1}`;

      // ── Resolve / create client ────────────────────────────────────────────
      let finalClientId: string;
      let finalClientEmail = "";

      if (clientMode === "existing" && selectedClient?.id) {
        finalClientId = selectedClient.id;
        finalClientEmail = selectedClient.email ?? "";
      } else {
        // Walk-in: create a new client doc
        const retailTypeSnap = await getDocs(
          query(
            collection(db, "client_types"),
            where("slug", "==", "retail"),
            limit(1)
          )
        );
        const retailTypeId = retailTypeSnap.docs[0]?.id ?? "";
        const nameParts = walkInName.trim().split(/\s+/);
        const newClientDoc = await addDoc(collection(db, "clients"), {
          name: walkInName.trim(),
          firstName: nameParts[0] ?? walkInName.trim(),
          lastName: nameParts.slice(1).join(" "),
          phone: walkInPhone.trim(),
          email: walkInEmail.trim(),
          clientTypeId: retailTypeId,
          categoryIds: [],
          loyaltyPoints: 0,
          membershipLevel: "none",
          isVIP: false,
          isOneTime: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        finalClientId = newClientDoc.id;
        finalClientEmail = walkInEmail.trim();
      }

      // ── Resolve / create vehicle ───────────────────────────────────────────
      let finalVehicleId: string;
      let vehicleInfo: string;

      if (selectedSavedVehicle?.id && !addingNewVehicle) {
        finalVehicleId = selectedSavedVehicle.id;
        vehicleInfo = `${vYear} ${vMake} ${vModel}`.trim();
      } else {
        const newVehicleDoc = await addDoc(collection(db, "vehicles"), {
          clientId: finalClientId,
          ownerId: finalClientId,
          ownerType: "client",
          year: vYear,
          make: vMake,
          model: vModel,
          size: effectiveVehicleSize,
          color: "",
          createdAt: serverTimestamp(),
        });
        finalVehicleId = newVehicleDoc.id;
        vehicleInfo = `${vYear} ${vMake} ${vModel}`.trim();
      }

      // ── Service selections ────────────────────────────────────────────────
      const serviceSelections = selectedServiceIds.map((id) => {
        const svc = services.find((s) => s.id === id);
        const price = servicePrice(svc, effectiveVehicleSize);
        return {
          id,
          name: svc?.name ?? "Service",
          description: svc?.description ?? "",
          vehicleId: finalVehicleId,
          qty: 1,
          price,
          total: price,
          source: "standard" as const,
          protocolAccepted: true,
        };
      });

      const serviceNames = serviceSelections.map((s) => s.name);
      const estimatedDuration = selectedServiceIds.reduce((acc, id) => {
        const svc = services.find((s) => s.id === id);
        return acc + (svc?.estimatedDuration ?? 120);
      }, 0);

      // ── Appointment doc ───────────────────────────────────────────────────
      const startAt = new Date(scheduledAt);
      const appointmentData = {
        clientId: finalClientId,
        customerId: finalClientId,
        customerName: clientName,
        customerPhone: clientPhone,
        customerEmail: finalClientEmail,
        customerType: "client",
        vehicleIds: [finalVehicleId],
        vehicleId: finalVehicleId,
        vehicleNames: [vehicleInfo],
        vehicleInfo,
        address: address.trim(),
        customerAddressId: "",
        addressLabel: "",
        city: "",
        state: "",
        zipCode: "",
        latitude: 0,
        longitude: 0,
        scheduledAt: startAt,
        status: "scheduled",
        jobNum: finalJobNum,
        baseAmount: totalAmount,
        travelFee: 0,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount,
        customFees: [],
        serviceIds: selectedServiceIds,
        serviceNames,
        serviceSelections,
        addOnIds: [],
        addOnNames: [],
        addOnSelections: [],
        technicianId: profile?.uid ?? "",
        technicianName: profile?.displayName ?? "",
        estimatedDuration,
        totalDurationMinutes: estimatedDuration,
        depositRequired: false,
        depositAmount: 0,
        depositPaid: false,
        depositType: "fixed" as const,
        depositReasons: [],
        depositSource: "none" as const,
        clientRiskLevelAtBooking:
          clientMode === "existing"
            ? normalizeRiskLevel(
                selectedClient?.riskLevel ??
                selectedClient?.risk_level ??
                selectedClient?.riskStatus ??
                selectedClient?.clientRiskLevel ??
                selectedClient?.riskManagement?.level
              ) ?? null
            : null,
        paymentStatus: "unpaid",
        completedTasks: {},
        waiverAccepted: false,
        photos: { before: [], after: [], damage: [] },
        notes: notes.trim(),
        bookingIntelligenceActive: true,
        reminders: { confirmation: "pending" },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      try {
        // Best-effort: allocate job number before creating the document.
        // If the counter transaction fails the appointment is still created
        // without a jobNumber; it will be assigned lazily when the job is opened.
        let jobNum = "";
        try { jobNum = await allocateJobNumber(); } catch { /* non-fatal */ }

        const docRef = await addDoc(collection(db, "appointments"), {
          ...appointmentData,
          ...(jobNum ? { jobNumber: jobNum } : {}),
        });

        // Fire-and-forget confirmation messages
        if (finalClientEmail) {
          messagingService
            .sendEmail({
              to: finalClientEmail,
              subject: `Appointment Confirmed: ${clientName}`,
              html: `<p>Hi ${clientName},</p><p>Your appointment has been confirmed for <strong>${format(startAt, "MMMM do, yyyy 'at' h:mm a")}</strong>.</p><p>Thank you!</p>`,
            })
            .catch((e) => console.error("[FieldBookJob] email failed", e));
        }
        if (clientPhone) {
          const serviceText = serviceNames.join(", ") || "service";
          messagingService
            .sendSms({
              to: clientPhone,
              body: `DetailFlow: Confirmed for ${format(startAt, "MMM do")} at ${format(startAt, "h:mm a")} — ${serviceText}. Reply STOP to opt out.`,
            })
            .catch((e) => console.error("[FieldBookJob] sms failed", e));
        }

        toast.success("Booking created!");
        navigate(`/calendar/${docRef.id}`);
      } catch (err) {
        console.warn("[FieldBookJob] direct add failed, enqueuing...", err);
        await syncService.enqueueTask(
          "appointments",
          { ...appointmentData, createdAt: Date.now() },
          "create"
        );
        toast.info("Offline: booking saved locally and will sync.");
        navigate("/calendar");
      }
    } catch (err) {
      console.error("[FieldBookJob] save error", err);
      toast.error("Could not create booking. Check your connection.");
    } finally {
      setSaving(false);
    }
  }, [
    clientMode,
    selectedClient,
    walkInName,
    walkInPhone,
    walkInEmail,
    vYear,
    vMake,
    vModel,
    vSize,
    effectiveVehicleSize,
    selectedSavedVehicle,
    addingNewVehicle,
    selectedServiceIds,
    services,
    scheduledAt,
    address,
    notes,
    totalAmount,
    profile,
    navigate,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3 pb-6">
      {/* Back nav */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      <div className="flex items-baseline gap-2 px-0.5">
        <h1 className="text-base font-black text-white leading-none">Book Job</h1>
        <span className="text-[9px] font-black uppercase tracking-widest text-white/35">
          Walk-In / New
        </span>
      </div>

      {/* ── 1. CLIENT ─────────────────────────────────────────────────────── */}
      <section className={sectionClass()}>
        <div className="flex items-center justify-between">
          <p className={labelClass()}>Client</p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                setClientMode("walkin");
                setSelectedClient(null);
              }}
              className={cn(
                "text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-colors",
                clientMode === "walkin"
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/60"
              )}
            >
              <UserPlus className="w-3 h-3 inline mr-0.5" /> New
            </button>
            <button
              type="button"
              onClick={() => {
                setClientMode("existing");
                setWalkInName("");
                setWalkInPhone("");
                setWalkInEmail("");
              }}
              className={cn(
                "text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-colors",
                clientMode === "existing"
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/60"
              )}
            >
              <User className="w-3 h-3 inline mr-0.5" /> Existing
            </button>
          </div>
        </div>

        {clientMode === "walkin" ? (
          <div className="space-y-2">
            <div className="space-y-1">
              <p className={labelClass()}>Name *</p>
              <input
                type="text"
                autoComplete="name"
                placeholder="Full name"
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                className={inputClass(!walkInName && !!validationError)}
              />
            </div>
            <div className="space-y-1">
              <p className={labelClass()}>Phone *</p>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(555) 000-0000"
                value={walkInPhone}
                onChange={(e) => setWalkInPhone(e.target.value)}
                className={inputClass(!walkInPhone && !!validationError)}
              />
            </div>
            <div className="space-y-1">
              <p className={labelClass()}>Email (optional)</p>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="email@example.com"
                value={walkInEmail}
                onChange={(e) => setWalkInEmail(e.target.value)}
                className={inputClass()}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Search box */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
              <input
                type="search"
                placeholder="Search by name or phone…"
                value={clientSearch}
                onChange={(e) => {
                  setClientSearch(e.target.value);
                  setSelectedClient(null);
                  setSavedVehicles([]);
                  setSelectedSavedVehicle(null);
                }}
                className={cn(inputClass(), "pl-8")}
              />
            </div>

            {/* Selected client chip */}
            {selectedClient && (
              <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-white truncate">
                    {getClientDisplayName(selectedClient)}
                  </p>
                  <p className="text-[10px] text-white/50 truncate">
                    {selectedClient.phone}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClient(null);
                    setSavedVehicles([]);
                    setSelectedSavedVehicle(null);
                    clearSavedVehicle();
                    setClientSearch("");
                  }}
                  className="text-white/40 hover:text-white"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Results list */}
            {!selectedClient && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {clientsLoading && (
                  <div className="flex items-center gap-1.5 py-2 px-1">
                    <div className="w-3 h-3 border border-white/20 border-t-white/50 rounded-full animate-spin" />
                    <span className="text-[10px] text-white/40">Loading…</span>
                  </div>
                )}
                {!clientsLoading && filteredClients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedClient(c);
                      setClientSearch("");
                    }}
                    className="w-full flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.04] hover:bg-white/[0.08] transition-colors px-2.5 py-2"
                  >
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[12px] font-bold text-white truncate">
                        {getClientDisplayName(c)}
                      </p>
                      <p className="text-[10px] text-white/45 truncate">
                        {c.phone}
                      </p>
                    </div>
                  </button>
                ))}
                {!clientsLoading && clientSearch && filteredClients.length === 0 && (
                  <p className="text-[10px] text-white/30 px-1 py-1">No clients found</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── 2. VEHICLE ────────────────────────────────────────────────────── */}
      <section className={sectionClass()}>
        <p className={labelClass()}>Vehicle</p>

        {/* Saved vehicle cards — shown when existing client has vehicles */}
        {savedVehicles.length > 0 && (
          <div>
            <p className="text-[9px] font-bold text-white/40 mb-1.5">
              Saved vehicles — tap to select
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {savedVehicles.map((v) => {
                const isSelected =
                  selectedSavedVehicle?.id === v.id && !addingNewVehicle;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      selectSavedVehicle(v);
                    }}
                    className={cn(
                      "flex-none rounded-xl border px-3 py-2.5 text-left min-w-[110px] transition-colors",
                      isSelected
                        ? "border-sky-500/50 bg-sky-500/15"
                        : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                    )}
                  >
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/50 leading-none">
                      {v.year}
                    </p>
                    <p className="text-[12px] font-bold text-white leading-tight mt-0.5 truncate">
                      {v.make}
                    </p>
                    <p className="text-[10px] text-white/55 leading-none mt-0.5 truncate">
                      {v.model}
                    </p>
                    {isSelected && (
                      <CheckCircle2 className="w-3 h-3 text-sky-400 mt-1" />
                    )}
                  </button>
                );
              })}
              {/* "Add new" card */}
              <button
                type="button"
                onClick={() => {
                  setAddingNewVehicle(true);
                  setSelectedSavedVehicle(null);
                  clearSavedVehicle();
                }}
                className={cn(
                  "flex-none rounded-xl border px-3 py-2.5 text-left min-w-[90px] transition-colors",
                  addingNewVehicle
                    ? "border-violet-500/40 bg-violet-500/15"
                    : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                )}
              >
                <div className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center mb-1">
                  <Plus className="w-3 h-3 text-white/60" />
                </div>
                <p className="text-[10px] font-bold text-white/60">New</p>
              </button>
            </div>
          </div>
        )}

        {/* Vehicle fields — always shown; auto-filled when saved vehicle selected */}
        {(savedVehicles.length === 0 || addingNewVehicle || selectedSavedVehicle) && (
          <div className="space-y-2">
            {/* Year */}
            <div className="space-y-1">
              <p className={labelClass()}>Year *</p>
              <div className="relative">
                <select
                  value={vYear}
                  onChange={(e) => {
                    setVYear(e.target.value);
                    setVMake("");
                    setVModel("");
                    setSelectedSavedVehicle(null);
                  }}
                  disabled={!!(selectedSavedVehicle && !addingNewVehicle)}
                  className={cn(
                    selectClass(),
                    !!(selectedSavedVehicle && !addingNewVehicle) && "opacity-60"
                  )}
                >
                  <option value="">Select year…</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
              </div>
            </div>

            {/* Make */}
            <div className="space-y-1">
              <p className={labelClass()}>
                Make *{makesLoading && (
                  <span className="ml-1 text-white/30">loading…</span>
                )}
              </p>
              <div className="relative">
                <select
                  value={vMake}
                  onChange={(e) => {
                    setVMake(e.target.value);
                    setVModel("");
                    setSelectedSavedVehicle(null);
                  }}
                  disabled={
                    !vYear ||
                    makesLoading ||
                    !!(selectedSavedVehicle && !addingNewVehicle)
                  }
                  className={cn(
                    selectClass(),
                    (!vYear ||
                      makesLoading ||
                      !!(selectedSavedVehicle && !addingNewVehicle)) &&
                      "opacity-60"
                  )}
                >
                  <option value="">Select make…</option>
                  {makes.map((m) => (
                    <option key={m.Make_ID} value={m.Make_Name}>
                      {m.Make_Name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
              </div>
            </div>

            {/* Model */}
            <div className="space-y-1">
              <p className={labelClass()}>
                Model *{modelsLoading && (
                  <span className="ml-1 text-white/30">loading…</span>
                )}
              </p>
              <div className="relative">
                {models.length > 0 ? (
                  <>
                    <select
                      value={vModel}
                      onChange={(e) => {
                        setVModel(e.target.value);
                        setSelectedSavedVehicle(null);
                      }}
                      disabled={
                        !vMake ||
                        modelsLoading ||
                        !!(selectedSavedVehicle && !addingNewVehicle)
                      }
                      className={cn(
                        selectClass(),
                        (!vMake ||
                          modelsLoading ||
                          !!(selectedSavedVehicle && !addingNewVehicle)) &&
                          "opacity-60"
                      )}
                    >
                      <option value="">Select model…</option>
                      {models.map((m) => (
                        <option key={m.Model_ID} value={m.Model_Name}>
                          {m.Model_Name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                  </>
                ) : (
                  <input
                    type="text"
                    placeholder={
                      vMake && !modelsLoading ? "Type model…" : "Select make first"
                    }
                    value={vModel}
                    onChange={(e) => {
                      setVModel(e.target.value);
                      setSelectedSavedVehicle(null);
                    }}
                    disabled={
                      !vMake || !!(selectedSavedVehicle && !addingNewVehicle)
                    }
                    className={cn(
                      inputClass(),
                      (!vMake ||
                        !!(selectedSavedVehicle && !addingNewVehicle)) &&
                        "opacity-60"
                    )}
                  />
                )}
              </div>
            </div>

            {/* Size */}
            <div className="space-y-1">
              <p className={labelClass()}>Vehicle Size</p>
              <div className="relative">
                <select
                  value={effectiveVehicleSize}
                  onChange={(e) => {
                    setVSize(e.target.value as VehicleSize);
                    if (selectedSavedVehicle && !addingNewVehicle) {
                      // Allow size override even with saved vehicle
                    }
                  }}
                  className={selectClass()}
                >
                  {VEHICLE_SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 3. SERVICES ───────────────────────────────────────────────────── */}
      <section className={sectionClass()}>
        <button
          type="button"
          onClick={() => setServicesOpen((v) => !v)}
          className="w-full flex items-center justify-between"
        >
          <p className={labelClass()}>
            Services{" "}
            {selectedServiceIds.length > 0 && (
              <span className="text-white/60 normal-case font-bold tracking-normal">
                · {selectedServiceIds.length} selected
              </span>
            )}
          </p>
          {servicesOpen ? (
            <ChevronUp className="w-3 h-3 text-white/30" />
          ) : (
            <ChevronDown className="w-3 h-3 text-white/30" />
          )}
        </button>

        {servicesOpen && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
              <input
                type="search"
                placeholder="Search services…"
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                className={cn(inputClass(), "pl-8")}
              />
            </div>

            <div className="space-y-1 max-h-52 overflow-y-auto">
              {filteredServices.map((svc) => {
                const selected = selectedServiceIds.includes(svc.id);
                const price = servicePrice(svc, effectiveVehicleSize);
                return (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => toggleService(svc.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors text-left",
                      selected
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-white/5 bg-white/[0.03] hover:bg-white/[0.07]"
                    )}
                  >
                    <div
                      className={cn(
                        "shrink-0 w-5 h-5 rounded-md flex items-center justify-center",
                        selected
                          ? "bg-emerald-500/30"
                          : "bg-white/5"
                      )}
                    >
                      {selected ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Plus className="w-3 h-3 text-white/30" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-white truncate">
                        {svc.name}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold text-white/60 shrink-0">
                      ${price.toFixed(0)}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedServiceIds.length > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  Estimate
                </span>
                <span className="text-[13px] font-black text-white">
                  ${totalAmount.toFixed(2)}
                </span>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── 4. DATE & TIME ────────────────────────────────────────────────── */}
      <section className={sectionClass()}>
        <p className={labelClass()}>Date & Time *</p>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className={cn(inputClass(), "pl-9")}
          />
        </div>
      </section>

      {/* ── 5. ADDRESS ────────────────────────────────────────────────────── */}
      <section className={sectionClass()}>
        <p className={labelClass()}>Address (optional)</p>
        <input
          type="text"
          autoComplete="street-address"
          placeholder="Job location address…"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className={inputClass()}
        />
      </section>

      {/* ── 6. NOTES ──────────────────────────────────────────────────────── */}
      <section className={sectionClass()}>
        <p className={labelClass()}>Notes (optional)</p>
        <textarea
          rows={3}
          placeholder="Special instructions, paint correction level, customer notes…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={cn(inputClass(), "resize-none")}
        />
      </section>

      {/* ── VALIDATION ERROR ──────────────────────────────────────────────── */}
      {validationError && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2.5 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-rose-300 leading-tight">{validationError}</p>
        </div>
      )}

      {/* ── SUBMIT ────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className={cn(
          "w-full rounded-2xl px-4 py-4 min-h-[56px]",
          "bg-[#0A4DFF] hover:bg-[#0A4DFF]/90 active:bg-[#0A4DFF]/80",
          "text-white font-black text-[14px] uppercase tracking-wide",
          "transition-all active:scale-[0.98]",
          "flex items-center justify-center gap-2",
          saving && "opacity-60 pointer-events-none"
        )}
      >
        {saving ? (
          <>
            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Creating…
          </>
        ) : (
          <>
            <Wrench className="w-4 h-4" />
            Create Booking
          </>
        )}
      </button>
    </div>
  );
}
