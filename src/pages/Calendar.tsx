import { useState, useEffect, useRef, useMemo } from "react";
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, getDocs, doc, updateDoc, getDoc, where, deleteDoc, writeBatch, limit, Timestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType, storage } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { PageHeader } from "../components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, MapPin, User, Car, Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, List, Settings2, Loader2, RefreshCw, RefreshCcw, AlertTriangle, ShieldAlert, Search, Filter, MoreHorizontal, Phone, Mail, ArrowRight, Star, Truck, Repeat, Trash2, Save, ChevronDown, ExternalLink, FileText, Lock, Sparkles, Crown, Globe, Navigation2, Play, Check, X, Map } from "lucide-react";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, startOfDay, endOfDay, isSameDay, isSameMonth, addDays, subDays, addHours, addWeeks, addMonths, subMonths, startOfMonth, endOfMonth, isBefore, parseISO, parse, startOfWeek, getDay, addMinutes } from "date-fns";
import { calculateDistance, calculateTravelFee } from "../services/travelService";
import { messagingService } from "../services/messagingService";
import { enUS } from "date-fns/locale";
import { Calendar as BigCalendar, dateFnsLocalizer, Views } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { motion, AnimatePresence } from "motion/react";
import { cn, formatDuration, getClientDisplayName, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import { useGoogleMaps } from "../components/GoogleMapsProvider";
import { GoogleMap, Marker, Polyline, InfoWindow, MarkerClusterer, DirectionsRenderer } from "@react-google-maps/api";
import { optimizeRoute, RouteStop } from "../lib/scheduling";
import { Switch } from "@/components/ui/switch";
import AddressInput from "../components/AddressInput";
import VehicleSelector from "../components/VehicleSelector";
import { StableInput } from "../components/StableInput";
import { BusinessSettings } from "../types";
import { SearchableSelector } from "../components/SearchableSelector";
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
import { Textarea } from "@/components/ui/textarea";
import { fetchGoogleEvents, createGoogleEvent, updateGoogleEvent, deleteGoogleEvent } from "../services/googleCalendarService";
import { geocodeAddress } from "../services/geocodingService";
import { createNotification } from "../services/notificationService";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { locale: enUS }),
  getDay,
  locales: { "en-US": enUS },
});

const isValidDate = (d: any): d is Date => d instanceof Date && !isNaN(d.getTime());

const safeFormat = (date: any, formatStr: string, fallback: string = "---") => {
  if (!date) return fallback;
  const d = date instanceof Date ? date : (date?.toDate ? date.toDate() : new Date(date));
  if (!isValidDate(d)) return fallback;
  try {
    return format(d, formatStr);
  } catch (e) {
    console.error("[Calendar] format error", e, d, formatStr);
    return fallback;
  }
};

