import { useState, useEffect } from "react";
import { collection, query, onSnapshot, orderBy, where, deleteDoc, doc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, User, Car, Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, List, Settings2 } from "lucide-react";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { format, startOfDay, endOfDay, isSameDay, addDays, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { optimizeRoute, RouteStop } from "../lib/scheduling";
import { Truck, Trash2 } from "lucide-react";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";

export default function Calendar() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [appointments, setAppointments] = useState<any[]>([]);
  const [optimizedStops, setOptimizedStops] = useState<RouteStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"calendar" | "list">("calendar");

  useEffect(() => {
    if (authLoading || !profile) return;

    const q = query(collection(db, "appointments"), orderBy("scheduledAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const appointmentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAppointments(appointmentsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching appointments:", error);
      toast.error("Failed to load appointments");
    });

    return () => unsubscribe();
  }, [profile, authLoading]);

  useEffect(() => {
    if (date) {
      optimizeRoute(date)
        .then(setOptimizedStops)
        .catch(error => console.error("Error optimizing route in Calendar:", error));
    }
  }, [date, appointments]);

  const dayAppointments = appointments.filter(app => {
    if (!date || !app.scheduledAt) return false;
    const appDate = app.scheduledAt.toDate ? app.scheduledAt.toDate() : new Date(app.scheduledAt);
    return isSameDay(appDate, date);
  });

  const handleDeleteAppointment = async (id: string) => {
    console.log("Attempting to delete job:", id);
    if (!id) {
      toast.error("Invalid job ID");
      return;
    }
    
    try {
      await deleteDoc(doc(db, "appointments", id));
      toast.success("Job deleted successfully");
    } catch (error) {
      console.error("Error deleting job:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `appointments/${id}`);
      } catch (err: any) {
        toast.error(`Failed to delete job: ${err.message}`);
      }
    }
  };

  const statusColors: any = {
    scheduled: "bg-gray-100 text-gray-700 border-gray-200",
    confirmed: "bg-black text-white border-black",
    en_route: "bg-red-50 text-primary border-red-200",
    in_progress: "bg-primary text-white border-primary",
    completed: "bg-green-100 text-green-700 border-green-200",
    paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    canceled: "bg-red-100 text-red-700 border-red-200",
    no_show: "bg-gray-100 text-gray-700 border-gray-200",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Schedule</h1>
          <p className="text-gray-500">Manage your daily route and appointments.</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
          <Button 
            variant={view === "calendar" ? "secondary" : "ghost"} 
            size="sm" 
            onClick={() => setView("calendar")}
            className={cn("h-8 px-3 font-bold", view === "calendar" && "bg-red-50 text-primary hover:bg-red-100")}
          >
            <CalendarIcon className="w-4 h-4 mr-2" />
            Calendar
          </Button>
          <Button 
            variant={view === "list" ? "secondary" : "ghost"} 
            size="sm" 
            onClick={() => setView("list")}
            className={cn("h-8 px-3 font-bold", view === "list" && "bg-red-50 text-primary hover:bg-red-100")}
          >
            <List className="w-4 h-4 mr-2" />
            List
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Calendar Sidebar */}
        <Card className="lg:col-span-4 border-none shadow-sm bg-white overflow-hidden h-fit">
          <CardHeader className="border-b border-gray-50 bg-gray-50/50">
            <CardTitle className="text-lg font-semibold text-gray-900">Select Date</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <CalendarUI
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-md border-none w-full"
              modifiers={{
                hasAppointment: (day) => appointments.some(app => {
                  const appDate = app.scheduledAt?.toDate ? app.scheduledAt.toDate() : new Date(app.scheduledAt);
                  return isSameDay(appDate, day);
                })
              }}
              modifiersStyles={{
                hasAppointment: { fontWeight: 'bold', textDecoration: 'underline', color: 'var(--primary)' }
              }}
            />
          </CardContent>
        </Card>

        {/* Appointments List */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="border-b border-gray-50 bg-gray-50/50 flex flex-row items-center justify-between">
              <div className="flex flex-col">
                <CardTitle className="text-lg font-semibold text-gray-900">
                  {date ? format(date, "EEEE, MMMM d, yyyy") : "Select a date"}
                </CardTitle>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">{dayAppointments.length} appointments scheduled</p>
              </div>
              <Button 
                size="sm" 
                className="bg-primary hover:bg-red-700 font-bold"
                onClick={() => navigate("/appointments", { state: { openAddDialog: true } })}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Job
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading schedule...</div>
              ) : optimizedStops.length === 0 ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mx-auto">
                    <CalendarIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-gray-900 font-semibold">No appointments for this day</p>
                    <p className="text-gray-500 text-sm">You're free! Or maybe it's time to follow up on some leads.</p>
                  </div>
                  <Button variant="outline" className="mt-4" onClick={() => navigate("/appointments")}>Schedule a Job</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {optimizedStops.map((app, index) => (
                    <div key={app.id} className="space-y-4">
                      {app.travelTimeFromPrevious !== undefined && (
                        <div className="flex items-center gap-4 px-5 py-2">
                          <div className="w-24 flex justify-center">
                            <div className="w-0.5 h-8 bg-gray-100 relative">
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-1">
                                <Truck className="w-3 h-3 text-gray-400" />
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            <span>Travel: {app.travelTimeFromPrevious} mins</span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full" />
                            <span>{app.distanceFromPrevious} miles</span>
                          </div>
                        </div>
                      )}
                      <div 
                        className="flex flex-col md:flex-row md:items-center gap-4 p-5 rounded-2xl border border-gray-100 hover:border-red-100 hover:bg-red-50/30 transition-all cursor-pointer group"
                        onClick={() => navigate(`/appointments/${app.id}`)}
                      >
                        <div className="flex-shrink-0 w-24 text-center md:border-r md:border-gray-100 md:pr-4">
                          <p className="text-lg font-bold text-gray-900">
                            {app.scheduledAt?.toDate ? format(app.scheduledAt.toDate(), "h:mm") : "TBD"}
                          </p>
                          <p className="text-[10px] font-bold text-primary uppercase tracking-widest">
                            {app.scheduledAt?.toDate ? format(app.scheduledAt.toDate(), "a") : ""}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-gray-900 truncate">{app.customerName || "Client"}</h3>
                            <Badge variant="outline" className={cn("text-[10px] font-bold uppercase tracking-wider", statusColors[app.status] || "bg-gray-100 text-gray-700")}>
                              {app.status?.replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Car className="w-3 h-3 text-gray-400" />
                              {app.vehicleInfo || "Vehicle N/A"}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500 truncate">
                              <MapPin className="w-3 h-3 text-gray-400" />
                              {app.address || "No address provided"}
                            </div>
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right md:pl-4 md:border-l md:border-gray-100 flex flex-col items-end gap-2">
                          <p className="text-xl font-black text-gray-900">${app.totalAmount || 0}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Est. 2.5 hrs</p>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-gray-300 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate("/appointments", { state: { editingAppointmentId: app.id } });
                              }}
                            >
                              <Settings2 className="w-3 h-3" />
                            </Button>
                            <DeleteConfirmationDialog
                              trigger={
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              }
                              title="Delete Job?"
                              itemName={app.customerName}
                              onConfirm={() => handleDeleteAppointment(app.id)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Route Optimization Suggestion */}
          <Card className="border-none shadow-sm bg-black text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <MapPin className="w-24 h-24" />
            </div>
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                Route Optimization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-400 text-sm mb-4">
                Your route is optimized based on proximity and travel time. 
                Total estimated travel for today: <strong className="text-white">
                  {optimizedStops.reduce((acc, stop) => acc + (stop.travelTimeFromPrevious || 0), 0)} mins
                </strong>
              </p>
              <Button className="bg-primary text-white hover:bg-red-700 font-bold w-full">
                View Full Route Map
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
