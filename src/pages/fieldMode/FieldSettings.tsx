import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { installDetailFlowServices, installDetailFlowAddOns } from "../../services/seedData";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  CreditCard,
  ExternalLink,
  HelpCircle,
  LogOut,
  MessageSquare,
  Monitor as MonitorIcon,
  Package,
  Shield,
  Users,
  Calendar,
  FileText,
  Zap,
  Brain,
  MapPin,
  RefreshCw,
  Clock,
  Loader2,
  Wrench,
  Plus,
  CheckCircle,
  XCircle,
  DatabaseZap,
  Palette,
  Star,
  Settings,
} from "lucide-react";

// ─── helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function roleBadgeClass(role: string | null | undefined): string {
  switch (role) {
    case "owner":     return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    case "admin":     return "bg-violet-500/15 text-violet-300 ring-violet-500/30";
    case "manager":   return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "technician":return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    default:          return "bg-white/10 text-white/60 ring-white/15";
  }
}

// ─── shared primitives ────────────────────────────────────────────────────────

function Row({
  icon,
  iconColor = "text-white/50",
  iconBg = "bg-white/10 ring-white/15",
  label,
  sub,
  onClick,
  comingSoon = false,
  external = false,
}: {
  icon: React.ReactNode;
  iconColor?: string;
  iconBg?: string;
  label: string;
  sub?: string;
  onClick?: () => void;
  comingSoon?: boolean;
  external?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={comingSoon}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-3 min-h-[52px] transition-colors text-left",
        "border-b border-white/[0.04] last:border-b-0",
        comingSoon
          ? "opacity-50 cursor-default"
          : "hover:bg-white/[0.04] active:bg-white/[0.06]",
      )}
    >
      <div className={cn("shrink-0 w-8 h-8 rounded-lg ring-1 flex items-center justify-center", iconBg)}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-white leading-tight">{label}</p>
        {sub && <p className="text-[11px] text-white/40 leading-tight mt-0.5">{sub}</p>}
      </div>
      {comingSoon ? (
        <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
          Soon
        </span>
      ) : external ? (
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      ) : (
        <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
      )}
    </button>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/30 px-1 mb-1.5">{title}</p>
      <div className="rounded-xl border border-white/[0.07] bg-sidebar/40 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function PanelHeader({ title, sub, onBack }: { title: string; sub?: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <button
        type="button"
        onClick={onBack}
        className="shrink-0 w-8 h-8 rounded-lg bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center hover:bg-white/10 active:bg-white/5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 text-white/70" />
      </button>
      <div>
        <h1 className="text-[15px] font-black text-white leading-none">{title}</h1>
        {sub && <p className="text-[10px] text-white/40 mt-0.5 leading-tight">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Services panel ───────────────────────────────────────────────────────────

function ServicesPanel({ onBack, onOpenAdmin }: { onBack: () => void; onOpenAdmin: () => void }) {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "services"), orderBy("name", "asc")),
      (snap) => {
        setServices(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  const active = services.filter((s) => s.isActive !== false);
  const inactive = services.filter((s) => s.isActive === false);

  const handleInstall = async () => {
    setInstalling(true);
    const tid = toast.loading("Installing DetailFlow service packages…");
    try {
      const { created, updated, deactivated } = await installDetailFlowServices();
      toast.success(`Done — ${created} created, ${updated} updated, ${deactivated} deactivated`, { id: tid });
    } catch (err) {
      console.error("[ServicesPanel install]", err);
      const msg = (err as Error)?.message || "Unknown error";
      const isPermission = msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("missing or insufficient");
      toast.error(
        isPermission
          ? "Permission denied — your account role may not allow service edits. Ask your admin to run Install from the desktop admin panel."
          : `Install failed: ${msg.slice(0, 120)}`,
        { id: tid, duration: 8000 },
      );
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="space-y-4">
      <PanelHeader title="Services" sub="Active service packages" onBack={onBack} />

      {/* Install button */}
      <button
        type="button"
        onClick={handleInstall}
        disabled={installing}
        className="w-full flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/[0.08] hover:bg-primary/[0.14] active:bg-primary/[0.06] transition-colors px-3 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
          {installing ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> : <DatabaseZap className="w-4 h-4 text-primary" />}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[13px] font-black text-primary leading-tight">Install DetailFlow Services</p>
          <p className="text-[11px] text-primary/60 leading-tight mt-0.5">
            Create or update the 6 approved packages
          </p>
        </div>
      </button>

      {/* Stats row */}
      {!loading && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-white/[0.07] bg-sidebar/40 p-3 text-center">
            <p className="text-2xl font-black text-emerald-400 leading-none">{active.length}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">Active</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-sidebar/40 p-3 text-center">
            <p className="text-2xl font-black text-white/30 leading-none">{inactive.length}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">Inactive</p>
          </div>
        </div>
      )}

      {/* Service list */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {active.length > 0 && (
            <SectionCard title="Active Packages">
              {active.map((svc) => (
                <div
                  key={svc.id}
                  className="flex items-center gap-3 px-3 py-3 border-b border-white/[0.04] last:border-b-0"
                >
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-white leading-tight truncate">{svc.name}</p>
                    <p className="text-[11px] text-white/40 leading-tight mt-0.5">
                      ${svc.basePrice} · {svc.estimatedDuration}m · {svc.category || "—"}
                    </p>
                  </div>
                  {svc.recommendedFrequencyDays && (
                    <span className="shrink-0 text-[9px] font-black text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
                      {svc.recommendedFrequencyDays}d
                    </span>
                  )}
                </div>
              ))}
            </SectionCard>
          )}

          {inactive.length > 0 && (
            <SectionCard title="Inactive">
              {inactive.map((svc) => (
                <div
                  key={svc.id}
                  className="flex items-center gap-3 px-3 py-3 border-b border-white/[0.04] last:border-b-0 opacity-50"
                >
                  <XCircle className="w-4 h-4 text-white/30 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-white/60 leading-tight truncate">{svc.name}</p>
                  </div>
                </div>
              ))}
            </SectionCard>
          )}

          {services.length === 0 && (
            <div className="text-center py-10">
              <p className="text-[13px] text-white/30">No services found.</p>
              <p className="text-[11px] text-white/20 mt-1">Tap "Install DetailFlow Services" to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Open full admin */}
      <button
        type="button"
        onClick={onOpenAdmin}
        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-3 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-lg bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
          <MonitorIcon className="w-4 h-4 text-white/50" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[13px] font-bold text-white leading-tight">Open Full Service Editor</p>
          <p className="text-[11px] text-white/40 leading-tight mt-0.5">Edit pricing, warranties, deposits</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>
    </div>
  );
}

// ─── Add-Ons panel ────────────────────────────────────────────────────────────

function AddOnsPanel({ onBack, onOpenAdmin }: { onBack: () => void; onOpenAdmin: () => void }) {
  const [addons, setAddons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "addons"), orderBy("name", "asc")),
      (snap) => {
        setAddons(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  const active = addons.filter((a) => a.isActive !== false);
  const inactive = addons.filter((a) => a.isActive === false);

  const handleInstall = async () => {
    setInstalling(true);
    const tid = toast.loading("Installing DetailFlow add-ons…");
    try {
      const { created, updated, deactivated } = await installDetailFlowAddOns();
      toast.success(`Done — ${created} created, ${updated} updated, ${deactivated} deactivated`, { id: tid });
    } catch (err) {
      console.error("[AddOnsPanel install]", err);
      const msg = (err as Error)?.message || "Unknown error";
      const isPermission = msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("missing or insufficient");
      toast.error(
        isPermission
          ? "Permission denied — your account role may not allow add-on edits. Ask your admin to run Install from the desktop panel."
          : `Install failed: ${msg.slice(0, 120)}`,
        { id: tid, duration: 8000 },
      );
    } finally {
      setInstalling(false);
    }
  };

  const typeLabel = (t: string | undefined) => {
    if (!t) return null;
    const map: Record<string, string> = {
      interior: "INT", exterior: "EXT", protection: "PROT",
      condition_fee: "COND", convenience_fee: "CONV", customer_add_on: "ADD",
    };
    return map[t] ?? t.toUpperCase().slice(0, 4);
  };

  return (
    <div className="space-y-4">
      <PanelHeader title="Add-Ons" sub="Enhancements & condition fees" onBack={onBack} />

      {/* Install button */}
      <button
        type="button"
        onClick={handleInstall}
        disabled={installing}
        className="w-full flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/[0.08] hover:bg-primary/[0.14] active:bg-primary/[0.06] transition-colors px-3 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
          {installing ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> : <DatabaseZap className="w-4 h-4 text-primary" />}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[13px] font-black text-primary leading-tight">Install DetailFlow Add-Ons</p>
          <p className="text-[11px] text-primary/60 leading-tight mt-0.5">
            Create or update the 16 approved add-ons
          </p>
        </div>
      </button>

      {/* Stats row */}
      {!loading && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-white/[0.07] bg-sidebar/40 p-3 text-center">
            <p className="text-2xl font-black text-emerald-400 leading-none">{active.length}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">Active</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-sidebar/40 p-3 text-center">
            <p className="text-2xl font-black text-white/30 leading-none">{inactive.length}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">Inactive</p>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {active.length > 0 && (
            <SectionCard title="Active Add-Ons">
              {active.map((addon) => (
                <div key={addon.id} className="flex items-center gap-3 px-3 py-3 border-b border-white/[0.04] last:border-b-0">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-white leading-tight truncate">{addon.name}</p>
                    <p className="text-[11px] text-white/40 leading-tight mt-0.5">
                      ${addon.vehicleSizePricing?.midsize ?? addon.price} · {addon.vehicleSizeDuration?.midsize ?? addon.estimatedDuration}m
                    </p>
                  </div>
                  {addon.addOnType && (
                    <span className="shrink-0 text-[9px] font-black text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
                      {typeLabel(addon.addOnType)}
                    </span>
                  )}
                </div>
              ))}
            </SectionCard>
          )}

          {inactive.length > 0 && (
            <SectionCard title="Inactive">
              {inactive.map((addon) => (
                <div key={addon.id} className="flex items-center gap-3 px-3 py-3 border-b border-white/[0.04] last:border-b-0 opacity-50">
                  <XCircle className="w-4 h-4 text-white/30 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-white/60 leading-tight truncate">{addon.name}</p>
                  </div>
                </div>
              ))}
            </SectionCard>
          )}

          {addons.length === 0 && (
            <div className="text-center py-10">
              <p className="text-[13px] text-white/30">No add-ons found.</p>
              <p className="text-[11px] text-white/20 mt-1">Tap "Install DetailFlow Add-Ons" to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Open full admin */}
      <button
        type="button"
        onClick={onOpenAdmin}
        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-3 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-lg bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
          <MonitorIcon className="w-4 h-4 text-white/50" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[13px] font-bold text-white leading-tight">Open Full Add-Ons Editor</p>
          <p className="text-[11px] text-white/40 leading-tight mt-0.5">Edit pricing, triggers, eligibility</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>
    </div>
  );
}

// ─── Business Setup panel ────────────────────────────────────────────────────

function BusinessSetupPanel({
  onBack,
  onServices,
  onAddOns,
  navigate,
}: {
  onBack: () => void;
  onServices: () => void;
  onAddOns: () => void;
  navigate: (path: string) => void;
}) {
  const admin = (tab: string) => navigate(`/settings?tab=${tab}&adminView=1`);

  return (
    <div className="space-y-4">
      <PanelHeader title="Business Setup" sub="Configure your business details" onBack={onBack} />

      <SectionCard title="Core Setup">
        <Row
          icon={<Building2 className="w-4 h-4" />}
          iconColor="text-sky-400"
          iconBg="bg-sky-500/10 ring-sky-500/25"
          label="Business Profile"
          sub="Name, address, phone, logo"
          onClick={() => admin("business")}
          external
        />
        <Row
          icon={<Palette className="w-4 h-4" />}
          iconColor="text-violet-400"
          iconBg="bg-violet-500/10 ring-violet-500/25"
          label="Branding"
          sub="Colors, logos, display name"
          onClick={() => admin("branding")}
          external
        />
        <Row
          icon={<Clock className="w-4 h-4" />}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10 ring-amber-500/25"
          label="Hours & Availability"
          sub="Operating hours, calendar rules"
          onClick={() => admin("calendar")}
          external
        />
        <Row
          icon={<MapPin className="w-4 h-4" />}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/10 ring-emerald-500/25"
          label="Service Area & Travel Fees"
          sub="Zones, mileage, fuel rates"
          onClick={() => admin("travel-fuel")}
          external
        />
      </SectionCard>

      <SectionCard title="Services & Packages">
        <Row
          icon={<Wrench className="w-4 h-4" />}
          iconColor="text-primary"
          iconBg="bg-primary/10 ring-primary/25"
          label="Services"
          sub="Manage your service packages"
          onClick={onServices}
        />
        <Row
          icon={<Plus className="w-4 h-4" />}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10 ring-amber-500/25"
          label="Add-Ons"
          sub="Enhancements & condition fees"
          onClick={onAddOns}
        />
        <Row
          icon={<Package className="w-4 h-4" />}
          iconColor="text-white/50"
          iconBg="bg-white/10 ring-white/15"
          label="Packages & Bundles"
          sub="Multi-service deal pricing"
          comingSoon
        />
        <Row
          icon={<RefreshCw className="w-4 h-4" />}
          iconColor="text-white/50"
          iconBg="bg-white/10 ring-white/15"
          label="Rebooking Rules"
          sub="Recurring & follow-up logic"
          comingSoon
        />
      </SectionCard>
    </div>
  );
}

// ─── Settings Hub ─────────────────────────────────────────────────────────────

function SettingsHub({
  profile,
  onPanel,
  navigate,
  logout,
}: {
  profile: any;
  onPanel: (p: "business" | "services" | "addons") => void;
  navigate: (path: string) => void;
  logout: () => Promise<void>;
}) {
  const admin = (tab: string) => navigate(`/settings?tab=${tab}&adminView=1`);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="px-0.5 flex items-center justify-between">
        <h1 className="text-base font-black text-white leading-none">Settings</h1>
        <Settings className="w-4 h-4 text-white/30" />
      </div>

      {/* Profile card */}
      <div className="rounded-xl border border-white/[0.07] bg-sidebar/60 px-4 py-4 flex items-center gap-3">
        <div className="shrink-0 w-12 h-12 rounded-full bg-primary/15 ring-2 ring-primary/30 flex items-center justify-center">
          <span className="text-base font-black text-primary leading-none">
            {getInitials(profile?.displayName)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-white leading-tight truncate">
            {profile?.displayName || "Unknown User"}
          </p>
          <p className="text-[11px] text-white/40 leading-tight mt-0.5 truncate">
            {profile?.email || ""}
          </p>
        </div>
        {profile?.role && (
          <span className={cn("shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ring-1 leading-none", roleBadgeClass(profile.role))}>
            {profile.role}
          </span>
        )}
      </div>

      {/* Business Setup */}
      <SectionCard title="Business">
        <Row
          icon={<Building2 className="w-4 h-4" />}
          iconColor="text-sky-400"
          iconBg="bg-sky-500/10 ring-sky-500/25"
          label="Business Setup"
          sub="Profile, services, hours, area"
          onClick={() => onPanel("business")}
        />
        <Row
          icon={<Wrench className="w-4 h-4" />}
          iconColor="text-primary"
          iconBg="bg-primary/10 ring-primary/25"
          label="Services & Pricing"
          sub="Packages, pricing, frequency"
          onClick={() => onPanel("services")}
        />
        <Row
          icon={<Star className="w-4 h-4" />}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10 ring-amber-500/25"
          label="Loyalty & Coupons"
          sub="Points, rewards, discount codes"
          onClick={() => admin("loyalty")}
          external
        />
      </SectionCard>

      {/* Operations */}
      <SectionCard title="Operations">
        <Row
          icon={<Calendar className="w-4 h-4" />}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/10 ring-emerald-500/25"
          label="Booking Rules"
          sub="Availability, blocks, calendar logic"
          onClick={() => admin("calendar")}
          external
        />
        <Row
          icon={<FileText className="w-4 h-4" />}
          iconColor="text-violet-400"
          iconBg="bg-violet-500/10 ring-violet-500/25"
          label="Forms & Waivers"
          sub="Intake forms, digital signatures"
          onClick={() => admin("forms")}
          external
        />
        <Row
          icon={<Zap className="w-4 h-4" />}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10 ring-amber-500/25"
          label="Automation"
          sub="Triggers, follow-ups, reminders"
          onClick={() => admin("automation")}
          external
        />
      </SectionCard>

      {/* Finance & Comms */}
      <SectionCard title="Finance & Communications">
        <Row
          icon={<CreditCard className="w-4 h-4" />}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/10 ring-emerald-500/25"
          label="Payments"
          sub="Stripe, deposits, invoicing"
          onClick={() => admin("integrations")}
          external
        />
        <Row
          icon={<MessageSquare className="w-4 h-4" />}
          iconColor="text-sky-400"
          iconBg="bg-sky-500/10 ring-sky-500/25"
          label="Messaging"
          sub="SMS templates, Twilio config"
          onClick={() => admin("communications")}
          external
        />
      </SectionCard>

      {/* Team & Security */}
      <SectionCard title="Team & Security">
        <Row
          icon={<Users className="w-4 h-4" />}
          iconColor="text-violet-400"
          iconBg="bg-violet-500/10 ring-violet-500/25"
          label="Team / Users"
          sub="Staff roles and commissions"
          onClick={() => admin("staff")}
          external
        />
        <Row
          icon={<Shield className="w-4 h-4" />}
          iconColor="text-rose-400"
          iconBg="bg-rose-500/10 ring-rose-500/25"
          label="Risk Management"
          sub="Security rules, client risk config"
          onClick={() => admin("security")}
          external
        />
      </SectionCard>

      {/* System */}
      <SectionCard title="System">
        <Row
          icon={<Brain className="w-4 h-4" />}
          iconColor="text-primary"
          iconBg="bg-primary/10 ring-primary/25"
          label="AI Settings"
          sub="Recommendations, automation AI"
          onClick={() => admin("ai-settings")}
          external
        />
        <Row
          icon={<Zap className="w-4 h-4" />}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10 ring-amber-500/25"
          label="Integrations"
          sub="Stripe, Google Calendar, webhooks"
          onClick={() => admin("integrations")}
          external
        />
        <Row
          icon={<MonitorIcon className="w-4 h-4" />}
          iconColor="text-white/50"
          iconBg="bg-white/10 ring-white/15"
          label="App Preferences"
          sub="Profile, display, notifications"
          onClick={() => admin("profile")}
          external
        />
      </SectionCard>

      {/* Account actions */}
      <SectionCard title="Account">
        <Row
          icon={<HelpCircle className="w-4 h-4" />}
          iconColor="text-sky-400"
          iconBg="bg-sky-500/10 ring-sky-500/25"
          label="Help & Support"
          sub="Documentation and support"
          onClick={() => navigate("/help")}
        />
        <Row
          icon={<LogOut className="w-4 h-4" />}
          iconColor="text-rose-400"
          iconBg="bg-rose-500/10 ring-rose-500/25"
          label="Sign Out"
          sub="Sign out of your account"
          onClick={logout}
        />
      </SectionCard>

      {/* Desktop bridge */}
      <button
        type="button"
        onClick={() => navigate("/settings?adminView=1")}
        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-3 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-lg bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
          <MonitorIcon className="w-4 h-4 text-white/50" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[13px] font-bold text-white leading-tight">Open Full Admin Settings</p>
          <p className="text-[11px] text-white/40 leading-tight mt-0.5">All charts, exports, and editing tools</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

type Panel = "business" | "services" | "addons";

export default function FieldSettings() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const navigate = useNavigate();
  const { profile, logout } = useAuth();

  if (panel === "services") {
    return (
      <ServicesPanel
        onBack={() => setPanel("business")}
        onOpenAdmin={() => navigate("/settings?tab=services&adminView=1")}
      />
    );
  }

  if (panel === "addons") {
    return (
      <AddOnsPanel
        onBack={() => setPanel("business")}
        onOpenAdmin={() => navigate("/settings?tab=services&adminView=1")}
      />
    );
  }

  if (panel === "business") {
    return (
      <BusinessSetupPanel
        onBack={() => setPanel(null)}
        onServices={() => setPanel("services")}
        onAddOns={() => setPanel("addons")}
        navigate={navigate}
      />
    );
  }

  return (
    <SettingsHub
      profile={profile}
      onPanel={setPanel}
      navigate={navigate}
      logout={logout}
    />
  );
}
