import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collection, query, getDocs, doc, addDoc, updateDoc, serverTimestamp, orderBy, limit, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { toast } from "sonner";
import { 
  Building2, CalendarIcon, Car, Clock, CreditCard, DollarSign, 
  MapPin, Plus, Search, Check, ChevronLeft, Trash2, X,
  AlertTriangle, Globe, Sparkles, Loader2, Star, RefreshCw,
  Bell, Info, AlertCircle, Wrench, ShieldCheck, Droplets,
  ChevronDown, ChevronUp
} from "lucide-react";
import { syncService } from "../services/syncService";
import { format, addHours } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { messagingService } from "../services/messagingService";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { 
  Sheet, 
  SheetContent, 
  SheetDescription, 
  SheetHeader, 
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  cn, 
  formatCurrency, 
  getClientDisplayName, 
  formatPhoneNumber,
  formatDistance 
} from "@/lib/utils";
import { SearchableSelector } from "../components/SearchableSelector";
import AddressInput from "../components/AddressInput";
import VehicleSelector from "../components/VehicleSelector";
import { NumberInput } from "../components/NumberInput";
import { StandardInput } from "../components/StandardInput";
import { CustomFeesEditor } from "../components/CustomFeesEditor";
import { CustomFee } from "../types";
import { generateSmartRecommendations, SmartRecommendation, parseFlexibleDate } from "../services/smartBookingService";
import { generateServiceTimingIntelligence, ServiceTimingOutput } from "../services/serviceTimingEngine";
import { geocodeAddress } from "../services/geocodingService";
import { calculateDistance, calculateTravelFee } from "../services/travelService";
import { BundleOffer, fetchClientBundles, saveBundleOffer, updateBundleStatus } from "../services/bundleService";
import { createNotification } from "../services/notificationService";

