/**
 * PackageScheduleModal
 *
 * Lets the tech apply a package deal to one of the client's next 4 upcoming
 * recurring appointments, or fall through to creating a separate appointment.
 *
 * Caller wires:
 *  - clientId   (required to fetch appointments)
 *  - bundle     (the package deal payload)
 *  - relatedVehicleId (optional — used for vehicle-safety warnings)
 *  - onApplied  (called after a successful update)
 *  - onCreateSeparate (called when user picks "Create Separate Appointment")
 *  - onCancel   (called for Cancel button or backdrop close)
 */

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Loader2, AlertTriangle, Calendar, CheckCircle2, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  fetchUpcomingRecurringAppointments,
  applyPackageToAppointment,
} from "../services/packageDealService";
import { formatCurrency } from "../lib/utils";

export interface PackageScheduleBundle {
  name: string;
  services?: string[];
  price: number;
  savings?: number;
  reason?: string;
}

export interface PackageScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  bundle: PackageScheduleBundle | null;
  relatedVehicleId?: string | null;
  relatedVehicleLabel?: string;
  onApplied?: (appointmentId: string, occurrenceDate: Date) => void;
  onCreateSeparate?: () => void;
}

export function PackageScheduleModal({
  open,
  onOpenChange,
  clientId,
  bundle,
  relatedVehicleId,
  relatedVehicleLabel,
  onApplied,
  onCreateSeparate,
}: PackageScheduleModalProps) {
  const [loading, setLoading] = useState(false);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open || !clientId) return;
    setLoading(true);
    setSelectedId("");
    fetchUpcomingRecurringAppointments(clientId, {
      limit: 4,
      relatedVehicleId: relatedVehicleId ?? null,
    })
      .then(rows => {
        setAppointments(rows);
        if (rows.length === 1) setSelectedId(rows[0].id);
      })
      .catch(err => {
        console.error("[PackageSchedule] Failed to load recurring appointments:", err);
        toast.error("Could not load recurring appointments.");
        setAppointments([]);
      })
      .finally(() => setLoading(false));
  }, [open, clientId, relatedVehicleId]);

  const handleApply = async () => {
    if (!bundle || !selectedId) return;
    const chosen = appointments.find(a => a.id === selectedId);
    if (!chosen) return;
    const apptVehicleIds: string[] = Array.isArray(chosen.vehicleIds)
      ? chosen.vehicleIds
      : chosen.vehicleId
      ? [chosen.vehicleId]
      : [];
    if (relatedVehicleId && !apptVehicleIds.includes(relatedVehicleId)) {
      const ok = window.confirm(
        `${relatedVehicleLabel || "This vehicle"} is not on the selected appointment.\n\n` +
          `Click OK to add the package to that appointment anyway, or Cancel to choose another option.`
      );
      if (!ok) return;
    }
    setApplying(true);
    try {
      const occurrenceDate = chosen.scheduledAt?.toDate
        ? chosen.scheduledAt.toDate()
        : new Date(chosen.scheduledAt);
      const result = await applyPackageToAppointment(
        chosen.id,
        bundle,
        relatedVehicleId ?? null,
        occurrenceDate
      );
      if (!result.applied) {
        toast.warning("Could not apply — selected vehicle is not on that appointment.");
        return;
      }
      toast.success(`Package added to ${format(occurrenceDate, "MMM d, yyyy")}.`);
      onApplied?.(chosen.id, occurrenceDate);
      onOpenChange(false);
    } catch (err: any) {
      console.error("[PackageSchedule] Apply failed:", err);
      toast.error(`Could not apply package: ${err?.message?.slice(0, 100) || "Unknown error"}`);
    } finally {
      setApplying(false);
    }
  };

  const formatAppt = (a: any): string => {
    const at = a.scheduledAt?.toDate ? a.scheduledAt.toDate() : new Date(a.scheduledAt);
    const dateStr = format(at, "MMM d, yyyy 'at' h:mma");
    const vehicle = a.vehicleInfo || (Array.isArray(a.vehicleIds) ? a.vehicleIds.join(", ") : a.vehicleId) || "Vehicle";
    const services = Array.isArray(a.serviceNames) && a.serviceNames.length > 0 ? a.serviceNames.join(", ") : "Recurring detail";
    return `${dateStr} — ${vehicle} — ${services}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0B0B0B] border-white/10 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white font-black uppercase tracking-tighter flex items-center gap-3">
            <Calendar className="w-5 h-5 text-primary" />
            Schedule for Future Detail
          </DialogTitle>
        </DialogHeader>

        {bundle && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1">
            <p className="text-sm font-black text-amber-400 uppercase tracking-tight">{bundle.name}</p>
            {Array.isArray(bundle.services) && bundle.services.length > 0 && (
              <p className="text-[10px] text-white/70 font-medium">Includes: {bundle.services.join(", ")}</p>
            )}
            <div className="flex justify-between items-center pt-1">
              <span className="text-[10px] text-white/60 font-black uppercase tracking-widest">Package Price</span>
              <span className="text-sm text-white font-black">{formatCurrency(bundle.price)}</span>
            </div>
            {!!bundle.savings && bundle.savings > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">You Save</span>
                <span className="text-xs text-emerald-400 font-black">{formatCurrency(bundle.savings)}</span>
              </div>
            )}
            {relatedVehicleLabel && (
              <p className="text-[10px] text-white/50 pt-1">For vehicle: <span className="text-white/80 font-bold">{relatedVehicleLabel}</span></p>
            )}
          </div>
        )}

        <div className="space-y-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Pick an upcoming recurring appointment</p>

          {loading && (
            <div className="flex items-center justify-center py-8 text-white/60">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-[10px] font-black uppercase tracking-widest">Loading recurring appointments…</span>
            </div>
          )}

          {!loading && appointments.length === 0 && (
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-[11px] text-amber-400 font-black uppercase tracking-widest">No upcoming recurring appointments</p>
                <p className="text-[10px] text-white/60 font-medium leading-relaxed">
                  This client has no future recurring appointments. Use "Create Separate Appointment" below to open the booking form.
                </p>
              </div>
            </div>
          )}

          {!loading && appointments.length > 0 && (
            <div className="space-y-2">
              {appointments.map(a => {
                const apptVehicleIds: string[] = Array.isArray(a.vehicleIds)
                  ? a.vehicleIds
                  : a.vehicleId
                  ? [a.vehicleId]
                  : [];
                const vehicleMissing = !!relatedVehicleId && !apptVehicleIds.includes(relatedVehicleId);
                const isSelected = selectedId === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? "bg-primary/15 border-primary ring-1 ring-primary"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-white/30 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 space-y-1">
                        <p className="text-xs font-black text-white">{formatAppt(a)}</p>
                        {vehicleMissing && (
                          <p className="text-[9px] text-amber-400 font-bold uppercase tracking-widest flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {relatedVehicleLabel || "Selected vehicle"} not on this appointment
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-white/5 border-white/10 text-white hover:bg-white/10 font-black uppercase tracking-widest text-[10px]"
          >
            Cancel
          </Button>
          {onCreateSeparate && (
            <Button
              variant="outline"
              onClick={() => {
                onCreateSeparate();
                onOpenChange(false);
              }}
              className="bg-white/5 border-white/10 text-white hover:bg-white/10 font-black uppercase tracking-widest text-[10px]"
            >
              <Plus className="w-3 h-3 mr-1.5" />
              Create Separate Appointment
            </Button>
          )}
          <Button
            onClick={handleApply}
            disabled={!selectedId || applying || appointments.length === 0}
            className="bg-primary hover:bg-[#2A6CFF] text-white font-black uppercase tracking-widest text-[10px] disabled:opacity-50"
          >
            {applying && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
            Apply Package to Selected Appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
