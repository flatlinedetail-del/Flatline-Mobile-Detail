import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileSignature, ShieldAlert, ShieldCheck, FileText, Workflow,
  Sparkles, Plus, Eye, ArrowUpRight, Clock, AlertTriangle,
  CheckCircle2, ChevronRight, TrendingUp,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { tsToDate, getTemplateStatus } from "./studioUtils";
import type { StudioFormTemplate, WaiverRule } from "../../types/waiver";

interface Props {
  templates: StudioFormTemplate[];
  rules: WaiverRule[];
  signedForms: any[];
  onNewTemplate: () => void;
  onAIDraft: () => void;
  onPreview: () => void;
  onManageRules: () => void;
  onViewSigned: () => void;
  onOpenTemplates: () => void;
}

export function StudioDashboard({
  templates, rules, signedForms,
  onNewTemplate, onAIDraft, onPreview, onManageRules, onViewSigned, onOpenTemplates,
}: Props) {
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const signedThisMonth = signedForms.filter(s => {
      const d = tsToDate(s.signedAt);
      return d && d >= monthStart;
    }).length;

    const active = templates.filter(t => getTemplateStatus(t) === "active").length;
    const draft = templates.filter(t => getTemplateStatus(t) === "draft").length;
    const archived = templates.filter(t => getTemplateStatus(t) === "archived").length;
    const highRisk = templates.filter(t => t.riskLevel === "high" || t.riskLevel === "critical").length;
    const activeRules = rules.filter(r => r.status === "active").length;

    // Best-effort: count templates with expiresAfterDays where last signature is past expiry
    const expiringTemplates = templates.filter(t => t.expiresAfterDays && t.expiresAfterDays > 0).length;

    return {
      signedThisMonth,
      active, draft, archived, highRisk,
      activeRules, totalRules: rules.length,
      expiringTemplates,
      totalSigned: signedForms.length,
    };
  }, [templates, rules, signedForms]);

  const recentSigned = useMemo(() => {
    return [...signedForms]
      .map(s => ({ ...s, _signedAt: tsToDate(s.signedAt) }))
      .filter(s => s._signedAt)
      .sort((a, b) => (b._signedAt as Date).getTime() - (a._signedAt as Date).getTime())
      .slice(0, 6);
  }, [signedForms]);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Signed This Month"
          value={stats.signedThisMonth}
          icon={FileSignature}
          tone="primary"
          sub={`${stats.totalSigned} all-time`}
        />
        <StatCard
          label="Active Templates"
          value={stats.active}
          icon={ShieldCheck}
          tone="emerald"
          sub={stats.draft > 0 ? `${stats.draft} draft` : "Production-ready"}
        />
        <StatCard
          label="High-Risk Waivers"
          value={stats.highRisk}
          icon={ShieldAlert}
          tone="orange"
          sub="Critical protections"
        />
        <StatCard
          label="Automation Rules"
          value={stats.activeRules}
          icon={Workflow}
          tone="blue"
          sub={`${stats.totalRules} configured`}
        />
        <StatCard
          label="Expiring Waivers"
          value={stats.expiringTemplates}
          icon={Clock}
          tone="amber"
          sub="With renewal logic"
        />
        <StatCard
          label="Archived"
          value={stats.archived}
          icon={FileText}
          tone="slate"
          sub="Retired templates"
        />
      </div>

      {/* Quick actions + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick actions */}
        <Card className="lg:col-span-1 border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-2xl">
          <CardContent className="p-6 space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Quick Actions</h3>

            <QuickAction
              icon={Plus}
              title="New Template"
              subtitle="Build a waiver from scratch"
              onClick={onNewTemplate}
              tone="primary"
            />
            <QuickAction
              icon={Sparkles}
              title="Generate With AI"
              subtitle="Draft a waiver from prompts"
              onClick={onAIDraft}
              tone="purple"
            />
            <QuickAction
              icon={Eye}
              title="Preview Signing Flow"
              subtitle="See what customers see"
              onClick={onPreview}
              tone="cyan"
            />
            <QuickAction
              icon={Workflow}
              title="Manage Rules"
              subtitle="Automate when forms apply"
              onClick={onManageRules}
              tone="blue"
            />
            <QuickAction
              icon={FileSignature}
              title="Signed Documents"
              subtitle="Audit trail & archive"
              onClick={onViewSigned}
              tone="emerald"
            />
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card className="lg:col-span-2 border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-2xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40">Recent Signing Activity</h3>
                <p className="text-sm text-white mt-1 font-bold">Latest signed forms across the business</p>
              </div>
              <button
                onClick={onViewSigned}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80 transition"
              >
                View all <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>

            {recentSigned.length === 0 ? (
              <EmptyState
                icon={FileSignature}
                title="No signed waivers yet"
                message="When customers sign a waiver, the audit trail shows up here."
                action={{ label: "Preview Signing Flow", onClick: onPreview }}
              />
            ) : (
              <div className="space-y-2">
                {recentSigned.map((s, i) => (
                  <div
                    key={s.id ?? i}
                    className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{s.formTitle ?? "Waiver"}</p>
                      <p className="text-[10px] text-white/50 truncate uppercase tracking-widest font-black">
                        {s.printedName ?? "Customer"}
                        {s._signedAt ? ` · ${(s._signedAt as Date).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-none text-[9px] uppercase tracking-widest font-black">
                      Signed
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Health panel */}
      <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-2xl">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40">Studio Health</h3>
              <p className="text-sm text-white mt-1 font-bold">Coverage across the customer lifecycle</p>
            </div>
            <button
              onClick={onOpenTemplates}
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80 transition"
            >
              Open Templates <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <HealthTile
              ok={stats.active > 0}
              okLabel="Live templates ready"
              warnLabel="No live templates"
              detail={`${stats.active} active · ${stats.draft} draft`}
              icon={ShieldCheck}
            />
            <HealthTile
              ok={stats.activeRules > 0}
              okLabel="Automation engaged"
              warnLabel="No active rules"
              detail={`${stats.activeRules}/${stats.totalRules} rules running`}
              icon={Workflow}
            />
            <HealthTile
              ok={stats.totalSigned > 0}
              okLabel="Signing activity"
              warnLabel="No signed waivers yet"
              detail={`${stats.totalSigned} signed all-time`}
              icon={TrendingUp}
            />
            <HealthTile
              ok={stats.highRisk > 0}
              okLabel="High-risk coverage"
              warnLabel="No high-risk waivers"
              detail={`${stats.highRisk} flagged high/critical`}
              icon={ShieldAlert}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, tone, sub,
}: {
  label: string;
  value: number;
  icon: any;
  tone: "primary" | "emerald" | "orange" | "blue" | "amber" | "slate";
  sub?: string;
}) {
  const toneClasses: Record<typeof tone, string> = {
    primary: "from-primary/20 to-primary/5 text-primary border-primary/20",
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-300 border-emerald-500/20",
    orange:  "from-orange-500/20 to-orange-500/5 text-orange-300 border-orange-500/20",
    blue:    "from-blue-500/20 to-blue-500/5 text-blue-300 border-blue-500/20",
    amber:   "from-amber-500/20 to-amber-500/5 text-amber-300 border-amber-500/20",
    slate:   "from-slate-500/20 to-slate-500/5 text-slate-300 border-slate-500/20",
  };

  return (
    <Card className={cn(
      "border bg-gradient-to-br rounded-3xl overflow-hidden shadow-xl",
      toneClasses[tone].split(" ").slice(0, 3).join(" "),
      "border-white/10 bg-[#0B0B0B]"
    )}>
      <CardContent className="p-5 relative">
        <div className={cn("absolute -top-8 -right-8 w-32 h-32 rounded-full bg-gradient-to-br opacity-20 blur-2xl", toneClasses[tone])} />
        <div className="relative">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3 bg-gradient-to-br", toneClasses[tone])}>
            <Icon className="w-4 h-4" />
          </div>
          <p className="text-3xl font-black text-white leading-none">{value}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mt-2">{label}</p>
          {sub && <p className="text-[9px] font-medium text-white/40 mt-1">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickAction({
  icon: Icon, title, subtitle, onClick, tone,
}: {
  icon: any;
  title: string;
  subtitle: string;
  onClick: () => void;
  tone: "primary" | "purple" | "cyan" | "blue" | "emerald";
}) {
  const tones: Record<typeof tone, string> = {
    primary:  "bg-primary/10 hover:bg-primary/20 text-primary border-primary/20",
    purple:   "bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/20",
    cyan:     "bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/20",
    blue:     "bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border-blue-500/20",
    emerald:  "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/20",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl border transition-all group text-left",
        tones[tone],
      )}
    >
      <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-white">{title}</p>
        <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium">{subtitle}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition shrink-0" />
    </button>
  );
}

function HealthTile({
  ok, okLabel, warnLabel, detail, icon: Icon,
}: {
  ok: boolean;
  okLabel: string;
  warnLabel: string;
  detail: string;
  icon: any;
}) {
  return (
    <div className={cn(
      "p-4 rounded-2xl border transition-all",
      ok ? "bg-emerald-500/5 border-emerald-500/20" : "bg-amber-500/5 border-amber-500/20",
    )}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={cn("w-4 h-4", ok ? "text-emerald-400" : "text-amber-400")} />
        {ok ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        )}
      </div>
      <p className={cn("text-xs font-black uppercase tracking-widest", ok ? "text-emerald-300" : "text-amber-300")}>
        {ok ? okLabel : warnLabel}
      </p>
      <p className="text-[10px] text-white/40 mt-1 font-medium">{detail}</p>
    </div>
  );
}

function EmptyState({
  icon: Icon, title, message, action,
}: {
  icon: any;
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-white/40" />
      </div>
      <p className="text-sm font-black text-white uppercase tracking-tight">{title}</p>
      <p className="text-xs text-white/40 mt-1 max-w-sm">{message}</p>
      {action && (
        <Button
          onClick={action.onClick}
          className="mt-4 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest rounded-xl text-xs h-9"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
