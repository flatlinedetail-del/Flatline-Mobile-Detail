import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Plus, Edit2, Eye, Copy, Archive, Trash2, ShieldCheck,
  FileText, Sparkles, MoreVertical, ShieldAlert, ArchiveRestore,
  Workflow, Clock,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { cn } from "../../lib/utils";
import { tsToDate, getTemplateStatus, getTemplateRiskLevel, getCategoryMeta, getRiskMeta } from "./studioUtils";
import { HelpHint } from "./HelpUI";
import { RISK_LEVEL_META, CATEGORY_META } from "../../types/waiver";
import type { StudioFormTemplate, WaiverStatus, WaiverRiskLevel } from "../../types/waiver";
import type { FormCategory } from "../../types/forms";

interface Props {
  templates: StudioFormTemplate[];
  services: any[];
  addons: any[];
  signedForms: any[];
  onEdit: (tpl: StudioFormTemplate) => void;
  onPreview: (tpl: StudioFormTemplate) => void;
  onDuplicate: (tpl: StudioFormTemplate) => void;
  onArchive: (templateId: string, archived: boolean) => void;
  onDelete: (templateId: string) => void;
  onNew: () => void;
  onAIDraft: () => void;
}

export function TemplateGallery({
  templates, signedForms,
  onEdit, onPreview, onDuplicate, onArchive, onDelete, onNew, onAIDraft,
}: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<WaiverStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<FormCategory | "all">("all");
  const [riskFilter, setRiskFilter] = useState<WaiverRiskLevel | "all">("all");
  const [pendingDelete, setPendingDelete] = useState<StudioFormTemplate | null>(null);

  const signedCountByTemplate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of signedForms) {
      const id = s.formId ?? s.templateId;
      if (id) map[id] = (map[id] ?? 0) + 1;
    }
    return map;
  }, [signedForms]);

  const filtered = useMemo(() => {
    return templates.filter(t => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${t.title} ${t.customerTitle ?? ""} ${t.internalDescription ?? ""} ${t.content}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== "all" && getTemplateStatus(t) !== statusFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (riskFilter !== "all" && getTemplateRiskLevel(t) !== riskFilter) return false;
      return true;
    });
  }, [templates, search, statusFilter, categoryFilter, riskFilter]);

  if (templates.length === 0) {
    return (
      <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-2xl">
        <CardContent className="p-12">
          <div className="flex flex-col items-center text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
              <ShieldCheck className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-tight">No Waiver Templates Yet</h3>
            <p className="text-sm text-white/50 mt-2">
              Build your first protection template. Add legal clauses, acknowledgments, and digital signatures —
              then automate when they apply.
            </p>
            <div className="flex gap-2 mt-6">
              <Button
                onClick={onNew}
                className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest rounded-xl text-xs h-10"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create First Template
              </Button>
              <Button
                onClick={onAIDraft}
                className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 font-black uppercase tracking-widest rounded-xl text-xs h-10"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Start From AI
              </Button>
            </div>

            {/* Suggested starter categories */}
            <div className="mt-10 w-full">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Suggested Starter Templates</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  "General Authorization",
                  "Paint / Exterior Risk",
                  "Ceramic Coating",
                  "Interior Condition",
                  "Pre-Existing Damage",
                  "Payment Terms",
                  "Cancellation Policy",
                  "Photo / Media Release",
                ].map(name => (
                  <div key={name} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 text-left">
                    {name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <HelpHint>
        These are your waiver templates. Click <span className="text-white font-bold">Edit</span> to open the document canvas, <span className="text-white font-bold">Preview</span> to see what customers see, or use the menu to duplicate, archive, or delete.
      </HelpHint>

      {/* Filter bar */}
      <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-2xl">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-5 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search waivers by name, content, or description…"
              className="bg-white/5 border-white/10 text-white pl-10 h-10 rounded-xl"
            />
          </div>
          <div className="md:col-span-2">
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v as any)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {(Object.entries(CATEGORY_META) as [FormCategory, any][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={riskFilter} onValueChange={v => setRiskFilter(v as any)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Protection Levels</SelectItem>
                <SelectItem value="low">{RISK_LEVEL_META.low.label}</SelectItem>
                <SelectItem value="medium">{RISK_LEVEL_META.medium.label}</SelectItem>
                <SelectItem value="high">{RISK_LEVEL_META.high.label}</SelectItem>
                <SelectItem value="critical">{RISK_LEVEL_META.critical.label}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1 text-right text-[10px] font-black uppercase tracking-widest text-white/40">
            {filtered.length}/{templates.length}
          </div>
        </CardContent>
      </Card>

      {/* Cards */}
      {filtered.length === 0 ? (
        <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl">
          <CardContent className="p-12 text-center">
            <p className="text-sm text-white/40">No templates match your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(tpl => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              signedCount={signedCountByTemplate[tpl.id] ?? 0}
              onEdit={() => onEdit(tpl)}
              onPreview={() => onPreview(tpl)}
              onDuplicate={() => onDuplicate(tpl)}
              onArchive={() => onArchive(tpl.id, getTemplateStatus(tpl) !== "archived")}
              onDelete={() => setPendingDelete(tpl)}
            />
          ))}
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black text-red-500">Delete Waiver Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{pendingDelete?.title}". Signed copies are preserved in the audit trail, but this template cannot be sent again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete.id);
                setPendingDelete(null);
              }}
              className="bg-red-600 hover:bg-red-700 font-black uppercase tracking-widest text-xs rounded-xl text-white"
            >
              Delete Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateCard({
  template, signedCount,
  onEdit, onPreview, onDuplicate, onArchive, onDelete,
}: {
  template: StudioFormTemplate;
  signedCount: number;
  onEdit: () => void;
  onPreview: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const status = getTemplateStatus(template);
  const risk = getTemplateRiskLevel(template);
  // Safe lookups — legacy templates may have category/risk values that
  // aren't in the meta tables. getCategoryMeta / getRiskMeta always return
  // a populated object so {meta.emoji} / {meta.label} can never crash.
  const riskMeta = getRiskMeta(risk);
  const categoryMeta = getCategoryMeta(template.category);
  const updatedAt = tsToDate(template.updatedAt) ?? tsToDate(template.createdAt);
  const linkedCount = (template.assignedServices?.length ?? 0) + (template.assignedAddons?.length ?? 0);
  const isArchived = status === "archived";

  return (
    <Card className={cn(
      "group border bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-xl transition-all hover:shadow-2xl",
      isArchived ? "border-white/5 opacity-70" : "border-white/10 hover:border-primary/30",
    )}>
      <CardContent className="p-0">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-white/5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Badge className={cn(
                "border-none text-[9px] font-black uppercase tracking-widest",
                status === "active"   && "bg-emerald-500/15 text-emerald-300",
                status === "draft"    && "bg-amber-500/15 text-amber-300",
                status === "archived" && "bg-slate-500/15 text-slate-300",
              )}>
                {status === "active" ? "● Active" : status === "draft" ? "○ Draft" : "Archived"}
              </Badge>
              <Badge className={cn("border-none text-[9px] font-black uppercase tracking-widest", riskMeta.bg, riskMeta.color)}>
                {riskMeta.label}
              </Badge>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger render={
                <button className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition opacity-0 group-hover:opacity-100">
                  <MoreVertical className="w-4 h-4" />
                </button>
              } />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Edit2 className="w-3.5 h-3.5 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onPreview}>
                  <Eye className="w-3.5 h-3.5 mr-2" /> Preview
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onArchive}>
                  {isArchived ? <ArchiveRestore className="w-3.5 h-3.5 mr-2" /> : <Archive className="w-3.5 h-3.5 mr-2" />}
                  {isArchived ? "Restore" : "Archive"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-red-400 focus:text-red-300">
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <h3 className="text-base font-black text-white leading-tight">
            {template.customerTitle ?? template.title}
          </h3>
          <p className="text-[10px] text-white/40 mt-1 uppercase tracking-widest font-black">
            <span className="mr-1.5">{categoryMeta.emoji}</span>
            {categoryMeta.label}
            <span className="mx-2 text-white/20">·</span>
            v{template.version ?? 1}
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {template.internalDescription && (
            <p className="text-xs text-white/60 line-clamp-2 leading-relaxed">
              {template.internalDescription}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {template.requiredByDefault !== false && template.enforcement !== "optional" && (
              <Badge className="bg-primary/15 text-primary border-none text-[9px] font-black uppercase tracking-widest">
                <ShieldAlert className="w-3 h-3 mr-1" /> Required
              </Badge>
            )}
            {template.requiresSignature && (
              <Badge className="bg-white/5 text-white/60 border border-white/10 text-[9px] font-black uppercase tracking-widest">Signature</Badge>
            )}
            {template.requiresInitials && (
              <Badge className="bg-white/5 text-white/60 border border-white/10 text-[9px] font-black uppercase tracking-widest">Initials</Badge>
            )}
            {template.requiresPhoto && (
              <Badge className="bg-white/5 text-white/60 border border-white/10 text-[9px] font-black uppercase tracking-widest">Photo</Badge>
            )}
            {template.appliesToOnlineBooking && (
              <Badge className="bg-cyan-500/15 text-cyan-300 border-none text-[9px] font-black uppercase tracking-widest">Online Booking</Badge>
            )}
            {template.appliesToInvoices && (
              <Badge className="bg-blue-500/15 text-blue-300 border-none text-[9px] font-black uppercase tracking-widest">Invoices</Badge>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2">
            <Stat label="Signed" value={signedCount} icon={ShieldCheck} />
            <Stat label="Linked" value={linkedCount} icon={Workflow} />
            <Stat
              label="Updated"
              value={updatedAt ? updatedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
              icon={Clock}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 pb-5 pt-2 flex gap-2 border-t border-white/5 mt-1">
          <Button
            onClick={onEdit}
            className="flex-1 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest rounded-xl text-[10px] h-9 border border-white/10"
          >
            <Edit2 className="w-3.5 h-3.5 mr-1.5" />
            Edit
          </Button>
          <Button
            onClick={onPreview}
            className="flex-1 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest rounded-xl text-[10px] h-9"
          >
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            Preview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number | string; icon: any }) {
  return (
    <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
      <div className="flex items-center gap-1.5 text-white/40">
        <Icon className="w-3 h-3" />
        <span className="text-[8px] uppercase tracking-widest font-black">{label}</span>
      </div>
      <p className="text-sm font-black text-white mt-0.5">{value}</p>
    </div>
  );
}
