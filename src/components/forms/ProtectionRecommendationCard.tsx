import { ShieldCheck, ShieldAlert, Check, X, CheckCircle2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RiskAssessment } from "../../services/formRiskAssessment";

interface RecommendedTemplate {
  id: string;
  title: string;
}

interface Props {
  assessment: RiskAssessment;
  recommended: RecommendedTemplate[];
  decision: "pending" | "attach" | "skip";
  onAttach: () => void;
  onSkip: () => void;
  /** Phase 2: opens AIDraftModal prefilled with appointment context. */
  onGenerateCustom?: () => void;
  /** Disable buttons during parent save flow. */
  disabled?: boolean;
}

export function ProtectionRecommendationCard({
  assessment, recommended, decision, onAttach, onSkip, onGenerateCustom, disabled,
}: Props) {
  const isHigh = assessment.level === "high";
  const headerLabel = isHigh ? "Protection Strongly Recommended" : "Protection Recommended";
  const tone = isHigh ? "amber" : "primary";

  return (
    <div
      className={cn(
        "rounded-3xl border p-5 md:p-6 shadow-2xl transition-colors",
        tone === "amber"
          ? "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.06] via-[#0B0B0B] to-[#0B0B0B]"
          : "border-primary/25 bg-gradient-to-br from-primary/[0.06] via-[#0B0B0B] to-[#0B0B0B]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              "w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0",
              tone === "amber"
                ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                : "bg-primary/15 border-primary/30 text-primary",
            )}
          >
            {isHigh ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <p
              className={cn(
                "text-[10px] font-black uppercase tracking-widest",
                tone === "amber" ? "text-amber-300" : "text-primary",
              )}
            >
              {headerLabel}
            </p>
            <p className="text-sm md:text-base text-white/85 mt-1 leading-relaxed">
              {summaryLine(assessment)}
            </p>
          </div>
        </div>
        <DecisionBadge decision={decision} />
      </div>

      {/* Reasons */}
      {assessment.reasons.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {assessment.reasons.map((reason, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-white/55">
              <span
                className={cn(
                  "mt-1.5 w-1 h-1 rounded-full shrink-0",
                  tone === "amber" ? "bg-amber-400/60" : "bg-primary/60",
                )}
              />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Suggested documents */}
      <div className="mt-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">
          Suggested documents
        </p>
        {recommended.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs text-white/50">
            No active template matches the dominant risk on this job.
            {assessment.generateCustomSuggestion && onGenerateCustom && (
              <> Use <strong className="text-white/80">Generate Custom Protection Form</strong> below to create one.</>
            )}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {recommended.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 text-sm text-white/80 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2"
              >
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{t.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="mt-5 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onSkip}
          disabled={disabled}
          className={cn(
            "text-white/55 hover:text-white text-xs font-medium normal-case tracking-normal h-10",
            decision === "skip" && "text-white/80",
          )}
        >
          {decision === "skip" ? "Skipped — click Attach to undo" : "Skip for Now"}
        </Button>
        {onGenerateCustom && (
          <Button
            type="button"
            variant="outline"
            onClick={onGenerateCustom}
            disabled={disabled}
            className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black uppercase tracking-widest rounded-xl text-[10px] h-10 px-4"
          >
            Generate Custom Protection Form
          </Button>
        )}
        <Button
          type="button"
          onClick={onAttach}
          disabled={disabled}
          className={cn(
            "font-black uppercase tracking-widest rounded-xl text-[10px] h-10 px-5 shadow-glow-blue",
            decision === "attach"
              ? "bg-emerald-500 hover:bg-emerald-500/90 text-white"
              : "bg-primary hover:bg-[#2A6CFF] text-white",
          )}
        >
          {decision === "attach" ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Recommended — Will Attach
            </>
          ) : (
            <>Attach Recommended</>
          )}
        </Button>
      </div>

      <p className="mt-3 text-[10px] text-white/30 leading-relaxed">
        Forms will be created as drafts after you confirm the booking. Nothing is sent to the customer
        automatically.
      </p>
    </div>
  );
}

function summaryLine(a: RiskAssessment): string {
  if (a.level === "high") {
    return "This job carries elevated risk. A signed customer acknowledgment is strongly recommended before starting.";
  }
  return "This job may benefit from a signed customer acknowledgment.";
}

function DecisionBadge({ decision }: { decision: "pending" | "attach" | "skip" }) {
  if (decision === "attach") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-300 border-none text-[9px] font-black uppercase tracking-widest shrink-0">
        Recommended
      </Badge>
    );
  }
  if (decision === "skip") {
    return (
      <Badge className="bg-white/10 text-white/50 border-none text-[9px] font-black uppercase tracking-widest shrink-0">
        Skipped
      </Badge>
    );
  }
  return null;
}
