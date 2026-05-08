import { useState, useEffect, useMemo } from "react";
import {
  collection,
  query,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
  getDocs,
  deleteDoc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { PageHeader } from "../components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import {
  Shield,
  Plus,
  Trash2,
  Edit2,
  User,
  AlertTriangle,
  Ban,
  DollarSign,
  Globe,
  Network,
  Save,
  CreditCard,
  UserCheck,
  ShieldAlert,
  ShieldOff,
} from "lucide-react";
import { ProtectedClient, Client, RiskNetworkSettings } from "../types";
import { cn } from "../lib/utils";

// ─── helpers ───────────────────────────────────────────────────────────────

type ProtectionLevel = ProtectedClient["protectionLevel"];

const FLAGGED_LEVELS: ProtectionLevel[] = ["Med", "High", "Critical", "Do Not Book", "Block Booking"];

function isFlagged(level: ProtectionLevel): boolean {
  return FLAGGED_LEVELS.includes(level);
}

function riskBadgeClass(level: ProtectionLevel): string {
  switch (level) {
    case "Critical":
    case "Do Not Book":
    case "Block Booking":
      return "bg-red-900/40 text-red-400 border-red-500/30";
    case "High":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "Med":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
    default:
      return "bg-green-500/10 text-green-500 border-green-500/20";
  }
}

function riskLabel(level: ProtectionLevel): string {
  switch (level) {
    case "Med": return "Medium Risk";
    case "High": return "High Risk";
    case "Critical": return "Critical";
    case "Do Not Book": return "Do Not Book";
    case "Block Booking": return "Block Booking";
    default: return "Low Risk";
  }
}

const SHARED_RISK_CATEGORIES = [
  "No-show / repeated cancellation",
  "Chargeback / payment issue",
  "Safety concern",
  "Property damage dispute",
  "Harassment / abusive conduct",
  "Do Not Book",
];

const RECOMMENDED_ACTIONS = [
  "Collect deposit before booking",
  "Require card on file",
  "Confirm appointment 24 hours before service",
  "Manager approval required",
  "Do not book",
];

const DEFAULT_NETWORK_SETTINGS: RiskNetworkSettings = {
  sharedNetworkEnabled: false,
  shareHighRiskAlerts: false,
  shareDoNotBookAlerts: false,
  allowContactRequests: false,
  requireApprovalBeforeSharing: true,
  depositForHighRisk: false,
  depositForCritical: false,
  depositForSharedMatch: false,
  cardOnFileForHighRisk: false,
  managerApprovalForCritical: false,
};

const NETWORK_SETTINGS_DOC = "risk_network_settings";

// ─── component ─────────────────────────────────────────────────────────────

