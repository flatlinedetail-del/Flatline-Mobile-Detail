import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collection, query, getDocs, doc, addDoc, serverTimestamp, orderBy, limit, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { toast } from "sonner";
import { 
  Building2, CalendarIcon, Car, Clock, CreditCard, DollarSign, 
  MapPin, Plus, Search, Check, ChevronLeft, Trash2,
  AlertTriangle, Globe, Sparkles, Loader2, Star, RefreshCw
} from "lucide-react";
import { format, addHours } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn, getClientDisplayName } from "@/lib/utils";

import { SearchableSelector } from "../components/SearchableSelector";
import VehicleSelector from "../components/VehicleSelector";
import AddressInput from "../components/AddressInput";
import { StableInput } from "../components/StableInput";
import { generateSmartRecommendations, SmartRecommendation } from "../services/smartBookingService";
import { getGeocode, getLatLng } from "use-places-autocomplete";

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
  
  const [selectedServices, setSelectedServices] = useState<{ id: string; qty: number; vehicleId?: string; tempVehicleSize?: string }[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<{ id: string; qty: number }[]>([]);
  
  const [serviceSearch, setServiceSearch] = useState("");
  const [addonSearch, setAddonSearch] = useState("");

  const [scheduledAtValue, setScheduledAtValue] = useState("");
  const [appointmentAddress, setAppointmentAddress] = useState({ 
    address: "", lat: 0, lng: 0, city: "", state: "", zipCode: "", placeId: ""
  });
  const [notes, setNotes] = useState("");
  const [lead, setLead] = useState<any>(null);
  
  const [baseAmount, setBaseAmount] = useState(0);

  // Smart Booking 2.0 State
  const [smartRecommendations, setSmartRecommendations] = useState<SmartRecommendation[]>([]);
  const [isGeneratingSmartSlots, setIsGeneratingSmartSlots] = useState(false);
  const [smartBookingError, setSmartBookingError] = useState("");

  const handleGenerateSmartSlots = async () => {
    if (selectedServices.length === 0 || !appointmentAddress.lat || !scheduledAtValue) return;
    
    setIsGeneratingSmartSlots(true);
    setSmartBookingError("");
    setSmartRecommendations([]);

    try {
      const baseDate = new Date(scheduledAtValue.split("T")[0] + "T12:00:00");
      const rainThreshold = settings?.weatherAutomation?.rainProbabilityThreshold || 40;
      const duration = selectedServices.reduce((acc, s) => {
        const srv = services.find(x => x.id === s.id);
        return acc + (srv?.estimatedDuration || 120) * s.qty;
      }, 0);

      const result = await generateSmartRecommendations({
        baseDate,
        addressLat: appointmentAddress.lat,
        addressLng: appointmentAddress.lng,
        durationMinutes: duration > 0 ? duration : 120,
        rainThreshold
      });

      if (result.length === 0) {
        setSmartBookingError("No available time slots found for this date. Please try another day.");
      } else {
        setSmartRecommendations(result);
        toast.success("Recommendations Updated");
      }
    } catch (err: any) {
      setSmartBookingError(err.message || "Failed to generate slots.");
      toast.error(err.message || "Failed to generate slots");
    } finally {
      setIsGeneratingSmartSlots(false);
    }
  };

  // Auto-trigger for Smart Booking slots
  useEffect(() => {
    const targetDateStr = scheduledAtValue ? scheduledAtValue.split("T")[0] : "";
    if (selectedServices.length === 0 || !appointmentAddress.lat || !targetDateStr) {
      if (smartRecommendations.length > 0 || smartBookingError || isGeneratingSmartSlots) {
        setSmartRecommendations([]);
        setSmartBookingError("");
      }
      return; 
    }

    const timer = setTimeout(() => {
      handleGenerateSmartSlots();
    }, 800);

    return () => clearTimeout(timer);
  }, [
    selectedServices.length,
    selectedServices.map(s => `${s.id}-${s.qty}`).join(','),
    appointmentAddress.lat,
    appointmentAddress.lng,
    scheduledAtValue ? scheduledAtValue.split("T")[0] : "",
    settings?.weatherAutomation?.rainProbabilityThreshold
  ]);


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
        
        const [servicesSnap, addonsSnap, settingsSnap] = await Promise.all([
          getDocs(collection(db, "services")),
          getDocs(collection(db, "addons")),
          getDocs(collection(db, "settings"))
        ]);
        
        setServices(servicesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setAddons(addonsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        
        let fetchedSettings: any = null;
        settingsSnap.docs.forEach((doc) => {
          if (doc.id === "global" || doc.id === "business_info") {
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
        handleAddressSelect(client.address || "", 0, 0);
      }
      
      const fetchVehicles = async () => {
        const q = query(collection(db, "vehicles"), where("clientId", "==", selectedCustomerId));
        const snap = await getDocs(q);
        const v = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAvailableVehicles(v);
        // Do not auto select, to let user independently choose
      };
      
      fetchVehicles();
    } else {
      setAvailableVehicles([]);
      setSelectedVehicleIds([]);
    }
  }, [selectedCustomerId, clients]);

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

      const finalAmount = baseAmount;
      
      const serviceSelections = selectedServices.map(s => {
        const service = services.find(srv => srv.id === s.id);
        return {
          id: s.id,
          vehicleId: s.vehicleId,
          qty: s.qty,
          price: (service?.basePrice || 0) // Simplify for db record
        };
      });
      
      const appointmentData = {
        clientId: selectedCustomerId,
        customerId: selectedCustomerId,
        customerName: getClientDisplayName(client),
        customerPhone: client?.phone || "",
        customerEmail: client?.email || "",
        customerType: "client",
        vehicleIds: selectedVehicleIds,
        vehicleId: selectedVehicleIds[0] || null,
        vehicleInfo: selectedVehicleIds.map(id => {
          const v = availableVehicles.find(av => av.id === id);
          return v ? `${v.year} ${v.make} ${v.model}` : "";
        }).join(", ") || "",
        address: appointmentAddress.address,
        city: appointmentAddress.city,
        state: appointmentAddress.state,
        zipCode: appointmentAddress.zipCode,
        latitude: appointmentAddress.lat,
        longitude: appointmentAddress.lng,
        scheduledAt: startAt,
        status: "scheduled",
        jobNum: finalJobNum,
        baseAmount: baseAmount,
        totalAmount: finalAmount,
        serviceIds: [...new Set(selectedServices.map(s => s.id))],
        serviceNames: [...new Set(selectedServices.map(s => services.find(srv => srv.id === s.id)?.name).filter(Boolean))],
        serviceSelections,
        addOnIds: selectedAddons.map(a => a.id),
        addOnNames: selectedAddons.map(a => addons.find(ad => ad.id === a.id)?.name).filter(Boolean),
        addOnSelections: selectedAddons,
        technicianId: profile?.uid || "",
        technicianName: profile?.displayName || "",
        estimatedDuration: totalDuration,
        totalDurationMinutes: totalDuration,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        notes,
        leadId: prefillLeadId || null
      };

      await addDoc(collection(db, "appointments"), appointmentData);
      toast.success("Appointment successfully created!");
      navigate("/calendar");
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
              <div className="space-y-2">
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

              <div className="space-y-2">
                <Label className="font-black uppercase tracking-widest text-[10px] text-white/90">Service Address</Label>
                <AddressInput 
                  defaultValue={appointmentAddress.address}
                  onAddressSelect={handleAddressSelect}
                  placeholder="Start typing to search..."
                />
              </div>
            </div>

            {/* 2. VEHICLES SECTION */}
            {selectedCustomerId && (
              <div className="space-y-4">
                <h2 className="text-sm font-black uppercase text-primary tracking-widest border-b border-white/10 pb-2">Asset Selection (Vehicles)</h2>
                {availableVehicles.length > 0 && (
                  <div className="space-y-2 p-4 bg-black/50 border border-white/10 rounded-xl">
                    <Label className="text-white/60 font-bold mb-2 block">Available Client Assets</Label>
                    <div className="flex flex-wrap gap-3">
                      {availableVehicles.filter(v => v.id && !v.id.startsWith("temp-")).map(v => (
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
                          <Label htmlFor={`v-${v.id}`} className="cursor-pointer font-bold text-white">
                            {v.year} {v.make} {v.model}
                          </Label>
                        </div>
                      ))}
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
                              <Button variant="ghost" size="sm" className="text-red-400 hover:bg-white/10" onClick={() => {
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
                <h2 className="text-sm font-black uppercase text-primary tracking-widest border-b border-white/10 pb-2">Service Protocols</h2>
                
                {selectedVehicleIds.map(vId => {
                  const v = availableVehicles.find(av => av.id === vId);
                  if (!v) return null;
                  
                  return (
                    <div key={vId} className="space-y-3 p-5 border border-white/10 rounded-xl bg-black/30">
                      <h3 className="text-white font-black uppercase tracking-widest text-xs flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2"><Car size={14} className="text-primary"/> {v.year} {v.make} {v.model}</span>
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
                      
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <Input 
                          placeholder="Search protocols..." 
                          value={serviceSearch}
                          onChange={(e) => setServiceSearch(e.target.value)}
                          className="pl-9 bg-white/5 border-white/10 text-white font-medium"
                        />
                      </div>
                      
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
            )}
            
            {/* ADDONS */}
            {selectedVehicleIds.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-sm font-black uppercase text-primary tracking-widest border-b border-white/10 pb-2">Enhancements</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto custom-scrollbar p-2">
                  {addons.map(addon => {
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
                    {!isGeneratingSmartSlots && smartRecommendations.length > 0 && (
                      <>
                        <Button 
                          type="button" 
                          onClick={() => {
                            const best = smartRecommendations[0];
                            if (best) {
                              const formatted = format(best.startTime, "yyyy-MM-dd'T'HH:mm");
                              setScheduledAtValue(formatted);
                              toast.success("Applied best slot!");
                            }
                          }}
                          className="bg-primary text-white hover:bg-primary/90 h-8 text-xs font-bold"
                        >
                          Use Best Slot
                        </Button>
                        <Button 
                          type="button" 
                          onClick={handleGenerateSmartSlots}
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
                  {!scheduledAtValue || selectedServices.length === 0 || !appointmentAddress.lat ? (
                    <div className="flex items-center gap-2 text-white/40 bg-white/5 p-3 rounded-lg border border-white/10">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <p className="text-xs font-bold">Select services, address, and base date to unlock Smart Booking.</p>
                    </div>
                  ) : smartBookingError ? (
                    <div className="flex items-center gap-2 text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <p className="text-xs font-bold">{smartBookingError}</p>
                    </div>
                  ) : isGeneratingSmartSlots ? (
                    <div className="flex flex-col items-center justify-center p-6 space-y-3">
                      <Loader2 className="w-6 h-6 text-primary animate-spin" />
                      <p className="text-xs text-white/50 font-bold tracking-widest uppercase animate-pulse">Running AI Optimization...</p>
                    </div>
                  ) : smartRecommendations.length > 0 ? (
                    <div className="space-y-3">
                      {smartRecommendations.map((rec) => (
                        <div 
                          key={rec.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {rec.rank === "Best" && <Badge className="bg-green-500 text-white font-black text-[9px] uppercase hover:bg-green-600">Best</Badge>}
                              {rec.rank === "Good" && <Badge className="bg-blue-500 text-white font-black text-[9px] uppercase hover:bg-blue-600">Good</Badge>}
                              {rec.rank === "Avoid" && <Badge className="bg-red-500 text-white font-black text-[9px] uppercase hover:bg-red-600">Avoid</Badge>}
                              <span className="font-bold text-white text-sm">
                                {format(rec.startTime, "h:mm a")} - {format(rec.endTime, "h:mm a")}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              {rec.reasons.map((r, idx) => (
                                <p key={idx} className="text-[10px] text-white/60 font-medium flex items-center gap-1.5">
                                  <Check className="w-3 h-3 text-white/20" /> {r}
                                </p>
                              ))}
                            </div>
                          </div>
                          <Button 
                            type="button"
                            size="sm"
                            onClick={() => {
                              // yyyy-MM-ddThh:mm format required for datetime-local
                              const formatted = format(rec.startTime, "yyyy-MM-dd'T'HH:mm");
                              setScheduledAtValue(formatted);
                            }}
                            className={cn(
                              "text-xs font-bold shrink-0",
                              rec.rank === "Best" 
                                ? "bg-primary text-white hover:bg-primary/90" 
                                : "bg-white/10 text-white hover:bg-white/20"
                            )}
                          >
                            {rec.rank === "Best" ? "Use Best Slot" : "Select Slot"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-6 space-y-3">
                      <AlertTriangle className="w-6 h-6 text-yellow-500" />
                      <p className="text-xs text-white/50 font-medium">No valid slots found for this date layout.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Date & Time *</Label>
                  <Input 
                    type="datetime-local"
                    required
                    value={scheduledAtValue}
                    onChange={(e) => setScheduledAtValue(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-xl px-4 py-6 text-white font-bold focus:ring-2 focus:ring-primary/50"
                  />
                  <p className="text-[10px] text-white/40 font-medium">Any base date here unlocks the Smart Booking engine above.</p>
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Manual Price Override (Optional)</Label>
                  <StableInput 
                    inputMode="decimal"
                    placeholder="E.g. 250"
                    value={baseAmount.toString()}
                    onValueChange={(val) => setBaseAmount(parseFloat(val) || 0)}
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
            <div className="bg-black/40 border border-white/10 rounded-2xl p-6">
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
                            <span>${(price * selection.qty).toFixed(2)}</span>
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
                      <span>${((addon?.price || 0) * selection.qty).toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 pt-2 text-sm font-bold text-white/80">
                <div className="flex justify-between items-center text-white pt-3 border-t border-white/10">
                  <span className="font-black uppercase tracking-widest">Final Total</span>
                  <span className="text-2xl font-black">${baseAmount.toFixed(2)}</span>
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
              className="px-8 h-12 bg-primary hover:bg-red-700 text-white font-black uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-105 disabled:opacity-50"
            >
              {saving ? "Deploying..." : "Confirm Booking"}
            </Button>
          </div>
        </form>

      </div>
    </div>
  );
}
