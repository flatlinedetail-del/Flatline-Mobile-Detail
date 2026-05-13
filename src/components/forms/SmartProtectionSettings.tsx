import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveAISettings, DEFAULT_AI_SETTINGS, type AISettings } from "../../services/aiControlService";
import type { FormsAutomationMode } from "../../services/formsAutomationGate";

/**
 * Owner-facing toggles for the FormsStudio Smart Protection feature.
 *
 * Writes to `settings/business → aiSettings` (the existing persistence path
 * used by aiControlService.saveAISettings).
 */
export function SmartProtectionSettings() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "business"), (snap) => {
      const data = snap.data() as { aiSettings?: Partial<AISettings> } | undefined;
      setSettings({ ...DEFAULT_AI_SETTINGS, ...(data?.aiSettings ?? {}) });
    }, (err) => {
      console.warn("[SmartProtectionSettings] settings/business", err);
      setSettings({ ...DEFAULT_AI_SETTINGS });
    });
    return () => unsub();
  }, []);

  const update = async (patch: Partial<AISettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    try {
      await saveAISettings(next);
    } catch (e) {
      console.error("[SmartProtectionSettings] save failed", e);
      toast.error("Could not save Smart Protection settings");
    } finally {
      setSaving(false);
    }
  };

  if (settings === null) {
    return (
      <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl">
        <CardContent className="p-6 flex items-center gap-3 text-white/40 text-xs">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading Smart Protection settings…
        </CardContent>
      </Card>
    );
  }

  const mode: FormsAutomationMode =
    (settings.formsAutomationMode as FormsAutomationMode | undefined) ?? "suggestions_only";

  // Per-feature toggles default-on for recommendations, default-off for the
  // other two. Reading via explicit comparisons so an unset value behaves
  // consistently with the gate.
  const recommendationsOn = settings.enableFormRecommendations !== false;
  const aiGenerationOn = settings.enableAIDocumentGeneration === true;
  const autoAttachOn = settings.enableOnlineBookingAutoAttach === true;

  return (
    <Card className="border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
      <CardHeader className="p-6 border-b border-white/5 bg-black/40">
        <CardTitle className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Smart <span className="text-primary italic">Protection</span>
          {saving && <Loader2 className="w-3.5 h-3.5 text-white/40 animate-spin ml-2" />}
        </CardTitle>
        <CardDescription className="text-[#A0A0A0] text-xs font-medium mt-1">
          Decide how FormsStudio recommends and attaches protection documents to jobs.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-5">
        {/* Automation mode */}
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-white/50">
            Automation mode
          </Label>
          <Select
            value={mode}
            onValueChange={(v) => update({ formsAutomationMode: v as FormsAutomationMode })}
          >
            <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-10 sm:max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off — disable all FormsStudio automation</SelectItem>
              <SelectItem value="suggestions_only">Suggestions only — show recommendation card</SelectItem>
              <SelectItem value="owner_review_required">Owner review required — recommend + pre-generate, never auto-send</SelectItem>
              <SelectItem value="online_booking_auto_attach">Online booking auto-attach (requires terms acceptance)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-white/40 mt-1">
            Launch default is <strong className="text-white/60">Suggestions only</strong>. Owner-side recommendations
            never send or sign anything without your click.
          </p>
        </div>

        {/* Feature toggles */}
        <ToggleRow
          title="Show recommendation card on job creation"
          subtitle="Suggests forms based on the services, add-ons, price, and customer risk on each job."
          checked={recommendationsOn}
          onChange={(v) => update({ enableFormRecommendations: v })}
        />
        <ToggleRow
          title="AI document generation"
          subtitle="Lets owners generate custom protection documents with AI from the recommendation card. Requires accepting the AI document terms first."
          checked={aiGenerationOn}
          onChange={(v) => update({ enableAIDocumentGeneration: v })}
          hint="Off by default. The AI terms acceptance modal ships in a later phase."
        />
        <ToggleRow
          title="Online booking auto-attach"
          subtitle="When customers book themselves online, required protection forms are attached automatically. Only active when the automation mode above is set to 'online booking auto-attach'."
          checked={autoAttachOn}
          onChange={(v) => update({ enableOnlineBookingAutoAttach: v })}
          hint="Off by default. Owner-side flows always require an explicit click."
        />
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  title, subtitle, checked, onChange, hint,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="min-w-0">
        <p className="text-sm font-black text-white">{title}</p>
        <p className="text-xs text-white/55 mt-1 leading-relaxed">{subtitle}</p>
        {hint && <p className="text-[10px] text-white/35 mt-2 italic">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-1 shrink-0" />
    </div>
  );
}
