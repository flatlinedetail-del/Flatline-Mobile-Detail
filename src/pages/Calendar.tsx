import { useState, useEffect } from "react";
import { collection, query, onSnapshot, orderBy, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, User, Car, Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, List } from "lucide-react";
import { format, startOfDay, endOfDay, isSameDay, addDays, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Calendar() {
  const navigate = useNavigate();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"calendar" | "list">("calendar");

  useEffect(() => {
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
  }, []);

  const dayAppointments = appointments.filter(app => {
    if (!date || !app.scheduledAt) return false;
    const appDate = app.scheduledAt.toDate ? app.scheduledAt.toDate() : new Date(app.scheduledAt);
    return isSameDay(appDate, date);
  });

  const statusColors: any = {
    scheduled: "bg-blue-100 text-blue-700 border-blue-200",
    confirmed: "bg-purple-100 text-purple-700 border-purple-200",
    en_route: "bg-orange-100 text-orange-700 border-orange-200",
    in_progress: "bg-yellow-100 text-yellow-700 border-yellow-200",
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
            className={cn("h-8 px-3", view === "calendar" && "bg-blue-50 text-blue-700 hover:bg-blue-100")}
          >
            <CalendarIcon className="w-4 h-4 mr-2" />
            Calendar
          </Button>
          <Button 
            variant={view === "list" ? "secondary" : "ghost"} 
            size="sm" 
            onClick={() => setView("list")}
            className={cn("h-8 px-3", view === "list" && "bg-blue-50 text-blue-700 hover:bg-blue-100")}
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
                hasAppointment: { fontWeight: 'bold', textDecoration: 'underline', color: '#3b82f6' }
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
                <p className="text-xs text-gray-500 mt-0.5">{dayAppointments.length} appointments scheduled</p>
              </div>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Job
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading schedule...</div>
              ) : dayAppointments.length === 0 ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mx-auto">
                    <CalendarIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-gray-900 font-semibold">No appointments for this day</p>
                    <p className="text-gray-500 text-sm">You're free! Or maybe it's time to follow up on some leads.</p>
                  </div>
                  <Button variant="outline" className="mt-4">Schedule a Job</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {dayAppointments.map((app) => (
                    <div 
                      key={app.id} 
                      className="flex flex-col md:flex-row md:items-center gap-4 p-5 rounded-2xl border border-gray-100 hover:border-blue-100 hover:bg-blue-50/30 transition-all cursor-pointer group"
                      onClick={() => navigate(`/appointments/${app.id}`)}
                    >
                      <div className="flex-shrink-0 w-24 text-center md:border-r md:border-gray-100 md:pr-4">
                        <p className="text-lg font-bold text-gray-900">
                          {app.scheduledAt?.toDate ? format(app.scheduledAt.toDate(), "h:mm") : "TBD"}
                        </p>
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                          {app.scheduledAt?.toDate ? format(app.scheduledAt.toDate(), "a") : ""}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-gray-900 truncate">{app.customerName || "Retail Client"}</h3>
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
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <User className="w-3 h-3 text-gray-400" />
                            Tech: {app.technicianName || "Unassigned"}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <List className="w-3 h-3 text-gray-400" />
                            {app.serviceNames?.join(", ") || "No services listed"}
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right md:pl-4 md:border-l md:border-gray-100">
                        <p className="text-xl font-black text-gray-900">${app.totalAmount || 0}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Est. 2.5 hrs</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Route Optimization Suggestion */}
          <Card className="border-none shadow-sm bg-blue-600 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <MapPin className="w-24 h-24" />
            </div>
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Route Optimization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-blue-100 text-sm mb-4">
                You have 2 other jobs in the <strong>North Area</strong> today. 
                Moving the 2:00 PM appointment to 1:30 PM would save 15 minutes of drive time and $4 in fuel.
              </p>
              <Button className="bg-white text-blue-600 hover:bg-blue-50 font-semibold">
                Apply Optimization
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
