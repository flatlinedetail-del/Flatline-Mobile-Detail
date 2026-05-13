import { useState, useEffect, useMemo, useCallback } from "react";
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Plus, Sparkles, Eye, Workflow, FileSignature, LayoutDashboard, FileText, ArrowLeft, Wand2 } from "lucide-react";
import type { StudioFormTemplate, WaiverRule } from "../types/waiver";
import type { FormsSetupAnswers } from "../types";
import { loadWaiverRules } from "../services/waiverRulesService";
import { StudioDashboard } from "../components/formsStudio/StudioDashboard";
import { TemplateGallery } from "../components/formsStudio/TemplateGallery";
import { TemplateEditor } from "../components/formsStudio/TemplateEditor";
import { SmartRulesPanel } from "../components/formsStudio/SmartRulesPanel";
import { SignedDocumentsPanel } from "../components/formsStudio/SignedDocumentsPanel";
import { AIDraftModal } from "../components/formsStudio/AIDraftModal";
import { CustomerPreviewModal } from "../components/formsStudio/CustomerPreviewModal";
import { BuilderDirections } from "../components/formsStudio/HelpUI";
import FormsSetupWizard from "../components/FormsSetupWizard";
import { SmartProtectionSettings } from "../components/forms/SmartProtectionSettings";
import { cn } from "../lib/utils";

type StudioView = "dashboard" | "templates" | "editor" | "rules" | "signed";

interface Props {
  embedded?: boolean;
}

