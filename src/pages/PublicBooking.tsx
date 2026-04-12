import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Star, Clock, MapPin, Calendar, CheckCircle2, Loader2, ArrowRight, Truck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import AddressInput from "../components/AddressInput";
import { getRecommendedSlots, RecommendedSlot } from "../services/schedulingService";
import { BusinessSettings, Service, AddOn, Appointment } from "../types";
import { cn } from "@/lib/utils";

export default function PublicBooking() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [addons, setAddons] = useState<AddOn[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  
  const [clientInfo, setClientInfo] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    lat: 0,
    lng: 0,
    vehicleInfo: ""
  });
  
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [recommendations, setRecommendations] = useState<RecommendedSlot[]>([]);
  const [bookingStatus, setBookingStatus] = useState<"idle" | "success">("idle");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const settingsSnap = await getDoc(doc(db, "settings", "business"));
        if (settingsSnap.exists()) setSettings(settingsSnap.data() as BusinessSettings);

        const servicesSnap = await getDocs(query(collection(db, "services")));
        setServices(servicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Service)).filter(s => s.isActive));

        const addonsSnap = await getDocs(query(collection(db, "addons")));
        setAddons(addonsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AddOn)).filter(a => a.isActive));

        const appointmentsSnap = await getDocs(query(collection(db, "appointments")));
        setAppointments(appointmentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment)));
      } catch (error) {
        console.error("Error fetching data for booking:", error);
        toast.error("Failed to load booking information.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (clientInfo.lat && settings && (selectedServices.length > 0 || selectedAddons.length > 0)) {
      const totalDuration = selectedServices.reduce((acc, id) => {
        const s = services.find(srv => srv.id === id);
        return acc + (s?.estimatedDuration || 0) + (s?.bufferTimeMinutes || 0);
      }, 0) + selectedAddons.reduce((acc, id) => {
        const a = addons.find(ad => ad.id === id);
        return acc + (a?.estimatedDuration || 0) + (a?.bufferTimeMinutes || 0);
      }, 0);

      const slots = getRecommendedSlots(
        clientInfo.lat,
        clientInfo.lng,
        totalDuration,
        appointments,
        settings
      );
      setRecommendations(slots);
    }
  }, [clientInfo.lat, selectedServices, selectedAddons, appointments, settings]);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledAt) {
      toast.error("Please select a date and time");
      return;
    }

    setIsSubmitting(true);
    try {
      const isRecommendation = recommendations.some(r => format(r.start, "yyyy-MM-dd'T'HH:mm") === scheduledAt);
      
      const appointmentData: any = {
        customerName: clientInfo.name,
        customerEmail: clientInfo.email,
        customerPhone: clientInfo.phone,
        address: clientInfo.address,
        latitude: clientInfo.lat,
        longitude: clientInfo.lng,
        vehicleInfo: clientInfo.vehicleInfo,
        serviceIds: selectedServices,
        serviceNames: services.filter(s => selectedServices.includes(s.id)).map(s => s.name),
        addOnIds: selectedAddons,
        addOnNames: addons.filter(a => selectedAddons.includes(a.id)).map(a => a.name),
        scheduledAt: new Date(scheduledAt),
        status: isRecommendation ? "pending_approval" : "requested",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        customerType: "retail",
        totalAmount: 0, // Admin will finalize
        paymentStatus: "unpaid",
        technicianId: "",
        technicianName: "TBD",
        waiverAccepted: false,
        photos: { before: [], after: [], damage: [] },
        completedTasks: {}
      };

      await addDoc(collection(db, "appointments"), appointmentData);
      setBookingStatus("success");
      toast.success(isRecommendation ? "Booking request submitted!" : "Special time request submitted for approval.");
    } catch (error) {
      console.error("Booking error:", error);
      toast.error("Failed to submit booking request.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
              Thank you, {clientInfo.name.split(' ')[0]}! Your booking request has been submitted. 
              We will review it and contact you shortly to confirm.
            </p>
            <Button onClick={() => window.location.reload()} className="w-full bg-primary font-bold">
              Book Another Appointment
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase">Book Your Service</h1>
          <p className="text-gray-500 font-medium">Professional mobile detailing at your doorstep.</p>
        </div>

        <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
          <CardHeader className="bg-gray-50/50 border-b border-gray-100 p-8">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-black uppercase tracking-tight">
                Step {step} of 3
              </CardTitle>
              <div className="flex gap-1">
                {[1, 2, 3].map(i => (
                  <div key={i} className={cn("h-1.5 w-8 rounded-full transition-all", step >= i ? "bg-primary" : "bg-gray-200")} />
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            <form onSubmit={handleBooking} className="space-y-8">
              {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <div className="space-y-4">
                    <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Your Information</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Full Name</Label>
                        <Input 
                          placeholder="John Doe" 
                          value={clientInfo.name}
                          onChange={e => setClientInfo(prev => ({ ...prev, name: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email Address</Label>
                        <Input 
                          type="email" 
                          placeholder="john@example.com" 
                          value={clientInfo.email}
                          onChange={e => setClientInfo(prev => ({ ...prev, email: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone Number</Label>
                        <Input 
                          type="tel" 
                          placeholder="(555) 000-0000" 
                          value={clientInfo.phone}
                          onChange={e => setClientInfo(prev => ({ ...prev, phone: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Vehicle (Year Make Model)</Label>
                        <Input 
                          placeholder="e.g. 2024 Tesla Model 3" 
                          value={clientInfo.vehicleInfo}
                          onChange={e => setClientInfo(prev => ({ ...prev, vehicleInfo: e.target.value }))}
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Service Address</Label>
                    <AddressInput 
                      onAddressSelect={(addr, lat, lng) => setClientInfo(prev => ({ ...prev, address: addr, lat, lng }))}
                      placeholder="Enter your location for mobile service"
                    />
                  </div>
                  <Button 
                    type="button" 
                    className="w-full bg-primary font-bold h-12 text-lg"
                    disabled={!clientInfo.name || !clientInfo.email || !clientInfo.phone || !clientInfo.address}
                    onClick={() => setStep(2)}
                  >
                    Next: Choose Services <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <div className="space-y-4">
                    <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Select Services</Label>
                    <div className="grid grid-cols-1 gap-3">
                      {services.map(service => (
                        <div 
                          key={service.id}
                          className={cn(
                            "p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between",
                            selectedServices.includes(service.id) ? "border-primary bg-red-50" : "border-gray-100 hover:border-gray-200"
                          )}
                          onClick={() => {
                            setSelectedServices(prev => 
                              prev.includes(service.id) ? prev.filter(id => id !== service.id) : [...prev, service.id]
                            );
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox checked={selectedServices.includes(service.id)} />
                            <div>
                              <p className="font-bold text-gray-900">{service.name}</p>
                              <p className="text-xs text-gray-500">{service.estimatedDuration} mins</p>
                            </div>
                          </div>
                          <p className="font-black text-primary">${service.basePrice}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {addons.length > 0 && (
                    <div className="space-y-4">
                      <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Add-ons</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {addons.map(addon => (
                          <div 
                            key={addon.id}
                            className={cn(
                              "p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between",
                              selectedAddons.includes(addon.id) ? "border-primary bg-red-50" : "border-gray-100 hover:border-gray-200"
                            )}
                            onClick={() => {
                              setSelectedAddons(prev => 
                                prev.includes(addon.id) ? prev.filter(id => id !== addon.id) : [...prev, addon.id]
                              );
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox checked={selectedAddons.includes(addon.id)} />
                              <p className="text-sm font-bold text-gray-900">{addon.name}</p>
                            </div>
                            <p className="text-sm font-black text-primary">${addon.price}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button type="button" variant="outline" className="flex-1 font-bold h-12" onClick={() => setStep(1)}>Back</Button>
                    <Button 
                      type="button" 
                      className="flex-[2] bg-primary font-bold h-12 text-lg"
                      disabled={selectedServices.length === 0}
                      onClick={() => setStep(3)}
                    >
                      Next: Pick a Time <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                        <Star className="w-3 h-3 fill-primary" /> Recommended Slots
                      </Label>
                      <Badge className="bg-green-100 text-green-700 border-none">Fastest Route</Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3">
                      {recommendations.map((slot, idx) => (
                        <div 
                          key={idx}
                          className={cn(
                            "p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between group",
                            scheduledAt === format(slot.start, "yyyy-MM-dd'T'HH:mm") 
                              ? "border-primary bg-red-50 shadow-md" 
                              : "border-gray-100 hover:border-gray-200 bg-white"
                          )}
                          onClick={() => setScheduledAt(format(slot.start, "yyyy-MM-dd'T'HH:mm"))}
                        >
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-[10px] shadow-sm",
                              slot.recommendationLevel === "best" ? "bg-green-500 text-white" : "bg-blue-500 text-white"
                            )}>
                              {slot.recommendationLevel === "best" ? "BEST" : "GOOD"}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">{format(slot.start, "EEEE, MMM d")}</p>
                              <p className="text-lg font-black text-primary tracking-tighter">{format(slot.start, "h:mm a")}</p>
                              <p className="text-[10px] text-gray-500 font-medium">{slot.explanation}</p>
                            </div>
                          </div>
                          <div className={cn(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                            scheduledAt === format(slot.start, "yyyy-MM-dd'T'HH:mm") ? "border-primary bg-primary" : "border-gray-200"
                          )}>
                            {scheduledAt === format(slot.start, "yyyy-MM-dd'T'HH:mm") && <CheckCircle2 className="w-4 h-4 text-white" />}
                          </div>
                        </div>
                      ))}

                      {recommendations.length === 0 && (
                        <div className="p-8 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                          <p className="text-sm text-gray-500 italic">No automatic recommendations available. Please request a custom time below.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-gray-100">
                    <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Or Request a Specific Time</Label>
                    <div className="space-y-2">
                      <Input 
                        type="datetime-local" 
                        value={scheduledAt}
                        onChange={e => setScheduledAt(e.target.value)}
                        className="h-12 bg-white border-2 border-gray-100 rounded-xl focus:border-primary transition-all"
                      />
                      <p className="text-[10px] text-gray-400 font-medium italic">
                        * Custom time requests require manual approval from our team.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button type="button" variant="outline" className="flex-1 font-bold h-12" onClick={() => setStep(2)}>Back</Button>
                    <Button 
                      type="submit" 
                      className="flex-[2] bg-primary hover:bg-red-700 font-bold h-12 text-lg shadow-lg shadow-red-100"
                      disabled={isSubmitting || !scheduledAt}
                    >
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                      Request Booking
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-8 text-gray-400">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Mobile Service</span>
          </div>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Top Rated</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Fully Insured</span>
          </div>
        </div>
      </div>
    </div>
  );
}
