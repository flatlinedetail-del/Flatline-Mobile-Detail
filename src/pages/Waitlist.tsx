import { useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Calendar as CalendarIcon, User, Truck, FileText, ArrowRight, Timer } from "lucide-react";
import { format, addMinutes } from "date-fns";
import { useNavigate } from "react-router-dom";
import { WaitlistDetailModal } from "../components/WaitlistDetailModal";
import { cn } from "@/lib/utils";

// Helper to estimate service duration in minutes
const getServiceDuration = (serviceNames: string[] = []) => {
  if (!serviceNames || serviceNames.length === 0) return 60;
  return serviceNames.reduce((acc, name) => {
    const lower = name.toLowerCase();
    if (lower.includes("ceramic")) return acc + 300;
    if (lower.includes("full") || lower.includes("platinum")) return acc + 180;
    if (lower.includes("interior")) return acc + 90;
    if (lower.includes("exterior")) return acc + 45;
    if (lower.includes("maintenance")) return acc + 60;
    return acc + 60;
  }, 0);
};

export default function Waitlist() {
  const [waitlistRecords, setWaitlistRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(
      collection(db, "appointments"),
      where("status", "in", ["waitlisted", "pending_waitlist", "offered"])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort by creation or requested date ideally
      records.sort((a: any, b: any) => {
        const dateA = a.scheduledAt?.toDate ? a.scheduledAt.toDate().getTime() : 
                     (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0);
        const dateB = b.scheduledAt?.toDate ? b.scheduledAt.toDate().getTime() : 
                     (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0);
        return dateA - dateB;
      });
      setWaitlistRecords(records);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const waitlistWithStats = useMemo(() => {
    let totalWaitAcc = 0;
    return waitlistRecords.map((record, index) => {
      const waitBefore = totalWaitAcc;
      const duration = getServiceDuration(record.serviceNames);
      totalWaitAcc += duration;

      // Define stages
      const stages = [
        { name: "Preparation", pct: 0.15 },
        { name: "Main Service", pct: 0.65 },
        { name: "Final Inspection", pct: 0.20 },
      ];

      const estStartTime = addMinutes(new Date(), waitBefore);
      let stageAcc = waitBefore;
      
      const stagesWithTimes = stages.map(stage => {
        const stageDuration = duration * stage.pct;
        const startTime = addMinutes(new Date(), stageAcc);
        stageAcc += stageDuration;
        const endTime = addMinutes(new Date(), stageAcc);
        return { ...stage, startTime, endTime };
      });

      return {
        ...record,
        jobsAhead: index,
        waitBefore,
        estStartTime,
        estEndTime: addMinutes(new Date(), stageAcc),
        stages: stagesWithTimes
      };
    });
  }, [waitlistRecords]);

  if (loading) {
    return <div className="p-8 flex justify-center items-center h-full text-white/50">Loading Waitlist...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-black p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tight">Waitlist Queue</h1>
          <p className="text-white/60 mt-2 font-medium">Real-time backup requests and estimated wait times</p>
        </div>
      </div>

      <div className="space-y-6">
        {waitlistWithStats.length === 0 ? (
          <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
            <Clock className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <h3 className="text-xl font-black text-white uppercase tracking-tight">No active waitlist</h3>
            <p className="text-white/50 text-sm mt-2">Waitlist is clear.</p>
          </div>
        ) : (
          waitlistWithStats.map((record, idx) => (
            <Card 
              key={record.id} 
              className={cn(
                "bg-white/5 border-white/10 overflow-hidden hover:bg-white/10 transition-all cursor-pointer group",
                idx === 0 && "ring-2 ring-primary bg-primary/5"
              )} 
              onClick={() => setSelectedRecord(record)}
            >
              <div className="p-6">
                <div className="flex flex-col lg:flex-row gap-8">
                  {/* Queue Position Indicator */}
                  <div className="flex flex-col items-center justify-center bg-black/40 rounded-2xl p-6 border border-white/5 min-w-[140px] shrink-0">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Queue Position</span>
                    <span className="text-4xl font-black text-primary leading-tight">#{idx + 1}</span>
                    <div className="mt-4 flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 text-[10px] font-bold text-white/60 uppercase">
                      <User className="w-3 h-3" />
                      {record.jobsAhead} Ahead
                    </div>
                  </div>

                  <div className="flex-1 space-y-4">
                    <div className="flex items-center justify-between">
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
                      <div className="text-right">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Est. Start Time</p>
                        <p className="text-sm font-bold text-primary">{format(record.estStartTime, "h:mm a")}</p>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1 flex items-center gap-2">
                         {record.customerName}
                      </h3>
                      <p className="text-white/60 font-medium">
                         {record.vehicleInfo} • {record.serviceNames?.join(", ")}
                      </p>
                    </div>

                    {/* Stage Estimates */}
                    <div className="pt-4 border-t border-white/5">
                      <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-4">Estimated Stage Completion</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {record.stages.map((stage: any, sIdx: number) => (
                          <div key={sIdx} className="relative bg-black/20 rounded-xl p-3 border border-white/5">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{stage.name}</span>
                              <Timer className="w-3 h-3 text-primary/40" />
                            </div>
                            <p className="text-xs font-bold text-white mb-0.5">{format(stage.endTime, "h:mm a")}</p>
                            <p className="text-[8px] font-medium text-white/30 italic">Target Completion</p>
                            {sIdx < record.stages.length - 1 && (
                              <ArrowRight className="hidden sm:block absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10 z-10" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between shrink-0 min-w-[200px]">
                    <div className="space-y-3 bg-black/40 p-4 rounded-xl border border-white/5">
                      <div className="flex justify-between items-center text-sm font-bold">
                        <span className="text-white/50 uppercase tracking-widest text-[10px]">Requested</span>
                        <span className="text-white">
                          {record.scheduledAt?.toDate ? format(record.scheduledAt.toDate(), "MMM d") : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm font-bold">
                        <span className="text-white/50 uppercase tracking-widest text-[10px]">Total Est. Wait</span>
                        <span className="text-orange-400">
                          {record.waitBefore} min
                        </span>
                      </div>
                    </div>

                    <Button 
                      className="w-full bg-primary hover:bg-neutral-900 text-white font-bold h-12 px-6 mt-4 opacity-0 group-hover:opacity-100 transition-all duration-300"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRecord(record);
                      }}
                    >
                      Process Lead
                    </Button>
                  </div>
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