export default function Calendar() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [appointments, setAppointments] = useState<any[]>([]);
  const [optimizedStops, setOptimizedStops] = useState<RouteStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarView, setCalendarView] = useState<string>("month");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [recurringAction, setRecurringAction] = useState<{ type: "edit" | "delete", appointment: any } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<any[]>([]);
  const [isSyncingGoogle, setIsSyncingGoogle] = useState(false);
  const [selectedStop, setSelectedStop] = useState<any>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  
  const [timeBlocks, setTimeBlocks] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);

  const { isLoaded } = useGoogleMaps();

  const events = useMemo(() => {
    const appEvents = appointments.map((app: any) => {
      const client = clients.find(c => c.id === (app.clientId || app.customerId));
      const start = app.scheduledAt?.toDate ? app.scheduledAt.toDate() : new Date(app.scheduledAt);
      
      if (!isValidDate(start)) {
        return null;
      }

      const duration = app.estimatedDuration || 120;
      let end = addMinutes(start, duration + (app.overrideBufferTimeMinutes || 0));
      
      if (!isValidDate(end)) {
        end = addHours(start, 2);
      }
      
      // Determine risk level from client data
      const riskLevel = client?.riskLevel || client?.risk_level || client?.riskStatus || client?.clientRiskLevel || client?.riskManagement?.level;

      return {
        id: app.id,
        title: `${getClientDisplayName(client || app)}`,
        start,
        end,
        resource: {
          ...app,
          clientRiskLevel: riskLevel
        },
        type: "appointment",
        status: app.status
      };
    }).filter((evt): evt is any => evt !== null);

    const blockEvents = timeBlocks.map((block: any) => {
      let start, end;
      try {
        if (block.type === 'full_day') {
          // Handle timezone by parsing parts directly from YYYY-MM-DD
          const [sy, sm, sd] = block.date.split("-").map(Number);
          start = new Date(sy, sm - 1, sd, 0, 0, 0);
          
          const endD = block.endDate || block.date;
          const [ey, em, ed] = endD.split("-").map(Number);
          end = new Date(ey, em - 1, ed, 23, 59, 59);
        } else {
          start = new Date(`${block.date}T${block.startTime || "00:00"}`);
          end = new Date(`${block.date}T${block.endTime || "23:59"}`);
        }
      } catch (e) {
        return null;
      }

      if (!isValidDate(start) || !isValidDate(end)) return null;

      return {
        id: block.id,
        title: `BLOCK: ${block.title}`,
        start,
        end,
        resource: block,
        type: "block"
      };
    }).filter((evt): evt is any => evt !== null);

    const gEvents = googleEvents.map((event: any) => {
      const start = new Date(event.start.dateTime || event.start.date);
      const end = new Date(event.end.dateTime || event.end.date);
      
      if (!isValidDate(start) || !isValidDate(end)) return null;

      return {
        id: event.id,
        title: `G: ${event.summary}`,
        start,
        end,
        resource: event,
        type: "google"
      };
    }).filter((evt): evt is any => evt !== null);

    return [...appEvents, ...blockEvents, ...gEvents];
  }, [appointments, timeBlocks, googleEvents, clients]);

  // Appointment Form State
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showTimeBlockDialog, setShowTimeBlockDialog] = useState(false);
  const [editingTimeBlock, setEditingTimeBlock] = useState<any>(null);
  const [timeBlockForm, setTimeBlockForm] = useState({
    title: "",
    type: "full_day" as "full_day" | "partial",
    date: "",
    endDate: "",
    startTime: "",
    endTime: "",
    notes: ""
  });
  const [isCreating, setIsCreating] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [services, setServices] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [selectedServices, setSelectedServices] = useState<{ id: string; qty: number; vehicleId?: string }[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<{ id: string; qty: number }[]>([]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [addonSearch, setAddonSearch] = useState("");
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [availableVehicles, setAvailableVehicles] = useState<any[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [redeemedPoints, setRedeemedPoints] = useState(0);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositType, setDepositType] = useState<"fixed" | "percentage">("fixed");
  const [depositPaid, setDepositPaid] = useState(false);
  const [cancellationFeeEnabled, setCancellationFeeEnabled] = useState(false);
  const [cancellationFeeAmount, setCancellationFeeAmount] = useState(0);
  const [cancellationFeeType, setCancellationFeeType] = useState<"fixed" | "percentage">("fixed");
  const [cancellationCutoffHours, setCancellationCutoffHours] = useState(24);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [appointmentAddress, setAppointmentAddress] = useState({ 
    address: "", 
    lat: 0, 
    lng: 0,
    city: "",
    state: "",
    zipCode: "",
    placeId: ""
  });
  const [baseAmount, setBaseAmount] = useState<number>(0);
  const [travelFee, setTravelFee] = useState<number>(0);
  const [isAddressManual, setIsAddressManual] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<"daily" | "weekly" | "biweekly" | "monthly">("weekly");
  const [recurringInterval, setRecurringInterval] = useState(1);
  const [recurringEndDate, setRecurringEndDate] = useState("");
  const [recurringOccurrences, setRecurringOccurrences] = useState<number | "">("");
  const [scheduledAtValue, setScheduledAtValue] = useState("");
  const [appointmentStatus, setAppointmentStatus] = useState<string>("scheduled");
  const [afterHoursFeeDisplay, setAfterHoursFeeDisplay] = useState(0);
  const [isAfterHoursDisplay, setIsAfterHoursDisplay] = useState(false);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [appointment, setAppointment] = useState({ 
    vehicleSize: "medium",
    vehicleInfo: "",
    vin: "",
    jobNum: "",
  });

  useEffect(() => {
    const validStops = optimizedStops.filter(s => s.latitude !== 0 && s.longitude !== 0);

    if (validStops.length === 0) {
      setDirections(null);
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();

    const origin = settings?.baseLatitude 
      ? { lat: settings.baseLatitude, lng: settings.baseLongitude } 
      : { lat: validStops[0].latitude, lng: validStops[0].longitude };

    const destination = (settings?.baseLatitude && settings.travelPricing?.roundTripToggle)
      ? { lat: settings.baseLatitude, lng: settings.baseLongitude }
      : { lat: validStops[validStops.length - 1].latitude, lng: validStops[validStops.length - 1].longitude };

    const waypoints = validStops.map(stop => ({
      location: { lat: stop.latitude, lng: stop.longitude },
      stopover: true
    }));

    // Logic to avoid duplicating origin/destination in waypoints
    let finalWaypoints = [...waypoints];
    if (!settings?.baseLatitude) {
      // If no base, the first stop is our origin
      if (finalWaypoints.length > 0) finalWaypoints.shift();
      // And the last stop is our destination
      if (finalWaypoints.length > 0) finalWaypoints.pop();
    } else {
      // If we have a base and roundTrip is false, the last stop is our destination
      if (!settings.travelPricing?.roundTripToggle) {
        if (finalWaypoints.length > 0) finalWaypoints.pop();
      }
    }

    if (!origin || !destination) {
      setDirections(null);
      return;
    }

    directionsService.route(
      {
        origin,
        destination,
        waypoints: finalWaypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirections(result);
        } else {
          console.error(`Directions request failed due to ${status}`);
          setDirections(null); // Ensure fallback to Polyline
          
          if (status === window.google.maps.DirectionsStatus.REQUEST_DENIED) {
            toast.error("Map Routing Error", {
              description: "The 'Directions API' is not enabled for your Google Maps project. Please enable it in the Google Cloud Console to see road-mapped routes. Falling back to straight lines.",
              duration: 10000,
            });
          }
        }
      }
    );
  }, [isLoaded, optimizedStops, settings, date]);

  const fetchCalendarData = async (showToast = false) => {
    if (!profile) return;

    // Cache check to avoid redundant reads during navigation (5 min TTL)
    const CACHE_KEY = `calendar_cache_${profile.id}`;
    const lastFetch = Number(sessionStorage.getItem(`${CACHE_KEY}_time`) || 0);
    const now = Date.now();
    const CACHE_TTL = 5 * 60 * 1000;

    if (!showToast && now - lastFetch < CACHE_TTL) {
      const cachedData = sessionStorage.getItem(CACHE_KEY);
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          setAppointments(parsed.appointments);
          setTimeBlocks(parsed.timeBlocks);
          setClients(parsed.clients || []);
          setServices(parsed.services);
          setAddons(parsed.addons);
          setSettings(parsed.settings);
          setLoading(false);
          console.log("[Calendar] Loaded from cache");
          return;
        } catch (e) {
          console.warn("[Calendar] Cache parse failed", e);
        }
      }
    }

    if (showToast) toast.loading("Syncing Ops...", { id: "sync-cal" });
    setLoading(true);
    try {
      const startOfRange = startOfMonth(subMonths(new Date(), 1));
      const endOfRange = endOfMonth(addMonths(new Date(), 2));

      const [apptsSnap, tbSnap, clientsSnap, servicesSnap, addonsSnap, settingsSnap] = await Promise.all([
        getDocs(query(
          collection(db, "appointments"), 
          where("scheduledAt", ">=", Timestamp.fromDate(startOfRange)),
          where("scheduledAt", "<=", Timestamp.fromDate(endOfRange)),
          orderBy("scheduledAt", "asc"),
          limit(500)
        )).catch(e => handleFirestoreError(e, OperationType.LIST, "appointments")),
        getDocs(query(collection(db, "blocked_dates"), limit(100))).catch(e => handleFirestoreError(e, OperationType.LIST, "blocked_dates")),
        getDocs(query(collection(db, "clients"), limit(200))).catch(e => handleFirestoreError(e, OperationType.LIST, "clients")),
        getDocs(collection(db, "services")).catch(e => handleFirestoreError(e, OperationType.LIST, "services")),
        getDocs(collection(db, "addons")).catch(e => handleFirestoreError(e, OperationType.LIST, "addons")),
        getDoc(doc(db, "settings", "business")).catch(e => handleFirestoreError(e, OperationType.GET, "settings/business"))
      ]);

      if (!apptsSnap || !tbSnap || !clientsSnap || !servicesSnap || !addonsSnap || !settingsSnap) return;

      const appointmentsData = apptsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const timeBlocksData = tbSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const clientsData = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const servicesData = servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((s: any) => s.isActive);
      const addonsData = addonsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((a: any) => a.isActive);
      const businessSettings = settingsSnap.exists() ? (settingsSnap.data() as BusinessSettings) : null;

      setAppointments(appointmentsData);
      setTimeBlocks(timeBlocksData);
      setClients(clientsData);
      setServices(servicesData);
      setAddons(addonsData);
      
      if (businessSettings) setSettings(businessSettings);
      
      // Save to Session Cache
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        appointments: appointmentsData,
        timeBlocks: timeBlocksData,
        clients: clientsData,
        services: servicesData,
        addons: addonsData,
        settings: businessSettings
      }));
      sessionStorage.setItem(`${CACHE_KEY}_time`, Date.now().toString());

      setLoading(false);
      if (showToast) toast.success("Ops Synchronized", { id: "sync-cal" });
    } catch (error: any) {
      console.error("Error fetching calendar data:", error);
      setLoading(false);
      if (error?.message?.includes("Quota limit exceeded")) {
        toast.error("Calendar Sync Failed: Quota exceeded");
      } else if (showToast) {
        toast.error("Sync Failed", { id: "sync-cal" });
      }
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    fetchCalendarData();
    
    return () => {};
  }, [profile, authLoading]);

  // Auto-calculate travel fee when address changes
  useEffect(() => {
    if (!settings?.travelPricing.enabled || !appointmentAddress.address || appointmentAddress.lat === 0) {
      setTravelFee(0);
      return;
    }

    const dist = calculateDistance(
      settings.baseLatitude,
      settings.baseLongitude,
      appointmentAddress.lat,
      appointmentAddress.lng
    );

    const { fee } = calculateTravelFee(
      dist,
      settings.travelPricing,
      { lat: appointmentAddress.lat, lng: appointmentAddress.lng }
    );

    // Apply VIP waiver if applicable
    const client = clients.find(c => c.id === selectedCustomerId);
    if (client?.isVIP && client?.vipSettings?.waiveTravelFee) {
      setTravelFee(0);
    } else if (client?.isVIP && client?.vipSettings?.travelFeeDiscount) {
      const discount = typeof client.vipSettings.travelFeeDiscount === 'number' 
        ? client.vipSettings.travelFeeDiscount 
        : 0;
      setTravelFee(Math.max(0, fee - discount));
    } else {
      setTravelFee(fee);
    }
  }, [appointmentAddress, settings, selectedCustomerId, clients]);
  useEffect(() => {
    if (!profile || !date || appointments.length === 0) {
        setOptimizedStops([]);
        return;
    }

    const triggerOptimization = async () => {
        try {
            const { stops, error } = await optimizeRoute(date);
            if (!error && stops) {
                setOptimizedStops(stops);
            }
        } catch (err) {
            console.error("Auto-optimization failed:", err);
        }
    };

    triggerOptimization();
  }, [date, appointments, profile]);

  useEffect(() => {
    const syncGoogle = async () => {
      if (!profile?.id || !date) return;
      setIsSyncingGoogle(true);
      try {
        const events = await fetchGoogleEvents(startOfDay(date), endOfDay(date));
        setGoogleEvents(events || []);
      } catch (error) {
        console.error("Error fetching Google events:", error);
      } finally {
        setIsSyncingGoogle(false);
      }
    };

    syncGoogle();
  }, [date, profile?.id]);

  const locationStateProcessed = useRef(false);

  useEffect(() => {
    if (loading) return; // Wait for appointments to load
    if (locationStateProcessed.current) return;

    if (location.state && (location.state.lead || location.state.openAddDialog || location.state.editingAppointmentId || location.state.editingWaitlistId)) {
      toast.success("Calendar State Received");
      
      if (location.state.lead) {
        const lead = location.state.lead;
        setActiveLeadId(lead.id);
        const existingClient = clients.find(c => c.phone === lead.phone || c.email === lead.email);
        if (existingClient) {
          setSelectedCustomerId(existingClient.id);
        }
        
        if (lead.address) {
          handleAddressSelect(lead.address, lead.latitude || 0, lead.longitude || 0, true);
        }
      } else if (location.state.clientId || location.state.customerId || location.state.vendorId) {
        setSelectedCustomerId(location.state.clientId || location.state.customerId || location.state.vendorId);
      } else if (location.state.editingAppointmentId || location.state.editingWaitlistId) {
        const targetId = location.state.editingAppointmentId || location.state.editingWaitlistId;
        const appToEdit = appointments.find(a => a.id === targetId);
        if (appToEdit) {
          const dt = appToEdit.scheduledAt?.toDate ? appToEdit.scheduledAt.toDate() : new Date(appToEdit.scheduledAt);
          if (dt && !isNaN(dt.getTime())) setDate(dt);
          setEditingAppointment({
            ...appToEdit,
            _editSeries: location.state.editSeries || false
          });
        }
      }
      setShowAddDialog(true);
      locationStateProcessed.current = true;
    }
  }, [location.state, clients, appointments, navigate, location.pathname, loading]);

  useEffect(() => {
    let unsubscribeVehicles: (() => void) | undefined;
    const targetCustomerId = selectedCustomerId;

    if (targetCustomerId && showAddDialog) {
      const c = clients.find(item => item.id === targetCustomerId);
      
      // Only auto-fill if the current address is empty (only for new/editing dialog)
      if (showAddDialog && c && c.address && !appointmentAddress.address) {
        handleAddressSelect(c.address, c.latitude || c.lat || 0, c.longitude || c.lng || 0, true);
      }

      // Fetch vehicles continuously so modal logic stays updated
      const q = query(
        collection(db, "vehicles"),
        where("clientId", "==", targetCustomerId)
      );
      unsubscribeVehicles = onSnapshot(q, snap => {
        const vehicles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAvailableVehicles(vehicles);
        
        // If there's only one vehicle, pre-fill it and select it (only for new/editing dialog)
        if (showAddDialog && vehicles.length === 1 && selectedVehicleIds.length === 0) {
          const v = vehicles[0] as any;
          setAppointment(prev => ({ 
            ...prev, 
            vehicleInfo: `${v.year} ${v.make} ${v.model}`, 
            vehicleSize: v.size || "medium", 
            vin: v.vin || "" 
          }));
          setSelectedVehicleIds([v.id]);
        }
      }, (error: any) => {
        if (error?.code === 'cancelled' || error?.message?.includes('CANCELLED') || error?.message?.includes('idle stream')) {
          return; // Ignore idle stream disconnects
        }
        console.error("Error listening to vehicles:", error);
      });
    } else {
      setAvailableVehicles([]);
      setSelectedVehicleIds([]);
      setAppointment(prev => ({ ...prev, vehicleInfo: "", vin: "" }));
    }

    return () => {
      if (unsubscribeVehicles) unsubscribeVehicles();
    };
  }, [selectedCustomerId, clients, showAddDialog]);

  const isMounted = useRef(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (showAddDialog) {
      isMounted.current = true; // Mark as mounted once opened
      toast.success("Booking Form Opened");
      if (editingAppointment) {
        // Pre-fill for editing
        setActiveLeadId(editingAppointment.leadId || null);
        setSelectedCustomerId(editingAppointment.clientId || editingAppointment.customerId || "");
        setSelectedVehicleIds(editingAppointment.vehicleIds || (editingAppointment.vehicleId ? [editingAppointment.vehicleId] : []));
        setAppointmentAddress({ 
          address: editingAppointment.address || "", 
          lat: editingAppointment.latitude || 0, 
          lng: editingAppointment.longitude || 0,
          city: editingAppointment.city || "",
          state: editingAppointment.state || "",
          zipCode: editingAppointment.zipCode || "",
          placeId: editingAppointment.placeId || ""
        });
        setBaseAmount(editingAppointment.baseAmount || 0);
        setTravelFee(editingAppointment.travelFee || 0);
        setSelectedServices(editingAppointment.serviceSelections || []);
        setSelectedAddons(editingAppointment.addOnSelections || []);
        setWaiverAccepted(editingAppointment.waiverAccepted || false);
        setDiscount(editingAppointment.discountAmount || 0);
        setRedeemedPoints(editingAppointment.redeemedPoints || 0);
        setAppointmentStatus(editingAppointment.status || "scheduled");
        setRecordedDeposit(editingAppointment.depositRecord || null);
        
        if (editingAppointment.scheduledAt) {
          const date = editingAppointment.scheduledAt.toDate ? editingAppointment.scheduledAt.toDate() : new Date(editingAppointment.scheduledAt);
          if (isValidDate(date)) {
            setScheduledAtValue(safeFormat(date, "yyyy-MM-dd'T'HH:mm"));
          } else {
            setScheduledAtValue("");
          }
        }
        
        setAppointment(prev => ({
          ...prev,
          vehicleInfo: editingAppointment.vehicleInfo || "",
          vin: editingAppointment.vin || "",
          vehicleSize: editingAppointment.vehicleSize || "medium"
        }));
      }
    } else {
      if (!isMounted.current) {
        isMounted.current = true;
        return;
      }
      timeoutId = setTimeout(() => {
        setIsAddressManual(false);
        setIsRecurring(false);
        setRecurringFrequency("weekly");
        setRecurringInterval(1);
        setRecurringEndDate("");
        setRecurringOccurrences("");
        setDiscount(0);
        setRedeemedPoints(0);
        setCouponCode("");
        setSelectedServices([]);
        setSelectedAddons([]);
        setWaiverAccepted(false);
        setAppointmentAddress({ address: "", lat: 0, lng: 0, city: "", state: "", zipCode: "", placeId: "" });
        setSelectedCustomerId("");
        setAppointment(prev => ({ 
          ...prev, 
          vehicleInfo: "", 
          vin: "", 
          vehicleSize: "medium" 
        }));
        setBaseAmount(0);
        setTravelFee(0);
        setScheduledAtValue("");
        setAppointmentStatus("scheduled");
        setActiveLeadId(null);
        setEditingAppointment(null);
        setRecordedDeposit(null);
      }, 300); // clear after close animation
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [showAddDialog, editingAppointment, settings]);

  const [calculatedDeposit, setCalculatedDeposit] = useState(0);
  const [isRiskyClient, setIsRiskyClient] = useState(false);
  const [recordedDeposit, setRecordedDeposit] = useState<{amount: number, method: string, timestamp: Date} | null>(null);
  const [activeDepositMethod, setActiveDepositMethod] = useState("Cash");
  const [activeDepositAmount, setActiveDepositAmount] = useState<number | string>(0);

  useEffect(() => {
    let total = 0;
    let depositTotal = 0;
    const client = clients.find(c => c.id === selectedCustomerId);
    const isVIP = client?.isVIP;
    const vipSettings = client?.vipSettings;

    const riskVal = client?.riskLevel || client?.risk_level || client?.riskStatus || client?.clientRiskLevel || client?.riskManagement?.level;
    setIsRiskyClient(Boolean(riskVal));

    // If no vehicles are selected, we still want to calculate for at least one "virtual" vehicle 
    // using the manual vehicle size selection.
    const vehiclesToProcess = selectedVehicleIds.length > 0 ? selectedVehicleIds : [null];

    vehiclesToProcess.forEach(vId => {
      selectedServices.forEach(selection => {
        // If the selection is tied to a specific vehicle, only apply it to that vehicle
        if (selection.vehicleId && selection.vehicleId !== vId) return;
        // If vehicles are selected but this selection has no vehicleId, skip it (it shouldn't happen with the new UI)
        if (!selection.vehicleId && vId !== null && selectedVehicleIds.length > 0) return;

        const service = services.find(s => s.id === selection.id);
        if (service) {
          let vSize = appointment.vehicleSize;
          if (vId) {
            const v = availableVehicles.find(av => av.id === vId);
            if (v?.size) vSize = v.size;
          }
          
          let price = service.pricingBySize?.[vSize] || service.basePrice || 0;
          
          if (isVIP && vipSettings) {
            let vipPrice = undefined;
            if (vId && vipSettings.vipVehiclePricing?.[vId]?.[service.id]) {
              vipPrice = vipSettings.vipVehiclePricing[vId][service.id];
            } else if (vipSettings.customServicePricing?.[service.id]) {
              vipPrice = vipSettings.customServicePricing[service.id];
            }
            if (vipPrice !== undefined) price = vipPrice;
          }
          
          const serviceTotal = price * selection.qty;
          total += serviceTotal;

          if (service.depositRequired) {
            if (service.depositType === "percentage") {
              depositTotal += serviceTotal * ((service.depositAmount || 0) / 100);
            } else {
              depositTotal += (service.depositAmount || 0) * selection.qty;
            }
          }
        }
      });
      
      selectedAddons.forEach(selection => {
        const addon = addons.find(a => a.id === selection.id);
        if (addon) {
          total += (addon.price || 0) * selection.qty;
        }
      });
    });
    
    setBaseAmount(total);
    
    let finalDeposit = depositTotal;
    if (Boolean(riskVal) && depositTotal === 0) {
      finalDeposit = total * 0.25;
    }
    setCalculatedDeposit(finalDeposit);
    setActiveDepositAmount(finalDeposit);
  }, [selectedServices, selectedAddons, appointment.vehicleSize, services, addons, selectedCustomerId, clients, selectedVehicleIds, availableVehicles]);

  // After Hours Fee Calculation Display
  useEffect(() => {
    if (!scheduledAtValue || !settings?.businessHours) {
      setIsAfterHoursDisplay(false);
      setAfterHoursFeeDisplay(0);
      return;
    }

    const startAt = new Date(scheduledAtValue);
    const totalDuration = selectedServices.reduce((acc, s) => {
      const service = services.find(srv => srv.id === s.id);
      return acc + (service?.estimatedDuration || 120) * s.qty;
    }, 0);

    let isAfterHours = false;
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = daysOfWeek[startAt.getDay()];
    const daySettings = (settings.businessHours as any)[dayName];
    const allowAfterHours = settings.businessHours.allowAfterHours || false;
    
    if (daySettings) {
      if (!daySettings.isOpen) {
        isAfterHours = true;
      } else {
        const apptStartStr = safeFormat(startAt, "HH:mm");
        const apptEndAt = new Date(startAt.getTime() + totalDuration * 60000);
        const apptEndStr = safeFormat(apptEndAt, "HH:mm");
        
        if (apptStartStr < daySettings.openTime || apptEndStr > daySettings.closeTime) {
          isAfterHours = true;
        }
      }
    }

    setIsAfterHoursDisplay(isAfterHours);
    if (isAfterHours && allowAfterHours) {
      setAfterHoursFeeDisplay(settings.businessHours.afterHoursFeeAmount || 0);
    } else {
      setAfterHoursFeeDisplay(0);
    }
  }, [scheduledAtValue, selectedServices, services, settings?.businessHours]);

  const handleAddressSelect = async (address: string, lat: number, lng: number, structured?: any) => {
    let finalLat = lat;
    let finalLng = lng;

    if (lat === 0 && address) {
      try {
        // Use geocodeAddress service for more robust geocoding and better error handling
        const coords = await geocodeAddress(address);
        finalLat = coords.lat;
        finalLng = coords.lng;
      } catch (error: any) {
        console.error("Geocoding failed in handleAddressSelect:", error);
        toast.error(`Geocoding failed: ${error.message || "Please enter coordinates manually or try again."}`);
      }
    }

    setAppointmentAddress({ 
      address, 
      lat: finalLat, 
      lng: finalLng,
      city: structured?.city || "",
      state: structured?.state || "",
      zipCode: structured?.zipCode || "",
      placeId: structured?.placeId || ""
    });
  };

  const handleApplyCoupon = async () => {
    const amount = baseAmount;
    const coupon = await validateCoupon(couponCode, amount);
    if (coupon) {
      const d = calculateDiscount(coupon, amount);
      setDiscount(d);
      toast.success(`Coupon applied! -$${d}`);
    } else {
      toast.error("Invalid or expired coupon");
      setDiscount(0);
    }
  };

  const handleRedeemPoints = async () => {
    if (!selectedCustomerId) {
      toast.error("Select a client first");
      return;
    }
    const client = clients.find(c => c.id === selectedCustomerId);
    if (!client || client.loyaltyPoints < 100) {
      toast.error("Insufficient points (min 100)");
      return;
    }
    
    try {
      const d = await redeemLoyaltyPoints(selectedCustomerId, 100);
      setRedeemedPoints(prev => prev + d);
      toast.success(`Redeemed 100 points for $${d} off!`);
    } catch (error) {
      toast.error("Failed to redeem points");
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsCreating(true);
    const formData = new FormData(e.currentTarget);
    
    const clientId = selectedCustomerId;
    const client = clients.find(c => c.id === clientId);
    
    // After-Hours Logic
    let isAfterHours = false;
    let afterHoursFee = 0;
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const startAt = scheduledAtValue ? new Date(scheduledAtValue) : new Date(formData.get("scheduledAt") as string);
    const dayName = daysOfWeek[startAt.getDay()];
    const daySettings = (settings?.businessHours as any)?.[dayName];
    const allowAfterHours = settings?.businessHours?.allowAfterHours || false;

    const totalDuration = selectedServices.reduce((acc, s) => {
      const service = services.find(srv => srv.id === s.id);
      return acc + (service?.estimatedDuration || 0) * s.qty;
    }, 0) + selectedAddons.reduce((acc, a) => {
      const addon = addons.find(ad => ad.id === a.id);
      return acc + (addon?.estimatedDuration || 0) * a.qty;
    }, 0);
    
    // Conflict Check
    const isConflict = appointments.some(appt => {
      if (editingAppointment && appt.id === editingAppointment.id) return false;
      const apptStart = appt.scheduledAt?.toDate ? appt.scheduledAt.toDate() : new Date(appt.scheduledAt);
      const apptEnd = addMinutes(apptStart, appt.estimatedDuration || 120);
      const newEnd = addMinutes(startAt, totalDuration);
      return (startAt < apptEnd && newEnd > apptStart);
    });

    if (isConflict && profile?.id) {
       createNotification({
        userId: profile.id,
        title: "Tactical Conflict Warning",
        message: `Deployment for ${client?.firstName || "Customer"} overlaps with an existing mission.`,
        type: "system",
        relatedId: clientId,
        relatedType: "client"
      });
    }

    if (daySettings) {
      if (!daySettings.isOpen) {
        isAfterHours = true;
      } else {
        const apptStartStr = safeFormat(startAt, "HH:mm");
        const apptEndAt = new Date(startAt.getTime() + totalDuration * 60000);
        const apptEndStr = safeFormat(apptEndAt, "HH:mm");
        
        if (apptStartStr < daySettings.openTime || apptEndStr > daySettings.closeTime) {
          isAfterHours = true;
        }
      }
    }

    if (isAfterHours && !allowAfterHours) {
      setIsCreating(false);
      return toast.error(`Booking outside business hours is currently disabled in your settings.`);
    }

    if (isAfterHours && allowAfterHours) {
      afterHoursFee = settings?.businessHours?.afterHoursFeeAmount || 0;
    }

    // Use the calculated baseAmount state instead of reading from formData to ensure VIP overrides are preserved
    const totalAmount = baseAmount + travelFee + afterHoursFee;
    const finalAmount = totalAmount - discount - redeemedPoints;
    
    const vehiclesToProcess = selectedVehicleIds.length > 0 ? selectedVehicleIds : [null];
    
    const serviceSelections = selectedServices.map(s => {
      const service = services.find(srv => srv.id === s.id);
      let totalServicePrice = 0;
      
      const vehiclesForThisService = s.vehicleId ? [s.vehicleId] : (selectedVehicleIds.length > 0 ? selectedVehicleIds : [null]);
      
      vehiclesForThisService.forEach(vId => {
        let vSize = appointment.vehicleSize;
        if (vId) {
          const v = availableVehicles.find(av => av.id === vId);
          if (v?.size) vSize = v.size;
        }
        
        let price = service?.pricingBySize?.[vSize] || service?.basePrice || 0;
        
        if (client?.isVIP && client?.vipSettings) {
          let vipPrice = undefined;
          if (vId && client.vipSettings.vipVehiclePricing?.[vId]?.[s.id]) {
            vipPrice = client.vipSettings.vipVehiclePricing[vId][s.id];
          } else if (client.vipSettings.customServicePricing?.[s.id]) {
            vipPrice = client.vipSettings.customServicePricing[s.id];
          }
          if (vipPrice !== undefined) price = vipPrice;
        }
        totalServicePrice += price * s.qty;
      });

      return {
        id: s.id,
        vehicleId: s.vehicleId,
        qty: s.qty * vehiclesForThisService.length,
        price: totalServicePrice / (s.qty * vehiclesForThisService.length)
      };
    });

    const addOnSelections = selectedAddons.map(a => {
      const addon = addons.find(ad => ad.id === a.id);
      return {
        id: a.id,
        qty: a.qty,
        price: addon?.price || 0
      };
    });

    const totalBuffer = selectedServices.reduce((acc, s) => {
      const service = services.find(srv => srv.id === s.id);
      return acc + (service?.bufferTimeMinutes || 0);
    }, 0) + selectedAddons.reduce((acc, a) => {
      const addon = addons.find(ad => ad.id === a.id);
      return acc + (addon?.bufferTimeMinutes || 0);
    }, 0);

    // Conflict detection logic
    const appointmentStart = new Date(formData.get("scheduledAt") as string);
    if (!isValidDate(appointmentStart)) {
      toast.error("Please select a valid mission start time.");
      setIsCreating(false);
      return;
    }
    const appointmentEnd = addHours(appointmentStart, (totalDuration + totalBuffer) / 60);

    const hasTimeBlockConflict = timeBlocks.some(block => {
      const apptDateIso = safeFormat(appointmentStart, "yyyy-MM-dd");
      if (block.date !== apptDateIso && (!block.endDate || apptDateIso > block.endDate || apptDateIso < block.date)) {
        return false;
      }
      if (block.type === 'full_day') return true;
      if (block.startTime && block.endTime) {
        const blockStart = new Date(`${apptDateIso}T${block.startTime}`);
        const blockEnd = new Date(`${apptDateIso}T${block.endTime}`);
        return (appointmentStart < blockEnd && appointmentEnd > blockStart);
      }
      return false;
    });

    if (hasTimeBlockConflict) {
      toast.error("This time is unavailable (blocked)");
      setIsCreating(false);
      return;
    }

    const hasGoogleConflict = googleEvents.some(event => {
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);
      return (appointmentStart < eventEnd && appointmentEnd > eventStart);
    });

    const hasAppointmentConflict = appointments.some(app => {
      if (editingAppointment && app.id === editingAppointment.id) return false;
      const appStart = app.scheduledAt?.toDate ? app.scheduledAt.toDate() : new Date(app.scheduledAt);
      const appEnd = addHours(appStart, (app.estimatedDuration || 120) / 60);
      return (appointmentStart < appEnd && appointmentEnd > appStart);
    });
    
    const minBufferMs = 30 * 60 * 1000;
    const hasBufferConflict = appointments.some(app => {
      if (editingAppointment && app.id === editingAppointment.id) return false;
      const appStart = app.scheduledAt?.toDate ? app.scheduledAt.toDate() : new Date(app.scheduledAt);
      const appEnd = addHours(appStart, (app.estimatedDuration || 120) / 60);
      const appointmentStartBuffered = new Date(appointmentStart.getTime() - minBufferMs);
      const appointmentEndBuffered = new Date(appointmentEnd.getTime() + minBufferMs);
      return (appointmentStartBuffered < appEnd && appointmentEndBuffered > appStart);
    });

    if (hasTimeBlockConflict || hasGoogleConflict || hasAppointmentConflict) {
      toast.error(
        hasTimeBlockConflict ? "Temporal conflict detected with a blocked time." :
        hasGoogleConflict ? "Temporal conflict detected with a Google Calendar event." :
        "Temporal conflict detected with an existing deployment."
      );
      setIsCreating(false);
      return;
    }
    
    if (hasBufferConflict && !hasAppointmentConflict) {
      toast.warning("Warning: Insufficient travel/setup time (under 30 minutes).", { duration: 5000 });
      // Do not block, just warn.
    }

    const jobNum = formData.get("jobNum") as string || "";
    let finalJobNum = jobNum;

    if (!jobNum) {
      // Auto-generate job number
      const appointmentsQuery = query(collection(db, "appointments"), orderBy("createdAt", "desc"), limit(100));
      const snapshot = await getDocs(appointmentsQuery);
      const existingJobNums = snapshot.docs
        .map(doc => doc.data().jobNum as string)
        .filter(Boolean);
      
      let maxNum = 1000;
      existingJobNums.forEach(jn => {
        const match = jn.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxNum) maxNum = num;
        }
      });
      finalJobNum = `JOB${maxNum + 1}`;
    }

    const seriesId = editingAppointment?.recurringInfo?.seriesId || Math.random().toString(36).substring(7);

    const appointmentData: any = {
      clientId,
      customerId: clientId,
      customerName: getClientDisplayName(client),
      customerPhone: client?.phone || "",
      customerEmail: client?.email || "",
      customerType: "client",
      vendorId: null,
      vehicleIds: selectedVehicleIds,
      vehicleId: selectedVehicleIds[0] || null,
      vehicleNames: selectedVehicleIds.map(id => {
        const v = availableVehicles.find(v => v.id === id);
        return v ? `${v.year} ${v.make} ${v.model}` : (appointment.vehicleInfo || "Unknown Asset");
      }),
      vehicleInfo: selectedVehicleIds.length > 0 
        ? selectedVehicleIds.map(id => {
            const v = availableVehicles.find(v => v.id === id);
            return v ? `${v.year} ${v.make} ${v.model}` : "";
          }).join(", ")
        : appointment.vehicleInfo,
      address: appointmentAddress.address,
      city: appointmentAddress.city,
      state: appointmentAddress.state,
      zipCode: appointmentAddress.zipCode,
      placeId: appointmentAddress.placeId,
      latitude: appointmentAddress.lat,
      longitude: appointmentAddress.lng,
      scheduledAt: startAt,
      status: appointmentStatus,
      jobNum: finalJobNum,
      baseAmount: baseAmount,
      travelFee: travelFee,
      discountAmount: discount + redeemedPoints,
      totalAmount: finalAmount,
      depositAmount: calculatedDeposit,
      depositPaid: false,
      cancellationFeeEnabled,
      cancellationFeeAmount,
      cancellationFeeType,
      cancellationCutoffHours,
      cancellationStatus: "none",
      reminders: (() => {
        const existing = editingAppointment?.reminders || {};
        const oldTime = editingAppointment?.scheduledAt?.toDate ? editingAppointment.scheduledAt.toDate().getTime() : 
                        (editingAppointment?.scheduledAt ? new Date(editingAppointment.scheduledAt).getTime() : 0);
        const newTime = startAt.getTime();
        
        if (editingAppointment && oldTime === newTime) {
          return existing;
        }
        return {
          ...existing,
          twentyFourHour: null,
          twoHour: null
        };
      })(),
      serviceIds: selectedServices.map(s => s.id),
      serviceNames: services.filter(s => selectedServices.some(sel => sel.id === s.id)).map(s => s.name),
      serviceSelections,
      addOnIds: selectedAddons.map(a => a.id),
      addOnNames: addons.filter(a => selectedAddons.some(sel => sel.id === a.id)).map(a => a.name),
      addOnSelections,
      technicianId: profile?.uid,
      technicianName: profile?.displayName,
      waiverAccepted,
      estimatedDuration: totalDuration,
      overrideBufferTimeMinutes: totalBuffer,
      totalDurationMinutes: totalDuration,
      totalBufferMinutes: totalBuffer,
      recurringInfo: isRecurring ? {
        frequency: recurringFrequency,
        interval: recurringInterval,
        endDate: recurringEndDate ? new Date(recurringEndDate) : null,
        occurrences: recurringOccurrences || null,
        seriesId: seriesId
      } : null,
      updatedAt: serverTimestamp(),
      leadId: activeLeadId || null,
      afterHoursRecord: isAfterHours ? {
        isAfterHours: true,
        afterHoursFee,
        afterHoursReason: "Time selected falls outside standard operating hours.",
        businessHoursSnapshot: settings?.businessHours || null
      } : null,
      depositRecord: recordedDeposit || null
    };

    // Helper to sync with Google Calendar
    const syncWithGoogle = async (data: any, existingId?: string) => {
      try {
        const event = {
          summary: `Job ${data.jobNum || ""} - ${data.customerName}`,
          location: data.address,
          description: `Services: ${data.serviceNames.join(", ")}\nClient: ${data.customerName} (${data.customerPhone})\nNotes: ${data.notes || "None"}`,
          start: { dateTime: data.scheduledAt.toISOString() },
          end: { dateTime: addHours(data.scheduledAt, (data.totalDurationMinutes + data.totalBufferMinutes) / 60).toISOString() }
        };
        if (existingId) return await updateGoogleEvent(existingId, event);
        return await createGoogleEvent(event);
      } catch (e) {
        console.error("Google Sync failed:", e);
        return null;
      }
    };

    try {
      if (editingAppointment) {
        if (editingAppointment._editSeries && editingAppointment.recurringInfo?.seriesId) {
          const q = query(
            collection(db, "appointments"), 
            where("recurringInfo.seriesId", "==", editingAppointment.recurringInfo.seriesId)
          );
          const snapshot = await getDocs(q);
          const batch = writeBatch(db);
          
          snapshot.docs.forEach(docSnap => {
            const { scheduledAt, updatedAt, createdAt, ...rest } = appointmentData;
            batch.update(docSnap.ref, {
              ...rest,
              updatedAt: serverTimestamp()
            });
          });
          
          await batch.commit();
          toast.success("Entire series updated!");
        } else {
          const smsData = {
            clientName: appointmentData.customerName || "Customer",
            businessName: settings?.businessName || "DetailFlow",
            appointmentDate: safeFormat(startAt, "MMM do, yyyy"),
            appointmentTime: safeFormat(startAt, "h:mm a"),
            serviceName: appointmentData.serviceNames?.length ? appointmentData.serviceNames.join(", ") : "service",
            vehicle: appointmentData.vehicleNames?.length ? appointmentData.vehicleNames[0] : ""
          };

          const gRes = await syncWithGoogle(appointmentData, editingAppointment.googleEventId);
          if (gRes?.id) appointmentData.googleEventId = gRes.id;
          await updateDoc(doc(db, "appointments", editingAppointment.id), appointmentData);
          
          await createNotification({
            userId: profile!.id,
            title: "Appointment Updated",
            message: `Updated booking for ${appointmentData.customerName} on ${safeFormat(startAt, "MMM do")}`,
            type: "booking",
            relatedId: editingAppointment.id,
            relatedType: "appointment"
          });
          
          if (client?.phone) {
            messagingService.sendTemplateSms(
              client.phone,
              "updated",
              smsData,
              editingAppointment.id,
              client.id
            ).catch(e => console.error("Update SMS failed:", e));
          }

          toast.success("Appointment updated!");
        }
      } else {
        if (isRecurring) {
          const occurrences: Date[] = [startAt];
          let currentDate = startAt;
          const maxLimit = recurringOccurrences || 52;
          const endD = recurringEndDate ? endOfDay(new Date(recurringEndDate)) : null;

          while (occurrences.length < maxLimit) {
            let nextDate: Date;
            switch (recurringFrequency) {
              case "daily":
                nextDate = addDays(currentDate, recurringInterval);
                break;
              case "weekly":
                nextDate = addWeeks(currentDate, recurringInterval);
                break;
              case "biweekly":
                nextDate = addWeeks(currentDate, recurringInterval * 2);
                break;
              case "monthly":
                nextDate = addMonths(currentDate, recurringInterval);
                break;
              default:
                nextDate = addWeeks(currentDate, recurringInterval);
            }

            if (endD && isBefore(endD, nextDate)) break;
            occurrences.push(nextDate);
            currentDate = nextDate;
          }

          const savePromises = occurrences.map((date, index) => {
            return addDoc(collection(db, "appointments"), {
              ...appointmentData,
              scheduledAt: date,
              createdAt: serverTimestamp(),
              recurringInfo: {
                ...appointmentData.recurringInfo,
                occurrenceIndex: index + 1,
                totalOccurrences: occurrences.length
              }
            });
          });

          await Promise.all(savePromises);
          
          // Trigger Notification for series
          await createNotification({
            userId: profile!.id,
            title: "Recurring Series Initialized",
            message: `Created ${occurrences.length} tactical deployments for ${appointmentData.customerName}`,
            type: "booking",
            relatedId: appointmentData.clientId || appointmentData.customerId,
            relatedType: "appointment"
          });

          toast.success(`Created ${occurrences.length} recurring appointments!`);
        } else {
          const gRes = await syncWithGoogle(appointmentData);
          if (gRes?.id) appointmentData.googleEventId = gRes.id;
          
          appointmentData.reminders = {
            ...appointmentData.reminders,
            confirmation: "pending"
          };

          const docRef = await addDoc(collection(db, "appointments"), {
            ...appointmentData,
            createdAt: serverTimestamp(),
          });

          await createNotification({
            userId: profile!.id,
            title: "New Appointment",
            message: `New booking for ${appointmentData.customerName} on ${safeFormat(startAt, "MMM do")}`,
            type: "booking",
            relatedId: docRef.id,
            relatedType: "appointment"
          });

          // Attempt to send confirmation SMS
          if (client?.phone) {
            const smsData = {
              clientName: appointmentData.customerName || "Customer",
              businessName: settings?.businessName || "DetailFlow",
              appointmentDate: safeFormat(startAt, "MMM do, yyyy"),
              appointmentTime: safeFormat(startAt, "h:mm a"),
              serviceName: appointmentData.serviceNames?.length ? appointmentData.serviceNames.join(", ") : "service",
              vehicle: appointmentData.vehicleNames?.length ? appointmentData.vehicleNames[0] : ""
            };

            messagingService.sendTemplateSms(
              client.phone,
              "booked",
              smsData,
              docRef.id,
              client.id
            ).then(async (res: any) => {
              if (res.success) {
                await updateDoc(docRef, { "reminders.confirmation": "sent" });
              } else {
                await updateDoc(docRef, { "reminders.confirmation": "failed" });
              }
            }).catch(async (e) => {
              await updateDoc(docRef, { "reminders.confirmation": "failed" });
            });
          } else {
             await updateDoc(docRef, { "reminders.confirmation": "skipped" });
          }

          // Trigger Notification
          await createNotification({
            userId: profile!.id,
            title: "New Tactical Deployment",
            message: `New booking for ${appointmentData.customerName} scheduled for ${safeFormat(startAt, "MMM d, h:mm a")}`,
            type: "booking",
            relatedId: appointmentData.clientId || appointmentData.customerId,
            relatedType: "appointment"
          });

          if (activeLeadId) {
            await updateDoc(doc(db, "leads", activeLeadId), {
              status: "converted",
              convertedAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }

          toast.success("Appointment created!");
        }
      }
      setShowAddDialog(false);
      setEditingAppointment(null);
    } catch (error) {
      console.error("Error saving appointment:", error);
      toast.error("Failed to save appointment");
    } finally {
      setIsCreating(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredAppointments.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredAppointments.map(app => app.id));
    }
  };

  const filteredAppointments = appointments.filter(app => {
    const normalizedSearch = searchTerm.toLowerCase().trim();
    if (!normalizedSearch) return true;

    const customerName = (app.customerName || "").toLowerCase();
    const vehicleInfo = (app.vehicleInfo || "").toLowerCase();
    const vin = (app.vin || "").toLowerCase();
    const jobNum = (app.jobNum || "").toLowerCase();

    return customerName.includes(normalizedSearch) ||
           vehicleInfo.includes(normalizedSearch) ||
           vin.includes(normalizedSearch) ||
           jobNum.includes(normalizedSearch);
  }).sort((a, b) => {
    const timeA = a.scheduledAt?.toMillis ? a.scheduledAt.toMillis() : (a.scheduledAt as unknown as number) || 0;
    const timeB = b.scheduledAt?.toMillis ? b.scheduledAt.toMillis() : (b.scheduledAt as unknown as number) || 0;
    return timeA - timeB;
  });

  useEffect(() => {
    if (date) {
      optimizeRoute(date)
        .then(({ stops, error }) => {
          setOptimizedStops(stops);
          if (error) toast.error(error);
        })
        .catch(error => {
          console.error("Error optimizing route in Calendar:", error);
          toast.error("An unexpected error occurred while optimizing the route.");
        });
    }
  }, [date, appointments]);

  const validateCoupon = async (code: string, amount: number) => {
    if (!code) return null;
    const q = query(collection(db, "coupons"), where("code", "==", code.toUpperCase()), where("isActive", "==", true));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const coupon = snap.docs[0].data();
    if (coupon.minPurchase && amount < coupon.minPurchase) return null;
    if (coupon.expiryDate && coupon.expiryDate.toDate() < new Date()) return null;
    return coupon;
  };

  const calculateDiscount = (coupon: any, amount: number) => {
    if (coupon.type === "percentage") return (amount * coupon.value) / 100;
    return coupon.value;
  };

  const redeemLoyaltyPoints = async (clientId: string, points: number) => {
    const d = points * 0.1; // $10 for 100 points
    return d;
  };

  const dayAppointments = appointments.filter(app => {
    if (!date || !app.scheduledAt) return false;
    const appDate = app.scheduledAt.toDate ? app.scheduledAt.toDate() : new Date(app.scheduledAt);
    return isSameDay(appDate, date);
  });

  const dayTimeBlocks = timeBlocks.filter(block => {
    if (!date || !block.date) return false;
    const dateIso = safeFormat(date, "yyyy-MM-dd");
    if (block.type === 'full_day') {
      const startIso = block.date;
      const endIso = block.endDate || block.date;
      return dateIso >= startIso && dateIso <= endIso;
    }
    return block.date === dateIso;
  });

  const dayGoogleEvents = googleEvents.filter(event => {
    if (!date || !event.start) return false;
    const startObj = event.start;
    const eventDate = new Date(startObj.dateTime || startObj.date);
    return isSameDay(eventDate, date);
  });

  const handleDeleteAppointment = async (id: string, scope: "single" | "series" = "single") => {
    console.log("Attempting to delete job:", id, "scope:", scope);
    if (!id) {
      toast.error("Invalid job ID");
      return;
    }
    
    const app = appointments.find(a => a.id === id);

    // Optimistic Update
    const previousAppointments = [...appointments];
    if (scope === "series" && app?.recurringInfo?.seriesId) {
      setAppointments(prev => prev.filter(a => a.recurringInfo?.seriesId !== app.recurringInfo?.seriesId));
    } else {
      setAppointments(prev => prev.filter(a => a.id !== id));
    }

    try {
      if (scope === "series" && app?.recurringInfo?.seriesId) {
        const q = query(collection(db, "appointments"), where("recurringInfo.seriesId", "==", app.recurringInfo.seriesId));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.docs.forEach(docSnap => batch.delete(docSnap.ref));
        await batch.commit();
        toast.success("Entire series deleted successfully");
      } else {
        if (app?.googleEventId) {
          try { await deleteGoogleEvent(app.googleEventId); } catch(e) { console.error("Google delete failed:", e); }
        }
        await deleteDoc(doc(db, "appointments", id));
        toast.success("Job deleted successfully");
      }
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    } catch (error) {
      console.error("Error deleting job:", error);
      // Rollback
      setAppointments(previousAppointments);
      try {
        handleFirestoreError(error, OperationType.DELETE, `appointments/${id}`);
      } catch (err: any) {
        toast.error(`Failed to delete job: ${err.message}`);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setIsDeletingBulk(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.delete(doc(db, "appointments", id));
      });
      await batch.commit();
      toast.success(`Successfully deleted ${selectedIds.length} jobs`);
      setSelectedIds([]);
      setIsSelectionMode(false);
      setShowBulkDeleteConfirm(false);
    } catch (error) {
      console.error("Error in bulk delete:", error);
      toast.error("Failed to delete selected jobs");
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const newSelection = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
      if (newSelection.length === 0) setIsSelectionMode(false);
      return newSelection;
    });
  };

  const defaultStatusColors: Record<string, string> = {
    scheduled: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    confirmed: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    en_route: "bg-primary/20 text-primary border border-primary/30",
    in_progress: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
    arrived: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    completed: "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30",
    paid: "bg-zinc-400/20 text-zinc-300 border border-zinc-400/30",
    canceled: "bg-red-500/20 text-red-400 border border-red-500/30",
    no_show: "bg-rose-500/20 text-rose-400 border border-rose-500/30",
    waitlisted: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
  };

  const getStatusColor = (status: string, isVip?: boolean) => {
    let baseColor = settings?.calendarColors?.[status] || defaultStatusColors[status] || "bg-white/5 text-white/40 border border-white/5";
    if (isVip && settings?.calendarColors?.vip) {
      baseColor += " " + settings.calendarColors.vip;
    }
    return baseColor;
  };

  const getServiceGlow = (app: any) => {
    // Comprehensive service name detection
    const serviceName = (
      app.serviceNames?.[0] || 
      app.serviceName || 
      app.service || 
      app.services?.[0] || 
      app.selectedServices?.[0] || 
      app.serviceSelections?.[0]?.name || 
      app.jobType || 
      ""
    ).toString();
    const nameLower = serviceName.toLowerCase();
    
    if (settings?.serviceColors) {
      if (settings.serviceColors[serviceName]) return settings.serviceColors[serviceName];
      if (settings.serviceColors[nameLower]) return settings.serviceColors[nameLower];
      for (const [key, color] of Object.entries(settings.serviceColors)) {
        if (nameLower.includes(key.toLowerCase())) return color;
      }
    }

    if (nameLower.includes("mold") || nameLower.includes("biohazard")) return "shadow-glow-red border-red-500/40";
    if (nameLower.includes("ceramic") || nameLower.includes("coating") || nameLower.includes("protection") || nameLower.includes("gold")) return "shadow-glow-green border-green-500/40";
    if (nameLower.includes("interior") || nameLower.includes("purple")) return "shadow-[0_0_12px_rgba(168,85,247,0.3)] border-purple-500/40 opacity-90";
    if (nameLower.includes("exterior") || nameLower.includes("basic") || nameLower.includes("blue")) return "shadow-glow-blue border-blue-500/40";
    if (nameLower.includes("fleet") || nameLower.includes("vendor") || nameLower.includes("commercial") || nameLower.includes("green")) return "shadow-glow-green border-green-500/40";
    
    return "shadow-glow-blue/10 border-white/10";
  };

  const handleLongPress = (id: string) => {
    setIsSelectionMode(true);
    toggleSelect(id);
  };

  const CalendarEvent = ({ event }: { event: any }) => {
    const isDayView = calendarView === "day";
    const isAgendaView = calendarView === "agenda";

    if (isAgendaView) return null; // Handled by AgendaEvent

    if (event.type === 'more_indicator') {
      return (
        <div 
          className="text-[9px] font-black uppercase text-primary bg-primary/5 rounded-md px-1.5 py-0.5 w-fit cursor-pointer hover:bg-primary/10 transition-all border border-primary/10 flex items-center gap-1 leading-none shadow-sm"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedDayEvents({ day: event.day, events: event.allDayEvents });
          }}
        >
          <Sparkles className="w-2.5 h-2.5" />
          {event.title}
        </div>
      );
    }

    if (event.type === 'block') {
      return (
        <div className="text-[10px] font-black uppercase tracking-widest p-2 overflow-hidden h-full flex items-center bg-[#121212]/80 text-[#A0A0A0] rounded-xl border border-white/5 backdrop-blur-sm shadow-xl">
          <Lock className="w-3 h-3 inline mr-2 shrink-0 text-zinc-500" />
          <span className="truncate">{event.title}</span>
        </div>
      );
    }
    
    if (event.type === 'google') {
      return (
        <div className="text-[10px] font-black uppercase tracking-widest p-2 overflow-hidden text-blue-400 bg-blue-500/10 rounded-xl h-full flex items-center border border-blue-500/20 backdrop-blur-sm shadow-xl">
          <CalendarIcon className="w-3 h-3 inline mr-2 shrink-0" />
          <span className="truncate">{event.title}</span>
        </div>
      );
    }

    const app = event.resource;
    const appStopIndex = optimizedStops.findIndex(s => s.id === app.id);
    let travelWarning = false;
    if (appStopIndex !== -1 && appStopIndex < optimizedStops.length - 1) {
      if ((optimizedStops[appStopIndex + 1].travelTimeFromPrevious || 0) / 60 > 20) travelWarning = true;
    }

    const isRecurring = app.isRecurring || app.recurringInfo || app.recurringParentId;
    const riskLevel = app.clientRiskLevel;

    return (
      <div 
        className={cn(
          "w-full flex flex-col p-2.5 overflow-hidden transition-all duration-300 relative group rounded-xl border-l-[3px] border-l-primary bg-[#121212]/95 backdrop-blur-md",
          "hover:bg-zinc-800/95 hover:scale-[1.01] active:scale-[0.98]",
          "border border-white/5",
          getServiceGlow(app),
          riskLevel && "ring-1 ring-red-500/30 shadow-glow-red",
          isDayView ? "h-full gap-2" : "min-h-[90px] gap-1"
        )}
      >
        {/* Header: Name and Status */}
        <div className={cn(
          "flex items-start justify-between gap-2 overflow-hidden",
          !isDayView && "flex-col"
        )}>
          <div className="flex flex-col gap-0.5 overflow-hidden w-full">
            <span className={cn(
              "text-[10px] sm:text-[11px] font-black uppercase text-white tracking-tight leading-tight flex items-center gap-1.5",
              !isDayView && "truncate"
            )}>
              {travelWarning && <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0" />}
              {isRecurring && <Repeat className="w-3 h-3 text-blue-400 shrink-0" />}
              {riskLevel && <ShieldAlert className="w-3 h-3 text-red-500 shrink-0" />}
              <span className="truncate">{event.title}</span>
            </span>
            {riskLevel && (
              <span className="text-[7px] font-black uppercase tracking-widest text-red-500/80">
                High Risk Profile
              </span>
            )}
          </div>
          
          <Badge className={cn(
            "text-[7px] font-black px-1.5 py-0 border-none uppercase tracking-widest shrink-0 whitespace-nowrap", 
            getStatusColor(app.status || 'scheduled', app.isVip)
          )}>
            {app.status?.replace("_", " ")}
          </Badge>
        </div>
        
        {/* Time and metadata */}
        <div className="flex flex-col gap-1 mt-auto">
           <div className="flex items-center gap-1.5 text-[9px] text-white/50 font-bold uppercase tracking-widest">
             <Clock className="w-3 h-3 shrink-0 text-white/30" />
             {safeFormat(event.start, "h:mm a")}
           </div>
           
           {isDayView && (
             <>
               {app.address && (
                 <div className="flex items-center gap-1.5 text-[8px] text-white/30 font-medium uppercase tracking-wider truncate">
                   <MapPin className="w-3 h-3 shrink-0" />
                   <span className="truncate">{app.address}</span>
                 </div>
               )}
               <div className="mt-2 text-[7px] font-black uppercase tracking-[0.2em] text-primary/60 opacity-0 group-hover:opacity-100 transition-opacity">
                 Tap to open intelligence hub
               </div>
             </>
           )}
        </div>
      </div>
    );
  };

  const AgendaEvent = ({ event }: { event: any }) => {
    const app = event.resource;
    return (
      <div className="flex items-center justify-between gap-6 w-full py-2">
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <span className="font-black text-white text-sm uppercase tracking-tight truncate">{event.title}</span>
          {app?.address && (
            <div className="flex items-center gap-1.5 text-[10px] text-white/40 truncate">
              <MapPin className="w-3 h-3 shrink-0 text-primary/60" />
              <span className="truncate">{app.address}</span>
            </div>
          )}
        </div>
        {event.type === 'appointment' && (
          <Badge className={cn("text-[8px] font-black px-3 py-1 border-none uppercase tracking-[0.1em] shrink-0", getStatusColor(app.status || 'scheduled', app.isVip))}>
            {app.status?.replace("_", " ")}
          </Badge>
        )}
      </div>
    );
  };

  const AgendaTime = ({ label }: { label: string }) => (
    <div className="text-white/80 font-black uppercase tracking-widest text-[10px] whitespace-nowrap">
      {label}
    </div>
  );

  const AgendaDate = ({ label }: { label: string }) => (
    <div className="text-white font-black uppercase tracking-tighter text-sm whitespace-nowrap">
      {label}
    </div>
  );

  const eventPropGetter = (event: any) => {
    if (event.type === 'more_indicator') {
      return {
        className: "hidden",
        style: { display: 'none' }
      };
    }

    let backgroundColor = "transparent";
    let borderColor = "transparent";
    let borderLeft = "none";
    let className = "";

    if (event.type === 'block') {
      backgroundColor = "rgba(107, 114, 128, 0.1)";
      borderColor = "rgba(107, 114, 128, 0.2)";
      borderLeft = "3px solid #6b7280";
    } else if (event.type === 'google') {
      backgroundColor = "rgba(59, 130, 246, 0.1)";
      borderColor = "rgba(59, 130, 246, 0.2)";
      borderLeft = "3px solid #3b82f6";
    } else {
      className = getStatusColor(event.status || 'scheduled', event.resource?.isVip);
    }

    return {
      className: className,
      style: {
        backgroundColor: event.type !== 'appointment' ? backgroundColor : undefined,
        borderColor: event.type !== 'appointment' ? borderColor : undefined,
        borderLeft: event.type !== 'appointment' ? borderLeft : undefined,
        borderRadius: "12px",
        padding: 0,
        margin: 0,
        width: '100%',
        maxWidth: '100%',
        height: 'auto'
      }
    };
  };

  const [selectedDetailedApp, setSelectedDetailedApp] = useState<any>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<{ day: Date, events: any[] } | null>(null);
  const [navDialogApp, setNavDialogApp] = useState<any>(null);
  const [detailedAppVehicles, setDetailedAppVehicles] = useState<any[]>([]);

  // Lock scroll when navigation modal is open
  useEffect(() => {
    if (navDialogApp) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [navDialogApp]);

  useEffect(() => {
    if (selectedDetailedApp?.vehicleIds?.length > 0) {
      const fetchVehicles = async () => {
        try {
          const q = query(collection(db, "vehicles"), where("__name__", "in", selectedDetailedApp.vehicleIds));
          const snap = await getDocs(q);
          setDetailedAppVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
          console.error("Failed to fetch detailed app vehicles", e);
          setDetailedAppVehicles([]);
        }
      };
      fetchVehicles();
    } else {
      setDetailedAppVehicles([]);
    }
  }, [selectedDetailedApp?.vehicleIds]);


  const handleJobStatusUpdate = async (newStatus: string) => {
    if (!selectedDetailedApp) return;
    try {
      if (newStatus === 'arrived') {
        console.log(`Arrived clicked for appointmentId: ${selectedDetailedApp.id}`);
      }
      await updateDoc(doc(db, "appointments", selectedDetailedApp.id), { status: newStatus });
      setSelectedDetailedApp({ ...selectedDetailedApp, status: newStatus });
      setAppointments(prev => prev.map(a => a.id === selectedDetailedApp.id ? { ...a, status: newStatus } : a));
      toast.success(`Job marked as ${newStatus.replace('_', ' ')}`);

      // Trigger Notification
      if (profile?.id) {
        await createNotification({
          userId: profile.id,
          title: "Status Deployment Update",
          message: `${selectedDetailedApp.customerName} marked as ${newStatus.toUpperCase()}`,
          type: "booking",
          relatedId: selectedDetailedApp.id,
          relatedType: "appointment"
        });
      }

      // Trigger SMS
      const client = clients.find(c => c.id === (selectedDetailedApp.clientId || selectedDetailedApp.customerId));
      if (client?.phone) {
        const smsData = {
          clientName: selectedDetailedApp.customerName || "Customer",
          businessName: settings?.businessName || "DetailFlow",
          appointmentDate: selectedDetailedApp.scheduledAt?.toDate ? safeFormat(selectedDetailedApp.scheduledAt.toDate(), "MMM do, h:mm a") : "",
          serviceName: selectedDetailedApp.serviceNames?.join(", ") || "service",
          vehicle: selectedDetailedApp.vehicleNames?.[0] || ""
        };
        let templateType = newStatus;
        if (newStatus === 'en_route') templateType = 'on_the_way';
        if (newStatus === 'in_progress') templateType = 'started';

        messagingService.sendTemplateSms(
          client.phone,
          templateType,
          smsData,
          selectedDetailedApp.id,
          client.id
        ).catch(e => console.error("SMS trigger failed on status update:", e));
      }

      if (newStatus === 'arrived') {
        const appId = selectedDetailedApp.id;
        console.log(`Opening Deployment Intelligence for appointmentId: ${appId}`);
        setSelectedDetailedApp(null);
        navigate(`/calendar/${appId}`);
      }
    } catch (err) {
      console.error("Error updating status:", err);
      toast.error("Failed to update status");
    }
  };

  const groupedEventsByDay = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    events.forEach(evt => {
      const dayKey = safeFormat(evt.start, "yyyy-MM-dd");
      if (!grouped[dayKey]) grouped[dayKey] = [];
      grouped[dayKey].push(evt);
    });
    return grouped;
  }, [events]);

  const displayEvents = useMemo(() => {
    if (calendarView !== "month") return events;

    const currentMonth = date || new Date();
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    
    const result: any[] = [];
    Object.entries(groupedEventsByDay).forEach(([dayKey, dayEvts]) => {
      const dayDate = parseISO(dayKey);
      if (dayDate >= monthStart && dayDate <= monthEnd && dayEvts.length > 0) {
        // Prioritize showing an appointment as the primary visible event
        const primaryEvent = dayEvts.find(e => e.type === 'appointment') || dayEvts[0];
        result.push(primaryEvent);
      }
    });

    return result;
  }, [groupedEventsByDay, calendarView, date]);

  const monthDayPropGetter = (day: Date) => {
    if (calendarView === "month" && !isSameMonth(day, date || new Date())) {
      return {
        className: "opacity-0 pointer-events-none",
        style: {
          backgroundColor: 'transparent',
          border: 'none'
        }
      };
    }
    return {
      className: "relative overflow-hidden",
      style: {
        minHeight: "160px"
      }
    };
  };

  const MonthDateHeader = ({ label, date: dayDate }: any) => {
    if (!isSameMonth(dayDate, date || new Date())) return null;
    
    const dayKey = safeFormat(dayDate, "yyyy-MM-dd");
    const dayEvts = groupedEventsByDay[dayKey] || [];
    const moreCount = dayEvts.length - 1;

    return (
      <div className="flex items-center justify-between w-full px-3 py-2">
        <span className="rbc-button-link text-[11px] font-black text-white/40">{label}</span>
        {moreCount > 0 && (
          <div 
            className="text-[9px] font-black uppercase text-primary bg-primary/10 rounded-md px-2 py-1 cursor-pointer hover:bg-primary/20 transition-all border border-primary/20 flex items-center gap-1.5 leading-none shadow-sm z-50 whitespace-nowrap"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedDayEvents({ day: dayDate, events: dayEvts });
            }}
          >
            <Sparkles className="w-3 h-3" />
            +{moreCount} more
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full space-y-10 pb-24">
      <PageHeader 
        title="Mission SCHEDULE" 
        accentWord="SCHEDULE" 
        subtitle="Tactical Route & Deployment Management"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-card p-1.5 rounded-2xl border border-white/5 shadow-xl overflow-x-auto no-scrollbar max-w-full">
              <Button 
                variant={calendarView === "tactical" ? "secondary" : "ghost"} 
                size="sm" 
                onClick={() => setCalendarView("tactical")}
                className={cn(
                  "h-10 px-4 rounded-xl font-black uppercase tracking-widest text-[11px] transition-all shrink-0", 
                  calendarView === "tactical" ? "bg-primary text-white shadow-glow-blue" : "text-white/40 hover:text-white"
                )}
              >
                <MapPin className="w-4 h-4 mr-2" />
                Tactical Route
              </Button>
              <Button 
                variant={calendarView === "list" ? "secondary" : "ghost"} 
                size="sm" 
                onClick={() => setCalendarView("list")}
                className={cn(
                  "h-10 px-4 rounded-xl font-black uppercase tracking-widest text-[11px] transition-all shrink-0", 
                  calendarView === "list" ? "bg-primary text-white shadow-glow-blue" : "text-white/40 hover:text-white"
                )}
              >
                <List className="w-4 h-4 mr-2" />
                List
              </Button>
            </div>
            <Button 
              variant="outline" 
              className={cn("border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl px-6 h-12 font-bold uppercase tracking-widest text-[11px]", loading && "animate-spin")}
              onClick={() => fetchCalendarData(true)}
              disabled={loading}
            >
              <RefreshCcw className="w-4 h-4 mr-2 text-primary" />
              Sync Ops
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Recurring Action Dialog */}
        <AlertDialog open={!!recurringAction} onOpenChange={(open) => !open && setRecurringAction(null)}>
          <AlertDialogContent className="max-w-xl bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black">
            <AlertDialogHeader className="p-8 border-b border-white/5 bg-black/40">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <RefreshCw className="w-6 h-6" />
                </div>
                <div>
                  <AlertDialogTitle className="font-black text-2xl tracking-tighter text-white uppercase">
                    {recurringAction?.type === "edit" ? "Modify Recurring Sequence" : "Terminate Recurring Protocol"}
                  </AlertDialogTitle>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">Temporal Series Management</p>
                </div>
              </div>
            </AlertDialogHeader>
            <div className="p-8 space-y-6">
              <AlertDialogDescription className="text-gray-400 font-bold text-sm leading-relaxed">
                This deployment is part of a synchronized recurring series. Select the scope of the {recurringAction?.type === "edit" ? "modification" : "termination"} protocol.
              </AlertDialogDescription>
              
              <div className="grid grid-cols-1 gap-4">
                <Button 
                  className="h-16 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 shadow-sm transition-all hover:scale-[1.02]"
                  onClick={() => {
                    const app = recurringAction?.appointment;
                    if (recurringAction?.type === "edit") {
                      setEditingAppointment(app);
                      setShowAddDialog(true);
                    } else {
                      handleDeleteAppointment(app.id, "single");
                    }
                    setRecurringAction(null);
                  }}
                >
                  {recurringAction?.type === "edit" ? "Target This Deployment Only" : "Terminate This Deployment Only"}
                </Button>
                <Button 
                  className="h-16 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-primary text-white hover:bg-[#2A6CFF] shadow-glow-blue transition-all hover:scale-[1.02]"
                  onClick={() => {
                    const app = recurringAction?.appointment;
                    if (recurringAction?.type === "edit") {
                      setEditingAppointment({ ...app, _editSeries: true });
                      setShowAddDialog(true);
                    } else {
                      handleDeleteAppointment(app.id, "series");
                    }
                    setRecurringAction(null);
                  }}
                >
                  {recurringAction?.type === "edit" ? "Target Entire Temporal Series" : "Terminate Entire Temporal Series"}
                </Button>
              </div>

              <div className="flex justify-center pt-2">
                <Button 
                  variant="ghost"
                  className="text-gray-500 hover:text-white font-black uppercase tracking-widest text-[10px] h-10 px-8"
                  onClick={() => setRecurringAction(null)}
                >
                  Abort Action
                </Button>
              </div>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        {calendarView === "month" || calendarView === "week" || calendarView === "day" || calendarView === "agenda" ? (
          <Card className="lg:col-span-12 border-none shadow-xl bg-zinc-950 rounded-[2.5rem] p-6 h-auto min-h-[900px] transition-all duration-500 animate-in fade-in zoom-in-95 overflow-hidden">
            <div className="w-full overflow-x-auto no-scrollbar scroll-smooth">
              <div className="min-w-[900px] lg:min-w-0 h-full">
                <style>{`
                  .rbc-month-view {
                    border: none !important;
                    background: transparent !important;
                    min-height: 800px;
                    overflow: visible !important;
                  }
                  .rbc-month-row {
                    min-height: 180px !important;
                    overflow: visible !important;
                    border-bottom: 1px solid rgba(255,255,255,0.03) !important;
                  }
                  .rbc-row-content {
                    z-index: 2;
                    height: auto !important;
                  }
                  .rbc-row {
                    width: 100% !important;
                  }
                  .rbc-row-segment {
                    padding: 0 4px !important;
                  }
                  .rbc-event {
                    background: transparent !important;
                    border: none !important;
                    padding: 0 !important;
                    margin-bottom: 8px !important;
                    overflow: visible !important;
                  }
                  .rbc-event-content {
                    overflow: visible !important;
                  }
                  .rbc-day-bg {
                    border-left: 1px solid rgba(255,255,255,0.03) !important;
                  }
                  .rbc-off-range-bg {
                    background: transparent !important;
                    opacity: 0.05;
                  }
                  .rbc-header {
                    border-bottom: 1px solid rgba(255,255,255,0.05) !important;
                    padding: 12px 0 !important;
                    font-weight: 900 !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.1em !important;
                    font-size: 10px !important;
                    color: rgba(255,255,255,0.4) !important;
                  }
                  .rbc-today {
                    background: rgba(255,255,255,0.02) !important;
                  }
                  .rbc-date-cell {
                    padding: 0 !important;
                    text-align: left !important;
                  }
                `}</style>
                <BigCalendar
                  localizer={localizer}
                  events={displayEvents}
                  startAccessor="start"
                  endAccessor="end"
                  className="h-[850px] font-sans"
                  popup={false}
                  // @ts-ignore
                  maxEvents={2}
                  dayPropGetter={monthDayPropGetter}
                  onSelectEvent={(event: any) => {
                    if (event.type === 'appointment') {
                      setSelectedDetailedApp(event.resource);
                    } else if (event.type === 'block') {
                      setEditingTimeBlock(event.resource);
                      setTimeBlockForm({
                        title: event.resource.title || "",
                        type: event.resource.type || "full_day",
                        date: event.resource.date || "",
                        endDate: event.resource.endDate || "",
                        startTime: event.resource.startTime || "",
                        endTime: event.resource.endTime || "",
                        notes: event.resource.notes || ""
                      });
                      setShowTimeBlockDialog(true);
                    }
                  }}
                  view={calendarView as any}
                  onView={(v) => setCalendarView(v as string)}
                  date={date || new Date()}
                  onNavigate={(d) => setDate(d)}
                  eventPropGetter={eventPropGetter}
                  components={{
                    event: CalendarEvent,
                    month: {
                      dateHeader: MonthDateHeader
                    },
                    agenda: {
                      event: AgendaEvent,
                      date: AgendaDate,
                      time: AgendaTime
                    }
                  }}
                />
              </div>
            </div>
          </Card>
        ) : calendarView === "tactical" ? (
          <>
            {/* Tactical Route Column */}
            <div className="lg:col-span-4 space-y-6 flex flex-col h-[850px]">
              <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden flex-1 flex flex-col">
                <CardHeader className="bg-black/40 border-b border-white/5 p-6 flex flex-row items-center justify-between shrink-0">
                  <div className="flex items-center gap-4">
                    <div>
                      <CardTitle className="text-lg font-black text-white tracking-tighter uppercase">Tactical Queue</CardTitle>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-0.5">{optimizedStops.length} Deployment Targets</p>
                    </div>
                    <div className="flex items-center bg-black/40 rounded-xl border border-white/5 p-1 ml-4">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-white/40 hover:text-white"
                        onClick={() => {
                          const newDate = subDays(date || new Date(), 1);
                          setDate(newDate);
                        }}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <div className="px-3 text-[10px] font-black text-white uppercase tracking-widest min-w-[100px] text-center">
                        {safeFormat(date || new Date(), "MMM d, yyyy")}
                      </div>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-white/40 hover:text-white"
                        onClick={() => {
                          const newDate = addDays(date || new Date(), 1);
                          setDate(newDate);
                        }}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10 text-white/40 hover:text-white"
                    onClick={async () => {
                      if (date) {
                        const { stops, error } = await optimizeRoute(date);
                        setOptimizedStops(stops);
                        if (error) toast.error(error); else toast.success("Tactical sync complete");
                      }
                    }}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent className="p-4 flex-1 overflow-y-auto no-scrollbar space-y-4">
                   {optimizedStops.length === 0 ? (
                     <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-20">
                       <MapPin className="w-12 h-12 mb-4" />
                       <p className="text-xs font-black uppercase tracking-widest">No Active Deployments</p>
                     </div>
                   ) : (
                     optimizedStops.map((stop, index) => (
                       <div 
                        key={stop.id} 
                        className={cn(
                          "p-4 rounded-2xl bg-white border border-border group cursor-pointer transition-all hover:border-primary/50",
                          selectedStop?.id === stop.id && "border-primary bg-primary/5 shadow-lg"
                        )}
                        onClick={() => setSelectedStop(stop)}
                       >
                         <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-xl bg-gray-900 flex items-center justify-center text-white text-[10px] font-black shrink-0">
                             {index + 1}
                           </div>
                           <div className="min-w-0 flex-1">
                             <div className="flex items-center justify-between gap-2">
                               <p className="text-xs font-black text-gray-900 uppercase truncate">{stop.customerName}</p>
                               <span className="text-[9px] font-black text-primary uppercase">{stop.scheduledAt?.toDate ? safeFormat(stop.scheduledAt.toDate(), "h:mm a") : "TBD"}</span>
                             </div>
                             <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest truncate mt-0.5">{stop.address}</p>
                           </div>
                         </div>
                       </div>
                     ))
                   )}
                </CardContent>
              </Card>
            </div>

            {/* Tactical Map Column */}
            <div className="lg:col-span-8 h-[850px]">
              <Card className="border-none shadow-xl bg-white rounded-[2.5rem] overflow-hidden h-full relative">
                 <div className="absolute inset-0">
                    {!isLoaded ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
                        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">Synchronizing Orbital Assets...</p>
                      </div>
                    ) : (
                      <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={
                          optimizedStops.length > 0 
                            ? { lat: optimizedStops[0].latitude, lng: optimizedStops[0].longitude }
                            : (settings?.baseLatitude ? { lat: settings.baseLatitude, lng: settings.baseLongitude } : { lat: 37.7749, lng: -122.4194 })
                        }
                        zoom={12}
                        options={{
                          mapTypeId: 'roadmap',
                          disableDefaultUI: false,
                          zoomControl: true,
                        }}
                      >
                        {settings?.baseLatitude && (
                          <Marker
                            position={{ lat: settings.baseLatitude, lng: settings.baseLongitude }}
                            icon={{
                              path: "M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z",
                              fillColor: "#000000",
                              fillOpacity: 1,
                              strokeWeight: 2,
                              strokeColor: "#ffffff",
                              scale: 1.5,
                            }}
                            title="Base Operations"
                          />
                        )}

                        <MarkerClusterer>
                          {(clusterer) => (
                            <>
                              {optimizedStops.map((stop, idx) => (
                                <Marker
                                  key={stop.id}
                                  position={{ lat: stop.latitude, lng: stop.longitude }}
                                  label={{
                                    text: (idx + 1).toString(),
                                    color: "white",
                                    fontWeight: "bold",
                                  }}
                                  onClick={() => setSelectedStop(stop)}
                                  clusterer={clusterer}
                                />
                              ))}
                            </>
                          )}
                        </MarkerClusterer>

                      {directions && (
                        <DirectionsRenderer
                          directions={directions}
                          options={{
                            polylineOptions: {
                              strokeColor: "#ef4444",
                              strokeOpacity: 0.8,
                              strokeWeight: 4,
                            },
                            suppressMarkers: true,
                          }}
                        />
                      )}

                      {!directions && optimizedStops.length > 1 && (
                        <Polyline
                          path={[
                            ...(settings?.baseLatitude ? [{ lat: settings.baseLatitude, lng: settings.baseLongitude }] : []),
                            ...optimizedStops.map(s => ({ lat: s.latitude, lng: s.longitude })),
                            ...(settings?.baseLatitude && settings.travelPricing.roundTripToggle ? [{ lat: settings.baseLatitude, lng: settings.baseLongitude }] : [])
                          ]}
                          options={{
                            strokeColor: "#ef4444",
                            strokeOpacity: 0.8,
                            strokeWeight: 4,
                            geodesic: true,
                          }}
                        />
                      )}

                      {selectedStop && (
                        <InfoWindow
                          position={{ lat: selectedStop.latitude, lng: selectedStop.longitude }}
                          onCloseClick={() => setSelectedStop(null)}
                        >
                          <div className="p-2 text-black min-w-[150px]">
                            <p className="font-black text-xs uppercase tracking-tight">{selectedStop.customerName}</p>
                            <p className="text-[10px] text-gray-500 mt-1">{selectedStop.address}</p>
                            {selectedStop.travelTimeFromPrevious && (
                              <p className="text-[10px] font-bold text-primary mt-1">
                                Travel: {formatDuration(selectedStop.travelTimeFromPrevious)}
                              </p>
                            )}
                            <Button 
                              variant="ghost" 
                              className="h-8 w-full mt-2 text-[9px] font-black uppercase tracking-widest bg-primary text-white hover:bg-primary/90"
                              onClick={() => {
                                navigate(`/calendar/${selectedStop.id}`);
                              }}
                            >
                              Open Intelligence
                            </Button>
                          </div>
                        </InfoWindow>
                      )}
                      </GoogleMap>
                    )}
                 </div>
              </Card>
            </div>
          </>
        ) : (
          /* List View (Original logic with minor cleanup) */
          <>
            {/* Calendar Sidebar */}
            <Card className="lg:col-span-4 border-none shadow-xl bg-card rounded-3xl overflow-hidden h-fit">
          <CardHeader className="bg-black/40 border-b border-white/5 p-6">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Temporal Selection</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <CalendarUI
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-2xl border-none w-full bg-white p-4 shadow-inner"
              modifiers={{
                hasAppointment: (day) => appointments.some(app => {
                  const appDate = app.scheduledAt?.toDate ? app.scheduledAt.toDate() : new Date(app.scheduledAt);
                  return isSameDay(appDate, day);
                }),
                hasTimeBlock: (day) => timeBlocks.some(block => {
                  const dateIso = safeFormat(day, "yyyy-MM-dd");
                  if (block.type === 'full_day') {
                    const startIso = block.date;
                    const endIso = block.endDate || block.date;
                    return dateIso >= startIso && dateIso <= endIso;
                  }
                  return block.date === dateIso;
                }),
                hasGoogleEvent: (day) => googleEvents.some(event => {
                  const startObj = event.start;
                  const eventDate = new Date(startObj.dateTime || startObj.date);
                  return isSameDay(eventDate, day);
                })
              }}
              modifiersStyles={{
                hasAppointment: { fontWeight: '900', color: 'var(--primary)', backgroundColor: 'rgba(229, 57, 53, 0.05)' },
                hasTimeBlock: { borderBottom: '2px solid #fbbf24' },
                hasGoogleEvent: { borderBottom: '2px solid #3b82f6' }
              }}
            />
          </CardContent>
        </Card>

        {/* Appointments List */}
        <div className="lg:col-span-8 space-y-8">
          <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
            <CardHeader className="bg-black/40 border-b border-white/5 p-8 flex flex-row items-center justify-between">
              <div className="flex flex-col">
                <CardTitle className="text-2xl font-black text-white tracking-tighter uppercase">
                  {date ? safeFormat(date, "EEEE, MMMM d") : "Select a date"}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                    {dayAppointments.length} Active Deployments
                  </p>
                  {selectedIds.length > 0 && (
                    <Badge className="bg-primary text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md">
                      {selectedIds.length} Selected
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isSelectionMode ? (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="border-border bg-white text-gray-900 hover:bg-gray-50 rounded-xl font-black uppercase tracking-widest text-[10px] h-12 px-6"
                    onClick={() => {
                      setIsSelectionMode(false);
                      setSelectedIds([]);
                    }}
                  >
                    Exit Selection
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/10 text-white font-black uppercase tracking-widest text-[10px] h-12 px-6 rounded-xl hover:bg-white/5 transition-all"
                      onClick={() => setShowTimeBlockDialog(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Time Block
                    </Button>
                    <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                      <DialogTrigger render={
                      <Button 
                        size="sm" 
                        className="bg-primary hover:bg-[#2A6CFF] text-white font-black uppercase tracking-widest text-[10px] h-12 px-6 rounded-xl shadow-glow-blue transition-all"
                        onClick={() => {
                          setEditingAppointment(null);
                          setShowAddDialog(true);
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        New Deployment
                      </Button>
                    } />
                    <DialogContent className="max-w-xl bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black flex flex-col max-h-[90vh]">
                      <DialogHeader className="p-8 border-b border-white/5 bg-black/40 shrink-0">
                        <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase">
                          {editingAppointment ? "Modify Deployment" : "New Tactical Deployment"}
                        </DialogTitle>
                      </DialogHeader>
                      <form key={editingAppointment?.id || "new"} onSubmit={handleCreateAppointment} className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                          <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2 col-span-2">
                              <Label htmlFor="customerId" className="font-black uppercase tracking-widest text-[10px] text-white/60">Target Client</Label>
                              <SearchableSelector
                                options={clients.map(c => ({
                                  value: c.id,
                                  label: getClientDisplayName(c),
                                  description: `${c.email || "No email"} • ${c.phone || "No phone"}`
                                }))}
                                value={selectedCustomerId}
                                onSelect={(val) => setSelectedCustomerId(val)}
                                placeholder="Search for a client..."
                                className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12"
                              />
                            </div>
                            {availableVehicles.length > 0 && (
                              <div className="space-y-2 col-span-2 border p-4 rounded-lg">
                                <Label>Select Vehicles</Label>
                                <div className="grid grid-cols-2 gap-2">
                                  {availableVehicles.map(v => (
                                    <div key={v.id} className="flex items-center space-x-2">
                                      <Checkbox 
                                        id={v.id}
                                        checked={selectedVehicleIds.includes(v.id)}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setSelectedVehicleIds([...selectedVehicleIds, v.id]);
                                            if (v.size) {
                                              setAppointment(prev => ({ ...prev, vehicleSize: v.size }));
                                            }
                                          } else {
                                            setSelectedVehicleIds(selectedVehicleIds.filter(id => id !== v.id));
                                          }
                                        }}
                                      />
                                      <Label htmlFor={v.id}>{v.year} {v.make} {v.model}</Label>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="space-y-2">
                              <Label htmlFor="jobNum">Job Number</Label>
                              <Input 
                                id="jobNum"
                                name="jobNum"
                                defaultValue={editingAppointment?.jobNum || ""}
                                placeholder="e.g. JD1001"
                                className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12"
                              />
                            </div>
                            <div className="space-y-2 col-span-2">
                              <Label>Vehicle Selection (NHTSA Verified)</Label>
                              <VehicleSelector 
                                onSelect={(vData) => {
                                  setAppointment(prev => ({ 
                                    ...prev, 
                                    vehicleInfo: `${vData.year} ${vData.make} ${vData.model}` 
                                  }));
                                }} 
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Vehicle Size</Label>
                              <Select value={appointment.vehicleSize} onValueChange={(v: any) => setAppointment(prev => ({ ...prev, vehicleSize: v }))}>
                                <SelectTrigger className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                  <SelectItem value="small">Small (Coupe/Sedan)</SelectItem>
                                  <SelectItem value="medium">Medium (SUV/Crossover)</SelectItem>
                                  <SelectItem value="large">Large (Truck/Full SUV)</SelectItem>
                                  <SelectItem value="extra_large">Extra Large (Van/Lifted)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="vin">VIN (Optional)</Label>
                              <StableInput 
                                id="vin" 
                                name="vin" 
                                placeholder="17-character VIN" 
                                className="bg-white/5 border-white/10 uppercase font-mono text-white font-bold rounded-xl h-12" 
                                value={appointment.vin}
                                onValueChange={(val) => setAppointment(prev => ({ ...prev, vin: val }))}
                              />
                            </div>
                            <div className="space-y-2 col-span-2">
                              <Label htmlFor="address">Service Address</Label>
                              <AddressInput 
                                defaultValue={appointmentAddress.address}
                                onAddressSelect={handleAddressSelect}
                                placeholder="123 Main St, Austin, TX"
                              />
                            </div>

                            {/* Removed Smart Booking */}

                            <div className="space-y-2">
                              <Label htmlFor="scheduledAt">Date & Time</Label>
                              <Input 
                                id="scheduledAt" 
                                name="scheduledAt" 
                                type="datetime-local" 
                                required 
                                className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12" 
                                value={scheduledAtValue}
                                onChange={(e) => setScheduledAtValue(e.target.value)}
                              />
                              {isAfterHoursDisplay && (
                                <div className="mt-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-start gap-2">
                                  <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-xs font-black text-yellow-500 uppercase tracking-widest">After-Hours Appointment</p>
                                    <p className="text-[10px] text-yellow-500/80 font-medium mt-0.5">This time slot falls outside normal business hours. An after-hours fee of {formatCurrency(afterHoursFeeDisplay)} will be applied.</p>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="status">Status</Label>
                              <Select value={appointmentStatus} onValueChange={setAppointmentStatus}>
                                <SelectTrigger className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12">
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                  <SelectItem value="scheduled">Scheduled</SelectItem>
                                  <SelectItem value="confirmed">Confirmed</SelectItem>
                                  <SelectItem value="en_route">En Route</SelectItem>
                                  <SelectItem value="in_progress">In Progress</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="paid">Paid</SelectItem>
                                  <SelectItem value="canceled">Canceled</SelectItem>
                                  <SelectItem value="no_show">No Show</SelectItem>
                                  <SelectItem value="waitlisted">Waitlisted</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="totalAmount">Service Base Amount ($)</Label>
                              <StableInput 
                                id="totalAmount" 
                                name="totalAmount" 
                                type="text" 
                                inputMode="decimal"
                                placeholder="250" 
                                required 
                                className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12" 
                                value={baseAmount?.toString() || ""}
                                onValueChange={(val) => setBaseAmount(parseFloat(val) || 0)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="travelFee">Travel Mileage Fee ($)</Label>
                              <StableInput 
                                id="travelFee" 
                                name="travelFee" 
                                type="text" 
                                inputMode="decimal"
                                placeholder="25.00" 
                                className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12" 
                                value={travelFee?.toString() || ""}
                                onValueChange={(val) => setTravelFee(parseFloat(val) || 0)}
                              />
                            </div>

                            <div className="col-span-2 p-4 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Repeat className="w-4 h-4 text-primary" />
                                  <Label className="text-sm font-bold text-white">Recurring Appointment</Label>
                                </div>
                                <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
                              </div>

                              {isRecurring && (
                                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/10 animate-in fade-in slide-in-from-top-2">
                                  <div className="space-y-2">
                                    <Label className="text-xs text-white/60">Frequency</Label>
                                    <Select value={recurringFrequency} onValueChange={(v: any) => setRecurringFrequency(v)}>
                                      <SelectTrigger className="h-10 bg-white/5 border-white/10 text-white font-bold rounded-xl"><SelectValue /></SelectTrigger>
                                      <SelectContent className="bg-[#121212] border-white/10 text-white font-bold">
                                        <SelectItem value="daily">Daily</SelectItem>
                                        <SelectItem value="weekly">Weekly</SelectItem>
                                        <SelectItem value="biweekly">Bi-weekly</SelectItem>
                                        <SelectItem value="monthly">Monthly</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-xs text-white/60">Every (Interval)</Label>
                                    <StableInput 
                                      type="text" 
                                      inputMode="numeric"
                                      value={recurringInterval?.toString() || ""} 
                                      onValueChange={(val) => setRecurringInterval(parseInt(val) || 1)}
                                      className="h-10 bg-white/5 border-white/10 text-white font-bold rounded-xl"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-xs text-white/60">End Date (Optional)</Label>
                                    <Input 
                                      type="date" 
                                      value={recurringEndDate} 
                                      onChange={(e) => setRecurringEndDate(e.target.value)}
                                      className="h-10 bg-white/5 border-white/10 text-white font-bold rounded-xl"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-xs text-white/60">Occurrences (Optional)</Label>
                                    <StableInput 
                                      type="text" 
                                      inputMode="numeric"
                                      value={recurringOccurrences?.toString() || ""} 
                                      onValueChange={(val) => setRecurringOccurrences(val === "" ? "" : parseInt(val) || "")}
                                      className="h-10 bg-white/5 border-white/10 text-white font-bold rounded-xl"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="space-y-4 col-span-2">
                              <div className="space-y-4">
                                {selectedVehicleIds.length > 0 ? (
                                  selectedVehicleIds.map(vId => {
                                    const v = availableVehicles.find(av => av.id === vId);
                                    return (
                                      <div key={vId} className="space-y-2 border border-white/10 p-4 rounded-xl bg-black/20">
                                        <Label className="text-white font-black uppercase tracking-widest text-[10px]">Services for {v?.year} {v?.make} {v?.model}</Label>
                                        <div className="grid grid-cols-1 gap-2 p-3 bg-white/5 rounded-xl border border-white/10 max-h-40 overflow-y-auto">
                                          {services.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase())).map(service => {
                                            const selection = selectedServices.find(sel => sel.id === service.id && sel.vehicleId === vId);
                                            
                                            let displayPrice = service.pricingBySize?.[v?.size || appointment.vehicleSize] || service.basePrice;
                                            const client = clients.find(c => c.id === selectedCustomerId);
                                            if (client?.isVIP && client?.vipSettings) {
                                              let vipPrice = undefined;
                                              if (client.vipSettings.vipVehiclePricing?.[vId]?.[service.id]) {
                                                vipPrice = client.vipSettings.vipVehiclePricing[vId][service.id];
                                              } else if (client.vipSettings.customServicePricing?.[service.id]) {
                                                vipPrice = client.vipSettings.customServicePricing[service.id];
                                              }
                                              if (vipPrice !== undefined) displayPrice = vipPrice;
                                            }

                                            return (
                                              <div key={service.id} className="flex items-center justify-between gap-2 p-1 hover:bg-white/5 rounded transition-colors">
                                                <div className="flex items-center space-x-2 flex-1">
                                                  <Checkbox 
                                                    id={`service-${vId}-${service.id}`}
                                                    checked={!!selection}
                                                    onCheckedChange={(checked) => {
                                                      if (checked) setSelectedServices(prev => [...prev, { id: service.id, qty: 1, vehicleId: vId }]);
                                                      else setSelectedServices(prev => prev.filter(s => !(s.id === service.id && s.vehicleId === vId)));
                                                    }}
                                                    className="border-white/20"
                                                  />
                                                  <Label htmlFor={`service-${vId}-${service.id}`} className="text-xs cursor-pointer flex-1 text-white/80">
                                                    {service.name} <span className={cn(displayPrice !== (service.pricingBySize?.[v?.size || appointment.vehicleSize] || service.basePrice) && "text-primary font-black")}>
                                                      (${displayPrice})
                                                    </span>
                                                  </Label>
                                                </div>
                                                {selection && (
                                                  <div className="flex items-center gap-1">
                                                    <Button 
                                                      type="button" 
                                                      variant="outline" 
                                                      size="icon" 
                                                      className="h-6 w-6 border-white/10 text-white"
                                                      onClick={() => {
                                                        setSelectedServices(prev => prev.map(s => (s.id === service.id && s.vehicleId === vId) ? { ...s, qty: Math.max(1, s.qty - 1) } : s));
                                                      }}
                                                    >
                                                      -
                                                    </Button>
                                                    <span className="text-xs font-bold w-4 text-center text-white">{selection.qty}</span>
                                                    <Button 
                                                      type="button" 
                                                      variant="outline" 
                                                      size="icon" 
                                                      className="h-6 w-6 border-white/10 text-white"
                                                      onClick={() => {
                                                        setSelectedServices(prev => prev.map(s => (s.id === service.id && s.vehicleId === vId) ? { ...s, qty: s.qty + 1 } : s));
                                                      }}
                                                    >
                                                      +
                                                    </Button>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="space-y-2">
                                    <Label className="text-white">Services</Label>
                                    <div className="grid grid-cols-1 gap-2 p-3 bg-white/5 rounded-xl border border-white/10 max-h-40 overflow-y-auto">
                                      {services.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase())).map(service => {
                                        const selection = selectedServices.find(sel => sel.id === service.id && !sel.vehicleId);
                                        
                                        let displayPrice = service.pricingBySize?.[appointment.vehicleSize] || service.basePrice;
                                        const client = clients.find(c => c.id === selectedCustomerId);
                                        if (client?.isVIP && client?.vipSettings) {
                                          let vipPrice = undefined;
                                          if (client.vipSettings.customServicePricing?.[service.id]) {
                                            vipPrice = client.vipSettings.customServicePricing[service.id];
                                          }
                                          if (vipPrice !== undefined) displayPrice = vipPrice;
                                        }

                                        return (
                                          <div key={service.id} className="space-y-2 p-3 bg-white/5 rounded-2xl border border-white/10">
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center space-x-2 flex-1">
                                                <Checkbox 
                                                  id={`service-${service.id}`}
                                                  checked={selectedServices.some(s => s.id === service.id)}
                                                  onCheckedChange={(checked) => {
                                                    if (checked) {
                                                      const firstVehicleId = selectedVehicleIds[0] || null;
                                                      const firstVehicle = availableVehicles.find(v => v.id === firstVehicleId);
                                                      setSelectedServices(prev => [...prev, { 
                                                        id: service.id, 
                                                        qty: 1, 
                                                        vehicleId: firstVehicleId || undefined,
                                                        vehicleName: firstVehicle ? `${firstVehicle.year} ${firstVehicle.make}` : undefined
                                                      }]);
                                                    } else {
                                                      setSelectedServices(prev => prev.filter(s => s.id !== service.id));
                                                    }
                                                  }}
                                                  className="border-white/20"
                                                />
                                                <Label htmlFor={`service-${service.id}`} className="text-xs font-black cursor-pointer flex-1 text-white uppercase tracking-tight">
                                                  {service.name} <span className="text-primary">(${displayPrice})</span>
                                                </Label>
                                              </div>
                                            </div>

                                            {selectedServices.some(s => s.id === service.id) && selectedVehicleIds.length > 1 && (
                                              <div className="pl-6 space-y-2">
                                                <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Assign to Vehicles:</p>
                                                <div className="flex flex-wrap gap-2">
                                                  {selectedVehicleIds.map(vId => {
                                                    const v = availableVehicles.find(av => av.id === vId);
                                                    const isAssigned = selectedServices.some(s => s.id === service.id && s.vehicleId === vId);
                                                    return (
                                                      <Badge 
                                                        key={vId}
                                                        variant="outline"
                                                        className={cn(
                                                          "cursor-pointer text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-all",
                                                          isAssigned ? "bg-primary text-white border-primary" : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                                                        )}
                                                        onClick={() => {
                                                          if (isAssigned) {
                                                            setSelectedServices(prev => prev.filter(s => !(s.id === service.id && s.vehicleId === vId)));
                                                          } else {
                                                            setSelectedServices(prev => [...prev, { 
                                                              id: service.id, 
                                                              qty: 1, 
                                                              vehicleId: vId,
                                                              vehicleName: `${v?.year} ${v?.make}`
                                                            }]);
                                                          }
                                                        }}
                                                      >
                                                        {v?.make} {v?.model}
                                                      </Badge>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="space-y-2">
                                <Label className="text-white">Add-ons</Label>
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40" />
                                  <Input 
                                    placeholder="Search add-ons..." 
                                    value={addonSearch}
                                    onChange={(e) => setAddonSearch(e.target.value)}
                                    className="pl-8 h-8 text-xs bg-white text-black"
                                  />
                                </div>
                                <div className="grid grid-cols-1 gap-2 p-3 bg-white/5 rounded-xl border border-white/10 max-h-40 overflow-y-auto">
                                  {addons.filter(a => a.name.toLowerCase().includes(addonSearch.toLowerCase())).map(addon => {
                                    const selection = selectedAddons.find(sel => sel.id === addon.id);
                                    return (
                                      <div key={addon.id} className="flex items-center justify-between gap-2 p-1 hover:bg-white/5 rounded transition-colors">
                                        <div className="flex items-center space-x-2 flex-1">
                                          <Checkbox 
                                            id={`addon-${addon.id}`}
                                            checked={!!selection}
                                            onCheckedChange={(checked) => {
                                              if (checked) setSelectedAddons(prev => [...prev, { id: addon.id, qty: 1 }]);
                                              else setSelectedAddons(prev => prev.filter(a => a.id !== addon.id));
                                            }}
                                            className="border-white/20"
                                          />
                                          <Label htmlFor={`addon-${addon.id}`} className="text-xs cursor-pointer flex-1 text-white/80">
                                            {addon.name} (${addon.price})
                                          </Label>
                                        </div>
                                        {selection && (
                                          <div className="flex items-center gap-1">
                                            <Button 
                                              type="button" 
                                              variant="outline" 
                                              size="icon" 
                                              className="h-6 w-6 border-white/10 text-white"
                                              onClick={() => {
                                                setSelectedAddons(prev => prev.map(a => a.id === addon.id ? { ...a, qty: Math.max(1, a.qty - 1) } : a));
                                              }}
                                            >
                                              -
                                            </Button>
                                            <span className="text-xs font-bold w-4 text-center text-white">{selection.qty}</span>
                                            <Button 
                                              type="button" 
                                              variant="outline" 
                                              size="icon" 
                                              className="h-6 w-6 border-white/10 text-white"
                                              onClick={() => {
                                                setSelectedAddons(prev => prev.map(a => a.id === addon.id ? { ...a, qty: a.qty + 1 } : a));
                                              }}
                                            >
                                              +
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Intelligent Upsell System */}
                                {selectedServices.length > 0 && (
                                  <div className="p-4 bg-primary/10 border border-primary/20 rounded-2xl space-y-3 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                      <Crown className="w-12 h-12 text-primary" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                                      <h5 className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Deployment Enhancements</h5>
                                    </div>
                                    <div className="space-y-3">
                                      {addons
                                        .filter(a => !selectedAddons.some(sel => sel.id === a.id))
                                        .slice(0, 2)
                                        .map(addon => (
                                          <div key={addon.id} className="flex items-center justify-between gap-4">
                                            <div className="flex-1">
                                              <p className="text-[11px] font-black text-white uppercase tracking-tight">{addon.name}</p>
                                              <p className="text-[9px] text-white/60 uppercase">Maximize Protection • +${addon.price}</p>
                                            </div>
                                            <Button 
                                              type="button"
                                              onClick={() => setSelectedAddons(prev => [...prev, { id: addon.id, qty: 1 }])}
                                              className="bg-primary hover:bg-[#2A6CFF] text-white font-black text-[9px] h-7 px-3 rounded-lg uppercase tracking-widest shadow-glow-blue"
                                            >
                                              Add to Mission
                                            </Button>
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="space-y-2 col-span-2">
                              <Label htmlFor="coupon">Promotions & Loyalty</Label>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex gap-2">
                                  <StableInput 
                                    id="coupon" 
                                    placeholder="COUPON" 
                                    className="bg-white border-gray-200 uppercase" 
                                    value={couponCode}
                                    onValueChange={(val) => setCouponCode(val.toUpperCase())}
                                  />
                                  <Button type="button" variant="outline" onClick={handleApplyCoupon}>Apply</Button>
                                </div>
                                <Button 
                                  type="button" 
                                  variant="outline" 
                                  className="border-red-200 text-primary hover:bg-red-50 font-bold"
                                  onClick={handleRedeemPoints}
                                >
                                  <Star className="w-4 h-4 mr-2" /> Redeem 100 Pts
                                </Button>
                              </div>
                              {(discount > 0 || redeemedPoints > 0) && (
                                <div className="flex gap-4">
                                  {discount > 0 && <p className="text-xs text-green-600 font-bold">Coupon: -${discount}</p>}
                                  {redeemedPoints > 0 && <p className="text-xs text-primary font-bold">Loyalty: -${redeemedPoints}</p>}
                                </div>
                              )}
                            </div>

                            <div className="col-span-2 p-4 bg-white/5 rounded-2xl space-y-3 border border-white/10">
                              <h4 className="text-xs font-black text-white/40 uppercase tracking-widest">Price Summary</h4>
                              
                              <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                                {selectedVehicleIds.length > 0 ? (
                                  selectedVehicleIds.map(vId => {
                                    const v = availableVehicles.find(av => av.id === vId);
                                    const vehicleServices = selectedServices.filter(s => s.vehicleId === vId);
                                    
                                    if (vehicleServices.length === 0) return null;

                                    return (
                                      <div key={vId} className="space-y-1 pb-2 border-b border-white/5 last:border-0">
                                        <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                                          {v?.year} {v?.make} {v?.model}
                                        </p>
                                        {vehicleServices.map(selection => {
                                          const service = services.find(s => s.id === selection.id);
                                          const client = clients.find(c => c.id === selectedCustomerId);
                                          let price = service?.pricingBySize?.[v?.size || appointment.vehicleSize] || service?.basePrice || 0;
                                          
                                          if (client?.isVIP && client?.vipSettings) {
                                            let vipPrice = undefined;
                                            if (vId && client.vipSettings.vipVehiclePricing?.[vId]?.[selection.id]) {
                                              vipPrice = client.vipSettings.vipVehiclePricing[vId][selection.id];
                                            } else if (client.vipSettings.customServicePricing?.[selection.id]) {
                                              vipPrice = client.vipSettings.customServicePricing[selection.id];
                                            }
                                            if (vipPrice !== undefined) price = vipPrice;
                                          }

                                          return (
                                            <div key={selection.id} className="flex justify-between text-[11px]">
                                              <span className="text-white/60">{service?.name} (x{selection.qty})</span>
                                              <span className="font-bold text-white">{formatCurrency(price * selection.qty)}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })
                                ) : (
                                  selectedServices.map((selection, idx) => {
                                    const service = services.find(s => s.id === selection.id);
                                    const client = clients.find(c => c.id === selectedCustomerId);
                                    let price = service?.pricingBySize?.[appointment.vehicleSize] || service?.basePrice || 0;
                                    
                                    if (client?.isVIP && client?.vipSettings) {
                                      let vipPrice = undefined;
                                      if (client.vipSettings.customServicePricing?.[selection.id]) {
                                        vipPrice = client.vipSettings.customServicePricing[selection.id];
                                      }
                                      if (vipPrice !== undefined) price = vipPrice;
                                    }

                                    return (
                                      <div key={`${selection.id}-${selection.vehicleId || 'none'}-${idx}`} className="flex justify-between text-[11px]">
                                        <span className="text-white/60">{service?.name} (x{selection.qty})</span>
                                        <span className="font-bold text-white">{formatCurrency(price * selection.qty)}</span>
                                      </div>
                                    );
                                  })
                                )}

                                {selectedAddons.map((selection, idx) => {
                                  const addon = addons.find(a => a.id === selection.id);
                                  return (
                                    <div key={`${selection.id}-${idx}`} className="flex justify-between text-[11px]">
                                      <span className="text-white/60">{addon?.name} (x{selection.qty})</span>
                                      <span className="font-bold text-white">{formatCurrency((addon?.price || 0) * selection.qty)}</span>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="pt-2 border-t border-white/10 flex justify-between text-sm">
                                <span className="text-white/60">Subtotal</span>
                                <span className="font-bold text-white">{formatCurrency(baseAmount)}</span>
                              </div>
                              {travelFee > 0 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Travel Mileage Fee</span>
                                  <span className="font-bold text-white">{formatCurrency(travelFee)}</span>
                                </div>
                              )}
                              {discount > 0 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Discount</span>
                                  <span className="font-bold text-green-400">-{formatCurrency(discount)}</span>
                                </div>
                              )}
                              {redeemedPoints > 0 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Loyalty Points</span>
                                  <span className="font-bold text-primary">-{formatCurrency(redeemedPoints)}</span>
                                </div>
                              )}
                              {isRiskyClient && (
                                <div className="flex flex-col gap-3 mt-4 p-4 border border-primary/20 bg-primary/5 rounded-xl">
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-primary font-bold uppercase tracking-wider text-[10px]">Deposit Required</span>
                                    <span className="text-primary font-black">{formatCurrency(calculatedDeposit)}</span>
                                  </div>

                                  {!recordedDeposit ? (
                                    <div className="space-y-4 pt-3 border-t border-primary/10">
                                      <div className="space-y-1">
                                        <Label className="uppercase tracking-widest text-[10px] text-white/60">Collect Deposit</Label>
                                        <Button
                                          type="button"
                                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10"
                                          onClick={() => {
                                            // TODO: Implement Stripe/Square logic
                                            toast.info("Card processing integration pending.");
                                          }}
                                        >
                                          Run Credit / Debit Card
                                        </Button>
                                      </div>
                                      
                                      <div className="space-y-3">
                                        <Label className="uppercase tracking-widest text-[10px] text-white/60">Record Other Payment</Label>
                                        <div className="flex flex-col sm:flex-row gap-3">
                                          <Select value={activeDepositMethod} onValueChange={setActiveDepositMethod}>
                                            <SelectTrigger className="bg-black border-white/10 text-white font-bold h-10 w-full sm:w-[150px]">
                                              <SelectValue placeholder="Method" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                              <SelectItem value="Cash">Cash</SelectItem>
                                              <SelectItem value="Cash App">Cash App</SelectItem>
                                              <SelectItem value="Zelle">Zelle</SelectItem>
                                              <SelectItem value="Apple Pay">Apple Pay</SelectItem>
                                              <SelectItem value="Google Pay">Google Pay</SelectItem>
                                              <SelectItem value="PayPal">PayPal</SelectItem>
                                              <SelectItem value="Other">Other</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          
                                          <div className="relative w-full sm:w-[120px]">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-bold">$</span>
                                            <Input
                                              type="number"
                                              step="0.01"
                                              value={activeDepositAmount}
                                              onChange={e => setActiveDepositAmount(e.target.value)}
                                              onBlur={(e) => {
                                                const val = parseFloat(e.target.value);
                                                setActiveDepositAmount(isNaN(val) ? "0.00" : val.toFixed(2));
                                              }}
                                              className="bg-black border-white/10 text-white font-bold h-10 pl-7 w-full"
                                              placeholder="0.00"
                                            />
                                          </div>
                                          
                                          <Button
                                            type="button"
                                            className="bg-green-600 hover:bg-green-700 text-white font-bold h-10 px-4 whitespace-nowrap"
                                            onClick={() => {
                                              const amt = typeof activeDepositAmount === "string" ? parseFloat(activeDepositAmount) : activeDepositAmount;
                                              if (!amt || amt <= 0) return toast.error("Enter a valid deposit amount.");
                                              setRecordedDeposit({
                                                amount: amt,
                                                method: activeDepositMethod,
                                                timestamp: new Date()
                                              });
                                              toast.success("Deposit recorded successfully.");
                                            }}
                                          >
                                            Record Deposit Payment
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex justify-between items-center text-sm pt-3 border-t border-primary/10">
                                      <span className="text-green-500 font-bold uppercase tracking-wider text-[10px]">Deposit Collected ({recordedDeposit.method})</span>
                                      <div className="flex items-center gap-3">
                                        <span className="text-green-500 font-black">{formatCurrency(recordedDeposit.amount)}</span>
                                        <button
                                          type="button"
                                          className="text-white/40 hover:text-white"
                                          onClick={() => setRecordedDeposit(null)}
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                                <span className="font-black text-white uppercase tracking-tighter">Final Total</span>
                                <span className="text-xl font-black text-white">
                                  {formatCurrency(baseAmount + travelFee - discount - redeemedPoints)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="p-8 border-t border-white/5 bg-black/40 flex gap-4 shrink-0">
                          {editingAppointment && (
                            <DeleteConfirmationDialog
                              trigger={
                                <Button 
                                  type="button" 
                                  variant="outline" 
                                  className="h-14 w-14 rounded-2xl border-none bg-red-500/10 text-white hover:bg-red-500 hover:text-white transition-all shadow-xl"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </Button>
                              }
                              title="Terminate Deployment?"
                              itemName={editingAppointment.customerName}
                              onConfirm={() => {
                                handleDeleteAppointment(editingAppointment.id);
                                setShowAddDialog(false);
                              }}
                            />
                          )}
                          <Button 
                            type="button" 
                            variant="outline" 
                            className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] border-white/10 hover:bg-white/5 text-gray-400 hover:text-white transition-all"
                            onClick={() => setShowAddDialog(false)}
                          >
                            Abort Mission
                          </Button>
                          <Button 
                            type="submit" 
                            className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-primary text-white hover:bg-[#2A6CFF] shadow-glow-blue transition-all hover:scale-105"
                            disabled={isCreating}
                          >
                            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            {editingAppointment ? "Confirm Modification" : "Initiate Deployment"}
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </div>
          </CardHeader>
            <CardContent className="p-8">
              {loading ? (
                <div className="text-center py-20 text-gray-400 font-black uppercase tracking-widest text-xs animate-pulse">Synchronizing Schedule...</div>
              ) : calendarView === "list" ? (
                <div className="space-y-6">
                  <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
                    <div className="relative flex-1 w-full">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input 
                        placeholder="Search deployments by client, vehicle, VIN, or job #..." 
                        className="pl-12 h-14 bg-[#121212] border-white/10 text-white font-bold rounded-2xl shadow-xl focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-white/20"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    {selectedIds.length > 0 && (
                      <Button 
                        variant="destructive" 
                        className="h-14 px-8 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-glow-red"
                        onClick={() => setShowBulkDeleteConfirm(true)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Abort Selected ({selectedIds.length})
                      </Button>
                    )}
                  </div>

                  <div className="rounded-3xl border border-white/5 overflow-hidden bg-[#121212]/50 shadow-2xl backdrop-blur-sm">
                    <Table>
                      <TableHeader className="bg-white/5">
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="w-12 px-6">
                            <Checkbox 
                              checked={selectedIds.length === filteredAppointments.length && filteredAppointments.length > 0}
                              onCheckedChange={toggleSelectAll}
                              className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            />
                          </TableHead>
                          <TableHead className="font-black uppercase tracking-widest text-[10px] text-white/40 px-6 py-5">Deployment Date</TableHead>
                          <TableHead className="font-black uppercase tracking-widest text-[10px] text-white/40 px-6 py-5">Target Client</TableHead>
                          <TableHead className="font-black uppercase tracking-widest text-[10px] text-white/40 px-6 py-5">Asset Info</TableHead>
                          <TableHead className="font-black uppercase tracking-widest text-[10px] text-white/40 px-6 py-5">Status</TableHead>
                          <TableHead className="font-black uppercase tracking-widest text-[10px] text-white/40 px-6 py-5 text-right">Amount</TableHead>
                          <TableHead className="font-black uppercase tracking-widest text-[10px] text-white/40 px-6 py-5 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAppointments.length === 0 ? (
                          <TableRow className="border-white/5">
                            <TableCell colSpan={7} className="h-60 text-center">
                              <div className="flex flex-col items-center justify-center gap-4">
                                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-white/20">
                                  <Search className="w-8 h-8" />
                                </div>
                                <div>
                                  <p className="text-lg font-black text-white uppercase tracking-tight">No Deployments Found</p>
                                  <p className="text-[10px] text-white/30 font-black uppercase tracking-widest mt-1">Adjust your search parameters and try again.</p>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredAppointments.map((app) => (
                            <TableRow 
                              key={app.id} 
                              className={cn(
                                "border-white/5 hover:bg-white/5 transition-colors cursor-pointer group",
                                selectedIds.includes(app.id) && "bg-primary/10 hover:bg-primary/15"
                              )}
                              onClick={() => navigate(`/calendar/${app.id}`)}
                            >
                              <TableCell className="px-6" onClick={(e) => e.stopPropagation()}>
                                <Checkbox 
                                  checked={selectedIds.includes(app.id)}
                                  onCheckedChange={() => toggleSelect(app.id)}
                                  className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-white/5 flex flex-col items-center justify-center shrink-0 border border-white/5">
                                    <span className="text-[10px] font-black text-white/30 uppercase leading-none mb-0.5">
                                      {app.scheduledAt?.toDate ? safeFormat(app.scheduledAt.toDate(), "MMM") : "---"}
                                    </span>
                                    <span className="text-sm font-black text-white leading-none">
                                      {app.scheduledAt?.toDate ? safeFormat(app.scheduledAt.toDate(), "d") : "--"}
                                    </span>
                                  </div>
                                  <div>
                                    <p className="text-sm font-black text-white uppercase tracking-tight">
                                      {app.scheduledAt?.toDate ? safeFormat(app.scheduledAt.toDate(), "h:mm a") : "TBD"}
                                    </p>
                                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest text-[9px]">
                                      {app.jobNum || "NO JOB #"}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-[10px] border border-primary/20">
                                    {(getClientDisplayName(app)).charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-black text-white uppercase tracking-tight truncate max-w-[150px]">
                                      {getClientDisplayName(app)}
                                    </p>
                                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest text-[9px]">
                                      {app.customerPhone || "NO PHONE"}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <div className="flex items-center gap-3">
                                  <Car className="w-4 h-4 text-primary shrink-0 opacity-60" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-black text-white tracking-tight truncate max-w-[200px]">
                                      {app.vehicleInfo || "Vehicle N/A"}
                                    </p>
                                    <p className="text-[10px] text-[#A0A0A0] font-bold uppercase tracking-widest truncate max-w-[200px] text-[9px]">
                                      {app.address || "No Address"}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <Badge variant="outline" className={cn(
                                  "text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full border-none shadow-sm", 
                                  getStatusColor(app.status || 'scheduled', app.isVip)
                                )}>
                                  {app.status?.replace("_", " ")}
                                </Badge>
                              </TableCell>
                              <TableCell className="px-6 py-5 text-right">
                                <p className="text-sm font-black text-white tracking-tighter">
                                  {formatCurrency(app.totalAmount || 0)}
                                </p>
                              </TableCell>
                              <TableCell className="px-6 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-2">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-9 w-9 text-white/40 hover:text-white hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 transition-all"
                                    onClick={() => {
                                      if (app.recurringInfo?.seriesId) {
                                        setRecurringAction({ type: "edit", appointment: app });
                                      } else {
                                        setEditingAppointment(app);
                                        setShowAddDialog(true);
                                      }
                                    }}
                                  >
                                    <Settings2 className="w-4 h-4" />
                                  </Button>
                                  <DeleteConfirmationDialog
                                    trigger={
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-9 w-9 text-white bg-red-500/10 hover:text-white hover:bg-red-600 rounded-xl"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    }
                                    title="Terminate Deployment?"
                                    itemName={app.customerName}
                                    onConfirm={() => handleDeleteAppointment(app.id)}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (!optimizedStops || optimizedStops.length === 0) ? (
                <div className="text-center py-20 space-y-6">
                  <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center text-gray-300 mx-auto shadow-inner">
                    <CalendarIcon className="w-10 h-10" />
                  </div>
                  <div>
                    <p className="text-xl font-black text-gray-900 uppercase tracking-tight">No Deployments Scheduled</p>
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-2">The field is clear for this temporal window.</p>
                  </div>
                  <Button 
                    variant="outline" 
                    className="mt-4 border-border bg-white text-gray-900 hover:bg-gray-50 rounded-xl font-black uppercase tracking-widest text-[10px] h-12 px-8" 
                    onClick={() => setShowAddDialog(true)}
                  >
                    Initiate Deployment
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {optimizedStops.map((app, index) => (
                    <div key={app.id} className="space-y-6">
                      {app.travelTimeFromPrevious !== undefined && (
                        <div className="flex items-center gap-6 px-8 py-2">
                          <div className="w-24 flex justify-center">
                            <div className="w-px h-12 bg-border relative">
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card p-1.5 border border-border rounded-lg shadow-sm">
                                <Truck className="w-3.5 h-3.5 text-primary" />
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            <span className="text-primary">Transit: {formatDuration(app.travelTimeFromPrevious)}</span>
                            <span className="w-1.5 h-1.5 bg-border rounded-full" />
                            <span>{app.distanceFromPrevious} Miles</span>
                          </div>
                        </div>
                      )}
                      <div 
                        className={cn(
                          "flex flex-col md:flex-row md:items-center gap-6 p-8 rounded-3xl bg-white border border-border hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5 transition-all cursor-pointer group relative overflow-hidden",
                          selectedIds.includes(app.id) && "border-primary bg-primary/5 shadow-lg"
                        )}
                        onClick={() => {
                          if (isSelectionMode) {
                            toggleSelect(app.id);
                          } else {
                            navigate(`/calendar/${app.id}`);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          handleLongPress(app.id);
                        }}
                      >
                        <div className={cn(
                          "absolute top-0 left-0 w-1 h-full bg-primary transition-all",
                          selectedIds.includes(app.id) ? "opacity-100" : "group-hover:opacity-100"
                        )} />
                        
                        {isSelectionMode && (
                          <div className="flex-shrink-0 mr-2">
                            <div className={cn(
                              "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                              selectedIds.includes(app.id) ? "bg-primary border-primary text-white" : "border-gray-300"
                            )}>
                              {selectedIds.includes(app.id) && <Plus className="w-4 h-4 rotate-45" />}
                            </div>
                          </div>
                        )}

                        <div className="flex-shrink-0 w-24 text-center md:border-r md:border-border md:pr-6">
                          <p className="text-2xl font-black text-gray-900 tracking-tighter">
                            {app.scheduledAt?.toDate ? safeFormat(app.scheduledAt.toDate(), "h:mm") : "TBD"}
                          </p>
                          <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">
                            {app.scheduledAt?.toDate ? safeFormat(app.scheduledAt.toDate(), "a") : ""}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-black text-gray-900 truncate uppercase tracking-tight">{getClientDisplayName(app)}</h3>
                            <Badge variant="outline" className={cn(
                              "text-[9px] font-black uppercase tracking-widest px-3 py-0.5 rounded-full border-none", 
                              getStatusColor(app.status || 'scheduled', app.isVip)
                            )}>
                              {app.status?.replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                            <div className="flex items-center gap-3 text-[10px] font-black text-gray-400 tracking-widest">
                              <Car className="w-3.5 h-3.5 text-primary" />
                              {app.vehicleInfo || "Asset N/A"}
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-black text-gray-400 uppercase tracking-widest truncate">
                              <MapPin className="w-3.5 h-3.5 text-primary" />
                              {app.address || "No address provided"}
                            </div>
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right md:pl-6 md:border-l md:border-border flex flex-col items-end gap-3">
                          <p className="text-2xl font-black text-gray-900 tracking-tighter">${app.totalAmount || 0}</p>
                          <div className="flex items-center gap-3">
                            <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Est. {formatDuration(app.estimatedDuration || 120)}</p>
                            <div className="flex items-center gap-1 transition-all">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-gray-600 hover:text-primary hover:bg-primary/10 rounded-lg"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (app.recurringInfo?.seriesId) {
                                    setRecurringAction({ type: "edit", appointment: app });
                                  } else {
                                    setEditingAppointment(app);
                                    setShowAddDialog(true);
                                  }
                                }}
                              >
                                <Settings2 className="w-4 h-4" />
                              </Button>
                              {app.recurringInfo?.seriesId ? (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRecurringAction({ type: "delete", appointment: app });
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              ) : (
                                <DeleteConfirmationDialog
                                  trigger={
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-8 w-8 text-white bg-red-500/10 hover:text-white hover:bg-red-600 rounded-lg"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  }
                                  title="Terminate Deployment?"
                                  itemName={app.customerName}
                                  onConfirm={() => handleDeleteAppointment(app.id)}
                                />
                              )}
                            </div>
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
          <Card className="border-none shadow-2xl bg-gray-900 text-white overflow-hidden relative rounded-3xl">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <MapPin className="w-40 h-40" />
            </div>
            <CardHeader className="p-8">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-glow-blue">
                    <MapPin className="w-5 h-5 text-white" />
                  </div>
                  Tactical Route Optimization
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/10 text-white font-black uppercase tracking-widest text-[9px] h-10 px-4 rounded-lg hover:bg-white/5 transition-all"
                  onClick={async () => {
                   if (date) {
                    const { stops, error } = await optimizeRoute(date);
                    setOptimizedStops(stops);
                    if (error) toast.error(error); else toast.success("Route synchronized and optimized");
                   }
                  }}
                >
                  <RefreshCw className={cn("w-3 h-3 mr-2", isSyncingGoogle && "animate-spin")} />
                  Optimize Now
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-8 pb-8 pt-0">
              <p className="text-gray-400 text-sm mb-6 font-medium leading-relaxed">
                Your deployment sequence is mathematically optimized for maximum efficiency. 
                Total estimated field time for today: <strong className="text-white font-black">
                  {formatDuration(optimizedStops.reduce((acc, stop) => acc + (stop.travelTimeFromPrevious || 0), 0))}
                </strong>
              </p>
              
              <div className="space-y-4 mb-8">
                {dayTimeBlocks.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Internal Blocks</p>
                    {dayTimeBlocks.map(block => (
                      <div key={block.id} className="p-4 bg-white/5 rounded-2xl border border-amber-500/10 flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          <Clock className="w-4 h-4 text-amber-500" />
                          <div>
                            <p className="text-xs font-black text-white uppercase">{block.title}</p>
                            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                              {block.type === 'full_day' ? 'Full Day Block' : `${safeFormat(new Date(`2000-01-01T${block.startTime}`), 'h:mm a')} - ${safeFormat(new Date(`2000-01-01T${block.endTime}`), 'h:mm a')}`}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white bg-red-500/20 hover:bg-red-500 transition-all shadow-md"
                          onClick={async () => {
                            await deleteDoc(doc(db, "blocked_dates", block.id));
                            toast.success("Time block removed");
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {dayGoogleEvents.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Google Calendar Sync</p>
                    {dayGoogleEvents.map(event => (
                      <div key={event.id} className="p-4 bg-white/5 rounded-2xl border border-blue-500/10 flex items-center gap-3">
                        <CalendarIcon className="w-4 h-4 text-blue-500" />
                        <div>
                          <p className="text-xs font-black text-white uppercase">{event.summary}</p>
                          <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest truncate max-w-[150px]">
                            {safeFormat(new Date(event.start.dateTime || event.start.date), "h:mm a")} - {safeFormat(new Date(event.end.dateTime || event.end.date), "h:mm a")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button 
                className="bg-primary text-white hover:bg-[#2A6CFF] font-black uppercase tracking-[0.2em] text-[10px] w-full h-14 rounded-2xl shadow-glow-blue transition-all"
                onClick={() => setCalendarView("tactical")}
              >
                View Tactical Route View
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    )}

      {/* Time Block Dialog */}
      <Dialog open={showTimeBlockDialog} onOpenChange={setShowTimeBlockDialog}>
        <DialogContent className="max-w-xl bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black flex flex-col">
          <DialogHeader className="p-8 border-b border-white/5 bg-black/40 shrink-0">
            <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase">
              {editingTimeBlock ? "Modify Time Block" : "New Time Block"}
            </DialogTitle>
          </DialogHeader>
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="blockTitle">Reason (Title)</Label>
              <Input
                id="blockTitle"
                value={timeBlockForm.title}
                onChange={(e) => setTimeBlockForm({ ...timeBlockForm, title: e.target.value })}
                placeholder="e.g. Day Off, Doctor Appointment"
                className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={timeBlockForm.type} onValueChange={(v: "full_day" | "partial") => setTimeBlockForm({ ...timeBlockForm, type: v })}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10 text-white">
                  <SelectItem value="full_day">Full Day(s)</SelectItem>
                  <SelectItem value="partial">Partial Day</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{timeBlockForm.type === 'full_day' ? 'Start Date' : 'Date'}</Label>
                <Input
                  type="date"
                  value={timeBlockForm.date}
                  onChange={(e) => setTimeBlockForm({ ...timeBlockForm, date: e.target.value })}
                  className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12"
                  pattern="\d{4}-\d{2}-\d{2}"
                />
              </div>
              {timeBlockForm.type === 'full_day' && (
                <div className="space-y-2">
                  <Label>End Date (Optional)</Label>
                  <Input
                    type="date"
                    value={timeBlockForm.endDate}
                    onChange={(e) => setTimeBlockForm({ ...timeBlockForm, endDate: e.target.value })}
                    className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12"
                    pattern="\d{4}-\d{2}-\d{2}"
                  />
                </div>
              )}
              {timeBlockForm.type === 'partial' && (
                <>
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={timeBlockForm.startTime}
                      onChange={(e) => setTimeBlockForm({ ...timeBlockForm, startTime: e.target.value })}
                      className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={timeBlockForm.endTime}
                      onChange={(e) => setTimeBlockForm({ ...timeBlockForm, endTime: e.target.value })}
                      className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                value={timeBlockForm.notes}
                onChange={(e) => setTimeBlockForm({ ...timeBlockForm, notes: e.target.value })}
                className="bg-white/5 border-white/10 text-white font-bold rounded-xl min-h-[100px]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="ghost"
                onClick={() => setShowTimeBlockDialog(false)}
                className="text-gray-400 font-bold hover:text-white hover:bg-white/5 rounded-xl h-12 px-6"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  try {
                    if (!timeBlockForm.date) {
                      toast.error("Please fill required fields (Date)");
                      return;
                    }
                    if (timeBlockForm.type === "partial" && (!timeBlockForm.startTime || !timeBlockForm.endTime)) {
                      toast.error("Please provide start and end time for partial day.");
                      return;
                    }
                    if (timeBlockForm.type === "partial" && timeBlockForm.startTime >= timeBlockForm.endTime) {
                      toast.error("End time must be after start time");
                      return;
                    }
                    
                    if (timeBlockForm.type === "full_day" && timeBlockForm.endDate && timeBlockForm.date > timeBlockForm.endDate) {
                      toast.error("End date must be on or after start date");
                      return;
                    }

                    const data = {
                      title: timeBlockForm.title || "Blocked",
                      type: timeBlockForm.type,
                      date: timeBlockForm.date,
                      endDate: timeBlockForm.endDate || timeBlockForm.date,
                      startTime: timeBlockForm.startTime,
                      endTime: timeBlockForm.endTime,
                      notes: timeBlockForm.notes,
                      userId: profile?.id || "unknown"
                    };

                    if (editingTimeBlock) {
                      await updateDoc(doc(db, "blocked_dates", editingTimeBlock.id), data);
                      toast.success("Blocked date updated");
                    } else {
                      await addDoc(collection(db, "blocked_dates"), data);
                      toast.success("Blocked date created");
                    }
                    setShowTimeBlockDialog(false);
                  } catch (e: any) {
                    console.error("Error saving time block:", e);
                    toast.error("Failed to save blocked date");
                  }
                }}
                className="bg-primary hover:bg-[#2A6CFF] text-white font-bold rounded-xl h-12 px-8 shadow-glow-blue"
              >
                {editingTimeBlock ? "Update Block" : "Create Block"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Navigation App Selection Modal */}
      <AnimatePresence>
        {navDialogApp && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setNavDialogApp(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative w-full max-w-xs bg-card border border-white/10 p-6 rounded-[2.5rem] shadow-2xl shadow-black z-[101]"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-white tracking-tight">Navigate To</h3>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setNavDialogApp(null)}
                  className="h-8 w-8 rounded-full bg-white/5 text-white/50 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-3">
                <Button
                  className="w-full h-14 bg-[#4285F4]/10 text-[#4285F4] hover:bg-[#4285F4]/20 border border-[#4285F4]/20 rounded-2xl font-bold uppercase tracking-widest text-[11px] justify-start px-5"
                  onClick={() => {
                    const encoded = encodeURIComponent(navDialogApp?.address || "");
                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
                    setNavDialogApp(null);
                  }}
                >
                  <Map className="w-4 h-4 mr-3" />
                  Google Maps
                </Button>
                <Button
                  className="w-full h-14 bg-[#33CCFF]/10 text-[#33CCFF] hover:bg-[#33CCFF]/20 border border-[#33CCFF]/20 rounded-2xl font-bold uppercase tracking-widest text-[11px] justify-start px-5"
                  onClick={() => {
                    const encoded = encodeURIComponent(navDialogApp?.address || "");
                    window.open(`https://waze.com/ul?q=${encoded}&navigate=yes`, '_blank');
                    setNavDialogApp(null);
                  }}
                >
                  <MapPin className="w-4 h-4 mr-3" />
                  Waze
                </Button>
                <Button
                  className="w-full h-14 bg-white/10 text-white hover:bg-white/20 border border-white/20 rounded-2xl font-bold uppercase tracking-widest text-[11px] justify-start px-5"
                  onClick={() => {
                    const encoded = encodeURIComponent(navDialogApp?.address || "");
                    window.open(`https://maps.apple.com/?daddr=${encoded}`, '_blank');
                    setNavDialogApp(null);
                  }}
                >
                  <Navigation2 className="w-4 h-4 mr-3" />
                  Apple Maps
                </Button>
                
                <div className="pt-4 mt-2">
                  <Button
                    variant="ghost"
                    className="w-full h-12 text-white/40 hover:text-white uppercase tracking-[0.2em] font-black text-[9px] rounded-xl"
                    onClick={() => setNavDialogApp(null)}
                  >
                    Close Portal
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detailed App / Command Center View */}
      <Dialog open={!!selectedDetailedApp} onOpenChange={(val) => !val && setSelectedDetailedApp(null)}>
        <DialogContent className="max-w-xl bg-card border-none p-0 overflow-hidden rounded-[2.5rem] shadow-2xl shadow-black flex flex-col">
          {selectedDetailedApp && (() => {
            const app = selectedDetailedApp;
            const appStopIndex = optimizedStops.findIndex(s => s.id === app.id);
            let travelTimeMins = 0;
            let travelWarning = false;
            let nextStop = null;
            if (appStopIndex !== -1 && appStopIndex < optimizedStops.length - 1) {
              nextStop = optimizedStops[appStopIndex + 1];
              travelTimeMins = Math.round((nextStop.travelTimeFromPrevious || 0) / 60);
              if (travelTimeMins > 20) {
                travelWarning = true;
              }
            }

            const isCompleted = app.status === 'completed' || app.status === 'paid';
            const isStarted = isCompleted || app.status === 'in_progress';
            const isOnWay = isStarted || app.status === 'en_route';

            return (
              <>
                <DialogHeader className="p-8 border-b border-white/5 bg-black/40 shrink-0 relative">
                  <div className="absolute top-4 right-4">
                    <Button variant="ghost" size="icon" onClick={() => setSelectedDetailedApp(null)} className="h-8 w-8 rounded-full bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-all">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-primary/10 rounded-2xl border border-primary/20 flex items-center justify-center text-primary shadow-glow-blue shrink-0">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <div>
                      <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase pr-8">
                        {getClientDisplayName(app)}
                      </DialogTitle>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3" />
                         {app.scheduledAt?.toDate ? safeFormat(app.scheduledAt.toDate(), "MMM do, yyyy • h:mm a") : ""}
                      </p>
                    </div>
                  </div>
                </DialogHeader>
                
                <div className="p-8 space-y-8 overflow-y-auto max-h-[60vh] custom-scrollbar">
                  {/* Job Status Timeline */}
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black tracking-widest uppercase text-white/50">Mission Status Timeline</h3>
                    <div className="relative flex justify-between">
                      <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-white/5 -translate-y-1/2" />
                      <div className={`absolute top-1/2 left-4 h-0.5 bg-primary -translate-y-1/2 transition-all duration-500`} style={{ right: app.status === 'arrived' || isStarted || isCompleted ? '1rem' : isOnWay ? '50%' : 'calc(100% - 2rem)' }} />
                      
                      <div className="relative z-10 flex flex-col items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-4 border-card transition-all ${true ? 'bg-primary text-white shadow-lg shadow-primary/40' : 'bg-gray-800 text-gray-500'}`}>
                          <CalendarIcon className="w-3 h-3" />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-white">Scheduled</span>
                      </div>
                      
                      <div className="relative z-10 flex flex-col items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-4 border-card transition-all ${isOnWay ? 'bg-primary text-white shadow-lg shadow-primary/40' : 'bg-gray-800 text-gray-500'}`}>
                          <Navigation2 className="w-3 h-3" />
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-widest ${isOnWay ? 'text-white' : 'text-gray-500'}`}>On The Way</span>
                      </div>
                      
                      <div className="relative z-10 flex flex-col items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-4 border-card transition-all ${app.status === 'arrived' || isStarted || isCompleted ? 'bg-primary text-white shadow-lg shadow-primary/40' : 'bg-gray-800 text-gray-500'}`}>
                          <MapPin className="w-3 h-3" />
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-widest ${app.status === 'arrived' || isStarted || isCompleted ? 'text-white' : 'text-gray-500'}`}>Arrived</span>
                      </div>
                    </div>
                  </div>

                  {/* Travel Awareness */}
                  {nextStop && (
                    <div className={`p-4 rounded-2xl border ${travelWarning ? 'bg-red-500/10 border-red-500/20' : 'bg-blue-500/10 border-blue-500/20'} flex flex-col gap-2`}>
                      <div className="flex items-center gap-2">
                        <Navigation2 className={`w-4 h-4 ${travelWarning ? 'text-red-400' : 'text-blue-400'}`} />
                        <h4 className={`text-xs font-black uppercase tracking-widest ${travelWarning ? 'text-red-400' : 'text-blue-400'}`}>Travel to Next Job</h4>
                      </div>
                      <p className="text-white text-sm font-bold">
                         {travelTimeMins} mins estimated distance.
                      </p>
                      {travelWarning && (
                        <p className="text-[10px] text-red-400/80 font-bold uppercase tracking-widest bg-red-500/10 px-2 py-1 rounded inline-block w-fit">
                          Warning: Travel time exceeds 20 minutes
                        </p>
                      )}
                    </div>
                  )}

                  {/* Details */}
                   <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-1 mb-4">
                     <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Location</p>
                     <p className="text-sm font-bold text-white truncate">{app.address || "No address"}</p>
                   </div>

                     {/* Vehicles Section */}
                     <div className="space-y-3 mb-4">
                       <h3 className="text-[10px] text-gray-500 font-bold uppercase tracking-widest px-1">VEHICLE(S) BEING SERVICED</h3>
                       {(app.vehicleIds?.length > 0) ? (
                         <div className="space-y-3">
                           {app.vehicleIds.map((vId: string) => {
                             const vData = detailedAppVehicles.find(v => v.id === vId);
                             // Filter services matching this vehicle
                             const assignedServices = app.serviceSelections?.filter((s: any) => s.vehicleId === vId || !s.vehicleId) || [];
                             const serviceNames = assignedServices.map((s: any) => services.find(srv => srv.id === s.id)?.name || s.name).filter(Boolean);
                             
                             if (!vData) {
                               // Fallback if not loaded yet or missing
                               return (
                                 <div key={vId} className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-1">
                                   <p className="text-sm font-bold text-white">Loading vehicle data...</p>
                                   <p className="text-[10px] text-gray-400 capitalize">{serviceNames.join(", ") || "No services assigned"}</p>
                                 </div>
                               );
                             }
  
                             return (
                               <div key={vId} className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-2 relative overflow-hidden">
                                 <div className="absolute top-0 right-0 p-3">
                                   <div className="w-1.5 h-1.5 rounded-full bg-primary/50 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                                 </div>
                                 <div>
                                   <p className="text-base font-black text-white">{vData.year} {vData.make} {vData.model}</p>
                                   <p className="text-xs text-gray-400 font-medium">
                                     {vData.type || vData.size || "Standard"} • {vData.color || "No color"}
                                     {vData.licensePlate && ` • LXP: ${vData.licensePlate}`}
                                   </p>
                                 </div>
                                 {serviceNames.length > 0 && (
                                   <div className="mt-1">
                                     <p className="text-[10px] text-primary/80 font-bold uppercase tracking-widest bg-primary/10 inline-block px-2 py-0.5 rounded">
                                       {serviceNames.join(", ")}
                                     </p>
                                   </div>
                                 )}
                               </div>
                             )
                           })}
                         </div>
                       ) : app.vehicleInfo || (app.vehicleNames && app.vehicleNames.length > 0) ? (
                         <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-2 relative overflow-hidden">
                           <div className="absolute top-0 right-0 p-3">
                             <div className="w-1.5 h-1.5 rounded-full bg-primary/50 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                           </div>
                           <div>
                             <p className="text-base font-black text-white">{app.vehicleInfo || app.vehicleNames?.join(", ")}</p>
                             {app.vehicleSize && (
                                <p className="text-xs text-gray-400 font-medium capitalize">
                                  {app.vehicleSize}
                                </p>
                             )}
                           </div>
                           {app.serviceNames?.length > 0 && (
                             <div className="mt-1">
                               <p className="text-[10px] text-primary/80 font-bold uppercase tracking-widest bg-primary/10 inline-block px-2 py-0.5 rounded">
                                 {app.serviceNames.join(", ")}
                               </p>
                             </div>
                           )}
                         </div>
                       ) : (
                         <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-1 text-center items-center justify-center py-6">
                           <p className="text-sm font-bold text-gray-400">No vehicle assigned</p>
                         </div>
                       )}
                     </div>

                  {/* Action Controls */}
                  <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/5">
                    <Button 
                      className={`h-12 rounded-xl font-black uppercase tracking-widest text-[9px] shadow-lg transition-all ${app.status === 'en_route' ? 'bg-primary text-white ring-2 ring-primary ring-offset-2 ring-offset-card' : 'bg-white/5 text-white hover:bg-primary/20 hover:text-primary border border-white/10'}`}
                      onClick={() => handleJobStatusUpdate('en_route')}
                    >
                      <Navigation2 className="w-3 h-3 mr-1.5" /> En Route
                    </Button>
                    <Button 
                      className="h-12 rounded-xl font-black uppercase tracking-widest text-[9px] shadow-lg transition-all bg-white/5 text-white hover:bg-white/20 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => setNavDialogApp(app)}
                      disabled={!app.address}
                      title={!app.address ? "No address available" : "Open in Maps"}
                    >
                      <Map className="w-3 h-3 mr-1.5" /> Navigate
                    </Button>
                    <Button 
                      className={`h-12 rounded-xl font-black uppercase tracking-widest text-[9px] shadow-lg transition-all ${app.status === 'arrived' ? 'bg-orange-500 text-white ring-2 ring-orange-500 ring-offset-2 ring-offset-card' : 'bg-white/5 text-white hover:bg-orange-500/20 hover:text-orange-500 border border-white/10'}`}
                      onClick={() => handleJobStatusUpdate('arrived')}
                    >
                      <MapPin className="w-3 h-3 mr-1.5" /> Arrived
                    </Button>
                  </div>
                  
                  <div className="flex justify-center mt-4 pt-4 border-t border-white/5">
                    <Button 
                      className="w-full bg-primary/20 hover:bg-primary text-white font-black h-12 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-[0_0_15px_rgba(10,77,255,0.45)] hover:shadow-[0_0_25px_rgba(10,77,255,0.65)] transition-all hover:scale-105 border border-primary/30" 
                      onClick={() => {
                        setSelectedDetailedApp(null);
                        navigate(`/calendar/${app.id}`);
                      }}
                    >
                      OPEN JOB DETAILS
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4 animate-in slide-in-from-bottom-10">
          <div className="bg-gray-900 border border-white/10 rounded-3xl p-4 shadow-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 px-4">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-black shadow-glow-blue">
                {selectedIds.length}
              </div>
              <div>
                <p className="text-white font-black uppercase tracking-widest text-[10px]">Jobs Selected</p>
                <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest">Bulk Tactical Actions Available</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                className="text-gray-400 hover:text-white font-black uppercase tracking-widest text-[10px] h-12 px-6 rounded-xl"
                onClick={() => {
                  setSelectedIds([]);
                  setIsSelectionMode(false);
                }}
              >
                Cancel
              </Button>
              
              <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
                <AlertDialogTrigger render={
                  <Button 
                    className="bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest text-[10px] h-12 px-8 rounded-xl shadow-glow-red"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Abort Selected
                  </Button>
                } />
                <AlertDialogContent className="bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black sm:max-w-[500px]">
                  <AlertDialogHeader className="p-8 border-b border-white/5 bg-black/40">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20">
                        <AlertTriangle className="w-6 h-6" />
                      </div>
                      <div>
                        <AlertDialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">Mass Termination</AlertDialogTitle>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">Destructive Protocol Authorization</p>
                      </div>
                    </div>
                  </AlertDialogHeader>
                  <div className="p-8 space-y-6">
                    <AlertDialogDescription className="text-gray-400 font-bold text-sm leading-relaxed">
                      You are about to terminate <span className="text-primary font-black">{selectedIds.length}</span> tactical deployments. This action is irreversible and will purge all associated mission data from the primary log.
                    </AlertDialogDescription>
                    
                    <div className="flex items-center gap-4 pt-4">
                      <AlertDialogCancel className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] border-white/10 hover:bg-white/5 text-gray-400 hover:text-white transition-all">
                        Abort Protocol
                      </AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleBulkDelete}
                        className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-red-600 text-white hover:bg-red-700 shadow-glow-red transition-all hover:scale-105"
                        disabled={isDeletingBulk}
                      >
                        {isDeletingBulk ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Confirm Purge
                      </AlertDialogAction>
                    </div>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      )}
      {/* Day Events Modal */}
      <Dialog open={!!selectedDayEvents} onOpenChange={(val) => !val && setSelectedDayEvents(null)}>
        <DialogContent className="max-w-md bg-zinc-950 border-white/5 rounded-3xl p-0 overflow-hidden shadow-2xl">
          <DialogHeader className="p-6 border-b border-white/5 bg-black/40">
            <DialogTitle className="text-xl font-black text-white uppercase tracking-tighter">
              Day Deployments: {selectedDayEvents?.day ? safeFormat(selectedDayEvents.day, "MMM d, yyyy") : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto no-scrollbar">
            {selectedDayEvents?.events.map((evt: any) => (
              <div 
                key={evt.id}
                className="p-4 rounded-2xl bg-[#121212] border border-white/5 hover:bg-white/5 cursor-pointer transition-all flex items-center justify-between gap-4 group"
                onClick={() => {
                  setSelectedDetailedApp(evt.resource);
                  setSelectedDayEvents(null);
                }}
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-[11px] font-black text-white uppercase truncate">{evt.title}</span>
                  <div className="flex items-center gap-1.5 text-[9px] text-white/40 font-bold uppercase tracking-widest">
                    <Clock className="w-3 h-3 text-primary" />
                    {safeFormat(evt.start, "h:mm a")}
                  </div>
                </div>
                <Badge className={cn(
                  "text-[8px] font-black px-2 py-0.5 border-none uppercase tracking-widest shrink-0", 
                  getStatusColor(evt.status || 'scheduled', evt.resource?.isVip)
                )}>
                  {evt.status?.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  </div>
);
}
