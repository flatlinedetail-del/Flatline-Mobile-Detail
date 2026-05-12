import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Wand2, AlertTriangle, Plus, Trash2, PenLine,
  ArrowLeft, ArrowRight, ListChecks, MessageSquare, FileText,
  ShieldCheck, EyeOff, Check, ChevronDown, ChevronUp, Edit2, X,
  Workflow,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import type { WaiverRiskLevel } from "../../types/waiver";
import { makeId } from "./studioUtils";
import { InfoTip, HelpHint } from "./HelpUI";
import {
  INTERVIEW_STEPS,
  buildProposedClauses,
  buildDraftFromClauses,
  type CustomProtection,
  type DraftOutput,
  type InterviewAnswers,
  type ProposedClause,
  type Tone,
} from "./aiDraftEngine";

interface Props {
  onClose: () => void;
  onApply: (draft: DraftOutput) => void;
}

type ModalStep = "configure" | "interview" | "review";

const PROTECTIONS = [
  { key: "preExistingDamage", label: "Pre-existing damage" },
  { key: "paintCorrection",   label: "Paint correction risk" },
  { key: "ceramicCoating",    label: "Ceramic coating cure & maintenance" },
  { key: "interiorStain",     label: "Interior stain limitations" },
  { key: "petHair",           label: "Pet hair limitations" },
  { key: "cancellation",      label: "Cancellation / no-show policy" },
  { key: "paymentTerms",      label: "Payment terms" },
  { key: "lateFees",          label: "Late fees" },
  { key: "photoAuth",         label: "Photo authorization" },
  { key: "mobileAccess",      label: "Mobile access permission" },
];

const TONE_OPTIONS = [
  { value: "customer", label: "Customer-Friendly" },
  { value: "balanced", label: "Balanced" },
  { value: "strict",   label: "Strict" },
];

const WAIVER_TYPES = [
  { value: "general",      label: "General Authorization" },
  { value: "liability",    label: "Liability Release" },
  { value: "ceramic",      label: "Ceramic Coating Agreement" },
  { value: "paint",        label: "Paint Correction Acknowledgment" },
  { value: "interior",     label: "Interior Condition" },
  { value: "cancellation", label: "Cancellation Policy" },
  { value: "payment",      label: "Payment Terms" },
  { value: "photo",        label: "Photo / Media Release" },
  { value: "mobile",       label: "Mobile Access Permission" },
];

