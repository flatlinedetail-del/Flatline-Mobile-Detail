import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Save, Eye, ChevronUp, ChevronDown, Trash2, Plus,
  GripVertical, Settings2, FileText, Type, CheckSquare, PenLine,
  Calendar as CalendarIcon, User, Car, Briefcase, Receipt, Image,
  DollarSign, ShieldX, MessageSquare, Camera, Clock,
} from "lucide-react";
import { cn } from "../../lib/utils";
import {
  WAIVER_BLOCK_LIBRARY, RISK_LEVEL_META, CATEGORY_META,
} from "../../types/waiver";
import type { StudioFormTemplate, WaiverBlock, WaiverBlockType } from "../../types/waiver";
import type { FormCategory } from "../../types/forms";
import { defaultBlockFor, deriveBlocksFromLegacy, reorderBlock } from "./studioUtils";
import { BuilderDirections, InfoTip, HelpHint } from "./HelpUI";

interface Props {
  template: StudioFormTemplate;
  services: any[];
  addons: any[];
  onChange: (t: StudioFormTemplate) => void;
  onSave: () => void;
  onCancel: () => void;
  onPreview: () => void;
}

const BLOCK_ICONS: Record<WaiverBlockType, any> = {
  header: Type,
  legalText: FileText,
  acknowledgmentCheckbox: CheckSquare,
  initials: PenLine,
  signature: PenLine,
  date: CalendarIcon,
  customerInfo: User,
  vehicleInfo: Car,
  jobInfo: Briefcase,
  serviceSummary: Receipt,
  beforeAfterPhotoAcknowledgment: Image,
  preExistingDamageAcknowledgment: ShieldX,
  paymentTerms: DollarSign,
  lateFeeTerms: Clock,
  cancellationPolicy: ShieldX,
  customQuestion: MessageSquare,
  photoUploadRequest: Camera,
};

