import { Link, useLocation } from "react-router-dom";
import { Home, Calendar, Users, Receipt, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bottom navigation for the phone Field Mode shell.
 *
 * Five touch-friendly destinations covering the field workflow.
 * Admin / settings / marketing / reports are intentionally NOT
 * surfaced here — those stay reachable via the "More" sheet so we
 * keep field mode focused on operational work, per the Track A spec.
 *
 * The "More" sheet itself is owned by FieldModeLayout (this component
 * just emits the click). All other entries are normal Router links.
 */
export interface FieldModeBottomNavProps {
  onOpenMore: () => void;
}

const tabs = [
  { name: "Today", href: "/", icon: Home, exact: true },
  { name: "Schedule", href: "/calendar", icon: Calendar },
  { name: "Clients", href: "/clients", icon: Users },
  { name: "Invoices", href: "/invoices", icon: Receipt },
];

export function FieldModeBottomNav({ onOpenMore }: FieldModeBottomNavProps) {
  const location = useLocation();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return location.pathname === href;
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  return (
    <nav
      role="navigation"
      aria-label="Field Mode primary"
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40",
        "bg-sidebar/95 backdrop-blur-xl border-t border-white/5",
        // Respect iOS home-indicator safe-area.
        "pb-[max(env(safe-area-inset-bottom),0.125rem)]",
      )}
    >
      <ul className="grid grid-cols-5">
        {tabs.map((tab) => {
          const active = isActive(tab.href, tab.exact);
          return (
            <li key={tab.href}>
              <Link
                to={tab.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[48px]",
                  "text-[9px] font-black uppercase tracking-widest transition-colors",
                  active ? "text-white" : "text-white/50 hover:text-white/80",
                )}
                aria-current={active ? "page" : undefined}
              >
                <tab.icon className={cn("w-[18px] h-[18px]", active && "drop-shadow-[0_0_6px_rgba(10,77,255,0.7)]")} />
                <span className="leading-none">{tab.name}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onOpenMore}
            className={cn(
              "w-full flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[48px]",
              "text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white/80 transition-colors",
            )}
            aria-label="More options"
          >
            <Menu className="w-[18px] h-[18px]" />
            <span className="leading-none">More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

export default FieldModeBottomNav;
