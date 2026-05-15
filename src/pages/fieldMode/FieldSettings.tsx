import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  HelpCircle,
  LogOut,
  Monitor as MonitorIcon,
} from "lucide-react";

/**
 * Phone-only Settings view. Rendered at `/settings` when the device is a
 * phone, via SettingsSwitch in App.tsx. Surfaces profile info and the
 * two most-needed quick actions for field staff: Help and Sign Out.
 *
 * No Firestore fetching needed — all data comes from the live `useAuth()`
 * context that is already loaded. Passing `?adminView=1` falls through to
 * the full desktop Settings page.
 */

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function roleBadgeClass(role: string | null | undefined): string {
  switch (role) {
    case "owner":
      return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    case "admin":
      return "bg-violet-500/15 text-violet-300 ring-violet-500/30";
    case "manager":
      return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
    case "technician":
      return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    default:
      return "bg-white/10 text-white/60 ring-white/15";
  }
}

export default function FieldSettings() {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="px-0.5">
        <h1 className="text-base font-black text-white leading-none">Settings</h1>
      </div>

      {/* Profile card */}
      <div className="rounded-xl border border-white/5 bg-sidebar/60 px-3 py-4 flex flex-col items-center gap-2.5">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-full bg-[#0A4DFF]/15 ring-2 ring-[#0A4DFF]/30 flex items-center justify-center">
          <span className="text-xl font-black text-[#0A4DFF] leading-none">
            {getInitials(profile?.displayName)}
          </span>
        </div>

        {/* Name & email */}
        <div className="text-center min-w-0">
          <p className="text-[12px] font-bold text-white leading-tight truncate">
            {profile?.displayName || "Unknown User"}
          </p>
          <p className="text-[10px] text-white/45 leading-tight mt-0.5 truncate">
            {profile?.email || ""}
          </p>
        </div>

        {/* Role badge */}
        {profile?.role && (
          <span
            className={cn(
              "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ring-1 leading-none",
              roleBadgeClass(profile.role),
            )}
          >
            {profile.role}
          </span>
        )}
      </div>

      {/* Quick actions */}
      <div className="space-y-1.5">
        {/* Help */}
        <button
          type="button"
          onClick={() => navigate("/help")}
          className="w-full flex items-center gap-2.5 rounded-xl border border-white/5 bg-sidebar/40 hover:bg-sidebar/70 active:bg-sidebar transition-colors px-2.5 py-2 min-h-[48px]"
        >
          <div className="shrink-0 w-8 h-8 rounded-md bg-sky-500/10 ring-1 ring-sky-500/25 flex items-center justify-center">
            <HelpCircle className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[12px] font-bold text-white leading-tight">Help</p>
            <p className="text-[10px] text-white/40 leading-tight mt-0.5">Documentation and support</p>
          </div>
        </button>

        {/* Sign Out */}
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 rounded-xl border border-white/5 bg-sidebar/40 hover:bg-sidebar/70 active:bg-sidebar transition-colors px-2.5 py-2 min-h-[48px]"
        >
          <div className="shrink-0 w-8 h-8 rounded-md bg-rose-500/10 ring-1 ring-rose-500/25 flex items-center justify-center">
            <LogOut className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[12px] font-bold text-white leading-tight">Sign Out</p>
            <p className="text-[10px] text-white/40 leading-tight mt-0.5">Sign out of your account</p>
          </div>
        </button>
      </div>

      {/* Bridge card */}
      <button
        type="button"
        onClick={() => navigate("/settings?adminView=1")}
        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors px-2.5 py-3 min-h-[52px]"
      >
        <div className="shrink-0 w-8 h-8 rounded-md bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
          <MonitorIcon className="w-4 h-4 text-white/50" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-bold text-white leading-tight">Open Full Admin Settings</p>
          <p className="text-[10px] text-white/40 leading-tight mt-0.5">All charts, exports, and editing tools</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>
    </div>
  );
}
