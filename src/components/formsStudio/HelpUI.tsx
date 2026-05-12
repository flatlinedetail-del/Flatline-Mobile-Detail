import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info, BookOpen, ChevronDown, ChevronUp, X, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * Forms & Waivers Studio — shared help components.
 *
 *  - <InfoTip>  : small (i) icon that opens a short plain-English popover.
 *                 Works on hover (desktop) and tap (mobile).
 *  - <BuilderDirections> : collapsible "How to Use This Builder" card with
 *                          numbered steps. Dismissal is persisted to
 *                          localStorage so it doesn't nag returning users.
 *
 * These are additive — no existing UI was redesigned.
 */

interface InfoTipProps {
  title?: string;
  children: React.ReactNode;
  /** Visual size. Default 14px. */
  size?: number;
  /** Optional className for the trigger button. */
  className?: string;
  /** Accessible label for screen readers / mobile tap hint. */
  label?: string;
}

export function InfoTip({ title, children, size = 14, className, label }: InfoTipProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={label ?? (title ? `More info: ${title}` : "More info")}
            className={cn(
              "inline-flex items-center justify-center rounded-full text-white/40 hover:text-primary hover:bg-primary/10 transition shrink-0 align-middle",
              className,
            )}
            style={{ width: size + 8, height: size + 8 }}
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <Info style={{ width: size, height: size }} />
      </PopoverTrigger>
      <PopoverContent className="max-w-xs p-3 bg-[#0B0B0B] border border-white/10 rounded-2xl shadow-2xl text-left">
        {title && (
          <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1.5">
            {title}
          </p>
        )}
        <p className="text-xs text-white/80 leading-relaxed">{children}</p>
      </PopoverContent>
    </Popover>
  );
}

const DISMISS_KEY = "formsStudio.builderDirectionsDismissed";

interface BuilderDirectionsProps {
  variant?: "editor" | "studio";
  /** Optional override for the stored dismissal key (useful for sub-surfaces). */
  storageKey?: string;
}

export function BuilderDirections({ variant = "editor", storageKey }: BuilderDirectionsProps) {
  const key = storageKey ?? DISMISS_KEY;
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<boolean>(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v === "1") setDismissed(true);
      const e = localStorage.getItem(key + ".expanded");
      if (e === "0") setExpanded(false);
    } catch {/* ignore */}
  }, [key]);

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(key, "1"); } catch {/* ignore */}
  };

  const toggle = () => {
    setExpanded(prev => {
      const next = !prev;
      try { localStorage.setItem(key + ".expanded", next ? "1" : "0"); } catch {/* ignore */}
      return next;
    });
  };

  if (dismissed) return null;

  const steps = variant === "editor"
    ? [
        "Pick blocks from the Block Library on the left.",
        "Click any block in the canvas to select and edit it.",
        "Use the ↑ / ↓ arrows on the side of a block to reorder sections.",
        "Mark important sections required in the right-side Settings panel.",
        "Add acknowledgment checkboxes or initials blocks where customers must confirm.",
        "Click Preview to see exactly what the customer will see.",
        "Save Template when finished — drafts won't be sent to customers.",
        "Open Smart Rules so this waiver attaches automatically to the right jobs, bookings, or invoices.",
      ]
    : [
        "Create a template from scratch, start from AI Draft, or pick a starter.",
        "Build the document with blocks — legal text, signature, initials, acknowledgments.",
        "Mark which services, add-ons, or risk profiles require this waiver.",
        "Add Smart Rules to auto-attach the waiver at quote, booking, job, or invoice time.",
        "Preview the customer view before activating.",
        "Activate the template — it now applies everywhere it's needed.",
      ];

  return (
    <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-[#0B0B0B] to-[#0B0B0B] overflow-hidden shadow-xl">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">
              Quick Guide
            </p>
            <p className="text-sm font-black text-white truncate">
              How to Use This Builder
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
          <button
            type="button"
            aria-label="Dismiss directions"
            onClick={(e) => { e.stopPropagation(); dismiss(); }}
            className="w-7 h-7 rounded-lg hover:bg-white/5 text-white/40 hover:text-white flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 -mt-1">
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/25 text-primary text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-xs text-white/80 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-4 flex items-start gap-2 p-3 rounded-2xl bg-white/[0.03] border border-white/10">
            <Sparkles className="w-3.5 h-3.5 text-purple-300 shrink-0 mt-0.5" />
            <p className="text-[11px] text-white/60 leading-relaxed">
              <span className="font-black uppercase tracking-widest text-purple-300 text-[10px]">Tip</span>
              {" "}— if you're not sure where to start, click <span className="font-black text-white">AI Draft</span> and pick the protections you care about. The Studio will build a starter document you can edit block-by-block.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact in-flow help message — used inside panels (block library,
 * settings, etc.) where a full directions card would be too much.
 */
export function HelpHint({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/10">
      <div className="text-primary shrink-0 mt-0.5">
        {icon ?? <Info className="w-3.5 h-3.5" />}
      </div>
      <p className="text-[10px] text-white/50 leading-relaxed">{children}</p>
    </div>
  );
}
