import { useState } from "react";
import { ServiceHistoryEntry } from "../types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2, Save, X, History, Car, DollarSign, Tag, Calendar, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn, formatCurrency } from "../lib/utils";

const CONDITION_TAG_OPTIONS = [
  "paint_correction",
  "heavy_contamination",
  "ceramic_coating",
  "scratch_repair",
  "interior_deep_clean",
  "engine_bay",
  "high_mileage",
  "new_vehicle",
  "water_spots",
  "oxidation",
  "swirl_marks",
  "pet_hair",
  "smoke_odor",
  "flood_damage",
];

interface Props {
  entries: ServiceHistoryEntry[];
  onChange: (entries: ServiceHistoryEntry[]) => void;
  readOnly?: boolean;
}

const emptyEntry = (): Omit<ServiceHistoryEntry, "id" | "clientId" | "createdAt" | "updatedAt"> => ({
  serviceType: "",
  serviceDate: "",
  vehicleInfo: "",
  priceCharged: undefined,
  notes: "",
  conditionTags: [],
  source: "manual",
});

export function ClientServiceHistory({ entries, onChange, readOnly = false }: Props) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [draft, setDraft] = useState(emptyEntry());
  const [tagInput, setTagInput] = useState("");

  const startAdd = () => {
    setDraft(emptyEntry());
    setTagInput("");
    setEditingIdx(null);
    setAddingNew(true);
  };

  const startEdit = (idx: number) => {
    const e = entries[idx];
    setDraft({
      serviceType: e.serviceType,
      serviceDate: e.serviceDate,
      vehicleInfo: e.vehicleInfo || "",
      priceCharged: e.priceCharged,
      notes: e.notes || "",
      conditionTags: e.conditionTags || [],
      source: e.source,
    });
    setTagInput("");
    setEditingIdx(idx);
    setAddingNew(false);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setAddingNew(false);
  };

  const saveEntry = () => {
    if (!draft.serviceType || !draft.serviceDate) return;
    if (addingNew) {
      const newEntry: ServiceHistoryEntry = {
        id: `local_${Date.now()}`,
        clientId: "",
        ...draft,
      };
      onChange([...entries, newEntry]);
    } else if (editingIdx !== null) {
      const updated = entries.map((e, i) =>
        i === editingIdx ? { ...e, ...draft } : e
      );
      onChange(updated);
    }
    setEditingIdx(null);
    setAddingNew(false);
  };

  const deleteEntry = (idx: number) => {
    onChange(entries.filter((_, i) => i !== idx));
  };

  const toggleTag = (tag: string) => {
    setDraft(prev => ({
      ...prev,
      conditionTags: prev.conditionTags?.includes(tag)
        ? prev.conditionTags.filter(t => t !== tag)
        : [...(prev.conditionTags || []), tag],
    }));
  };

  const isFormOpen = addingNew || editingIdx !== null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
            <History className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white">Previous Service History</p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mt-0.5">
              {entries.length} record{entries.length !== 1 ? "s" : ""} — used for marketing intelligence
            </p>
          </div>
        </div>
        {!readOnly && !isFormOpen && (
          <Button
            type="button"
            size="sm"
            onClick={startAdd}
            className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl font-black uppercase tracking-widest text-[10px] h-9 px-4 transition-all"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Previous Service
          </Button>
        )}
      </div>

      {/* Inline form */}
      {isFormOpen && (
        <div className="p-6 bg-black/40 rounded-2xl border border-primary/20 space-y-4 animate-in fade-in slide-in-from-top-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">
            {addingNew ? "New Service Record" : "Edit Service Record"}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-white/60">Service Type *</Label>
              <Input
                value={draft.serviceType}
                onChange={e => setDraft(p => ({ ...p, serviceType: e.target.value }))}
                placeholder="Full Detail, Ceramic Coat, PPF…"
                className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-10 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-white/60">Service Date *</Label>
              <Input
                type="date"
                value={draft.serviceDate}
                onChange={e => setDraft(p => ({ ...p, serviceDate: e.target.value }))}
                className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-10 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-white/60">
                <Car className="w-3 h-3 inline mr-1" />Vehicle
              </Label>
              <Input
                value={draft.vehicleInfo}
                onChange={e => setDraft(p => ({ ...p, vehicleInfo: e.target.value }))}
                placeholder="2020 Ford F-150 Black"
                className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-10 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-white/60">
                <DollarSign className="w-3 h-3 inline mr-1" />Price Charged
              </Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={draft.priceCharged ?? ""}
                onChange={e => setDraft(p => ({ ...p, priceCharged: e.target.value ? parseFloat(e.target.value) : undefined }))}
                placeholder="0.00"
                className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-10 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-white/60">Source</Label>
              <Select
                value={draft.source}
                onValueChange={v => setDraft(p => ({ ...p, source: v as ServiceHistoryEntry["source"] }))}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A1A1A] border-white/10 text-white">
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  <SelectItem value="imported">Imported</SelectItem>
                  <SelectItem value="completed_job">Completed Job</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-white/60">Notes</Label>
              <Input
                value={draft.notes}
                onChange={e => setDraft(p => ({ ...p, notes: e.target.value }))}
                placeholder="Any relevant details…"
                className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-10 text-xs"
              />
            </div>
          </div>

          {/* Condition/risk tags */}
          <div className="space-y-2">
            <Label className="text-[9px] font-black uppercase tracking-widest text-white/60">
              <Tag className="w-3 h-3 inline mr-1" />Condition / Risk Tags
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {CONDITION_TAG_OPTIONS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                    draft.conditionTags?.includes(tag)
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-white/5 border-white/10 text-white/40 hover:border-white/30"
                  )}
                >
                  {tag.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              onClick={saveEntry}
              disabled={!draft.serviceType || !draft.serviceDate}
              className="bg-primary text-white font-black h-9 px-5 rounded-xl uppercase tracking-widest text-[10px]"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              Save Record
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={cancelEdit}
              className="text-white/40 hover:text-white h-9 px-4 rounded-xl font-black uppercase tracking-widest text-[10px]"
            >
              <X className="w-3.5 h-3.5 mr-1.5" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Entry list */}
      {entries.length === 0 && !isFormOpen ? (
        <div className="p-8 border border-dashed border-white/10 rounded-2xl text-center">
          <History className="w-8 h-8 text-white/20 mx-auto mb-2" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30">No previous services recorded yet.</p>
          <p className="text-[9px] font-bold text-white/20 mt-1">Add records to power marketing reminders &amp; recommendations.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, idx) => (
            <div
              key={entry.id}
              className={cn(
                "flex items-start gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 group transition-all",
                editingIdx === idx && "ring-1 ring-primary/30"
              )}
            >
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/10 shrink-0">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-xs font-black text-white uppercase tracking-tight truncate">{entry.serviceType}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      className={cn(
                        "text-[7px] font-black uppercase tracking-widest px-1.5 py-0 border-none",
                        entry.source === "completed_job" ? "bg-emerald-500/20 text-emerald-400" :
                        entry.source === "imported" ? "bg-blue-500/20 text-blue-400" :
                        "bg-white/10 text-white/50"
                      )}
                    >
                      {entry.source === "completed_job" ? "Completed Job" : entry.source === "imported" ? "Imported" : "Manual"}
                    </Badge>
                    {!readOnly && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-white/30 hover:text-primary opacity-0 group-hover:opacity-100 transition-all"
                          onClick={() => startEdit(idx)}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-white/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          onClick={() => deleteEntry(idx)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {entry.serviceDate ? (() => {
                      try { return format(parseISO(entry.serviceDate), "MMM d, yyyy"); } catch { return entry.serviceDate; }
                    })() : "No date"}
                  </span>
                  {entry.vehicleInfo && (
                    <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1">
                      <Car className="w-3 h-3" />{entry.vehicleInfo}
                    </span>
                  )}
                  {entry.priceCharged != null && (
                    <span className="text-[9px] font-bold text-primary uppercase tracking-widest">
                      {formatCurrency(entry.priceCharged)}
                    </span>
                  )}
                </div>
                {entry.conditionTags && entry.conditionTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {entry.conditionTags.map(t => (
                      <span key={t} className="px-1.5 py-0.5 bg-white/5 rounded text-[7px] font-black uppercase tracking-widest text-white/40">
                        {t.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}
                {entry.notes && (
                  <p className="text-[9px] text-white/30 mt-1.5 italic">{entry.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
