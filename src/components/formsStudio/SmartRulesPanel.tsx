import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Workflow, Plus, Trash2, Edit2, ArrowRight, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import {
  createWaiverRule, updateWaiverRule, deleteWaiverRule, toggleWaiverRule,
} from "../../services/waiverRulesService";
import { ENFORCEMENT_POINT_META } from "../../types/waiver";
import { InfoTip, HelpHint } from "./HelpUI";
import type {
  WaiverRule, WaiverRuleConditionType, WaiverRuleEnforcementPoint, StudioFormTemplate,
} from "../../types/waiver";

interface Props {
  rules: WaiverRule[];
  templates: StudioFormTemplate[];
  services: any[];
  addons: any[];
  onRefresh: () => Promise<void> | void;
}

const CONDITION_LABELS: Record<WaiverRuleConditionType, string> = {
  servicePackage:       "When a specific Service or Package is selected",
  addon:                "When a specific Add-on is selected",
  vehicleCondition:     "When a Vehicle Condition flag is present",
  damagePhotosPresent:  "When Damage Photos are attached to the job",
  clientRiskFlag:       "When the Client has a Risk Flag",
  onlineBooking:        "When the booking comes from the Online Booking site",
  jobTotalThreshold:    "When the Job Total exceeds an amount",
  depositRequired:      "When a Deposit is required",
  invoicePaymentTerms:  "When Invoice Payment Terms are enabled",
  lateFeeTerms:         "When Late-Fee Terms are enabled",
  manual:               "Manual — owner attaches this waiver themselves",
};

