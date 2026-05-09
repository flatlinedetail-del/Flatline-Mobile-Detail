/**
 * Dashboard "Needs Attention" / Action Center card.
 *
 * Single source of truth: useActionCenter(). The same hook powers the bell.
 *
 * Categories rendered as badges so admins can see the breakdown at a glance:
 *   communications · forms · payments · jobs · quotes · risk
 *
 * Clicking an item routes to the canonical detail page via item.route, which
 * is centralized in services/actionCenter.ts.
 */

import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CheckCircle2,
  MessagesSquare,
  FileText,
  CreditCard,
  Briefcase,
  ShieldAlert,
  ChevronRight,
} from "lucide-react";
import { useActionCenter } from "../hooks/useActionCenter";
import { ActionCategory, ActionItem } from "../services/actionCenter";
import { cn } from "@/lib/utils";

const CATEGORY_META: Record<
  ActionCategory,
  { label: string; icon: any; color: string }
> = {
  communications: {
    label: "Comms",
    icon: MessagesSquare,
    color: "text-blue-400",
  },
  forms: { label: "Forms", icon: FileText, color: "text-purple-400" },
  payments: { label: "Payments", icon: CreditCard, color: "text-emerald-400" },
  jobs: { label: "Jobs", icon: Briefcase, color: "text-amber-400" },
  quotes: { label: "Quotes", icon: FileText, color: "text-cyan-400" },
  risk: { label: "Risk", icon: ShieldAlert, color: "text-red-400" },
  confirmations: {
    label: "Confirmed",
    icon: CheckCircle2,
    color: "text-emerald-400",
  },
};

export function NeedsAttentionCard() {
  const navigate = useNavigate();
  const { unresolved, byCategory, unresolvedCount, loading } = useActionCenter();

  const visible = unresolved.slice(0, 6);

  return (
    <Card className="bg-card border-white/5 rounded-3xl shadow-2xl shadow-black/40 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-white text-base font-black uppercase tracking-widest">
              Needs Attention
            </CardTitle>
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
              {loading
                ? "Syncing..."
                : `${unresolvedCount} unresolved item${unresolvedCount === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <Badge
          className={cn(
            "border-none text-white px-3 py-1 font-black",
            unresolvedCount === 0 ? "bg-emerald-500/20" : "bg-amber-500/20"
          )}
        >
          {unresolvedCount}
        </Badge>
      </CardHeader>

      <CardContent className="p-6 space-y-4">
        {/* Category strip */}
        <div className="flex flex-wrap gap-2">
          {(
            ["communications", "forms", "payments", "jobs", "quotes", "risk"] as ActionCategory[]
          ).map((cat) => {
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            const count = byCategory[cat]?.filter((i) => i.status === "open").length || 0;
            return (
              <div
                key={cat}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-xl border",
                  count > 0
                    ? "bg-white/5 border-white/10"
                    : "bg-white/[0.02] border-white/5 opacity-50"
                )}
              >
                <Icon className={cn("w-3.5 h-3.5", meta.color)} />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">
                  {meta.label}
                </span>
                <span className="text-xs font-bold text-white">{count}</span>
              </div>
            );
          })}
        </div>

        {/* Top items */}
        {unresolvedCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-2" />
            <p className="text-sm font-bold text-white">All clear</p>
            <p className="text-[11px] text-white/50">No unresolved items</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((item) => (
              <ActionRow key={item.id} item={item} onOpen={() => navigate(item.route)} />
            ))}
            {unresolvedCount > visible.length && (
              <Button
                variant="ghost"
                className="w-full text-white/60 hover:text-white hover:bg-white/5 text-[11px] font-black uppercase tracking-widest"
                onClick={() => navigate("/clients")}
              >
                View all {unresolvedCount} items
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionRow({ item, onOpen }: { item: ActionItem; onOpen: () => void }) {
  const meta = CATEGORY_META[item.category];
  const Icon = meta.icon;
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
        <Icon className={cn("w-4 h-4", meta.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{item.label}</p>
        {item.detail && (
          <p className="text-[11px] text-white/50 truncate">{item.detail}</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
    </button>
  );
}

/**
 * Companion card showing today's confirmation/readiness events:
 *   forms signed, deposits paid, etc.
 */
export function TodaysConfirmationsCard() {
  const navigate = useNavigate();
  const { confirmations } = useActionCenter();

  // Filter to today's events only.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const todays = confirmations.filter((c) => {
    const ts = c.resolvedAt || c.createdAt;
    if (!ts) return false;
    const ms = ts instanceof Date ? ts.getTime() : (ts as any)?.toDate?.()?.getTime?.();
    return typeof ms === "number" && ms >= todayMs;
  });

  return (
    <Card className="bg-card border-white/5 rounded-3xl shadow-2xl shadow-black/40 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-white text-base font-black uppercase tracking-widest">
              Today's Confirmations
            </CardTitle>
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
              Job readiness events
            </p>
          </div>
        </div>
        <Badge className="bg-emerald-500/20 border-none text-white px-3 py-1 font-black">
          {todays.length}
        </Badge>
      </CardHeader>
      <CardContent className="p-6 space-y-2">
        {todays.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm font-bold text-white/60">No confirmations yet today</p>
            <p className="text-[11px] text-white/40">
              Signed forms and paid deposits will appear here
            </p>
          </div>
        ) : (
          todays
            .slice(0, 6)
            .map((item) => (
              <ActionRow key={item.id} item={item} onOpen={() => navigate(item.route)} />
            ))
        )}
      </CardContent>
    </Card>
  );
}
