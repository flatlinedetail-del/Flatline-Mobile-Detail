import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn, formatPhoneNumber } from "@/lib/utils";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Star,
  User,
  Monitor,
  ExternalLink,
  AlertCircle,
  MessageSquare,
  Calendar,
} from "lucide-react";

interface ClientData {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  email?: string;
  phone?: string;
  address?: string;
  isVIP?: boolean;
  notes?: string;
}

function getInitials(data: ClientData): string {
  const first = data.firstName?.charAt(0) ?? "";
  const last = data.lastName?.charAt(0) ?? "";
  if (first || last) return (first + last).toUpperCase();
  const name = data.name ?? data.businessName ?? "";
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getDisplayName(data: ClientData): string {
  const parts = [data.firstName, data.lastName].filter(Boolean).join(" ");
  if (parts) return parts;
  return data.name ?? data.businessName ?? "Unnamed Client";
}

export default function FieldClientDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId");

  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    const ref = doc(db, "clients", clientId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setClient({ id: snap.id, ...(snap.data() as ClientData) });
        } else {
          setError("Client not found.");
        }
        setLoading(false);
      },
      (err) => {
        console.warn("[FieldClientDetail] snapshot error", err);
        setError(err?.message || "Failed to load client.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [clientId]);

  // ── No clientId in URL ──
  if (!clientId) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <h1 className="text-base font-black text-white leading-none">Client</h1>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-[12px] font-bold text-rose-300 leading-tight">No client selected.</p>
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
          <h1 className="text-base font-black text-white leading-none">Client</h1>
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
  if (error || !client) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <h1 className="text-base font-black text-white leading-none">Client</h1>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-rose-300 leading-tight">
              Couldn't load client
            </p>
            <p className="text-[9px] text-rose-300/70 mt-0.5 break-words leading-tight">
              {error ?? "Unknown error"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const displayName = getDisplayName(client);
  const initials = getInitials(client);
  const phone = client.phone ?? "";
  const email = client.email ?? "";
  const address = client.address ?? "";

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
        <h1 className="text-base font-black text-white leading-none flex-1">Client</h1>
        {client.isVIP && (
          <Star className="w-4 h-4 text-amber-400 fill-amber-400/70 shrink-0" />
        )}
      </div>

      {/* ── Avatar card ── */}
      <div className="rounded-xl border border-white/5 bg-sidebar/60 px-3 py-3 flex items-center gap-3">
        <div className="shrink-0 w-14 h-14 rounded-xl bg-[#0A4DFF]/15 ring-2 ring-[#0A4DFF]/30 flex items-center justify-center text-[18px] font-black text-[#0A4DFF] uppercase">
          {initials || <User className="w-6 h-6 text-[#0A4DFF]/70" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-white leading-none truncate">{displayName}</p>
          {client.businessName && client.businessName !== displayName && (
            <p className="text-[11px] text-white/45 font-medium mt-0.5 truncate leading-tight">
              {client.businessName}
            </p>
          )}
          <span
            className={cn(
              "inline-block mt-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 leading-none",
              client.isVIP
                ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                : "bg-white/10 text-white/60 ring-white/15",
            )}
          >
            {client.isVIP ? "VIP" : "Client"}
          </span>
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
        {/* Address */}
        {address && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 min-h-[48px]">
            <MapPin className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-0.5">
                Address
              </p>
              <p className="text-[12px] font-bold text-white leading-tight">{address}</p>
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

      {/* ── Quick Book button ── */}
      <button
        type="button"
        onClick={() => navigate(`/field/book-job?clientId=${clientId}`)}
        className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-[#0A4DFF] hover:bg-[#0A4DFF]/90 active:bg-[#0A4DFF]/80 transition-colors"
      >
        <Calendar className="w-4 h-4 text-white" />
        <span className="text-[13px] font-black text-white">Book Job</span>
      </button>

      {/* ── Notes ── */}
      {client.notes && (
        <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 leading-none mb-1.5">
            Notes
          </p>
          <p className="text-[12px] font-bold text-white/70 leading-relaxed">{client.notes}</p>
        </div>
      )}

      {/* ── Bridge card ── */}
      <button
        type="button"
        onClick={() =>
          navigate(`/clients?clientId=${clientId}&adminView=1`)
        }
        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-2.5 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-md bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
          <Monitor className="w-4 h-4 text-white/50" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-bold text-white leading-tight">
            Open Full Client Profile
          </p>
          <p className="text-[10px] text-white/40 leading-tight mt-0.5">
            Service history, vehicles, invoices, documents
          </p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>
    </div>
  );
}
