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
import { Clock, MapPin, User, Car, Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, List, Settings2, Loader2, RefreshCw, AlertTriangle, Search, Filter, MoreHorizontal, Phone, Mail, ArrowRight, Star, Truck, Repeat, Trash2, Save, ChevronDown, ExternalLink, FileText, Lock, Sparkles, Crown, Globe } from "lucide-react";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, startOfDay, endOfDay, isSameDay, addDays, subDays, addHours, addWeeks, addMonths, subMonths, startOfMonth, endOfMonth, isBefore, parseISO, parse, startOfWeek, getDay, addMinutes } from "date-fns";
import { enUS } from "date-fns/locale";
import { Calendar as BigCalendar, dateFnsLocalizer, Views } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { motion, AnimatePresence } from "motion/react";
import { cn, formatDuration, getClientDisplayName } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import { useGoogleMaps } from "../components/GoogleMapsProvider";
import { GoogleMap, Marker, Polyline, InfoWindow, MarkerClusterer } from "@react-google-maps/api";
import { optimizeRoute, RouteStop } from "../lib/scheduling";
import { Switch } from "@/components/ui/switch";
import AddressInput from "../components/AddressInput";
import VehicleSelector from "../components/VehicleSelector";
import { StableInput } from "../components/StableInput";
import { BusinessSettings } from "../types";
import { getGeocode, getLatLng } from "use-places-autocomplete";
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
import { createNotification } from "../services/notificationService";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { locale: enUS }),
  getDay,
  locales: { "en-US": enUS },
});

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
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  
  const [timeBlocks, setTimeBlocks] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);

  const { isLoaded } = useGoogleMaps();

  const events = useMemo(() => {
    const appEvents = appointments.map((app: any) => {
      const start = app.scheduledAt?.toDate ? app.scheduledAt.toDate() : new Date(app.scheduledAt);
      const duration = app.estimatedDuration || 120;
      const end = addMinutes(start, duration + (app.overrideBufferTimeMinutes || 0));
      return {
        id: app.id,
        title: `${getClientDisplayName(clients.find(c => c.id === (app.clientId || app.customerId)))}`,
        start,
        end,
        resource: app,
        type: "appointment",
        status: app.status
      };
    });

    const blockEvents = timeBlocks.map((block: any) => {
      const start = block.start?.toDate ? block.start.toDate() : new Date(block.start);
      const end = block.end?.toDate ? block.end.toDate() : new Date(block.end);
      return {
        id: block.id,
        title: `BLOCK: ${block.title}`,
        start,
        end,
        resource: block,
        type: "block"
      };
    });

    const gEvents = googleEvents.map((event: any) => {
      const start = new Date(event.start.dateTime || event.start.date);
      const end = new Date(event.end.dateTime || event.end.date);
      return {
        id: event.id,
        title: `G: ${event.summary}`,
        start,
        end,
        resource: event,
        type: "google"
      };
    });

    return [...appEvents, ...blockEvents, ...gEvents];
  }, [appointments, timeBlocks, googleEvents, clients]);

  // Appointment Form State
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showTimeBlockDialog, setShowTimeBlockDialog] = useState(false);
  const [editingTimeBlock, setEditingTimeBlock] = useState<any>(null);
  const [timeBlockForm, setTimeBlockForm] = useState({
    title: "",
    type: "time_off" as "time_off" | "busy" | "unavailable",
    start: "",
    end: "",
    notes: ""
  });
  const [isCreating, setIsCreating] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const [viewingAppointment, setViewingAppointment] = useState<any>(null);
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
  const [isAddressManual, setIsAddressManual] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<"daily" | "weekly" | "biweekly" | "monthly">("weekly");
  const [recurringInterval, setRecurringInterval] = useState(1);
  const [recurringEndDate, setRecurringEndDate] = useState("");
  const [recurringOccurrences, setRecurringOccurrences] = useState<number | "">("");
  const [scheduledAtValue, setScheduledAtValue] = useState("");
  const [appointmentStatus, setAppointmentStatus] = useState<string>("scheduled");
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [appointment, setAppointment] = useState({ 
    vehicleSize: "medium",
    vehicleInfo: "",
    vin: "",
    jobNum: "",
  });

  useEffect(() => {
    if (authLoading || !profile) return;

    // Data fetcher for Calendar metadata (Fetch once on mount to save quota)
    const fetchCalendarData = async () => {
      try {
        const startOfRange = startOfMonth(subMonths(new Date(), 3));
        const endOfRange = endOfMonth(addMonths(new Date(), 3));

        const [apptsSnap, tbSnap, clientsSnap, servicesSnap, addonsSnap, settingsSnap] = await Promise.all([
          getDocs(query(
            collection(db, "appointments"), 
            where("scheduledAt", ">=", Timestamp.fromDate(startOfRange)),
            where("scheduledAt", "<=", Timestamp.fromDate(endOfRange)),
            orderBy("scheduledAt", "asc")
          )),
          getDocs(query(collection(db, "time_blocks"), orderBy("start", "asc"))),
          getDocs(query(collection(db, "clients"), limit(200))),
          getDocs(collection(db, "services")),
          getDocs(collection(db, "addons")),
          getDoc(doc(db, "settings", "business"))
        ]);

        const appointmentsData = apptsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAppointments(appointmentsData);
        setTimeBlocks(tbSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setClients(clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setServices(servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((s: any) => s.isActive));
        setAddons(addonsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((a: any) => a.isActive));
        
        if (settingsSnap.exists()) setSettings(settingsSnap.data() as BusinessSettings);
        
        setLoading(false);
      } catch (error) {
        console.error("Error fetching calendar data:", error);
        setLoading(false);
        toast.error("Failed to load calendar data. Quota may be exceeded.");
      }
    };

    fetchCalendarData();
    
    return () => {};
  }, [profile, authLoading]);

  // Handle automatic route optimization when date or appointments change
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

    if (location.state && (location.state.lead || location.state.openAddDialog || location.state.editingAppointmentId)) {
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
      } else if (location.state.editingAppointmentId) {
        const appToEdit = appointments.find(a => a.id === location.state.editingAppointmentId);
        if (appToEdit) {
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

  // Auto-fill address when client is selected
  useEffect(() => {
    if (selectedCustomerId && showAddDialog) {
      const c = clients.find(item => item.id === selectedCustomerId);
      
      // Only auto-fill if the current address is empty
      if (c && c.address && !appointmentAddress.address) {
        handleAddressSelect(c.address, c.latitude || c.lat || 0, c.longitude || c.lng || 0, true);
      }

      // Fetch vehicles
      const q = query(
        collection(db, "vehicles"),
        where("clientId", "==", selectedCustomerId)
      );
      getDocs(q).then(snap => {
        const vehicles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAvailableVehicles(vehicles);
        
        // If there's only one vehicle, pre-fill it and select it
        if (vehicles.length === 1) {
          const v = vehicles[0] as any;
          setAppointment(prev => ({ 
            ...prev, 
            vehicleInfo: `${v.year} ${v.make} ${v.model}`, 
            vehicleSize: v.size || "medium", 
            vin: v.vin || "" 
          }));
          setSelectedVehicleIds([v.id]);
        }
      });
    } else {
      setAvailableVehicles([]);
      setSelectedVehicleIds([]);
      setAppointment(prev => ({ ...prev, vehicleInfo: "", vin: "" }));
    }
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
        setSelectedServices(editingAppointment.serviceSelections || []);
        setSelectedAddons(editingAppointment.addOnSelections || []);
        setWaiverAccepted(editingAppointment.waiverAccepted || false);
        setDiscount(editingAppointment.discountAmount || 0);
        setRedeemedPoints(editingAppointment.redeemedPoints || 0);
        setAppointmentStatus(editingAppointment.status || "scheduled");
        
        if (editingAppointment.scheduledAt) {
          const date = editingAppointment.scheduledAt.toDate ? editingAppointment.scheduledAt.toDate() : new Date(editingAppointment.scheduledAt);
          setScheduledAtValue(format(date, "yyyy-MM-dd'T'HH:mm"));
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
        setScheduledAtValue("");
        setAppointmentStatus("scheduled");
        setActiveLeadId(null);
        setEditingAppointment(null);
      }, 300); // clear after close animation
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [showAddDialog, editingAppointment, settings]);

  const [calculatedDeposit, setCalculatedDeposit] = useState(0);

  useEffect(() => {
    let total = 0;
    let depositTotal = 0;
    const client = clients.find(c => c.id === selectedCustomerId);
    const isVIP = client?.isVIP;
    const vipSettings = client?.vipSettings;

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
    setCalculatedDeposit(depositTotal);
  }, [selectedServices, selectedAddons, appointment.vehicleSize, services, addons, selectedCustomerId, clients, selectedVehicleIds, availableVehicles]);

  const handleAddressSelect = async (address: string, lat: number, lng: number, structured?: any) => {
    let finalLat = lat;
    let finalLng = lng;

    if (lat === 0 && address) {
      try {
        const results = await getGeocode({ address });
        if (results && results.length > 0) {
          const coords = await getLatLng(results[0]);
          finalLat = coords.lat;
          finalLng = coords.lng;
        }
      } catch (error) {
        console.error("Geocoding failed in handleAddressSelect:", error);
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

  const handleConvertToInvoice = async (app: any) => {
    try {
      const invoiceData = {
        clientId: app.clientId || app.customerId || "manual",
        clientName: app.customerName || "Unknown Client",
        clientEmail: app.customerNotes?.includes("Email:") ? app.customerNotes.split("Email:")[1].split("\n")[0].trim() : (app.customerEmail || ""), 
        clientPhone: app.customerPhone || "",
        clientAddress: app.address || "",
        vehicles: app.vehicleIds?.map((id: string) => {
          const v = availableVehicles.find(veh => veh.id === id);
          return {
            id: id,
            year: v?.year || "",
            make: v?.make || "",
            model: v?.model || "",
            roNumber: app.roNumber || ""
          };
        }) || [],
        vehicleInfo: app.vehicleInfo || "",
        lineItems: [
          ...(app.serviceNames || []).map((name: string, idx: number) => ({
            serviceName: name,
            price: app.serviceSelections?.[idx]?.price || 0
          })),
          ...(app.addOnNames || []).map((name: string, idx: number) => ({
            serviceName: name,
            price: app.addOnSelections?.[idx]?.price || 0
          }))
        ].filter(item => item.price > 0),
        total: app.totalAmount || 0,
        status: "draft",
        paymentStatus: app.paymentStatus || "pending",
        amountPaid: app.depositPaid ? (app.depositAmount || 0) : 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, "invoices"), invoiceData);
      toast.success("Deployment converted to Invoice successfully");
      setViewingAppointment(null);
      
      // Wait for Dialog unmount animation to complete before routing
      setTimeout(() => {
        navigate("/invoices");
      }, 350);
    } catch (error) {
      console.error("Error converting to invoice:", error);
      toast.error("Failed to convert to invoice");
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsCreating(true);
    const formData = new FormData(e.currentTarget);
    
    const clientId = selectedCustomerId;
    const client = clients.find(c => c.id === clientId);
    
    // Use the calculated baseAmount state instead of reading from formData to ensure VIP overrides are preserved
    const totalAmount = baseAmount;
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

    const totalDuration = selectedServices.reduce((acc, s) => {
      const service = services.find(srv => srv.id === s.id);
      return acc + (service?.estimatedDuration || 0) * s.qty;
    }, 0) + selectedAddons.reduce((acc, a) => {
      const addon = addons.find(ad => ad.id === a.id);
      return acc + (addon?.estimatedDuration || 0) * a.qty;
    }, 0);

    const totalBuffer = selectedServices.reduce((acc, s) => {
      const service = services.find(srv => srv.id === s.id);
      return acc + (service?.bufferTimeMinutes || 0);
    }, 0) + selectedAddons.reduce((acc, a) => {
      const addon = addons.find(ad => ad.id === a.id);
      return acc + (addon?.bufferTimeMinutes || 0);
    }, 0);

    // Conflict detection logic
    const appointmentStart = new Date(formData.get("scheduledAt") as string);
    const appointmentEnd = addHours(appointmentStart, (totalDuration + totalBuffer) / 60);

    const hasTimeBlockConflict = timeBlocks.some(block => {
      const blockStart = block.start.toDate();
      const blockEnd = block.end.toDate();
      return (appointmentStart < blockEnd && appointmentEnd > blockStart);
    });

    const hasGoogleConflict = googleEvents.some(event => {
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);
      return (appointmentStart < eventEnd && appointmentEnd > eventStart);
    });

    const hasAppointmentConflict = appointments.some(app => {
      if (editingAppointment && app.id === editingAppointment.id) return false;
      const appStart = app.scheduledAt.toDate();
      const appEnd = addHours(appStart, (app.estimatedDuration || 120) / 60);
      return (appointmentStart < appEnd && appointmentEnd > appStart);
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
    const startAt = scheduledAtValue ? new Date(scheduledAtValue) : new Date(formData.get("scheduledAt") as string);

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
      baseAmount: totalAmount,
      discountAmount: discount + redeemedPoints,
      totalAmount: finalAmount,
      depositAmount: calculatedDeposit,
      depositPaid: false,
      cancellationFeeEnabled,
      cancellationFeeAmount,
      cancellationFeeType,
      cancellationCutoffHours,
      cancellationStatus: "none",
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
      leadId: activeLeadId || null
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
          const gRes = await syncWithGoogle(appointmentData, editingAppointment.googleEventId);
          if (gRes?.id) appointmentData.googleEventId = gRes.id;
          await updateDoc(doc(db, "appointments", editingAppointment.id), appointmentData);
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
          await addDoc(collection(db, "appointments"), {
            ...appointmentData,
            createdAt: serverTimestamp(),
          });

          // Trigger Notification
          await createNotification({
            userId: profile!.id,
            title: "New Tactical Deployment",
            message: `New booking for ${appointmentData.customerName} scheduled for ${format(startAt, "MMM d, h:mm a")}`,
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
    if (!date || !block.start) return false;
    const blockDate = block.start.toDate ? block.start.toDate() : new Date(block.start);
    return isSameDay(blockDate, date);
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

  const handleLongPress = (id: string) => {
    setIsSelectionMode(true);
    toggleSelect(id);
  };

  const CalendarEvent = ({ event }: { event: any }) => {
    if (event.type === 'block') {
      return (
        <div className="text-[11px] font-bold p-1 overflow-hidden h-full flex items-center bg-amber-500/10 text-amber-500 rounded border border-amber-500/20">
          <Lock className="w-3 h-3 inline mr-1" />
          {event.title}
        </div>
      );
    }
    
    if (event.type === 'google') {
      return (
        <div className="text-[11px] font-bold p-1 overflow-hidden text-blue-400 bg-blue-500/10 rounded h-full flex items-center border border-blue-500/20">
          <CalendarIcon className="w-3 h-3 inline mr-1" />
          {event.title}
        </div>
      );
    }

    const app = event.resource;
    return (
      <div className="h-full flex flex-col p-2 overflow-hidden gap-1 hover:brightness-110 transition-all">
        <div className="flex items-center justify-between gap-1 overflow-hidden">
          <span className="text-[11px] font-black uppercase truncate text-white tracking-widest leading-none">{event.title}</span>
          <Badge className={cn("text-[9px] font-black px-1 py-0 h-4 border-none uppercase tracking-tighter", statusColors[app.status || 'scheduled'])}>
            {app.status}
          </Badge>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-white/50 font-bold uppercase tracking-wider">
          <Clock className="w-3 h-3 shrink-0" />
          {format(event.start, "h:mm a")}
        </div>
        {app.address && (
          <div className="flex items-center gap-1 text-[8px] text-white/40 truncate">
            <MapPin className="w-2.5 h-2.5 shrink-0" />
            {app.address}
          </div>
        )}
      </div>
    );
  };

  const eventPropGetter = (event: any) => {
    let backgroundColor = "rgba(239, 68, 68, 0.1)"; // Default red
    let borderColor = "rgba(239, 68, 68, 0.2)";
    let borderLeft = "3px solid #ef4444";

    if (event.type === 'block') {
      backgroundColor = "rgba(245, 158, 11, 0.1)";
      borderColor = "rgba(245, 158, 11, 0.2)";
      borderLeft = "3px solid #f59e0b";
    } else if (event.type === 'google') {
      backgroundColor = "rgba(59, 130, 246, 0.1)";
      borderColor = "rgba(59, 130, 246, 0.2)";
      borderLeft = "3px solid #3b82f6";
    }

    return {
      style: {
        backgroundColor,
        borderColor,
        borderLeft,
        borderRadius: "8px",
        padding: 0,
        margin: 0
      }
    };
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
                variant={calendarView === "month" ? "secondary" : "ghost"} 
                size="sm" 
                onClick={() => setCalendarView("month")}
                className={cn(
                  "h-10 px-4 rounded-xl font-black uppercase tracking-widest text-[11px] transition-all shrink-0", 
                  calendarView === "month" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/40 hover:text-white"
                )}
              >
                Month
              </Button>
              <Button 
                variant={calendarView === "week" ? "secondary" : "ghost"} 
                size="sm" 
                onClick={() => setCalendarView("week")}
                className={cn(
                  "h-10 px-4 rounded-xl font-black uppercase tracking-widest text-[11px] transition-all shrink-0", 
                  calendarView === "week" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/40 hover:text-white"
                )}
              >
                Week
              </Button>
              <Button 
                variant={calendarView === "day" ? "secondary" : "ghost"} 
                size="sm" 
                onClick={() => setCalendarView("day")}
                className={cn(
                  "h-10 px-4 rounded-xl font-black uppercase tracking-widest text-[11px] transition-all shrink-0", 
                  calendarView === "day" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/40 hover:text-white"
                )}
              >
                Day
              </Button>
              <Button 
                variant={calendarView === "agenda" ? "secondary" : "ghost"} 
                size="sm" 
                onClick={() => setCalendarView("agenda")}
                className={cn(
                  "h-10 px-4 rounded-xl font-black uppercase tracking-widest text-[11px] transition-all shrink-0", 
                  calendarView === "agenda" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/40 hover:text-white"
                )}
              >
                Agenda
              </Button>
              <div className="w-px h-6 bg-white/10 mx-1 shrink-0" />
              <Button 
                variant={calendarView === "tactical" ? "secondary" : "ghost"} 
                size="sm" 
                onClick={() => setCalendarView("tactical")}
                className={cn(
                  "h-10 px-4 rounded-xl font-black uppercase tracking-widest text-[11px] transition-all shrink-0", 
                  calendarView === "tactical" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/40 hover:text-white"
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
                  calendarView === "list" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/40 hover:text-white"
                )}
              >
                <List className="w-4 h-4 mr-2" />
                List
              </Button>
            </div>
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
                  className="h-16 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-primary text-white hover:bg-red-700 shadow-xl shadow-primary/20 transition-all hover:scale-[1.02]"
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
          <Card className="lg:col-span-12 border-none shadow-xl bg-card rounded-[2.5rem] overflow-hidden p-6 h-[850px] transition-all duration-500 animate-in fade-in zoom-in-95">
            <BigCalendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              className="h-full font-sans"
              onSelectEvent={(event: any) => {
                if (event.type === 'appointment') {
                  setViewingAppointment(event.resource);
                } else if (event.type === 'block') {
                  setEditingTimeBlock(event.resource);
                  setTimeBlockForm({
                    title: event.resource.title,
                    type: event.resource.type || 'busy',
                    start: format(event.start, "yyyy-MM-dd'T'HH:mm"),
                    end: format(event.end, "yyyy-MM-dd'T'HH:mm"),
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
                event: CalendarEvent
              }}
            />
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
                        {format(date || new Date(), "MMM d, yyyy")}
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
                               <span className="text-[9px] font-black text-primary uppercase">{stop.scheduledAt?.toDate ? format(stop.scheduledAt.toDate(), "h:mm a") : "TBD"}</span>
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

                      {optimizedStops.length > 1 && (
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
                                const fullApp = appointments.find(a => a.id === selectedStop.id);
                                setViewingAppointment(fullApp || selectedStop);
                              }}
                            >
                              View Details
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
                  const blockDate = block.start?.toDate ? block.start.toDate() : new Date(block.start);
                  return isSameDay(blockDate, day);
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
                  {date ? format(date, "EEEE, MMMM d") : "Select a date"}
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
                        className="bg-primary hover:bg-red-700 text-white font-black uppercase tracking-widest text-[10px] h-12 px-6 rounded-xl shadow-lg shadow-primary/20 transition-all"
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
                      <form onSubmit={handleCreateAppointment} className="flex-1 flex flex-col overflow-hidden">
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
                                      <SelectContent className="bg-zinc-900 border-white/10 text-white font-bold">
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
                                              className="bg-primary hover:bg-red-700 text-white font-black text-[9px] h-7 px-3 rounded-lg uppercase tracking-widest shadow-lg shadow-primary/20"
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
                                              <span className="font-bold text-white">${(price * selection.qty).toFixed(2)}</span>
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
                                        <span className="font-bold text-white">${(price * selection.qty).toFixed(2)}</span>
                                      </div>
                                    );
                                  })
                                )}

                                {selectedAddons.map((selection, idx) => {
                                  const addon = addons.find(a => a.id === selection.id);
                                  return (
                                    <div key={`${selection.id}-${idx}`} className="flex justify-between text-[11px]">
                                      <span className="text-white/60">{addon?.name} (x{selection.qty})</span>
                                      <span className="font-bold text-white">${((addon?.price || 0) * selection.qty).toFixed(2)}</span>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="pt-2 border-t border-white/10 flex justify-between text-sm">
                                <span className="text-white/60">Subtotal</span>
                                <span className="font-bold text-white">${baseAmount.toFixed(2)}</span>
                              </div>
                              {discount > 0 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Discount</span>
                                  <span className="font-bold text-green-400">-${discount.toFixed(2)}</span>
                                </div>
                              )}
                              {redeemedPoints > 0 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-white/60">Loyalty Points</span>
                                  <span className="font-bold text-primary">-${redeemedPoints.toFixed(2)}</span>
                                </div>
                              )}
                              <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                                <span className="font-black text-white uppercase tracking-tighter">Final Total</span>
                                <span className="text-xl font-black text-white">
                                  ${(baseAmount - discount - redeemedPoints).toFixed(2)}
                                </span>
                              </div>
                              {calculatedDeposit > 0 && (
                                <>
                                  <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                                    <span className="font-black text-primary uppercase tracking-tighter">Deposit Due</span>
                                    <span className="text-lg font-black text-primary">
                                      ${calculatedDeposit.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="font-black text-white/60 uppercase tracking-tighter text-xs">Remaining Balance</span>
                                    <span className="text-sm font-black text-white/60">
                                      ${((baseAmount - discount - redeemedPoints) - calculatedDeposit).toFixed(2)}
                                    </span>
                                  </div>
                                </>
                              )}
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
                                  className="h-14 w-14 rounded-2xl border-white/10 hover:bg-red-500/10 hover:text-red-500 text-gray-400 transition-all"
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
                            className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-primary text-white hover:bg-red-700 shadow-xl shadow-primary/20 transition-all hover:scale-105"
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
                        className="pl-12 h-14 bg-white border-gray-200 text-black font-bold rounded-2xl shadow-sm focus:ring-2 focus:ring-primary/20 transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    {selectedIds.length > 0 && (
                      <Button 
                        variant="destructive" 
                        className="h-14 px-8 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-600/20"
                        onClick={() => setShowBulkDeleteConfirm(true)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Abort Selected ({selectedIds.length})
                      </Button>
                    )}
                  </div>

                  <div className="rounded-3xl border border-border overflow-hidden bg-white shadow-sm">
                    <Table>
                      <TableHeader className="bg-gray-50/50">
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="w-12 px-6">
                            <Checkbox 
                              checked={selectedIds.length === filteredAppointments.length && filteredAppointments.length > 0}
                              onCheckedChange={toggleSelectAll}
                              className="border-gray-300"
                            />
                          </TableHead>
                          <TableHead className="font-black uppercase tracking-widest text-[10px] text-gray-400 px-6 py-5">Deployment Date</TableHead>
                          <TableHead className="font-black uppercase tracking-widest text-[10px] text-gray-400 px-6 py-5">Target Client</TableHead>
                          <TableHead className="font-black uppercase tracking-widest text-[10px] text-gray-400 px-6 py-5">Asset Info</TableHead>
                          <TableHead className="font-black uppercase tracking-widest text-[10px] text-gray-400 px-6 py-5">Status</TableHead>
                          <TableHead className="font-black uppercase tracking-widest text-[10px] text-gray-400 px-6 py-5 text-right">Amount</TableHead>
                          <TableHead className="font-black uppercase tracking-widest text-[10px] text-gray-400 px-6 py-5 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAppointments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="h-60 text-center">
                              <div className="flex flex-col items-center justify-center gap-4">
                                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-300">
                                  <Search className="w-8 h-8" />
                                </div>
                                <div>
                                  <p className="text-lg font-black text-gray-900 uppercase tracking-tight">No Deployments Found</p>
                                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">Adjust your search parameters and try again.</p>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredAppointments.map((app) => (
                            <TableRow 
                              key={app.id} 
                              className={cn(
                                "border-border hover:bg-gray-50/50 transition-colors cursor-pointer group",
                                selectedIds.includes(app.id) && "bg-primary/5 hover:bg-primary/10"
                              )}
                              onClick={() => setViewingAppointment(app)}
                            >
                              <TableCell className="px-6" onClick={(e) => e.stopPropagation()}>
                                <Checkbox 
                                  checked={selectedIds.includes(app.id)}
                                  onCheckedChange={() => toggleSelect(app.id)}
                                  className="border-gray-300"
                                />
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex flex-col items-center justify-center shrink-0 border border-gray-200">
                                    <span className="text-[10px] font-black text-gray-400 uppercase leading-none mb-0.5">
                                      {app.scheduledAt?.toDate ? format(app.scheduledAt.toDate(), "MMM") : "---"}
                                    </span>
                                    <span className="text-sm font-black text-gray-900 leading-none">
                                      {app.scheduledAt?.toDate ? format(app.scheduledAt.toDate(), "d") : "--"}
                                    </span>
                                  </div>
                                  <div>
                                    <p className="text-sm font-black text-gray-900 uppercase tracking-tight">
                                      {app.scheduledAt?.toDate ? format(app.scheduledAt.toDate(), "h:mm a") : "TBD"}
                                    </p>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                      {app.jobNum || "NO JOB #"}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-[10px]">
                                    {(app.customerName || "C").charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-black text-gray-900 uppercase tracking-tight truncate max-w-[150px]">
                                      {app.customerName || "Unknown Client"}
                                    </p>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                      {app.customerPhone || "NO PHONE"}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <div className="flex items-center gap-3">
                                  <Car className="w-4 h-4 text-primary shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-black text-gray-900 tracking-tight truncate max-w-[200px]">
                                      {app.vehicleInfo || "Vehicle N/A"}
                                    </p>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate max-w-[200px]">
                                      {app.address || "No Address"}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <Badge variant="outline" className={cn(
                                  "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border-none", 
                                  statusColors[app.status] || "bg-gray-100 text-gray-700"
                                )}>
                                  {app.status?.replace("_", " ")}
                                </Badge>
                              </TableCell>
                              <TableCell className="px-6 py-5 text-right">
                                <p className="text-sm font-black text-gray-900 tracking-tighter">
                                  ${(app.totalAmount || 0).toFixed(2)}
                                </p>
                              </TableCell>
                              <TableCell className="px-6 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-2">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-9 w-9 text-gray-500 hover:text-primary hover:bg-primary/5 rounded-xl"
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
                                        className="h-9 w-9 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl"
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
                            setViewingAppointment(app);
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
                            {app.scheduledAt?.toDate ? format(app.scheduledAt.toDate(), "h:mm") : "TBD"}
                          </p>
                          <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">
                            {app.scheduledAt?.toDate ? format(app.scheduledAt.toDate(), "a") : ""}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-black text-gray-900 truncate uppercase tracking-tight">{app.customerName || "Client"}</h3>
                            <Badge variant="outline" className={cn(
                              "text-[9px] font-black uppercase tracking-widest px-3 py-0.5 rounded-full border-none", 
                              statusColors[app.status] || "bg-gray-100 text-gray-700"
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
                                      className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
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
                  <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
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
                              {format(block.start.toDate(), "h:mm a")} - {format(block.end.toDate(), "h:mm a")}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-500 hover:text-red-500 transition-all"
                          onClick={async () => {
                            await deleteDoc(doc(db, "time_blocks", block.id));
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
                            {format(new Date(event.start.dateTime || event.start.date), "h:mm a")} - {format(new Date(event.end.dateTime || event.end.date), "h:mm a")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button 
                className="bg-primary text-white hover:bg-red-700 font-black uppercase tracking-[0.2em] text-[10px] w-full h-14 rounded-2xl shadow-xl shadow-primary/20 transition-all"
                onClick={() => setCalendarView("tactical")}
              >
                View Tactical Route View
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    )}

      {/* Appointment Detail Dialog */}
      <Dialog open={!!viewingAppointment} onOpenChange={(open) => !open && setViewingAppointment(null)}>
        <DialogContent className="max-w-3xl bg-card border-none p-0 overflow-hidden rounded-[2.5rem] shadow-2xl shadow-black flex flex-col max-h-[90vh]">
          {viewingAppointment && (
            <>
              <DialogHeader className="p-10 bg-black/40 border-b border-white/5 shrink-0 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-lg shadow-primary/10">
                      <CalendarIcon className="w-8 h-8" />
                    </div>
                    <div>
                      <DialogTitle className="text-3xl font-black text-white uppercase tracking-tighter">Deployment <span className="text-primary">Intelligence</span></DialogTitle>
                      <div className="flex items-center gap-3 mt-2">
                        <Badge className={cn("text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border-none", statusColors[viewingAppointment.status || 'scheduled'])}>
                          {(viewingAppointment.status || 'scheduled').replace("_", " ")}
                        </Badge>
                        <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Job #{viewingAppointment.jobNum || "N/A"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-12 w-12 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-2xl border border-white/5"
                      onClick={() => {
                        setEditingAppointment(viewingAppointment);
                        setViewingAppointment(null);
                        setShowAddDialog(true);
                      }}
                    >
                      <Settings2 className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
                {/* Mission Critical Data */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Target Client</Label>
                      <div className="p-5 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black">
                          {viewingAppointment.customerName?.charAt(0).toUpperCase() || "U"}
                        </div>
                        <div>
                          <p className="text-sm font-black text-white uppercase tracking-tight">{viewingAppointment.customerName || "Unknown Client"}</p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{viewingAppointment.customerPhone || "No Phone Protocol"}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Deployment Zone</Label>
                      <div className="p-5 bg-white/5 rounded-2xl border border-white/10 flex items-start gap-4">
                        <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-black text-white uppercase tracking-tight leading-tight">{viewingAppointment.address}</p>
                          {viewingAppointment.address && (
                            <Button 
                              variant="link" 
                              className="p-0 h-auto text-[10px] text-primary font-black uppercase tracking-widest mt-2 hover:no-underline"
                              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(viewingAppointment.address)}`, '_blank')}
                            >
                              Launch Navigation <ExternalLink className="w-3 h-3 ml-1" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Temporal Window</Label>
                      <div className="p-5 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-4">
                        <Clock className="w-5 h-5 text-primary shrink-0" />
                        <div>
                          <p className="text-sm font-black text-white uppercase tracking-tight">
                            {viewingAppointment.scheduledAt?.toDate ? format(viewingAppointment.scheduledAt.toDate(), "EEEE, MMMM do") : "TBD"}
                          </p>
                          {viewingAppointment.scheduledAt && (
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                              Commencing at {viewingAppointment.scheduledAt.toDate ? format(viewingAppointment.scheduledAt.toDate(), "h:mm a") : format(new Date(viewingAppointment.scheduledAt), "h:mm a")}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Assigned Operative</Label>
                      <div className="p-5 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-4">
                        <User className="w-5 h-5 text-primary shrink-0" />
                        <div>
                          <p className="text-sm font-black text-white uppercase tracking-tight">{viewingAppointment.technicianName || "Unassigned"}</p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Field Technician</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Assets & Services */}
                <div className="space-y-4">
                  <Label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Tactical Assets & Services</Label>
                  <div className="space-y-3">
                    {viewingAppointment.vehicleIds?.map((vId: string) => {
                      const vehicle = availableVehicles.find(v => v.id === vId);
                      const vServices = viewingAppointment.serviceSelections?.filter((s: any) => s.vehicleId === vId) || [];
                      
                      return (
                        <div key={vId} className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-4">
                          <div className="flex items-center gap-3">
                            <Car className="w-5 h-5 text-primary" />
                            <p className="text-sm font-black text-white uppercase tracking-tight">
                              {vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Unknown Asset"}
                            </p>
                            {vehicle?.size && (
                              <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-white/10 text-gray-400">
                                {vehicle.size.replace("_", " ")}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {vServices.map((s: any, idx: number) => (
                              <Badge key={idx} className="bg-primary/10 text-primary border-none text-[9px] font-black uppercase tracking-widest px-3 py-1">
                                {viewingAppointment.serviceNames?.find((name: string) => name.includes(s.id)) || "Service"} x{s.qty}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    
                    {(!viewingAppointment.vehicleIds || viewingAppointment.vehicleIds.length === 0) && viewingAppointment.serviceNames?.map((name: string, idx: number) => (
                      <div key={idx} className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between">
                        <p className="text-sm font-black text-white uppercase tracking-tight">{name}</p>
                        <Badge className="bg-primary/10 text-primary border-none text-[9px] font-black uppercase tracking-widest">
                          Service Protocol
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="p-8 bg-black/40 rounded-[2rem] border border-white/5 space-y-6">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Financial Summary</p>
                    <Badge className={cn(
                      "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border-none",
                      viewingAppointment.paymentStatus === "paid" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                    )}>
                      {viewingAppointment.paymentStatus}
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {/* 1. Itemize Core Services */}
                    {(viewingAppointment.serviceSelections || []).map((service: any, idx: number) => (
                      <div key={`view-service-${service.id || idx}`} className="flex justify-between text-sm">
                        <span className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">{service.vehicleName ? `[${service.vehicleName}] ` : ""}{service.name}</span>
                        <span className="text-white font-black">${(service.price || 0).toFixed(2)}</span>
                      </div>
                    ))}

                    {/* 2. Itemize Add-ons & Enhancements */}
                    {(viewingAppointment.addOnSelections || []).map((addon: any, idx: number) => (
                      <div key={`view-addon-${addon.id || idx}`} className="flex justify-between text-sm">
                        <span className="text-gray-400 font-bold uppercase tracking-widest text-[10px] italic">{addon.name} {addon.qty > 1 ? `(x${addon.qty})` : ""}</span>
                        <span className="text-white font-black">${((addon.price || 0) * (addon.qty || 1)).toFixed(2)}</span>
                      </div>
                    ))}

                    {/* 3. Backward Compatibility: Unlisted Manual Additions */}
                    {(() => {
                      const mappedServicesTotal = (viewingAppointment.serviceSelections || []).reduce((sum: number, s: any) => sum + (s.price || 0), 0);
                      const mappedAddonsTotal = (viewingAppointment.addOnSelections || []).reduce((sum: number, a: any) => sum + ((a.price || 0) * (a.qty || 1)), 0);
                      const unlistedTotal = (viewingAppointment.baseAmount || 0) - (mappedServicesTotal + mappedAddonsTotal);
                      
                      if (unlistedTotal > 0.01) {
                        return (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Additional Line Items</span>
                            <span className="text-white font-black">${unlistedTotal.toFixed(2)}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    
                    {viewingAppointment.discountAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-red-400 font-bold uppercase tracking-widest text-[10px]">Tactical Discount</span>
                        <span className="text-red-400 font-black">-${(viewingAppointment.discountAmount || 0).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="pt-4 border-t border-white/5 flex justify-between items-end">
                      <div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Total</p>
                        <p className="text-3xl font-black text-white tracking-tighter">${(viewingAppointment.totalAmount || 0).toFixed(2)}</p>
                      </div>
                      {viewingAppointment.depositAmount > 0 && (
                        <div className="text-right">
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Deposit Status</p>
                          <p className={cn("text-sm font-black uppercase tracking-tight", viewingAppointment.depositPaid ? "text-green-400" : "text-red-400")}>
                            {viewingAppointment.depositPaid ? "Secured" : "Pending"} (${(viewingAppointment.depositAmount || 0).toFixed(2)})
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-10 bg-black/40 border-t border-white/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <Button 
                    variant="ghost" 
                    className="text-gray-400 hover:text-white font-black uppercase tracking-widest text-[10px] h-12 px-6 rounded-xl"
                    onClick={() => setViewingAppointment(null)}
                  >
                    Close
                  </Button>
                </div>
                <div className="flex items-center gap-4">
                  <Button 
                    variant="outline" 
                    className="border-white/10 bg-white/5 text-white hover:bg-white/10 font-black uppercase tracking-widest text-[10px] h-12 px-8 rounded-xl"
                    onClick={() => handleConvertToInvoice(viewingAppointment)}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Convert to Invoice
                  </Button>
                  <Button 
                    className="bg-primary hover:bg-red-700 text-white font-black uppercase tracking-widest text-[10px] h-12 px-8 rounded-xl shadow-lg shadow-primary/20"
                    onClick={() => {
                      setEditingAppointment(viewingAppointment);
                      setViewingAppointment(null);
                      setShowAddDialog(true);
                    }}
                  >
                    <Settings2 className="w-4 h-4 mr-2" />
                    Modify Deployment
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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
              <Label htmlFor="blockTitle">Title / Reason</Label>
              <Input
                id="blockTitle"
                value={timeBlockForm.title}
                onChange={(e) => setTimeBlockForm({ ...timeBlockForm, title: e.target.value })}
                placeholder="e.g. Lunch, Doctor Appointment"
                className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="datetime-local"
                  value={timeBlockForm.start}
                  onChange={(e) => setTimeBlockForm({ ...timeBlockForm, start: e.target.value })}
                  className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12"
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="datetime-local"
                  value={timeBlockForm.end}
                  onChange={(e) => setTimeBlockForm({ ...timeBlockForm, end: e.target.value })}
                  className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={timeBlockForm.type} onValueChange={(v: any) => setTimeBlockForm({ ...timeBlockForm, type: v })}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10 text-white">
                  <SelectItem value="time_off">Time Off</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="unavailable">Unavailable (Block Booking)</SelectItem>
                </SelectContent>
              </Select>
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
                    if (!timeBlockForm.title || !timeBlockForm.start || !timeBlockForm.end) {
                      toast.error("Please fill required fields (Title, Start, End)");
                      return;
                    }
                    if (new Date(timeBlockForm.start) >= new Date(timeBlockForm.end)) {
                      toast.error("End time must be after start time");
                      return;
                    }

                    const data = {
                      title: timeBlockForm.title,
                      type: timeBlockForm.type,
                      start: Timestamp.fromDate(new Date(timeBlockForm.start)),
                      end: Timestamp.fromDate(new Date(timeBlockForm.end)),
                      notes: timeBlockForm.notes,
                      userId: profile?.id
                    };

                    if (editingTimeBlock) {
                      await updateDoc(doc(db, "time_blocks", editingTimeBlock.id), data);
                      toast.success("Time block updated");
                    } else {
                      await addDoc(collection(db, "time_blocks"), data);
                      toast.success("Time block created");
                    }
                    setShowTimeBlockDialog(false);
                  } catch (e: any) {
                    console.error("Error saving time block:", e);
                    toast.error("Failed to save time block");
                  }
                }}
                className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl h-12 px-8 shadow-lg shadow-primary/20"
              >
                {editingTimeBlock ? "Update Block" : "Create Block"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4 animate-in slide-in-from-bottom-10">
          <div className="bg-gray-900 border border-white/10 rounded-3xl p-4 shadow-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 px-4">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-primary/20">
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
                    className="bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest text-[10px] h-12 px-8 rounded-xl shadow-lg shadow-red-600/20"
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
                        className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-red-600 text-white hover:bg-red-700 shadow-xl shadow-red-600/20 transition-all hover:scale-105"
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
    </div>
  </div>
);
}
