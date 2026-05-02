import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Calendar, User, Clock, MapPin, Truck, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function AppointmentPreviewModal({ appointment, isOpen, onClose }: { appointment: any, isOpen: boolean, onClose: () => void }) {
  const navigate = useNavigate();
  if (!appointment) return null;

  const handleOpenJob = () => {
    onClose();
    navigate(`/calendar/${appointment.id}`);
  };

  const handleViewCalendar = () => {
    onClose();
    navigate("/calendar", {
      state: {
        editingAppointmentId: appointment.id,
        selectedDate: appointment.scheduledAt?.toDate ? appointment.scheduledAt.toDate() : new Date()
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-2xl bg-sidebar border-white/10 text-white p-0 overflow-hidden">
        <DialogHeader className="p-6 border-b border-white/5 bg-black/40">
          <div className="flex justify-between items-start">
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Appointment Details
              </DialogTitle>
              <p className="text-[10px] uppercase font-bold text-white/40 tracking-widest mt-1">ID: {appointment.id}</p>
            </div>
            <div className="bg-white/10 px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest">
              {appointment.status?.replace("_", " ")}
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6">
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
                  <MapPin className="w-4 h-4 text-primary shrink-0" /> <span className="line-clamp-2">{appointment.address}</span>
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Vehicle</h4>
                <p className="text-sm font-bold flex items-center gap-2 text-white/80">
                  <Truck className="w-4 h-4 text-[#0A4DFF]" /> {appointment.vehicleInfo}
                </p>
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Services</h4>
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
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Est. Duration</h4>
                  <p className="text-sm font-bold text-white/80">{appointment.estimatedDuration || 0} mins</p>
                </div>
                <div>
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Total</h4>
                  <p className="text-sm font-bold text-green-400">${appointment.totalAmount || 0}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-black/40 rounded-xl p-4 border border-white/5 space-y-4">
             <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-white/50" />
                  <span className="text-xs font-bold text-white/50 uppercase tracking-widest">Scheduled Target</span>
                </div>
                <span className="text-sm font-bold text-white">
                  {appointment.scheduledAt?.toDate ? format(appointment.scheduledAt.toDate(), "MMM d, yyyy h:mm a") : 'Unscheduled'}
                </span>
             </div>
             {appointment.notes && (
               <div className="pt-4 border-t border-white/5">
                 <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Internal Notes</h4>
                 <p className="text-sm italic text-white/80 font-medium">"{appointment.notes}"</p>
               </div>
             )}
          </div>
        </div>

        <div className="p-6 border-t border-white/5 bg-black/40 flex flex-wrap gap-3 justify-end leading-none">
          <Button variant="outline" className="border-white/10 font-bold" onClick={handleViewCalendar}>
            <Calendar className="w-4 h-4 mr-2" /> View on Calendar
          </Button>
          <Button className="bg-primary hover:bg-neutral-900 text-white font-bold" onClick={handleOpenJob}>
             <ExternalLink className="w-4 h-4 mr-2" /> Open Job / Deployment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