export default function BookAppointment() {
  const [searchParams] = useSearchParams();
  const prefillClientId = searchParams.get("clientId");
  const prefillLeadId = searchParams.get("leadId");
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [clients, setClients] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [availableVehicles, setAvailableVehicles] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState(prefillClientId || "");
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [pendingVehicle, setPendingVehicle] = useState<{ year: string; make: string; model: string } | null>(null);
  const [recPanelVehicleId, setRecPanelVehicleId] = useState<string | null>(null);
  const [isRecPanelOpen, setIsRecPanelOpen] = useState(false);
  const [selectedRecDetail, setSelectedRecDetail] = useState<ServiceTimingOutput | null>(null);
  const [selectedBundleDetail, setSelectedBundleDetail] = useState<BundleOffer | null>(null);
  
  const [selectedServices, setSelectedServices] = useState<{ id: string; qty: number; vehicleId?: string; tempVehicleSize?: string; dealPrice?: number; isBundleItem?: boolean }[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<{ id: string; qty: number }[]>([]);
  
  const [appointments, setAppointments] = useState<any[]>([]);
  const [blockedDates, setBlockedDates] = useState<any[]>([]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [addonSearch, setAddonSearch] = useState("");

  const [isServicesOpen, setIsServicesOpen] = useState(false);
  const [isEnhancementsOpen, setIsEnhancementsOpen] = useState(false);

  const [scheduledAtValue, setScheduledAtValue] = useState("");
  const [routeSynergy, setRouteSynergy] = useState<{distance: number, name: string, time: string, bestOption: string, beforeValue: string, beforeTime: string, afterValue: string, afterTime: string} | null>(null);
  const [appointmentAddress, setAppointmentAddress] = useState({ 
    address: "", lat: 0, lng: 0, city: "", state: "", zipCode: "", placeId: "",
    addressId: "", addressLabel: ""
  });
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState("Home");
  const [newAddressInput, setNewAddressInput] = useState("");
  const [newAddressLat, setNewAddressLat] = useState<number | undefined>();
  const [newAddressLng, setNewAddressLng] = useState<number | undefined>();
  const [notes, setNotes] = useState("");
  const [lead, setLead] = useState<any>(null);
  
  const [baseAmount, setBaseAmount] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  // Calculate discount based on applied coupon
  useEffect(() => {
    if (!appliedCoupon) {
      setDiscountAmount(0);
      return;
    }

    let discount = 0;
    if (appliedCoupon.discountType === "percentage") {
      discount = (baseAmount * (appliedCoupon.discountValue || 0)) / 100;
    } else {
      discount = appliedCoupon.discountValue || 0;
    }
    
    // Cap discount at baseAmount
    setDiscountAmount(Math.min(discount, baseAmount));
  }, [appliedCoupon, baseAmount]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setIsValidatingCoupon(true);
    try {
      const q = query(collection(db, "coupons"), where("code", "==", couponCode.trim().toUpperCase()), where("isActive", "==", true));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        toast.error("Invalid or inactive coupon code.");
        setAppliedCoupon(null);
        setDiscountAmount(0);
        return;
      }

      const coupon = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;

      if (coupon.expiryDate) {
        const expiry = new Date(coupon.expiryDate);
        if (expiry < new Date()) {
          toast.error("This coupon has expired.");
          return;
        }
      }

      if (coupon.usageLimit && (coupon.usageCount || 0) >= coupon.usageLimit) {
        toast.error("Coupon usage limit reached.");
        return;
      }

      setAppliedCoupon(coupon);
      toast.success(`Coupon "${coupon.code}" applied!`);
    } catch (err) {
      console.error("Error validating coupon:", err);
      toast.error("Failed to validate coupon.");
    } finally {
      setIsValidatingCoupon(false);
    }
  };
  const [travelFee, setTravelFee] = useState(0);
  const [customFees, setCustomFees] = useState<CustomFee[]>([]);
  const [travelInfo, setTravelInfo] = useState<any>(null);
  const [afterHoursFeeDisplay, setAfterHoursFeeDisplay] = useState(0);
  const [isAfterHoursDisplay, setIsAfterHoursDisplay] = useState(false);
  const [riskyDepositAmount, setRiskyDepositAmount] = useState(0);
  const [isRiskyClient, setIsRiskyClient] = useState(false);
  const [recordedDeposit, setRecordedDeposit] = useState<{amount: number, method: string, timestamp: Date} | null>(null);
  const [activeDepositMethod, setActiveDepositMethod] = useState("Cash");
  const [activeDepositAmount, setActiveDepositAmount] = useState<number | string>(0);

  useEffect(() => {
    const client = clients.find(c => c.id === selectedCustomerId);
    const riskVal = client?.riskLevel || client?.risk_level || client?.riskStatus || client?.clientRiskLevel || client?.riskManagement?.level;
    const isRisky = Boolean(riskVal);
    setIsRiskyClient(isRisky);
    
    if (isRisky) {
      const customFeesTotal = customFees.reduce((acc, f) => acc + f.amount, 0);
      const deposit = (baseAmount + travelFee + afterHoursFeeDisplay + customFeesTotal) * 0.25;
      setRiskyDepositAmount(deposit);
      setActiveDepositAmount(deposit);
    } else {
      setRiskyDepositAmount(0);
      setActiveDepositAmount(0);
    }
  }, [clients, selectedCustomerId, baseAmount, travelFee, afterHoursFeeDisplay, customFees]);

  const [timingRecommendations, setTimingRecommendations] = useState<ServiceTimingOutput[]>([]);
  const [fetchingTiming, setFetchingTiming] = useState(false);

  // Bundle System State
  const [savedBundles, setSavedBundles] = useState<BundleOffer[]>([]);
  const [generatedBundles, setGeneratedBundles] = useState<BundleOffer[]>([]);
  const [fetchingBundles, setFetchingBundles] = useState(false);

  // Smart Booking 2.0 State
  const [smartRecommendations, setSmartRecommendations] = useState<SmartRecommendation[]>([]);
  const [isGeneratingSmartSlots, setIsGeneratingSmartSlots] = useState(false);
  const [smartBookingError, setSmartBookingError] = useState("");
  const [nextAvailableSlot, setNextAvailableSlot] = useState<SmartRecommendation | null>(null);
  const [isSmartBookingCollapsed, setIsSmartBookingCollapsed] = useState(false);
  const [selectedSmartSlot, setSelectedSmartSlot] = useState<SmartRecommendation | null>(null);
  const [suggestionAccepted, setSuggestionAccepted] = useState(false);
  const suggestionAcceptedRef = useRef(false);

  const updateSuggestionAccepted = (val: boolean) => {
    setSuggestionAccepted(val);
    suggestionAcceptedRef.current = val;
  };

  // Validation Checklist for Smart Booking
  const smartBookingValidation = [
    { id: 'date', label: 'Select a valid date & time', isValid: !!scheduledAtValue, target: 'datetime-input' },
    { id: 'address', label: 'Add a service location', isValid: !!appointmentAddress.lat, target: 'address-trigger' },
    { id: 'client', label: 'Select a client', isValid: !!selectedCustomerId, target: 'client-trigger' },
    { id: 'services', label: 'Select at least one service', isValid: selectedServices.length > 0, target: 'services-trigger' },
  ];
  const missingSmartItems = smartBookingValidation.filter(item => !item.isValid);

  const scrollToField = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const originalClass = element.className;
      element.classList.add('ring-4', 'ring-primary/50');
      setTimeout(() => {
        element.classList.remove('ring-4', 'ring-primary/50');
      }, 2000);
    }
  };

  const handleGenerateSmartSlots = async (forceOpen = false) => {
    const parsedDate = parseFlexibleDate(scheduledAtValue);
    if (selectedServices.length === 0 || !appointmentAddress.lat || !parsedDate || !selectedCustomerId) return;
    
    setIsGeneratingSmartSlots(true);
    setSmartBookingError("");
    setSmartRecommendations([]);
    setNextAvailableSlot(null);
    
    try {
      const rainThreshold = settings?.weatherAutomation?.rainProbabilityThreshold || 40;
      const duration = selectedServices.reduce((acc, s) => {
        const srv = services.find(x => x.id === s.id);
        return acc + (srv?.estimatedDuration || 120) * s.qty;
      }, 0);

      const result = await generateSmartRecommendations({
        baseDate: parsedDate,
        addressLat: appointmentAddress.lat,
        addressLng: appointmentAddress.lng,
        durationMinutes: duration > 0 ? duration : 120,
        rainThreshold,
        businessHours: settings?.businessHours,
        selectedTime: parsedDate
      });

      // Determine if the selected time is valid and available
      const selectedRec = result.find(r => r.isSelectedTime);
      const isSelectedTimeAvailable = selectedRec && selectedRec.rank !== "Avoid";
      
      // Only force open if:
      // 1. Explicitly requested (e.g. manual refresh or dependency change)
      // 2. We haven't just accepted a suggestion
      // 3. OR the currently selected time has become unavailable (conflict)
      if (forceOpen || !suggestionAcceptedRef.current || !isSelectedTimeAvailable) {
        setIsSmartBookingCollapsed(false);
      }

      if (result.length === 0) {
        setSmartBookingError("No available slots found for this date. Try a different date or adjust service duration/business hours.");
        
        // AUTO-SEARCH FOR NEXT AVAILABLE DATE (UP TO 7 DAYS)
        let found = false;
        for (let i = 1; i <= 7; i++) {
          const nextDate = new Date(parsedDate);
          nextDate.setDate(parsedDate.getDate() + i);
          
          const nextResult = await generateSmartRecommendations({
            baseDate: nextDate,
            addressLat: appointmentAddress.lat,
            addressLng: appointmentAddress.lng,
            durationMinutes: duration > 0 ? duration : 120,
            rainThreshold,
            businessHours: settings?.businessHours
          });
          
          if (nextResult.length > 0) {
            const suggestion = nextResult.find(r => r.rank === "Best") || nextResult[0];
            setNextAvailableSlot(suggestion);
            found = true;
            break;
          }
        }
      } else {
        setSmartRecommendations(result);
        
        // Check if selected time is the first recommendation and if it's "available"
        const topSlot = result[0];
        if (topSlot.isSelectedTime && topSlot.rank !== "Avoid") {
          // Selected time is available
        } else if (topSlot.isSelectedTime && topSlot.rank === "Avoid") {
          // Selected time is "available" but recommended to avoid
        }
      }
    } catch (err: any) {
      setSmartBookingError(err.message || "Failed to generate slots.");
      console.error("[SmartBooking] Error:", err);
    } finally {
      setIsGeneratingSmartSlots(false);
    }
  };

  // Auto-trigger Smart Booking Engine
  useEffect(() => {
    const timer = setTimeout(() => {
      // If other inputs change, we might want to force reopen
      handleGenerateSmartSlots(true);
    }, 500); // Small debounce
    return () => clearTimeout(timer);
  }, [
    selectedCustomerId, 
    selectedVehicleIds, 
    selectedServices, 
    appointmentAddress.lat, 
    appointmentAddress.lng, 
    settings?.businessHours,
    appointments.length
  ]);

  // Handle scheduledAtValue separately
  useEffect(() => {
    if (suggestionAcceptedRef.current) return; // Skip if we just set it via suggestion

    const timer = setTimeout(() => {
      handleGenerateSmartSlots(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [scheduledAtValue]);

  // Reset suggestionAccepted if manual inputs change significantly
  useEffect(() => {
    updateSuggestionAccepted(false);
  }, [
    selectedCustomerId,
    selectedServices,
    appointmentAddress.lat,
    appointmentAddress.lng,
    selectedVehicleIds
  ]);

  // Route Synergy Check
  useEffect(() => {
    if (!appointmentAddress.lat || !appointmentAddress.lng || !scheduledAtValue) {
      setRouteSynergy(null);
      return;
    }

    const checkSynergy = async () => {
      try {
        const targetDateStr = scheduledAtValue.split("T")[0];
        const startOfDayTime = new Date(`${targetDateStr}T00:00:00`).getTime();
        const endOfDayTime = new Date(`${targetDateStr}T23:59:59`).getTime();
        
        const currentDuration = selectedServices.reduce((acc, s) => {
          const srv = services.find(x => x.id === s.id);
          return acc + (srv?.estimatedDuration || 120) * s.qty;
        }, 0);

        let bestSynergy = null;
        let minDistance = 5;

        appointments.forEach((app: any) => {
          if (!app.scheduledAt) return;
          const appTimeObj = app.scheduledAt?.toDate ? app.scheduledAt.toDate() : new Date(app.scheduledAt);
          const appTime = appTimeObj.getTime();
          
          if (appTime >= startOfDayTime && appTime <= endOfDayTime) {
            if (app.latitude && app.longitude && app.customerId !== selectedCustomerId && app.status !== "cancelled" && app.status !== "canceled") {
             const dist = calculateDistance(appointmentAddress.lat, appointmentAddress.lng, app.latitude, app.longitude);
             if (dist <= 5 && dist < minDistance) {
                minDistance = dist;
                const existingAppTime = app.scheduledAt.toDate();
                const beforeTimeObj = new Date(existingAppTime.getTime() - (currentDuration + 30) * 60000);
                const afterTimeObj = new Date(existingAppTime.getTime() + (app.totalDurationMinutes || 120 + 30) * 60000);
                
                let bestOption = "after"; // default
                if (beforeTimeObj.getHours() >= 8 && afterTimeObj.getHours() >= 18) {
                    bestOption = "before";
                } else if (beforeTimeObj.getHours() >= 8 && afterTimeObj.getHours() < 18) {
                    bestOption = "either";
                }
                
                bestSynergy = {
                  distance: Number(dist.toFixed(1)),
                  name: app.customerName,
                  time: format(existingAppTime, "h:mm a"),
                  bestOption,
                  beforeValue: format(beforeTimeObj, "yyyy-MM-dd'T'HH:mm"),
                  beforeTime: format(beforeTimeObj, "h:mm a"),
                  afterValue: format(afterTimeObj, "yyyy-MM-dd'T'HH:mm"),
                  afterTime: format(afterTimeObj, "h:mm a"),
                };
             }
          }
        }
        });

        setRouteSynergy(bestSynergy);
      } catch (err) {
        console.error("Error checking route synergy:", err);
      }
    };
    
    checkSynergy();
  }, [scheduledAtValue, appointmentAddress.lat, appointmentAddress.lng, selectedCustomerId, selectedServices]);


  useEffect(() => {
    async function fetchData() {
      try {
        const clientsSnap = await getDocs(collection(db, "clients"));
        const fetchedClients: any[] = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setClients(fetchedClients);
        
        let initialAddress = "";
        
        if (prefillLeadId) {
          const leadSnap = await getDocs(query(collection(db, "leads"), where("__name__", "==", prefillLeadId)));
          if (!leadSnap.empty) {
            const l: any = { id: leadSnap.docs[0].id, ...leadSnap.docs[0].data() };
            setLead(l);
            initialAddress = l.address || "";
            const existingClient = fetchedClients.find(c => c.phone === l.phone || c.email === l.email);
            if (existingClient) {
              setSelectedCustomerId(existingClient.id);
            }
          }
        }
        
        const [servicesSnap, addonsSnap, settingsSnap, apptsSnap, blockedSnap] = await Promise.all([
          getDocs(collection(db, "services")),
          getDocs(collection(db, "addons")),
          getDocs(collection(db, "settings")),
          getDocs(query(collection(db, "appointments"), where("scheduledAt", ">=", new Date()))),
          getDocs(query(collection(db, "blocked_dates"), where("start", ">=", new Date())))
        ]);
        
        setServices(servicesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setAddons(addonsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setAppointments(apptsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setBlockedDates(blockedSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        
        let fetchedSettings: any = null;
        settingsSnap.docs.forEach((doc) => {
          if (doc.id === "global" || doc.id === "business_info" || doc.id === "business") {
            fetchedSettings = { ...fetchedSettings, ...doc.data() };
          }
        });
        setSettings(fetchedSettings);
        
        if (initialAddress && !appointmentAddress.address) {
          handleAddressSelect(initialAddress, 0, 0);
        }
        
        setLoading(false);
      } catch (err) {
        console.error("Error fetching dependencies:", err);
        toast.error("Failed to load generic data.");
        setLoading(false);
      }
    }
    fetchData();
  }, [prefillLeadId]);

  useEffect(() => {
    if (selectedCustomerId) {
      const client = clients.find(c => c.id === selectedCustomerId);
      if (client && !appointmentAddress.address) {
        if (client.addresses && client.addresses.length > 0) {
          const def = client.addresses.find((a: any) => a.isDefault) || client.addresses[0];
          setSelectedAddressId(def.id);
          handleAddressSelect(def.address || "", def.latitude || 0, def.longitude || 0, undefined, def.id, def.label);
        } else {
          handleAddressSelect(client.address || "", 0, 0, undefined, "legacy", "Default Location");
        }
      }
      
      const q = query(collection(db, "vehicles"), where("clientId", "==", selectedCustomerId));
      const unsubscribe = onSnapshot(q, (snap) => {
        const v = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAvailableVehicles(v);
        // Do not auto select, to let user independently choose
      }, (error) => {
        console.error("Error fetching vehicles:", error);
      });
      
      return () => unsubscribe();
    } else {
      setAvailableVehicles([]);
      setSelectedVehicleIds([]);
    }
  }, [selectedCustomerId, clients]);

  useEffect(() => {
    if (selectedCustomerId && availableVehicles.length > 0) {
      setFetchingTiming(true);
      const appsQuery = query(
        collection(db, "appointments"), 
        where("clientId", "==", selectedCustomerId)
      );
      
      const unsubscribe = onSnapshot(appsQuery, (snap) => {
        const apps = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const intelligence = generateServiceTimingIntelligence(availableVehicles as any, apps as any, services as any);
        
        const actionable = intelligence.filter(t => ["Due", "Due Soon", "Overdue"].includes(t.dueStatus));
        // Sort by priority -> Overdue, Due, Due Soon
        const sorted = actionable.sort((a,b) => {
           const priority: Record<string, number> = { "Overdue": 1, "Due": 2, "Due Soon": 3 };
           return (priority[a.dueStatus] || 99) - (priority[b.dueStatus] || 99);
        });
        setTimingRecommendations(sorted);
        setFetchingTiming(false);
      }, (error) => {
        console.error("Error fetching client appointments:", error);
        setFetchingTiming(false);
      });
      return () => unsubscribe();
    } else {
      setTimingRecommendations([]);
    }
  }, [selectedCustomerId, availableVehicles, services]);

  useEffect(() => {
    if (selectedCustomerId) {
      setFetchingBundles(true);
      fetchClientBundles(selectedCustomerId).then(bundles => {
        setSavedBundles(bundles);
      }).finally(() => {
        setFetchingBundles(false);
      });
    } else {
      setSavedBundles([]);
    }
  }, [selectedCustomerId]);

  useEffect(() => {
    if (timingRecommendations.length > 1) {
      // Logic to auto-bundle if there are 2+ recommendations for the same vehicle
      const newBundles: BundleOffer[] = [];
      const byVehicle: Record<string, ServiceTimingOutput[]> = {};
      timingRecommendations.forEach(r => {
        if (!byVehicle[r.vehicleId]) byVehicle[r.vehicleId] = [];
        byVehicle[r.vehicleId].push(r);
      });

      for (const vId of Object.keys(byVehicle)) {
        const recs = byVehicle[vId];
        if (recs.length > 1) {
           const existingOffer = savedBundles.find(b => b.vehicleId === vId && (b.status === "pending" || b.status === "declined"));
           if (existingOffer) continue;

           const vehicle = availableVehicles.find(v => v.id === vId);
           const vSize = vehicle?.size || "medium";
           let originalTotal = 0;
           const includedServices = recs.map(r => {
             const srv = services.find(s => s.id === r.serviceId);
             originalTotal += srv ? (srv.pricingBySize?.[vSize] || srv.basePrice || 0) : 0;
             return { serviceId: r.serviceId, serviceName: r.serviceName };
           });
           
           // Generate a 15% discount for a bundle
           const savings = Math.round(originalTotal * 0.15);
           const dealPrice = originalTotal - savings;

           newBundles.push({
             clientId: selectedCustomerId,
             vehicleId: vId,
             vehicleName: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Vehicle",
             bundleName: "Comprehensive Care Setup",
             includedServices,
             originalPrice: originalTotal,
             dealPrice,
             savings,
             status: "pending",
             createdAt: new Date(),
             updatedAt: new Date()
           });
        }
      }
      setGeneratedBundles(newBundles);
    } else {
      setGeneratedBundles([]);
    }
  }, [timingRecommendations, availableVehicles, services, selectedCustomerId, savedBundles]);

  const handleCreateAndAcceptBundle = async (bundle: BundleOffer) => {
    try {
      const saved = await saveBundleOffer(bundle);
      setSavedBundles(prev => [saved, ...prev]);
      handleAcceptBundle(saved);
      setGeneratedBundles(prev => prev.filter(b => b.vehicleId !== bundle.vehicleId));
      toast.success("Bundle generated and accepted!");
    } catch (e) {
      toast.error("Failed to generate bundle.");
    }
  };

  const handleAcceptBundle = async (bundle: BundleOffer) => {
    if (bundle.vehicleId && !selectedVehicleIds.includes(bundle.vehicleId)) {
      setSelectedVehicleIds(prev => [...prev, bundle.vehicleId!]);
    }
    
    // Add services with deal price logic
    // We distribute the deal price across the services
    // Or we simply apply a per-item discount. Let's apply evenly for now or exact proportion.
    const priceRatio = bundle.originalPrice > 0 ? bundle.dealPrice / bundle.originalPrice : 1;
    
    const newServices = [...selectedServices];
    bundle.includedServices.forEach(srv => {
      let serviceObj = services.find(s => s.id === srv.serviceId) || services.find(s => s.name === srv.serviceName);
      if (!serviceObj) return;
      
      const realServiceId = serviceObj.id;
      const existing = newServices.find(s => s.id === realServiceId && s.vehicleId === bundle.vehicleId);
      const vSize = availableVehicles.find(v => v.id === bundle.vehicleId)?.size || "medium";
      const baseP = serviceObj.pricingBySize?.[vSize] || serviceObj.basePrice || 0;
      
      const itemDealPrice = Math.round(baseP * priceRatio);

      if (!existing) {
        newServices.push({ id: realServiceId, qty: 1, vehicleId: bundle.vehicleId || undefined, dealPrice: itemDealPrice, isBundleItem: true });
      } else {
        existing.dealPrice = itemDealPrice;
        existing.isBundleItem = true;
      }
    });

    setSelectedServices(newServices);
    
    if (bundle.id && bundle.status !== "accepted") {
      await updateBundleStatus(bundle.id, "accepted");
      setSavedBundles(prev => prev.map(b => b.id === bundle.id ? { ...b, status: "accepted" } : b));
    }
    toast.success(`${bundle.bundleName} activated!`);
  };

  const handleSkipGeneratedBundle = async (bundle: BundleOffer) => {
    try {
      const saved = await saveBundleOffer({...bundle, status: "declined"});
      setSavedBundles(prev => [saved, ...prev]);
      setGeneratedBundles(prev => prev.filter(b => b.vehicleId !== bundle.vehicleId));
      toast.info("Bundle saved for later.");
    } catch (e) {
      toast.error("Failed to save bundle.");
    }
  };

  const handleAddRecommendation = (rec: ServiceTimingOutput) => {
    const vehicle = availableVehicles.find(v => v.id === rec.vehicleId);
    const vehicleName = vehicle ? `${vehicle.year} ${vehicle.model}` : "vehicle";

    if (!selectedVehicleIds.includes(rec.vehicleId)) {
      setSelectedVehicleIds(prev => [...prev, rec.vehicleId]);
    }
    const existing = selectedServices.find(s => s.id === rec.serviceId && s.vehicleId === rec.vehicleId);
    if (!existing) {
      setSelectedServices(prev => [...prev, { id: rec.serviceId, qty: 1, vehicleId: rec.vehicleId }]);
      toast.success(`${rec.serviceName} added to ${vehicleName}!`);
    } else {
      toast.info(`${rec.serviceName} is already selected for this vehicle.`);
    }
  };

  const renderRecItem = (rec: ServiceTimingOutput) => {
    const isOverdue = rec.dueStatus === "Overdue";
    const isDue = rec.dueStatus === "Due";

    let displayPrice: number | null = null;
    const service = services.find(s => s.id === rec.serviceId);
    
    if (service) {
      const vehicle = availableVehicles.find(v => v.id === rec.vehicleId);
      let vSize = "medium";
      if (vehicle) {
        vSize = vehicle.size || vehicle.vehicleSize || "medium";
      }
      
      let price = service.pricingBySize?.[vSize] ?? service.basePrice;
      
      const client = clients.find(c => c.id === selectedCustomerId);
      if (client?.isVIP && client.vipSettings) {
        let vipPrice = undefined;
        if (rec.vehicleId && client.vipSettings.vipVehiclePricing?.[rec.vehicleId]?.[service.id]) {
          vipPrice = client.vipSettings.vipVehiclePricing[rec.vehicleId][service.id];
        } else if (client.vipSettings.customServicePricing?.[service.id]) {
          vipPrice = client.vipSettings.customServicePricing[service.id];
        }
        if (vipPrice !== undefined) price = vipPrice;
      }
      
      if (price !== undefined && price !== null) {
        displayPrice = price;
      }
    }

    const selection = selectedServices.find(s => s.id === rec.serviceId && s.vehicleId === rec.vehicleId);

    return (
      <div 
        key={`${rec.vehicleId}-${rec.serviceId}`} 
        onClick={() => setSelectedRecDetail(rec)}
        className={cn(
          "p-4 bg-white/5 border border-white/5 transition-all rounded-xl group cursor-pointer",
          selection ? "border-green-500/30 bg-green-500/5 items-center" : "hover:border-white/20"
        )}
      >
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-1 flex-1">
            <div className="flex items-start justify-between gap-4">
              <h5 className={cn(
                "text-sm font-bold transition-colors",
                selection ? "text-green-500" : "text-white group-hover:text-primary"
              )}>
                {rec.serviceName}
              </h5>
              <div className="text-right shrink-0">
                {displayPrice !== null ? (
                  <span className={cn("text-sm font-black", selection ? "text-green-400" : "text-white")}>{formatCurrency(displayPrice)}</span>
                ) : (
                  <span className="text-[10px] font-bold text-white/40 italic">Price available upon selection</span>
                )}
              </div>
            </div>
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-widest leading-relaxed",
              selection ? "text-green-500/60" : "text-white/40"
            )}>
              {selection ? "Protocol Accepted" : (
                isOverdue ? "Critical: Action Required" :
                isDue ? "Maintenance Due" :
                "Strategic Enhancement Recommended"
              )}
            </p>
            {rec.lastCompletedDate && !selection && (
               <p className="text-[10px] text-white/20">Last done: {format(rec.lastCompletedDate, "MMM d, yyyy")}</p>
            )}
          </div>
          <Button 
            type="button"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              if (selection) {
                setSelectedServices(prev => prev.filter(s => !(s.id === rec.serviceId && s.vehicleId === rec.vehicleId)));
                toast.info("Recommendation removed.");
              } else {
                handleAddRecommendation(rec);
              }
            }}
            className={cn(
              "h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest border shrink-0 mt-1 transition-all",
              selection 
                ? "bg-green-500 border-green-600 text-white hover:bg-red-500 hover:border-red-600" 
                : "bg-white/5 border-white/10 hover:bg-primary text-white"
            )}
          >
            {selection ? (
              <span className="group/btn flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span className="group-hover/btn:hidden">Accepted</span>
                <span className="hidden group-hover/btn:inline">Remove</span>
              </span>
            ) : "Add"}
          </Button>
        </div>
      </div>
    );
  };

  useEffect(() => {
    let total = 0;
    const client = clients.find(c => c.id === selectedCustomerId);
    const isVIP = client?.isVIP;
    const vipSettings = client?.vipSettings;

    const vehiclesToProcess = selectedVehicleIds.length > 0 ? selectedVehicleIds : [null];

    vehiclesToProcess.forEach(vId => {
      selectedServices.forEach(selection => {
        if (selection.vehicleId && selection.vehicleId !== vId) return;
        if (!selection.vehicleId && vId !== null && selectedVehicleIds.length > 0) return;

        const service = services.find(s => s.id === selection.id);
        if (service) {
          let vSize = "medium";
          if (vId) {
            const v = availableVehicles.find(av => av.id === vId);
            if (v?.size) vSize = v.size;
            else if (v?.vehicleSize) vSize = v.vehicleSize;
          } else if (selection.tempVehicleSize) {
            vSize = selection.tempVehicleSize;
          }
          
          let price = service.pricingBySize?.[vSize] || service.basePrice || 0;
          
          if (selection.dealPrice !== undefined) {
            price = selection.dealPrice;
          } else if (isVIP && vipSettings) {
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
  }, [selectedServices, selectedAddons, services, addons, selectedCustomerId, clients, selectedVehicleIds, availableVehicles]);

  // Travel Fee Calculation
  useEffect(() => {
    if (appointmentAddress.lat && appointmentAddress.lng && settings?.travelPricing?.enabled && settings?.baseLatitude) {
      const distance = calculateDistance(
        settings.baseLatitude,
        settings.baseLongitude,
        appointmentAddress.lat,
        appointmentAddress.lng
      );
      
      const result = calculateTravelFee(distance, settings.travelPricing, {
        lat: appointmentAddress.lat,
        lng: appointmentAddress.lng
      });
      
      let finalFee = result.fee;
      const client = clients.find(c => c.id === selectedCustomerId);
      
      if (client?.isVIP && client?.vipSettings?.waiveTravelFee) {
        finalFee = 0;
      } else if (client?.isVIP && client?.vipSettings?.travelFeeDiscount) {
        const discount = typeof client.vipSettings.travelFeeDiscount === 'number' 
          ? client.vipSettings.travelFeeDiscount 
          : 0;
        finalFee = Math.max(0, finalFee - discount);
      }

      setTravelFee(finalFee);
      setTravelInfo({ ...result, fee: finalFee });
    } else {
      setTravelFee(0);
      setTravelInfo(null);
    }
  }, [appointmentAddress.lat, appointmentAddress.lng, settings, selectedCustomerId, clients]);

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
    const daySettings = settings.businessHours[dayName];
    const allowAfterHours = settings.businessHours.allowAfterHours || false;
    
    if (daySettings) {
      if (!daySettings.isOpen) {
        isAfterHours = true;
      } else {
        const apptStartStr = format(startAt, "HH:mm");
        const apptEndAt = new Date(startAt.getTime() + totalDuration * 60000);
        const apptEndStr = format(apptEndAt, "HH:mm");
        
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

  const handleAddressSelect = async (address: string, lat: number, lng: number, structured?: any, id?: string, label?: string) => {
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
      placeId: structured?.placeId || "",
      addressId: id || "",
      addressLabel: label || ""
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return toast.error("Please select a client.");
    if (!scheduledAtValue) return toast.error("Please select a date and time.");
    if (selectedServices.length === 0) return toast.error("Please select at least one service.");

    setSaving(true);
    
    try {
      const client = clients.find(c => c.id === selectedCustomerId);
      const startAt = new Date(scheduledAtValue);
      
      const appointmentsQuery = query(collection(db, "appointments"), orderBy("createdAt", "desc"), limit(100));
      const snapshot = await getDocs(appointmentsQuery);
      const existingJobNums = snapshot.docs
        .map(doc => doc.data().jobNum as string)
        .filter(Boolean);
      
      let maxNum = 1000;
      existingJobNums.forEach((jn: string) => {
        const match = jn?.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxNum) maxNum = num;
        }
      });
      const finalJobNum = `JOB${maxNum + 1}`;

      const totalDuration = selectedServices.reduce((acc, s) => {
        const service = services.find(srv => srv.id === s.id);
        return acc + (service?.estimatedDuration || 120) * s.qty;
      }, 0);

      // After-Hours Logic
      let isAfterHours = false;
      let afterHoursFee = 0;
      const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = daysOfWeek[startAt.getDay()];
      const daySettings = settings?.businessHours?.[dayName];
      const allowAfterHours = settings?.businessHours?.allowAfterHours || false;
      
      if (daySettings) {
        if (!daySettings.isOpen) {
          isAfterHours = true;
        } else {
          const apptStartStr = format(startAt, "HH:mm");
          const apptEndAt = new Date(startAt.getTime() + totalDuration * 60000);
          const apptEndStr = format(apptEndAt, "HH:mm");
          
          if (apptStartStr < daySettings.openTime || apptEndStr > daySettings.closeTime) {
            isAfterHours = true;
          }
        }
      }

      if (isAfterHours && !allowAfterHours) {
        setSaving(false);
        return toast.error(`Booking outside business hours is currently disabled in your settings.`);
      }

      if (isAfterHours && allowAfterHours) {
        afterHoursFee = settings?.businessHours?.afterHoursFeeAmount || 0;
      }

      const customFeesTotal = customFees.reduce((acc, f) => acc + f.amount, 0);
      const finalAmount = baseAmount + travelFee + afterHoursFee + customFeesTotal - discountAmount;
      
      const serviceSelections = selectedServices.map(s => {
        const service = services.find(srv => srv.id === s.id);
        const vSize = s.vehicleId ? (availableVehicles.find(av => av.id === s.vehicleId)?.size || "medium") : (s.tempVehicleSize || "medium");
        let price = service?.pricingBySize?.[vSize] || service?.basePrice || 0;

        if (s.dealPrice !== undefined) {
          price = s.dealPrice;
        } else if (client?.isVIP && client?.vipSettings) {
          let vipPrice = undefined;
          if (s.vehicleId && client.vipSettings.vipVehiclePricing?.[s.vehicleId]?.[s.id]) {
            vipPrice = client.vipSettings.vipVehiclePricing[s.vehicleId][s.id];
          } else if (client.vipSettings.customServicePricing?.[s.id]) {
            vipPrice = client.vipSettings.customServicePricing[s.id];
          }
          if (vipPrice !== undefined) price = vipPrice;
        }

        return {
          id: s.id,
          name: service?.name || "Service",
          description: service?.description || "",
          vehicleId: s.vehicleId,
          qty: s.qty,
          price: price,
          total: price * s.qty,
          source: s.isBundleItem ? "bundle" : ("standard" as const),
          protocolAccepted: true
        };
      });

      const addOnSelections = selectedAddons.map(a => {
        const addon = addons.find(ad => ad.id === a.id);
        return {
          id: a.id,
          name: addon?.name || "Add-on",
          description: addon?.description || "",
          qty: a.qty,
          price: addon?.price || 0,
          total: (addon?.price || 0) * a.qty,
          source: "standard" as const,
          protocolAccepted: true
        };
      });

      const unacceptedRecommendations = timingRecommendations
        .filter(rec => selectedVehicleIds.includes(rec.vehicleId))
        .filter(rec => !selectedServices.some(s => s.id === rec.serviceId && s.vehicleId === rec.vehicleId))
        .map(rec => {
          const service = services.find(s => s.id === rec.serviceId);
          const vSize = rec.vehicleId ? (availableVehicles.find(av => av.id === rec.vehicleId)?.size || "medium") : "medium";
          let price = service?.pricingBySize?.[vSize] || service?.basePrice || 0;
          return {
            id: rec.serviceId,
            name: rec.serviceName,
            reason: rec.dueStatus === "Overdue" ? "Critical: Action Required" : rec.dueStatus === "Due" ? "Maintenance Due" : "Suggested Enhancement",
            price: price,
            vehicleId: rec.vehicleId
          };
        });

      const unacceptedBundles = generatedBundles
        .filter(b => selectedVehicleIds.includes(b.vehicleId || ""))
        .filter(b => !b.includedServices.every(s => selectedServices.some(sel => sel.id === s.serviceId && sel.isBundleItem)))
        .map(b => ({
          name: b.bundleName,
          services: b.includedServices.map(s => s.serviceName),
          price: b.dealPrice,
          savings: b.savings,
          vehicleId: b.vehicleId
        }));
      
      const appointmentData = {
        clientId: selectedCustomerId,
        customerId: selectedCustomerId,
        customerName: getClientDisplayName(client),
        customerPhone: client?.phone || "",
        customerEmail: client?.email || "",
        customerType: "client",
        vehicleIds: selectedVehicleIds,
        vehicleId: selectedVehicleIds[0] || null,
        vehicleNames: selectedVehicleIds.map(id => {
          const v = availableVehicles.find(av => av.id === id);
          return v ? `${v.year} ${v.make} ${v.model}` : "Asset";
        }),
        vehicleInfo: selectedVehicleIds.map(id => {
          const v = availableVehicles.find(av => av.id === id);
          return v ? `${v.year} ${v.make} ${v.model}` : "";
        }).join(", ") || "",
        address: appointmentAddress.address,
        customerAddressId: appointmentAddress.addressId,
        addressLabel: appointmentAddress.addressLabel,
        city: appointmentAddress.city,
        state: appointmentAddress.state,
        zipCode: appointmentAddress.zipCode,
        latitude: appointmentAddress.lat,
        longitude: appointmentAddress.lng,
        scheduledAt: startAt,
        status: "scheduled",
        jobNum: finalJobNum,
        baseAmount: baseAmount,
        travelFee: travelFee,
        discountAmount: discountAmount,
        couponCode: appliedCoupon?.code || "",
        travelFeeBreakdown: travelInfo ? {
          miles: travelInfo.miles,
          rate: travelInfo.rate,
          adjustment: 0,
          isRoundTrip: travelInfo.isRoundTrip
        } : null,
        totalAmount: finalAmount,
        customFees: customFees,
        serviceIds: [...new Set(selectedServices.map(s => s.id))],
        serviceNames: [...new Set(selectedServices.map(s => services.find(srv => srv.id === s.id)?.name).filter(Boolean))],
        serviceSelections,
        addOnIds: selectedAddons.map(a => a.id),
        addOnNames: selectedAddons.map(a => addons.find(ad => ad.id === a.id)?.name).filter(Boolean),
        addOnSelections,
        unacceptedRecommendations,
        unacceptedBundles,
        technicianId: profile?.uid || "",
        technicianName: profile?.displayName || "",
        estimatedDuration: totalDuration,
        totalDurationMinutes: totalDuration,
        afterHoursRecord: isAfterHours ? {
          isAfterHours: true,
          afterHoursFee,
          afterHoursReason: "Time selected falls outside standard operating hours.",
          businessHoursSnapshot: settings?.businessHours || null
        } : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        reminders: {
          confirmation: "pending"
        },
        notes,
        leadId: prefillLeadId || null,
        depositRecord: recordedDeposit || null
      };

      try {
        const docRef = await addDoc(collection(db, "appointments"), appointmentData);
        
        // Attempt to send notifications
        if (client?.email) {
          messagingService.sendEmail({
            to: client.email,
            subject: `Appointment Confirmed: ${appointmentData.customerName}`,
            html: `<p>Hi ${appointmentData.customerName},</p><p>Your appointment has been confirmed for <strong>${format(startAt, "MMMM do, yyyy 'at' h:mm a")}</strong>.</p><p>Address: ${appointmentData.address}</p><p>Thank you for choosing ${settings?.businessName || "us"}!</p>`,
          }).catch(e => console.error("Email failed", e));
        }

        if (client?.phone) {
          const serviceText = appointmentData.serviceNames?.length ? appointmentData.serviceNames.join(", ") : "service";
          const messageBody = `DetailFlow: Your appointment is confirmed for ${format(startAt, "MMM do, yyyy")} at ${format(startAt, "h:mm a")} for ${serviceText}. Reply STOP to opt out.`;
          messagingService.sendSms({
            to: client.phone,
            body: messageBody
          }).then(async (res: any) => {
            console.log("Booking Confirmed SMS sent successfully to:", client.phone);
            await addDoc(collection(db, "communication_logs"), {
              clientId: client?.id || "walk-in",
              appointmentId: docRef.id,
              type: "confirmation",
              content: messageBody,
              status: "sent",
              messageId: res?.messageId || "sent",
              createdAt: serverTimestamp()
            });
            await updateDoc(docRef, { "reminders.confirmation": "sent" });
          }).catch(async (e) => {
            console.error("Booking Confirmed SMS failed to send:", e);
            await addDoc(collection(db, "communication_logs"), {
              clientId: client?.id || "walk-in",
              appointmentId: docRef.id,
              type: "confirmation",
              content: messageBody,
              status: "failed",
              errorDetail: e.message || String(e),
              createdAt: serverTimestamp()
            });
            await updateDoc(docRef, { "reminders.confirmation": "failed" });
          });
        } else {
          await updateDoc(docRef, { "reminders.confirmation": "skipped" });
        }

        toast.success("Appointment successfully created!");
        navigate("/calendar");
        return;
      } catch (err) {
        console.warn("Direct add failed, enqueuing...", err);
        await syncService.enqueueTask("appointments", {
          ...appointmentData,
          createdAt: Date.now()
        }, 'create');
        toast.info("Offline: Booking saved locally and will sync later");
        navigate("/calendar");
        return;
      }
    } catch (err) {
      console.error("Error creating appointment:", err);
      toast.error("An error occurred preserving this record.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-black flex items-center justify-center p-8 h-full">
        <div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-black p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate(-1)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-white transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Booking Setup</h1>
            <p className="text-gray-400 mt-1">Configure appointment details.</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 space-y-8">
            
            {/* 1. CLIENT SECTION */}
            <div className="space-y-4">
              <h2 className="text-sm font-black uppercase text-primary tracking-widest border-b border-white/10 pb-2">Client Intelligence</h2>
              <div className="space-y-2" id="client-trigger">
                <Label className="font-black uppercase tracking-widest text-[10px] text-white/90">Target Client *</Label>
                <SearchableSelector
                  options={clients.map(c => ({
                    value: c.id,
                    label: getClientDisplayName(c),
                    description: `${c.email || "No email"} • ${c.phone || "No phone"}`
                  }))}
                  value={selectedCustomerId}
                  onSelect={(val) => setSelectedCustomerId(val)}
                  placeholder="Search for a client..."
                  className="bg-black border border-white/10 text-white font-bold rounded-xl h-12"
                />
              </div>

              <div className="space-y-2" id="address-trigger">
                <Label className="font-black uppercase tracking-widest text-[10px] text-white/90">Service Location</Label>
                {selectedCustomerId ? (() => {
                  const client = clients.find(c => c.id === selectedCustomerId);
                  const addresses = client?.addresses || [];
                  const addressList = addresses.length > 0 ? addresses : (client?.address ? [{ id: 'legacy', label: 'Default Location', address: client.address }] : []);
                  
                  return (
                    <Select value={selectedAddressId} onValueChange={(val) => {
                      if (val === "new") {
                        setIsAddingAddress(true);
                        return;
                      }
                      setSelectedAddressId(val);
                      const addr = addressList.find((a: any) => a.id === val);
                      if (addr) {
                        handleAddressSelect(addr.address, addr.latitude || addr.lat || 0, addr.longitude || addr.lng || 0, undefined, addr.id, addr.label);
                      }
                    }}>
                      <SelectTrigger className="bg-black border-white/10 text-white rounded-xl h-12 w-full text-left truncate justify-between px-4">
                        <SelectValue placeholder="Select service address">
                          {selectedAddressId && addressList.find((a: any) => a.id === selectedAddressId) ? (
                            <div className="flex flex-col items-start leading-tight">
                              <span className="text-[8px] font-black uppercase tracking-widest text-primary flex items-center gap-1">
                                <span className="w-1 h-1 bg-primary rounded-full" />
                                {addressList.find((a: any) => a.id === selectedAddressId)?.label}
                              </span>
                              <span className="text-sm font-medium truncate max-w-[200px] sm:max-w-[400px]">
                                {addressList.find((a: any) => a.id === selectedAddressId)?.address}
                              </span>
                            </div>
                          ) : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-white/10 text-white">
                        {addressList.map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>
                            <div className="flex flex-col">
                              <span className="font-bold text-[10px] uppercase tracking-widest text-primary">{a.label}</span>
                              <span className="text-xs">{a.address}</span>
                            </div>
                          </SelectItem>
                        ))}
                        <SelectItem value="new" className="text-primary font-bold">
                          + Add New Address
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  );
                })() : (
                  <AddressInput 
                    defaultValue={appointmentAddress.address}
                    onAddressSelect={handleAddressSelect}
                    placeholder="Start typing to search..."
                  />
                )}
              </div>
            </div>

            {/* 1.5 RECOMMENDED SERVICES - HIDDEN IN FAVOR OF VEHICLE BADGES */}
            <div className="hidden">
               {selectedCustomerId && timingRecommendations.length > 0 && <span className="text-[8px] text-white/20">Intelligence Active</span>}
            </div>

            {/* 1.6 STRATEGIC BUNDLE OFFERS - MOVED TO VEHICLE PANELS */}
            <div className="hidden">
               {selectedCustomerId && (savedBundles.some(b => b.status === "pending" || b.status === "declined") || generatedBundles.length > 0) && <span className="text-[8px] text-white/20">Bundle Logic Active</span>}
            </div>

            {/* 2. VEHICLES SECTION */}
            {selectedCustomerId && (
              <div className="space-y-4">
                <h2 className="text-sm font-black uppercase text-primary tracking-widest border-b border-white/10 pb-2">Asset Selection (Vehicles)</h2>
                {availableVehicles.length > 0 && (
                  <div className="space-y-2 p-4 bg-black/50 border border-white/10 rounded-xl">
                    <Label className="text-white/60 font-bold mb-2 block">Available Client Assets</Label>
                    <div className="flex flex-wrap gap-3">
                      {availableVehicles.filter(v => v.id && !v.id.startsWith("temp-")).map(v => {
                        const vehicleRecs = timingRecommendations.filter(r => r.vehicleId === v.id);
                        const hasDue = vehicleRecs.some(r => r.dueStatus === "Overdue" || r.dueStatus === "Due");
                        const hasRec = vehicleRecs.some(r => r.dueStatus === "Due Soon" || r.dueStatus === "Never Performed");

                        return (
                          <div key={v.id} className="flex items-center space-x-2 bg-white/5 px-3 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-all cursor-pointer">
                            <Checkbox 
                              id={`v-${v.id}`}
                              checked={selectedVehicleIds.includes(v.id)}
                              onCheckedChange={(checked) => {
                                if (checked) setSelectedVehicleIds(prev => [...prev, v.id]);
                                else {
                                  setSelectedVehicleIds(prev => prev.filter(id => id !== v.id));
                                  setSelectedServices(prev => prev.filter(s => s.vehicleId !== v.id));
                                }
                              }}
                              className="border-white/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            />
                            <div 
                              className="flex-1 min-w-0" 
                              onClick={() => {
                                if (hasDue || hasRec) {
                                  setRecPanelVehicleId(v.id);
                                  setIsRecPanelOpen(true);
                                }
                              }}
                            >
                              <Label htmlFor={`v-${v.id}`} className="cursor-pointer font-bold text-white flex items-center justify-between gap-2">
                                <span className="truncate">{v.year} {v.make} {v.model}</span>
                                <div className="flex gap-1 shrink-0">
                                  {hasDue && <Badge className="bg-red-600 text-white text-[7px] h-3.5 font-black uppercase px-1 border-none flex items-center gap-0.5"><AlertCircle size={8}/> Due</Badge>}
                                  {hasRec && <Badge className="bg-[#0A4DFF] text-white text-[7px] h-3.5 font-black uppercase px-1 border-none flex items-center gap-0.5"><Info size={8}/> Recommended</Badge>}
                                </div>
                              </Label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                <div className="p-4 bg-black/50 border border-white/10 rounded-xl space-y-4">
                  <Label className="text-white/60 font-bold">Add New Vehicle to Appointment</Label>
                  <VehicleSelector 
                    onSelect={(vData) => setPendingVehicle(vData)} 
                  />
                  <div className="flex justify-end mt-2">
                    <Button 
                      type="button" 
                      onClick={() => {
                        if (pendingVehicle) {
                          const tempId = "temp-" + Date.now();
                          setAvailableVehicles(prev => [...prev, { id: tempId, ...pendingVehicle, size: "medium" }]);
                          setSelectedVehicleIds(prev => [...prev, tempId]);
                          setPendingVehicle(null);
                        }
                      }}
                      disabled={!pendingVehicle?.year || !pendingVehicle?.make || !pendingVehicle?.model}
                      className="bg-primary hover:bg-primary/90 text-white font-black h-10 px-6 rounded-xl uppercase tracking-widest text-[10px]"
                    >
                      <Plus className="w-4 h-4 mr-2" /> Add Vehicle
                    </Button>
                  </div>

                  {/* Render temps */}
                  {selectedVehicleIds.filter(id => id.startsWith("temp-")).length > 0 && (
                    <div className="mt-4 space-y-2">
                       {selectedVehicleIds.filter(id => id.startsWith("temp-")).map(tempId => {
                         const v = availableVehicles.find(av => av.id === tempId);
                         if(!v) return null;
                         return (
                           <div key={tempId} className="flex justify-between items-center bg-white/5 p-2 rounded-xl border border-white/10">
                              <span className="text-white font-bold text-sm ml-2 flex items-center gap-2">
                                <Car size={14} className="text-primary" /> {v.year} {v.make} {v.model}
                              </span>
                              <Button variant="ghost" size="sm" className="text-white hover:text-white bg-red-500/20 hover:bg-red-500 transition-colors" onClick={() => {
                                 setSelectedVehicleIds(prev => prev.filter(id => id !== tempId));
                                 setSelectedServices(prev => prev.filter(s => s.vehicleId !== tempId));
                                 setAvailableVehicles(prev => prev.filter(av => av.id !== tempId));
                              }}>Remove</Button>
                           </div>
                         );
                       })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. SERVICES PER VEHICLE */}
            {selectedVehicleIds.length > 0 && (
              <div className="space-y-4">
                <div 
                  className="flex items-center justify-between cursor-pointer border-b border-primary/20 bg-primary/5 p-4 rounded-xl hover:bg-primary/10 transition-all group"
                  onClick={() => setIsServicesOpen(!isServicesOpen)}
                  id="services-trigger"
                >
                  <div className="flex flex-col flex-1">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-black uppercase text-primary tracking-widest flex items-center gap-2">
                        Services ({selectedServices.length} selected)
                      </h2>
                      {isServicesOpen ? <ChevronUp className="w-5 h-5 text-primary" /> : <ChevronDown className="w-5 h-5 text-primary" />}
                    </div>
                    {!isServicesOpen && selectedServices.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedServices.map((s, idx) => {
                          const srv = services.find(x => x.id === s.id);
                          const v = availableVehicles.find(av => av.id === s.vehicleId);
                          return (
                            <div key={idx} className="bg-white/5 border border-white/10 px-2 py-1 rounded text-[10px] text-white/50 font-medium">
                              {srv?.name} {v ? `(${v.model})` : ""} x{s.qty}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <AnimatePresence>
                  {isServicesOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden space-y-4"
                    >
                      <div className="relative pt-2 px-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <Input 
                          placeholder="Search protocols across all selected vehicles..." 
                          value={serviceSearch}
                          onChange={(e) => setServiceSearch(e.target.value)}
                          className="pl-10 bg-white/10 border-white/10 text-white font-medium h-12 rounded-xl"
                        />
                      </div>

                      <div className="space-y-6">
                        {selectedVehicleIds.map(vId => {
                          const v = availableVehicles.find(av => av.id === vId);
                          if (!v) return null;
                          
                          return (
                            <div key={vId} className="space-y-3 p-5 border border-white/10 rounded-xl bg-black/30">
                              <h3 className="text-white font-black uppercase tracking-widest text-[10px] flex items-center justify-between gap-2 opacity-60">
                                <span className="flex items-center gap-2"><Car size={12} className="text-primary"/> {v.year} {v.make} {v.model}</span>
                                {vId.startsWith('temp-') && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-white/40">Size:</span>
                                    <Select value={v.size || "medium"} onValueChange={(size) => {
                                      setAvailableVehicles(prev => prev.map(av => av.id === vId ? { ...av, size } : av));
                                    }}>
                                      <SelectTrigger className="h-6 w-24 bg-white/5 border-white/10 text-[10px] text-white font-bold"><SelectValue/></SelectTrigger>
                                      <SelectContent className="bg-zinc-900 border-white/10">
                                        <SelectItem value="small">Small</SelectItem><SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="large">Large</SelectItem><SelectItem value="extra_large">Extra Large</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </h3>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                {services.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase())).map(service => {
                                  const selection = selectedServices.find(sel => sel.id === service.id && sel.vehicleId === vId);
                                  let displayPrice = service.pricingBySize?.[v.size || "medium"] || service.basePrice;
                                  
                                  const client = clients.find(c => c.id === selectedCustomerId);
                                  if (client?.isVIP && client?.vipSettings) {
                                    if (client.vipSettings.vipVehiclePricing?.[vId]?.[service.id]) {
                                      displayPrice = client.vipSettings.vipVehiclePricing[vId][service.id];
                                    } else if (client.vipSettings.customServicePricing?.[service.id]) {
                                      displayPrice = client.vipSettings.customServicePricing[service.id];
                                    }
                                  }

                                  return (
                                    <div key={service.id} className="flex items-center justify-between gap-2 p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/20 transition-all">
                                      <div className="flex items-start space-x-3 flex-1 overflow-hidden">
                                        <Checkbox 
                                          id={`s-${vId}-${service.id}`}
                                          checked={!!selection}
                                          onCheckedChange={(checked) => {
                                            if (checked) setSelectedServices(prev => [...prev, { id: service.id, qty: 1, vehicleId: vId }]);
                                            else setSelectedServices(prev => prev.filter(s => !(s.id === service.id && s.vehicleId === vId)));
                                          }}
                                          className="mt-0.5 border-white/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                        />
                                        <div className="flex flex-col min-w-0">
                                          <Label htmlFor={`s-${vId}-${service.id}`} className="text-sm font-bold cursor-pointer text-white truncate w-full">
                                            {service.name}
                                          </Label>
                                          <span className="text-xs text-primary font-black mt-0.5">${displayPrice}</span>
                                        </div>
                                      </div>
                                      {selection && (
                                        <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1 shrink-0">
                                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/10 text-white"
                                            onClick={() => setSelectedServices(prev => prev.map(s => (s.id === service.id && s.vehicleId === vId) ? { ...s, qty: Math.max(1, s.qty - 1) } : s))}>-</Button>
                                          <span className="text-xs font-bold w-4 text-center text-white">{selection.qty}</span>
                                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/10 text-white"
                                            onClick={() => setSelectedServices(prev => prev.map(s => (s.id === service.id && s.vehicleId === vId) ? { ...s, qty: s.qty + 1 } : s))}>+</Button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            
            {/* ADDONS */}
            {selectedVehicleIds.length > 0 && (
              <div className="space-y-4">
                <div 
                  className="flex items-center justify-between cursor-pointer border-b border-primary/20 bg-primary/5 p-4 rounded-xl hover:bg-primary/10 transition-all group"
                  onClick={() => setIsEnhancementsOpen(!isEnhancementsOpen)}
                >
                  <div className="flex flex-col flex-1">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-black uppercase text-primary tracking-widest flex items-center gap-2">
                        Enhancements ({selectedAddons.length} selected)
                      </h2>
                      {isEnhancementsOpen ? <ChevronUp className="w-5 h-5 text-primary" /> : <ChevronDown className="w-5 h-5 text-primary" />}
                    </div>
                    {!isEnhancementsOpen && selectedAddons.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedAddons.map((a, idx) => {
                          const addon = addons.find(x => x.id === a.id);
                          return (
                            <div key={idx} className="bg-white/5 border border-white/10 px-2 py-1 rounded text-[10px] text-white/50 font-medium">
                              {addon?.name} x{a.qty}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <AnimatePresence>
                  {isEnhancementsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden space-y-4 pt-2"
                    >
                      <div className="relative px-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <Input 
                          placeholder="Search enhancements..." 
                          value={addonSearch}
                          onChange={(e) => setAddonSearch(e.target.value)}
                          className="pl-10 bg-white/10 border-white/10 text-white font-medium h-12 rounded-xl"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                        {addons.filter(a => a.name.toLowerCase().includes(addonSearch.toLowerCase())).map(addon => {
                          const selection = selectedAddons.find(sel => sel.id === addon.id);
                          return (
                            <div key={addon.id} className="flex items-center justify-between gap-2 p-3 bg-white/5 rounded-xl border border-white/5">
                              <div className="flex items-center space-x-3 flex-1 overflow-hidden">
                                <Checkbox 
                                  id={`addon-${addon.id}`}
                                  checked={!!selection}
                                  onCheckedChange={(checked) => {
                                    if (checked) setSelectedAddons(prev => [...prev, { id: addon.id, qty: 1 }]);
                                    else setSelectedAddons(prev => prev.filter(a => a.id !== addon.id));
                                  }}
                                  className="border-white/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <Label htmlFor={`addon-${addon.id}`} className="text-sm cursor-pointer text-white font-bold truncate">
                                  {addon.name} <span className="text-primary text-xs ml-1">${addon.price}</span>
                                </Label>
                              </div>
                              {selection && (
                                <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1 shrink-0">
                                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/10 text-white"
                                    onClick={() => setSelectedAddons(prev => prev.map(a => a.id === addon.id ? { ...a, qty: Math.max(1, a.qty - 1) } : a))}>-</Button>
                                  <span className="text-xs font-bold w-4 text-center text-white">{selection.qty}</span>
                                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/10 text-white"
                                    onClick={() => setSelectedAddons(prev => prev.map(a => a.id === addon.id ? { ...a, qty: a.qty + 1 } : a))}>+</Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* 5. SCHEDULING AND NOTES */}
            <div className="space-y-4">
              <h2 className="text-sm font-black uppercase text-primary tracking-widest border-b border-white/10 pb-2">Schedule & Intel</h2>

              {/* SMART BOOKING 2.0 (LIVE SECTION) */}
              <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden">
                <div className="p-4 bg-white/5 border-b border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <div>
                      <h3 className="font-black text-white tracking-widest uppercase text-xs">Smart Booking Engine</h3>
                      <p className="text-[10px] text-white/50 uppercase tracking-wider">AI Route & Weather Optimization</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isGeneratingSmartSlots && (
                      <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
                    )}
                    {!isGeneratingSmartSlots && smartRecommendations.length > 0 && !isSmartBookingCollapsed && (
                      <>
                        <Button 
                          type="button" 
                          onClick={() => {
                            const best = smartRecommendations[0];
                            if (best) {
                              const formatted = format(best.startTime, "yyyy-MM-dd'T'HH:mm");
                              setScheduledAtValue(formatted);
                              setSelectedSmartSlot(best);
                              setIsSmartBookingCollapsed(true);
                              toast.success("Applied best slot!");
                            }
                          }}
                          className="bg-primary text-white hover:bg-primary/90 h-8 text-xs font-bold"
                        >
                          Use Best Slot
                        </Button>
                        <Button 
                          type="button" 
                          onClick={() => handleGenerateSmartSlots(true)}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white/50 hover:text-white"
                          title="Regenerate"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-4">
                  {isSmartBookingCollapsed && selectedSmartSlot ? (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/20"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                          <Check className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-white uppercase tracking-widest">Applied Optimized Time</p>
                          <p className="text-sm font-bold text-white/80">
                            {format(selectedSmartSlot.startTime, "h:mm a")} - {format(selectedSmartSlot.endTime, "h:mm a")}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setIsSmartBookingCollapsed(false)}
                        className="text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80 hover:bg-primary/5"
                      >
                        View Time Options
                      </Button>
                    </motion.div>
                  ) : missingSmartItems.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.1em]">Smart Booking Unavailable</p>
                          <p className="text-[10px] font-medium text-amber-400/70">Please complete the following requirements to reveal optimized slots.</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-1">
                        {missingSmartItems.map((item) => (
                          <div 
                            key={item.id} 
                            onClick={() => scrollToField(item.target)}
                            className="flex items-center gap-3 group cursor-pointer hover:bg-white/5 p-2 rounded-lg transition-colors border border-transparent hover:border-white/10"
                          >
                            <div className="w-5 h-5 rounded-full border-2 border-white/10 flex items-center justify-center group-hover:border-amber-500/50 transition-colors">
                              <div className="w-1.5 h-1.5 rounded-full bg-white/10 group-hover:bg-amber-500 transition-colors" />
                            </div>
                            <span className="text-[11px] font-medium text-white/40 group-hover:text-white transition-colors">
                              {item.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : smartBookingError ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <p className="text-xs font-bold">
                          {smartBookingError.includes("permissions") 
                            ? "Unable to sync with scheduling database. Please check your connection or contact support."
                            : smartBookingError}
                        </p>
                      </div>

                      {nextAvailableSlot && (
                        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
                          <div className="flex items-center gap-2 text-primary">
                            <CalendarIcon className="w-4 h-4" />
                            <span className="text-xs font-black uppercase tracking-widest">Next Available Suggestion</span>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <p className="text-sm font-black text-white">
                                {format(nextAvailableSlot.startTime, "MMMM d, yyyy")}
                              </p>
                              <p className="text-xs font-bold text-white/60 uppercase tracking-widest">
                                {format(nextAvailableSlot.startTime, "h:mm a")}
                              </p>
                            </div>
                            
                            <Button
                              type="button"
                              onClick={() => {
                                const year = nextAvailableSlot.startTime.getFullYear();
                                const month = String(nextAvailableSlot.startTime.getMonth() + 1).padStart(2, '0');
                                const day = String(nextAvailableSlot.startTime.getDate()).padStart(2, '0');
                                const hours = String(nextAvailableSlot.startTime.getHours()).padStart(2, '0');
                                const minutes = String(nextAvailableSlot.startTime.getMinutes()).padStart(2, '0');
                                const formatted = `${year}-${month}-${day}T${hours}:${minutes}`;
                                setScheduledAtValue(formatted);
                                setIsSmartBookingCollapsed(true);
                                setSmartBookingError("");
                                toast.success("Job window synchronized to next available slot.");
                              }}
                              className="bg-primary text-white font-black uppercase tracking-widest text-[10px] h-8"
                            >
                              Use Suggested Time
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : isGeneratingSmartSlots ? (
                    <div className="flex flex-col items-center justify-center p-8 bg-black/20 rounded-2xl border border-white/5 space-y-4">
                      <div className="relative">
                        <Loader2 className="w-10 h-10 text-primary animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                        </div>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Loading available slots...</p>
                    </div>
                  ) : smartRecommendations.length > 0 ? (
                    <div className="space-y-4">
                      {(() => {
                        const selectedSlot = smartRecommendations.find(r => r.isSelectedTime);
                        if (selectedSlot && selectedSlot.rank !== "Avoid") {
                          return (
                            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-500">
                                <Check className="w-5 h-5" />
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">Selected time is available</p>
                                <p className="text-[10px] text-white/60 font-medium tracking-tight">This booking window complies with all scheduling constraints.</p>
                              </div>
                              {isSmartBookingCollapsed && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => setIsSmartBookingCollapsed(false)}
                                  className="text-[10px] font-black uppercase tracking-widest text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-500/10"
                                >
                                  Refine Slot
                                </Button>
                              )}
                            </div>
                          );
                        } else if (scheduledAtValue) {
                           return (
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                              <div className="p-2 rounded-xl bg-red-500/20 text-red-500">
                                <X className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="text-xs font-black text-red-400 uppercase tracking-widest">Selected time is unavailable</p>
                                <p className="text-[10px] text-white/60 font-medium tracking-tight">Scheduling conflict or business hours restriction. Showing alternatives.</p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {!isSmartBookingCollapsed && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-4">
                          {smartRecommendations.map((rec) => (
                            <div 
                              key={rec.id}
                              className={cn(
                                "flex items-center justify-between p-4 rounded-2xl border transition-all",
                                rec.isSelectedTime && rec.rank !== "Avoid" ? "bg-emerald-500/5 border-emerald-500/20" :
                                rec.rank === "Best" ? "bg-primary/10 border-primary/20" : 
                                "bg-white/5 border-white/10 hover:bg-white/10"
                              )}
                            >
                              <div className="flex items-center gap-4">
                                <div className={cn(
                                  "p-2.5 rounded-xl shrink-0 h-12 w-12 flex items-center justify-center",
                                  rec.rank === "Best" ? "bg-primary/20 text-primary shadow-glow-blue" : 
                                  rec.rank === "Avoid" ? "bg-red-500/20 text-red-400" :
                                  "bg-white/10 text-white/60"
                                )}>
                                  <Clock className="w-6 h-6" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-white text-sm">
                                      {format(rec.startTime, "h:mm a")}
                                    </span>
                                    <Badge className={cn(
                                      "font-black text-[8px] uppercase px-1.5 py-0 h-4 border-none",
                                      rec.rank === "Best" ? "bg-primary text-white" :
                                      rec.rank === "Good" ? "bg-white/20 text-white/60" :
                                      "bg-red-500/50 text-white"
                                    )}>
                                      {rec.rank}
                                    </Badge>
                                  </div>
                                  <div className="flex flex-col gap-0.5 mt-1">
                                    {rec.reasons.map((r, idx) => (
                                      <p key={idx} className="text-[10px] text-white/40 font-medium flex items-center gap-1.5">
                                        {r}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <Button 
                                type="button"
                                size="sm"
                                disabled={rec.isSelectedTime && rec.rank !== "Avoid"}
                                onClick={() => {
                                  const formatted = format(rec.startTime, "yyyy-MM-dd'T'HH:mm");
                                  updateSuggestionAccepted(true);
                                  setScheduledAtValue(formatted);
                                  setSelectedSmartSlot(rec);
                                  setIsSmartBookingCollapsed(true);
                                  setSmartBookingError("");
                                  toast.success("Job window synchronized.");
                                }}
                                className={cn(
                                  "text-[10px] font-black uppercase tracking-widest h-10 px-4 rounded-xl shrink-0 transition-all",
                                  rec.isSelectedTime && rec.rank !== "Avoid"
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : rec.rank === "Best"
                                      ? "bg-primary text-white hover:bg-primary/90 shadow-glow-blue" 
                                      : "bg-white/10 text-white hover:bg-white/20"
                                )}
                              >
                                {rec.isSelectedTime && rec.rank !== "Avoid" ? "Selected" : "Select Slot"}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : !isSmartBookingCollapsed ? (
                    <div className="flex flex-col items-center justify-center p-8 space-y-3 bg-black/20 rounded-2xl border border-white/5 text-center">
                      <AlertTriangle className="w-8 h-8 text-yellow-500/50" />
                      <div>
                        <p className="text-xs font-black text-white/60 uppercase tracking-widest">No available slots found for this date</p>
                        <p className="text-[10px] text-white/30 font-medium mt-1">Try a different date or adjust service duration/business hours.</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Date & Time *</Label>
                  <div className="relative group">
                    <Input 
                      id="datetime-input"
                      type="datetime-local"
                      required
                      value={scheduledAtValue}
                      onChange={(e) => {
                        updateSuggestionAccepted(false);
                        setScheduledAtValue(e.target.value);
                      }}
                      className="bg-black/50 border border-white/10 rounded-xl px-4 py-6 text-white font-bold focus:ring-2 focus:ring-primary/50 relative z-10"
                    />
                    <div 
                      className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer z-20 text-white/40 group-focus-within:text-primary transition-colors"
                      onClick={() => {
                        const el = document.getElementById('datetime-input') as HTMLInputElement;
                        if (el && 'showPicker' in el) {
                          (el as any).showPicker();
                        } else {
                          el?.focus();
                        }
                      }}
                    >
                      <CalendarIcon className="w-5 h-5" />
                    </div>
                  </div>
                  {isAfterHoursDisplay && (
                    <div className="mt-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-black text-yellow-500 uppercase tracking-widest">After-Hours Appointment</p>
                        <p className="text-[10px] text-yellow-500/80 font-medium mt-0.5">This time slot falls outside normal business hours. An after-hours fee of {formatCurrency(afterHoursFeeDisplay)} will be applied.</p>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-white/40 font-medium">Any base date here unlocks the Smart Booking engine above.</p>
                  
                  {routeSynergy && (
                    <div className="mt-4 p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
                      <div className="flex gap-3">
                        <div className="p-1.5 rounded-lg bg-yellow-500/20 text-yellow-500 shrink-0 h-fit">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-black uppercase tracking-widest text-yellow-500 flex items-center gap-1">
                            Route Synergy Detected
                          </p>
                          <p className="text-xs text-white/80">
                            This job is <span className="font-black text-white">{formatDistance(routeSynergy.distance)}</span> from {routeSynergy.name} at {routeSynergy.time}.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <button 
                          type="button"
                          onClick={() => setScheduledAtValue(routeSynergy.beforeValue)}
                          className="flex-1 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 transition-colors text-yellow-500 text-xs font-bold py-2 rounded-lg"
                        >
                          Book Before ({routeSynergy.beforeTime})
                        </button>
                        <button 
                          type="button"
                          onClick={() => setScheduledAtValue(routeSynergy.afterValue)}
                          className="flex-1 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 transition-colors text-yellow-500 text-xs font-bold py-2 rounded-lg"
                        >
                          Book After ({routeSynergy.afterTime})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Manual Price Override (Optional)</Label>
                  <NumberInput
                    placeholder="E.g. 250"
                    value={baseAmount}
                    onValueChange={(val) => setBaseAmount(val)}
                    className="bg-black/50 border border-white/10 rounded-xl px-4 py-6 text-white font-bold focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              
              <div className="space-y-2 pt-2">
                <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Operational Notes</Label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Gate codes, special requests..."
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-4 text-white min-h-[100px] focus:ring-2 focus:ring-primary/50 resize-y"
                />
              </div>
            </div>

            {/* 4. SUMMARY */}
            <div className="bg-black/40 border border-white/10 rounded-2xl p-6 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Price Summary</h3>
              
              <div className="space-y-3 max-h-40 overflow-y-auto mb-4 pr-2 custom-scrollbar">
                {selectedVehicleIds.map(vId => {
                  const v = availableVehicles.find(av => av.id === vId);
                  const vehicleServices = selectedServices.filter(s => s.vehicleId === vId);
                  if (vehicleServices.length === 0) return null;
                  
                  return (
                    <div key={vId} className="space-y-2 pb-3 border-b border-white/5 last:border-0">
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                        {v?.year} {v?.make} {v?.model}
                      </p>
                      {vehicleServices.map(selection => {
                        const service = services.find(s => s.id === selection.id);
                        const client = clients.find(c => c.id === selectedCustomerId);
                        let price = service?.pricingBySize?.[v?.size || "medium"] || service?.basePrice || 0;
                        if (client?.isVIP && client?.vipSettings) {
                          if (client.vipSettings.vipVehiclePricing?.[vId]?.[selection.id]) {
                            price = client.vipSettings.vipVehiclePricing[vId][selection.id];
                          } else if (client.vipSettings.customServicePricing?.[selection.id]) {
                            price = client.vipSettings.customServicePricing[selection.id];
                          }
                        }
                        return (
                          <div key={`${vId}-${selection.id}`} className="flex justify-between text-xs font-bold text-white/80">
                            <span>{service?.name} (x{selection.qty})</span>
                            <span>{formatCurrency(price * selection.qty)}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {selectedAddons.map((selection, idx) => {
                  const addon = addons.find(a => a.id === selection.id);
                  return (
                    <div key={`addon-${selection.id}-${idx}`} className="flex justify-between text-xs font-bold text-white/80 pb-2 border-b border-white/5">
                      <span>{addon?.name} (x{selection.qty})</span>
                      <span>{formatCurrency((addon?.price || 0) * selection.qty)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3 pt-3 border-t border-white/10">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/60 font-bold uppercase tracking-wider text-[10px]">Asset Services</span>
                  <span className="text-white font-black">{formatCurrency(baseAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-sm opacity-80">
                  <span className="text-white/60 font-bold uppercase tracking-wider text-[10px]">{settings?.serviceFeeLabel || "Travel Fee"}</span>
                  <span className="text-white font-black">{travelFee > 0 ? formatCurrency(travelFee) : (appointmentAddress.lat ? "Waived / Included" : "$0.00")}</span>
                </div>
                
                <CustomFeesEditor 
                  fees={customFees} 
                  onChange={setCustomFees}
                  serviceFeeLabel={settings?.serviceFeeLabel}
                  onTravelFeeChange={setTravelFee}
                  travelFeeAmount={travelFee}
                />

                <div className="space-y-2 pt-3 border-t border-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Input
                        placeholder="COUPON CODE"
                        className="bg-black/40 border-white/10 text-white font-black uppercase tracking-widest text-[10px] h-10 pr-10"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      />
                      <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500/50" />
                    </div>
                    <Button 
                      type="button"
                      variant="outline"
                      className="border-white/10 bg-white/5 text-white font-black h-10 px-4 uppercase tracking-widest text-[9px] hover:bg-white/10"
                      onClick={handleApplyCoupon}
                      disabled={isValidatingCoupon}
                    >
                      {isValidatingCoupon ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
                    </Button>
                  </div>
                  {appliedCoupon && (
                    <div className="flex justify-between items-center px-1">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-black text-[8px] uppercase tracking-widest">
                          {appliedCoupon.code} Active
                        </Badge>
                        <button 
                          type="button"
                          onClick={() => { setAppliedCoupon(null); setCouponCode(""); }}
                          className="text-white/40 hover:text-white transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-emerald-500 font-bold text-xs">-{formatCurrency(discountAmount)}</span>
                    </div>
                  )}
                </div>

                {isRiskyClient && (
                  <div className="flex flex-col gap-3 mt-4 p-4 border border-primary/20 bg-primary/5 rounded-xl">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-primary font-bold uppercase tracking-wider text-[10px]">Deposit Required</span>
                      <span className="text-primary font-black">{formatCurrency(riskyDepositAmount)}</span>
                    </div>

                    {!recordedDeposit ? (
                      <div className="space-y-4 pt-3 border-t border-primary/10">
                        <div className="space-y-1">
                          <Label className="uppercase tracking-widest text-[10px] text-white/60">Collect Deposit</Label>
                          <Button
                            type="button"
                            className="w-full bg-[#0A4DFF] hover:opacity-90 text-white font-bold h-10"
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
                              <NumberInput
                                value={activeDepositAmount}
                                onValueChange={(num) => setActiveDepositAmount(num)}
                                className="bg-black border-white/10 text-white font-bold h-10 pl-7 w-full"
                                placeholder="0.00"
                              />
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-bold">$</span>
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
                {isAfterHoursDisplay && (
                  <div className="flex justify-between items-center text-sm pt-2">
                    <span className="text-yellow-500 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
                      <Clock className="w-3 h-3" /> After-Hours Fee
                    </span>
                    <span className="text-yellow-500 font-black">{formatCurrency(afterHoursFeeDisplay)}</span>
                  </div>
                )}
                <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                  <span className="text-primary font-black uppercase tracking-widest text-xs">Projected Total</span>
                  <span className="text-2xl font-black text-white tracking-tighter">
                    {(() => {
                      const customFeesTotal = customFees.reduce((acc, f) => acc + f.amount, 0);
                      return formatCurrency(baseAmount + travelFee + afterHoursFeeDisplay + customFeesTotal);
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 7. ACTIONS */}
          <div className="flex justify-end gap-4 pb-12">
            <Button
              type="button"
              onClick={() => navigate(-1)}
              variant="outline"
              className="px-8 h-12 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl font-bold uppercase tracking-wider"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="px-8 h-12 bg-primary hover:bg-[#2A6CFF] text-white font-black uppercase tracking-widest rounded-xl shadow-glow-blue transition-all hover:scale-105 disabled:opacity-50"
            >
              {saving ? "Deploying..." : "Confirm Booking"}
            </Button>
          </div>
        </form>

        <Sheet open={isRecPanelOpen} onOpenChange={setIsRecPanelOpen}>
          <SheetContent side="right" className="w-full sm:w-[500px] bg-zinc-950 border-white/10 text-white p-0 overflow-y-auto">
            <div className="p-6">
              <SheetHeader className="mb-6">
                <SheetTitle className="text-xl font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <Sparkles className="w-5 h-5" /> Asset Intelligence
                </SheetTitle>
                <SheetDescription className="text-white/40 font-medium font-mono text-[10px] uppercase tracking-widest">
                    AI-Driven Maintenance Protocol Identified
                </SheetDescription>
              </SheetHeader>

              {recPanelVehicleId && (
                <div className="space-y-8">
                    {(() => {
                        const v = availableVehicles.find(av => av.id === recPanelVehicleId);
                        const vehicleRecs = timingRecommendations.filter(r => r.vehicleId === recPanelVehicleId);
                        
                        if (!v) return null;

                        const overdue = vehicleRecs.filter(r => r.dueStatus === "Overdue");
                        const due = vehicleRecs.filter(r => r.dueStatus === "Due");
                        const recs = vehicleRecs.filter(r => r.dueStatus === "Due Soon" || r.dueStatus === "Never Performed");

                        return (
                            <div className="space-y-6">
                                <div className="flex items-center gap-4 p-5 bg-white/5 border border-white/10 rounded-2xl">
                                    <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center border border-primary/30">
                                        <Car className="text-primary w-7 h-7" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-white leading-tight uppercase tracking-tighter">{v.year} {v.make} {v.model}</h3>
                                        <p className="text-primary font-bold text-[10px] uppercase tracking-[0.2em] mt-1 text-primary/80">Diagnostic Mode Active</p>
                                    </div>
                                </div>

                                {overdue.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500 flex items-center gap-2 border-b border-red-500/20 pb-2">
                                            <AlertCircle size={14} /> Critical: Overdue
                                        </h4>
                                        <div className="space-y-2">
                                            {overdue.map(rec => renderRecItem(rec))}
                                        </div>
                                    </div>
                                )}

                                {due.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500 flex items-center gap-2 border-b border-orange-500/20 pb-2">
                                            <Clock size={14} /> Maintenance Due
                                        </h4>
                                        <div className="space-y-2">
                                            {due.map(rec => renderRecItem(rec))}
                                        </div>
                                    </div>
                                )}

                                {recs.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0A4DFF] flex items-center gap-2 border-b border-[#0A4DFF]/20 pb-2">
                                            <Info size={14} /> Suggested Enhancement
                                        </h4>
                                        <div className="space-y-2">
                                            {recs.map(rec => renderRecItem(rec))}
                                        </div>
                                    </div>
                                )}

                                {/* STRATEGIC BUNDLES SECTION */}
                                {(() => {
                                    const vehicleGeneratedBundles = generatedBundles.filter(b => b.vehicleId === recPanelVehicleId);
                                    const vehicleSavedBundles = savedBundles.filter(b => b.vehicleId === recPanelVehicleId && (b.status === "pending" || b.status === "declined"));

                                    if (vehicleGeneratedBundles.length === 0 && vehicleSavedBundles.length === 0) return null;

                                    return (
                                        <div className="space-y-4 pt-6 border-t border-white/10">
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-green-500 flex items-center gap-2">
                                                <Sparkles size={14} /> Strategic Bundle Offer
                                            </h4>
                                            
                                            {vehicleGeneratedBundles.map((bundle, idx) => {
                                                const isAccepted = bundle.includedServices.every(s => 
                                                    selectedServices.some(sel => sel.id === s.serviceId && sel.vehicleId === bundle.vehicleId && sel.isBundleItem)
                                                );

                                                return (
                                                    <div 
                                                        key={`rec-new-bundle-${idx}`} 
                                                        onClick={() => setSelectedBundleDetail(bundle)}
                                                        className={cn(
                                                            "p-5 rounded-2xl border transition-all cursor-pointer space-y-4 shadow-xl shadow-green-900/10",
                                                            isAccepted 
                                                                ? "border-green-500 bg-green-500/10" 
                                                                : "border-green-500/30 bg-green-500/5 hover:border-green-500/50"
                                                        )}
                                                    >
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between items-start">
                                                                <h5 className="text-white font-black text-sm uppercase tracking-tight">{bundle.bundleName}</h5>
                                                                {isAccepted ? (
                                                                    <Badge className="font-black uppercase text-[8px] bg-green-500 text-white border-none flex items-center gap-1">
                                                                        <Check className="w-2 h-2" /> Protocol Accepted
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge className="font-black uppercase text-[8px] bg-green-500 text-white border-none">New Discovery</Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                                {bundle.includedServices.map((s, i) => (
                                                                    <Badge key={i} variant="outline" className="text-[8px] font-black uppercase text-white/40 border-white/10 bg-white/5 py-0 px-1.5">{s.serviceName}</Badge>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        
                                                        {!isAccepted && (
                                                            <div className="flex items-center justify-between py-3 border-y border-white/5">
                                                                <div className="text-white/40 text-xs line-through font-bold">{formatCurrency(bundle.originalPrice)}</div>
                                                                <div className="text-right">
                                                                    <div className="text-green-500 font-black text-lg">{formatCurrency(bundle.dealPrice)}</div>
                                                                    <div className="text-[8px] text-white/30 font-black uppercase tracking-widest">Save {formatCurrency(bundle.savings)}</div>
                                                                </div>
                                                            </div>
                                                        )}
    
                                                        <div className="flex gap-2">
                                                            {!isAccepted ? (
                                                                <>
                                                                    <Button 
                                                                        type="button"
                                                                        variant="ghost"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleSkipGeneratedBundle(bundle);
                                                                        }}
                                                                        className="flex-1 h-9 text-[9px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 text-white/40 border border-white/10"
                                                                    >
                                                                        Skip
                                                                    </Button>
                                                                    <Button 
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleCreateAndAcceptBundle(bundle);
                                                                        }}
                                                                        className="flex-[2] h-9 text-[9px] font-black uppercase tracking-widest bg-green-600 hover:bg-green-500 text-white border-none shadow-lg shadow-green-500/20"
                                                                    >
                                                                        Accept Deal
                                                                    </Button>
                                                                </>
                                                            ) : (
                                                                <Button 
                                                                    type="button"
                                                                    variant="outline"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedServices(prev => prev.filter(s => !(s.vehicleId === bundle.vehicleId && s.isBundleItem)));
                                                                        toast.info("Bundle items removed.");
                                                                    }}
                                                                    className="w-full h-9 text-[9px] font-black uppercase tracking-widest border-green-500/30 text-green-500 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/50"
                                                                >
                                                                    Desync Bundle
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
    
                                            {vehicleSavedBundles.map((bundle, idx) => {
                                                const isAccepted = bundle.includedServices.every(s => 
                                                    selectedServices.some(sel => sel.id === s.serviceId && sel.vehicleId === bundle.vehicleId && sel.isBundleItem)
                                                );

                                                return (
                                                    <div 
                                                        key={`rec-saved-bundle-${idx}`} 
                                                        onClick={() => setSelectedBundleDetail(bundle)}
                                                        className={cn(
                                                            "p-5 rounded-2xl border transition-all cursor-pointer space-y-4",
                                                            isAccepted 
                                                                ? "border-primary bg-primary/10" 
                                                                : "border-white/10 bg-white/5 hover:border-white/30"
                                                        )}
                                                    >
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between items-start">
                                                                <h5 className="text-white font-black text-sm uppercase tracking-tight">{bundle.bundleName}</h5>
                                                                {isAccepted ? (
                                                                    <Badge className="font-black uppercase text-[8px] bg-primary text-white border-none">Protocol Active</Badge>
                                                                ) : (
                                                                    <Badge className="font-black uppercase text-[8px] bg-white/10 text-white/60">Saved Offer</Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                                {bundle.includedServices.map((s, i) => (
                                                                    <Badge key={i} variant="outline" className="text-[8px] font-black uppercase text-white/30 border-white/10 py-0 px-1.5">{s.serviceName}</Badge>
                                                                ))}
                                                            </div>
                                                        </div>
    
                                                        {!isAccepted && (
                                                            <div className="flex items-center justify-between py-3 border-y border-white/5">
                                                                <div className="text-white/40 text-xs line-through font-bold">{formatCurrency(bundle.originalPrice)}</div>
                                                                <div className="text-right">
                                                                    <div className="text-white font-black text-lg">{formatCurrency(bundle.dealPrice)}</div>
                                                                    <div className="text-[8px] text-white/30 font-black uppercase tracking-widest">Save {formatCurrency(bundle.savings)}</div>
                                                                </div>
                                                            </div>
                                                        )}
    
                                                        <Button 
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (isAccepted) {
                                                                    setSelectedServices(prev => prev.filter(s => !(s.vehicleId === bundle.vehicleId && s.isBundleItem)));
                                                                    toast.info("Bundle services removed.");
                                                                } else {
                                                                    handleAcceptBundle(bundle);
                                                                }
                                                            }}
                                                            className={cn(
                                                                "w-full h-9 text-[9px] font-black uppercase tracking-widest border-none shadow-lg",
                                                                isAccepted 
                                                                    ? "bg-primary text-white shadow-glow-blue hover:bg-[#2A6CFF]" 
                                                                    : "bg-primary hover:bg-[#2A6CFF] text-white shadow-glow-blue"
                                                            )}
                                                        >
                                                            {isAccepted ? "Release Deal" : "Honor Deal"}
                                                        </Button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}

                                {overdue.length === 0 && due.length === 0 && recs.length === 0 && (
                                  <div className="text-center py-12">
                                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                                      <Check className="text-white/20 w-8 h-8" />
                                    </div>
                                    <p className="text-white/40 font-bold uppercase tracking-widest text-xs">All Systems Nominal</p>
                                  </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* SERVICE RECOMMENDATION DETAIL DIALOG */}
        <Dialog open={!!selectedRecDetail} onOpenChange={(open) => !open && setSelectedRecDetail(null)}>
          <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-lg p-0 overflow-hidden rounded-2xl">
            {selectedRecDetail && (() => {
              const service = services.find(s => s.id === selectedRecDetail.serviceId);
              const isOverdue = selectedRecDetail.dueStatus === "Overdue";
              const isDue = selectedRecDetail.dueStatus === "Due";
              
              return (
                <div className="flex flex-col">
                  {/* Header / Banner area */}
                  <div className={cn(
                    "p-8 border-b border-white/10",
                    isOverdue ? "bg-red-500/10" : isDue ? "bg-orange-500/10" : "bg-[#0A4DFF]/5"
                  )}>
                    <div className="flex items-center gap-2 mb-4">
                      {isOverdue ? <AlertCircle className="w-5 h-5 text-red-500" /> : 
                       isDue ? <Clock className="w-5 h-5 text-orange-500" /> : 
                       <Info className="w-5 h-5 text-[#0A4DFF]" />}
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-[0.2em]",
                        isOverdue ? "text-red-500" : isDue ? "text-orange-500" : "text-[#0A4DFF]"
                      )}>
                        {selectedRecDetail.dueStatus} Asset Maintenance
                      </span>
                    </div>
                    <DialogTitle className="text-3xl font-black uppercase tracking-tighter text-white mb-2 italic">
                      {selectedRecDetail.serviceName}
                    </DialogTitle>
                    <DialogDescription className="text-white/60 font-bold text-xs uppercase tracking-widest">
                      Diagnostic Protocol Details for {selectedRecDetail.vehicleName}
                    </DialogDescription>
                  </div>

                  <div className="p-8 space-y-8">
                    {/* Description Section */}
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                        <Wrench size={14} /> Service Intelligence
                      </h4>
                      <div className="p-4 bg-white/5 border border-white/5 rounded-xl">
                        <p className="text-sm text-white/80 leading-relaxed font-medium">
                          {service?.description || "High-precision maintenance protocol designed to protect and restore vehicle surfaces."}
                        </p>
                      </div>
                    </div>

                    {/* Why Recommended Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                          <Clock size={14} /> Recovery Pattern
                        </h4>
                        <div className="p-4 bg-white/5 border border-white/5 rounded-xl h-full">
                          <p className="text-xs text-white/60 font-bold leading-snug">
                            {isOverdue ? "Critical threshold reached. Immediate action required to prevent surface degradation." :
                             isDue ? "Standard maintenance interval reached. Recommended for consistent performance." :
                             "Strategic enhancement identified based on asset history and current environmental conditions."}
                          </p>
                          {selectedRecDetail.lastCompletedDate && (
                            <div className="mt-3 pt-3 border-t border-white/5">
                              <p className="text-[10px] text-white/30 uppercase tracking-widest font-black">Last Booking</p>
                              <p className="text-xs text-white/60 font-black italic">{format(selectedRecDetail.lastCompletedDate, "MMMM d, yyyy")}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                          <ShieldCheck size={14} /> Asset Health
                        </h4>
                        <div className="p-4 bg-white/5 border border-white/5 rounded-xl h-full space-y-3">
                          <div>
                            <p className="text-[10px] text-white/30 uppercase tracking-widest font-black">Next Threshold</p>
                            <p className="text-xs text-white font-black italic">
                              {selectedRecDetail.nextDueDate ? format(selectedRecDetail.nextDueDate, "MMMM yyyy") : "Interval-Based"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-white/30 uppercase tracking-widest font-black">Interval Precision</p>
                            <p className="text-xs text-white/60 font-bold leading-snug">Based on {selectedRecDetail.intervalUsed || "standard"} protocol</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Optional Product Section */}
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                        <Droplets size={14} /> Specialized Equipment
                      </h4>
                      <div className="p-4 bg-[#0A4DFF]/5 border border-[#0A4DFF]/10 rounded-xl flex items-center gap-4">
                        <div className="w-10 h-10 bg-[#0A4DFF]/10 rounded-lg flex items-center justify-center shrink-0">
                          <Droplets className="w-5 h-5 text-[#0A4DFF]" />
                        </div>
                        <div>
                          <p className="text-xs text-[#0A4DFF]/60 font-bold leading-tight italic">
                            Premium chemicals and specialized tools will be deployed to ensure maximum protection and precision during this protocol.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-4 flex gap-3">
                      <Button 
                        type="button" 
                        onClick={() => setSelectedRecDetail(null)}
                        variant="outline"
                        className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white font-black uppercase text-xs tracking-widest h-12"
                      >
                        Dismiss
                      </Button>
                      <Button 
                        type="button" 
                        onClick={() => {
                          handleAddRecommendation(selectedRecDetail);
                          setSelectedRecDetail(null);
                        }}
                        className="flex-1 bg-primary hover:bg-[#2A6CFF] text-white font-black uppercase text-xs tracking-widest h-12 shadow-glow-blue transition-all hover:scale-105"
                      >
                        Add to Protocol
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
        
        {/* STRATEGIC BUNDLE RECOMMENDATION DETAIL DIALOG */}
        <Dialog open={!!selectedBundleDetail} onOpenChange={(open) => !open && setSelectedBundleDetail(null)}>
          <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-lg p-0 overflow-hidden rounded-2xl">
            {selectedBundleDetail && (
              <div className="flex flex-col">
                <div className="p-8 bg-green-500/10 border-b border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-5 h-5 text-green-500" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-green-500">Strategic Bundle Discovery</span>
                  </div>
                  <DialogTitle className="text-3xl font-black uppercase tracking-tighter text-white mb-2 italic">
                    {selectedBundleDetail.bundleName}
                  </DialogTitle>
                  <DialogDescription className="text-white/60 font-bold text-xs uppercase tracking-widest">
                    Optimized protocol for {selectedBundleDetail.vehicleName}
                  </DialogDescription>
                </div>

                <div className="p-8 space-y-8">
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                       <ShieldCheck size={14} /> The Strategic Advantage
                    </h4>
                    <div className="p-4 bg-white/5 border border-white/5 rounded-xl">
                      <p className="text-sm text-white/80 leading-relaxed font-medium">
                        This bundle combines critical maintenance protocols that are best performed together. By consolidating these services, we ensure maximum surface protection while delivering a primary pricing advantage.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                      <Check size={14} /> Included Protocols
                    </h4>
                    <div className="grid grid-cols-1 gap-2">
                       {selectedBundleDetail.includedServices.map((s, idx) => (
                         <div key={idx} className="flex items-center gap-3 p-3 bg-white/5 border border-white/5 rounded-lg">
                            <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
                               <Check size={12} className="text-primary" />
                            </div>
                            <span className="text-xs font-bold text-white/80 uppercase tracking-tight">{s.serviceName}</span>
                         </div>
                       ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                      <DollarSign size={14} /> Financial Breakdown
                    </h4>
                    <div className="p-5 rounded-2xl bg-black border border-white/10 space-y-4">
                       <div className="flex justify-between items-center text-xs font-bold text-white/40 uppercase tracking-widest">
                          <span>Standard Booking Cost:</span>
                          <span className="line-through">{formatCurrency(selectedBundleDetail.originalPrice)}</span>
                       </div>
                       <div className="flex justify-between items-center text-sm font-black text-green-500 uppercase tracking-widest bg-green-500/5 p-3 rounded-lg border border-green-500/10">
                          <span>Strategic Deal Price:</span>
                          <span className="text-xl">{formatCurrency(selectedBundleDetail.dealPrice)}</span>
                       </div>
                       <div className="text-center pt-2">
                          <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Total Preservation: {formatCurrency(selectedBundleDetail.savings)}</span>
                       </div>
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <Button 
                      type="button" 
                      onClick={() => setSelectedBundleDetail(null)}
                      variant="outline"
                      className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white font-black uppercase text-xs tracking-widest h-12"
                    >
                      Dismiss
                    </Button>
                    <Button 
                      type="button" 
                      onClick={() => {
                        if (selectedBundleDetail.status === "pending" || !selectedBundleDetail.id) {
                           handleCreateAndAcceptBundle(selectedBundleDetail);
                        } else {
                           handleAcceptBundle(selectedBundleDetail);
                        }
                        setSelectedBundleDetail(null);
                      }}
                      className="flex-1 bg-green-600 hover:bg-green-500 text-white font-black uppercase text-xs tracking-widest h-12 shadow-lg shadow-green-500/20"
                    >
                      Deploy Bundle
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isAddingAddress} onOpenChange={setIsAddingAddress}>
          <DialogContent className="sm:max-w-[425px] bg-card border-white/10 text-white">
            <DialogHeader>
              <DialogTitle className="font-black uppercase tracking-widest text-primary text-xl">Add New Address</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Location Label</Label>
                <Select value={newAddressLabel} onValueChange={setNewAddressLabel}>
                  <SelectTrigger className="bg-black/40 border-white/10 text-white w-full rounded-xl h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-white/10 text-white">
                    <SelectItem value="Home">Home</SelectItem>
                    <SelectItem value="Work">Work</SelectItem>
                    <SelectItem value="Shop">Shop</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Address</Label>
                <AddressInput 
                  defaultValue={newAddressInput}
                  onAddressSelect={(address, lat, lng) => {
                    setNewAddressInput(address);
                    setNewAddressLat(lat);
                    setNewAddressLng(lng);
                  }}
                  className="bg-black/40 border-white/10 text-white rounded-xl h-10 focus:ring-primary/50"
                  placeholder="Type an address..."
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="ghost" className="h-10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white" onClick={() => setIsAddingAddress(false)}>Cancel</Button>
              <Button type="button" className="h-10 text-[10px] font-black uppercase tracking-widest bg-primary text-white" onClick={async () => {
                if (!newAddressInput) return;
                const client = clients.find(c => c.id === selectedCustomerId);
                if (!client) return;
                
                const newEntry = {
                  id: Math.random().toString(36).substr(2, 9),
                  label: newAddressLabel,
                  address: newAddressInput,
                  lat: newAddressLat,
                  lng: newAddressLng,
                  latitude: newAddressLat,
                  longitude: newAddressLng,
                  isDefault: !client.addresses || client.addresses.length === 0
                };
                
                const updatedAddresses = [...(client.addresses || [])];
                
                // backwards compat checks
                if (updatedAddresses.length === 0 && client.address) {
                    updatedAddresses.push({
                        id: "legacy",
                        label: "Default Location",
                        address: client.address,
                        latitude: client.latitude,
                        longitude: client.longitude,
                        isDefault: true
                    });
                }
                
                if (newEntry.isDefault) {
                  updatedAddresses.forEach(a => { a.isDefault = false; });
                  newEntry.isDefault = true;
                }
                updatedAddresses.push(newEntry);
                
                const clientRef = doc(db, "clients", client.id);
                try {
                  const updatePayload: any = { addresses: updatedAddresses };
                  if (newEntry.isDefault) {
                    updatePayload.address = newEntry.address;
                    updatePayload.latitude = newEntry.lat;
                    updatePayload.longitude = newEntry.lng;
                  }
                  await updateDoc(clientRef, updatePayload);
                  
                  // Update local state smoothly
                  setClients(prev => prev.map(c => c.id === client.id ? { ...c, ...updatePayload } : c));
                  setSelectedAddressId(newEntry.id);
                  handleAddressSelect(newEntry.address, newEntry.lat || 0, newEntry.lng || 0, undefined, newEntry.id, newEntry.label);
                  setIsAddingAddress(false);
                  
                  // reset fields
                  setNewAddressInput("");
                  setNewAddressLat(undefined);
                  setNewAddressLng(undefined);
                  setNewAddressLabel("Home");
                } catch (e) {
                  console.error("Failed to add address", e);
                }
              }}>Save & Use Location</Button>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