export default function ProtectedClients() {
  const { profile } = useAuth();

  const [protectedClients, setProtectedClients] = useState<ProtectedClient[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ProtectedClient | null>(null);

  // Network / deposit settings — loaded once, saved only on explicit Save click
  const [networkSettings, setNetworkSettings] = useState<RiskNetworkSettings>(DEFAULT_NETWORK_SETTINGS);
  const [networkSettingsDirty, setNetworkSettingsDirty] = useState(false);
  const [isSavingNetwork, setIsSavingNetwork] = useState(false);

  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    address: "",
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    vin: "",
    licensePlate: "",
    riskReason: "",
    internalNotes: "",
    protectionLevel: "Med" as ProtectionLevel,
    requiredDepositType: "fixed" as "fixed" | "percentage",
    requiredDepositValue: 0,
    isActive: true,
    linkedClientId: "",
    // Shared risk fields
    sharedRiskEnabled: false,
    sharedRiskCategory: "",
    sharedRiskRecommendations: [] as string[],
    contactAllowed: false,
    depositRequired: false,
    cardOnFileRequired: false,
    managerApprovalRequired: false,
  });

  // ── load data ────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [snapRules, snapClients] = await Promise.all([
          getDocs(query(collection(db, "protected_clients"), orderBy("createdAt", "desc"))),
          getDocs(collection(db, "clients")),
        ]);
        setProtectedClients(snapRules.docs.map(d => ({ id: d.id, ...d.data() } as ProtectedClient)));
        setAllClients(snapClients.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
      } catch (error: any) {
        if (error?.code === "resource-exhausted" || error?.message?.includes("quota")) {
          toast.error("Database quota reached. Showing cached data.");
        } else {
          console.error("[RiskManagement] fetch error", error);
        }
      }
    };

    const fetchNetworkSettings = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", NETWORK_SETTINGS_DOC));
        if (snap.exists()) {
          setNetworkSettings({ ...DEFAULT_NETWORK_SETTINGS, ...snap.data() });
        }
      } catch {
        // Silently fall back to defaults — non-critical
      }
    };

    fetchData();
    fetchNetworkSettings();
  }, []);

  // ── network settings save ─────────────────────────────────────────────────

  const handleSaveNetworkSettings = async () => {
    setIsSavingNetwork(true);
    try {
      await setDoc(
        doc(db, "settings", NETWORK_SETTINGS_DOC),
        { ...networkSettings, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setNetworkSettingsDirty(false);
      toast.success("Risk network settings saved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save network settings");
    } finally {
      setIsSavingNetwork(false);
    }
  };

  const updateNetworkSetting = <K extends keyof RiskNetworkSettings>(
    key: K,
    value: RiskNetworkSettings[K]
  ) => {
    setNetworkSettings(prev => ({ ...prev, [key]: value }));
    setNetworkSettingsDirty(true);
  };

  // ── client rule save ──────────────────────────────────────────────────────

  const autofillClient = (client: any) => {
    const riskVal =
      client.riskLevel || client.risk_level || client.riskStatus ||
      client.clientRiskLevel || client.riskManagement?.level;
    setFormData(prev => ({
      ...prev,
      fullName: client.name || "",
      phone: client.phone || "",
      email: client.email || "",
      address: client.address || "",
      linkedClientId: client.id,
      protectionLevel: (riskVal as any) || prev.protectionLevel,
      riskReason: client.riskReason || prev.riskReason || "",
    }));
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data: any = { ...formData, updatedAt: serverTimestamp() };
    // Strip undefined/empty shared risk fields to keep Firestore clean
    if (!data.sharedRiskCategory) delete data.sharedRiskCategory;
    if (!data.sharedRiskRecommendations?.length) delete data.sharedRiskRecommendations;

    try {
      if (editingClient) {
        await updateDoc(doc(db, "protected_clients", editingClient.id), data);
        setProtectedClients(prev =>
          prev.map(p => p.id === editingClient.id ? { ...p, ...data } : p)
        );
        toast.success("Risk profile updated");
      } else {
        const ref = await addDoc(collection(db, "protected_clients"), {
          ...data,
          createdAt: serverTimestamp(),
        });
        setProtectedClients(prev => [{ id: ref.id, ...data } as any, ...prev]);
        toast.success("Risk profile created");
      }
      setIsDialogOpen(false);
      setEditingClient(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save risk profile");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this risk rule?")) return;
    try {
      await deleteDoc(doc(db, "protected_clients", id));
      setProtectedClients(prev => prev.filter(p => p.id !== id));
      toast.success("Risk rule removed");
    } catch {
      toast.error("Failed to remove risk rule");
    }
  };

  // ── combined rows — FLAGGED only ──────────────────────────────────────────

  const combinedRows = useMemo(() => {
    const rows: any[] = [];
    const usedRuleIds = new Set<string>();

    allClients.forEach(client => {
      const rule = protectedClients.find(
        p =>
          p.linkedClientId === client.id ||
          (p.email && p.email.toLowerCase() === client.email?.toLowerCase()) ||
          (p.phone && p.phone === client.phone)
      );
      if (rule) usedRuleIds.add(rule.id);

      const level: ProtectionLevel = rule?.protectionLevel || "Low";
      if (!isFlagged(level)) return; // exclude Low Risk

      rows.push({
        id: client.id,
        isRuleOnly: false,
        fullName: client.name || "Unknown",
        phone: client.phone,
        email: client.email,
        isActive: rule?.isActive ?? false,
        protectionLevel: level,
        ruleId: rule?.id ?? null,
        client,
        rule: rule ?? null,
      });
    });

    protectedClients.forEach(rule => {
      if (usedRuleIds.has(rule.id)) return;
      if (!isFlagged(rule.protectionLevel)) return;

      rows.push({
        id: rule.id,
        isRuleOnly: true,
        fullName: rule.fullName || "Unknown",
        phone: rule.phone,
        email: rule.email,
        isActive: rule.isActive,
        protectionLevel: rule.protectionLevel,
        ruleId: rule.id,
        client: null,
        rule,
      });
    });

    const term = searchTerm.toLowerCase();
    return rows.filter(
      r =>
        r.fullName?.toLowerCase().includes(term) ||
        r.phone?.includes(term) ||
        r.email?.toLowerCase().includes(term)
    );
  }, [allClients, protectedClients, searchTerm]);

  // ── overview counts ───────────────────────────────────────────────────────

  const overviewCounts = useMemo(() => {
    let medium = 0, high = 0, critical = 0, depositAlerts = 0;

    allClients.forEach(client => {
      const rule = protectedClients.find(
        p =>
          p.linkedClientId === client.id ||
          (p.email && p.email.toLowerCase() === client.email?.toLowerCase()) ||
          (p.phone && p.phone === client.phone)
      );
      const level: ProtectionLevel = rule?.protectionLevel || "Low";
      if (level === "Med") medium++;
      if (level === "High") high++;
      if (level === "Critical" || level === "Do Not Book" || level === "Block Booking") critical++;
      if (rule?.depositRequired || rule?.requiredDepositValue > 0) depositAlerts++;
    });

    protectedClients.forEach(rule => {
      const hasClient = allClients.some(
        c =>
          rule.linkedClientId === c.id ||
          (rule.email && rule.email.toLowerCase() === c.email?.toLowerCase()) ||
          (rule.phone && rule.phone === c.phone)
      );
      if (!hasClient) {
        if (rule.protectionLevel === "Med") medium++;
        if (rule.protectionLevel === "High") high++;
        if (
          rule.protectionLevel === "Critical" ||
          rule.protectionLevel === "Do Not Book" ||
          rule.protectionLevel === "Block Booking"
        )
          critical++;
        if (rule.depositRequired || rule.requiredDepositValue > 0) depositAlerts++;
      }
    });

    return { medium, high, critical, depositAlerts };
  }, [allClients, protectedClients]);

  // ── dialog helpers ────────────────────────────────────────────────────────

  const openNewDialog = () => {
    setEditingClient(null);
    setFormData({
      fullName: "",
      phone: "",
      email: "",
      address: "",
      vehicleYear: "",
      vehicleMake: "",
      vehicleModel: "",
      vin: "",
      licensePlate: "",
      riskReason: "",
      internalNotes: "",
      protectionLevel: "Med",
      requiredDepositType: "fixed",
      requiredDepositValue: 0,
      isActive: true,
      linkedClientId: "",
      sharedRiskEnabled: false,
      sharedRiskCategory: "",
      sharedRiskRecommendations: [],
      contactAllowed: false,
      depositRequired: false,
      cardOnFileRequired: false,
      managerApprovalRequired: false,
    });
    setIsDialogOpen(true);
  };

  const handleEditClick = (row: any) => {
    if (row.rule) {
      setEditingClient(row.rule);
      setFormData({
        fullName: row.rule.fullName || row.fullName || "",
        phone: row.rule.phone || row.phone || "",
        email: row.rule.email || row.email || "",
        address: row.rule.address || row.client?.address || "",
        vehicleYear: row.rule.vehicleYear || "",
        vehicleMake: row.rule.vehicleMake || "",
        vehicleModel: row.rule.vehicleModel || "",
        vin: row.rule.vin || "",
        licensePlate: row.rule.licensePlate || "",
        riskReason: row.rule.riskReason || "",
        internalNotes: row.rule.internalNotes || "",
        protectionLevel: row.rule.protectionLevel || "Med",
        requiredDepositType: row.rule.requiredDepositType || "fixed",
        requiredDepositValue: row.rule.requiredDepositValue || 0,
        isActive: row.rule.isActive ?? true,
        linkedClientId: row.rule.linkedClientId || row.client?.id || "",
        sharedRiskEnabled: row.rule.sharedRiskEnabled ?? false,
        sharedRiskCategory: row.rule.sharedRiskCategory || "",
        sharedRiskRecommendations: row.rule.sharedRiskRecommendations || [],
        contactAllowed: row.rule.contactAllowed ?? false,
        depositRequired: row.rule.depositRequired ?? false,
        cardOnFileRequired: row.rule.cardOnFileRequired ?? false,
        managerApprovalRequired: row.rule.managerApprovalRequired ?? false,
      });
    } else {
      setEditingClient(null);
      setFormData({
        fullName: row.fullName || "",
        phone: row.phone || "",
        email: row.email || "",
        address: row.client?.address || "",
        vehicleYear: "",
        vehicleMake: "",
        vehicleModel: "",
        vin: "",
        licensePlate: "",
        riskReason: "",
        internalNotes: "",
        protectionLevel: "Med",
        requiredDepositType: "fixed",
        requiredDepositValue: 0,
        isActive: true,
        linkedClientId: row.client?.id || "",
        sharedRiskEnabled: false,
        sharedRiskCategory: "",
        sharedRiskRecommendations: [],
        contactAllowed: false,
        depositRequired: false,
        cardOnFileRequired: false,
        managerApprovalRequired: false,
      });
    }
    setIsDialogOpen(true);
  };

  const toggleRecommendation = (action: string) => {
    setFormData(prev => ({
      ...prev,
      sharedRiskRecommendations: prev.sharedRiskRecommendations.includes(action)
        ? prev.sharedRiskRecommendations.filter(a => a !== action)
        : [...prev.sharedRiskRecommendations, action],
    }));
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 pb-24 w-full">
      <PageHeader
        title="Risk Management"
        accentWord="Management"
        subtitle="Flagged clients · Shared Risk Network · Deposit protection controls"
        actions={
          <Button
            className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-6 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue transition-all hover:scale-105"
            onClick={openNewDialog}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Risk Rule
          </Button>
        }
      />

      {/* ── Section 1: Risk Overview ── */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-4 px-1">
          Risk Overview
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <OverviewCard
            label="Medium Risk"
            value={overviewCounts.medium}
            icon={<AlertTriangle className="w-5 h-5 text-yellow-400" />}
            color="yellow"
          />
          <OverviewCard
            label="High Risk"
            value={overviewCounts.high}
            icon={<ShieldAlert className="w-5 h-5 text-red-500" />}
            color="red"
          />
          <OverviewCard
            label="Critical / Do Not Book"
            value={overviewCounts.critical}
            icon={<Ban className="w-5 h-5 text-red-400" />}
            color="darkred"
          />
          <OverviewCard
            label="Deposit Required"
            value={overviewCounts.depositAlerts}
            icon={<DollarSign className="w-5 h-5 text-primary" />}
            color="blue"
          />
          <OverviewCard
            label="Shared Network Matches"
            value={0}
            icon={<Globe className="w-5 h-5 text-white/30" />}
            color="dim"
            note="Coming soon"
          />
        </div>
      </div>

      {/* ── Section 2: Flagged Clients ── */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-4 px-1">
          Flagged Clients
        </p>
        <Card className="border-none bg-card rounded-3xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-white/5 bg-black/40">
            <Input
              placeholder="Search flagged clients…"
              className="bg-white/5 border-white/10 text-white font-bold rounded-2xl h-12"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-white/40 font-black uppercase text-[10px] tracking-widest px-8 w-1/4">
                  Client
                </TableHead>
                <TableHead className="text-white/40 font-black uppercase text-[10px] tracking-widest">
                  Risk Level
                </TableHead>
                <TableHead className="text-white/40 font-black uppercase text-[10px] tracking-widest w-1/3">
                  Reason
                </TableHead>
                <TableHead className="text-white/40 font-black uppercase text-[10px] tracking-widest">
                  Active Rule
                </TableHead>
                <TableHead className="text-right px-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {combinedRows.map(row => (
                <TableRow key={row.id} className="border-white/5 hover:bg-white/5">
                  <TableCell className="px-8 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                          row.isRuleOnly ? "bg-red-500/20" : "bg-primary/20"
                        )}
                      >
                        {row.isRuleOnly ? (
                          <Shield className="w-4 h-4 text-red-500" />
                        ) : (
                          <User className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-white leading-none">{row.fullName}</p>
                        <p className="text-xs text-white/40 mt-1">
                          {row.email || row.phone || "No contact info"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-black uppercase tracking-widest px-3 py-1",
                        riskBadgeClass(row.protectionLevel)
                      )}
                    >
                      {riskLabel(row.protectionLevel)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.rule?.riskReason ? (
                      <div
                        className="text-xs text-white/80 line-clamp-2 max-w-sm font-medium"
                        title={row.rule.riskReason}
                      >
                        {row.rule.riskReason}
                      </div>
                    ) : (
                      <span className="text-xs text-white/20 italic font-medium">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.rule ? (
                      <Switch
                        checked={row.isActive}
                        onCheckedChange={async val => {
                          try {
                            await updateDoc(
                              doc(db, "protected_clients", row.ruleId),
                              { isActive: val, updatedAt: serverTimestamp() }
                            );
                            setProtectedClients(prev =>
                              prev.map(p => p.id === row.ruleId ? { ...p, isActive: val } : p)
                            );
                            toast.success(`Rule ${val ? "activated" : "deactivated"}`);
                          } catch {
                            toast.error("Failed to update rule");
                          }
                        }}
                      />
                    ) : (
                      <span className="text-white/20 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right px-8">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(row)}
                        title="Edit risk profile"
                      >
                        <Edit2 className="w-4 h-4 text-white/40 hover:text-white" />
                      </Button>
                      {row.ruleId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(row.ruleId)}
                          title="Remove rule"
                        >
                          <Trash2 className="w-4 h-4 text-red-400/60 hover:text-red-400" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {combinedRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-white/30">
                    <Shield className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest">No flagged clients</p>
                    <p className="text-[11px] mt-1 text-white/20">
                      Low-risk clients are managed in the Client Registry.
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* ── Section 3 + 5: Shared Risk Network & Deposit Protection ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shared Risk Network */}
        <Card className="border-none bg-card rounded-3xl shadow-xl">
          <CardHeader className="p-6 border-b border-white/5 bg-black/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Network className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="font-black text-base uppercase tracking-widest text-white">
                  Shared Risk Network
                </CardTitle>
                <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-0.5">
                  Foundation controls · Live sync coming soon
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            <NetworkToggleRow
              label="Enable Shared Risk Network"
              description="Opt in to share and receive anonymized risk alerts with other detailers."
              checked={networkSettings.sharedNetworkEnabled}
              onChange={v => updateNetworkSetting("sharedNetworkEnabled", v)}
            />
            <NetworkToggleRow
              label="Share High Risk Alerts"
              description="Broadcast High Risk flags to the network (no private notes shared)."
              checked={networkSettings.shareHighRiskAlerts}
              onChange={v => updateNetworkSetting("shareHighRiskAlerts", v)}
              disabled={!networkSettings.sharedNetworkEnabled}
            />
            <NetworkToggleRow
              label="Share Do Not Book Alerts"
              description="Broadcast Do Not Book / Critical flags to the network."
              checked={networkSettings.shareDoNotBookAlerts}
              onChange={v => updateNetworkSetting("shareDoNotBookAlerts", v)}
              disabled={!networkSettings.sharedNetworkEnabled}
            />
            <NetworkToggleRow
              label="Allow Other Detailers to Request Contact"
              description="Let other verified businesses request limited contact about a shared alert."
              checked={networkSettings.allowContactRequests}
              onChange={v => updateNetworkSetting("allowContactRequests", v)}
              disabled={!networkSettings.sharedNetworkEnabled}
            />
            <NetworkToggleRow
              label="Require Approval Before Sharing"
              description="Manually approve each record before it is broadcast to the network."
              checked={networkSettings.requireApprovalBeforeSharing}
              onChange={v => updateNetworkSetting("requireApprovalBeforeSharing", v)}
              disabled={!networkSettings.sharedNetworkEnabled}
            />

            {networkSettingsDirty && (
              <Button
                className="w-full bg-primary text-white font-black uppercase tracking-widest text-[10px] h-12 rounded-xl mt-2"
                onClick={handleSaveNetworkSettings}
                disabled={isSavingNetwork}
              >
                <Save className="w-4 h-4 mr-2" />
                {isSavingNetwork ? "Saving…" : "Save Network Settings"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Deposit Protection Rules */}
        <Card className="border-none bg-card rounded-3xl shadow-xl">
          <CardHeader className="p-6 border-b border-white/5 bg-black/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-yellow-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <CardTitle className="font-black text-base uppercase tracking-widest text-white">
                  Deposit Protection Rules
                </CardTitle>
                <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-0.5">
                  Auto-applied when risk rule is active
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            <NetworkToggleRow
              label="Require Deposit for High Risk"
              description="Automatically flag a deposit requirement for all High Risk clients."
              checked={networkSettings.depositForHighRisk}
              onChange={v => updateNetworkSetting("depositForHighRisk", v)}
              icon={<DollarSign className="w-4 h-4 text-red-400" />}
            />
            <NetworkToggleRow
              label="Require Deposit for Critical / Do Not Book"
              description="Force a deposit requirement for Critical and Do Not Book clients."
              checked={networkSettings.depositForCritical}
              onChange={v => updateNetworkSetting("depositForCritical", v)}
              icon={<Ban className="w-4 h-4 text-red-500" />}
            />
            <NetworkToggleRow
              label="Require Deposit for Shared Network Match"
              description="Auto-require a deposit if a client matches a shared network alert."
              checked={networkSettings.depositForSharedMatch}
              onChange={v => updateNetworkSetting("depositForSharedMatch", v)}
              icon={<Globe className="w-4 h-4 text-primary" />}
            />
            <NetworkToggleRow
              label="Require Card on File for High Risk"
              description="Enforce a saved payment method for High Risk bookings."
              checked={networkSettings.cardOnFileForHighRisk}
              onChange={v => updateNetworkSetting("cardOnFileForHighRisk", v)}
              icon={<CreditCard className="w-4 h-4 text-yellow-400" />}
            />
            <NetworkToggleRow
              label="Manager Approval Required for Critical Clients"
              description="Block booking and require manager sign-off for Critical / Do Not Book clients."
              checked={networkSettings.managerApprovalForCritical}
              onChange={v => updateNetworkSetting("managerApprovalForCritical", v)}
              icon={<UserCheck className="w-4 h-4 text-primary" />}
            />

            {networkSettingsDirty && (
              <Button
                className="w-full bg-primary text-white font-black uppercase tracking-widest text-[10px] h-12 rounded-xl mt-2"
                onClick={handleSaveNetworkSettings}
                disabled={isSavingNetwork}
              >
                <Save className="w-4 h-4 mr-2" />
                {isSavingNetwork ? "Saving…" : "Save Protection Rules"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Edit / Create Dialog ── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-none p-0 overflow-hidden rounded-3xl sm:max-w-[720px]">
          <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
            <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase flex items-center gap-2">
              <Shield className="w-6 h-6 text-orange-500" />
              {editingClient ? "Edit Risk Profile" : "Create Risk Profile"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form onSubmit={handleSave} className="space-y-5">
              {/* Autofill from registry */}
              {!editingClient && !formData.linkedClientId && (
                <div className="space-y-2">
                  <Label className="uppercase tracking-widest text-[10px] text-white/40 font-bold">
                    Autofill from Client Registry
                  </Label>
                  <Select
                    onValueChange={val => {
                      const cl = allClients.find(c => c.id === val);
                      if (cl) autofillClient(cl);
                    }}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-12">
                      <SelectValue placeholder="Search clients…" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-white/10 text-white">
                      {allClients.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Identity */}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  value={formData.fullName}
                  onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Full Name"
                  required
                  className="bg-white/5 border-white/10 text-white rounded-xl h-12"
                />
                <Input
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Phone"
                  required
                  className="bg-white/5 border-white/10 text-white rounded-xl h-12"
                />
              </div>
              <Input
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="Email"
                className="bg-white/5 border-white/10 text-white rounded-xl h-12"
              />

              {/* Risk level */}
              <div className="grid grid-cols-2 gap-4">
                <Select
                  value={formData.protectionLevel}
                  onValueChange={(val: any) =>
                    setFormData({ ...formData, protectionLevel: val })
                  }
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-12">
                    <SelectValue placeholder="Risk Level" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-white/10 text-white">
                    <SelectItem value="Med">Medium Risk</SelectItem>
                    <SelectItem value="High">High Risk</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                    <SelectItem value="Do Not Book">Do Not Book</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4">
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={val => setFormData({ ...formData, isActive: val })}
                  />
                  <Label className="text-white/70 text-xs font-bold uppercase tracking-widest">
                    Active Rule
                  </Label>
                </div>
              </div>

              {/* Reason */}
              <Textarea
                value={formData.riskReason}
                onChange={e => setFormData({ ...formData, riskReason: e.target.value })}
                placeholder="Reason for risk setting… (internal only)"
                required
                className="bg-white/5 border-white/10 text-white rounded-xl"
                rows={3}
              />

              {/* Deposit override */}
              <div className="space-y-3 pt-3 border-t border-white/5">
                <Label className="uppercase tracking-widest text-[10px] text-white/40 font-bold">
                  Manual Deposit Override
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    value={formData.requiredDepositType}
                    onValueChange={(val: any) =>
                      setFormData({ ...formData, requiredDepositType: val })
                    }
                  >
                    <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-white/10 text-white">
                      <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={formData.requiredDepositValue}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        requiredDepositValue: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder={formData.requiredDepositType === "fixed" ? "$ Amount" : "% Value"}
                    className="bg-white/5 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
              </div>

              {/* Per-client protection flags */}
              <div className="space-y-3 pt-3 border-t border-white/5">
                <Label className="uppercase tracking-widest text-[10px] text-white/40 font-bold">
                  Client Protection Flags
                </Label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { key: "depositRequired", label: "Require deposit before booking" },
                    { key: "cardOnFileRequired", label: "Require card on file" },
                    { key: "managerApprovalRequired", label: "Manager approval required" },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-3 cursor-pointer select-none">
                      <Checkbox
                        checked={(formData as any)[key]}
                        onCheckedChange={val =>
                          setFormData({ ...formData, [key]: !!val })
                        }
                        className="border-white/20"
                      />
                      <span className="text-xs font-bold text-white/70 uppercase tracking-widest">
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Shared Risk Network — per client */}
              <div className="space-y-4 pt-3 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <Label className="uppercase tracking-widest text-[10px] text-white/40 font-bold">
                    Shared Risk Alert
                  </Label>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.sharedRiskEnabled}
                      onCheckedChange={val =>
                        setFormData({ ...formData, sharedRiskEnabled: val })
                      }
                    />
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                      Share with network
                    </span>
                  </div>
                </div>

                {formData.sharedRiskEnabled && (
                  <div className="space-y-4 pl-1">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        Shared Risk Category
                      </Label>
                      <Select
                        value={formData.sharedRiskCategory}
                        onValueChange={val =>
                          setFormData({ ...formData, sharedRiskCategory: val })
                        }
                      >
                        <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-11">
                          <SelectValue placeholder="Select category…" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-white/10 text-white">
                          {SHARED_RISK_CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        Recommended Actions
                      </Label>
                      <div className="space-y-2">
                        {RECOMMENDED_ACTIONS.map(action => (
                          <label key={action} className="flex items-center gap-3 cursor-pointer">
                            <Checkbox
                              checked={formData.sharedRiskRecommendations.includes(action)}
                              onCheckedChange={() => toggleRecommendation(action)}
                              className="border-white/20"
                            />
                            <span className="text-xs text-white/60 font-medium">{action}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Switch
                        checked={formData.contactAllowed}
                        onCheckedChange={val =>
                          setFormData({ ...formData, contactAllowed: val })
                        }
                      />
                      <span className="text-xs font-bold text-white/50 uppercase tracking-widest">
                        Allow contact requests from other detailers
                      </span>
                    </div>

                    <p className="text-[10px] text-white/20 italic leading-relaxed">
                      Private notes and contact details are never shared. Only the risk category,
                      recommended actions, and anonymized identifiers are visible to the network.
                    </p>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 h-14 rounded-xl font-black uppercase tracking-[0.2em]"
              >
                <Save className="w-4 h-4 mr-2" />
                {editingClient ? "Save Updates" : "Create Profile"}
              </Button>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── sub-components ─────────────────────────────────────────────────────────

function OverviewCard({
  label,
  value,
  icon,
  color,
  note,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "yellow" | "red" | "darkred" | "blue" | "dim";
  note?: string;
}) {
  const bg: Record<string, string> = {
    yellow: "bg-yellow-500/5 border-yellow-500/10",
    red: "bg-red-500/5 border-red-500/10",
    darkred: "bg-red-900/10 border-red-700/20",
    blue: "bg-primary/5 border-primary/10",
    dim: "bg-white/3 border-white/5",
  };

  return (
    <div className={cn("rounded-2xl border p-5 flex flex-col gap-3", bg[color])}>
      <div className="flex items-center justify-between">
        {icon}
        <span
          className={cn(
            "text-2xl font-black tabular-nums",
            color === "dim" ? "text-white/20" : "text-white"
          )}
        >
          {value}
        </span>
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-white/40 leading-tight">
        {label}
      </p>
      {note && (
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/20">{note}</p>
      )}
    </div>
  );
}

function NetworkToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  icon,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 py-3 border-b border-white/5 last:border-0",
        disabled && "opacity-40 pointer-events-none"
      )}
    >
      <div className="flex items-start gap-2.5 flex-1 min-w-0">
        {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
        <div>
          <p className="text-xs font-black text-white uppercase tracking-widest leading-none">
            {label}
          </p>
          <p className="text-[10px] text-white/30 font-medium mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="shrink-0 mt-0.5" />
    </div>
  );
}