export function SmartRulesPanel({ rules, templates, services, addons, onRefresh }: Props) {
  const [editing, setEditing] = useState<Partial<WaiverRule> | null>(null);

  const openCreate = () => {
    setEditing({
      name: "",
      status: "active",
      conditionType: "servicePackage",
      conditionValue: "",
      action: "requireForm",
      waiverTemplateId: templates[0]?.id ?? "",
      enforcementPoint: "jobStart",
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) { toast.error("Name your rule"); return; }
    if (!editing.waiverTemplateId) { toast.error("Choose a waiver template"); return; }

    try {
      if (editing.id) {
        await updateWaiverRule(editing.id, editing as any);
        toast.success("Rule updated");
      } else {
        await createWaiverRule(editing as any);
        toast.success("Rule created");
      }
      setEditing(null);
      await onRefresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save rule");
    }
  };

  const handleToggle = async (rule: WaiverRule) => {
    try {
      await toggleWaiverRule(rule.id, rule.status === "active" ? "inactive" : "active");
      await onRefresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    }
  };

  const handleDelete = async (rule: WaiverRule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await deleteWaiverRule(rule.id);
      toast.success("Rule deleted");
      await onRefresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    }
  };

  return (
    <div className="space-y-5">
      <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-2xl">
        <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
              <Workflow className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-1.5">
                Smart Rules Engine
                <InfoTip title="Smart Rules">
                  Smart Rules tell the Studio when a waiver should automatically apply. Instead of remembering to attach a form, a rule says: <em>“whenever a customer books a Ceramic Coating, require the Ceramic Coating Service Agreement before the job starts.”</em>
                </InfoTip>
              </h3>
              <p className="text-xs text-white/50 mt-1">
                Automate <span className="text-white font-bold">when</span> a waiver applies and
                <span className="text-white font-bold"> where</span> it must be signed.
              </p>
            </div>
          </div>
          <Button
            onClick={openCreate}
            className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest rounded-xl text-xs h-10 shadow-glow-blue shrink-0"
          >
            <Plus className="w-4 h-4 mr-2" /> New Rule
          </Button>
        </CardContent>
      </Card>

      {/* Rule list */}
      {rules.length === 0 ? (
        <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-2xl">
          <CardContent className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-6 h-6 text-blue-300" />
            </div>
            <h3 className="text-base font-black uppercase tracking-tight text-white">No Automation Rules Yet</h3>
            <p className="text-xs text-white/40 mt-2 max-w-md mx-auto">
              Rules wire waivers to the booking, quote, job, or invoice flow so the right form is always required at the right time.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
              {[
                "Require Ceramic Waiver before job start",
                "Online bookings → liability waiver",
                "Jobs over $500 → payment terms",
                "High-risk client → pre-existing damage form",
              ].map(s => (
                <div key={s} className="text-left px-3 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-[10px] uppercase tracking-widest font-black text-white/50">
                  {s}
                </div>
              ))}
            </div>
            <Button
              onClick={openCreate}
              className="mt-6 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest rounded-xl text-xs h-10"
            >
              <Plus className="w-4 h-4 mr-2" /> Create First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => {
            const template = templates.find(t => t.id === rule.waiverTemplateId);
            return (
              <Card
                key={rule.id}
                className={cn(
                  "border bg-[#0B0B0B] rounded-2xl overflow-hidden shadow-xl transition",
                  rule.status === "active" ? "border-white/10" : "border-white/5 opacity-70",
                )}
              >
                <CardContent className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Switch
                      checked={rule.status === "active"}
                      onCheckedChange={() => handleToggle(rule)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-black text-white truncate">{rule.name}</p>
                        <Badge className={cn(
                          "border-none text-[9px] font-black uppercase tracking-widest shrink-0",
                          rule.status === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-300",
                        )}>
                          {rule.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-white/50 flex-wrap">
                        <span className="font-black uppercase tracking-widest text-white/30">When:</span>
                        <span className="text-white/70">{CONDITION_LABELS[rule.conditionType]}</span>
                        <ArrowRight className="w-3 h-3 text-white/30 shrink-0" />
                        <span className="font-black uppercase tracking-widest text-white/30">Require:</span>
                        <span className="text-primary font-bold">{template?.title ?? "?"}</span>
                        <ArrowRight className="w-3 h-3 text-white/30 shrink-0" />
                        <Badge className="bg-blue-500/15 text-blue-300 border-none text-[9px] font-black uppercase tracking-widest">
                          {(ENFORCEMENT_POINT_META as any)[rule.enforcementPoint]?.short ?? rule.enforcementPoint ?? "—"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(rule)}
                      className="text-white/70 hover:text-white hover:bg-white/5 rounded-xl"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(rule)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Note */}
      <Card className="border-amber-500/20 bg-amber-500/[0.03] rounded-2xl">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-200/70">
            <span className="font-black uppercase tracking-widest text-amber-300">Rule scaffolding active.</span>
            {" "}Service/Add-on/Price triggers already enforce via the existing form compliance engine.
            Online-booking and invoice-payment enforcement points are scaffolded — see the integration checklist.
          </div>
        </CardContent>
      </Card>

      {/* Edit modal */}
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Edit Rule" : "New Smart Rule"}</DialogTitle>
            </DialogHeader>
            <DialogBody className="p-6 space-y-4">
              <div>
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/50">Rule Name</Label>
                <Input
                  value={editing.name ?? ""}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Require Ceramic Waiver on Coating Jobs"
                  className="bg-white/5 border-white/10 text-white rounded-xl mt-1"
                />
              </div>

              <div>
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1.5">
                  When (Condition)
                  <InfoTip title="Condition" size={12}>
                    The trigger that activates this rule. Pick the situation that should require this waiver — a specific service, an add-on, online bookings, jobs over a dollar amount, a client risk flag, etc.
                  </InfoTip>
                </Label>
                <Select
                  value={editing.conditionType}
                  onValueChange={(v: WaiverRuleConditionType) => setEditing({ ...editing, conditionType: v, conditionValue: "" })}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(CONDITION_LABELS) as [WaiverRuleConditionType, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(editing.conditionType === "servicePackage" || editing.conditionType === "addon") && (
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/50">
                    {editing.conditionType === "servicePackage" ? "Service" : "Add-on"}
                  </Label>
                  <Select
                    value={String(editing.conditionValue ?? "")}
                    onValueChange={v => setEditing({ ...editing, conditionValue: v })}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl mt-1">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(editing.conditionType === "servicePackage" ? services : addons).map((o: any) => (
                        <SelectItem key={o.id} value={o.id}>{o.name ?? o.title ?? o.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {editing.conditionType === "jobTotalThreshold" && (
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/50">Job Total Over ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editing.conditionValue as any ?? ""}
                    onChange={e => setEditing({ ...editing, conditionValue: Number(e.target.value) || 0 })}
                    className="bg-white/5 border-white/10 text-white rounded-xl mt-1"
                  />
                </div>
              )}

              {editing.conditionType === "clientRiskFlag" && (
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/50">Risk Flag</Label>
                  <Input
                    value={editing.conditionValue as any ?? ""}
                    onChange={e => setEditing({ ...editing, conditionValue: e.target.value })}
                    placeholder="e.g. high_risk"
                    className="bg-white/5 border-white/10 text-white rounded-xl mt-1"
                  />
                </div>
              )}

              <div>
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1.5">
                  Require Waiver
                  <InfoTip title="Required Waiver" size={12}>
                    Which template the customer must sign when the condition matches. Pick any active template from your library.
                  </InfoTip>
                </Label>
                <Select
                  value={editing.waiverTemplateId}
                  onValueChange={v => setEditing({ ...editing, waiverTemplateId: v })}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl mt-1">
                    <SelectValue placeholder="Choose template…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1.5">
                  Enforcement Point
                  <InfoTip title="Enforcement Point" size={12}>
                    <strong>When</strong> in the customer journey the waiver must be signed. Quote = before the customer approves a quote. Booking = before the booking is confirmed. Job Start = before the technician begins work (the safest default). Invoice = before payment is recorded.
                  </InfoTip>
                </Label>
                <Select
                  value={editing.enforcementPoint}
                  onValueChange={(v: WaiverRuleEnforcementPoint) => setEditing({ ...editing, enforcementPoint: v })}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ENFORCEMENT_POINT_META) as [WaiverRuleEnforcementPoint, any][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)} className="text-white/60 hover:text-white">Cancel</Button>
              <Button onClick={handleSave} className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest">
                {editing.id ? "Save Changes" : "Create Rule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
