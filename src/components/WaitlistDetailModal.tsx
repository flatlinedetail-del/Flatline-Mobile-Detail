import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Calendar, User, Clock, MapPin, Truck, HelpCircle, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { getDoc, doc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { checkAvailability, generateSmartRecommendations, SmartRecommendation } from "../services/smartBookingService";
import { cn } from "@/lib/utils";
import { updateAppointment, softDeleteAppointment, getRecentAppointments } from "../services/appointmentService";
import { useAuth } from "../hooks/useAuth";

export function WaitlistDetailModal({ appointment, isOpen, onClose, onActionComplete }: { appointment: any, isOpen: boolean, onClose: () => void, onActionComplete?: () => void }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [requestedStatus, setRequestedStatus] = useState<{isAvailable: boolean, reason: string} | null>(null);
  const [backupStatus, setBackupStatus] = useState<{isAvailable: boolean, reason: string} | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [recommendations, setRecommendations] = useState<SmartRecommendation[]>([]);
  const [selectedRec, setSelectedRec] = useState<SmartRecommendation | null>(null);

  useEffect(() => {
    if (!isOpen || !appointment) return;

    const checkTimes = async () => {
      setEvaluating(true);
      try {
        const settingsSnap = await getDoc(doc(db, "settings", profile!.businessId)); // Should also use a service
        const businessSettings = settingsSnap.exists() ? settingsSnap.data() : null;

        const reqDate = appointment.scheduledAt?.toDate ? appointment.scheduledAt.toDate() : new Date(appointment.scheduledAt);
        const duration = appointment.estimatedDuration || 120;

        const reqCheck = await checkAvailability({
          targetDate: reqDate,
          durationMinutes: duration,
          ignoreAppointmentId: appointment.id,
          businessHours: businessSettings?.businessHours
        });
        setRequestedStatus(reqCheck);

        const backupDate = appointment.waitlistInfo?.backupScheduledAt?.toDate 
          ? appointment.waitlistInfo.backupScheduledAt.toDate() 
          : null;

        let bakCheck = null;
        if (backupDate) {
          bakCheck = await checkAvailability({
            targetDate: backupDate,
            durationMinutes: duration,
            ignoreAppointmentId: appointment.id,
            businessHours: businessSettings?.businessHours
          });
          setBackupStatus(bakCheck);
        } else {
          setBackupStatus(null);
        }

        // Generate recommendations if both requested and backup are unavailable
        if (!reqCheck.isAvailable && (!bakCheck || !bakCheck.isAvailable)) {
           const recs = await generateSmartRecommendations({
             baseDate: backupDate || reqDate,
             addressLat: appointment.latitude || 0,
             addressLng: appointment.longitude || 0,
             durationMinutes: duration,
             rainThreshold: 60,
             businessHours: businessSettings?.businessHours
           });
           setRecommendations(recs);
        } else {
           setRecommendations([]);
        }
      } catch (error) {
        console.error("Availability check failed", error);
      } finally {
        setEvaluating(false);
      }
    };

    checkTimes();
  }, [isOpen, appointment, profile]);

  if (!appointment) return null;

  const generateJobNum = async () => {
    const recentApps = await getRecentAppointments(profile!.businessId, 100);
    const existingJobNums = recentApps
      .map(appt => appt.jobNum as string)
      .filter(Boolean);
    
    let maxNum = 1000;
    existingJobNums.forEach(jn => {
      const match = jn.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });
    return `JOB${maxNum + 1}`;
  };

  const handleApproveBackup = async () => {
    try {
      const backupTime = appointment.waitlistInfo?.backupScheduledAt;
      if (!backupTime) return toast.error("No backup time selected");
      
      const newJobNum = appointment.jobNum || await generateJobNum();

      await updateAppointment(appointment.id, {
        scheduledAt: backupTime,
        status: "scheduled",
        jobNum: newJobNum,
        waitlistInfo: { ...appointment.waitlistInfo, status: "accepted_backup" }
      }, profile!.businessId);
      toast.success("Backup time approved and scheduled!");
      onClose();
      if (onActionComplete) onActionComplete();
    } catch (e) {
      console.error(e);
      toast.error("Failed to approve backup time");
    }
  };

  const handleApproveRequested = async () => {
    try {
      const newJobNum = appointment.jobNum || await generateJobNum();
      await updateAppointment(appointment.id, {
        status: "scheduled",
        jobNum: newJobNum,
        waitlistInfo: { ...appointment.waitlistInfo, status: "accepted_requested" }
      }, profile!.businessId);
      toast.success("Requested time approved and scheduled!");
      onClose();
      if (onActionComplete) onActionComplete();
    } catch (e) {
      console.error(e);
      toast.error("Failed to approve requested time");
    }
  };

  const handleScheduleSelectedRec = async () => {
    if (!selectedRec) return;
    try {
      const newJobNum = appointment.jobNum || await generateJobNum();
      await updateAppointment(appointment.id, {
        scheduledAt: Timestamp.fromDate(selectedRec.startTime instanceof Date ? selectedRec.startTime : new Date(selectedRec.startTime)),
        status: "scheduled",
        jobNum: newJobNum,
        waitlistInfo: { ...appointment.waitlistInfo, status: "accepted_suggestion" }
      }, profile!.businessId);
      toast.success("Suggested time scheduled!");
      onClose();
      if (onActionComplete) onActionComplete();
    } catch (e) {
      console.error(e);
      toast.error("Failed to schedule suggestion");
    }
  };

  const handleDecline = async () => {
    try {
      await updateAppointment(appointment.id, {
        status: "canceled",
        waitlistInfo: { ...appointment.waitlistInfo, status: "declined" }
      }, profile!.businessId);
      toast.success("Waitlist request declined");
      onClose();
      if (onActionComplete) onActionComplete();
    } catch (e) {
      console.error(e);
      toast.error("Failed to decline request");
    }
  };

  const handleOfferSlot = () => {
     onClose();
     navigate("/calendar", {
       state: {
         editingWaitlistId: appointment.id,
         selectedDate: appointment.scheduledAt?.toDate ? appointment.scheduledAt.toDate() : new Date()
       }
     });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-2xl bg-sidebar border-white/10 text-white p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 border-b border-white/5 bg-black/40 shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2 text-orange-400">
                <Clock className="w-5 h-5" />
                Waitlist Request Details
              </DialogTitle>
              <p className="text-[10px] uppercase font-bold text-white/40 tracking-widest mt-1">ID: {appointment.id}</p>
            </div>
            <div className="bg-white/10 px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest">
              {appointment.status.replace("_", " ")}
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Client Name</h4>
                <p className="text-sm font-bold flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" /> {appointment.customerName}
                </p>
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Contact</h4>
                <p className="text-sm font-bold text-white/80">{appointment.customerPhone}</p>
                {appointment.customerEmail && <p className="text-sm font-bold text-white/80">{appointment.customerEmail}</p>}
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Location</h4>
                <p className="text-sm font-bold flex items-center gap-2 text-white/80 break-words">
                  <MapPin className="w-4 h-4 text-orange-500 shrink-0" /> <span className="line-clamp-2">{appointment.address}</span>
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1 mb-1">Vehicle</h4>
                <p className="text-sm font-bold flex items-center gap-2 text-white/80">
                  <Truck className="w-4 h-4 text-blue-400" /> {appointment.vehicleInfo}
                </p>
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1 mb-1">Services</h4>
                <div className="flex flex-wrap gap-2">
                  {appointment.serviceNames?.map((s: string) => (
                    <span key={s} className="bg-white/10 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest">{s}</span>
                  ))}
                  {appointment.addOnNames?.map((a: string) => (
                    <span key={a} className="bg-primary/20 text-primary px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest">+{a}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-4">
                <div>
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1 mb-1">Est. Duration</h4>
                  <p className="text-sm font-bold text-white/80">{appointment.estimatedDuration || 0} mins</p>
                </div>
                <div>
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1 mb-1">Total</h4>
                  <p className="text-sm font-bold text-green-400">${appointment.totalAmount || 0}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-black/40 rounded-xl p-4 border border-white/5 space-y-4">
             <div className="flex justify-between items-start pb-4 border-b border-white/5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="w-4 h-4 text-white/50" />
                    <span className="text-xs font-bold text-white/50 uppercase tracking-widest">Requested Time</span>
                  </div>
                  {evaluating ? (
                    <span className="text-xs text-white/30 italic animate-pulse">Evaluating...</span>
                  ) : requestedStatus ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {requestedStatus.isAvailable ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                        <span className={cn("text-xs font-bold uppercase tracking-widest", requestedStatus.isAvailable ? "text-green-400" : "text-red-400")}>
                          {requestedStatus.isAvailable ? "Available" : "Conflict"}
                        </span>
                      </div>
                      <p className="text-[10px] text-white/50 leading-tight pr-4">{requestedStatus.reason}</p>
                    </div>
                  ) : null}
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-white/80">
                    {appointment.scheduledAt?.toDate ? format(appointment.scheduledAt.toDate(), "MMM d, yyyy h:mm a") : 'N/A'}
                  </span>
                </div>
             </div>
             
             <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Backup Target</span>
                  </div>
                  {appointment.waitlistInfo?.backupScheduledAt?.toDate ? (
                    evaluating ? (
                      <span className="text-xs text-orange-400/50 italic animate-pulse">Evaluating...</span>
                    ) : backupStatus ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {backupStatus.isAvailable ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                          <span className={cn("text-xs font-bold uppercase tracking-widest", backupStatus.isAvailable ? "text-green-400" : "text-red-400")}>
                            {backupStatus.isAvailable ? "Available" : "Conflict"}
                          </span>
                        </div>
                        <p className="text-[10px] text-white/50 leading-tight pr-4">{backupStatus.reason}</p>
                      </div>
                    ) : null
                  ) : (
                    <p className="text-[10px] text-white/50 leading-tight italic pr-4 mt-1">No backup time selected</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-orange-400">
                    {appointment.waitlistInfo?.backupScheduledAt?.toDate 
                      ? format(appointment.waitlistInfo.backupScheduledAt.toDate(), "MMM d, yyyy h:mm a")
                      : (appointment.waitlistInfo?.flexibleSameDay ? 'Flexible Same Day' : 'None Selected')}
                  </span>
                </div>
             </div>

             {!evaluating && (requestedStatus || backupStatus) && (
               <div className="mt-4 pt-4 border-t border-white/5 bg-primary/5 p-3 rounded-lg border border-primary/10">
                 <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1 flex items-center gap-2">
                   <AlertTriangle className="w-3 h-3" /> Smart Fit Summary
                 </h4>
                 <div className="text-xs font-medium text-white/80 space-y-1 mt-2">
                   {requestedStatus?.isAvailable ? (
                     <p><span className="text-white font-bold">Best option:</span> Requested Time</p>
                   ) : backupStatus?.isAvailable ? (
                     <p><span className="text-white font-bold">Best option:</span> Backup Target</p>
                   ) : (
                     <p className="text-red-400 font-bold">No available fit found for the requested or backup times. Generate alternate options.</p>
                   )}
                   {(requestedStatus?.isAvailable || backupStatus?.isAvailable) && (
                     <p className="text-white/60">
                       <span className="text-white/40">Reason:</span> {(requestedStatus?.isAvailable ? requestedStatus.reason : backupStatus?.reason)}
                     </p>
                   )}
                 </div>
               </div>
             )}

             {appointment.waitlistInfo?.clientNote && (
               <div className="mt-4 pt-4 border-t border-white/5">
                 <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Client Note</h4>
                 <p className="text-sm italic text-white/80 font-medium">"{appointment.waitlistInfo.clientNote}"</p>
               </div>
             )}
          </div>
        </DialogBody>

        <DialogFooter className="bg-black/40">
          <div className="w-full flex flex-col gap-4">
            {/* Smart Suggestions Section */}
            {!evaluating && (!requestedStatus?.isAvailable && !backupStatus?.isAvailable) && recommendations.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-2 text-left">
                  <Calendar className="w-3 h-3 text-primary" /> Generated Alternate Options
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {recommendations.map(rec => (
                     <div 
                       key={rec.id} 
                       onClick={() => setSelectedRec(rec)}
                       className={cn(
                         "p-3 rounded-lg border text-left cursor-pointer transition-colors",
                         selectedRec?.id === rec.id ? "bg-primary/20 border-primary" : "bg-white/5 border-white/10 hover:bg-white/10"
                       )}
                     >
                       <p className="text-sm font-bold text-white">{format(rec.startTime, "MMM d, h:mm a")}</p>
                       <p className="text-[10px] text-white/50 mt-1 line-clamp-1">{rec.reasons[0]}</p>
                     </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 justify-end">
              <Button variant="ghost" onClick={handleDecline} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 font-bold">
                <XCircle className="w-4 h-4 mr-2" /> Decline
              </Button>
              
              <Button variant="outline" className="border-white/10 font-bold" onClick={handleOfferSlot}>
                <Calendar className="w-4 h-4 mr-2 text-primary" /> View on Calendar
              </Button>

              {selectedRec ? (
                <Button 
                  className="bg-primary hover:bg-red-600 text-white font-bold"
                  onClick={handleScheduleSelectedRec}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Schedule Client Here
                </Button>
              ) : requestedStatus?.isAvailable ? (
                <Button 
                  className="bg-primary hover:bg-red-600 text-white font-bold"
                  onClick={handleApproveRequested}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Approve Requested Time
                </Button>
              ) : (
                 <Button 
                   className="bg-orange-600 hover:bg-orange-700 text-white font-bold"
                   onClick={handleApproveBackup}
                   disabled={!backupStatus || !backupStatus.isAvailable}
                   title={!backupStatus?.isAvailable ? "Backup time has conflicts." : "Approve this backup time."}
                 >
                   <CheckCircle2 className="w-4 h-4 mr-2" /> Approve Backup Time
                 </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
