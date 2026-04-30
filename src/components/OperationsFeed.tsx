import { useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { markNotificationAsRead, markAllAsRead } from "../services/notificationService";
import { AppNotification } from "../types";
import { useAuth } from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Check, Calendar, AlertTriangle, User, ExternalLink, Activity, Bell } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { WaitlistDetailModal } from "./WaitlistDetailModal";
import { AppointmentPreviewModal } from "./AppointmentPreviewModal";
import { cn } from "@/lib/utils";

interface OperationsFeedProps {
  notifications: AppNotification[];
  onClose?: () => void;
}

const CATEGORIES = [
  "Booking Requests",
  "Schedule Changes",
  "Today's Operations",
  "Payments",
  "System Alerts"
];

export function OperationsFeed({ notifications, onClose }: OperationsFeedProps) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    "Booking Requests": true,
    "Schedule Changes": true,
    "Today's Operations": true,
    "Payments": true,
    "System Alerts": true
  });
  const [selectedWaitlist, setSelectedWaitlist] = useState<any>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const handleAction = async (n: AppNotification) => {
    if (!n.read) await markNotificationAsRead(n.id);
    
    // Appointment/Waitlist Modal Logic
    if (["cancellation", "reschedule", "slot_opened", "upcoming_appointment", "new_booking_request", "waitlist_request", "en_route", "arrived"].includes(n.type)) {
      const targetId = n.waitlistId || n.appointmentId || n.relatedId;
      if (targetId) {
        try {
          const docSnap = await getDoc(doc(db, "appointments", targetId));
          if (docSnap.exists()) {
             const data: any = { id: docSnap.id, ...docSnap.data() };
             if (n.type === "waitlist_request" || data.status === "waitlisted" || data.status === "pending_waitlist") {
               setSelectedWaitlist(data);
             } else {
               setSelectedAppointment(data);
             }
             return; // Do not close drawer yet, show modal
          }
        } catch (e) {
             console.error("Failed to load request details", e);
        }
      }
    } 
    
    if (["payment_received", "invoice_overdue"].includes(n.type)) {
       navigate("/invoices");
    } else {
       // fallback
       navigate("/calendar");
    }
    
    if (onClose) onClose();
  };

  const getPriorityColor = (priority?: string) => {
    if (priority === "high") return "bg-red-500";
    if (priority === "medium") return "bg-orange-500";
    return "bg-blue-500";
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-sidebar border-l border-white/5 overflow-hidden">
      <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Operations Feed
          </h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
            Mission Control Log
          </p>
        </div>
        <div>
          {notifications.some(n => !n.read) && profile && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-[10px] font-black uppercase tracking-widest text-primary hover:text-white"
              onClick={() => markAllAsRead(profile.id, notifications)}
            >
              Mark all read
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-8">
              <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center text-white/10 mb-6">
                <Bell className="w-8 h-8" />
              </div>
              <h3 className="text-white font-black uppercase tracking-tight mb-2">No new updates</h3>
              <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.1em] leading-relaxed max-w-[240px]">
                Operations feed is clear
              </p>
            </div>
          ) : (
            CATEGORIES.map(category => {
              const catNotifs = notifications.filter(n => n.category === category);
              const isExpanded = expandedCategories[category];
              const unreadCatCount = catNotifs.filter(n => !n.read).length;

              if (catNotifs.length === 0) return null;

              return (
                <div key={category} className="space-y-3">
                  <div 
                    className="flex items-center justify-between px-2 cursor-pointer group"
                    onClick={() => toggleCategory(category)}
                  >
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-white/70 flex items-center gap-2 group-hover:text-white transition-colors">
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {category} 
                      {unreadCatCount > 0 && (
                        <Badge variant="outline" className="ml-2 text-[9px] bg-primary/20 text-primary border-none px-1.5 py-0">
                          {unreadCatCount} New
                        </Badge>
                      )}
                    </h3>
                  </div>

                  {isExpanded && (
                    <div className="space-y-2">
                      {catNotifs.map(n => (
                        <div 
                          key={n.id}
                          className={cn(
                            "flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer",
                            n.read 
                              ? "bg-black/20 border-white/5 opacity-60 hover:opacity-100" 
                              : "bg-white/5 border-white/10 hover:bg-white/10"
                          )}
                          onClick={() => handleAction(n)}
                        >
                          <div className={cn("w-2 h-2 mt-1.5 rounded-full shrink-0", getPriorityColor(n.priority))} />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <p className={cn(
                                "text-sm font-black uppercase tracking-tight",
                                n.read ? "text-white/60" : "text-white"
                              )}>
                                {n.title}
                              </p>
                              <span className="text-[9px] text-zinc-500 font-bold whitespace-nowrap ml-3">
                                {(n.createdAt as any)?.toDate ? format((n.createdAt as any).toDate(), "MMM d, h:mm a") : "Just now"}
                              </span>
                            </div>
                            <p className="text-xs text-white/50 leading-relaxed font-medium mb-3">
                              {n.message}
                            </p>
                            
                            <div className="flex flex-wrap items-center gap-2">
                              {n.type === "new_booking_request" && (
                                <div className="flex gap-2">
                                  <Badge variant="outline" className="text-[9px] bg-white text-black font-bold uppercase tracking-wider">
                                    View Booking
                                  </Badge>
                                </div>
                              )}
                              {n.type === "waitlist_request" && (
                                <div className="flex gap-2 flex-wrap mt-1">
                                  <Badge variant="outline" className="text-[9px] bg-orange-500/20 text-orange-400 border-none font-bold uppercase tracking-wider cursor-pointer">
                                    View Waitlist Request
                                  </Badge>
                                </div>
                              )}
                              {n.type === "slot_opened" && (
                                <div className="flex gap-2 flex-wrap mt-1">
                                  <Badge variant="outline" className="text-[9px] bg-primary/20 text-primary border-none font-bold uppercase tracking-wider cursor-pointer">
                                    Offer Open Slot
                                  </Badge>
                                  <Badge variant="outline" className="text-[9px] bg-white/10 text-white border-none font-bold uppercase tracking-wider cursor-pointer">
                                    View Waitlist Match
                                  </Badge>
                                </div>
                              )}
                              {(n.type === "cancellation" || n.type === "reschedule") && (
                                <Badge variant="outline" className="text-[9px] bg-white/10 text-white border-none font-bold uppercase tracking-wider">
                                  View Calendar
                                </Badge>
                              )}
                              {n.type === "upcoming_appointment" && (
                                <Badge variant="outline" className="text-[9px] bg-emerald-500/20 text-emerald-400 border-none font-bold uppercase tracking-wider">
                                  View Appointment
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <WaitlistDetailModal 
        appointment={selectedWaitlist} 
        isOpen={!!selectedWaitlist} 
        onClose={() => setSelectedWaitlist(null)} 
        onActionComplete={() => { setSelectedWaitlist(null); if (onClose) onClose(); }}
      />
      <AppointmentPreviewModal
        appointment={selectedAppointment}
        isOpen={!!selectedAppointment}
        onClose={() => setSelectedAppointment(null)}
      />
    </div>
  );
}
