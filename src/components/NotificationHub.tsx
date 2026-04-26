import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { AppNotification } from "../types";
import { format } from "date-fns";
import { Bell, Calendar, User, MessageCircle, Info, Check, Trash2, ExternalLink, AlertTriangle, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { markNotificationAsRead, markAllAsRead } from "../services/notificationService";
import { useNavigate } from "react-router-dom";

export function NotificationHub() {
  const { profile } = useAuth();
  const { notifications, loading, error } = useNotifications(true);
  const navigate = useNavigate();

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotificationClick = async (n: AppNotification) => {
    if (!n.read) {
      await markNotificationAsRead(n.id);
    }

    if (n.relatedId) {
      if (n.relatedType === "appointment") navigate("/calendar");
      if (n.relatedType === "client") navigate("/clients", { state: { clientId: n.relatedId } });
      if (n.relatedType === "lead") navigate("/leads");
      if (n.relatedType === "invoice") navigate("/invoices");
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "booking": return <Calendar className="w-4 h-4 text-primary" />;
      case "client": return <User className="w-4 h-4 text-blue-500" />;
      case "message": return <MessageCircle className="w-4 h-4 text-emerald-500" />;
      case "invoice": return <Receipt className="w-4 h-4 text-orange-500" />;
      case "alert": return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case "system": return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default: return <Info className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Intelligence Center
          </h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
            Tactical Updates Stream
          </p>
        </div>
        <div>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-[10px] font-black uppercase tracking-widest text-primary hover:text-white"
              onClick={() => markAllAsRead(profile!.id, notifications)}
            >
              Mark all read
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-8 text-center opacity-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-[10px] font-black uppercase tracking-widest">Scanning Network...</p>
          </div>
        ) : error ? (
           <div className="p-8 text-center px-8">
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 mx-auto mb-6">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-white font-black uppercase tracking-tight mb-2">Sync Interrupted</h3>
            <p className="text-[10px] text-red-500/60 font-black uppercase tracking-widest leading-relaxed">
              Database connection failed. <br />
              {error.includes("quota") ? "Quota Limits Exceeded" : error}
            </p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-8">
            <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center text-white/10 mb-6">
              <Bell className="w-8 h-8" />
            </div>
            <h3 className="text-white font-black uppercase tracking-tight mb-2">No new notifications</h3>
            <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.1em] leading-relaxed max-w-[240px]">
              No notification records are currently being created. <br /><br />
              Appointment requests are not yet writing to the notifications collection.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {notifications.map((n) => (
              <div 
                key={n.id}
                className={cn(
                  "p-5 transition-all cursor-pointer hover:bg-white/5 relative group",
                  !n.read && "bg-primary/5"
                )}
                onClick={() => handleNotificationClick(n)}
              >
                {!n.read && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                )}
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-black border border-white/10 flex items-center justify-center shrink-0">
                    {getIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className={cn(
                        "text-sm font-black uppercase tracking-tight",
                        n.read ? "text-white/60" : "text-white"
                      )}>
                        {n.title}
                      </p>
                      <p className="text-[9px] text-zinc-500 font-bold truncate ml-2">
                        {n.createdAt && format((n.createdAt as any).toDate(), "h:mm a")}
                      </p>
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>
                    {n.relatedId && (
                      <div className="mt-3 flex items-center gap-2 transition-opacity">
                         <Button variant="ghost" size="sm" className="h-6 px-2 text-[9px] font-black uppercase bg-primary/20 text-primary border border-primary/20 hover:bg-primary hover:text-white rounded-md">
                           View Target <ExternalLink className="w-2.5 h-2.5 ml-1" />
                         </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
      
      {/* Diagnostic HUD */}
      <div className="p-6 bg-black/40 border-t border-white/5 space-y-4">
        <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
          Notification Debug
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-[8px] font-black text-white/40 uppercase">Panel Open</p>
            <p className="text-[10px] font-mono text-white">true</p>
          </div>
          <div className="space-y-1">
            <p className="text-[8px] font-black text-white/40 uppercase">Loaded</p>
            <p className="text-[10px] font-mono text-white">{notifications.length}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[8px] font-black text-white/40 uppercase">Unread</p>
            <p className="text-[10px] font-mono text-white">{unreadCount}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[8px] font-black text-white/40 uppercase">Source</p>
            <p className="text-[10px] font-mono text-white">notifications</p>
          </div>
        </div>
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-[8px] font-black text-red-500 uppercase mb-1 leading-none">Last Error</p>
            <p className="text-[10px] font-mono text-red-400 break-all leading-tight">{error}</p>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-white/5 bg-black/20 text-center shrink-0">
        <p className="text-[8px] text-zinc-600 font-black uppercase tracking-[0.2em]">End of tactical stream</p>
      </div>
    </div>
  );
}
