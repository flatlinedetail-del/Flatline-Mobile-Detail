import { useState, useEffect, useMemo } from "react";
import { collection, query, addDoc, serverTimestamp, doc, getDoc, getDocs, where } from "firebase/firestore";
import { db } from "../firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Loader2, ArrowRight, Truck, Star, Clock, User, Calendar, MapPin, Receipt, ShieldCheck, Phone, XCircle, Car, CircleDot, AlertCircle } from "lucide-react";
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
import { getVehicleFallbackImageUrl, getVehicleImageUrl, VehicleImageInput } from "../lib/vehicleImages";

const STEPS = ["Vehicle", "Needs", "Condition", "Options", "Date & Time", "Info", "Review"];

type PublicVehicleSize = "coupe" | "sedan" | "suv_small" | "suv_large" | "truck" | "van" | "luxury";

type PublicBookingVehicle = {
  year?: string;
  make?: string;
  model?: string;
  type?: string;
  bodyStyle?: string;
  vehicleInfo?: string;
};

const LUXURY_VEHICLE_KEYWORDS = [
  "aston martin",
  "ferrari",
  "lamborghini",
  "bentley",
  "rolls royce",
  "rolls-royce",
  "porsche",
  "mclaren",
  "maserati",
  "maybach",
  "lotus",
  "bugatti",
  "luxury",
  "exotic",
];

const LARGE_SUV_KEYWORDS = [
  "tahoe",
  "suburban",
  "yukon",
  "expedition",
  "escalade",
  "navigator",
  "sequoia",
  "armada",
  "large suv",
  "full-size suv",
  "full size suv",
];

const TRUCK_KEYWORDS = [
  "f-150",
  "f150",
  "chevy silverado",
  "chevrolet silverado",
  "gmc sierra",
  "ford f-150",
  "ford f150",
  "silverado",
  "silverado hd",
  "silverado 1500",
  "silverado 2500",
  "silverado 3500",
  "hd",
  "heavy duty",
  "2500",
  "3500",
  "dually",
  "ford",
  "ram",
  "sierra",
  "tundra",
  "tacoma",
  "ranger",
  "colorado",
  "titan",
  "truck",
  "pickup",
];

const VAN_KEYWORDS = [
  "sprinter",
  "transit",
  "promaster",
  "cargo van",
  "minivan",
  "van",
];

const SEDAN_KEYWORDS = [
  "camry",
  "accord",
  "altima",
  "corolla",
  "civic",
  "elantra",
  "malibu",
  "sentra",
  "jetta",
  "sedan",
];

const SMALL_SUV_KEYWORDS = [
  "suv",
  "crossover",
  "rav4",
  "cr-v",
  "crv",
  "rogue",
  "equinox",
  "escape",
  "forester",
  "tucson",
  "sportage",
  "cherokee",
];

const COUPE_KEYWORDS = ["coupe", "compact", "hatchback"];

const hasVehicleKeyword = (source: string, keywords: string[]) =>
  keywords.some((keyword) => source.includes(keyword));

