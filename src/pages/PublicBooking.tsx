import { useState, useEffect, useMemo } from "react";
import { collection, query, addDoc, serverTimestamp, doc, getDoc, getDocs, where, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Loader2, ArrowRight, Truck, Star, Clock, User, Calendar, MapPin, Receipt, ShieldCheck, Phone, XCircle, Car, CircleDot, AlertCircle, Tag, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import AddressInput from "../components/AddressInput";
import { BusinessSettings, Service, AddOn } from "../types";
import { createNotification } from "../services/notificationService";
import { cn, formatCurrency, formatPhoneNumber } from "@/lib/utils";
import VehicleSelector from "../components/VehicleSelector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { checkLocalAvailability, findLocalBackupSlots } from "../lib/bookingUtils";
import Logo from "../components/Logo";
import { calculateDistance, calculateTravelFee } from "../services/travelService";
import { geocodeAddress } from "../services/geocodingService";

const STEPS = ["Vehicle", "Needs", "Condition", "Options", "Date & Time", "Info", "Review"];

const getVehicleImage = (size: string) => {
  switch (size) {
    case 'coupe': return 'https://images.unsplash.com/photo-1610444391624-9dfc1fbced24?auto=format&fit=crop&q=80&w=800';
    case 'sedan': return 'https://images.unsplash.com/photo-1549317661-bd32c8ce0be2?auto=format&fit=crop&q=80&w=800';
    case 'suv_small': return 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&q=80&w=800';
    case 'suv_large': return 'https://images.unsplash.com/photo-1519750157634-b6d498a584ce?auto=format&fit=crop&q=80&w=800';
    case 'truck': return 'https://images.unsplash.com/photo-1601362840469-51e4d8d58785?auto=format&fit=crop&q=80&w=800';
    case 'van': return 'https://images.unsplash.com/photo-1520050206274-a1cb4463300a?auto=format&fit=crop&q=80&w=800';
    case 'luxury': return 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=800';
    default: return 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&q=80&w=800';
  }
};

function VehicleImagePreview({ size, vehicleInfo }: { size: string, vehicleInfo: string }) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const imageUrl = useMemo(() => getVehicleImage(size), [size]);

  useEffect(() => {
    setError(false);
    setLoading(true);
  }, [imageUrl]);

  const getPlaceholderIcon = () => {
    switch (size) {
      case 'truck': return <Truck className="w-20 h-20 text-gray-200" />;
      case 'van': return <Truck className="w-20 h-20 text-gray-200 -scale-x-100" />;
      case 'suv_small':
      case 'suv_large':
        return <Car className="w-20 h-20 text-gray-200" />;
      case 'luxury':
        return <Star className="w-20 h-20 text-primary/30" />;
      case 'coupe':
      case 'sedan':
        return <Car className="w-20 h-20 text-gray-200" />;
      default:
        return <CircleDot className="w-20 h-20 text-gray-200" />;
    }
  };

  const getTypeName = () => {
    return size.replace('_', ' ').toUpperCase();
  };

  return (
    <div className="absolute inset-0 w-full h-full bg-neutral-50 flex items-center justify-center overflow-hidden">
      {!error && (
        <img 
          src={imageUrl} 
          alt={vehicleInfo} 
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
            loading ? "opacity-0" : "opacity-100"
          )}
          onLoad={() => setLoading(false)}
          onError={() => {
            setError(true);
            setLoading(false);
          }}
        />
      )}
      
      {(error || loading) && (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="flex flex-col items-center">
            <div className="p-6 rounded-full bg-white shadow-sm border border-gray-100 mb-4">
              {getPlaceholderIcon()}
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 mb-1">
              Vehicle Type
            </span>
            <span className="text-sm font-black text-gray-600 uppercase tracking-widest">
              {getTypeName()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-4 mb-8">
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center shrink-0 border border-primary/20">
        <Logo variant="icon" className="w-6 h-6" />
      </div>
      <div className="bg-white p-5 rounded-2xl rounded-tl-sm border border-gray-200 shadow-sm text-gray-800 font-medium text-lg leading-relaxed flex-1">
        <p>{text}</p>
      </div>
    </div>
  );
}

export default function PublicBooking() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [addons, setAddons] = useState<AddOn[]>([]);
  
  const [clientInfo, setClientInfo] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    lat: 0,
    lng: 0,
    vehicleInfo: "",
    vehicleSize: "sedan",
    vehicleColor: "",
    vehiclePlate: ""
  });
  
  const [clientGoal, setClientGoal] = useState("");
  const [condition, setCondition] = useState({
    interior: "",
    exterior: "",
    petHair: "none",
    odor: "no",
    stains: "no",
    protection: "no"
  });

  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [bookingStatus, setBookingStatus] = useState<"idle" | "success" | "deposit_pending">("idle");
  const [isAfterHours, setIsAfterHours] = useState(false);
  const [afterHoursFee, setAfterHoursFee] = useState(0);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [blockedDates, setBlockedDates] = useState<any[]>([]);
  const [isTimeAvailable, setIsTimeAvailable] = useState<boolean | null>(null);
  
  const [backupScheduledAt, setBackupScheduledAt] = useState("");
  const [flexibleSameDay, setFlexibleSameDay] = useState(false);
  const [clientNote, setClientNote] = useState("");
  const [alternativeTimes, setAlternativeTimes] = useState<Date[]>([]);
  const [isBackupAvailable, setIsBackupAvailable] = useState<boolean | null>(null);

  // Coupon / discount state
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");

  const [recommendedChoice, setRecommendedChoice] = useState<{recommendedService: Service | null, lowerCostService: Service | null, suggestedAddons: AddOn[], explanation: string}>({ recommendedService: null, lowerCostService: null, suggestedAddons: [], explanation: "" });

  const [protectedClients, setProtectedClients] = useState<any[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);
  const [matchedRiskRule, setMatchedRiskRule] = useState<any | null>(null);

  useEffect(() => {
    if (!clientInfo.email && !clientInfo.phone) {
      setMatchedRiskRule(null);
      return;
    }

    const email = clientInfo.email.toLowerCase().trim();
    const phone = clientInfo.phone.replace(/\D/g, "");

    const match = protectedClients.find(pc => 
      pc.isActive && (
        (email && pc.email?.toLowerCase().trim() === email) ||
        (phone && pc.phone?.replace(/\D/g, "") === phone)
      )
    );

    const registeredClient = allClients.find(c => 
      (email && c.email?.toLowerCase().trim() === email) ||
      (phone && c.phone?.replace(/\D/g, "") === phone)
    );

    const inherentRisk = registeredClient ? (
      registeredClient.riskLevel || 
      registeredClient.risk_level || 
      registeredClient.riskStatus || 
      registeredClient.clientRiskLevel || 
      registeredClient.riskManagement?.level
    ) : null;

    if (match) {
      setMatchedRiskRule(match);
    } else if (inherentRisk) {
      setMatchedRiskRule({
        id: 'client-risk-' + registeredClient.id,
        isActive: true,
        protectionLevel: inherentRisk,
        riskReason: "Risk level detected on client profile.",
        requiredDepositValue: 25,
        requiredDepositType: "percentage"
      });
    } else {
      setMatchedRiskRule(null);
    }
  }, [clientInfo.email, clientInfo.phone, protectedClients, allClients]);

  useEffect(() => {
    if (!scheduledAt || !settings?.businessHours) {
      setIsAfterHours(false);
      setAfterHoursFee(0);
      setIsTimeAvailable(null);
      return;
    }

    const startAt = new Date(scheduledAt);
    const totalDuration = selectedServices.reduce((acc, id) => {
      const service = services.find(srv => srv.id === id);
      return acc + (service?.estimatedDuration || 120);
    }, 0);

    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = daysOfWeek[startAt.getDay()];
    const daySettings = (settings.businessHours as any)[dayName];
    const allowAfterHours = settings.businessHours.allowAfterHours || false;
    
    let afterHours = false;
    if (daySettings) {
      if (!daySettings.isOpen) {
        afterHours = true;
      } else {
        const apptStartStr = format(startAt, "HH:mm");
        const apptEndAt = new Date(startAt.getTime() + totalDuration * 60000);
        const apptEndStr = format(apptEndAt, "HH:mm");
        
        if (apptStartStr < daySettings.openTime || apptEndStr > daySettings.closeTime) {
          afterHours = true;
        }
      }
    }

    setIsAfterHours(afterHours);
    if (afterHours && allowAfterHours) {
      setAfterHoursFee(settings.businessHours.afterHoursFeeAmount || 0);
    } else {
      setAfterHoursFee(0);
    }
    
    const reqAvail = checkLocalAvailability({
      targetDate: startAt,
      durationMinutes: totalDuration,
      cache: { appointments, blockedDates, businessHours: settings.businessHours }
    });
    
    setIsTimeAvailable(reqAvail.isAvailable);
    
    if (!reqAvail.isAvailable) {
      const recs = findLocalBackupSlots(startAt, totalDuration, {
        appointments,
        blockedDates,
        businessHours: settings.businessHours
      }, 5);
      setAlternativeTimes(recs);
    } else {
      setAlternativeTimes([]);
    }
  }, [scheduledAt, selectedServices, services, settings?.businessHours, appointments, blockedDates]);

  useEffect(() => {
    if (!backupScheduledAt || isTimeAvailable !== false || !settings?.businessHours) {
      setIsBackupAvailable(null);
      return;
    }

    const startAt = new Date(backupScheduledAt);
    const totalDuration = selectedServices.reduce((acc, id) => {
      const service = services.find(srv => srv.id === id);
      return acc + (service?.estimatedDuration || 120);
    }, 0);

    const checkAvail = checkLocalAvailability({
      targetDate: startAt,
      durationMinutes: totalDuration,
      cache: { appointments, blockedDates, businessHours: settings.businessHours }
    });
    setIsBackupAvailable(checkAvail.isAvailable);
  }, [backupScheduledAt, selectedServices, services, settings?.businessHours, isTimeAvailable, appointments, blockedDates]);

  const handleAcceptRecommendation = () => {
    if (recommendedChoice.recommendedService) {
      setSelectedServices([recommendedChoice.recommendedService.id]);
      const suggestedAddonIds = recommendedChoice.suggestedAddons.map(a => a.id);
      setSelectedAddons(suggestedAddonIds);
      toast.success("Professional recommendation applied!");
      if (step < 5) setStep(5);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const settingsSnap = await getDoc(doc(db, "settings", "business"));
        if (settingsSnap.exists()) setSettings(settingsSnap.data() as BusinessSettings);

        const servicesSnap = await getDocs(query(collection(db, "services")));
        setServices(servicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Service)).filter(s => s.isActive));

        const addonsSnap = await getDocs(query(collection(db, "addons")));
        setAddons(addonsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AddOn)).filter(a => a.isActive));

         const today = new Date();
         const ninetyDaysOut = new Date();
         ninetyDaysOut.setDate(ninetyDaysOut.getDate() + 90);
         
         const apptsSnap = await getDocs(query(
           collection(db, "appointments"), 
           where("scheduledAt", ">=", today),
           where("scheduledAt", "<=", ninetyDaysOut)
         ));
        setAppointments(apptsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const blockedSnap = await getDocs(query(collection(db, "blocked_dates"), where("start", ">=", new Date())));
        setBlockedDates(blockedSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching data for booking:", error);
        toast.error("Failed to load booking information.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const calculateRecommendations = () => {
    const sorted = [...services].sort((a,b) => a.basePrice - b.basePrice);
    if (sorted.length === 0) {
      return { recommendedService: null, lowerCostService: null, suggestedAddons: [], explanation: "" };
    }

    let rec = sorted[0];
    let lower: Service | null = null;
    let explanation = "Best fit based on your selections.";
    let sAddons: AddOn[] = [];

    const isHeavy = condition.interior === "heavy" || condition.exterior === "heavy";
    const goalUpper = clientGoal.toLowerCase();

    if (goalUpper.includes("sell") || goalUpper.includes("deep") || goalUpper.includes("luxury")) {
      rec = sorted[sorted.length - 1]; 
      lower = sorted.length > 1 ? sorted[sorted.length - 2] : null;
      explanation = "Based on your goal, this package provides the most thorough reset for both interior and exterior, ensuring the highest quality finish.";
    } else if (isHeavy) {
      rec = sorted[Math.min(sorted.length - 1, 2)] || sorted[0];
      lower = sorted[0];
      explanation = "Given the heavy condition selected, this package provides the necessary depth of cleaning to properly restore your vehicle.";
    } else if (goalUpper.includes("protection")) {
      rec = sorted[Math.floor(sorted.length / 2)] || sorted[0];
      lower = sorted[0];
      explanation = "This package includes enhanced exterior treatments recommended for long-lasting protection.";
    } else {
      rec = sorted[0];
      lower = null;
      explanation = "For light maintenance, this package is the most efficient and cost-effective choice to keep your vehicle looking great.";
    }

    if (condition.petHair === "heavy" || condition.petHair === "moderate") {
      const pa = addons.find(a => a.name.toLowerCase().includes("pet"));
      if (pa) sAddons.push(pa);
    }
    if (condition.odor === "yes") {
      const oa = addons.find(a => a.name.toLowerCase().includes("odor") || a.name.toLowerCase().includes("ozone"));
      if (oa) sAddons.push(oa);
    }

    return { recommendedService: rec, lowerCostService: lower, suggestedAddons: sAddons, explanation };
  };

  useEffect(() => {
    if (step >= 3) {
      const recs = calculateRecommendations();
      setRecommendedChoice(recs);

      if (selectedServices.length === 0 && recs.recommendedService) {
         setSelectedServices([recs.recommendedService.id]);
         setSelectedAddons(recs.suggestedAddons.map(a => a.id));
      }
    }
  }, [clientGoal, condition, services, addons, step]);

  // Apply coupon against Firestore coupons collection
  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const snap = await getDocs(
        query(collection(db, "coupons"), where("code", "==", code), where("isActive", "==", true))
      );
      if (snap.empty) {
        setCouponError("Invalid or expired coupon code.");
        setAppliedCoupon(null);
        setCouponLoading(false);
        return;
      }
      const coupon = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
      // Check expiry
      if (coupon.expiryDate) {
        const expiry = coupon.expiryDate.toDate ? coupon.expiryDate.toDate() : new Date(coupon.expiryDate);
        if (new Date() > expiry) {
          setCouponError("This coupon has expired.");
          setAppliedCoupon(null);
          setCouponLoading(false);
          return;
        }
      }
      setAppliedCoupon(coupon);
      setCouponInput("");
      toast.success(`Coupon applied: ${coupon.title || code}`);
    } catch (err) {
      console.error("Coupon lookup error:", err);
      setCouponError("Could not validate coupon. Please try again.");
    }
    setCouponLoading(false);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError("");
    setCouponInput("");
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledAt) {
      toast.error("Please select a date and time");
      return;
    }

    setIsSubmitting(true);
    try {
      const fullVehicleInfo = `${clientInfo.vehicleInfo} (${clientInfo.vehicleSize}) ${clientInfo.vehicleColor} ${clientInfo.vehiclePlate}`.trim();
      
      const waitlistInfo = isTimeAvailable === false ? {
        backupScheduledAt: backupScheduledAt ? new Date(backupScheduledAt) : null,
        flexibleSameDay,
        clientNote
      } : null;

       const appointmentData: any = {
        customerName: clientInfo.name,
        customerEmail: clientInfo.email,
        customerPhone: clientInfo.phone,
        address: clientInfo.address,
        latitude: clientInfo.lat,
        longitude: clientInfo.lng,
        vehicleInfo: fullVehicleInfo,
        vehicleSize: clientInfo.vehicleSize,
        serviceIds: selectedServices,
        serviceNames: services.filter(s => selectedServices.includes(s.id)).map(s => s.name),
        addOnIds: selectedAddons,
        addOnNames: addons.filter(a => selectedAddons.includes(a.id)).map(a => a.name),
        scheduledAt: new Date(scheduledAt),
        status: isTimeAvailable === false ? "waitlisted" : "requested",
        waitlistInfo,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        customerType: "retail",
        baseAmount: serviceSubtotal,
        travelFee,
        estimatedTravelDistance: travelCalc.miles,
        travelFeeBreakdown: travelFee > 0 ? {
          miles: travelCalc.miles,
          rate: settings?.travelPricing?.pricePerMile ?? 0,
          adjustment: 0,
          isRoundTrip: !!settings?.travelPricing?.roundTripToggle,
        } : null,
        totalBeforeDiscount: totalPrice,
        discountAmount: discountAmount,
        totalAfterDiscount: finalTotal,
        couponId: appliedCoupon?.id || null,
        couponCode: appliedCoupon?.code || null,
        couponTitle: appliedCoupon?.title || null,
        discountType: appliedCoupon?.discountType || null,
        discountPercent: appliedCoupon?.discountType === "percentage" ? appliedCoupon.discountValue : null,
        totalAmount: grandTotal,
        estimatedDuration: totalDuration,
        afterHoursRecord: isAfterHours ? {
          isAfterHours: true,
          afterHoursFee,
          afterHoursReason: "Time selected falls outside standard operating hours.",
          businessHoursSnapshot: settings?.businessHours || null
        } : null,
        depositRequired: depositInfo.isRequired,
        depositAmount: depositInfo.amount,
        depositSource: depositInfo.source,
        depositType: matchedRiskRule?.requiredDepositType || null,
        depositPaid: false,
        depositPaidAt: null,
        balanceDue: depositInfo.isRequired ? balanceDue : grandTotal,
        clientRiskLevelAtBooking: matchedRiskRule?.protectionLevel || null,
        paymentMethod: null,
        paymentProviderRef: null,
        riskProfile: matchedRiskRule ? {
          protectionLevel: matchedRiskRule.protectionLevel,
          riskReason: matchedRiskRule.riskReason,
          ruleId: matchedRiskRule.id
        } : null,
        paymentStatus: depositInfo.isRequired ? "deposit_pending" : "unpaid",
        technicianId: "",
        technicianName: "TBD",
        waiverAccepted: true,
        photos: { before: [], after: [], damage: [] },
        completedTasks: {},
        bookingFunnelData: {
          clientGoal,
          condition,
          recommendedServiceId: recommendedChoice.recommendedService?.id || null,
          lowerCostServiceId: recommendedChoice.lowerCostService?.id || null,
          choseLowerCost: recommendedChoice.lowerCostService?.id && selectedServices.includes(recommendedChoice.lowerCostService.id),
          choseManual: true
        }
      };

      const docRef = await addDoc(collection(db, "appointments"), appointmentData);
      
      try {
        const adminsQuery = query(collection(db, "users"), where("role", "==", "admin"));
        const adminsSnap = await getDocs(adminsQuery);
        
        const isWaitlisted = isTimeAvailable === false;
        
        const isBlockBooking = matchedRiskRule?.protectionLevel === "Block Booking";
        const internalRiskNote = isBlockBooking
          ? ` — 🚫 FLAGGED ACCOUNT (Block Booking${depositInfo.isRequired ? `, deposit ${formatCurrency(depositInfo.amount)}` : ""})`
          : depositInfo.isRequired ? ` — ⚠️ DEPOSIT ${formatCurrency(depositInfo.amount)} required` : "";

        const notifyPromises = adminsSnap.docs.map(admin =>
          createNotification({
            userId: admin.id,
            title: isBlockBooking
              ? "🚫 Flagged Account Booking — Review Required"
              : isWaitlisted ? "Waitlist Request" : "New Booking Request",
            message: isWaitlisted
              ? `${clientInfo.name} requested a booked time and selected a backup time.\nReq: ${format(new Date(scheduledAt), "MMM d, h:mm a")}\nBak: ${backupScheduledAt ? format(new Date(backupScheduledAt), "MMM d, h:mm a") : 'None'}${internalRiskNote}`
              : `New booking request from ${clientInfo.name}${internalRiskNote}\n${format(new Date(scheduledAt), "h:mm a")} - ${services.filter(s => selectedServices.includes(s.id)).map(s => s.name).join(", ")}`,
            type: isWaitlisted ? "waitlist_request" : "new_booking_request",
            category: "Booking Requests",
            relatedId: docRef.id,
            relatedType: "appointment",
            priority: isBlockBooking ? "high" : "medium",
            clientName: clientInfo.name,
            requestedDateTime: new Date(scheduledAt),
            backupDateTime: backupScheduledAt ? new Date(backupScheduledAt) : null,
            bookingRequestId: docRef.id
          })
        );
        await Promise.all(notifyPromises);
      } catch (notifyError) {
        console.error("Failed to notify admins of new booking:", notifyError);
      }

      if (depositInfo.isRequired) {
        setBookingStatus("deposit_pending");
        toast.success("Booking request submitted — deposit required to confirm.");
      } else {
        setBookingStatus("success");
        toast.success("Booking request submitted!");
      }
    } catch (error: any) {
      console.error("Booking error details:", {
        code: error.code,
        message: error.message,
        target: "collection('appointments')"
      });

      if (error.code === 'permission-denied' || error.message?.includes('permission') || error.message?.includes('Missing or insufficient permissions')) {
        toast.error("Booking could not be submitted because the booking database is not allowing this request.");
      } else if (error.message?.includes('missing required') || error.message?.includes('Missing required')) {
        toast.error("Please complete all required booking information before submitting.");
      } else if (error.message?.includes('invalid date') || error.message?.includes('Invalid date')) {
        toast.error("Please choose a valid appointment date and time.");
      } else if (error.code === 'unavailable' || error.message?.includes('network') || error.message?.includes('Connection') || error.message?.includes('offline')) {
        toast.error("Connection issue. Please try again.");
      } else {
        toast.error("Failed to submit booking request.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };


  const totalDuration = useMemo(() => {
    let dur = 0;
    selectedServices.forEach(id => {
       const s = services.find(x => x.id === id);
       if (s) dur += s.estimatedDuration || 120;
    });
    return dur;
  }, [selectedServices, services]);

   const serviceSubtotal = useMemo(() => {
     let price = 0;
     selectedServices.forEach(id => {
        const s = services.find(x => x.id === id);
        if (s) price += s.basePrice;
     });
     selectedAddons.forEach(id => {
       const a = addons.find(x => x.id === id);
       if (a) price += a.price;
     });
     return price;
  }, [selectedServices, selectedAddons, services, addons]);

  // Travel fee — computed from the customer's service address to the
  // business's private travel origin (travelStart*) when set, otherwise
  // baseLatitude/baseLongitude. The origin address itself is never shown
  // to the customer; only the fee and distance appear in the summary.
  const travelCalc = useMemo(() => {
    if (!settings?.travelPricing?.enabled) return { fee: 0, miles: 0, zoneName: "" };
    const originLat = settings.travelStartLatitude ?? settings.baseLatitude;
    const originLng = settings.travelStartLongitude ?? settings.baseLongitude;
    if (!originLat || !originLng) return { fee: 0, miles: 0, zoneName: "" };
    if (!clientInfo.lat || !clientInfo.lng) return { fee: 0, miles: 0, zoneName: "" };
    const distance = calculateDistance(originLat, originLng, clientInfo.lat, clientInfo.lng);
    const result = calculateTravelFee(distance, settings.travelPricing, { lat: clientInfo.lat, lng: clientInfo.lng });
    return { fee: result.fee, miles: result.miles, zoneName: result.zoneName };
  }, [settings, clientInfo.lat, clientInfo.lng]);
  const travelFee = travelCalc.fee;

  // Geocoding fallback — if the customer typed an address without selecting
  // a Google suggestion, lat/lng come in as 0. Debounce-geocode once the
  // address stops changing so the travel fee can still be shown in review.
  useEffect(() => {
    if (!clientInfo.address) return;
    if (clientInfo.lat && clientInfo.lng) return;
    const handle = setTimeout(() => {
      geocodeAddress(clientInfo.address)
        .then(({ lat, lng }) => {
          if (lat && lng) {
            setClientInfo(prev => (prev.lat || prev.lng ? prev : { ...prev, lat, lng }));
          }
        })
        .catch(() => { /* geocoding is best-effort */ });
    }, 700);
    return () => clearTimeout(handle);
  }, [clientInfo.address, clientInfo.lat, clientInfo.lng]);

  const totalPrice = serviceSubtotal + travelFee;

  // Compute discount from applied coupon (applied to subtotal + travel)
  const discountAmount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.discountType === "percentage") {
      return Math.min(totalPrice * (appliedCoupon.discountValue / 100), totalPrice);
    }
    if (appliedCoupon.discountType === "fixed") {
      return Math.min(appliedCoupon.discountValue, totalPrice);
    }
    return 0;
  }, [appliedCoupon, totalPrice]);

  // Final customer-facing total after discount
  const finalTotal = Math.max(0, totalPrice - discountAmount);

  const depositInfo = useMemo(() => {
    let amount = 0;
    let type: "fixed" | "percentage" = "fixed";
    let isRequired = false;
    let source = "service";

    // 1. Check matched risk rule FIRST (Manual Adjustment)
    if (matchedRiskRule) {
      isRequired = true;
      amount = matchedRiskRule.requiredDepositValue || 0;
      type = matchedRiskRule.requiredDepositType || "fixed";
      source = "risk_rule";
    } else {
      // 2. Check service-level deposits
      selectedServices.forEach(id => {
        const s = services.find(x => x.id === id);
        if (s?.depositRequired) {
          isRequired = true;
          if (s.depositType === "percentage") {
            amount += (s.basePrice * (s.depositAmount || 0)) / 100;
          } else {
            amount += s.depositAmount || 0;
          }
        }
      });
    }

    // If percentage from risk rule, calculate from discounted total
    if (source === "risk_rule" && type === "percentage") {
      amount = (finalTotal * amount) / 100;
    }

    // Cap deposit at final total
    amount = Math.min(amount, finalTotal);

    return { amount, isRequired, source, riskLevel: matchedRiskRule?.protectionLevel };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedRiskRule, selectedServices, services, finalTotal]);

  // Grand total = post-discount services + after-hours fee (if any)
  const grandTotal = finalTotal + (isAfterHours ? afterHoursFee : 0);
  // Balance due after deposit is collected
  const balanceDue = depositInfo.isRequired
    ? Math.max(0, grandTotal - depositInfo.amount)
    : grandTotal;


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (bookingStatus === "success" || bookingStatus === "deposit_pending") {
    const isDepositPending = bookingStatus === "deposit_pending";
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-none shadow-2xl rounded-3xl overflow-hidden">
          <div className={cn("p-8 flex justify-center", isDepositPending ? "bg-amber-500" : "bg-primary")}>
            {isDepositPending
              ? <Clock className="w-20 h-20 text-white" />
              : <CheckCircle2 className="w-20 h-20 text-white" />
            }
          </div>
          <CardContent className="p-8 text-center space-y-4">
            <h2 className="text-2xl font-black text-gray-900 tracking-tighter uppercase">
              {isDepositPending ? "Booking Pending" : "Request Received!"}
            </h2>
            {isDepositPending ? (
              <>
                <p className="text-gray-500 font-medium">
                  Thank you, <strong className="text-gray-800">{clientInfo.name.split(" ")[0] || "there"}</strong>! Your booking request has been submitted.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-left space-y-2">
                  <p className="text-xs font-black uppercase tracking-widest text-amber-700">Deposit Required to Confirm</p>
                  <p className="text-2xl font-black text-amber-700">{formatCurrency(depositInfo.amount)}</p>
                  <p className="text-sm font-medium text-amber-800">
                    This booking is not confirmed until your deposit is received. Our team will contact you shortly with payment instructions.
                  </p>
                </div>
                {settings?.businessPhone && (
                  <p className="text-sm text-gray-400 font-medium">
                    Questions? Call us at <span className="text-primary font-black">{settings.businessPhone}</span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-gray-500 font-medium">
                Thank you, <strong className="text-gray-800">{clientInfo.name.split(" ")[0] || "there"}</strong>! Your booking request has been submitted.
                We will review it and contact you shortly to confirm.
              </p>
            )}
            <Button onClick={() => window.location.reload()} className="w-full bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 rounded-xl shadow-glow-blue transition-all hover:scale-105">
              Book Another Appointment
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Top Navigation */}
      <div className="bg-[#050505] border-b border-zinc-800 sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
           <div className="pt-2">
             <Logo variant="full" color="white" /> 
           </div>
           
           <div className="hidden sm:flex items-center gap-8">
             <div className="flex items-center gap-2">
               <ShieldCheck className="w-5 h-5 text-primary" />
               <span className="text-xs font-black uppercase tracking-widest text-white">Secure Booking</span>
             </div>
             {settings?.businessPhone && (
               <div className="flex items-center gap-2 text-white">
                 <Phone className="w-5 h-5 text-primary" />
                 <span className="text-sm font-black">{settings.businessPhone}</span>
               </div>
             )}
           </div>
        </div>
        
        {/* Stepper */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-4 hide-scrollbar overflow-x-auto">
           <div className="flex items-center gap-2 min-w-max">
             {STEPS.map((stepName, idx) => {
               const sNum = idx + 1;
               const isActive = step === sNum;
               const isCompleted = step > sNum;
               return (
                 <div key={idx} className="flex items-center">
                   <div className={cn(
                     "flex items-center justify-center h-8 w-8 rounded-full text-xs font-black transition-all",
                     isActive ? "bg-primary text-white scale-110 shadow-glow-blue" : 
                     isCompleted ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-400"
                   )}>
                     {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : sNum}
                   </div>
                   <span className={cn(
                     "ml-2 text-xs font-bold uppercase tracking-widest transition-colors",
                     isActive ? "text-gray-900" : isCompleted ? "text-gray-700" : "text-gray-400"
                   )}>
                     {stepName}
                   </span>
                   {idx < STEPS.length - 1 && (
                     <div className={cn(
                       "w-8 sm:w-12 h-1 mx-3 rounded-full transition-colors",
                       isCompleted ? "bg-primary/20" : "bg-gray-100"
                     )} />
                   )}
                 </div>
               )
             })}
           </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 flex-1">
         
         {/* Left Column (Assistant Flow) */}
         <div className="lg:col-span-7 pb-20">
           <form id="booking-form" onSubmit={handleBooking} className="space-y-6">
              
              {/* STEP 1: VEHICLE */}
              {step === 1 && (
                <div className="animate-in fade-in slide-in-from-right-4">
                  <AssistantBubble text="Let's start with your vehicle details. What will we be working on today?" />
                  
                  <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
                    <CardContent className="p-8 space-y-6">
                      <div className="space-y-4">
                        <VehicleSelector 
                          onSelect={(v) => setClientInfo(prev => ({ ...prev, vehicleInfo: `${v.year} ${v.make} ${v.model}` }))}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label className="text-gray-900 font-bold">Vehicle Size</Label>
                            <Select value={clientInfo.vehicleSize} onValueChange={v => setClientInfo(prev => ({...prev, vehicleSize: v}))}>
                              <SelectTrigger className="border-gray-300 text-gray-900 focus:ring-primary/20">
                                <SelectValue placeholder="Select Size" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="coupe">Coupe/Compact</SelectItem>
                                <SelectItem value="sedan">Sedan</SelectItem>
                                <SelectItem value="suv_small">Small SUV / Crossover</SelectItem>
                                <SelectItem value="suv_large">Large SUV / Minivan</SelectItem>
                                <SelectItem value="truck">Truck</SelectItem>
                                <SelectItem value="van">Van / Work Van</SelectItem>
                                <SelectItem value="luxury">Luxury / Exotic</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-gray-900 font-bold">Color (Optional)</Label>
                            <Input className="border-gray-300 text-gray-900 placeholder:text-gray-500 focus-visible:ring-primary/20" value={clientInfo.vehicleColor} onChange={e => setClientInfo(prev => ({...prev, vehicleColor: e.target.value}))} placeholder="Black" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-gray-900 font-bold">License Plate (Optional)</Label>
                            <Input className="border-gray-300 text-gray-900 placeholder:text-gray-500 focus-visible:ring-primary/20" value={clientInfo.vehiclePlate} onChange={e => setClientInfo(prev => ({...prev, vehiclePlate: e.target.value}))} placeholder="ABC-1234" />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end pt-4">
                        <Button 
                          type="button" 
                          className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 text-lg shadow-glow-blue transition-all hover:scale-105"
                          disabled={!clientInfo.vehicleInfo}
                          onClick={() => setStep(2)}
                        >
                          Next <ArrowRight className="w-5 h-5 ml-2" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* STEP 2: NEEDS */}
              {step === 2 && (
                <div className="animate-in fade-in slide-in-from-right-4">
                  <AssistantBubble text="Got it! What are the main goals for this detail? Select the option that best fits." />
                  
                  <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
                    <CardContent className="p-8 space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                          "Maintenance clean",
                          "Deep clean",
                          "Preparing to sell",
                          "Odor removal",
                          "Pet hair removal",
                          "Paint protection",
                          "Luxury/premium reset",
                          "Fleet/business service"
                        ].map(goal => (
                          <div 
                            key={goal}
                            className={cn(
                              "p-4 rounded-xl border-2 transition-all cursor-pointer font-bold text-center",
                              clientGoal === goal ? "border-primary bg-primary/5 text-primary shadow-glow-blue" : "border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50"
                            )}
                            onClick={() => setClientGoal(goal)}
                          >
                            {goal}
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between pt-4 border-t border-gray-100">
                        <Button type="button" variant="outline" className="font-bold h-12 px-8 border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10" onClick={() => setStep(1)}>Back</Button>
                        <Button 
                          type="button" 
                          className="bg-primary hover:bg-neutral-900 font-bold h-12 px-8 text-lg text-white"
                          disabled={!clientGoal}
                          onClick={() => setStep(3)}
                        >
                          Next <ArrowRight className="w-5 h-5 ml-2" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* STEP 3: CONDITION */}
              {step === 3 && (
                <div className="animate-in fade-in slide-in-from-right-4">
                  <AssistantBubble text="Could you tell me a bit about the vehicle's current condition?" />
                  
                  <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
                    <CardContent className="p-8 space-y-8">
                      
                      <div className="space-y-4">
                        <Label className="text-sm font-black uppercase tracking-widest text-gray-900">Interior Condition</Label>
                        <div className="grid grid-cols-3 gap-3">
                          {['light', 'moderate', 'heavy'].map(lvl => (
                            <div
                              key={'int-'+lvl}
                              className={cn(
                                "p-4 rounded-xl border-2 transition-all cursor-pointer font-bold text-center capitalize",
                                condition.interior === lvl ? "border-primary bg-primary/5 text-primary shadow-glow-blue" : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                              )}
                              onClick={() => setCondition(prev => ({...prev, interior: lvl}))}
                            >
                              {lvl}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-sm font-black uppercase tracking-widest text-gray-900">Exterior Condition</Label>
                        <div className="grid grid-cols-3 gap-3">
                          {['light', 'moderate', 'heavy'].map(lvl => (
                            <div
                              key={'ext-'+lvl}
                              className={cn(
                                "p-4 rounded-xl border-2 transition-all cursor-pointer font-bold text-center capitalize",
                                condition.exterior === lvl ? "border-primary bg-primary/5 text-primary shadow-glow-blue" : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                              )}
                              onClick={() => setCondition(prev => ({...prev, exterior: lvl}))}
                            >
                              {lvl}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4 pt-6 border-t border-gray-100">
                        <Label className="text-sm font-black uppercase tracking-widest text-gray-900">Additional Concerns</Label>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label className="text-gray-700 font-bold">Pet Hair</Label>
                            <Select value={condition.petHair} onValueChange={v => setCondition(prev => ({...prev, petHair: v}))}>
                              <SelectTrigger className="border-gray-300 text-gray-900 focus:ring-primary/20 h-11"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="light">Light</SelectItem>
                                <SelectItem value="moderate">Moderate</SelectItem>
                                <SelectItem value="heavy">Heavy</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-gray-700 font-bold">Odor Issue?</Label>
                            <Select value={condition.odor} onValueChange={v => setCondition(prev => ({...prev, odor: v}))}>
                              <SelectTrigger className="border-gray-300 text-gray-900 focus:ring-primary/20 h-11"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="no">No</SelectItem>
                                <SelectItem value="yes">Yes</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="space-y-2">
                            <Label className="text-gray-700 font-bold">Stains?</Label>
                            <Select value={condition.stains} onValueChange={v => setCondition(prev => ({...prev, stains: v}))}>
                              <SelectTrigger className="border-gray-300 text-gray-900 focus:ring-primary/20 h-11"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="no">No</SelectItem>
                                <SelectItem value="yes">Yes</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-gray-700 font-bold">Want Protection?</Label>
                            <Select value={condition.protection} onValueChange={v => setCondition(prev => ({...prev, protection: v}))}>
                              <SelectTrigger className="border-gray-300 text-gray-900 focus:ring-primary/20 h-11"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="no">No</SelectItem>
                                <SelectItem value="yes">Yes</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between pt-4 border-t border-gray-100">
                        <Button type="button" variant="outline" className="font-bold h-12 px-8 border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10" onClick={() => setStep(2)}>Back</Button>
                        <Button 
                          type="button" 
                          className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 text-lg shadow-glow-blue transition-all hover:scale-105"
                          disabled={!condition.interior || !condition.exterior}
                          onClick={() => setStep(4)}
                        >
                          Next <ArrowRight className="w-5 h-5 ml-2" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* STEP 4: OPTIONS */}
              {step === 4 && (
                <div className="animate-in fade-in slide-in-from-right-4">
                  <AssistantBubble text="I've put together a recommendation for you on the right. You can select it directly, or browse all options below to fully customize your service." />
                  
                  <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
                    <CardContent className="p-8 space-y-8">
                       <div className="space-y-4">
                        <Label className="text-sm font-black uppercase tracking-widest text-gray-900">All Services</Label>
                        <div className="grid grid-cols-1 gap-3">
                          {services.map(service => (
                            <div 
                              key={service.id}
                              className={cn(
                                "p-5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between",
                                selectedServices.includes(service.id) ? "border-primary bg-primary/5 shadow-glow-blue" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                              )}
                              onClick={() => {
                                setSelectedServices(prev => 
                                  prev.includes(service.id) ? prev.filter(id => id !== service.id) : [service.id]
                                );
                              }}
                            >
                              <div className="flex items-center gap-4">
                                <Checkbox checked={selectedServices.includes(service.id)} className="w-5 h-5 border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                                <div>
                                  <p className="font-black text-gray-900 text-lg">{service.name}</p>
                                  <p className="text-sm text-gray-600 font-bold">{service.estimatedDuration} mins</p>
                                </div>
                              </div>
                              <p className="font-black text-primary text-xl">${service.basePrice}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {addons.length > 0 && (
                        <div className="space-y-4 pt-6 border-t border-gray-100">
                          <Label className="text-sm font-black uppercase tracking-widest text-gray-900">All Add-ons</Label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {addons.map(addon => (
                              <div 
                                key={addon.id}
                                className={cn(
                                  "p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between",
                                  selectedAddons.includes(addon.id) ? "border-primary bg-primary/5 shadow-glow-blue" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                                )}
                                onClick={() => {
                                  setSelectedAddons(prev => 
                                    prev.includes(addon.id) ? prev.filter(id => id !== addon.id) : [...prev, addon.id]
                                  );
                                }}
                              >
                                <div className="flex items-center gap-3">
                                  <Checkbox className="border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary" checked={selectedAddons.includes(addon.id)} />
                                  <p className="text-sm font-bold text-gray-900">{addon.name}</p>
                                </div>
                                <p className="text-sm font-black text-primary">+${addon.price}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between pt-4 border-t border-gray-100">
                        <Button type="button" variant="outline" className="font-bold h-12 px-8 border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10" onClick={() => setStep(3)}>Back</Button>
                        <Button 
                          type="button" 
                          className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 text-lg shadow-glow-blue transition-all hover:scale-105"
                          disabled={selectedServices.length === 0}
                          onClick={() => setStep(5)}
                        >
                          Next <ArrowRight className="w-5 h-5 ml-2" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* STEP 5: DATE & TIME */}
              {step === 5 && (
                <div className="animate-in fade-in slide-in-from-right-4">
                  <AssistantBubble text="When would you like us to come out?" />
                  
                  <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
                    <CardContent className="p-8 space-y-6">
                      <div className="space-y-4">
                        <Label className="text-sm font-black uppercase tracking-widest text-gray-900">Request a Date & Time</Label>
                        <div className="space-y-2">
                          <Input 
                            type="datetime-local" 
                            value={scheduledAt}
                            onChange={e => setScheduledAt(e.target.value)}
                            className="h-14 bg-white border-2 border-gray-300 rounded-xl focus:border-primary transition-all text-gray-900 font-bold text-lg px-4"
                          />
                          {scheduledAt && isTimeAvailable !== null && (
                            <div className={cn(
                              "mt-4 p-5 rounded-2xl border flex flex-col gap-4",
                              isTimeAvailable ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-red-50 border-red-200 text-red-800"
                            )}>
                              <div className="flex items-start gap-3">
                                {isTimeAvailable ? (
                                  <>
                                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                                    <span className="text-sm font-bold">This time appears to be available!</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <span className="text-sm font-bold leading-tight">
                                      The time you selected is currently unavailable. We can place you on the waiting list for this requested time. Please choose a backup time from the available options below in case this time does not open.
                                    </span>
                                  </>
                                )}
                              </div>
                              
                              {/* Waitlist Options */}
                              {isTimeAvailable === false && (
                                <div className="mt-2 space-y-6 pt-5 border-t border-red-200">
                                  
                                  <div className="space-y-1">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-red-900/60">Requested Time</Label>
                                    <p className="font-bold text-red-900">{format(new Date(scheduledAt), "MMM d, yyyy h:mm a")}</p>
                                    <p className="text-xs font-bold text-red-800 mt-1 flex items-center gap-1">
                                      Status: <span className="bg-white/50 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest">Waiting List Requested</span>
                                    </p>
                                  </div>

                                  <div className="space-y-3">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-red-900/60">Available Backup Times</Label>
                                    {alternativeTimes.length > 0 ? (
                                      <div className="flex flex-wrap gap-2">
                                        {alternativeTimes.map((t, i) => {
                                          const tString = format(t, "yyyy-MM-dd'T'HH:mm");
                                          const isSelected = backupScheduledAt === tString;
                                          return (
                                            <Button 
                                              key={i} 
                                              type="button" 
                                              variant="outline" 
                                              className={cn(
                                                "border-2 text-sm font-bold transition-all",
                                                isSelected 
                                                  ? "bg-red-800 border-red-800 text-white" 
                                                  : "bg-white border-red-200 hover:border-red-400 text-red-900 hover:bg-white/80"
                                              )}
                                              onClick={() => setBackupScheduledAt(tString)}
                                            >
                                              {format(t, "E, MMM d - h:mm a")}
                                            </Button>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <p className="text-sm italic text-red-800/80">No immediate backup times found within normal business hours.</p>
                                    )}
                                  </div>

                                  <div className="space-y-3">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-red-900/60">Backup Time (Required)</Label>
                                    <Input 
                                      type="datetime-local" 
                                      value={backupScheduledAt}
                                      onChange={e => setBackupScheduledAt(e.target.value)}
                                      className="h-12 bg-white border-2 border-red-200 text-red-900 font-bold focus:border-red-500"
                                    />
                                    {backupScheduledAt && isBackupAvailable === false && (
                                       <div className="flex items-center gap-2 text-red-700 bg-red-100 p-2 rounded-lg mt-1">
                                         <AlertCircle className="w-4 h-4" />
                                          <p className="text-xs font-bold">That backup time is not available. Please choose one of the available options.</p>
                                       </div>
                                    )}
                                  </div>

                                  <div className="pt-2 border-t border-red-200 space-y-4">
                                    <div className="flex items-center space-x-3">
                                      <Checkbox 
                                        id="flexibleSameDay" 
                                        checked={flexibleSameDay} 
                                        onCheckedChange={(c) => setFlexibleSameDay(c as boolean)} 
                                        className="h-5 w-5 border-2 border-red-300 data-[state=checked]:bg-red-800 data-[state=checked]:border-red-800"
                                      />
                                      <Label htmlFor="flexibleSameDay" className="text-sm font-bold text-red-900 cursor-pointer">
                                        I am flexible for ANY TIME on my requested day
                                      </Label>
                                    </div>

                                    <div className="space-y-2">
                                      <Label className="text-[10px] font-black uppercase tracking-widest text-red-900/60">Note for Admin (Optional)</Label>
                                      <Input 
                                        placeholder="e.g. Can do mornings only..."
                                        value={clientNote}
                                        onChange={e => setClientNote(e.target.value)}
                                        className="bg-white border-red-200 placeholder:text-red-300 text-red-900"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {isAfterHours && (
                            <div className="mt-4 p-5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-4">
                              <Clock className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-black text-amber-800 uppercase tracking-widest">After-Hours Request</p>
                                <p className="text-sm text-amber-800 font-bold mt-1 leading-relaxed">
                                  This time slot falls outside our standard operating hours. {afterHoursFee > 0 ? `An after-hours premium of ${formatCurrency(afterHoursFee)} will be applied.` : "Please note that after-hours requests may take longer to approve."}
                                </p>
                              </div>
                            </div>
                          )}
                          <p className="text-xs text-gray-500 font-medium italic pt-2">
                            * All time requests require final approval from our team.
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-between pt-4 border-t border-gray-100">
                        <Button type="button" variant="outline" className="font-bold h-12 px-8 border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10" onClick={() => setStep(4)}>Back</Button>
                        <Button 
                          type="button" 
                          className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 text-lg shadow-glow-blue transition-all hover:scale-105 disabled:opacity-50"
                          disabled={!scheduledAt || (isTimeAvailable === false && (!backupScheduledAt || isBackupAvailable === false))}
                          onClick={() => setStep(6)}
                        >
                          Next <ArrowRight className="w-5 h-5 ml-2" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* STEP 6: INFO */}
              {step === 6 && (
                <div className="animate-in fade-in slide-in-from-right-4">
                  <AssistantBubble text="Who should we contact, and where will we be detailing?" />
                  
                  <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
                    <CardContent className="p-8 space-y-8">
                      <div className="space-y-4">
                        <Label className="text-sm font-black uppercase tracking-widest text-gray-900">Contact Details</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="space-y-2">
                            <Label className="text-gray-900 font-bold">Full Name</Label>
                            <Input 
                              placeholder="John Doe" 
                              className="border-gray-300 text-gray-900 placeholder:text-gray-400 focus-visible:ring-primary/20 h-11"
                              value={clientInfo.name}
                              onChange={e => setClientInfo(prev => ({ ...prev, name: e.target.value }))}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-gray-900 font-bold">Email</Label>
                            <Input 
                              type="email" 
                              placeholder="john@example.com" 
                              className="border-gray-300 text-gray-900 placeholder:text-gray-400 focus-visible:ring-primary/20 h-11"
                              value={clientInfo.email}
                              onChange={e => setClientInfo(prev => ({ ...prev, email: e.target.value }))}
                              required
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label className="text-gray-900 font-bold">Phone</Label>
                            <Input 
                              type="tel" 
                              placeholder="(555) 000-0000" 
                              className="border-gray-300 text-gray-900 placeholder:text-gray-400 focus-visible:ring-primary/20 h-11"
                              value={clientInfo.phone}
                              onChange={e => setClientInfo(prev => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))}
                              required
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 pt-4 border-t border-gray-100">
                        <Label className="text-sm font-black uppercase tracking-widest text-gray-900">Service Location</Label>
                        <AddressInput 
                          onAddressSelect={(addr, lat, lng) => setClientInfo(prev => ({ ...prev, address: addr, lat, lng }))}
                          placeholder="Enter your location for mobile service"
                        />
                      </div>

                      <div className="flex justify-between pt-4 border-t border-gray-100">
                        <Button type="button" variant="outline" className="font-bold h-12 px-8 border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10" onClick={() => setStep(5)}>Back</Button>
                        <Button 
                          type="button" 
                          className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 text-lg shadow-glow-blue transition-all hover:scale-105"
                          disabled={!clientInfo.name || !clientInfo.phone || !clientInfo.address}
                          onClick={() => setStep(7)}
                        >
                          Review & Confirm <ArrowRight className="w-5 h-5 ml-2" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* STEP 7: REVIEW */}
              {step === 7 && (
                <div className="animate-in fade-in slide-in-from-right-4">
                  <AssistantBubble text="Almost done! Please review your details and confirm." />
                  
                  <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
                    <CardContent className="p-8 space-y-6">
                      
                      <div className="space-y-4 border-2 border-gray-100 rounded-2xl p-6 bg-gray-50">
                        <div className="flex items-center gap-3 border-b border-gray-200 pb-4">
                           <User className="w-5 h-5 text-gray-500" />
                           <div>
                             <p className="font-black text-gray-900">{clientInfo.name}</p>
                             <p className="text-sm text-gray-600 font-medium">{clientInfo.phone} • {clientInfo.email}</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-3 pt-2">
                           <MapPin className="w-5 h-5 text-gray-500" />
                           <p className="text-sm font-bold text-gray-800">{clientInfo.address}</p>
                        </div>
                      </div>

                      {/* Display Mobile Booking Summary for mobile screens */}
                      <div className="block lg:hidden border-2 border-gray-100 rounded-2xl p-6 bg-white space-y-4">
                         <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                           <Receipt className="w-5 h-5 text-gray-500" />
                           <h3 className="font-black text-gray-900 uppercase tracking-tight">Booking Summary</h3>
                         </div>
                         <div className="space-y-2">
                           {selectedServices.map(id => {
                              const s = services.find(x => x.id === id);
                              if (!s) return null;
                              return (
                                <div key={id} className="flex justify-between items-start">
                                  <span className="font-bold text-gray-900">{s.name}</span>
                                  <span className="font-black text-gray-900">{formatCurrency(s.basePrice)}</span>
                                </div>
                              )
                           })}
                           {selectedAddons.map(id => {
                              const a = addons.find(x => x.id === id);
                              if (!a) return null;
                              return (
                                <div key={id} className="flex justify-between items-start text-sm">
                                  <span className="font-bold text-gray-600">+ {a.name}</span>
                                  <span className="font-black text-gray-600">{formatCurrency(a.price)}</span>
                                </div>
                              )
                           })}
                           {travelFee > 0 && (
                             <div className="flex justify-between items-start text-sm pt-2 border-t border-gray-100">
                               <span className="font-bold text-gray-700 flex items-center gap-1.5">
                                 <Truck className="w-3.5 h-3.5 text-gray-500" />
                                 Travel Fee{travelCalc.miles ? ` (~${travelCalc.miles.toFixed(1)} mi)` : ""}
                               </span>
                               <span className="font-black text-gray-700">{formatCurrency(travelFee)}</span>
                             </div>
                           )}
                           {discountAmount > 0 && (
                             <div className="flex justify-between items-center text-sm pt-1 border-t border-gray-100">
                               <span className="font-bold text-primary flex items-center gap-1"><Tag className="w-3 h-3" /> Discount</span>
                               <span className="font-black text-primary">− {formatCurrency(discountAmount)}</span>
                             </div>
                           )}
                           {isAfterHours && afterHoursFee > 0 && (
                             <div className="flex justify-between items-center text-sm">
                               <span className="font-bold text-amber-700 flex items-center gap-1"><Clock className="w-3 h-3" /> After-Hours</span>
                               <span className="font-black text-amber-700">+ {formatCurrency(afterHoursFee)}</span>
                             </div>
                           )}
                        </div>
                        <div className="pt-4 border-t border-gray-200 space-y-2">
                           <div className="flex justify-between items-center">
                             <div>
                               <p className="text-[10px] uppercase font-black tracking-widest text-gray-500">Total</p>
                               <p className="text-xs font-bold text-gray-500 flex items-center gap-1 mt-0.5">
                                 <Clock className="w-3 h-3" /> {totalDuration} mins
                               </p>
                             </div>
                             <div className="text-right">
                               {discountAmount > 0 && (
                                 <p className="text-[10px] text-gray-400 line-through">{formatCurrency(totalPrice)}</p>
                               )}
                               <span className="text-3xl font-black text-primary">{formatCurrency(grandTotal)}</span>
                             </div>
                           </div>
                           {depositInfo.isRequired && (
                             <div className="pt-2 border-t border-primary/20 space-y-1.5">
                               <div className="flex justify-between items-center">
                                 <span className="text-[10px] font-black uppercase tracking-widest text-primary">Deposit Due Now</span>
                                 <span className="font-black text-primary">{formatCurrency(depositInfo.amount)}</span>
                               </div>
                               <div className="flex justify-between items-center">
                                 <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Balance Due Later</span>
                                 <span className="font-black text-gray-600">{formatCurrency(balanceDue)}</span>
                               </div>
                             </div>
                           )}
                        </div>
                      </div>

                      {/* Coupon entry */}
                      <div className="space-y-3 p-5 bg-gray-50 border border-gray-200 rounded-2xl">
                        <p className="text-xs font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
                          <Tag className="w-4 h-4 text-primary" />
                          Promo / Coupon Code
                        </p>
                        {appliedCoupon ? (
                          <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                            <div>
                              <p className="text-sm font-black text-primary">{appliedCoupon.title || appliedCoupon.code}</p>
                              <p className="text-xs font-bold text-primary/80">
                                {appliedCoupon.discountType === "percentage"
                                  ? `${appliedCoupon.discountValue}% off`
                                  : `$${appliedCoupon.discountValue} off`}
                                {" "}— saves {formatCurrency(discountAmount)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleRemoveCoupon}
                              className="text-primary/60 hover:text-red-500 transition-colors"
                            >
                              <XIcon className="w-5 h-5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Enter coupon code"
                              value={couponInput}
                              onChange={(e) => {
                                setCouponInput(e.target.value.toUpperCase());
                                setCouponError("");
                              }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleApplyCoupon(); } }}
                              className="flex-1 h-11 px-4 border-2 border-gray-300 rounded-xl text-sm font-bold text-gray-900 bg-white focus:border-primary outline-none placeholder:text-gray-400 transition-colors"
                            />
                            <button
                              type="button"
                              onClick={handleApplyCoupon}
                              disabled={couponLoading || !couponInput.trim()}
                              className="h-11 px-5 bg-primary text-white font-black text-xs uppercase tracking-widest rounded-xl disabled:opacity-50 hover:bg-[#2A6CFF] transition-colors"
                            >
                              {couponLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                            </button>
                          </div>
                        )}
                        {couponError && (
                          <p className="text-xs font-bold text-red-600 flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" /> {couponError}
                          </p>
                        )}
                      </div>

                      <div className="flex items-start gap-3 p-5 bg-gray-50 rounded-2xl border border-gray-200 group transition-all">
                        <Checkbox id="agreement" className="mt-1 border-gray-400 data-[state=checked]:bg-primary data-[state=checked]:border-primary" required />
                        <Label htmlFor="agreement" className="text-sm leading-relaxed text-gray-800 font-bold cursor-pointer">
                          I acknowledge that I have read and agree to the <span className="text-primary font-black uppercase tracking-widest text-[10px]">Service Agreement</span> and understand the cancellation policy. I authorize the team to perform requested services at the provided location.
                        </Label>
                      </div>

                      <div className="flex justify-between pt-4 border-t border-gray-100">
                        <Button type="button" variant="outline" className="font-bold h-12 px-8 border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10" onClick={() => setStep(6)}>Back</Button>
                        <Button 
                          type="submit" 
                          form="booking-form"
                          className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 text-lg shadow-glow-blue transition-all hover:scale-105"
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                          {depositInfo.isRequired ? "Submit Request — Deposit Required" : "Submit Booking Request"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
           </form>
         </div>

         {/* Right Column (Sticky Panel) */}
         <div className="lg:col-span-5 relative hidden lg:block">
            <div className="sticky top-40 space-y-6">
               
               {/* Vehicle Preview Card */}
               {step >= 2 && clientInfo.vehicleInfo && (
                 <Card className="border border-gray-200 shadow-sm rounded-3xl overflow-hidden bg-white">
                    <div className="h-48 w-full bg-gray-100 relative">
                       <VehicleImagePreview 
                         size={clientInfo.vehicleSize} 
                         vehicleInfo={clientInfo.vehicleInfo} 
                       />
                       <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                       <div className="absolute bottom-4 left-4 right-4 text-white">
                         <span className="text-[10px] uppercase font-black tracking-widest text-white/70">Your Vehicle</span>
                         <h3 className="font-black text-xl truncate">{clientInfo.vehicleInfo || 'Vehicle Selected'}</h3>
                         <p className="text-sm text-white/80 font-medium">{clientInfo.vehicleColor} {clientInfo.vehicleSize.replace('_', ' ').toUpperCase()}</p>
                       </div>
                    </div>
                 </Card>
               )}
               
               {/* Show Recommendation Panel starting Step 3 or 4 */}
               {(step >= 3 && recommendedChoice.recommendedService) && (
                 <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4">
                    <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-black uppercase tracking-widest gap-2 border border-primary/20 shadow-sm">
                      <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                      Recommended for your vehicle
                    </div>
                    
                    <Card className="border-2 border-primary shadow-xl shadow-primary/10 overflow-hidden rounded-3xl bg-white transition-all">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-xl font-black text-gray-900 leading-tight">{recommendedChoice.recommendedService.name}</h3>
                            <p className="text-sm text-gray-600 font-bold mt-1 flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {recommendedChoice.recommendedService.estimatedDuration} mins
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black text-primary">{formatCurrency(recommendedChoice.recommendedService.basePrice)}</p>
                          </div>
                        </div>
                        
                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-4">
                          <span className="block text-[10px] uppercase font-black tracking-widest text-primary mb-1">Why this service fits</span>
                          <p className="text-sm font-bold text-gray-800 leading-relaxed">
                            {recommendedChoice.explanation}
                          </p>
                        </div>
                        
                        {recommendedChoice.recommendedService.description && (
                          <div className="space-y-1.5 mb-4 px-2">
                            {recommendedChoice.recommendedService.description.split('\n').filter(Boolean).map((item, idx) => (
                              <div key={idx} className="flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                <span className="text-sm font-medium text-gray-700">{item.replace(/^-\s*/, '')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {recommendedChoice.suggestedAddons.length > 0 && (
                          <div className="space-y-2 mt-4 pt-4 border-t border-gray-100">
                             <span className="block text-[10px] uppercase font-black tracking-widest text-gray-500 mb-2">Suggested Add-ons</span>
                             {recommendedChoice.suggestedAddons.map(a => (
                               <div key={a.id} className="flex justify-between text-sm font-bold text-gray-700 bg-white border border-gray-100 p-2 rounded-lg">
                                  <span>+ {a.name}</span>
                               </div>
                             ))}
                          </div>
                        )}

                        <Button 
                          type="button" 
                          onClick={handleAcceptRecommendation}
                          className="w-full mt-6 bg-primary hover:bg-[#2A6CFF] text-white font-black uppercase tracking-widest h-12 rounded-xl shadow-glow-blue group"
                        >
                          Accept Recommendation
                          <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </CardContent>
                    </Card>
                    
                    {recommendedChoice.lowerCostService && (
                      <Card className="border border-gray-200 shadow-sm overflow-hidden rounded-2xl bg-white mt-4 opacity-90 transition-opacity hover:opacity-100">
                         <CardContent className="p-5 flex items-center justify-between">
                            <div>
                               <span className="block text-[10px] uppercase font-black tracking-widest text-gray-500 mb-1">Lower-cost option available</span>
                               <h4 className="font-black text-gray-900">{recommendedChoice.lowerCostService.name}</h4>
                            </div>
                            {step === 4 && (
                               <Button 
                                 type="button" 
                                 variant="outline" 
                                 className="font-bold border-gray-300 text-gray-700 text-xs px-4"
                                 onClick={() => {
                                   setSelectedServices([recommendedChoice.lowerCostService!.id]);
                                   setSelectedAddons([]); 
                                   setStep(5);
                                 }}
                               >
                                 Select instead
                               </Button>
                            )}
                         </CardContent>
                      </Card>
                    )}
                 </div>
               )}

               {/* Booking Summary */}
               <Card className="border border-gray-200 shadow-lg rounded-3xl overflow-hidden bg-white">
                 <div className="bg-gray-50 border-b border-gray-100 p-5 flex items-center gap-3">
                   <Receipt className="w-5 h-5 text-gray-500" />
                   <h3 className="font-black text-gray-900 uppercase tracking-tight">Booking Summary</h3>
                 </div>
                 <CardContent className="p-6 space-y-4">
                   {selectedServices.length === 0 ? (
                      <p className="text-sm font-medium text-gray-500 italic text-center py-4">No services selected yet</p>
                   ) : (
                     <>
                        <div className="space-y-3">
                           {selectedServices.map(id => {
                              const s = services.find(x => x.id === id);
                              if (!s) return null;
                              return (
                                <div key={id} className="flex justify-between items-start">
                                  <span className="font-bold text-gray-900">{s.name}</span>
                                  <span className="font-black text-gray-900">{formatCurrency(s.basePrice)}</span>
                                </div>
                              )
                           })}
                           {selectedAddons.map(id => {
                              const a = addons.find(x => x.id === id);
                              if (!a) return null;
                              return (
                                <div key={id} className="flex justify-between items-start text-sm">
                                  <span className="font-bold text-gray-600">+ {a.name}</span>
                                  <span className="font-black text-gray-600">{formatCurrency(a.price)}</span>
                                </div>
                              )
                           })}
                           {travelFee > 0 && (
                             <div className="flex justify-between items-start text-sm pt-2 border-t border-gray-100">
                               <span className="font-bold text-gray-700 flex items-center gap-1.5">
                                 <Truck className="w-3.5 h-3.5 text-gray-500" />
                                 Travel Fee{travelCalc.miles ? ` (~${travelCalc.miles.toFixed(1)} mi)` : ""}
                               </span>
                               <span className="font-black text-gray-700">{formatCurrency(travelFee)}</span>
                             </div>
                           )}
                        </div>
                        {(discountAmount > 0 || (isAfterHours && afterHoursFee > 0)) && (
                          <div className="space-y-1 pt-2 border-t border-gray-100">
                            {discountAmount > 0 && (
                              <div className="flex justify-between items-center text-sm">
                                <span className="font-bold text-primary flex items-center gap-1">
                                  <Tag className="w-3 h-3" /> Coupon discount
                                </span>
                                <span className="font-black text-primary">− {formatCurrency(discountAmount)}</span>
                              </div>
                            )}
                            {isAfterHours && afterHoursFee > 0 && (
                              <div className="flex justify-between items-center text-sm">
                                <span className="font-bold text-amber-700 flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> After-Hours
                                </span>
                                <span className="font-black text-amber-700">+ {formatCurrency(afterHoursFee)}</span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="pt-3 border-t border-gray-200 space-y-2">
                           <div className="flex justify-between items-end">
                             <div>
                               <p className="text-[10px] uppercase font-black tracking-widest text-gray-500 mb-1">Total</p>
                               <p className="text-sm font-bold text-gray-600 flex items-center gap-1">
                                 <Clock className="w-3 h-3" /> {totalDuration} mins
                               </p>
                             </div>
                             <div className="text-right">
                               {discountAmount > 0 && (
                                 <p className="text-[10px] text-gray-400 line-through mb-0.5">{formatCurrency(totalPrice)}</p>
                               )}
                               <span className="text-3xl font-black text-primary">{formatCurrency(grandTotal)}</span>
                             </div>
                           </div>
                           {depositInfo.isRequired && (
                             <div className="pt-2 border-t border-primary/20 space-y-1.5">
                               <div className="flex justify-between items-center">
                                 <span className="text-[10px] font-black uppercase tracking-widest text-primary">Deposit Due Now</span>
                                 <span className="text-sm font-black text-primary">{formatCurrency(depositInfo.amount)}</span>
                               </div>
                               <div className="flex justify-between items-center">
                                 <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Balance Due Later</span>
                                 <span className="text-sm font-black text-gray-600">{formatCurrency(balanceDue)}</span>
                               </div>
                             </div>
                           )}
                        </div>
                     </>
                   )}
                 </CardContent>
               </Card>
               
               {/* Footer trust badges */}
               <div className="flex items-center justify-center gap-6 text-gray-400 pt-4">
                  <div className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Mobile</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Insured</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">5-Star Rated</span>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