export function TemplateEditor({
  template, services, addons,
  onChange, onSave, onCancel, onPreview,
}: Props) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeRightTab, setActiveRightTab] = useState<"settings" | "automation">("settings");

  // Derive blocks from legacy ONLY the first time a given template id is
  // loaded into the editor. The previous mount-only effect ran with a stale
  // closure and could clobber subsequent edits; this version is keyed to
  // template.id and runs at most once per template.
  const derivedFromLegacyForId = useRef<string | null>(null);
  useEffect(() => {
    const tid = template.id;
    if (!tid) return;
    if (derivedFromLegacyForId.current === tid) return;
    if (template.blocks && template.blocks.length > 0) {
      derivedFromLegacyForId.current = tid;
      return;
    }
    const derived = deriveBlocksFromLegacy(template);
    derivedFromLegacyForId.current = tid;
    if (derived.length > 0) {
      onChange({ ...template, blocks: derived });
    }
  }, [template.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const blocks = useMemo(() => {
    return [...(template.blocks ?? [])].sort((a, b) => a.order - b.order);
  }, [template.blocks]);

  const selectedBlock = blocks.find(b => b.id === selectedBlockId) ?? null;

  const updateBlock = (id: string, patch: Partial<WaiverBlock>) => {
    onChange({
      ...template,
      blocks: (template.blocks ?? []).map(b => b.id === id ? { ...b, ...patch } : b),
    });
  };

  const addBlock = (type: WaiverBlockType) => {
    const existing = template.blocks ?? [];
    const newBlock = defaultBlockFor(type);
    // Append after the current highest order so the inserted block always
    // lands at the bottom of the canvas (matches spec). Avoids any sort
    // surprise if an existing block had a duplicate or stale order value.
    const maxOrder = existing.reduce((m, b) => Math.max(m, b.order ?? 0), -1);
    newBlock.order = maxOrder + 1;
    onChange({ ...template, blocks: [...existing, newBlock] });
    setSelectedBlockId(newBlock.id);
  };

  const removeBlock = (id: string) => {
    onChange({
      ...template,
      blocks: (template.blocks ?? []).filter(b => b.id !== id),
    });
    if (selectedBlockId === id) setSelectedBlockId(null);
  };

  const moveBlock = (id: string, dir: "up" | "down") => {
    onChange({ ...template, blocks: reorderBlock(template.blocks ?? [], id, dir) });
  };

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* ─── Builder Directions (collapsible, dismissible) ─────────────── */}
      <BuilderDirections variant="editor" />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_320px] gap-4 lg:gap-5">
      {/* ─── LEFT: Block Library ─────────────────────────────────────── */}
      <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-2xl h-fit lg:sticky lg:top-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Plus className="w-3.5 h-3.5 text-primary" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40">Block Library</h3>
            <InfoTip title="Blocks">
              Blocks are the sections that make up your waiver — legal text, signature, initials, acknowledgments, and auto-fill fields like customer and vehicle info. Click any block in this library to add it to the document on the right.
            </InfoTip>
          </div>
          <p className="text-[10px] text-white/40 mb-3 leading-relaxed">
            Click to add a block to the document. You can reorder or remove them at any time.
          </p>
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
            {WAIVER_BLOCK_LIBRARY.map(b => {
              const Icon = BLOCK_ICONS[b.type];
              const insert = (e?: React.SyntheticEvent) => {
                // Defensive: prevent any wrapping form from submitting and stop
                // bubbling so a parent click handler can't swallow the insert.
                if (e) { e.preventDefault?.(); e.stopPropagation?.(); }
                addBlock(b.type);
              };
              return (
                <button
                  key={b.type}
                  type="button"
                  aria-label={`Add ${b.label} block to the document`}
                  onClick={insert}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      insert(e);
                    }
                  }}
                  className="w-full flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] active:bg-primary/10 border border-white/5 hover:border-white/10 transition text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 group-hover:bg-primary/15 group-hover:text-primary flex items-center justify-center shrink-0 text-white/60 transition">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-white uppercase tracking-tight leading-tight">{b.label}</p>
                    <p className="text-[9px] text-white/40 mt-0.5 leading-tight">{b.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ─── CENTER: Document Canvas ────────────────────────────────── */}
      <div className="space-y-4">
        {/* Toolbar */}
        <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-2xl">
          <CardContent className="p-4 flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Input
                value={template.title}
                onChange={e => onChange({ ...template, title: e.target.value })}
                placeholder="Internal Title"
                className="bg-white/5 border-white/10 text-white text-base font-black h-10 rounded-xl max-w-md"
              />
              <Badge className={cn(
                "border-none text-[9px] font-black uppercase tracking-widest shrink-0",
                template.status === "active"   && "bg-emerald-500/15 text-emerald-300",
                template.status === "draft"    && "bg-amber-500/15 text-amber-300",
                template.status === "archived" && "bg-slate-500/15 text-slate-300",
                !template.status && "bg-amber-500/15 text-amber-300",
              )}>
                {template.status ?? "draft"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={onPreview}
                className="text-white/70 hover:text-white hover:bg-white/5 font-black uppercase tracking-widest text-xs h-10 rounded-xl"
              >
                <Eye className="w-4 h-4 mr-2" /> Preview
              </Button>
              <Button
                variant="ghost"
                onClick={onCancel}
                className="text-white/50 hover:text-white hover:bg-white/5 font-black uppercase tracking-widest text-xs h-10 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={onSave}
                className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest rounded-xl text-xs h-10 shadow-glow-blue"
              >
                <Save className="w-4 h-4 mr-2" /> Save Template
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Canvas */}
        <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-2xl min-h-[60vh]">
          <CardContent className="p-0">
            {/* Document paper */}
            <div className="bg-[#FAFAFA] text-[#0B0B0B] min-h-[60vh] p-8 md:p-10 rounded-b-3xl">
              {/* Document letterhead */}
              <div className="border-b border-black/10 pb-5 mb-6">
                <p className="text-[9px] font-black uppercase tracking-widest text-black/40">Legal Document Preview</p>
                <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight mt-2 text-black">
                  {template.customerTitle?.trim() || template.title || "Untitled Waiver"}
                </h1>
                {template.internalDescription && (
                  <p className="text-xs text-black/50 mt-2">{template.internalDescription}</p>
                )}
              </div>

              {blocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-black/5 border border-black/10 flex items-center justify-center mb-4">
                    <FileText className="w-7 h-7 text-black/30" />
                  </div>
                  <p className="text-sm font-black text-black/60 uppercase tracking-tight">Empty Canvas</p>
                  <p className="text-xs text-black/40 mt-1 max-w-sm">
                    Click any block from the left panel to start building your document.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {blocks.map((block, idx) => (
                    <BlockRow
                      key={block.id}
                      block={block}
                      isFirst={idx === 0}
                      isLast={idx === blocks.length - 1}
                      selected={selectedBlockId === block.id}
                      onSelect={() => setSelectedBlockId(block.id)}
                      onUpdate={(patch) => updateBlock(block.id, patch)}
                      onMoveUp={() => moveBlock(block.id, "up")}
                      onMoveDown={() => moveBlock(block.id, "down")}
                      onDelete={() => removeBlock(block.id)}
                    />
                  ))}
                </div>
              )}

              {/* Document footer hint */}
              {blocks.length > 0 && (
                <div className="mt-10 pt-5 border-t border-black/10 text-center">
                  <p className="text-[9px] uppercase tracking-widest font-black text-black/30">
                    Document protected by digital signature · IP recorded · Tamper-evident audit trail
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── RIGHT: Smart Settings ──────────────────────────────────── */}
      <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-2xl h-fit lg:sticky lg:top-4">
        <CardContent className="p-0">
          {/* Tabs */}
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveRightTab("settings")}
              className={cn(
                "flex-1 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition",
                activeRightTab === "settings" ? "text-primary border-b-2 border-primary" : "text-white/40 hover:text-white/70",
              )}
            >
              <Settings2 className="w-3.5 h-3.5 inline mr-1.5" />
              Settings
            </button>
            <button
              onClick={() => setActiveRightTab("automation")}
              className={cn(
                "flex-1 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition",
                activeRightTab === "automation" ? "text-primary border-b-2 border-primary" : "text-white/40 hover:text-white/70",
              )}
            >
              Automation
            </button>
          </div>

          <div className="p-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
            {activeRightTab === "settings" && (
              <SettingsPanel
                template={template}
                onChange={onChange}
                selectedBlock={selectedBlock}
                updateBlock={updateBlock}
              />
            )}
            {activeRightTab === "automation" && (
              <AutomationPanel
                template={template}
                onChange={onChange}
                services={services}
                addons={addons}
              />
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

// ── Block Row (canvas) ─────────────────────────────────────────────────

function BlockRow({
  block, isFirst, isLast, selected,
  onSelect, onUpdate, onMoveUp, onMoveDown, onDelete,
}: {
  block: WaiverBlock;
  isFirst: boolean;
  isLast: boolean;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<WaiverBlock>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "relative group rounded-2xl border transition-all cursor-pointer",
        selected
          ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
          : "border-transparent hover:border-black/10 hover:bg-black/[0.02]",
      )}
    >
      {/* Block controls (left side) */}
      <div className={cn(
        "absolute -left-10 top-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition",
        selected && "opacity-100",
      )}>
        <button
          disabled={isFirst}
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
          className="w-7 h-7 rounded-lg bg-white text-black/60 hover:text-black border border-black/10 shadow-sm flex items-center justify-center disabled:opacity-30"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          disabled={isLast}
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
          className="w-7 h-7 rounded-lg bg-white text-black/60 hover:text-black border border-black/10 shadow-sm flex items-center justify-center disabled:opacity-30"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className={cn(
          "absolute -right-10 top-2 w-7 h-7 rounded-lg bg-white text-red-500 hover:text-red-600 border border-red-200 shadow-sm flex items-center justify-center transition",
          "opacity-0 group-hover:opacity-100",
          selected && "opacity-100",
        )}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <div className="p-4">
        <BlockPreview block={block} onUpdate={onUpdate} />
      </div>

      {/* Type tag */}
      <div className="absolute top-2 right-2 text-[8px] uppercase tracking-widest font-black text-black/30 bg-black/5 px-2 py-0.5 rounded-full">
        {block.type}
        {block.required && <span className="ml-1 text-red-500">*</span>}
      </div>
    </div>
  );
}

