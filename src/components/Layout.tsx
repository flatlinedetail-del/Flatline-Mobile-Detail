import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, UserPlus, Building2, Calendar, ClipboardList, Settings, LogOut, Menu, X, MessageSquare, Bell, BarChart, Receipt, ShieldCheck, ChevronDown, ChevronRight, User, Globe, Palette, DatabaseZap, Ticket, Shield } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import AIAssistant from "./AIAssistant";
import GlobalSearch from "./GlobalSearch";
import Logo from "./Logo";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Appointments", href: "/appointments", icon: ClipboardList },
  { name: "Leads", href: "/leads", icon: UserPlus },
  { name: "Clients", href: "/clients", icon: Users },
  { name: "Marketing", href: "/marketing", icon: MessageSquare },
  { name: "Expenses", href: "/expenses", icon: Receipt },
  { name: "Forms & Waivers", href: "/forms", icon: ShieldCheck },
  { name: "Reports", href: "/reports", icon: BarChart },
  { 
    name: "Settings", 
    href: "/settings", 
    icon: Settings,
    children: [
      { name: "Personal Info", href: "/settings?tab=profile", icon: User },
      { name: "Business Profile", href: "/settings?tab=business", icon: Globe, adminOnly: true },
      { name: "Branding", href: "/settings?tab=branding", icon: Palette, adminOnly: true },
      { name: "Staff Management", href: "/settings?tab=staff", icon: Users, adminOnly: true },
      { name: "Client Settings", href: "/settings?tab=client-management", icon: DatabaseZap, adminOnly: true },
      { name: "Services & Add-ons", href: "/settings?tab=services", icon: ClipboardList, adminOnly: true },
      { name: "Coupons", href: "/settings?tab=coupons", icon: Ticket, adminOnly: true },
      { name: "Security", href: "/settings?tab=security", icon: Shield, adminOnly: true },
    ]
  },
];

export default function Layout() {
  const { logout, profile } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isAdminOrManager = profile?.role === "admin" || profile?.role === "manager";
  const [isSettingsOpen, setIsSettingsOpen] = useState(location.pathname.startsWith("/settings"));

  const filteredNavigation = navigation.filter(item => {
    if (item.href === "/forms" || item.href === "/reports") {
      return isAdminOrManager;
    }
    return true;
  });

  const renderNavItem = (item: any, isMobile = false) => {
    const isActive = location.pathname === item.href || (item.href === "/settings" && location.pathname.startsWith("/settings"));
    
    if (item.children) {
      return (
        <Collapsible
          key={item.name}
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          className="space-y-1"
        >
          <CollapsibleTrigger
            className={cn(
              "flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
              isActive
                ? "bg-accent text-primary"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            <div className="flex items-center gap-3">
              <item.icon className="w-5 h-5" />
              {item.name}
            </div>
            {isSettingsOpen ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-9 space-y-1">
            {item.children.map((child: any) => {
              if (child.adminOnly && !isAdminOrManager) return null;
              
              const isChildActive = location.pathname + location.search === child.href;
              
              return (
                <Link
                  key={child.name}
                  to={child.href}
                  onClick={() => isMobile && setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                    isChildActive
                      ? "text-primary font-bold"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  )}
                >
                  <child.icon className="w-3.5 h-3.5" />
                  {child.name}
                </Link>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      );
    }

    return (
      <Link
        key={item.name}
        to={item.href}
        onClick={() => isMobile && setIsMobileMenuOpen(false)}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          location.pathname === item.href
            ? "bg-accent text-primary"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        )}
      >
        <item.icon className="w-5 h-5" />
        {item.name}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-white border-r border-gray-200 fixed inset-y-0 left-0 z-20">
        <div className="p-6">
          <Logo variant="full" />
        </div>
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {filteredNavigation.map((item) => renderNavItem(item))}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-4 px-3">
            <div className="w-8 h-8 bg-gray-200 rounded-full overflow-hidden">
              {profile?.photoURL && <img src={profile.photoURL} alt="" referrerPolicy="no-referrer" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{profile?.displayName}</p>
              <p className="text-xs text-gray-500 truncate capitalize">{profile?.role}</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50" onClick={logout}>
            <LogOut className="w-5 h-5 mr-3" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-64">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-10 h-16">
          <div className="flex items-center gap-4 flex-1">
            <div className="md:hidden flex items-center gap-3">
              <Logo variant="icon" className="w-8 h-8" />
            </div>
            <div className="flex-1 max-w-md hidden sm:block">
              <GlobalSearch />
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <Button variant="ghost" size="icon" className="text-gray-500 hover:text-primary">
              <Bell className="w-5 h-5" />
            </Button>
            
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger render={
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="w-6 h-6" />
                </Button>
              } />
              <SheetContent side="left" className="p-0 w-64">
                <div className="p-6 border-b border-gray-100">
                  <Logo variant="full" />
                </div>
                <nav className="p-4 space-y-1 overflow-y-auto max-h-[calc(100vh-160px)]">
                  {filteredNavigation.map((item) => renderNavItem(item, true))}
                </nav>
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-white">
                  <Button variant="ghost" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50" onClick={logout}>
                    <LogOut className="w-5 h-5 mr-3" />
                    Sign Out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Mobile Search Bar (Only visible on very small screens) */}
        <div className="sm:hidden px-4 py-2 bg-white border-b border-gray-100">
          <GlobalSearch />
        </div>

        <main className="flex-1 p-4 md:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>

      <AIAssistant context={{ profile }} />
    </div>
  );
}
