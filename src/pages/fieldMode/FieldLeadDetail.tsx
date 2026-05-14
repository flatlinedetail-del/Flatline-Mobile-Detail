import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn, toJsDateOrNull, formatPhoneNumber } from "@/lib/utils";
import {
  ArrowLeft,
  Phone,
  Mail,
  Car,
  Wrench,
  Tag,
  User,
  Monitor,
  ExternalLink,
  AlertCircle,
  MessageSquare,
} from "lucide-react";

interface LeadData {
  name?: string;
  email?: string;
  phone?: string;
  vehicleInfo?: string;
  requestedService?: string;
  source?: string;
  status?: string;
  priority?: string;
  notes?: string;
  createdAt?: unknown;
}

function priorityTone(p: string): string {
  switch (p) {
    case "hot":    return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
    case "high":   return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    case "medium": return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "low":    return "bg-white/10 text-white/50 ring-white/15";
    default:       return "bg-white/10 text-white/50 ring-white/15";
  }
}

function statusTone(s: string): string {
  switch (s) {
    case "converted":        return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "lost":             return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
    case "new":
    case "contacted":
    case "quoted":           return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "maintenance_due":  return "bg-violet-500/15 text-violet-300 ring-violet-500/30";
    default:                 return "bg-white/10 text-white/50 ring-white/15";
  }
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function FieldLeadDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const leadId = searchParams.get("leadId");

  const [lead, setLead] = useState<LeadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) {
      setLoading(false);
      return;
    }
    const ref = doc(db, "leads", leadId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setLead(snap.data() as LeadData);
        } else {
          setError("Lead not found.");
        }
        setLoading(false);
      },
      (err) => {
        console.warn("[FieldLeadDetail] snapshot error", err);
        setError(err?.message || "Failed to load lead.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [leadId]);

  // ── No leadId ──
  if (!leadId) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <h1 className="text-base font-black text-white leading-none">Lead</h1>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-[12px] font-bold text-rose-300 leading-tight">No lead selected.</p>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <h1 className="text-base font-black text-white leading-none">Lead</h1>
        </div>
        <div className="rounded-xl border border-white/5 bg-sidebar/40 px-3 py-3 flex items-center justify-center min-h-[56px]">
          <div className="w-3.5 h-3.5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
          <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/40">
            Loading…
          </span>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error || !lead) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <h1 className="text-base font-black text-white leading-none">Lead</h1>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-300 leading-tight">
              Couldn't load lead
            </p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">
              {error ?? "Unknown error"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const name = lead.name ?? "Unknown Lead";
  const initials = getInitials(name);
  const phone = lead.phone ?? "";
  const email = lead.email ?? "";
  const priority = lead.priority ?? "";
  const status = lead.status ?? "";

  return (
    <div className="space-y-3">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <h1 className="text-base font-black text-white leading-none">Lead</h1>
      </div>

      {/* ── Header card ── */}
      <div className="rounded-xl border border-white/5 bg-sidebar/60 px-3 py-3 flex items-center gap-3">
        <div className="shrink-0 w-14 h-14 rounded-xl bg-white/10 ring-2 ring-white/15 flex items-center justify-center text-[18px] font-black text-white/70 uppercase">
          {initials || <User className="w-6 h-6 text-white/50" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-white leading-none truncate">{name}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {priority && (
              <span
                className={cn(
                  "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none",
                  priorityTone(priority),
                )}
              >
                {priority}
              </span>
            )}
            {status && (
              <span
                className={cn(
                  "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none",
                  statusTone(status),
                )}
              >
                {status.replace(/_/g, " ")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Info rows ── */}
      <div className="rounded-xl border border-white/5 bg-sidebar/40 divide-y divide-white/[0.04]">
        {/* Phone */}
        {phone && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 min-h-[48px]">
            <Phone className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-0.5">
                Phone
              </p>
              <p className="text-[12px] font-bold text-white leading-tight">
                {formatPhoneNumber(phone)}
              </p>
            </div>
          </div>
        )}
        {/* Email */}
        {email && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 min-h-[48px]">
            <Mail className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-0.5">
                Email
              </p>
              <p className="text-[12px] font-bold text-white leading-tight truncate">{email}</p>
            </div>
          </div>
        )}
        {/* Vehicle info */}
        {lead.vehicleInfo && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 min-h-[48px]">
            <Car className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-0.5">
                Vehicle
              </p>
              <p className="text-[12px] font-bold text-white leading-tight">
                {lead.vehicleInfo}
              </p>
            </div>
          </div>
        )}
        {/* Requested service */}
        {lead.requestedService && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 min-h-[48px]">
            <Wrench className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-0.5">
                Service
              </p>
              <p className="text-[12px] font-bold text-white leading-tight">
                {lead.requestedService}
              </p>
            </div>
          </div>
        )}
        {/* Source */}
        {lead.source && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 min-h-[48px]">
            <Tag className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-0.5">
                Source
              </p>
              <p className="text-[12px] font-bold text-white leading-tight capitalize">
                {lead.source}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Quick action buttons ── */}
      {(phone || email) && (
        <div className="flex gap-2">
          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex-1 flex items-center justify-center gap-1.5 min-h-[48px] rounded-xl border border-white/5 bg-emerald-500/10 hover:bg-emerald-500/15 active:bg-emerald-500/10 transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] font-bold text-emerald-300">Call</span>
            </a>
          )}
          {phone && (
            <a
              href={`sms:${phone}`}
              className="flex-1 flex items-center justify-center gap-1.5 min-h-[48px] rounded-xl border border-white/5 bg-sky-500/10 hover:bg-sky-500/15 active:bg-sky-500/10 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[11px] font-bold text-sky-300">Text</span>
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="flex-1 flex items-center justify-center gap-1.5 min-h-[48px] rounded-xl border border-white/5 bg-violet-500/10 hover:bg-violet-500/15 active:bg-violet-500/10 transition-colors"
            >
              <Mail className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[11px] font-bold text-violet-300">Email</span>
            </a>
          )}
        </div>
      )}

      {/* ── Notes ── */}
      {lead.notes && (
        <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-1.5">
            Notes
          </p>
          <p className="text-[12px] font-bold text-white/70 leading-relaxed">{lead.notes}</p>
        </div>
      )}

      {/* ── Bridge card ── */}
      <button
        type="button"
        onClick={() => navigate(`/leads?leadId=${leadId}&adminView=1`)}
        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-2.5 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-md bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
          <Monitor className="w-4 h-4 text-white/50" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-bold text-white leading-tight">Open Full Lead</p>
          <p className="text-[10px] text-white/40 leading-tight mt-0.5">
            Edit status, add notes, convert to booking
          </p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>
    </div>
  );
}