function BlockPreview({ block, onUpdate }: { block: WaiverBlock; onUpdate: (patch: Partial<WaiverBlock>) => void }) {
  switch (block.type) {
    case "header":
      return (
        <input
          value={block.title ?? ""}
          onChange={e => onUpdate({ title: e.target.value })}
          onClick={e => e.stopPropagation()}
          placeholder="Section Header"
          className="w-full text-xl font-black uppercase tracking-tight text-black bg-transparent border-none outline-none focus:bg-black/5 rounded px-2 py-1"
        />
      );
    case "legalText":
      return (
        <div className="space-y-2">
          <input
            value={block.title ?? ""}
            onChange={e => onUpdate({ title: e.target.value })}
            onClick={e => e.stopPropagation()}
            placeholder="Clause heading"
            className="w-full text-sm font-bold text-black bg-transparent border-none outline-none focus:bg-black/5 rounded px-2 py-1"
          />
          <textarea
            value={block.content ?? ""}
            onChange={e => onUpdate({ content: e.target.value })}
            onClick={e => e.stopPropagation()}
            placeholder="Enter the legal text customers will read…"
            rows={4}
            className="w-full text-xs text-black/70 bg-transparent border-none outline-none focus:bg-black/5 rounded px-2 py-1 resize-y leading-relaxed"
          />
        </div>
      );
    case "acknowledgmentCheckbox":
      return (
        <div className="flex items-start gap-3 bg-black/[0.02] rounded-xl p-3 border border-black/10">
          <div className="w-5 h-5 rounded border-2 border-black/30 mt-0.5 shrink-0" />
          <input
            value={block.title ?? ""}
            onChange={e => onUpdate({ title: e.target.value })}
            onClick={e => e.stopPropagation()}
            placeholder="I acknowledge…"
            className="flex-1 text-sm text-black bg-transparent border-none outline-none"
          />
        </div>
      );
    case "initials":
      return (
        <div className="flex items-center gap-3 bg-black/[0.02] rounded-xl p-3 border border-black/10">
          <input
            value={block.title ?? ""}
            onChange={e => onUpdate({ title: e.target.value })}
            onClick={e => e.stopPropagation()}
            placeholder="Initial here"
            className="flex-1 text-xs uppercase tracking-widest font-black text-black bg-transparent border-none outline-none"
          />
          <div className="w-20 h-10 bg-white border-2 border-dashed border-black/20 rounded flex items-center justify-center text-[9px] uppercase tracking-widest font-black text-black/30">
            Initials
          </div>
        </div>
      );
    case "signature":
      return (
        <div className="bg-white border-2 border-dashed border-black/20 rounded-xl p-3 text-center">
          <PenLine className="w-5 h-5 text-black/30 mx-auto mb-1" />
          <p className="text-[10px] uppercase tracking-widest font-black text-black/40">Signature Block</p>
          <p className="text-[9px] text-black/30 mt-0.5">Customer will sign here</p>
        </div>
      );
    case "date":
      return (
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-black/40" />
          <p className="text-sm font-bold text-black">Date: <span className="text-black/40">__________</span></p>
        </div>
      );
    case "customerInfo":
      return <AutoField label="Customer Information" hint="Name · Email · Phone (auto-filled at signing)" />;
    case "vehicleInfo":
      return <AutoField label="Vehicle Information" hint="Year · Make · Model · VIN (auto-filled)" />;
    case "jobInfo":
      return <AutoField label="Appointment Details" hint="Date · Time · Address (auto-filled)" />;
    case "serviceSummary":
      return <AutoField label="Service Summary" hint="Services, add-ons, and total price (auto-filled)" />;
    case "beforeAfterPhotoAcknowledgment":
      return (
        <AutoField
          label="Before / After Photo Release"
          hint="Customer authorizes business use of before/after photos"
          editableTitle={block.title}
          onTitleChange={(v) => onUpdate({ title: v })}
        />
      );
    case "preExistingDamageAcknowledgment":
      return (
        <AutoField
          label="Pre-Existing Damage"
          hint="Acknowledge prior damage shown in inspection photos"
          editableTitle={block.title}
          onTitleChange={(v) => onUpdate({ title: v })}
        />
      );
    case "paymentTerms":
      return (
        <BlockClause
          title={block.title ?? "Payment Terms"}
          content={block.content ?? "Payment is due upon completion of services unless other terms have been agreed in writing."}
          onUpdate={onUpdate}
        />
      );
    case "lateFeeTerms":
      return (
        <BlockClause
          title={block.title ?? "Late Fee Policy"}
          content={block.content ?? "Past-due invoices accrue a late fee in accordance with the business late-fee policy."}
          onUpdate={onUpdate}
        />
      );
    case "cancellationPolicy":
      return (
        <BlockClause
          title={block.title ?? "Cancellation Policy"}
          content={block.content ?? "Cancellations within 24 hours of the appointment may incur a fee. No-shows may be charged a deposit."}
          onUpdate={onUpdate}
        />
      );
    case "customQuestion":
      return (
        <div className="space-y-2 bg-black/[0.02] rounded-xl p-3 border border-black/10">
          <input
            value={block.title ?? ""}
            onChange={e => onUpdate({ title: e.target.value })}
            onClick={e => e.stopPropagation()}
            placeholder="Question for customer"
            className="w-full text-sm font-bold text-black bg-transparent border-none outline-none"
          />
          <div className="bg-white border border-black/10 rounded px-2 py-2 text-xs text-black/30">
            Customer response…
          </div>
        </div>
      );
    case "photoUploadRequest":
      return (
        <div className="bg-black/[0.02] border-2 border-dashed border-black/15 rounded-xl p-4 text-center">
          <Camera className="w-5 h-5 text-black/30 mx-auto mb-1" />
          <input
            value={block.title ?? ""}
            onChange={e => onUpdate({ title: e.target.value })}
            onClick={e => e.stopPropagation()}
            placeholder="Photo upload prompt"
            className="text-xs font-black uppercase tracking-widest text-black/60 bg-transparent border-none outline-none text-center w-full"
          />
        </div>
      );
    default:
      return <div className="text-sm text-black/40">Unknown block type</div>;
  }
}

