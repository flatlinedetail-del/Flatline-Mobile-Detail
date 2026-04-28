import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { getAppointments } from "../services/appointmentService";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Calendar as CalendarIcon, User, Truck, FileText } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { WaitlistDetailModal } from "../components/WaitlistDetailModal";
import { cn } from "@/lib/utils";

export default function Waitlist() {
  const { profile } = useAuth();
  const [waitlistRecords, setWaitlistRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!profile?.businessId) return;

    const fetchWaitlist = async () => {
        setLoading(true);
        try {
            const allAppointments = await getAppointments(profile.businessId);
            const filtered = allAppointments.filter(app => 
                ["waitlisted", "pending_waitlist", "offered"].includes(app.status || "")
            );
            filtered.sort((a, b) => {
                const dateA = a.scheduledAt?.toDate ? a.scheduledAt.toDate().getTime() : 0;
                const dateB = b.scheduledAt?.toDate ? b.scheduledAt.toDate().getTime() : 0;
                return dateA - dateB;
            });
            setWaitlistRecords(filtered);
        } catch (error) {
            console.error("Error fetching waitlist:", error);
        } finally {
            setLoading(false);
        }
    };
    
    fetchWaitlist();
  }, [profile?.businessId]);

  if (loading) {
    return <div className="p-8 flex justify-center items-center h-full text-white/50">Loading Waitlist...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-black p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tight">Waitlist</h1>
          <p className="text-white/60 mt-2 font-medium">Manage backup times and unscheduled requests</p>
        </div>
      </div>

      <div className="space-y-4">
        {waitlistRecords.length === 0 ? (
          <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
            <Clock className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <h3 className="text-xl font-black text-white uppercase tracking-tight">No active waitlist</h3>
            <p className="text-white/50 text-sm mt-2">Waitlist is clear.</p>
          </div>
        ) : (
          waitlistRecords.map(record => (
            <Card key={record.id} className="bg-white/5 border-white/10 overflow-hidden hover:bg-white/10 transition-colors cursor-pointer" onClick={() => setSelectedRecord(record)}>
              <div className="p-6 flex flex-col md:flex-row gap-6 md:items-center justify-between">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-4">
                    <div className="px-3 py-1 rounded bg-orange-500/20 text-orange-400 font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                       <Clock className="w-3 h-3" />
                       {record.status.replace("_", " ")}
                    </div>
                    <span className="text-white/40 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                      <FileText className="w-3 h-3" />
                      ID: {record.id.slice(0, 6)}
                    </span>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-black text-white/50 uppercase tracking-widest mb-1 flex items-center gap-2">
                      <User className="w-4 h-4 text-primary" /> {record.customerName}
                    </h3>
                    <p className="text-white font-medium pl-6">
                       {record.vehicleInfo} • {record.serviceNames?.join(", ")}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 bg-black/40 p-4 rounded-xl border border-white/5 shrink-0 min-w-[280px]">
                  <div className="flex justify-between items-center text-sm font-bold">
                    <span className="text-white/50 uppercase tracking-widest text-[10px]">Requested</span>
                    <span className="text-white">
                      {record.scheduledAt?.toDate ? format(record.scheduledAt.toDate(), "MMM d, h:mm a") : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-bold">
                    <span className="text-white/50 uppercase tracking-widest text-[10px]">Backup Time</span>
                    <span className={cn(
                      "text-orange-400",
                      !record.waitlistInfo?.backupScheduledAt && "text-white/30 italic font-medium"
                    )}>
                      {record.waitlistInfo?.backupScheduledAt?.toDate
                        ? format(record.waitlistInfo.backupScheduledAt.toDate(), "MMM d, h:mm a")
                        : (record.waitlistInfo?.flexibleSameDay ? 'Flexible Same Day' : 'None')}
                    </span>
                  </div>
                </div>

                <div className="shrink-0">
                  <Button 
                    className="bg-primary hover:bg-neutral-900 text-white font-bold h-12 px-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedRecord(record);
                    }}
                  >
                    View Details
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {selectedRecord && (
        <WaitlistDetailModal 
          appointment={selectedRecord} 
          isOpen={!!selectedRecord} 
          onClose={() => setSelectedRecord(null)} 
          onActionComplete={() => setSelectedRecord(null)}
        />
      )}
    </div>
  );
}
