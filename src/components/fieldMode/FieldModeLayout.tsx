import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { LogOut, Settings as SettingsIcon, HelpCircle, BarChart, MessageSquare, Wallet, ShieldCheck, ShieldAlert, PlusCircle, UserPlus, FileText } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import Logo from "../Logo";
import { SyncIndicator } from "../SyncIndicator";
import FieldModeBottomNav from "./FieldModeBottomNav";

/**
 * Phone-only Field Mode shell.
 *
 * This shell is ONLY mounted for `<768px` viewports by ShellSwitch.
 * Tablet and desktop continue to use src/components/Layout.tsx
 * untouched. The Outlet renders the same protected routes the
 * desktop layout uses — we are not duplicating modules or changing
 * routing, just changing the chrome around them on phones.
 *
 * Layout structure (top to bottom):
 *   - Slim system-status banner (offline / quota) when applicable
 *   - Slim top bar: logo + sync indicator + "More" trigger
 *   - <Outlet /> with bottom padding to clear the fixed nav
 *   - Fixed bottom navigation with field-first destinations
 *
 * The "More" sheet exposes admin/settings/reports as secondary
 * destinations so they remain reachable on phones without crowding
 * the primary field workflow.
 */
export default function FieldModeLayout() {
  const { logout, profile, systemStatus, canAccessAdmin } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const renderStatusBanner = () => {
    if (systemStatus === "normal") return null;
    let message = "";
    let bg = "bg-red-600";
    switch (systemStatus) {
      case "offline":
        message = "Offline — cached data";
        bg = "bg-amber-600";
        break;
      case "permission-denied":
        message = "Database permission issue";
        bg = "bg-red-700";
        break;
      case "quota-exhausted":
        message = "Service throttled — cached data";
        bg = "bg-red-600";
        break;
      default:
        return null;
    }
    return (
      <div className={cn(bg, "text-white px-3 py-1 flex items-center justify-center gap-1.5 sticky top-0 z-[100] shadow-md h-6")}>
        <ShieldAlert className="w-3 h-3 animate-pulse" />
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-center">{message}</p>
      </div>
    );
  };

  const moreLinks: { name: string; href: string; icon: typeof SettingsIcon; adminOnly?: boolean }[] = [
    { name: "Book Job", href: "/book-appointment", icon: PlusCircle },
    { name: "Leads", href: "/leads", icon: UserPlus },
    { name: "Smart Quotes", href: "/quotes", icon: FileText },
    { name: "Marketing", href: "/marketing", icon: MessageSquare },
    { name: "Expenses", href: "/expenses", icon: Wallet },
    { name: "Reports", href: "/reports", icon: BarChart, adminOnly: true },
    { name: "Risk Management", href: "/protected-clients", icon: ShieldCheck, adminOnly: true },
    { name: "Settings", href: "/settings?tab=profile", icon: SettingsIcon },
    { name: "Help", href: "/help", icon: HelpCircle },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-primary selection:text-white">
      {renderStatusBanner()}

      {/* Slim top bar — compact phone sizing */}
      <header
        className={cn(
          "bg-sidebar/95 backdrop-blur-xl border-b border-white/5 flex items-center justify-between",
          "px-3 py-2 sticky z-30 h-12",
          systemStatus !== "normal" ? "top-[24px]" : "top-0",
        )}
      >
        <Link to="/" className="flex items-center gap-1.5 min-w-0" aria-label="Home">
          <Logo variant="icon" className="w-7 h-7 shrink-0" />
          <span className="text-[9px] font-black uppercase tracking-widest text-white/50 truncate">Field</span>
        </Link>

        <div className="flex items-center gap-1.5">
          <SyncIndicator />

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger render={
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:text-white hover:bg-white/5 rounded-lg h-8 w-8"
                aria-label="Open profile and more"
              >
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt="" referrerPolicy="no-referrer" className="w-6 h-6 rounded-md object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-md bg-[#0A4DFF]/20 ring-1 ring-[#0A4DFF]/40 flex items-center justify-center text-[9px] font-black text-[#0A4DFF] uppercase">
                    {profile?.displayName?.split(" ").map((n) => n[0]).join("").slice(0, 2) || profile?.email?.charAt(0).toUpperCase() || "?"}
                  </div>
                )}
              </Button>
            } />
            <SheetContent side="right" className="p-0 w-64 bg-sidebar border-l-white/5 text-white">
              <div className="p-4 border-b border-white/5">
                <p className="text-sm font-bold truncate">{profile?.displayName || profile?.email?.split("@")[0] || "User"}</p>
                <p className="text-[9px] uppercase tracking-widest text-white/50 font-black mt-0.5">
                  {profile?.role === "owner" ? "OWNER / ADMIN" : profile?.role || "Member"}
                </p>
              </div>
              <nav className="p-3 space-y-0.5">
                {moreLinks.map((link) => {
                  if (link.adminOnly && !canAccessAdmin) return null;
                  return (
                    <Link
                      key={link.href}
                      to={link.href}
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 min-h-[44px] text-sm font-bold text-white hover:bg-white/10 transition-colors"
                    >
                      <link.icon className="w-4 h-4 shrink-0" />
                      <span>{link.name}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-white/5 bg-black/40">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-white hover:text-white hover:bg-white/5 rounded-lg h-10"
                  onClick={logout}
                >
                  <LogOut className="w-4 h-4 mr-2.5" />
                  <span className="font-bold text-[11px] uppercase tracking-widest">Sign Out</span>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main scroll area. Bottom padding accounts for the fixed bottom nav
          PLUS iOS home-indicator safe area so content never hides behind it.
          Compact horizontal padding so 2-column grids actually breathe. */}
      <main
        className={cn(
          "flex-1 overflow-x-hidden",
          "px-2.5 py-2.5",
          "pb-[calc(60px+env(safe-area-inset-bottom))]",
        )}
      >
        <div className="w-full min-w-0 max-w-full">
          <Outlet />
        </div>
      </main>

      <FieldModeBottomNav onOpenMore={() => setMoreOpen(true)} />
    </div>
  );
}
