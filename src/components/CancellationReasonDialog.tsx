import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Appointment } from "../types";

/**
 * Shared dialog used by both the desktop JobDetail page and the phone
 * Field Mode ActiveJob screen to capture a reason whenever a job is
 * cancelled, marked no-show, or marked missed.
 *
 * The dialog:
 *   - blocks the status change until a reason is submitted,
 *   - collects a structured category (for analytics) plus a free-text note,
 *   - returns the submitted reason via `onSubmit({ reason, category })`.
 *
 * Saving and side-effects (Firestore write, waitlist routing, fee gate,
 * booking-intelligence flag) live in the caller — this component only
 * captures the input. That keeps the component reusable across the two
 * surfaces without entangling business logic.
 *
 * Categories are aligned with the Appointment type's
 * `cancellationReasonCategory` enum so analytics can group them.
 */

export type CancellationKind = "canceled" | "no_show" | "missed";

const KIND_COPY: Record<
  CancellationKind,
  { title: string; description: string; submitLabel: string }
> = {
  canceled: {
    title: "Cancel job — why?",
    description:
      "Reason is required and is saved with the job for analytics. If the job is within the cancellation window, a fee may apply.",
    submitLabel: "Cancel job",
  },
  no_show: {
    title: "Mark no-show — why?",
    description:
      "Capture what happened so the business can track no-shows by reason.",
    submitLabel: "Mark no-show",
  },
  missed: {
    title: "Mark missed — why?",
    description:
      "Capture what caused the miss so we can track preventable losses.",
    submitLabel: "Mark missed",
  },
};

const CATEGORIES: { value: NonNullable<Appointment["cancellationReasonCategory"]>; label: string }[] = [
  { value: "client_request", label: "Client requested" },
  { value: "weather", label: "Weather" },
  { value: "vehicle_unavailable", label: "Vehicle unavailable" },
  { value: "scheduling_conflict", label: "Scheduling conflict" },
  { value: "duplicate", label: "Duplicate booking" },
  { value: "other", label: "Other" },
];

export interface CancellationReasonResult {
  reason: string;
  category: NonNullable<Appointment["cancellationReasonCategory"]>;
}

export interface CancellationReasonDialogProps {
  open: boolean;
  kind: CancellationKind;
  /** Optional cancellation-fee hint (only meaningful for `canceled`). */
  feePreview?: { willApply: boolean; amount: number };
  busy?: boolean;
  onOpenChange: (next: boolean) => void;
  onSubmit: (result: CancellationReasonResult) => void | Promise<void>;
}

export function CancellationReasonDialog({
  open,
  kind,
  feePreview,
  busy,
  onOpenChange,
  onSubmit,
}: CancellationReasonDialogProps) {
  const copy = KIND_COPY[kind];
  const [category, setCategory] = useState<CancellationReasonResult["category"]>("client_request");
  const [reason, setReason] = useState("");

  // Reset state every time the dialog opens. Prevents stale text from a
  // previous attempt leaking into a different job.
  useEffect(() => {
    if (open) {
      setCategory("client_request");
      setReason("");
    }
  }, [open, kind]);

  const canSubmit = reason.trim().length >= 2 && !busy;

  const handleSubmit = () => {
    if (!canSubmit) return;
    void onSubmit({ reason: reason.trim(), category });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-md w-[96vw] sm:w-full bg-card border border-white/10">
        <DialogHeader>
          <DialogTitle className="text-base font-black uppercase tracking-wider text-white">
            {copy.title}
          </DialogTitle>
          <DialogDescription className="text-xs text-white/60">
            {copy.description}
          </DialogDescription>
        </DialogHeader>

        {kind === "canceled" && feePreview && (
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-[11px] font-bold",
              feePreview.willApply
                ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
            )}
          >
            {feePreview.willApply
              ? `Cancellation fee will apply: $${feePreview.amount.toFixed(2)}`
              : "No cancellation fee — within window."}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">
            Category
          </Label>
          <div className="grid grid-cols-2 gap-1.5">
            {CATEGORIES.map((c) => {
              const active = c.value === category;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={cn(
                    "rounded-lg border px-2.5 py-2 text-left min-h-[40px] transition-colors",
                    active
                      ? "border-[#0A4DFF]/50 bg-[#0A4DFF]/15 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]",
                  )}
                >
                  <span className="text-[11px] font-bold leading-tight">{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reason-textarea" className="text-[10px] font-black uppercase tracking-widest text-white/60">
            Reason details
          </Label>
          <Textarea
            id="reason-textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="What happened?"
            className="bg-white/[0.03] border-white/10 text-white text-sm placeholder-white/30 resize-none"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="text-white/70 hover:text-white"
          >
            Back
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
          >
            {busy ? "Saving…" : copy.submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CancellationReasonDialog;