const buildVehicleSource = (vehicle: PublicBookingVehicle) =>
  [
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.type,
    vehicle.bodyStyle,
    vehicle.vehicleInfo,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const detectPublicVehicleSize = (vehicle: PublicBookingVehicle): PublicVehicleSize => {
  const source = buildVehicleSource(vehicle);

  if (hasVehicleKeyword(source, VAN_KEYWORDS)) return "van";
  if (hasVehicleKeyword(source, TRUCK_KEYWORDS)) return "truck";
  if (hasVehicleKeyword(source, LUXURY_VEHICLE_KEYWORDS)) return "luxury";
  if (hasVehicleKeyword(source, LARGE_SUV_KEYWORDS)) return "suv_large";
  if (hasVehicleKeyword(source, SMALL_SUV_KEYWORDS)) return "suv_small";
  if (hasVehicleKeyword(source, COUPE_KEYWORDS)) return "coupe";
  if (hasVehicleKeyword(source, SEDAN_KEYWORDS)) return "sedan";

  return "sedan";
};

function VehicleImagePreview({ vehicle }: { vehicle: VehicleImageInput }) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const fallbackImageUrl = useMemo(() => getVehicleFallbackImageUrl(vehicle), [vehicle.make, vehicle.model, vehicle.type, vehicle.size, vehicle.bodyStyle, vehicle.vehicleInfo]);
  const imageUrl = useMemo(() => getVehicleImageUrl(vehicle), [vehicle.imageUrl, vehicle.photoUrl, vehicle.vehicleImage, vehicle.thumbnailUrl, fallbackImageUrl]);
  const displayImageUrl = error ? fallbackImageUrl : imageUrl;

  useEffect(() => {
    setError(false);
    setLoading(true);
  }, [imageUrl]);

  const getPlaceholderIcon = () => {
    switch (vehicle.size) {
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
    return vehicle.size?.toString().replace('_', ' ').toUpperCase() || "VEHICLE";
  };

  return (
    <div className="absolute inset-0 w-full h-full bg-neutral-50 flex items-center justify-center overflow-hidden">
      {displayImageUrl && (
        <img
          src={displayImageUrl}
          alt={vehicle.vehicleInfo || "Selected vehicle"}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
            loading ? "opacity-0" : "opacity-100"
          )}
          onLoad={() => setLoading(false)}
          onError={() => {
            if (displayImageUrl !== fallbackImageUrl) {
              setError(true);
              return;
            }
            setLoading(false);
          }}
        />
      )}
      
      {loading && (
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

function AssistantBubble({ text, settings }: { text: string; settings: BusinessSettings | null }) {
  return (
    <div className="flex gap-4 mb-8">
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center shrink-0 border border-primary/20">
        <Logo variant="icon" brand="business" settingsOverride={settings} className="w-6 h-6" />
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
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleColor: "",
    vehiclePlate: ""
  });
  
  const [clientGoals, setClientGoals] = useState<string[]>([]);
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
  const [bookingStatus, setBookingStatus] = useState<"idle" | "success">("idle");
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
  const [selectedVehicleKey, setSelectedVehicleKey] = useState("");
  const [vehicleSizeManuallyChanged, setVehicleSizeManuallyChanged] = useState(false);

  const [recommendedChoice, setRecommendedChoice] = useState<{recommendedService: Service | null, lowerCostService: Service | null, suggestedAddons: AddOn[], explanation: string}>({ recommendedService: null, lowerCostService: null, suggestedAddons: [], explanation: "" });

  const [protectedClients, setProtectedClients] = useState<any[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);
  const [matchedRiskRule, setMatchedRiskRule] = useState<any | null>(null);
  const clientGoal = clientGoals.join(", ");
  const bookingNavButtonClass = "bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 text-lg shadow-glow-blue transition-all hover:scale-105";

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

  const handleVehicleSelect = (vehicle: PublicBookingVehicle) => {
    const vehicleInfo = `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}`.trim();
    const vehicleKey = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join("|").toLowerCase();
    const isBrandNewVehicle = vehicleKey !== selectedVehicleKey;
    const detectedVehicleSize = detectPublicVehicleSize({ ...vehicle, vehicleInfo });

    setClientInfo(prev => ({
      ...prev,
      vehicleInfo,
      vehicleSize: isBrandNewVehicle || !vehicleSizeManuallyChanged ? detectedVehicleSize : prev.vehicleSize,
      vehicleYear: vehicle.year || "",
      vehicleMake: vehicle.make || "",
      vehicleModel: vehicle.model || ""
    }));
    setSelectedVehicleKey(vehicleKey);

    if (isBrandNewVehicle) {
      setVehicleSizeManuallyChanged(false);
    }
  };

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

  const toggleClientGoal = (goal: string) => {
    setClientGoals(prev => (
      prev.includes(goal) ? prev.filter(item => item !== goal) : [...prev, goal]
    ));
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
        baseAmount: totalPrice,
        totalAmount: totalPrice + (isAfterHours && afterHoursFee ? afterHoursFee * 100 : 0),
        estimatedDuration: totalDuration,
        afterHoursRecord: isAfterHours ? {
          isAfterHours: true,
          afterHoursFee,
          afterHoursReason: "Time selected falls outside standard operating hours.",
          businessHoursSnapshot: settings?.businessHours || null
        } : null,
        depositAmount: depositInfo.amount,
        depositRequired: depositInfo.isRequired,
        depositSource: depositInfo.source,
        riskProfile: matchedRiskRule ? {
          protectionLevel: matchedRiskRule.protectionLevel,
          riskReason: matchedRiskRule.riskReason,
          ruleId: matchedRiskRule.id
        } : null,
        paymentStatus: "unpaid",
        technicianId: "",
        technicianName: "TBD",
        waiverAccepted: true,
        photos: { before: [], after: [], damage: [] },
        completedTasks: {},
        bookingFunnelData: {
          clientGoal,
          clientGoals,
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
        
        const notifyPromises = adminsSnap.docs.map(admin => 
          createNotification({
            userId: admin.id,
            title: isWaitlisted ? "Waitlist Request" : "New Booking Request",
            message: isWaitlisted 
              ? `${clientInfo.name} requested a booked time and selected a backup time.\nReq: ${format(new Date(scheduledAt), "MMM d, h:mm a")}\nBak: ${backupScheduledAt ? format(new Date(backupScheduledAt), "MMM d, h:mm a") : 'None'}` 
              : `New booking request from ${clientInfo.name}\n${format(new Date(scheduledAt), "h:mm a")} - ${services.filter(s => selectedServices.includes(s.id)).map(s => s.name).join(", ")}`,
            type: isWaitlisted ? "waitlist_request" : "new_booking_request",
            category: "Booking Requests",
            relatedId: docRef.id,
            relatedType: "appointment",
            priority: "medium",
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

      setBookingStatus("success");
      toast.success("Booking request submitted!");
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

   const totalPrice = useMemo(() => {
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

    // If percentage from risk rule, calculate now
    if (source === "risk_rule" && type === "percentage") {
      amount = (totalPrice * amount) / 100;
    }

    return { amount, isRequired, source, riskLevel: matchedRiskRule?.protectionLevel };
  }, [matchedRiskRule, selectedServices, services, totalPrice]);


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (bookingStatus === "success") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-none shadow-2xl rounded-3xl overflow-hidden">
          <div className="bg-green-500 p-8 flex justify-center">
            <CheckCircle2 className="w-20 h-20 text-white" />
          </div>
          <CardContent className="p-8 text-center space-y-4">
            <h2 className="text-2xl font-black text-gray-900 tracking-tighter uppercase">Request Received!</h2>
            <p className="text-gray-500 font-medium">
              Thank you, {clientInfo.name.split(" ")[0] || "there"}! Your booking request has been submitted. 
              We will review it and contact you shortly to confirm.
            </p>
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
             <Logo variant="full" color="white" brand="business" settingsOverride={settings} /> 
           </div>
           
           <div className="hidden sm:flex items-center gap-8">
             <div className="flex items-center gap-2">
               <ShieldCheck className="w-5 h-5 text-emerald-500" />
               <span className="text-xs font-black uppercase tracking-widest text-emerald-50">Secure Booking</span>
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
                  <AssistantBubble settings={settings} text="Let's start with your vehicle details. What will we be working on today?" />
                  
                  <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
                    <CardContent className="p-8 space-y-6">
                      <div className="space-y-4">
                        <VehicleSelector 
                          onSelect={handleVehicleSelect}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label className="text-gray-900 font-bold">Vehicle Size</Label>
                            <Select
                              value={clientInfo.vehicleSize}
                              onValueChange={(v: PublicVehicleSize) => {
                                setVehicleSizeManuallyChanged(true);
                                setClientInfo(prev => ({...prev, vehicleSize: v}));
                              }}
                            >
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
                  <AssistantBubble settings={settings} text="Got it! What are the main goals for this detail? Select all that apply." />
                  
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
                              clientGoals.includes(goal) ? "border-primary bg-primary/5 text-primary shadow-glow-blue" : "border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50"
                            )}
                            onClick={() => toggleClientGoal(goal)}
                          >
                            {goal}
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between pt-4 border-t border-gray-100">
                        <Button type="button" className={bookingNavButtonClass} onClick={() => setStep(1)}>Back</Button>
                        <Button 
                          type="button" 
                          className={bookingNavButtonClass}
                          disabled={clientGoals.length === 0}
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
                  <AssistantBubble settings={settings} text="Could you tell me a bit about the vehicle's current condition?" />
                  
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
                        <Button type="button" className={bookingNavButtonClass} onClick={() => setStep(2)}>Back</Button>
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
                  <AssistantBubble settings={settings} text="I've put together a recommendation for you on the right. You can select it directly, or browse all options below to fully customize your service." />
                  
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
                        <Button type="button" className={bookingNavButtonClass} onClick={() => setStep(3)}>Back</Button>
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
                  <AssistantBubble settings={settings} text="When would you like us to come out?" />
                  
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
                              isTimeAvailable ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
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
                        <Button type="button" className={bookingNavButtonClass} onClick={() => setStep(4)}>Back</Button>
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
                  <AssistantBubble settings={settings} text="Who should we contact, and where will we be detailing?" />
                  
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
                              onChange={e => setClientInfo(prev => ({ ...prev, phone: e.target.value }))}
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
                        <Button type="button" className={bookingNavButtonClass} onClick={() => setStep(5)}>Back</Button>
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
                  <AssistantBubble settings={settings} text="Almost done! Please review your details and confirm." />
                  
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
                         <div className="space-y-3">
                           {selectedServices.map(id => {
                              const s = services.find(x => x.id === id);
                              if (!s) return null;
                              return (
                                <div key={id} className="flex justify-between items-start">
                                  <span className="font-bold text-gray-900">{s.name}</span>
                                  <span className="font-black text-gray-900">${s.basePrice}</span>
                                </div>
                              )
                           })}
                           {selectedAddons.map(id => {
                              const a = addons.find(x => x.id === id);
                              if (!a) return null;
                              return (
                                <div key={id} className="flex justify-between items-start text-sm">
                                  <span className="font-bold text-gray-600">+ {a.name}</span>
                                  <span className="font-black text-gray-600">${a.price}</span>
                                </div>
                              )
                           })}
                        </div>
                        <div className="pt-4 border-t border-gray-100 flex justify-between items-end">
                           <div>
                             <p className="text-[10px] uppercase font-black tracking-widest text-gray-500 mb-1">Estimated Total</p>
                             <p className="text-sm font-bold text-gray-600 flex items-center gap-1">
                               <Clock className="w-3 h-3" /> {totalDuration} mins
                             </p>
                           </div>
                            <div className="text-right">
                              {depositInfo.isRequired && (
                                <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">
                                  Deposit Required: {formatCurrency(depositInfo.amount)}
                                </p>
                              )}
                              <span className="text-3xl font-black text-primary">{formatCurrency(totalPrice)}</span>
                            </div>
                        </div>
                      </div>

                      {matchedRiskRule && (
                        <div className={cn(
                          "p-5 rounded-2xl border flex items-start gap-4 animate-in fade-in zoom-in",
                          matchedRiskRule.protectionLevel === "High" ? "bg-red-50 border-red-200" : 
                          matchedRiskRule.protectionLevel === "Block Booking" ? "bg-black border-red-900" : "bg-orange-50 border-orange-200"
                        )}>
                          <AlertCircle className={cn("w-6 h-6 shrink-0 mt-0.5", 
                            matchedRiskRule.protectionLevel === "High" ? "text-red-600" : 
                            matchedRiskRule.protectionLevel === "Block Booking" ? "text-red-500" : "text-orange-600"
                          )} />
                          <div>
                            <p className={cn("text-xs font-black uppercase tracking-widest", 
                              matchedRiskRule.protectionLevel === "High" ? "text-red-800" : 
                              matchedRiskRule.protectionLevel === "Block Booking" ? "text-red-400" : "text-orange-800"
                            )}>
                              {matchedRiskRule.protectionLevel === "Block Booking" ? "RESTRICTED ACCOUNT" : `${matchedRiskRule.protectionLevel} Risk Detected`}
                            </p>
                            <p className={cn("text-sm font-bold mt-1", matchedRiskRule.protectionLevel === "Block Booking" ? "text-white" : "text-gray-800")}>
                              {matchedRiskRule.protectionLevel === "Block Booking" 
                                ? "This account has been restricted. We are not accepting new automated bookings for this client at this time. Please contact us directly."
                                : <>Based on our risk management protocols, a deposit of <span className="text-primary font-black">{formatCurrency(depositInfo.amount)}</span> is required to secure this booking.</>
                              }
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-3 p-5 bg-gray-50 rounded-2xl border border-gray-200 group transition-all">
                        <Checkbox id="agreement" className="mt-1 border-gray-400 data-[state=checked]:bg-primary data-[state=checked]:border-primary" required />
                        <Label htmlFor="agreement" className="text-sm leading-relaxed text-gray-800 font-bold cursor-pointer">
                          I acknowledge that I have read and agree to the <span className="text-primary font-black uppercase tracking-widest text-[10px]">Service Agreement</span> and understand the cancellation policy. I authorize the team to perform requested services at the provided location.
                        </Label>
                      </div>

                      <div className="flex justify-between pt-4 border-t border-gray-100">
                        <Button type="button" className={bookingNavButtonClass} onClick={() => setStep(6)}>Back</Button>
                        <Button 
                          type="submit" 
                          form="booking-form"
                          className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 text-lg shadow-glow-blue transition-all hover:scale-105"
                          disabled={isSubmitting || matchedRiskRule?.protectionLevel === "Block Booking"}
                        >
                          {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                          {matchedRiskRule?.protectionLevel === "Block Booking" ? "Account Restricted" : "Submit Booking Requirement"}
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
                         vehicle={{
                           vehicleInfo: clientInfo.vehicleInfo,
                           year: clientInfo.vehicleYear,
                           make: clientInfo.vehicleMake,
                           model: clientInfo.vehicleModel,
                           size: clientInfo.vehicleSize,
                         }}
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
                    <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-900 text-xs font-black uppercase tracking-widest gap-2 border border-emerald-200 shadow-sm">
                      <Star className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" />
                      Recommended for your vehicle
                    </div>
                    
                    <Card className="border-2 border-emerald-500 shadow-xl overflow-hidden rounded-3xl bg-white transition-all">
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
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
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
                          className="w-full mt-6 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest h-12 rounded-xl shadow-lg shadow-emerald-200 group"
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
                                  <span className="font-black text-gray-900">${s.basePrice}</span>
                                </div>
                              )
                           })}
                           {selectedAddons.map(id => {
                              const a = addons.find(x => x.id === id);
                              if (!a) return null;
                              return (
                                <div key={id} className="flex justify-between items-start text-sm">
                                  <span className="font-bold text-gray-600">+ {a.name}</span>
                                  <span className="font-black text-gray-600">${a.price}</span>
                                </div>
                              )
                           })}
                        </div>
                        <div className="pt-4 border-t border-gray-100 flex justify-between items-end">
                           <div>
                             <p className="text-[10px] uppercase font-black tracking-widest text-gray-500 mb-1">Estimated Total</p>
                             <p className="text-sm font-bold text-gray-600 flex items-center gap-1">
                               <Clock className="w-3 h-3" /> {totalDuration} mins
                             </p>
                           </div>
                           <div className="text-right">
                             {depositInfo.isRequired && (
                               <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">
                                 Deposit Required: {formatCurrency(depositInfo.amount)}
                               </p>
                             )}
                             <span className="text-3xl font-black text-primary">${totalPrice}</span>
                           </div>
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