function AutoField({
  label, hint, editableTitle, onTitleChange,
}: { label: string; hint: string; editableTitle?: string; onTitleChange?: (v: string) => void }) {
  return (
    <div className="bg-black/[0.02] border border-black/10 rounded-xl p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center text-black/40">
        <Briefcase className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        {onTitleChange ? (
          <input
            value={editableTitle ?? label}
            onChange={e => onTitleChange(e.target.value)}
            onClick={e => e.stopPropagation()}
            className="w-full text-sm font-bold text-black bg-transparent border-none outline-none"
          />
        ) : (
          <p className="text-sm font-bold text-black">{label}</p>
        )}
        <p className="text-[10px] text-black/40 uppercase tracking-widest font-black">{hint}</p>
      </div>
    </div>
  );
}

function BlockClause({
  title, content, onUpdate,
}: { title: string; content: string; onUpdate: (patch: Partial<WaiverBlock>) => void }) {
  return (
    <div className="space-y-2">
      <input
        value={title}
        onChange={e => onUpdate({ title: e.target.value })}
        onClick={e => e.stopPropagation()}
        className="w-full text-sm font-bold uppercase tracking-tight text-black bg-transparent border-none outline-none focus:bg-black/5 rounded px-2 py-1"
      />
      <textarea
        value={content}
        onChange={e => onUpdate({ content: e.target.value })}
        onClick={e => e.stopPropagation()}
        rows={3}
        className="w-full text-xs text-black/70 bg-transparent border-none outline-none focus:bg-black/5 rounded px-2 py-1 resize-y leading-relaxed"
      />
    </div>
  );
}