export function AIDraftModal({ onClose, onApply }: Props) {
  // ─── Wizard state ────────────────────────────────────────────────────
  const [step, setStep] = useState<ModalStep>("configure");

  // Configure step
  const [prompt, setPrompt] = useState("");
  const [waiverType, setWaiverType] = useState("liability");
  const [serviceType, setServiceType] = useState("");
  const [tone, setTone] = useState<Tone>("balanced");
  const [riskLevel, setRiskLevel] = useState<WaiverRiskLevel>("medium");
  const [selectedProtections, setSelectedProtections] = useState<string[]>([
    "preExistingDamage", "paymentTerms", "photoAuth",
  ]);
  const [customProtections, setCustomProtections] = useState<CustomProtection[]>([]);

  // Interview state
  const [interviewIndex, setInterviewIndex] = useState(0);
  const [interviewAnswers, setInterviewAnswers] = useState<InterviewAnswers>({
    blockUntilSigned: ["job_start"],
    allowAIPolish: true,
  });

  // Review state
  const [proposedClauses, setProposedClauses] = useState<ProposedClause[]>([]);

  const [generating, setGenerating] = useState(false);

  // ─── Configure helpers ──────────────────────────────────────────────
  const toggleProtection = (key: string) => {
    setSelectedProtections(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };
  const addCustom = () => setCustomProtections(prev => [
    ...prev, { id: makeId(), title: "", description: "", requireAck: false, requireInitials: false },
  ]);
  const updateCustom = (id: string, patch: Partial<CustomProtection>) =>
    setCustomProtections(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  const removeCustom = (id: string) => setCustomProtections(prev => prev.filter(c => c.id !== id));

  // ─── Flow handlers ──────────────────────────────────────────────────

  const buildDraftInput = () => ({
    prompt, waiverType, serviceType, tone, riskLevel,
    selectedProtections, customProtections,
    interviewAnswers, interviewCompleted: step === "review",
  });

  const validateConfigure = (): boolean => {
    if (customProtections.find(c => !c.title.trim())) {
      toast.error("Each custom protection needs a title.");
      return false;
    }
    return true;
  };

  const handleStartInterview = () => {
    if (!validateConfigure()) return;
    setInterviewIndex(0);
    setStep("interview");
  };

  const handleGenerateNow = () => {
    if (!validateConfigure()) return;
    setGenerating(true);
    setTimeout(() => {
      const clauses = buildProposedClauses(buildDraftInput());
      setProposedClauses(clauses);
      setStep("review");
      setGenerating(false);
    }, 400);
  };

  const handleInterviewNext = () => {
    if (interviewIndex < INTERVIEW_STEPS.length - 1) {
      setInterviewIndex(i => i + 1);
    } else {
      // End of interview — build proposed clauses
      setGenerating(true);
      setTimeout(() => {
        const clauses = buildProposedClauses({ ...buildDraftInput(), interviewCompleted: true });
        setProposedClauses(clauses);
        setStep("review");
        setGenerating(false);
      }, 400);
    }
  };

  const handleInterviewBack = () => {
    if (interviewIndex > 0) setInterviewIndex(i => i - 1);
    else setStep("configure");
  };

  const updateAnswer = <K extends keyof InterviewAnswers>(key: K, value: InterviewAnswers[K]) => {
    setInterviewAnswers(prev => ({ ...prev, [key]: value }));
  };

  const handleApplyDraft = () => {
    if (proposedClauses.length === 0) {
      toast.error("Add at least one clause before creating the draft.");
      return;
    }
    setGenerating(true);
    const draft = buildDraftFromClauses(buildDraftInput(), proposedClauses);
    onApply(draft);
    setGenerating(false);
  };

  const updateClause = (id: string, patch: Partial<ProposedClause>) => {
    setProposedClauses(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  };
  const updateClauseActivation = (id: string, patch: Partial<ProposedClause["activation"]>) => {
    setProposedClauses(prev => prev.map(c => c.id === id ? { ...c, activation: { ...c.activation, ...patch } } : c));
  };
  const removeClause = (id: string) => setProposedClauses(prev => prev.filter(c => c.id !== id));
  const addEmptyClause = () => setProposedClauses(prev => [
    ...prev,
    {
      id: makeId(),
      title: "New Clause",
      text: "",
      category: "custom",
      customerVisible: true,
      requireAcceptance: true,
      requireInitials: false,
      requireSignature: false,
      optionalConsent: false,
      activation: {
        appliesToSelectedServices: false,
        appliesToSelectedRiskFlags: false,
        showBeforeBooking: false,
        showBeforeJobStart: true,
        attachToInvoice: false,
        requireBeforePayment: false,
        requireBeforeTechBegins: true,
      },
      source: "custom",
    },
  ]);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
                <Wand2 className="w-5 h-5 text-purple-300" />
              </div>
              <div className="min-w-0">
                <DialogTitle>Generate Waiver With AI</DialogTitle>
                <p className="text-[10px] uppercase tracking-widest font-black text-white/40 mt-1">
                  Drafting Assistant · Review Before Use
                </p>
              </div>
            </div>
            <StepIndicator step={step} />
          </div>
        </DialogHeader>

        <DialogBody className="p-4 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {step === "configure" && (
            <ConfigureStep
              prompt={prompt} setPrompt={setPrompt}
              waiverType={waiverType} setWaiverType={setWaiverType}
              serviceType={serviceType} setServiceType={setServiceType}
              tone={tone} setTone={setTone}
              riskLevel={riskLevel} setRiskLevel={setRiskLevel}
              selectedProtections={selectedProtections} toggleProtection={toggleProtection}
              customProtections={customProtections}
              addCustom={addCustom} updateCustom={updateCustom} removeCustom={removeCustom}
            />
          )}

          {step === "interview" && (
            <InterviewStepView
              index={interviewIndex}
              answers={interviewAnswers}
              onUpdate={updateAnswer}
            />
          )}

          {step === "review" && (
            <ReviewStep
              clauses={proposedClauses}
              updateClause={updateClause}
              updateClauseActivation={updateClauseActivation}
              removeClause={removeClause}
              addEmptyClause={addEmptyClause}
            />
          )}

          <LegalNotice />
        </DialogBody>

        <DialogFooter>
          {step === "configure" && (
            <>
              <Button variant="ghost" onClick={onClose} className="text-white/60 hover:text-white">
                Cancel
              </Button>
              <Button
                onClick={handleGenerateNow}
                disabled={generating}
                variant="outline"
                className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black uppercase tracking-widest rounded-xl text-xs h-10"
              >
                <Sparkles className={cn("w-4 h-4 mr-2", generating && "animate-spin")} />
                Generate Draft Now
              </Button>
              <Button
                onClick={handleStartInterview}
                disabled={generating}
                className="bg-purple-500 hover:bg-purple-500/90 text-white font-black uppercase tracking-widest rounded-xl shadow-glow-blue h-10"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Start AI Questions
              </Button>
            </>
          )}

          {step === "interview" && (
            <>
              <Button variant="ghost" onClick={handleInterviewBack} className="text-white/60 hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {interviewIndex === 0 ? "Back to setup" : "Back"}
              </Button>
              <Button
                variant="outline"
                onClick={handleInterviewNext}
                className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black uppercase tracking-widest rounded-xl text-xs h-10"
              >
                Skip
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                onClick={handleInterviewNext}
                disabled={generating}
                className="bg-purple-500 hover:bg-purple-500/90 text-white font-black uppercase tracking-widest rounded-xl shadow-glow-blue h-10"
              >
                {interviewIndex === INTERVIEW_STEPS.length - 1 ? (
                  <>Build Proposed Clauses <Sparkles className={cn("w-4 h-4 ml-2", generating && "animate-spin")} /></>
                ) : (
                  <>Next <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </Button>
            </>
          )}

          {step === "review" && (
            <>
              <Button variant="ghost" onClick={() => setStep("configure")} className="text-white/60 hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Adjust Setup
              </Button>
              <Button
                onClick={handleApplyDraft}
                disabled={generating || proposedClauses.length === 0}
                className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest rounded-xl shadow-glow-blue h-10"
              >
                <FileText className="w-4 h-4 mr-2" />
                Create Editable Draft
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Step Indicator ────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: ModalStep }) {
  const stepNum = step === "configure" ? 1 : step === "interview" ? 2 : 3;
  return (
    <div className="hidden sm:flex items-center gap-1 shrink-0 mr-2">
      {[
        { n: 1, label: "Setup" },
        { n: 2, label: "Interview" },
        { n: 3, label: "Review" },
      ].map((s, i) => (
        <div key={s.n} className="flex items-center gap-1">
          <div
            className={cn(
              "w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black",
              stepNum >= s.n
                ? "bg-purple-500/20 text-purple-200 border border-purple-500/40"
                : "bg-white/[0.03] text-white/30 border border-white/10",
            )}
          >
            {s.n}
          </div>
          {i < 2 && <div className={cn("w-3 h-px", stepNum > s.n ? "bg-purple-500/60" : "bg-white/10")} />}
        </div>
      ))}
    </div>
  );
}

// ─── Legal Notice ──────────────────────────────────────────────────────────

function LegalNotice() {
  return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <p className="text-xs text-amber-200/70 leading-relaxed">
        <span className="font-black uppercase tracking-widest text-amber-300">Not Legal Advice.</span>
        {" "}AI-generated waiver drafts are starter documents only and must be reviewed and adapted by a qualified attorney before customer use. Nothing is sent to customers until you activate the document.
      </p>
    </div>
  );
}

// ─── Configure step ────────────────────────────────────────────────────────

interface ConfigureProps {
  prompt: string;
  setPrompt: (v: string) => void;
  waiverType: string;
  setWaiverType: (v: string) => void;
  serviceType: string;
  setServiceType: (v: string) => void;
  tone: Tone;
  setTone: (v: Tone) => void;
  riskLevel: WaiverRiskLevel;
  setRiskLevel: (v: WaiverRiskLevel) => void;
  selectedProtections: string[];
  toggleProtection: (k: string) => void;
  customProtections: CustomProtection[];
  addCustom: () => void;
  updateCustom: (id: string, patch: Partial<CustomProtection>) => void;
  removeCustom: (id: string) => void;
}

function ConfigureStep(p: ConfigureProps) {
  return (
    <>
      <HelpHint>
        Describe the waiver you need in plain English, pick the protections that apply, and choose whether you want an AI-guided interview or a quick draft. Nothing is sent to customers until you activate it.
      </HelpHint>

      {/* ── MAIN PROMPT ─────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-purple-500/25 bg-gradient-to-br from-purple-500/[0.06] via-[#0B0B0B] to-[#0B0B0B] p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
            <MessageSquare className="w-3.5 h-3.5 text-purple-200" />
          </div>
          <Label className="text-xs font-black uppercase tracking-widest text-purple-200">
            Tell AI what kind of waiver you need
          </Label>
          <InfoTip title="Plain-English prompt" size={12}>
            Describe the document you want in your own words — what it covers, who it applies to, the risks and clauses you want included. The AI uses this as the starting point for both the interview questions and the proposed clause list.
          </InfoTip>
        </div>

        <Textarea
          value={p.prompt}
          onChange={e => p.setPrompt(e.target.value)}
          rows={5}
          placeholder="Describe the waiver or agreement you want to create. Example: I need a liability waiver for mobile ceramic coating jobs that protects us from pre-existing paint damage, explains coating cure time, requires the customer to maintain the coating properly, includes payment terms, and requires initials beside the high-risk clauses."
          className="bg-white/5 border-white/10 text-white rounded-2xl text-sm leading-relaxed resize-y min-h-[120px]"
        />
      </div>

      {/* ── CONFIGURATION ───────────────────────────────────────────── */}
      <div>
        <SectionLabel>Configuration</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <div>
            <Label className="text-[10px] font-black uppercase tracking-widest text-white/50">Waiver Type</Label>
            <Select value={p.waiverType} onValueChange={p.setWaiverType}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WAIVER_TYPES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] font-black uppercase tracking-widest text-white/50">Service Focus</Label>
            <Input
              value={p.serviceType}
              onChange={e => p.setServiceType(e.target.value)}
              placeholder="e.g. Premium ceramic coating"
              className="bg-white/5 border-white/10 text-white rounded-xl mt-1"
            />
          </div>
          <div>
            <Label className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1.5">
              Tone
              <InfoTip title="Tone" size={12}>
                Customer-Friendly is warm and approachable. Balanced is plain professional. Strict reads more like a formal legal document.
              </InfoTip>
            </Label>
            <Select value={p.tone} onValueChange={(v: any) => p.setTone(v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] font-black uppercase tracking-widest text-white/50">Risk Level</Label>
            <Select value={p.riskLevel} onValueChange={(v: any) => p.setRiskLevel(v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low Risk</SelectItem>
                <SelectItem value="medium">Moderate</SelectItem>
                <SelectItem value="high">High Risk</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── RISK PROTECTIONS ────────────────────────────────────────── */}
      <div>
        <SectionLabel>Risk Protections</SectionLabel>
        <p className="text-[10px] text-white/40 mb-2 mt-1">Pick the standard protections you want the AI to include.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PROTECTIONS.map(item => {
            const checked = p.selectedProtections.includes(item.key);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => p.toggleProtection(item.key)}
                className={cn(
                  "flex items-center gap-2 p-2.5 rounded-xl border text-left transition",
                  checked
                    ? "bg-primary/10 border-primary/30 text-white"
                    : "bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/[0.05]",
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0",
                  checked ? "border-primary bg-primary" : "border-white/30",
                )}>
                  {checked && <Sparkles className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="text-xs font-bold">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CUSTOM CLAUSES ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Custom Protections / Clauses</SectionLabel>
          <Button
            type="button"
            size="sm"
            onClick={p.addCustom}
            className="bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 border border-purple-500/30 font-black uppercase tracking-widest rounded-xl text-[10px] h-8"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Custom Protection
          </Button>
        </div>

        {p.customProtections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30">No custom clauses</p>
            <p className="text-[10px] text-white/30 mt-1">
              Write rough instructions and the AI will turn them into polished clause language.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {p.customProtections.map((c, idx) => (
              <div key={c.id} className="rounded-2xl border border-purple-500/20 bg-purple-500/[0.04] p-3 sm:p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 text-[10px] font-black shrink-0">
                    {idx + 1}
                  </div>
                  <Input
                    autoFocus={!c.title}
                    value={c.title}
                    onChange={e => p.updateCustom(c.id, { title: e.target.value })}
                    placeholder="Custom clause title (e.g. Wheel Acid Risk)"
                    className="flex-1 bg-white/5 border-white/10 text-white rounded-xl h-9 text-sm font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => p.removeCustom(c.id)}
                    aria-label="Remove custom protection"
                    className="w-9 h-9 rounded-lg text-red-300 hover:text-red-200 hover:bg-red-500/10 border border-white/10 flex items-center justify-center shrink-0 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <Textarea
                  value={c.description}
                  onChange={e => p.updateCustom(c.id, { description: e.target.value })}
                  placeholder="Rough instructions (the AI will polish). e.g. 'Make this clause say the customer understands we are not responsible for scratches, oxidation, failing clear coat, rock chips, or damage hidden by dirt before the vehicle is washed.'"
                  rows={3}
                  className="bg-white/5 border-white/10 text-white rounded-xl text-xs leading-relaxed resize-y"
                />

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
                  <ToggleRow
                    icon="ack"
                    label="Require acknowledgment"
                    desc="Adds a checkbox block"
                    checked={c.requireAck}
                    onChange={v => p.updateCustom(c.id, { requireAck: v })}
                  />
                  <ToggleRow
                    icon="initials"
                    label="Require initials"
                    desc="Adds an initials block"
                    checked={c.requireInitials}
                    onChange={v => p.updateCustom(c.id, { requireInitials: v })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Interview step ────────────────────────────────────────────────────────

interface InterviewProps {
  index: number;
  answers: InterviewAnswers;
  onUpdate: <K extends keyof InterviewAnswers>(key: K, value: InterviewAnswers[K]) => void;
}

function InterviewStepView({ index, answers, onUpdate }: InterviewProps) {
  const step = INTERVIEW_STEPS[index];
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-purple-500/20 bg-gradient-to-br from-purple-500/[0.06] via-[#0B0B0B] to-[#0B0B0B] p-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-200 text-[10px] font-black">
            {index + 1}/{INTERVIEW_STEPS.length}
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-purple-200">AI Waiver Interview</p>
        </div>
        <h3 className="text-xl font-black text-white tracking-tight">{step.title}</h3>
        {step.intro && <p className="text-xs text-white/60 mt-1">{step.intro}</p>}
      </div>

      {step.questions.map(q => (
        <Question key={q.id as string} q={q} answers={answers} onUpdate={onUpdate} />
      ))}
    </div>
  );
}

function Question({
  q, answers, onUpdate,
}: {
  q: typeof INTERVIEW_STEPS[number]["questions"][number];
  answers: InterviewAnswers;
  onUpdate: <K extends keyof InterviewAnswers>(key: K, value: InterviewAnswers[K]) => void;
}) {
  const value = (answers as any)[q.id];

  return (
    <div className="space-y-2">
      <Label className="text-sm font-bold text-white">{q.label}</Label>
      {q.help && <p className="text-[10px] text-white/40">{q.help}</p>}

      {q.kind === "radio" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {q.options.map(opt => {
            const checked = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onUpdate(q.id, opt.value as any)}
                className={cn(
                  "p-3 rounded-xl border text-left transition",
                  checked
                    ? "bg-primary/10 border-primary/40 text-white"
                    : "bg-white/[0.03] border-white/10 text-white/70 hover:bg-white/[0.06]",
                )}
              >
                <p className="text-xs font-black uppercase tracking-tight">{opt.label}</p>
                {opt.desc && <p className="text-[10px] text-white/40 mt-1 normal-case font-medium">{opt.desc}</p>}
              </button>
            );
          })}
        </div>
      )}

      {q.kind === "multi" && (
        <div className="flex flex-wrap gap-2">
          {q.options.map(opt => {
            const current: string[] = Array.isArray(value) ? value : [];
            const checked = current.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  const next = checked
                    ? current.filter(x => x !== opt.value)
                    : [...current, opt.value];
                  onUpdate(q.id, next as any);
                }}
                className={cn(
                  "px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition",
                  checked
                    ? "bg-primary/15 border-primary/40 text-white"
                    : "bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/[0.06]",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {q.kind === "textarea" && (
        <Textarea
          value={(value as string) ?? ""}
          onChange={e => onUpdate(q.id, e.target.value as any)}
          rows={3}
          placeholder={"placeholder" in q ? q.placeholder : undefined}
          className="bg-white/5 border-white/10 text-white rounded-xl text-sm leading-relaxed resize-y"
        />
      )}

      {q.kind === "toggle" && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10">
          <p className="text-xs font-bold text-white">{q.label}</p>
          <Switch checked={!!value} onCheckedChange={v => onUpdate(q.id, v as any)} />
        </div>
      )}
    </div>
  );
}

// ─── Review step (Proposed Clause Blocks) ─────────────────────────────────

interface ReviewProps {
  clauses: ProposedClause[];
  updateClause: (id: string, patch: Partial<ProposedClause>) => void;
  updateClauseActivation: (id: string, patch: Partial<ProposedClause["activation"]>) => void;
  removeClause: (id: string) => void;
  addEmptyClause: () => void;
}

function ReviewStep({ clauses, updateClause, updateClauseActivation, removeClause, addEmptyClause }: ReviewProps) {
  const customerVisible = clauses.filter(c => c.customerVisible).length;
  const internalCount = clauses.length - customerVisible;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-[#0B0B0B] to-[#0B0B0B] p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Proposed Clause Blocks</p>
            <h3 className="text-xl font-black text-white tracking-tight mt-1">Review before activating</h3>
            <p className="text-xs text-white/60 mt-1">
              Each block below becomes an editable section in the document canvas. Customer-visible clauses show to the customer at signing; internal-only clauses never leave your team.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-500/15 text-emerald-300 border-none text-[9px] font-black uppercase tracking-widest">
              {customerVisible} customer
            </Badge>
            {internalCount > 0 && (
              <Badge className="bg-amber-500/15 text-amber-300 border-none text-[9px] font-black uppercase tracking-widest">
                {internalCount} internal
              </Badge>
            )}
          </div>
        </div>
      </div>

      {clauses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-sm font-black text-white/60 uppercase tracking-tight">No clauses proposed.</p>
          <p className="text-xs text-white/40 mt-1">Adjust the setup or add a clause manually.</p>
          <Button
            onClick={addEmptyClause}
            className="mt-4 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest rounded-xl text-[10px] h-9"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Clause Manually
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {clauses.map((c, idx) => (
              <ProposedClauseCard
                key={c.id}
                index={idx + 1}
                clause={c}
                onChange={patch => updateClause(c.id, patch)}
                onActivationChange={patch => updateClauseActivation(c.id, patch)}
                onRemove={() => removeClause(c.id)}
              />
            ))}
          </div>
          <Button
            onClick={addEmptyClause}
            variant="ghost"
            className="w-full bg-white/[0.03] hover:bg-white/[0.07] border border-dashed border-white/10 text-white/60 hover:text-white font-black uppercase tracking-widest rounded-2xl text-[10px] h-10"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Another Clause
          </Button>
        </>
      )}
    </div>
  );
}

function ProposedClauseCard({
  index, clause, onChange, onActivationChange, onRemove,
}: {
  index: number;
  clause: ProposedClause;
  onChange: (patch: Partial<ProposedClause>) => void;
  onActivationChange: (patch: Partial<ProposedClause["activation"]>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <div
      className={cn(
        "rounded-2xl border bg-[#0B0B0B] overflow-hidden transition",
        clause.customerVisible
          ? "border-white/10"
          : "border-amber-500/30 bg-amber-500/[0.03]",
      )}
    >
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0",
            clause.customerVisible
              ? "bg-primary/15 border border-primary/30 text-primary"
              : "bg-amber-500/15 border border-amber-500/30 text-amber-300",
          )}>
            {clause.customerVisible ? index : <EyeOff className="w-3.5 h-3.5" />}
          </div>

          <div className="flex-1 min-w-0">
            {editing ? (
              <Input
                value={clause.title}
                onChange={e => onChange({ title: e.target.value })}
                onBlur={() => setEditing(false)}
                autoFocus
                className="bg-white/5 border-white/10 text-white rounded-xl h-9 text-sm font-bold"
              />
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <h4 className="text-sm font-black text-white truncate">{clause.title || "Untitled clause"}</h4>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-white/30 hover:text-white shrink-0"
                  aria-label="Edit title"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <Badge className="bg-white/5 text-white/50 border border-white/10 text-[9px] font-black uppercase tracking-widest">
                {clause.category.replace(/_/g, " ")}
              </Badge>
              {!clause.customerVisible && (
                <Badge className="bg-amber-500/15 text-amber-300 border-none text-[9px] font-black uppercase tracking-widest">
                  Internal-Only
                </Badge>
              )}
              {clause.requireInitials && (
                <Badge className="bg-blue-500/15 text-blue-300 border-none text-[9px] font-black uppercase tracking-widest">
                  <PenLine className="w-2.5 h-2.5 mr-1" /> Initials
                </Badge>
              )}
              {clause.requireSignature && (
                <Badge className="bg-purple-500/15 text-purple-200 border-none text-[9px] font-black uppercase tracking-widest">
                  Signature
                </Badge>
              )}
              {clause.optionalConsent && (
                <Badge className="bg-cyan-500/15 text-cyan-300 border-none text-[9px] font-black uppercase tracking-widest">
                  Optional Consent
                </Badge>
              )}
              <Badge className="bg-white/[0.03] text-white/30 border border-white/10 text-[9px] font-black uppercase tracking-widest">
                {clause.source.replace(/_/g, " ")}
              </Badge>
            </div>
          </div>

          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove clause"
            className="w-8 h-8 rounded-lg text-red-300 hover:text-red-200 hover:bg-red-500/10 border border-white/10 flex items-center justify-center shrink-0 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <Textarea
          value={clause.text}
          onChange={e => onChange({ text: e.target.value })}
          rows={3}
          className="bg-white/5 border-white/10 text-white rounded-xl text-xs leading-relaxed resize-y"
          placeholder="Clause text — what the customer will read."
        />

        {/* Customer Signing Requirements */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5 flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3" /> Customer Signing Requirements
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <MiniToggle label="Customer-Visible" checked={clause.customerVisible} onChange={v => onChange({ customerVisible: v })} />
            <MiniToggle label="Required Acceptance" checked={clause.requireAcceptance} onChange={v => onChange({ requireAcceptance: v })} disabled={!clause.customerVisible || clause.optionalConsent} />
            <MiniToggle label="Initials Required" checked={clause.requireInitials} onChange={v => onChange({ requireInitials: v })} disabled={!clause.customerVisible} />
            <MiniToggle label="Full Signature" checked={clause.requireSignature} onChange={v => onChange({ requireSignature: v })} disabled={!clause.customerVisible} />
            <MiniToggle label="Optional Consent" checked={clause.optionalConsent} onChange={v => {
              onChange({ optionalConsent: v });
              if (v) onChange({ requireAcceptance: false });
            }} disabled={!clause.customerVisible} />
          </div>
        </div>

        {/* Activation Rules — collapsible to reduce noise */}
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.05] transition"
        >
          <span className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1.5">
            <Workflow className="w-3 h-3" /> Activation Rules
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-white/40" /> : <ChevronDown className="w-3.5 h-3.5 text-white/40" />}
        </button>
        {expanded && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
            <MiniToggle
              label="Applies to selected services"
              checked={clause.activation.appliesToSelectedServices}
              onChange={v => onActivationChange({ appliesToSelectedServices: v })}
            />
            <MiniToggle
              label="Applies to selected risk flags"
              checked={clause.activation.appliesToSelectedRiskFlags}
              onChange={v => onActivationChange({ appliesToSelectedRiskFlags: v })}
            />
            <MiniToggle
              label="Show before booking"
              checked={clause.activation.showBeforeBooking}
              onChange={v => onActivationChange({ showBeforeBooking: v })}
            />
            <MiniToggle
              label="Show before job start"
              checked={clause.activation.showBeforeJobStart}
              onChange={v => onActivationChange({ showBeforeJobStart: v })}
            />
            <MiniToggle
              label="Attach to invoice"
              checked={clause.activation.attachToInvoice}
              onChange={v => onActivationChange({ attachToInvoice: v })}
            />
            <MiniToggle
              label="Require before payment"
              checked={clause.activation.requireBeforePayment}
              onChange={v => onActivationChange({ requireBeforePayment: v })}
            />
            <MiniToggle
              label="Require before tech begins"
              checked={clause.activation.requireBeforeTechBegins}
              onChange={v => onActivationChange({ requireBeforeTechBegins: v })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── tiny sub-components ──────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1.5">
      {children}
    </Label>
  );
}

function ToggleRow({
  icon, label, desc, checked, onChange,
}: {
  icon: "ack" | "initials";
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/10 cursor-pointer flex-1 min-w-0">
      <div className={cn(
        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition",
        checked ? "bg-primary/20 text-primary" : "bg-white/5 text-white/40",
      )}>
        {icon === "ack" ? <ListChecks className="w-3.5 h-3.5" /> : <PenLine className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black text-white leading-tight">{label}</p>
        <p className="text-[9px] text-white/40 uppercase tracking-widest font-black leading-tight">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function MiniToggle({
  label, checked, onChange, disabled,
}: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        "flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-left transition disabled:opacity-40 disabled:cursor-not-allowed",
        checked
          ? "bg-primary/10 border-primary/30 text-white"
          : "bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/[0.06]",
      )}
    >
      <span className="text-[10px] font-black uppercase tracking-widest leading-tight">{label}</span>
      <div className={cn(
        "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0",
        checked ? "bg-primary border-primary" : "border-white/30",
      )}>
        {checked && <Check className="w-2.5 h-2.5 text-white" />}
      </div>
    </button>
  );
}
