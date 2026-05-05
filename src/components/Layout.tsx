import { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, UserPlus, Building2, Calendar, ClipboardList, Settings, LogOut, Menu, X, MessageSquare, MessagesSquare, Bell, BarChart, Receipt, ShieldCheck, ChevronLeft, ChevronRight, User, Globe, Palette, DatabaseZap, Ticket, Shield, FileText, Wallet, HelpCircle, Zap, Plug, PanelLeftClose, PanelLeftOpen, ShieldAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import AIAssistant from "./AIAssistant";
import GlobalSearch from "./GlobalSearch";
import Logo from "./Logo";
import { SyncIndicator } from "./SyncIndicator";

const navigationGroups = [
  {
    title: "OPERATIONS",
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Calendar", href: "/calendar", icon: Calendar },
      { name: "Waitlist", href: "/waitlist", icon: ClipboardList },
      { name: "Clients", href: "/clients", icon: Users },
      { name: "Risk Management", href: "/protected-clients", icon: ShieldAlert, adminOnly: true },
      { name: "Communications", href: "/communications", icon: MessagesSquare },
      { name: "Forms & Waivers", href: "/forms", icon: ShieldCheck },
    ]
  },
  {
    title: "SALES & GROWTH",
    items: [
      { name: "Leads", href: "/leads", icon: UserPlus },
      { name: "Marketing", href: "/marketing", icon: MessageSquare },
      { name: "Smart Quote", href: "/quotes", icon: FileText },
    ]
  },
  {
    title: "FINANCE",
    items: [
      { name: "Invoices", href: "/invoices", icon: Receipt },
      { name: "Expenses", href: "/expenses", icon: Wallet },
    ]
  },
  {
    title: "REPORTING",
    items: [
      { name: "Reports", href: "/reports", icon: BarChart, adminOnly: true },
    ]
  },
  {
    title: "SYSTEM",
    items: [
      { name: "Personal Profile", href: "/settings?tab=profile", icon: User },
      { name: "Business Profile", href: "/settings?tab=business", icon: Globe, adminOnly: true },
      { name: "Branding", href: "/settings?tab=branding", icon: Palette, adminOnly: true },
      { name: "Staff Management", href: "/settings?tab=staff", icon: Users, adminOnly: true },
      { name: "Client Settings", href: "/settings?tab=client-types", icon: DatabaseZap, adminOnly: true },
      { name: "Services & Add-Ons", href: "/settings?tab=services", icon: ClipboardList, adminOnly: true },
      { name: "Coupons", href: "/settings?tab=coupons", icon: Ticket, adminOnly: true },
      { name: "Automations", href: "/settings?tab=automation", icon: Zap, adminOnly: true },
      { name: "Integrations", href: "/settings?tab=integrations", icon: Plug, adminOnly: true },
      { name: "Security", href: "/settings?tab=security", icon: Shield, adminOnly: true },
      { name: "Help", href: "/help", icon: HelpCircle },
    ]
  }
];

import { useOperationsFeed } from "../hooks/useOperationsFeed";
import { useWaitlistCount } from "../hooks/useWaitlistCount";
import { OperationsFeed } from "./OperationsFeed";

function NotificationBell() {
  const { unreadCount } = useOperationsFeed();
  
  return (
    <SheetTrigger render={
      <Button variant="ghost" size="icon" className="text-white hover:text-white hover:bg-white/5 rounded-xl transition-all duration-300 relative">
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-2 h-2 bg-[#0A4DFF] rounded-full ring-2 ring-sidebar animate-pulse"></span>
        )}
      </Button>
    } />
  );
}