// ── Settings Panel ─────────────────────────────────────────────────────

function SettingsPanel({
  template, onChange, selectedBlock, updateBlock,
}: {
  template: StudioFormTemplate;
  onChange: (t: StudioFormTemplate) => void;
  selectedBlock: WaiverBlock | null;
  updateBlock: (id: string, patch: Partial<WaiverBlock>) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Selected block */}
      {selectedBlock && (
        <Section title="Selected Block">
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">
              {selectedBlock.type}
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">Required</Label>
                <Switch
                  checked={!!selectedBlock.required}
                  onCheckedChange={v => updateBlock(selectedBlock.id, { required: v })}
                />
              </div>
            </div>
          </div>
        </Section>
      )}

      <Section title="Identity">
        <FieldLabel info="Used only by your team. Customers never see this title.">Internal Title</FieldLabel>
        <Input
          value={template.title}
          onChange={e => onChange({ ...template, title: e.target.value })}
          className="bg-white/5 border-white/10 text-white rounded-xl"
        />

        <FieldLabel info="This is the title shown to the customer at signing time. If left blank, the internal title is used.">
          Customer-Facing Title
        </FieldLabel>
        <Input
          value={template.customerTitle ?? ""}
          onChange={e => onChange({ ...template, customerTitle: e.target.value })}
          placeholder={template.title}
          className="bg-white/5 border-white/10 text-white rounded-xl"
        />

        <FieldLabel info="A short note for your team about what this waiver protects against or when to use it. Never shown to the customer.">
          Internal Description
        </FieldLabel>
        <Textarea
          value={template.internalDescription ?? ""}
          onChange={e => onChange({ ...template, internalDescription: e.target.value })}
          placeholder="What is this waiver for?"
          rows={2}
          className="bg-white/5 border-white/10 text-white rounded-xl"
        />
      </Section>

      <Section title="Classification" info="Categories group waivers by purpose. Risk level signals how strict and how prominently the waiver should be enforced.">
        <FieldLabel>Category</FieldLabel>
        <Select
          value={template.category}
          onValueChange={(v: FormCategory) => onChange({ ...template, category: v })}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(CATEGORY_META) as [FormCategory, any][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <FieldLabel info="Low = informational. Moderate = standard service waivers. High = paint correction, ceramic, heavy interior work. Critical = the customer must clearly understand risk before signing.">
          Risk Level
        </FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(RISK_LEVEL_META) as [any, any][]).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange({ ...template, riskLevel: k })}
              className={cn(
                "p-2 rounded-xl border text-left transition",
                template.riskLevel === k
                  ? `${v.bg} ${v.color} ${v.ring} ring-1`
                  : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10",
              )}
            >
              <p className="text-[10px] font-black uppercase tracking-widest">{v.label}</p>
            </button>
          ))}
        </div>

        <FieldLabel>Status</FieldLabel>
        <Select
          value={template.status ?? (template.isActive ? "active" : "draft")}
          onValueChange={(v: any) => onChange({ ...template, status: v, isActive: v === "active" })}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">● Active</SelectItem>
            <SelectItem value="draft">○ Draft</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </Section>

      <Section title="Required Signing Elements" info="Toggle which pieces a customer must complete. Anything required will block the customer from submitting an unsigned waiver.">
        <ToggleRow
          label="Required by Default"
          desc="Customers must sign before job start"
          info="When on, this waiver is mandatory at the moment defined by your Smart Rules (default: before the job starts). Owners can still override per-job with a recorded reason."
          checked={template.requiredByDefault ?? template.enforcement !== "optional"}
          onChange={v => onChange({
            ...template,
            requiredByDefault: v,
            enforcement: v ? (template.enforcement === "optional" ? "before_start" : template.enforcement) : "optional",
          })}
        />
        <ToggleRow
          label="Signature"
          desc="Drawn or typed signature"
          info="Customer signs their name with a finger, stylus, or by typing. The signature image is saved to the signed waiver record."
          checked={template.requiresSignature}
          onChange={v => onChange({ ...template, requiresSignature: v })}
        />
        <ToggleRow
          label="Printed Name"
          info="Customer types or writes their full legal name. Helpful when the signature is illegible."
          checked={template.requiresPrintedName}
          onChange={v => onChange({ ...template, requiresPrintedName: v })}
        />
        <ToggleRow
          label="Initials"
          info="Adds a short initials field. Useful for high-risk clauses where you want a discrete acknowledgment that the customer read that section."
          checked={template.requiresInitials}
          onChange={v => onChange({ ...template, requiresInitials: v })}
        />
        <ToggleRow
          label="Date"
          info="Auto-fills with the date at signing. Customer can usually adjust if needed."
          checked={template.requiresDate}
          onChange={v => onChange({ ...template, requiresDate: v })}
        />
        <ToggleRow
          label="Photo Upload"
          info="Prompts the customer to attach a photo (e.g., damage at drop-off). Photos are saved to the signed record."
          checked={template.requiresPhoto}
          onChange={v => onChange({ ...template, requiresPhoto: v })}
        />
      </Section>

      <Section title="Signing Frequency" info="How often the customer has to re-sign this waiver. Once per vehicle is common for ceramic / paint correction. Expires after days is good for liability releases.">
        <Select
          value={template.signatureFrequency ?? "every_job"}
          onValueChange={(v: any) => onChange({ ...template, signatureFrequency: v })}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="every_job">Every Job</SelectItem>
            <SelectItem value="once_per_client">Once Per Client</SelectItem>
            <SelectItem value="once_per_vehicle">Once Per Vehicle</SelectItem>
            <SelectItem value="expires_after">Expires After Days</SelectItem>
            <SelectItem value="optional">Optional</SelectItem>
          </SelectContent>
        </Select>

        {template.signatureFrequency === "expires_after" && (
          <>
            <FieldLabel>Expires After (days)</FieldLabel>
            <Input
              type="number"
              min={1}
              value={template.expiresAfterDays ?? 365}
              onChange={e => onChange({ ...template, expiresAfterDays: Number(e.target.value) || 365 })}
              className="bg-white/5 border-white/10 text-white rounded-xl"
            />
          </>
        )}
      </Section>
    </div>
  );
}

