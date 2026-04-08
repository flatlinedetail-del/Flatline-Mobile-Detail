import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Search, Filter, MoreHorizontal, Phone, Mail, MapPin, Calendar, Clock, ArrowRight, Plus, Car, User, Loader2, Star, Truck, Repeat } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format, addHours } from "date-fns";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { validateCoupon, calculateDiscount, addLoyaltyPoints, redeemLoyaltyPoints } from "../services/promotions";
import { Checkbox } from "@/components/ui/checkbox";
import AddressInput from "../components/AddressInput";
import { StableInput } from "../components/StableInput";
import { calculateDistance, calculateTravelFee, estimateTravelTime } from "../services/travelService";
import { BusinessSettings } from "../types";

export default function Appointments() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [vehicleSize, setVehicleSize] = useState<"small" | "medium" | "large" | "extra_large">("medium");
  const [customerType, setCustomerType] = useState<"retail" | "vendor">("retail");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [redeemedPoints, setRedeemedPoints] = useState(0);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [appointmentAddress, setAppointmentAddress] = useState({ address: "", lat: 0, lng: 0 });
  const [travelFeeData, setTravelFeeData] = useState<any>(null);
  const [baseAmount, setBaseAmount] = useState<number>(0);
  const [isAddressManual, setIsAddressManual] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [recurringInterval, setRecurringInterval] = useState(1);
  const [recurringEndDate, setRecurringEndDate] = useState("");

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
    if (!selectedCustomerId || customerType !== "retail") {
      toast.error("Select a retail customer first");
      return;
    }
    const customer = customers.find(c => c.id === selectedCustomerId);
    if (!customer || customer.loyaltyPoints < 100) {
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

  useEffect(() => {
    const q = query(collection(db, "appointments"), orderBy("scheduledAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const appointmentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAppointments(appointmentsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching appointments:", error);
      toast.error("Failed to load appointments");
    });

    // Fetch customers for the dropdown
    getDocs(collection(db, "customers")).then(snapshot => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Fetch vendors
    getDocs(collection(db, "vendors")).then(snapshot => {
      setVendors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Fetch services
    getDocs(collection(db, "services")).then(snapshot => {
      setServices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((s: any) => s.isActive));
    });

    // Fetch addons
    getDocs(collection(db, "addons")).then(snapshot => {
      setAddons(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((a: any) => a.isActive));
    });

    // Fetch settings
    getDoc(doc(db, "settings", "business"))
      .then(snap => {
        if (snap.exists()) setSettings(snap.data() as BusinessSettings);
      })
      .catch(error => {
        console.error("Error fetching settings in Appointments:", error);
      });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (showAddDialog) {
      setIsAddressManual(false);
      setIsRecurring(false);
      setRecurringFrequency("weekly");
      setRecurringInterval(1);
      setRecurringEndDate("");
      setDiscount(0);
      setRedeemedPoints(0);
      setCouponCode("");
      setSelectedServiceIds([]);
      setSelectedAddonIds([]);
      setWaiverAccepted(false);
    }
  }, [showAddDialog]);

  useEffect(() => {
    if (selectedCustomerId) {
      const customer = customerType === "retail" 
        ? customers.find(c => c.id === selectedCustomerId)
        : vendors.find(v => v.id === selectedCustomerId);
      
      if (customer && customer.address) {
        if (isAddressManual && appointmentAddress.address && appointmentAddress.address !== customer.address) {
          toast("Update address to customer's saved address?", {
            action: {
              label: "Update",
              onClick: () => handleAddressSelect(customer.address, customer.latitude || 0, customer.longitude || 0, true)
            }
          });
        } else {
          handleAddressSelect(customer.address, customer.latitude || 0, customer.longitude || 0, true);
        }
      }
    }
  }, [selectedCustomerId, customerType]);

  useEffect(() => {
    let total = 0;
    selectedServiceIds.forEach(id => {
      const service = services.find(s => s.id === id);
      if (service) {
        total += service.pricingBySize?.[vehicleSize] || service.basePrice || 0;
      }
    });
    selectedAddonIds.forEach(id => {
      const addon = addons.find(a => a.id === id);
      if (addon) {
        total += addon.price || 0;
      }
    });
    setBaseAmount(total);
  }, [selectedServiceIds, selectedAddonIds, vehicleSize, services, addons]);

  const handleAddressSelect = (address: string, lat: number, lng: number, isAuto = false) => {
    setAppointmentAddress({ address, lat, lng });
    if (!isAuto) setIsAddressManual(true);
    
    if (settings && settings.baseLatitude && settings.baseLongitude) {
      const distance = calculateDistance(settings.baseLatitude, settings.baseLongitude, lat, lng);
      const feeData = calculateTravelFee(distance, settings.travelPricing);
      setTravelFeeData(feeData);
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsCreating(true);
    const formData = new FormData(e.currentTarget);
    
    const customerId = selectedCustomerId;
    const customer = customerType === "retail" 
      ? customers.find(c => c.id === customerId)
      : vendors.find(v => v.id === customerId);
    
    const totalAmount = Number(formData.get("totalAmount"));
    const travelFee = travelFeeData?.fee || 0;
    const finalAmount = totalAmount + travelFee - discount - redeemedPoints;
    
    const newJob = {
      customerId,
      customerName: customer?.name || "Retail Client",
      customerPhone: customer?.phone || "",
      customerEmail: customer?.email || "",
      customerType,
      vendorId: customerType === "vendor" ? customerId : null,
      vehicleInfo: formData.get("vehicleInfo"),
      vin: formData.get("vin"),
      roNumber: formData.get("roNumber"),
      address: appointmentAddress.address,
      latitude: appointmentAddress.lat,
      longitude: appointmentAddress.lng,
      scheduledAt: new Date(formData.get("scheduledAt") as string),
      status: "scheduled",
      baseAmount: totalAmount,
      travelFee: travelFee,
      travelFeeBreakdown: travelFeeData ? {
        miles: travelFeeData.miles,
        rate: travelFeeData.rate,
        adjustment: 0,
        isRoundTrip: travelFeeData.isRoundTrip
      } : null,
      discountAmount: discount + redeemedPoints,
      totalAmount: finalAmount,
      serviceIds: selectedServiceIds,
      serviceNames: services.filter(s => selectedServiceIds.includes(s.id)).map(s => s.name),
      addOnIds: selectedAddonIds,
      addOnNames: addons.filter(a => selectedAddonIds.includes(a.id)).map(a => a.name),
      technicianId: profile?.uid,
      technicianName: profile?.displayName,
      waiverAccepted,
      estimatedTravelTime: travelFeeData ? estimateTravelTime(travelFeeData.miles) : 0,
      estimatedTravelDistance: travelFeeData ? travelFeeData.miles : 0,
      recurringInfo: isRecurring ? {
        frequency: recurringFrequency,
        interval: recurringInterval,
        endDate: recurringEndDate ? new Date(recurringEndDate) : null,
        seriesId: Math.random().toString(36).substring(7)
      } : null,
      createdAt: serverTimestamp(),
    };

    try {
      const docRef = await addDoc(collection(db, "appointments"), newJob);
      toast.success("Appointment created!");
      setShowAddDialog(false);
      navigate(`/appointments/${docRef.id}`);
    } catch (error) {
      console.error("Error creating appointment:", error);
      toast.error("Failed to create appointment");
    } finally {
      setIsCreating(false);
    }
  };

  const filteredAppointments = appointments.filter(app => 
    (app.customerName?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (app.vehicleInfo?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (app.vin || "").includes(searchTerm) ||
    (app.roNumber || "").includes(searchTerm)
  );

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
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Appointments</h1>
          <p className="text-gray-500 font-medium">View and manage all detailing jobs.</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger render={
            <Button className="bg-primary hover:bg-red-700 shadow-md shadow-red-100 font-bold">
              <Plus className="w-4 h-4 mr-2" />
              New Appointment
            </Button>
          } />
          <DialogContent className="max-w-xl bg-white rounded-2xl border-none shadow-2xl p-0 overflow-hidden">
            <DialogHeader className="p-6 bg-gray-50/50 border-b border-gray-100">
              <DialogTitle className="text-xl font-bold text-gray-900">Schedule New Job</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAppointment} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Customer Type</Label>
                  <Select value={customerType} onValueChange={(v: any) => {
                    setCustomerType(v);
                    setSelectedCustomerId("");
                  }}>
                    <SelectTrigger className="bg-white border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="retail">Retail Client</SelectItem>
                      <SelectItem value="vendor">Vendor / Dealership</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="customerId">Select {customerType === "retail" ? "Customer" : "Vendor"}</Label>
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId} required>
                    <SelectTrigger className="bg-white border-gray-200">
                      <SelectValue placeholder={`Select a ${customerType}`}>
                        {selectedCustomerId && (
                          (customerType === "retail" ? customers : vendors).find(c => c.id === selectedCustomerId)?.name || "Unknown customer"
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {customerType === "retail" ? (
                        customers.map(c => {
                          const isDuplicate = customers.filter(other => other.name === c.name).length > 1;
                          return (
                            <SelectItem key={c.id} value={c.id}>
                              <div className="flex flex-col">
                                <span className="font-bold">{c.name}</span>
                                {isDuplicate && (
                                  <span className="text-[10px] text-gray-500">
                                    {c.phone || c.email || (c.address ? c.address.substring(0, 30) + "..." : "No secondary info")}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })
                      ) : (
                        vendors.map(v => {
                          const isDuplicate = vendors.filter(other => other.name === v.name).length > 1;
                          return (
                            <SelectItem key={v.id} value={v.id}>
                              <div className="flex flex-col">
                                <span className="font-bold">{v.name}</span>
                                {isDuplicate && (
                                  <span className="text-[10px] text-gray-500">
                                    {v.phone || v.email || (v.address ? v.address.substring(0, 30) + "..." : "No secondary info")}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vehicleInfo">Vehicle (Year Make Model)</Label>
                  <StableInput id="vehicleInfo" name="vehicleInfo" placeholder="e.g. 2024 Tesla Model 3" required className="bg-white border-gray-200" />
                </div>
                <div className="space-y-2">
                  <Label>Vehicle Size</Label>
                  <Select value={vehicleSize} onValueChange={(v: any) => setVehicleSize(v)}>
                    <SelectTrigger className="bg-white border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="small">Small (Coupe/Sedan)</SelectItem>
                      <SelectItem value="medium">Medium (SUV/Crossover)</SelectItem>
                      <SelectItem value="large">Large (Truck/Full SUV)</SelectItem>
                      <SelectItem value="extra_large">Extra Large (Van/Lifted)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vin">VIN (Optional)</Label>
                  <StableInput id="vin" name="vin" placeholder="17-character VIN" className="bg-white border-gray-200 uppercase font-mono" />
                </div>
                {customerType === "vendor" && (
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="roNumber">RO Number</Label>
                    <StableInput id="roNumber" name="roNumber" placeholder="Repair Order #" className="bg-white border-gray-200" />
                  </div>
                )}
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="address">Service Address</Label>
                  {(!settings?.baseAddress || !settings?.travelPricing?.pricePerMile) && (
                    <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl mb-2">
                      <p className="text-xs text-amber-800 font-bold flex items-center gap-2">
                        <Truck className="w-4 h-4" />
                        {!settings?.baseAddress 
                          ? "Travel pricing not configured. Please set a base address in Settings."
                          : "Travel rate is set to $0. Please check your Settings."}
                      </p>
                    </div>
                  )}
                  <AddressInput 
                    defaultValue={appointmentAddress.address}
                    onAddressSelect={handleAddressSelect}
                    placeholder="123 Main St, Austin, TX"
                  />
                  {appointmentAddress.address && appointmentAddress.lat === 0 && (
                    <p className="text-[10px] text-amber-600 font-bold mt-1 uppercase tracking-widest">
                      ⚠️ Manual entry detected. Travel fees cannot be calculated automatically.
                    </p>
                  )}
                  {travelFeeData && appointmentAddress.lat !== 0 && (
                    <div className="flex items-center gap-3 mt-2 p-4 bg-red-50 rounded-2xl border-2 border-red-100 shadow-sm animate-in fade-in slide-in-from-top-1">
                      <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shrink-0 shadow-md">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-primary uppercase tracking-widest">Travel Surcharge</p>
                          <p className="text-lg font-black text-primary">${travelFeeData.fee.toFixed(2)}</p>
                        </div>
                        <p className="text-[10px] text-red-700 font-bold uppercase tracking-tight">
                          {travelFeeData.miles} miles from base {travelFeeData.isRoundTrip ? " (Round Trip)" : ""}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scheduledAt">Date & Time</Label>
                  <Input 
                    id="scheduledAt" 
                    name="scheduledAt" 
                    type="datetime-local" 
                    required 
                    className="bg-white border-gray-200" 
                  />
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
                    className="bg-white border-gray-200" 
                    value={baseAmount?.toString() || ""}
                    onValueChange={(val) => setBaseAmount(parseFloat(val) || 0)}
                  />
                </div>

                <div className="col-span-2 p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Repeat className="w-4 h-4 text-primary" />
                      <Label className="text-sm font-bold">Recurring Appointment</Label>
                    </div>
                    <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
                  </div>

                  {isRecurring && (
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-2">
                        <Label className="text-xs">Frequency</Label>
                        <Select value={recurringFrequency} onValueChange={(v: any) => setRecurringFrequency(v)}>
                          <SelectTrigger className="h-8 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-white">
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Every (Interval)</Label>
                        <StableInput 
                          type="text" 
                          inputMode="numeric"
                          value={recurringInterval?.toString() || ""} 
                          onValueChange={(val) => setRecurringInterval(parseInt(val) || 1)}
                          className="h-8 bg-white"
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label className="text-xs">End Date (Optional)</Label>
                        <Input 
                          type="date" 
                          value={recurringEndDate} 
                          onChange={(e) => setRecurringEndDate(e.target.value)}
                          className="h-8 bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Services</Label>
                  <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 max-h-40 overflow-y-auto">
                    {services.map(service => (
                      <div key={service.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`service-${service.id}`}
                          checked={selectedServiceIds.includes(service.id)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedServiceIds(prev => [...prev, service.id]);
                            else setSelectedServiceIds(prev => prev.filter(id => id !== service.id));
                          }}
                        />
                        <Label htmlFor={`service-${service.id}`} className="text-xs cursor-pointer">
                          {service.name} (${service.pricingBySize?.[vehicleSize] || service.basePrice})
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Add-ons</Label>
                  <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 max-h-40 overflow-y-auto">
                    {addons.map(addon => (
                      <div key={addon.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`addon-${addon.id}`}
                          checked={selectedAddonIds.includes(addon.id)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedAddonIds(prev => [...prev, addon.id]);
                            else setSelectedAddonIds(prev => prev.filter(id => id !== addon.id));
                          }}
                        />
                        <Label htmlFor={`addon-${addon.id}`} className="text-xs cursor-pointer">
                          {addon.name} (${addon.price})
                        </Label>
                      </div>
                    ))}
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

                <div className="col-span-2 p-4 bg-gray-50 rounded-2xl space-y-3 border border-gray-100">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Price Summary</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Service Base</span>
                    <span className="font-bold">${baseAmount.toFixed(2)}</span>
                  </div>
                  {travelFeeData && appointmentAddress.lat !== 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Travel Fee ({travelFeeData.miles} mi)</span>
                      <span className="font-bold text-primary">+${travelFeeData.fee.toFixed(2)}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Discount</span>
                      <span className="font-bold text-green-600">-${discount.toFixed(2)}</span>
                    </div>
                  )}
                  {redeemedPoints > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Loyalty Points</span>
                      <span className="font-bold text-primary">-${redeemedPoints.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                    <span className="font-black text-gray-900 uppercase tracking-tighter">Final Total</span>
                    <span className="text-xl font-black text-gray-900">
                      ${(baseAmount + (appointmentAddress.lat !== 0 ? (travelFeeData?.fee || 0) : 0) - discount - redeemedPoints).toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2 col-span-2 py-2">
                  <Checkbox 
                    id="waiver" 
                    checked={waiverAccepted} 
                    onCheckedChange={(v: any) => setWaiverAccepted(v)} 
                  />
                  <Label htmlFor="waiver" className="text-xs font-medium text-gray-500">
                    I accept the service waiver and damage liability terms.
                  </Label>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" type="button" onClick={() => setShowAddDialog(false)} className="font-bold">Cancel</Button>
                <Button type="submit" className="bg-primary hover:bg-red-700 font-bold" disabled={isCreating}>
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Schedule Job
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="border-b border-gray-50 bg-gray-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Search by name, VIN, RO..." 
                className="pl-10 bg-white border-gray-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="border-gray-200">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead className="w-[250px]">Customer / Vehicle</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vendor Info</TableHead>
                <TableHead>Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-gray-500">Loading appointments...</TableCell>
                </TableRow>
              ) : filteredAppointments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-gray-500">No appointments found.</TableCell>
                </TableRow>
              ) : (
                filteredAppointments.map((app) => (
                  <TableRow 
                    key={app.id} 
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/appointments/${app.id}`)}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900">{app.customerName || "Retail Client"}</span>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                          <Car className="w-3 h-3" />
                          {app.vehicleInfo || "Vehicle N/A"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                          <Calendar className="w-3 h-3 text-gray-400" />
                          {app.scheduledAt?.toDate ? format(app.scheduledAt.toDate(), "MMM d, yyyy") : "TBD"}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          {app.scheduledAt?.toDate ? format(app.scheduledAt.toDate(), "h:mm a") : ""}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px] font-bold uppercase tracking-wider", statusColors[app.status] || "bg-gray-100 text-gray-700")}>
                        {app.status?.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {app.vendorId ? (
                        <div className="flex flex-col gap-1">
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">VIN / RO</div>
                          <div className="text-xs font-mono text-gray-600">{app.vin || "---"}</div>
                          <div className="text-xs font-mono text-gray-600">{app.roNumber || "---"}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Retail</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-gray-900">${app.totalAmount || 0}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-primary">
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