export default function Layout() {
  const { logout, profile, systemStatus, canAccessAdmin, canAccessManager } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const activeWaitlistCount = useWaitlistCount();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebarCollapsed', String(next));
      return next;
    });
  };

  const renderNavItem = (item: any, isMobile = false) => {
    if (item.adminOnly && !canAccessAdmin) return null;

    const isActive = location.pathname === item.href.split('?')[0] && 
                     (item.href.includes('?') ? location.search === `?${item.href.split('?')[1]}` : true);

    const isWaitlistGlow = item.name === "Waitlist" && activeWaitlistCount > 0;

    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={() => isMobile && setIsMobileMenuOpen(false)}
        className={cn(
          "flex items-center rounded-xl text-sm font-medium transition-all duration-300 group relative text-white",
          isActive
            ? "bg-[#0A4DFF] shadow-glow-blue"
            : isWaitlistGlow
              ? "bg-amber-500/40 hover:bg-amber-500/60"
              : "hover:bg-white/10",
          isSidebarCollapsed && !isMobile ? "justify-center w-12 h-12 mx-auto" : "gap-3 px-3 py-2.5 w-full",
          isWaitlistGlow && !isActive && "animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.3)] border border-amber-500/20"
        )}
        title={isSidebarCollapsed && !isMobile ? item.name : undefined}
      >
        <item.icon className="w-5 h-5 transition-transform group-hover:scale-110 shrink-0 text-white" />
        {(!isSidebarCollapsed || isMobile) && (
          <span className="tracking-tight font-bold truncate flex-1 text-white">
            {item.name}
          </span>
        )}
        {(!isSidebarCollapsed || isMobile) && item.name === "Waitlist" && activeWaitlistCount > 0 && (
          <Badge className="bg-amber-500 text-white border-none py-0 px-1.5 h-5 text-[10px] font-black shrink-0">
            {activeWaitlistCount}
          </Badge>
        )}
      </Link>
    );
  };

  const getSystemStatusBanner = () => {
    if (systemStatus === 'normal') return null;

    let message = "";
    let bgColor = "bg-red-600";
    let icon = <ShieldAlert className="w-4 h-4 animate-pulse" />;

    switch (systemStatus) {
      case 'offline':
        message = "Offline mode — showing cached data";
        bgColor = "bg-amber-600";
        break;
      case 'permission-denied':
        message = "Database permission issue";
        bgColor = "bg-red-700";
        break;
      case 'quota-exhausted':
        message = "Firestore quota exhausted • Database operations restricted • Using cached data";
        bgColor = "bg-red-600";
        break;
      default:
        return null;
    }

    return (
      <div className={cn(bgColor, "text-white px-6 py-2 flex items-center justify-center gap-3 animate-in fade-in slide-in-from-top duration-500 sticky top-0 z-[100] shadow-lg")}>
        {icon}
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-center">
          {message}
        </p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-primary selection:text-white">
      {/* System Status Banner */}
      {getSystemStatusBanner()}
      
      <div className="flex-1 flex min-w-0 h-full">
        {/* Sidebar for Desktop */}
        <aside className={cn(
          "hidden md:flex flex-col bg-sidebar border-r border-sidebar-border sticky top-0 h-screen shrink-0 z-20 transition-[width] duration-300 ease-in-out",
          isSidebarCollapsed ? "w-20" : "w-64"
        )}>
          <div className={cn("py-6 flex transition-all duration-300", isSidebarCollapsed ? "justify-center w-full" : "px-8 w-full justify-start")}>
            <Link to="/" className="flex items-center justify-center">
              <Logo variant="icon" className={isSidebarCollapsed ? "w-12 h-12" : "w-14 h-14"} />
            </Link>
          </div>
          <nav className={cn("flex-1 space-y-6 overflow-y-auto custom-scrollbar pb-6 transition-all duration-300", isSidebarCollapsed ? "px-2" : "px-4")}>
            {navigationGroups.map((group) => {
              const hasVisibleItems = group.items.some(item => 
                (!item.adminOnly || canAccessAdmin)
              );
              if (!hasVisibleItems) return null;
              return (
                <div key={group.title} className={cn("space-y-2", isSidebarCollapsed && "flex flex-col items-center")}>
                  {!isSidebarCollapsed && (
                    <h3 className="px-3 text-[10px] font-black text-white uppercase tracking-widest">
                      {group.title}
                    </h3>
                  )}
                  <div className={cn("space-y-2", isSidebarCollapsed && "w-full space-y-2")}>
                    {group.items.map((item) => renderNavItem(item))}
                  </div>
                </div>
              );
            })}
          </nav>
          <div className="p-4 border-t border-sidebar-border bg-black/20">
            <Link 
              to="/settings?tab=profile" 
              className={cn(
                "flex items-center gap-4 mb-6 px-2 py-2 rounded-2xl hover:bg-white/5 transition-all duration-300 group/profile overflow-hidden",
                isSidebarCollapsed && "justify-center px-0"
              )}
            >
              <div className="relative shrink-0">
                <div className="w-10 h-10 bg-[#0A4DFF]/20 rounded-xl overflow-hidden ring-2 ring-[#0A4DFF]/20 group-hover/profile:ring-[#0A4DFF]/50 transition-all duration-300 flex items-center justify-center">
                  {profile?.photoURL ? (
                    <img src={profile.photoURL} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#0A4DFF] font-black text-sm uppercase">
                      {profile?.displayName?.split(' ').map(n => n[0]).join('').slice(0, 2) || profile?.email?.charAt(0).toUpperCase() || "?"}
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-sidebar rounded-full shadow-sm ring-1 ring-black/20"></div>
              </div>
              
              {!isSidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate tracking-tight transition-colors">
                    {profile?.displayName || profile?.email?.split('@')[0] || "User"}
                  </p>
                  <p className="text-[10px] text-white truncate uppercase tracking-widest font-black flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-primary animate-pulse"></span>
                    {profile?.role === "owner" ? "OWNER / ADMIN" : (profile?.role || "Member")}
                  </p>
                </div>
              )}
            </Link>
            
            <Button 
              variant="ghost" 
              className={cn(
                "text-white hover:text-white hover:bg-white/10 rounded-xl transition-all duration-300 group",
                isSidebarCollapsed ? "w-12 h-12 mx-auto justify-center px-0 flex" : "w-full justify-start"
              )} 
              onClick={logout}
              title={isSidebarCollapsed ? "Sign Out" : undefined}
            >
              <LogOut className={cn("w-5 h-5 transition-transform shrink-0 text-white", !isSidebarCollapsed && "mr-3", isSidebarCollapsed && "group-hover:scale-110")} />
              {!isSidebarCollapsed && (
                <span className="font-bold text-xs uppercase tracking-widest text-white">
                  Sign Out
                </span>
              )}
            </Button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden transition-all duration-300 ease-in-out">
          {/* Top Header */}
          <header className={cn(
            "bg-sidebar/95 backdrop-blur-xl border-b border-white/5 px-6 md:px-10 py-4 flex items-center justify-between sticky z-10 h-20",
            systemStatus !== 'normal' ? "top-[36px]" : "top-0"
          )}>
          <div className="flex items-center gap-6 flex-1">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleSidebar}
              className="hidden md:flex text-white hover:text-white hover:bg-white/5 rounded-xl transition-all duration-300"
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </Button>
            <div className="md:hidden flex items-center gap-3">
              <Link to="/">
                <Logo variant="icon" className="w-10 h-10" />
              </Link>
            </div>
            <div className="flex-1 max-w-xl hidden lg:block">
              <GlobalSearch />
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            <SyncIndicator />
            <div className="flex items-center gap-2">
              <Sheet open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
                <NotificationBell />
                <SheetContent side="right" className="p-0 border-none w-full sm:max-w-[450px] bg-sidebar">
                  <OperationsFeed notifications={useOperationsFeed().notifications} onClose={() => setIsNotificationsOpen(false)} />
                </SheetContent>
              </Sheet>

              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsAIAssistantOpen(true)}
                className="text-white hover:text-white hover:bg-white/5 rounded-xl transition-all duration-300"
              >
                <MessageSquare className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="h-8 w-[1px] bg-white/10 hidden sm:block"></div>
            
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger render={
                <Button variant="ghost" size="icon" className="md:hidden text-white hover:bg-white/5 rounded-xl">
                  <Menu className="w-6 h-6" />
                </Button>
              } />
              <SheetContent side="left" className="p-0 w-72 bg-sidebar border-r-white/5 text-white">
                <div className="p-8 border-b border-white/5">
                  <Link to="/" onClick={() => setIsMobileMenuOpen(false)}>
                    <Logo variant="icon" className="w-14 h-14" />
                  </Link>
                </div>
                <nav className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-180px)] custom-scrollbar">
                  {navigationGroups.map((group) => {
                    const hasVisibleItems = group.items.some(item => 
                      (!item.adminOnly || canAccessAdmin)
                    );
                    if (!hasVisibleItems) return null;
                    return (
                      <div key={group.title} className="space-y-2">
                        <h3 className="px-3 text-[10px] font-black text-white uppercase tracking-widest">{group.title}</h3>
                        <div className="space-y-1">
                          {group.items.map((item) => renderNavItem(item, true))}
                        </div>
                      </div>
                    );
                  })}
                </nav>
                <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-white/5 bg-black/40">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start text-white hover:text-white hover:bg-white/5 rounded-xl transition-all duration-300" 
                    onClick={logout}
                  >
                    <LogOut className="w-5 h-5 mr-3" />
                    <span className="font-bold text-xs uppercase tracking-widest">Sign Out</span>
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Mobile Search Bar (Only visible on medium and smaller screens) */}
        <div className="lg:hidden px-6 py-3 bg-sidebar/50 border-b border-white/5">
          <GlobalSearch />
        </div>

        <main className="flex-1 p-4 sm:p-6 md:p-10 overflow-auto bg-background selection:bg-primary/30">
          <div className="max-w-[1440px] mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>

    <AIAssistant 
      context={{ profile }} 
      isOpen={isAIAssistantOpen} 
      onOpenChange={setIsAIAssistantOpen} 
    />
  </div>
);
}
