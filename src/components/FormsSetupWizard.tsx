import { useMemo, useState } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { cn } from "../lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Loader2,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  SERVICE_OPTIONS,
  PROTECTION_OPTIONS,
  STYLE_OPTIONS,
  TIMING_OPTIONS,
  RECOMMENDED_TEMPLATES,
  LEGAL_DISCLAIMER,
} from "../data/formDefaults";
import {
  recommendTemplateKeys,
  generateRecommendedTemplates,
} from "../services/formGenerator";
import type { FormsSetupAnswers } from "../types";

interface Props {
  onComplete: () => void;
  onSkip: () => void;
  initialAnswers?: FormsSetupAnswers;
}

const TOTAL_STEPS = 5;

export default function FormsSetupWizard({ onComplete, onSkip, initialAnswers }: Props) {
  const [step, setStep] = useState(1);
  const [services, setServices] = useState<string[]>(initialAnswers?.services ?? []);
  const [protections, setProtections] = useState<string[]>(initialAnswers?.protections ?? []);
  const [style, setStyle] = useState<FormsSetupAnswers["style"]>(initialAnswers?.style ?? "balanced");
  const [timing, setTiming] = useState<FormsSetupAnswers["timing"]>(initialAnswers?.timing ?? "before_start");
  const [generating, setGenerating] = useState(false);

  const answers: FormsSetupAnswers = useMemo(
    () => ({ services, protections, style, timing }),
    [services, protections, style, timing],
  );

  const recommendedKeys = useMemo(() => recommendTemplateKeys(answers), [answers]);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const canAdvance = () => {
    if (step === 1) return services.length > 0;
    if (step === 2) return protections.length > 0;
    return true;
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateRecommendedTemplates(answers);
      await setDoc(
        doc(db, "settings", "business"),
        {
          formsSetupCompleted: true,
          formsSetupAnswers: { ...answers, completedAt: serverTimestamp() },
        },
        { merge: true },
      );
      sessionStorage.removeItem("business_settings_cache");
      sessionStorage.removeItem("business_settings_cache_time");

      if (result.created.length > 0) {
        toast.success(
          `Created ${result.created.length} draft form${result.created.length === 1 ? "" : "s"}.${
            result.skipped.length ? ` ${result.skipped.length} already existed.` : ""
          }`,
        );
      } else if (result.skipped.length > 0) {
        toast.info(`All ${result.skipped.length} recommended forms already exist. Nothing to create.`);
      } else {
        toast.info("Setup complete. No forms were generated.");
      }
      onComplete();
    } catch (e) {
      console.error("Forms setup generation failed", e);
      toast.error("Could not create recommended forms. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const progressPct = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <Card className="border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
      <CardHeader className="p-8 border-b border-white/5 bg-black/40">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-primary" />
              Protect your <span className="text-primary italic">business</span>
            </CardTitle>
            <CardDescription className="text-[#A0A0A0] font-medium text-sm mt-1 normal-case tracking-normal">
              Answer a few questions and DetailFlow will recommend the forms your customers should sign.
            </CardDescription>
          </div>
          <button
            onClick={onSkip}
            className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors"
          >
            Skip for now
          </button>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
            Step {step} of {TOTAL_STEPS}
          </div>
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-8">
        {step === 1 && (
          <Step
            title="What services do you offer?"
            subtitle="Select everything that applies. We'll use this to recommend the right forms."
          >
            <OptionGrid
              options={SERVICE_OPTIONS}
              selected={services}
              onToggle={(v) => toggle(services, setServices, v)}
            />
          </Step>
        )}

        {step === 2 && (
          <Step
            title="What do you want protection for?"
            subtitle="Pick the situations where you want clear customer acknowledgment."
          >
            <OptionGrid
              options={PROTECTION_OPTIONS}
              selected={protections}
              onToggle={(v) => toggle(protections, setProtections, v)}
            />
          </Step>
        )}

        {step === 3 && (
          <Step
            title="How strict should the forms be?"
            subtitle="You can change this any time."
          >
            <div className="space-y-3">
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStyle(opt.value)}
                  className={cn(
                    "w-full text-left rounded-2xl border p-5 transition-all",
                    style === opt.value
                      ? "border-primary/60 bg-primary/10"
                      : "border-white/10 bg-white/5 hover:border-white/20",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0",
                        style === opt.value ? "border-primary bg-primary" : "border-white/30",
                      )}
                    >
                      {style === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="text-sm font-black text-white">{opt.label}</div>
                      <div className="text-xs text-white/50 mt-1">{opt.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Step>
        )}

        {step === 4 && (
          <Step
            title="When should customers sign?"
            subtitle="Default timing for recommended forms. You can override per form later."
          >
            <div className="space-y-3">
              {TIMING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTiming(opt.value)}
                  className={cn(
                    "w-full text-left rounded-2xl border p-5 transition-all",
                    timing === opt.value
                      ? "border-primary/60 bg-primary/10"
                      : "border-white/10 bg-white/5 hover:border-white/20",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0",
                        timing === opt.value ? "border-primary bg-primary" : "border-white/30",
                      )}
                    >
                      {timing === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="text-sm font-black text-white">{opt.label}</div>
                      <div className="text-xs text-white/50 mt-1">{opt.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Step>
        )}

        {step === 5 && (
          <Step
            title="Recommended forms"
            subtitle="These will be created as drafts. You can preview, edit, and activate each one before customers see it."
          >
            <div className="space-y-3">
              {recommendedKeys.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/50">
                  No specific forms matched your answers. We'll still create a General Service Agreement when you continue.
                </div>
              ) : (
                recommendedKeys.map((key) => {
                  const t = RECOMMENDED_TEMPLATES[key];
                  if (!t) return null;
                  return (
                    <div
                      key={key}
                      className="rounded-2xl border border-white/10 bg-white/5 p-5 flex items-start gap-3"
                    >
                      <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <div className="text-sm font-black text-white">{t.title}</div>
                        <div className="text-xs text-white/60 mt-1">{t.shortDescription}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 flex items-start gap-3">
              <Info className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-xs text-yellow-200/80 leading-relaxed">{LEGAL_DISCLAIMER}</p>
            </div>
          </Step>
        )}

        <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || generating}
            className="text-white/60 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {step < TOTAL_STEPS ? (
            <Button
              onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
              disabled={!canAdvance() || generating}
              className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-10 px-6 rounded-xl uppercase tracking-[0.2em] text-[10px]"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-10 px-6 rounded-xl uppercase tracking-[0.2em] text-[10px]"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Create recommended forms
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Step({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-black text-white">{title}</h3>
        <p className="text-sm text-white/50">{subtitle}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

function OptionGrid({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return (
          <label
            key={opt.value}
            className={cn(
              "flex items-center gap-3 rounded-2xl border p-4 cursor-pointer transition-all",
              isSelected
                ? "border-primary/60 bg-primary/10"
                : "border-white/10 bg-white/5 hover:border-white/20",
            )}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggle(opt.value)}
              className="border-white/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
            <Label className="text-sm text-white font-medium cursor-pointer flex-1">{opt.label}</Label>
          </label>
        );
      })}
    </div>
  );
}