function AutomationPanel({
  template, onChange, services, addons,
}: {
  template: StudioFormTemplate;
  onChange: (t: StudioFormTemplate) => void;
  services: any[];
  addons: any[];
}) {
  return (
    <div className="space-y-5">
      <Section title="Applies To" info="Surfaces where this waiver should appear automatically. You can also wire more specific triggers with Smart Rules.">
        <ToggleRow
          label="Online Booking"
          desc="Attach to online bookings"
          info="When a customer books through your public booking site, this waiver is queued to be sent for signing after the booking is confirmed."
          checked={!!template.appliesToOnlineBooking}
          onChange={v => onChange({ ...template, appliesToOnlineBooking: v })}
        />
        <ToggleRow
          label="Invoices"
          desc="Attach when invoicing"
          info="Required as part of the invoice / payment flow. Useful for payment terms or service agreements."
          checked={!!template.appliesToInvoices}
          onChange={v => onChange({ ...template, appliesToInvoices: v })}
        />
        <ToggleRow
          label="Late Fee Terms"
          desc="Required when applying late fees"
          info="When the invoice has late-fee terms enabled, this waiver appears in the payment dialog so the customer's agreement to late fees is on record."
          checked={!!template.appliesToLateFeeTerms}
          onChange={v => onChange({ ...template, appliesToLateFeeTerms: v })}
        />
        <ToggleRow
          label="Retail Customers"
          info="This waiver applies to retail (individual) customers."
          checked={template.assignedToRetail ?? true}
          onChange={v => onChange({ ...template, assignedToRetail: v })}
        />
        <ToggleRow
          label="Vendor / Wholesale"
          info="This waiver applies to vendor / wholesale accounts (e.g., dealerships, body shops)."
          checked={template.assignedToVendors ?? false}
          onChange={v => onChange({ ...template, assignedToVendors: v })}
        />
      </Section>

      <Section title="Triggered By Services" info="Pick the services that should automatically require this waiver. The waiver is shown whenever one of these services is on the job.">
        <p className="text-[10px] text-white/40 mb-2">When these services are on the job, this waiver applies.</p>
        <MultiSelectChips
          options={services.map(s => ({ id: s.id, label: s.name ?? s.title ?? s.id }))}
          selected={template.assignedServices ?? []}
          onChange={(ids) => onChange({ ...template, assignedServices: ids })}
        />
      </Section>

      <Section title="Triggered By Add-Ons" info="Like services, but for add-ons. Example: any add-on that involves wheel acid or polish should trigger a wheel-risk waiver.">
        <MultiSelectChips
          options={addons.map(a => ({ id: a.id, label: a.name ?? a.title ?? a.id }))}
          selected={template.assignedAddons ?? []}
          onChange={(ids) => onChange({ ...template, assignedAddons: ids })}
        />
      </Section>

      <Section title="Price Threshold" info="Require this waiver only when the job total is at or above a dollar amount. Common for high-value jobs that warrant extra liability coverage.">
        <FieldLabel>Trigger on jobs over $</FieldLabel>
        <Input
          type="number"
          min={0}
          value={template.priceThreshold ?? ""}
          placeholder="e.g. 500"
          onChange={e => onChange({ ...template, priceThreshold: e.target.value === "" ? undefined : Number(e.target.value) })}
          className="bg-white/5 border-white/10 text-white rounded-xl"
        />
      </Section>

      <Section title="Client Risk Triggers">
        <p className="text-[10px] text-white/40 mb-2">Comma-separate risk flag IDs (e.g. high_risk, no_show_repeat)</p>
        <Input
          value={(template.riskTriggers ?? []).join(", ")}
          onChange={e => onChange({
            ...template,
            riskTriggers: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
          })}
          placeholder="high_risk, payment_issue"
          className="bg-white/5 border-white/10 text-white rounded-xl"
        />
      </Section>
    </div>
  );
}

