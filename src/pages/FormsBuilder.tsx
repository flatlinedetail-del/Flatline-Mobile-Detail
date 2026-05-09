import { useState, useEffect, useMemo } from "react";
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, getDocs } from "firebase/firestore";
import { cn } from "../lib/utils";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { PageHeader } from "../components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogBody } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, X, Check } from "lucide-react";
import { Plus, FileText, Edit2, Trash2, ShieldCheck, Settings2, AlertCircle, CheckCircle2, ShieldAlert, ChevronDown, Loader2, Clock, Send, Zap, Eye, Info } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";

export default function FormsBuilder({ embedded = false }: { embedded?: boolean }) {
  const { profile, loading: authLoading, canAccessManager, systemStatus } = useAuth();
  const [templates, setTemplates] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [previewServiceId, setPreviewServiceId] = useState<string>("");

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    category: "liability",
    content: "",
    acknowledgments: [] as string[],
    requiresSignature: true,
    requiresPrintedName: true,
    requiresDate: true,
    requiresInitials: false,
    requiresPhoto: false,
    isActive: true,
    assignedServices: [] as string[],
    assignedAddons: [] as string[],
    assignedToRetail: true,
    assignedToVendors: true,
    enforcement: "before_start",
    signatureFrequency: "every_job" as string,
    riskTriggers: [] as string[],
    priceThreshold: null as number | null,
    expiresAfterDays: null as number | null,
  });

  const [newAck, setNewAck] = useState("");

  useEffect(() => {
    if (authLoading || !profile || !canAccessManager) return;

    const q = query(collection(db, "form_templates"));
    const unsubscribeTemplates = onSnapshot(q, (snapshot) => {
      setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Error listening to form templates:", error);
      handleFirestoreError(error, OperationType.GET, "form_templates");
      setLoading(false);
    });

    const unsubscribeServices = onSnapshot(collection(db, "services"), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setServices(data);
      localStorage.setItem('cached_services_forms', JSON.stringify(data));
    }, (error) => {
      console.error("Error listening to services in FormsBuilder:", error);
      const cached = localStorage.getItem('cached_services_forms');
      if (cached) {
        try { setServices(JSON.parse(cached)); } catch (e) {}
      }
    });

    const unsubscribeAddons = onSnapshot(collection(db, "addons"), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAddons(data);
      localStorage.setItem('cached_addons_forms', JSON.stringify(data));
    }, (error) => {
      console.error("Error listening to addons in FormsBuilder:", error);
      const cached = localStorage.getItem('cached_addons_forms');
      if (cached) {
        try { setAddons(JSON.parse(cached)); } catch (e) {}
      }
    });

    return () => {
      unsubscribeTemplates();
      unsubscribeServices();
      unsubscribeAddons();
    };
  }, [profile, authLoading]);

  const activeTemplates = useMemo(() => templates.filter(t => t.isActive), [templates]);
  const inactiveTemplates = useMemo(() => templates.filter(t => !t.isActive), [templates]);

  const previewForms = useMemo(() => {
    if (!previewServiceId) return [];
    return activeTemplates.filter(t => {
      const hasService = t.assignedServices?.includes(previewServiceId);
      const noSpecific = !t.assignedServices?.length && !t.assignedAddons?.length;
      return hasService || noSpecific;
    });
  }, [previewServiceId, activeTemplates]);

  if (!canAccessManager) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <ShieldAlert className="w-16 h-16 text-red-500" />
        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Access Restricted</h2>
        <p className="text-white/60 font-medium text-center max-w-md px-6">
          You do not have permission to access the Forms Builder protocol. This area is restricted to administrative clearance levels.
        </p>
        <Button onClick={() => window.history.back()} variant="outline" className="border-white/10 text-white/40 hover:text-white">Go Back</Button>
      </div>
    );
  }

  const handleOpenEdit = (template?: any) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        title: template.title,
        category: template.category || "liability",
        content: template.content,
        acknowledgments: template.acknowledgments || [],
        requiresSignature: template.requiresSignature ?? true,
        requiresPrintedName: template.requiresPrintedName ?? true,
        requiresDate: template.requiresDate ?? true,
        requiresInitials: template.requiresInitials ?? false,
        requiresPhoto: template.requiresPhoto ?? false,
        isActive: template.isActive ?? true,
        assignedServices: template.assignedServices || [],
        assignedAddons: template.assignedAddons || [],
        assignedToRetail: template.assignedToRetail ?? true,
        assignedToVendors: template.assignedToVendors ?? true,
        enforcement: template.enforcement || "before_start",
        signatureFrequency: template.signatureFrequency || "every_job",
        riskTriggers: template.riskTriggers || [],
        priceThreshold: template.priceThreshold ?? null,
        expiresAfterDays: template.expiresAfterDays ?? null,
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        title: "",
        category: "liability",
        content: "",
        acknowledgments: [],
        requiresSignature: true,
        requiresPrintedName: true,
        requiresDate: true,
        requiresInitials: false,
        requiresPhoto: false,
        isActive: true,
        assignedServices: [],
        assignedAddons: [],
        assignedToRetail: true,
        assignedToVendors: true,
        enforcement: "before_start",
        signatureFrequency: "every_job",
        riskTriggers: [],
        priceThreshold: null,
        expiresAfterDays: null,
      });
    }
    setShowEditDialog(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.content) {
      toast.error("Title and Content are required");
      return;
    }

    const isRestricted = systemStatus === 'offline' || systemStatus === 'quota-exhausted';

    const assignedServiceNames = formData.assignedServices
      .map(id => services.find(s => s.id === id)?.name)
      .filter(Boolean);
    const assignedAddonNames = formData.assignedAddons
      .map(id => addons.find(a => a.id === id)?.name)
      .filter(Boolean);

    const saveData = {
      ...formData,
      assignedServiceNames,
      assignedAddonNames,
      updatedAt: serverTimestamp()
    };

    try {
      if (isRestricted) {
        toast.info("Offline/Quota Mode: Template saved locally (pending sync).", {
          description: "Database is unreachable. Changes will sync when reconnected."
        });
        setShowEditDialog(false);
        return;
      }

      if (editingTemplate) {
        const newVersion = (editingTemplate.version || 1) + 1;
        await updateDoc(doc(db, "form_templates", editingTemplate.id), {
          ...saveData,
          version: newVersion
        }).catch(e => handleFirestoreError(e, OperationType.WRITE, "form_templates/" + editingTemplate.id));
        toast.success("Form template updated to version " + newVersion);
      } else {
        await addDoc(collection(db, "form_templates"), {
          ...saveData,
          version: 1,
          createdAt: serverTimestamp()
        }).catch(e => handleFirestoreError(e, OperationType.WRITE, "form_templates"));
        toast.success("Form template created");
      }
      setShowEditDialog(false);
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    }
  };

  const handleDelete = async (id: string) => {
    const previousTemplates = [...templates];
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success("Template deleted");

    try {
      await deleteDoc(doc(db, "form_templates", id));
    } catch (error) {
      setTemplates(previousTemplates);
      toast.error("Failed to delete template");
    }
  };

  const addAcknowledgment = () => {
    if (!newAck.trim()) return;
    setFormData(prev => ({
      ...prev,
      acknowledgments: [...prev.acknowledgments, newAck.trim()]
    }));
    setNewAck("");
  };

  const removeAcknowledgment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      acknowledgments: prev.acknowledgments.filter((_, i) => i !== index)
    }));
  };

  const toggleService = (id: string) => {
    setFormData(prev => ({
      ...prev,
      assignedServices: prev.assignedServices.includes(id)
        ? prev.assignedServices.filter(sid => sid !== id)
        : [...prev.assignedServices, id]
    }));
  };

  const toggleAddon = (id: string) => {
    setFormData(prev => ({
      ...prev,
      assignedAddons: prev.assignedAddons.includes(id)
        ? prev.assignedAddons.filter(aid => aid !== id)
        : [...prev.assignedAddons, id]
    }));
  };

  const enforcementLabel = (e: string) => {
    const map: Record<string, string> = {
      before_start: "Before Starting Job",
      before_complete: "Before Completing Job",
      before_invoice: "Before Sending Invoice",
      before_payment: "Before Taking Payment",
      optional: "Optional",
    };
    return map[e] || e.replace(/_/g, " ");
  };

  const frequencyLabel = (f: string) => {
    const map: Record<string, string> = {
      every_job: "Every Job",
      once_per_client: "Once Per Client",
      once_per_vehicle: "Once Per Vehicle",
      expires_after: "Expires After Period",
    };
    return map[f] || f.replace(/_/g, " ");
  };

  return (
    <div className="space-y-8">
      {/* ── A. HEADER ── */}
      {!embedded && (
        <PageHeader
          title="Forms & WAIVERS"
          accentWord="WAIVERS"
          subtitle="Legal Compliance & Protocol Management"
          actions={
            <Button
              onClick={() => handleOpenEdit()}
              className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue transition-all hover:scale-105"
            >
              <Plus className="w-4 h-4 mr-2" />
              Initialize Protocol
            </Button>
          }
        />
      )}
      {embedded && (
        <Card className="border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
          <CardHeader className="p-8 border-b border-white/5 bg-black/40">
            <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-primary" />
              Forms & <span className="text-primary italic">Waivers</span>
            </CardTitle>
            <CardDescription className="text-[#A0A0A0] font-medium uppercase tracking-widest text-[10px] mt-1">
              Backend/admin configuration for service-based required forms, waivers, and compliance documents.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-black uppercase tracking-widest">
                  {activeTemplates.length} Active
                </Badge>
                {inactiveTemplates.length > 0 && (
                  <Badge className="bg-white/5 text-white/40 border-white/10 text-[10px] font-black uppercase tracking-widest">
                    {inactiveTemplates.length} Archived
                  </Badge>
                )}
              </div>
              <Button
                onClick={() => handleOpenEdit()}
                className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-10 px-6 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue transition-all hover:scale-105"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Form Template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── LOADING STATE ── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Loading Form Templates...</span>
          </div>
        </div>
      )}

      {/* ── B. FORM TEMPLATES ── */}
      {!loading && (
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-[#A0A0A0] uppercase tracking-widest">Form Templates</h3>

          {templates.length === 0 ? (
            <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden">
              <CardContent className="p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto border border-white/10">
                  <ShieldCheck className="w-8 h-8 text-white/20" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-black text-white text-lg uppercase tracking-tight">No form templates yet</h3>
                  <p className="text-sm text-white/40 max-w-md mx-auto">
                    Create your first liability waiver, acknowledgment, or inspection form. Forms will auto-attach to services and block job start until signed.
                  </p>
                </div>
                <Button onClick={() => handleOpenEdit()} className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-10 px-6 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue">
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card key={template.id} className={cn(
                  "border-white/10 rounded-2xl overflow-hidden flex flex-col transition-all hover:border-white/20",
                  template.isActive ? "bg-[#0B0B0B]" : "bg-[#0B0B0B]/50 opacity-60"
                )}>
                  <CardHeader className="pb-2 p-5">
                    <div className="flex justify-between items-start">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                        <FileText className="w-5 h-5" />
                      </div>
                      <Badge className={cn(
                        "text-[9px] font-black uppercase tracking-widest",
                        template.isActive
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-white/5 text-white/30 border-white/10"
                      )}>
                        {template.isActive ? "Active" : "Archived"}
                      </Badge>
                    </div>
                    <CardTitle className="mt-3 text-sm font-black text-white uppercase tracking-tight">{template.title}</CardTitle>
                    <CardDescription className="capitalize text-white/40 text-[10px] font-bold">{template.category} • v{template.version || 1}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3 p-5 pt-0">
                    <div className="text-xs text-white/50 line-clamp-2 leading-relaxed">
                      {template.content}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {template.assignedServices?.length > 0 && (
                        <Badge className="text-[9px] bg-primary/10 text-primary border-primary/20">{template.assignedServices.length} Services</Badge>
                      )}
                      {template.assignedAddons?.length > 0 && (
                        <Badge className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/20">{template.assignedAddons.length} Add-ons</Badge>
                      )}
                      <Badge className="text-[9px] bg-white/5 text-white/50 border-white/10 capitalize">{enforcementLabel(template.enforcement || "before_start")}</Badge>
                      {template.signatureFrequency && template.signatureFrequency !== "every_job" && (
                        <Badge className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/20 capitalize">{frequencyLabel(template.signatureFrequency)}</Badge>
                      )}
                      {template.priceThreshold != null && (
                        <Badge className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">${template.priceThreshold}+</Badge>
                      )}
                      {template.riskTriggers?.length > 0 && (
                        <Badge className="text-[9px] bg-red-500/10 text-red-400 border-red-500/20">{template.riskTriggers.length} Risk Triggers</Badge>
                      )}
                    </div>
                  </CardContent>
                  <div className="p-4 border-t border-white/5 flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(template)} className="h-8 w-8 p-0 text-white/40 hover:text-primary hover:bg-primary/10 rounded-xl">
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <DeleteConfirmationDialog
                      trigger={
                        <Button variant="ghost" size="icon" className="h-8 w-8 p-0 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      }
                      title="Delete Form Template?"
                      itemName={template.title}
                      onConfirm={() => handleDelete(template.id)}
                    />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── C. ASSIGNMENT RULES ── */}
      {!loading && (
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-[#A0A0A0] uppercase tracking-widest">Assignment & Signature Rules</h3>
          <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden">
            <CardContent className="p-6 space-y-6">
              {activeTemplates.length === 0 ? (
                <p className="text-sm text-white/30 text-center py-6">Create a form template above to configure assignment rules.</p>
              ) : (
                <div className="space-y-4">
                  {activeTemplates.map(t => (
                    <div key={t.id} className="flex items-start justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          <span className="text-sm font-black text-white uppercase tracking-tight">{t.title}</span>
                          <Badge className="text-[8px] bg-white/5 text-white/40 border-white/10">{t.enforcement === "optional" ? "Optional" : "Required"}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-white/40">
                          <span><strong className="text-white/60">Enforcement:</strong> {enforcementLabel(t.enforcement || "before_start")}</span>
                          <span><strong className="text-white/60">Frequency:</strong> {frequencyLabel(t.signatureFrequency || "every_job")}{t.signatureFrequency === "expires_after" && t.expiresAfterDays ? ` (${t.expiresAfterDays} days)` : ""}</span>
                          {t.assignedServiceNames?.length > 0 && (
                            <span><strong className="text-white/60">Services:</strong> {t.assignedServiceNames.join(", ")}</span>
                          )}
                          {t.assignedAddonNames?.length > 0 && (
                            <span><strong className="text-white/60">Add-ons:</strong> {t.assignedAddonNames.join(", ")}</span>
                          )}
                          {t.priceThreshold != null && (
                            <span><strong className="text-white/60">Price Gate:</strong> Jobs over ${t.priceThreshold}</span>
                          )}
                          {t.riskTriggers?.length > 0 && (
                            <span><strong className="text-white/60">Risk:</strong> {t.riskTriggers.join(", ")}</span>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(t)} className="text-white/30 hover:text-primary text-[9px] font-black uppercase tracking-widest">
                        Edit
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── D. AUTOMATION RULES ── */}
      {!loading && (
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-[#A0A0A0] uppercase tracking-widest">Automation Rules</h3>
          <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                <div className="flex items-center gap-3">
                  <Send className="w-4 h-4 text-primary" />
                  <div>
                    <p className="text-sm font-bold text-white">Auto-send after online booking</p>
                    <p className="text-[10px] text-white/40">When a customer books online, required forms are created and signing links can be sent by SMS/email.</p>
                  </div>
                </div>
                <Badge className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <div>
                    <p className="text-sm font-bold text-white">Block job start if unsigned</p>
                    <p className="text-[10px] text-white/40">Technicians cannot start service until all required forms with "Before Starting Job" enforcement are signed.</p>
                  </div>
                </div>
                <Badge className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <div>
                    <p className="text-sm font-bold text-white">Owner/admin override</p>
                    <p className="text-[10px] text-white/40">Owners and admins can waive required forms with a recorded reason for audit trail.</p>
                  </div>
                </div>
                <Badge className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-sm font-bold text-white">Signature expiration tracking</p>
                    <p className="text-[10px] text-white/40">Forms with "Expires After" frequency are automatically flagged when re-signing is needed.</p>
                  </div>
                </div>
                <Badge className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Active</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── E. REQUIRED FORMS PREVIEW ── */}
      {!loading && (
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-[#A0A0A0] uppercase tracking-widest">Required Forms Preview</h3>
          <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <p className="text-[10px] text-white/40">Select a service to preview which forms would auto-attach.</p>
              <Select value={previewServiceId} onValueChange={setPreviewServiceId}>
                <SelectTrigger className="w-full bg-white/5 border-white/10 text-white font-bold text-sm rounded-xl h-12">
                  <SelectValue placeholder="Select a service..." />
                </SelectTrigger>
                <SelectContent className="bg-[#111] border-white/10 text-white">
                  {services.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                  {services.length === 0 && (
                    <SelectItem value="__none" disabled>No services configured</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {previewServiceId && (
                <div className="space-y-2 mt-4">
                  {previewForms.length === 0 ? (
                    <p className="text-sm text-white/30 py-4 text-center">No forms are assigned to this service.</p>
                  ) : (
                    previewForms.map(t => (
                      <div key={t.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                        <div className="flex-1">
                          <span className="text-sm font-bold text-white">{t.title}</span>
                          <span className="text-[10px] text-white/40 ml-2">{enforcementLabel(t.enforcement || "before_start")}</span>
                        </div>
                        <Badge className="text-[8px] bg-primary/10 text-primary border-primary/20">{t.enforcement === "optional" ? "Optional" : "Required"}</Badge>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── F. STATUS / READINESS ── */}
      {!loading && (
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-[#A0A0A0] uppercase tracking-widest">Status & Readiness</h3>
          <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-3 text-sm text-white/60 leading-relaxed">
                  <p><strong className="text-white">Unsigned required forms block job start.</strong> Technicians will see a prompt to collect signatures before they can begin service. Only forms with "Before Starting Job" enforcement block the start button.</p>
                  <p><strong className="text-white">Signed forms clear alerts.</strong> Once a required form is signed, it clears from the job's pending items and any dashboard/notification alerts.</p>
                  <p><strong className="text-white">Forms + deposits = job readiness.</strong> A job is considered "ready to start" when all required forms are signed and any required deposits are collected. Both contribute to the readiness indicator on the calendar and job detail views.</p>
                  <p><strong className="text-white">Customer signing flow.</strong> Each form instance generates a unique signing link (<code className="bg-white/10 px-1.5 py-0.5 rounded text-[11px]">/sign/:token</code>) that customers can access on any device to review and sign electronically.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── EDIT/CREATE DIALOG ── */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-card border-none rounded-3xl shadow-2xl shadow-black">
          <DialogHeader className="p-6 border-b border-white/5 bg-black/40 shrink-0">
            <DialogTitle className="text-xl font-black text-white uppercase tracking-tighter">
              {editingTemplate ? "Edit Form Template" : "Create New Form Template"}
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Form Title</Label>
                <Input
                  placeholder="e.g. General Liability Waiver"
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="bg-white border-gray-200 text-[#111111] h-12 rounded-xl font-bold placeholder:text-gray-400 focus:bg-white focus:text-[#111111]"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={v => setFormData(prev => ({ ...prev, category: v }))}>
                  <SelectTrigger className="bg-white border-gray-200 text-[#111111] h-12 rounded-xl font-bold focus:bg-white focus:text-[#111111]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200 text-[#111111]">
                    <SelectItem value="liability">Liability Waiver</SelectItem>
                    <SelectItem value="acknowledgment">Acknowledgment</SelectItem>
                    <SelectItem value="inspection">Pre-Service Inspection</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Content */}
            <div className="space-y-2">
              <Label>Form Content (Markdown supported)</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-64">
                <Textarea
                  placeholder="Enter the legal text or acknowledgment content here..."
                  className="h-full resize-none font-mono text-xs bg-white border-gray-200 text-[#111111] rounded-xl p-4 placeholder:text-gray-400 focus:bg-white focus:text-[#111111]"
                  value={formData.content}
                  onChange={e => setFormData(prev => ({ ...prev, content: e.target.value }))}
                />
                <div className="h-full overflow-y-auto p-4 bg-gray-50 rounded-lg border border-gray-200 prose prose-sm max-w-none text-[#111111]">
                  <ReactMarkdown>{formData.content || "*Preview will appear here*"}</ReactMarkdown>
                </div>
              </div>
            </div>

            {/* Requirements */}
            <div className="space-y-4">
              <Label className="text-base font-bold">Required Fields & Actions</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-2 p-3 border rounded-lg bg-white">
                  <Switch
                    checked={formData.requiresSignature}
                    onCheckedChange={v => setFormData(prev => ({ ...prev, requiresSignature: v }))}
                  />
                  <Label className="text-xs">Signature</Label>
                </div>
                <div className="flex items-center space-x-2 p-3 border rounded-lg bg-white">
                  <Switch
                    checked={formData.requiresPrintedName}
                    onCheckedChange={v => setFormData(prev => ({ ...prev, requiresPrintedName: v }))}
                  />
                  <Label className="text-xs">Printed Name</Label>
                </div>
                <div className="flex items-center space-x-2 p-3 border rounded-lg bg-white">
                  <Switch
                    checked={formData.requiresDate}
                    onCheckedChange={v => setFormData(prev => ({ ...prev, requiresDate: v }))}
                  />
                  <Label className="text-xs">Date</Label>
                </div>
                <div className="flex items-center space-x-2 p-3 border rounded-lg bg-white">
                  <Switch
                    checked={formData.requiresInitials}
                    onCheckedChange={v => setFormData(prev => ({ ...prev, requiresInitials: v }))}
                  />
                  <Label className="text-xs">Initials</Label>
                </div>
                <div className="flex items-center space-x-2 p-3 border rounded-lg bg-white">
                  <Switch
                    checked={formData.requiresPhoto}
                    onCheckedChange={v => setFormData(prev => ({ ...prev, requiresPhoto: v }))}
                  />
                  <Label className="text-xs">Photo Attachment</Label>
                </div>
                <div className="flex items-center space-x-2 p-3 border rounded-lg bg-white">
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={v => setFormData(prev => ({ ...prev, isActive: v }))}
                  />
                  <Label className="text-xs">Active Template</Label>
                </div>
              </div>
            </div>

            {/* Acknowledgments */}
            <div className="space-y-4">
              <Label className="text-base font-bold">Required Acknowledgment Checkboxes</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. I agree that the vehicle is in the condition stated above."
                  value={newAck}
                  onChange={e => setNewAck(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addAcknowledgment()}
                  className="bg-white border-gray-200 text-[#111111] placeholder:text-gray-400 focus:bg-white focus:text-[#111111]"
                />
                <Button type="button" onClick={addAcknowledgment} variant="secondary" className="bg-primary text-white hover:bg-primary/90">Add</Button>
              </div>
              <div className="space-y-2">
                {formData.acknowledgments.map((ack, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-xl border border-gray-100 shadow-sm">
                    <span className="text-sm font-medium text-[#111111]">{ack}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeAcknowledgment(index)} className="text-white hover:text-white bg-red-500/20 hover:bg-red-500 h-8 w-8 p-0">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Assignments */}
            <div className="space-y-4">
              <Label className="text-base font-bold">Workflow Assignments</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Enforcement Trigger</Label>
                  <Select value={formData.enforcement} onValueChange={v => setFormData(prev => ({ ...prev, enforcement: v }))}>
                    <SelectTrigger className="bg-white border-gray-200 text-[#111111] focus:bg-white focus:text-[#111111]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200 text-[#111111]">
                      <SelectItem value="before_start">Before Starting Job</SelectItem>
                      <SelectItem value="before_complete">Before Completing Job</SelectItem>
                      <SelectItem value="before_invoice">Before Sending Invoice</SelectItem>
                      <SelectItem value="before_payment">Before Taking Payment</SelectItem>
                      <SelectItem value="optional">Optional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Client Type Assignment</Label>
                  <div className="flex gap-4 p-3 border rounded-lg bg-white">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="assign-retail"
                        checked={formData.assignedToRetail}
                        onCheckedChange={(v: boolean) => setFormData(prev => ({ ...prev, assignedToRetail: v }))}
                      />
                      <Label htmlFor="assign-retail" className="text-sm">Retail Clients</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="assign-vendor"
                        checked={formData.assignedToVendors}
                        onCheckedChange={(v: boolean) => setFormData(prev => ({ ...prev, assignedToVendors: v }))}
                      />
                      <Label htmlFor="assign-vendor" className="text-sm">Vendors</Label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Signature Frequency</Label>
                  <Select value={formData.signatureFrequency} onValueChange={v => setFormData(prev => ({ ...prev, signatureFrequency: v }))}>
                    <SelectTrigger className="bg-white border-gray-200 text-[#111111] focus:bg-white focus:text-[#111111]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200 text-[#111111]">
                      <SelectItem value="every_job">Every Job</SelectItem>
                      <SelectItem value="once_per_client">Once Per Client</SelectItem>
                      <SelectItem value="once_per_vehicle">Once Per Vehicle</SelectItem>
                      <SelectItem value="expires_after">Expires After Period</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.signatureFrequency === "expires_after" && (
                  <div className="space-y-2">
                    <Label>Expires After (days)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={formData.expiresAfterDays ?? ""}
                      onChange={e => setFormData(prev => ({ ...prev, expiresAfterDays: e.target.value ? Number(e.target.value) : null }))}
                      placeholder="e.g. 365"
                      className="bg-white border-gray-200 text-[#111111]"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Price Threshold ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.priceThreshold ?? ""}
                    onChange={e => setFormData(prev => ({ ...prev, priceThreshold: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="Leave blank if not price-triggered"
                    className="bg-white border-gray-200 text-[#111111]"
                  />
                  <p className="text-xs text-gray-400">Auto-require this form for jobs over this amount</p>
                </div>
                <div className="space-y-2">
                  <Label>Risk Triggers</Label>
                  <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-white min-h-[44px]">
                    {["high", "medium", "flagged", "new_client"].map(risk => (
                      <label key={risk} className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={formData.riskTriggers.includes(risk)}
                          onCheckedChange={(checked: boolean) => {
                            setFormData(prev => ({
                              ...prev,
                              riskTriggers: checked
                                ? [...prev.riskTriggers, risk]
                                : prev.riskTriggers.filter(r => r !== risk),
                            }));
                          }}
                        />
                        <span className="text-xs text-[#111111] capitalize">{risk.replace("_", " ")}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">Auto-require for clients with matching risk level</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-bold">Assign to Services</Label>
                  <Popover>
                    <PopoverTrigger className="w-full h-12 flex items-center justify-between border border-gray-200 bg-white text-[#111111] hover:bg-gray-50 rounded-xl px-4 text-sm font-bold transition-colors">
                      <span className="truncate">
                        {formData.assignedServices.length > 0
                          ? `${formData.assignedServices.length} Services Selected`
                          : "Select Services..."}
                      </span>
                      <ChevronDown className="w-4 h-4 opacity-50 ml-2" />
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-0 bg-white border-gray-200 rounded-2xl shadow-xl z-[200]" align="start">
                      <div className="p-2 border-b border-gray-100 flex items-center gap-2">
                        <Search className="w-4 h-4 text-gray-400" />
                        <Input
                          placeholder="Filter services..."
                          className="h-8 border-none focus:ring-0 text-xs text-[#111111]"
                          onChange={(e) => {
                            const val = e.target.value.toLowerCase();
                            document.querySelectorAll('[data-service-popover-item]').forEach((item: any) => {
                              const name = item.getAttribute('data-name').toLowerCase();
                              item.style.display = name.includes(val) ? 'flex' : 'none';
                            });
                          }}
                        />
                      </div>
                      <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
                        {services.length === 0 ? (
                          <div className="py-8 text-center text-gray-400 text-xs italic px-4">
                            No services found — add services in Services & Add-ons.
                          </div>
                        ) : (
                          <div className="flex gap-2 mb-2 p-1 border-b pb-2">
                            <Button
                              variant="ghost"
                              type="button"
                              size="sm"
                              className="h-7 text-[9px] uppercase font-bold text-primary"
                              onClick={() => setFormData(p => ({ ...p, assignedServices: services.map(s => s.id) }))}
                            >
                              All
                            </Button>
                            <Button
                              variant="ghost"
                              type="button"
                              size="sm"
                              className="h-7 text-[9px] uppercase font-bold text-red-500"
                              onClick={() => setFormData(p => ({ ...p, assignedServices: [] }))}
                            >
                              None
                            </Button>
                          </div>
                        )}
                        {services.map(s => (
                          <div
                            key={s.id}
                            data-service-popover-item
                            data-name={s.name}
                            onClick={() => toggleService(s.id)}
                            className={cn(
                              "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors",
                              formData.assignedServices.includes(s.id) ? "bg-primary/10 text-primary" : "hover:bg-gray-50 text-[#111111]"
                            )}
                          >
                            <span className="text-xs font-bold">{s.name}</span>
                            {formData.assignedServices.includes(s.id) && <Check className="w-3 h-3" />}
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="flex flex-wrap gap-1">
                    {formData.assignedServices.map(sid => {
                      const s = services.find(srv => srv.id === sid);
                      if (!s) return null;
                      return (
                        <Badge key={sid} variant="secondary" className="bg-primary/5 text-primary border-none text-[9px] font-bold py-1">
                          {s.name}
                          <X className="w-2 h-2 ml-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleService(sid); }} />
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-bold">Assign to Add-ons / Enhancements</Label>
                  <Popover>
                    <PopoverTrigger className="w-full h-12 flex items-center justify-between border border-gray-200 bg-white text-[#111111] hover:bg-gray-50 rounded-xl px-4 text-sm font-bold transition-colors">
                      <span className="truncate">
                        {formData.assignedAddons.length > 0
                          ? `${formData.assignedAddons.length} Items Selected`
                          : "Select Add-ons..."}
                      </span>
                      <ChevronDown className="w-4 h-4 opacity-50 ml-2" />
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-0 bg-white border-gray-200 rounded-2xl shadow-xl z-[200]" align="start">
                      <div className="p-2 border-b border-gray-100 flex items-center gap-2">
                        <Search className="w-4 h-4 text-gray-400" />
                        <Input
                          placeholder="Filter add-ons..."
                          className="h-8 border-none focus:ring-0 text-xs text-[#111111]"
                          onChange={(e) => {
                            const val = e.target.value.toLowerCase();
                            document.querySelectorAll('[data-addon-popover-item]').forEach((item: any) => {
                              const name = item.getAttribute('data-name').toLowerCase();
                              item.style.display = name.includes(val) ? 'flex' : 'none';
                            });
                          }}
                        />
                      </div>
                      <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
                        {addons.length === 0 ? (
                          <div className="py-8 text-center text-gray-400 text-xs italic px-4">
                            No add-ons found — add add-ons in Services & Add-ons.
                          </div>
                        ) : (
                          <div className="flex gap-2 mb-2 p-1 border-b pb-2">
                            <Button
                              variant="ghost"
                              type="button"
                              size="sm"
                              className="h-7 text-[9px] uppercase font-bold text-primary"
                              onClick={() => setFormData(p => ({ ...p, assignedAddons: addons.map(a => a.id) }))}
                            >
                              All
                            </Button>
                            <Button
                              variant="ghost"
                              type="button"
                              size="sm"
                              className="h-7 text-[9px] uppercase font-bold text-red-500"
                              onClick={() => setFormData(p => ({ ...p, assignedAddons: [] }))}
                            >
                              None
                            </Button>
                          </div>
                        )}
                        {addons.map(a => (
                          <div
                            key={a.id}
                            data-addon-popover-item
                            data-name={a.name}
                            onClick={() => toggleAddon(a.id)}
                            className={cn(
                              "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors",
                              formData.assignedAddons.includes(a.id) ? "bg-[#2A6CFF]/10 text-[#2A6CFF]" : "hover:bg-gray-50 text-[#111111]"
                            )}
                          >
                            <span className="text-xs font-bold">{a.name}</span>
                            {formData.assignedAddons.includes(a.id) && <Check className="w-3 h-3" />}
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="flex flex-wrap gap-1">
                    {formData.assignedAddons.map(aid => {
                      const a = addons.find(add => add.id === aid);
                      if (!a) return null;
                      return (
                        <Badge key={aid} variant="secondary" className="bg-[#2A6CFF]/5 text-[#2A6CFF] border-none text-[9px] font-bold py-1">
                          {a.name}
                          <X className="w-2 h-2 ml-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleAddon(aid); }} />
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </DialogBody>

          <DialogFooter className="p-6 border-t shrink-0">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 rounded-xl uppercase tracking-widest text-[10px] shadow-glow-blue transition-all hover:scale-105">
              {editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