export default function FormsStudio({ embedded = false }: Props) {
  const { profile, loading: authLoading, canAccessManager } = useAuth();
  const [view, setView] = useState<StudioView>("dashboard");
  const [templates, setTemplates] = useState<StudioFormTemplate[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [rules, setRules] = useState<WaiverRule[]>([]);
  const [signedForms, setSignedForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingTemplate, setEditingTemplate] = useState<StudioFormTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<StudioFormTemplate | null>(null);
  const [showAIDraft, setShowAIDraft] = useState(false);

  const [formsSetupCompleted, setFormsSetupCompleted] = useState<boolean | null>(null);
  const [formsSetupAnswers, setFormsSetupAnswers] = useState<FormsSetupAnswers | undefined>(undefined);
  const [forceShowWizard, setForceShowWizard] = useState(false);

  // Live data subscriptions
  useEffect(() => {
    if (authLoading || !profile || !canAccessManager) return;

    const subs: (() => void)[] = [];

    subs.push(onSnapshot(
      query(collection(db, "form_templates")),
      snap => {
        setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as StudioFormTemplate)));
        setLoading(false);
      },
      err => {
        console.error("[FormsStudio] templates", err);
        handleFirestoreError(err, OperationType.GET, "form_templates");
        setLoading(false);
      },
    ));

    subs.push(onSnapshot(collection(db, "services"), snap => {
      setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {}));

    subs.push(onSnapshot(collection(db, "addons"), snap => {
      setAddons(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {}));

    subs.push(onSnapshot(collection(db, "signed_forms"), snap => {
      setSignedForms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {}));

    // Rules — load once, refresh on save
    loadWaiverRules().then(setRules).catch(err => {
      console.warn("[FormsStudio] rules", err);
    });

    return () => { subs.forEach(s => s()); };
  }, [authLoading, profile, canAccessManager]);

  // Setup-wizard gate — keyed on profile?.uid (stable primitive) to avoid the
  // re-subscribe loop that previously bit FormsBuilder when depending on the
  // whole profile object.
  useEffect(() => {
    if (authLoading || !profile || !canAccessManager) return;
    const unsub = onSnapshot(
      doc(db, "settings", "business"),
      (snap) => {
        const data = snap.data() as { formsSetupCompleted?: boolean; formsSetupAnswers?: FormsSetupAnswers } | undefined;
        setFormsSetupCompleted(data?.formsSetupCompleted === true);
        setFormsSetupAnswers(data?.formsSetupAnswers);
      },
      (err) => {
        console.warn("[FormsStudio] settings/business", err);
        setFormsSetupCompleted(false);
      },
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid, authLoading, canAccessManager]);

  const isSetupComplete = useMemo(() => {
    if (formsSetupCompleted === null) return null;
    if (formsSetupCompleted === true) return true;
    if (templates.length > 0) return true;
    return false;
  }, [formsSetupCompleted, templates.length]);

  const shouldShowWizard = forceShowWizard || isSetupComplete === false;
  const shouldShowMainUI = isSetupComplete !== null && !shouldShowWizard;

  const handleSkipSetup = useCallback(async () => {
    try {
      await setDoc(
        doc(db, "settings", "business"),
        { formsSetupCompleted: true },
        { merge: true },
      );
      sessionStorage.removeItem("business_settings_cache");
      sessionStorage.removeItem("business_settings_cache_time");
    } catch (e) {
      console.error("[FormsStudio] skip setup failed", e);
    }
    setForceShowWizard(false);
  }, []);

  const refreshRules = useCallback(async () => {
    try {
      const r = await loadWaiverRules();
      setRules(r);
    } catch (err) {
      console.warn("[FormsStudio] refreshRules", err);
    }
  }, []);

  const saveTemplate = useCallback(async (tpl: StudioFormTemplate) => {
    try {
      const { id, ...data } = tpl;
      const payload = {
        ...data,
        version: (data.version ?? 0) + 1,
        updatedAt: serverTimestamp(),
        updatedBy: profile?.uid ?? null,
      };
      if (id && id !== "__new__") {
        await updateDoc(doc(db, "form_templates", id), payload as any);
        toast.success("Template saved");
      } else {
        await addDoc(collection(db, "form_templates"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: profile?.uid ?? null,
        });
        toast.success("Template created");
      }
      setEditingTemplate(null);
      setView("templates");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Failed to save template");
    }
  }, [profile]);

  const deleteTemplate = useCallback(async (templateId: string) => {
    try {
      await deleteDoc(doc(db, "form_templates", templateId));
      toast.success("Template deleted");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete");
    }
  }, []);

  const archiveTemplate = useCallback(async (templateId: string, archived: boolean) => {
    try {
      await updateDoc(doc(db, "form_templates", templateId), {
        status: archived ? "archived" : "active",
        isActive: !archived,
        updatedAt: serverTimestamp(),
      });
      toast.success(archived ? "Template archived" : "Template restored");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    }
  }, []);

  const duplicateTemplate = useCallback(async (tpl: StudioFormTemplate) => {
    try {
      const { id, createdAt, updatedAt, ...rest } = tpl;
      await addDoc(collection(db, "form_templates"), {
        ...rest,
        title: `${tpl.title} (Copy)`,
        status: "draft",
        isActive: false,
        version: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: profile?.uid ?? null,
      });
      toast.success("Template duplicated");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to duplicate");
    }
  }, [profile]);

  const handleCreateNew = () => {
    setEditingTemplate({
      id: "__new__",
      title: "Untitled Waiver",
      category: "liability",
      content: "",
      acknowledgments: [],
      requiresSignature: true,
      requiresPrintedName: true,
      requiresDate: true,
      requiresInitials: false,
      requiresPhoto: false,
      isActive: false,
      version: 1,
      assignedServices: [],
      assignedAddons: [],
      assignedToRetail: true,
      assignedToVendors: false,
      enforcement: "before_start",
      signatureFrequency: "every_job",
      status: "draft",
      riskLevel: "medium",
      requiredByDefault: true,
      blocks: [],
    });
    setView("editor");
  };

  const openEditor = (tpl: StudioFormTemplate) => {
    setEditingTemplate(tpl);
    setView("editor");
  };

  // ── Permission gate ──────────────────────────────────────────────────────
  if (!authLoading && (!profile || !canAccessManager)) {
    return (
      <div className="p-8 text-center text-white/40 text-xs font-black uppercase tracking-widest">
        Access restricted to managers and admins.
      </div>
    );
  }

  if (loading || isSetupComplete === null) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", embedded ? "" : "p-6 md:p-8")}>
      {/* ─── Premium Studio Header ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0B0B0B] via-[#0B0B0B] to-[#0A4DFF]/10 p-6 md:p-8 shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(10,77,255,0.18),transparent_60%)] pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center shadow-glow-blue">
              <ShieldCheck className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight font-heading">
                Forms & Waivers <span className="text-primary italic">Studio</span>
              </h1>
              <p className="text-[10px] md:text-xs text-white/50 font-medium uppercase tracking-widest mt-1">
                Legal Protection · Document Automation · Customer Signing Workflows
              </p>
            </div>
          </div>

          {view !== "editor" && shouldShowMainUI && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setForceShowWizard(true)}
                className="text-white/60 hover:text-white font-black uppercase tracking-widest rounded-xl text-xs h-10"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Setup
              </Button>
              <Button
                onClick={() => setShowAIDraft(true)}
                className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 font-black uppercase tracking-widest rounded-xl text-xs h-10"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                AI Draft
              </Button>
              <Button
                onClick={handleCreateNew}
                className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest rounded-xl text-xs h-10 shadow-glow-blue"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Template
              </Button>
            </div>
          )}

          {view === "editor" && (
            <Button
              variant="ghost"
              onClick={() => { setEditingTemplate(null); setView("templates"); }}
              className="text-white/70 hover:text-white hover:bg-white/5 font-black uppercase tracking-widest text-xs h-10 rounded-xl"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Templates
            </Button>
          )}
        </div>

        {/* Sub-navigation */}
        {view !== "editor" && shouldShowMainUI && (
          <div className="relative mt-6 flex items-center gap-1 overflow-x-auto custom-scrollbar -mx-1 px-1">
            {[
              { key: "dashboard", label: "Overview", icon: LayoutDashboard },
              { key: "templates", label: "Templates", icon: FileText },
              { key: "rules", label: "Smart Rules", icon: Workflow },
              { key: "signed", label: "Signed Documents", icon: FileSignature },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setView(item.key as StudioView)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shrink-0",
                  view === item.key
                    ? "bg-primary text-white shadow-glow-blue"
                    : "text-white/50 hover:text-white hover:bg-white/5",
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Setup Wizard ────────────────────────────────────────────────── */}
      {shouldShowWizard && isSetupComplete !== null && (
        <FormsSetupWizard
          initialAnswers={formsSetupAnswers}
          onComplete={() => setForceShowWizard(false)}
          onSkip={handleSkipSetup}
        />
      )}

      {/* ─── Body ─────────────────────────────────────────────────────── */}
      {/* Studio-level quick guide — shown on dashboard + templates views, dismissible. */}
      {shouldShowMainUI && (view === "dashboard" || view === "templates") && (
        <BuilderDirections variant="studio" storageKey="formsStudio.studioDirections" />
      )}

      {shouldShowMainUI && view === "dashboard" && (
        <StudioDashboard
          templates={templates}
          rules={rules}
          signedForms={signedForms}
          onNewTemplate={handleCreateNew}
          onAIDraft={() => setShowAIDraft(true)}
          onPreview={() => {
            const first = templates.find(t => (t.status ?? (t.isActive ? "active" : "draft")) === "active") ?? templates[0];
            if (first) setPreviewTemplate(first);
            else toast.info("Create a template first");
          }}
          onManageRules={() => setView("rules")}
          onViewSigned={() => setView("signed")}
          onOpenTemplates={() => setView("templates")}
        />
      )}

      {shouldShowMainUI && view === "dashboard" && (
        <SmartProtectionSettings />
      )}

      {shouldShowMainUI && view === "templates" && (
        <TemplateGallery
          templates={templates}
          services={services}
          addons={addons}
          signedForms={signedForms}
          onEdit={openEditor}
          onPreview={setPreviewTemplate}
          onDuplicate={duplicateTemplate}
          onArchive={archiveTemplate}
          onDelete={deleteTemplate}
          onNew={handleCreateNew}
          onAIDraft={() => setShowAIDraft(true)}
        />
      )}

      {shouldShowMainUI && view === "editor" && editingTemplate && (
        <TemplateEditor
          template={editingTemplate}
          services={services}
          addons={addons}
          onChange={setEditingTemplate}
          onSave={() => saveTemplate(editingTemplate)}
          onCancel={() => { setEditingTemplate(null); setView("templates"); }}
          onPreview={() => setPreviewTemplate(editingTemplate)}
        />
      )}

      {shouldShowMainUI && view === "rules" && (
        <SmartRulesPanel
          rules={rules}
          templates={templates}
          services={services}
          addons={addons}
          onRefresh={refreshRules}
        />
      )}

      {shouldShowMainUI && view === "signed" && (
        <SignedDocumentsPanel
          signedForms={signedForms}
          templates={templates}
        />
      )}

      {/* ─── Modals ───────────────────────────────────────────────────── */}
      {previewTemplate && (
        <CustomerPreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
        />
      )}

      {showAIDraft && (
        <AIDraftModal
          onClose={() => setShowAIDraft(false)}
          onApply={(draft) => {
            // Informational documents (aftercare / brochure / follow-up email / etc.)
            // default to no signature / initials / printed-name unless the owner
            // explicitly toggled "Requires customer acknowledgment" in the modal.
            const isInfoNoAck = draft.documentClass === "informational" && !draft.requiresAcknowledgment;
            setEditingTemplate({
              id: "__new__",
              title: draft.title,
              category: draft.category,
              content: draft.content,
              acknowledgments: draft.acknowledgments ?? [],
              requiresSignature: !isInfoNoAck,
              requiresPrintedName: !isInfoNoAck,
              requiresDate: !isInfoNoAck,
              requiresInitials: !isInfoNoAck && (draft.requiresInitials ?? false),
              requiresPhoto: false,
              isActive: false,
              version: 1,
              assignedServices: [],
              assignedAddons: [],
              assignedToRetail: true,
              assignedToVendors: false,
              enforcement: "before_start",
              signatureFrequency: "every_job",
              status: "draft",
              riskLevel: draft.riskLevel ?? "medium",
              requiredByDefault: !isInfoNoAck,
              blocks: draft.blocks ?? [],
              customerTitle: draft.customerTitle,
              internalDescription: draft.internalDescription,
              documentClass: draft.documentClass,
            });
            setShowAIDraft(false);
            setView("editor");
          }}
        />
      )}
    </div>
  );
}