// ── tiny helpers ──────────────────────────────────────────────────────

function Section({ title, info, children }: { title: string; info?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30 border-b border-white/5 pb-2 flex items-center gap-1.5">
        {title}
        {info && <InfoTip title={title} size={12}>{info}</InfoTip>}
      </h4>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function FieldLabel({ children, info }: { children: React.ReactNode; info?: React.ReactNode }) {
  return (
    <Label className="text-[10px] font-black uppercase tracking-widest text-white/50 mt-1 flex items-center gap-1.5">
      {children}
      {info && <InfoTip title={typeof children === "string" ? children : undefined} size={12}>{info}</InfoTip>}
    </Label>
  );
}

function ToggleRow({
  label, desc, info, checked, onChange,
}: { label: string; desc?: string; info?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white flex items-center gap-1.5">
          {label}
          {info && <InfoTip title={label} size={12}>{info}</InfoTip>}
        </p>
        {desc && <p className="text-[9px] text-white/40 uppercase tracking-widest font-black">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function MultiSelectChips({
  options, selected, onChange,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (options.length === 0) {
    return <p className="text-[10px] text-white/30 italic">None configured yet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const isSelected = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              if (isSelected) onChange(selected.filter(x => x !== o.id));
              else onChange([...selected, o.id]);
            }}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition border",
              isSelected
                ? "bg-primary/20 text-primary border-primary/40"
                : "bg-white/[0.03] text-white/50 border-white/10 hover:bg-white/10",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
