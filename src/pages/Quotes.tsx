import { useState, useEffect, useMemo } from "react";
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, deleteDoc, doc, updateDoc, getDocs, getDoc, limit, where } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { PageHeader } from "../components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Plus, Search, Filter, FileText, Trash2, Car, User as UserIcon, Settings2, Eye, Mail, DollarSign, Sparkles, Zap, TrendingUp, History, ShieldCheck, AlertCircle, ArrowRight, CheckCircle2, Calendar } from "lucide-react";
import { toast } from "sonner";
import AddressInput from "../components/AddressInput";
import VehicleSelector from "../components/VehicleSelector";
import { format } from "date-fns";
import { cn, cleanAddress } from "@/lib/utils";
import { useNavigate, useLocation } from "react-router-dom";
import { Quote, Client, Vehicle, Service, BusinessSettings, Invoice, Appointment } from "../types";
import { DocumentPreview } from "../components/DocumentPreview";
import { Checkbox } from "../components/ui/checkbox";
import { Slider } from "../components/ui/slider";
import { Textarea } from "../components/ui/textarea";

import { SearchableSelector } from "../components/SearchableSelector";

import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
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

interface SmartQuoteProps {
  clients: Client[];
  allVehicles: Vehicle[];
  services: Service[];
  addOns: any[];
  invoices: Invoice[];
  appointments: Appointment[];
  onApply: (data: {
    clientId: string;
    clientInfo: any;
    manualVehicles: { year: string; make: string; model: string; size: string }[];
    lineItems: { serviceName: string; price: number }[];
    notes: string;
    description: string;
    businessName: string;
  }) => void;
}

function SmartQuote({ clients, allVehicles, services, addOns, invoices, appointments, onApply }: SmartQuoteProps) {
  // Client Info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [businessName, setBusinessName] = useState("");

  // Vehicle Info
  const [manualVehicles, setManualVehicles] = useState<{ year: string; make: string; model: string; size: string }[]>([]);
  const [currentVehicle, setCurrentVehicle] = useState({ year: "", make: "", model: "", size: "medium" });

  // Service Selection
  const [selectedServiceSelections, setSelectedServiceSelections] = useState<{ serviceId: string, vehicleId?: string, vehicleName?: string }[]>([]);
  const [selectedAddOnSelections, setSelectedAddOnSelections] = useState<{ addOnId: string, vehicleId?: string, vehicleName?: string }[]>([]);
  
  // Market Analysis Inputs
  const [severity, setSeverity] = useState(3);
  const [intensity, setIntensity] = useState(3);
  const [complexity, setComplexity] = useState(3);
  const [jobDescription, setJobDescription] = useState("");

  // Pricing State
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [isPriceCustomized, setIsPriceCustomized] = useState(false);
  const [selectedTier, setSelectedTier] = useState<"low" | "safe" | "premium" | "recommended">("recommended");
  const [quoteType, setQuoteType] = useState<"retail" | "insurance">("retail");

  const formatPhoneNumber = (value: string) => {
    if (!value) return value;
    const phoneNumber = value.replace(/[^\d]/g, '');
    const phoneNumberLength = phoneNumber.length;
    if (phoneNumberLength < 4) return phoneNumber;
    if (phoneNumberLength < 7) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    }
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhoneNumber(e.target.value));
  };

  const selectedServices = selectedServiceSelections.map(sel => {
    const s = services.find(serv => serv.id === sel.serviceId);
    return { ...s, ...sel };
  }).filter(s => !!s.serviceId);
  
  const selectedAddOns = selectedAddOnSelections.map(sel => {
    const a = addOns.find(add => add.id === sel.addOnId);
    return { ...a, ...sel };
  }).filter(a => !!a.addOnId);

  const recommendations = useMemo(() => {
    if (manualVehicles.length === 0 || (selectedServiceSelections.length === 0 && selectedAddOnSelections.length === 0)) return null;

    // Keyword-based pricing adjustment from jobDescription
    let descriptionAdjustment = 1.0;
    const desc = jobDescription.toLowerCase();
    const isBiohazard = desc.includes("vomit") || desc.includes("biohazard") || desc.includes("blood") || desc.includes("urine") || desc.includes("feces");

    // Market-Based Pricing Logic
    let baseMarketHourlyRate = quoteType === "insurance" ? 145 : 95; // Premium market average vs Insurance rate
    if (isBiohazard) {
      baseMarketHourlyRate = 250; // Biohazard market rate
    }

    const sizeMultipliers: Record<string, number> = {
      small: 0.85,
      medium: 1.0,
      large: 1.25,
      extra_large: 1.6
    };

    // Multipliers based on 1-5 scale (3 is neutral)
    const effectiveSeverity = quoteType === "insurance" ? Math.max(severity, 4) : severity;
    const effectiveIntensity = quoteType === "insurance" ? Math.max(intensity, 4) : intensity;
    const effectiveComplexity = quoteType === "insurance" ? Math.max(complexity, 4) : complexity;

    if (desc.includes("mold") || desc.includes("mildew")) descriptionAdjustment += 0.45;
    if (desc.includes("smoke") || desc.includes("nicotine")) descriptionAdjustment += 0.35;
    if (isBiohazard) descriptionAdjustment += 0.6;
    if (desc.includes("pet hair") || desc.includes("dog hair") || desc.includes("shedding")) descriptionAdjustment += 0.2;
    if (desc.includes("stain") || desc.includes("spill") || desc.includes("spot")) descriptionAdjustment += 0.15;
    if (desc.includes("heavy") || desc.includes("extreme") || desc.includes("trashed")) descriptionAdjustment += 0.25;
    if (desc.includes("clay") || desc.includes("iron") || desc.includes("fallout")) descriptionAdjustment += 0.1;
    if (desc.includes("scratch") || desc.includes("swirl") || desc.includes("paint correction")) descriptionAdjustment += 0.3;

    const severityMult = (1 + (effectiveSeverity - 3) * 0.25) * descriptionAdjustment;
    const intensityMult = 1 + (effectiveIntensity - 3) * 0.15;
    const complexityMult = 1 + (effectiveComplexity - 3) * 0.2;

    let totalMarketPrice = 0;
    const items: { name: string; price: number; type: string }[] = [];

    manualVehicles.forEach(vehicle => {
      const vehicleId = `${vehicle.year}-${vehicle.make}-${vehicle.model}`;
      const vehicleMult = sizeMultipliers[vehicle.size] || 1.0;
      
      const vehicleServices = selectedServices.filter(s => s.vehicleId === vehicleId);
      
      vehicleServices.forEach(service => {
        // Estimate hours based on service data or default
        const estimatedHours = (service.estimatedDuration || 120) / 60;
        
        const serviceMarketPrice = baseMarketHourlyRate * estimatedHours * vehicleMult * severityMult * intensityMult * complexityMult;
        
        totalMarketPrice += serviceMarketPrice;
        items.push({ 
          name: `${service.name} (${vehicle.year} ${vehicle.make})`, 
          price: serviceMarketPrice,
          type: "service"
        });
      });

      const vehicleAddOns = selectedAddOns.filter(a => a.vehicleId === vehicleId);
      vehicleAddOns.forEach(addOn => {
        totalMarketPrice += addOn.price;
        items.push({ 
          name: `${addOn.name} (${vehicle.year} ${vehicle.make})`, 
          price: addOn.price, 
          type: "addon" 
        });
      });
    });

    // Handle items without specific vehicle assignment
    selectedServices.filter(s => !s.vehicleId).forEach(service => {
        const estimatedHours = (service.estimatedDuration || 120) / 60;
        const serviceMarketPrice = baseMarketHourlyRate * estimatedHours * severityMult * intensityMult * complexityMult;
        totalMarketPrice += serviceMarketPrice;
        items.push({ name: service.name, price: serviceMarketPrice, type: "service" });
    });

    selectedAddOns.filter(a => !a.vehicleId).forEach(addOn => {
        totalMarketPrice += addOn.price;
        items.push({ name: addOn.name, price: addOn.price, type: "addon" });
    });

    // Price Tiers
    const lowPrice = quoteType === "insurance" ? totalMarketPrice * 0.95 : totalMarketPrice * 0.85;
    const safePrice = totalMarketPrice;
    const premiumPrice = quoteType === "insurance" ? totalMarketPrice * 1.5 : totalMarketPrice * 1.3;
    const recommendedPrice = quoteType === "insurance" ? totalMarketPrice * 1.25 : totalMarketPrice * 1.15;

    // Explanation Generation
    let explanation = "";
    if (isBiohazard) {
      explanation = `This estimate is based on specialized biohazard remediation market rates at $${baseMarketHourlyRate}/hr. `;
      explanation += "Biohazard cleanup requires specialized PPE, EPA-registered disinfectants, proper disposal protocols, and intensive labor to ensure complete decontamination and safety. ";
      if (manualVehicles.length > 1) explanation += `Calculated across ${manualVehicles.length} assets. `;
      explanation += "Pricing reflects the high risk, specialized training, and liability associated with hazardous material remediation.";
    } else if (quoteType === "retail") {
      explanation = `This estimate is based on a competitive market rate of $${baseMarketHourlyRate}/hr. `;
      if (severity > 3) explanation += "High job severity requires specialized chemicals and extra labor to ensure a perfect finish. ";
      if (complexity > 3) explanation += "Service complexity indicates high-risk surfaces or intricate components that need careful attention. ";
      if (intensity > 3) explanation += "Labor intensity reflects a high physical demand to deliver the best value. ";
      if (manualVehicles.length > 1) explanation += `Calculated across ${manualVehicles.length} assets with size-specific adjustments for a bundled approach. `;
      explanation += "Pricing is optimized to provide premium value while remaining attractive for retail clients.";
    } else {
      explanation = `This estimate utilizes standard insurance restoration rates at $${baseMarketHourlyRate}/hr. `;
      if (effectiveSeverity > 3) explanation += "Job severity necessitates full-scope restoration procedures, specialized decontamination, and extended labor hours. ";
      if (effectiveComplexity > 3) explanation += "High service complexity requires certified technical handling of delicate or compromised components. ";
      if (effectiveIntensity > 3) explanation += "Labor intensity is adjusted for comprehensive remediation and recovery standards. ";
      if (manualVehicles.length > 1) explanation += `Multi-asset claim calculated across ${manualVehicles.length} vehicles with standard size multipliers. `;
      explanation += "Pricing reflects full-scope liability, comprehensive documentation, and strict adherence to restoration protocols without underpricing.";
    }

    // Upsell Logic
    const upsells: { name: string; price: number; reason: string; id: string; type: "addon" | "service" }[] = [];
    const hasExterior = selectedServices.some(s => s.name.toLowerCase().includes("exterior"));
    const hasInterior = selectedServices.some(s => s.name.toLowerCase().includes("interior"));
    
    if (hasExterior && !hasInterior) {
      const interiorAddon = addOns.find(a => a.name.toLowerCase().includes("interior") && a.isActive);
      if (interiorAddon) {
        upsells.push({ 
          id: interiorAddon.id,
          name: interiorAddon.name, 
          price: interiorAddon.price, 
          reason: "Complete the transformation with interior detailing.",
          type: "addon"
        });
      }
    }

    if (manualVehicles.length > 1) {
      upsells.push({
        id: "multi-vehicle-discount",
        name: "Multi-Vehicle Bundle",
        price: -25,
        reason: "Reward loyalty for multiple assets in one mission.",
        type: "service"
      });
    }

    return {
      totalPrice: recommendedPrice,
      lowPrice,
      safePrice,
      premiumPrice,
      recommendedPrice,
      items,
      upsells,
      explanation,
      difficulty: effectiveSeverity + effectiveIntensity + effectiveComplexity > 10 ? "High" : effectiveSeverity + effectiveIntensity + effectiveComplexity > 6 ? "Medium" : "Low"
    };
  }, [manualVehicles, selectedServiceSelections, selectedAddOnSelections, selectedServices, selectedAddOns, severity, intensity, complexity, addOns, services, quoteType, jobDescription]);

  const generateHumanDescription = () => {
    if (selectedServices.length === 0 && selectedAddOns.length === 0) return "";

    const serviceNames = selectedServices.map(s => s.name.toLowerCase());
    const addOnNames = selectedAddOns.map(a => a.name.toLowerCase());
    const vehicleStr = manualVehicles.length > 0 
      ? `${manualVehicles.length} vehicle${manualVehicles.length > 1 ? 's' : ''}` 
      : "vehicle";

    let description = "";

    // Opening - more natural
    const openings = [
      `This proposal covers a professional detailing protocol for the ${vehicleStr}. `,
      `We have outlined a comprehensive service plan to restore and protect the ${vehicleStr}. `,
      `Our team will be performing a series of specialized treatments on the ${vehicleStr}. `,
      `The following services are designed to bring the ${vehicleStr} back to peak condition. `
    ];
    description += openings[Math.floor(Math.random() * openings.length)];

    // Service list integration
    const allItems = [...serviceNames, ...addOnNames];
    if (allItems.length === 1) {
      description += `The primary focus will be a thorough ${allItems[0]} process. `;
    } else {
      description += `The scope of work includes ${allItems.slice(0, -1).join(", ")} and ${allItems[allItems.length - 1]}. `;
    }

    // Contextual depth based on severity/intensity
    if (severity >= 4 || intensity >= 4) {
      description += "Due to the current condition of the asset, we will be implementing advanced restoration techniques and high-grade cleaning agents to ensure all contaminants are properly removed. ";
    } else if (severity <= 2) {
      description += "The focus will be on maintaining the current finish and applying protective layers to ensure long-term durability. ";
    }

    // Notes integration - more natural
    if (jobDescription && jobDescription.trim().length > 5) {
      const notes = jobDescription.trim().toLowerCase();
      description += `We've noted your specific requirements regarding ${notes}, and our technicians will prioritize these areas to ensure they meet our quality standards. `;
    }

    // Closing based on type
    if (quoteType === "insurance") {
      description += "This estimate is prepared in accordance with industry standards for insurance restoration, focusing on asset recovery and documented quality control.";
    } else {
      description += "We are committed to delivering a result that not only looks exceptional but also provides lasting protection for your investment.";
    }

    return description;
  };

  const finalPrice = isPriceCustomized && customPrice !== null 
    ? customPrice 
    : selectedTier === "low" 
      ? (recommendations?.lowPrice || 0)
      : selectedTier === "safe"
        ? (recommendations?.safePrice || 0)
        : selectedTier === "premium"
          ? (recommendations?.premiumPrice || 0)
          : (recommendations?.recommendedPrice || 0);

  const handleApply = () => {
    if (!recommendations) return;
    
    const basePrice = selectedTier === "low" 
      ? recommendations.lowPrice 
      : selectedTier === "safe"
        ? recommendations.safePrice
        : selectedTier === "premium"
          ? recommendations.premiumPrice
          : recommendations.recommendedPrice;

    const lineItems = [
      ...recommendations.items.map(i => ({ serviceName: i.name, price: i.price }))
    ];

    // Adjust line items if a different tier or custom price was selected
    const targetPrice = isPriceCustomized && customPrice !== null ? customPrice : basePrice;
    const adjustment = targetPrice - recommendations.recommendedPrice;
    
    if (Math.abs(adjustment) > 0.01) {
      lineItems.push({ serviceName: "Custom Price Adjustment", price: adjustment });
    }

    onApply({
      clientId: "", // Independent
      clientInfo: {
        name: `${firstName} ${lastName}`.trim() || "Valued Client",
        firstName,
        lastName,
        email,
        phone,
        address,
        businessName
      },
      manualVehicles,
      lineItems,
      notes: jobDescription,
      description: generateHumanDescription(),
      businessName
    });
  };

  const addVehicle = () => {
    if (currentVehicle.year && currentVehicle.make && currentVehicle.model) {
      setManualVehicles([...manualVehicles, currentVehicle]);
      setCurrentVehicle({ year: "", make: "", model: "", size: "medium" });
    }
  };

  const removeVehicle = (idx: number) => {
    setManualVehicles(manualVehicles.filter((_, i) => i !== idx));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <Card className="border-none shadow-2xl bg-card rounded-3xl overflow-hidden">
          <CardHeader className="bg-black/40 border-b border-white/5 p-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                <Zap className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-2xl font-black text-white uppercase tracking-tighter">Independent AI Estimator</CardTitle>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">Market-Based Pricing & Analysis</p>
              </div>
              <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-xl border border-white/10">
                <Button
                  variant="ghost"
                  className={cn("rounded-lg text-[10px] font-black uppercase tracking-widest px-4 h-8 transition-all", quoteType === "retail" ? "bg-primary text-white" : "text-gray-400 hover:text-white")}
                  onClick={() => setQuoteType("retail")}
                >
                  Retail Customer
                </Button>
                <Button
                  variant="ghost"
                  className={cn("rounded-lg text-[10px] font-black uppercase tracking-widest px-4 h-8 transition-all", quoteType === "insurance" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white")}
                  onClick={() => setQuoteType("insurance")}
                >
                  Insurance Claim
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-8">
            {/* Client Info Section */}
            <div className="space-y-6">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-primary" />
                Target Entity Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500">First Name</Label>
                  <Input 
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Last Name</Label>
                  <Input 
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Business Name (Optional)</Label>
                  <Input 
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Acme Corp"
                    className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Email Address</Label>
                  <Input 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Phone Number</Label>
                  <Input 
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="(555) 000-0000"
                    className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Service Address</Label>
                <AddressInput 
                  defaultValue={address}
                  onAddressSelect={(addr) => setAddress(addr)}
                  className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                />
              </div>
            </div>

            {/* Vehicle Selection Section */}
            <div className="space-y-6 pt-6 border-t border-white/5">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Car className="w-4 h-4 text-primary" />
                Asset Configuration
              </h3>
              
              <div className="space-y-4 p-6 bg-white/5 rounded-2xl border border-white/10">
                <VehicleSelector 
                  onSelect={(v) => setCurrentVehicle(prev => ({ ...prev, ...v }))}
                  initialValues={currentVehicle}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Vehicle Size</Label>
                    <Select value={currentVehicle.size} onValueChange={(v) => setCurrentVehicle(prev => ({ ...prev, size: v }))}>
                      <SelectTrigger className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-white/10 text-white">
                        <SelectItem value="small">Small (Coupe/Compact)</SelectItem>
                        <SelectItem value="medium">Medium (Sedan/Small SUV)</SelectItem>
                        <SelectItem value="large">Large (Large SUV/Truck)</SelectItem>
                        <SelectItem value="extra_large">Extra Large (Van/Lifted Truck)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    type="button"
                    onClick={addVehicle}
                    disabled={!currentVehicle.year || !currentVehicle.make || !currentVehicle.model}
                    className="bg-primary hover:bg-red-700 text-white font-black h-12 rounded-xl uppercase tracking-widest text-[10px]"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Asset
                  </Button>
                </div>
              </div>

              {manualVehicles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {manualVehicles.map((v, idx) => (
                    <Badge key={idx} className="bg-white/10 text-white border-none px-4 py-2 rounded-xl flex items-center gap-3 group">
                      <span className="font-black text-[10px] tracking-widest">{v.year} {v.make} {v.model}</span>
                      <Badge className="bg-primary/20 text-primary text-[8px] border-none">{v.size.toUpperCase()}</Badge>
                      <button onClick={() => removeVehicle(idx)} className="text-gray-500 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Service Selection Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-white/5">
              <div className="space-y-3">
                <Label className="font-black uppercase tracking-widest text-[10px] text-white/50">Service Protocols</Label>
                <div className="grid grid-cols-1 gap-2 border border-white/10 rounded-2xl p-4 bg-white/5 max-h-64 overflow-y-auto custom-scrollbar">
                  {services.filter(s => s.isActive).map((s) => (
                    <div key={s.id} className="space-y-2 p-2 bg-white/5 rounded-xl border border-white/5 group">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Checkbox 
                            id={`smart-s-${s.id}`} 
                            checked={selectedServiceSelections.some(sel => sel.serviceId === s.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                const v = manualVehicles[0];
                                setSelectedServiceSelections([...selectedServiceSelections, { 
                                  serviceId: s.id, 
                                  vehicleId: v ? `${v.year}-${v.make}-${v.model}` : undefined,
                                  vehicleName: v ? `${v.year} ${v.make}` : undefined 
                                }]);
                              } else {
                                setSelectedServiceSelections(selectedServiceSelections.filter(sel => sel.serviceId !== s.id));
                              }
                            }}
                            className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                          <label htmlFor={`smart-s-${s.id}`} className="text-sm font-black text-white cursor-pointer uppercase tracking-tight">
                            {s.name}
                          </label>
                        </div>
                      </div>
                      {selectedServiceSelections.some(sel => sel.serviceId === s.id) && manualVehicles.length > 1 && (
                        <div className="pl-7 flex flex-wrap gap-1">
                          {manualVehicles.map((v, vIdx) => {
                            const vId = `${v.year}-${v.make}-${v.model}`;
                            const isSelected = selectedServiceSelections.some(sel => sel.serviceId === s.id && sel.vehicleId === vId);
                            return (
                              <Badge 
                                key={vIdx}
                                variant="outline"
                                className={cn(
                                  "cursor-pointer text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md",
                                  isSelected ? "bg-primary text-white border-primary" : "bg-white/5 text-white/40 border-white/10"
                                )}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedServiceSelections(prev => prev.filter(sel => !(sel.serviceId === s.id && sel.vehicleId === vId)));
                                  } else {
                                    setSelectedServiceSelections(prev => [...prev, { 
                                      serviceId: s.id, 
                                      vehicleId: vId,
                                      vehicleName: `${v.year} ${v.make}` 
                                    }]);
                                  }
                                }}
                              >
                                {v.make}
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-black uppercase tracking-widest text-[10px] text-white/50">Add-On Protocols</Label>
                <div className="grid grid-cols-1 gap-2 border border-white/10 rounded-2xl p-4 bg-white/5 max-h-64 overflow-y-auto custom-scrollbar">
                  {addOns.filter(a => a.isActive).map((a) => (
                    <div key={a.id} className="space-y-2 p-2 bg-white/5 rounded-xl border border-white/5 group">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Checkbox 
                            id={`smart-a-${a.id}`} 
                            checked={selectedAddOnSelections.some(sel => sel.addOnId === a.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                const v = manualVehicles[0];
                                setSelectedAddOnSelections([...selectedAddOnSelections, { 
                                  addOnId: a.id, 
                                  vehicleId: v ? `${v.year}-${v.make}-${v.model}` : undefined,
                                  vehicleName: v ? `${v.year} ${v.make}` : undefined 
                                }]);
                              } else {
                                setSelectedAddOnSelections(selectedAddOnSelections.filter(sel => sel.addOnId !== a.id));
                              }
                            }}
                            className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                          <label htmlFor={`smart-a-${a.id}`} className="text-sm font-black text-white cursor-pointer uppercase tracking-tight">
                            {a.name}
                          </label>
                        </div>
                      </div>
                      {selectedAddOnSelections.some(sel => sel.addOnId === a.id) && manualVehicles.length > 1 && (
                        <div className="pl-7 flex flex-wrap gap-1">
                          {manualVehicles.map((v, vIdx) => {
                            const vId = `${v.year}-${v.make}-${v.model}`;
                            const isSelected = selectedAddOnSelections.some(sel => sel.addOnId === a.id && sel.vehicleId === vId);
                            return (
                              <Badge 
                                key={vIdx}
                                variant="outline"
                                className={cn(
                                  "cursor-pointer text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md",
                                  isSelected ? "bg-primary text-white border-primary" : "bg-white/5 text-white/40 border-white/10"
                                )}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedAddOnSelections(prev => prev.filter(sel => !(sel.addOnId === a.id && sel.vehicleId === vId)));
                                  } else {
                                    setSelectedAddOnSelections(prev => [...prev, { 
                                      addOnId: a.id, 
                                      vehicleId: vId,
                                      vehicleName: `${v.year} ${v.make}` 
                                    }]);
                                  }
                                }}
                              >
                                {v.make}
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Analysis Inputs */}
            <div className="space-y-8 pt-6 border-t border-white/5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Job Severity</Label>
                    <span className="text-[10px] font-black text-primary">{severity}/5</span>
                  </div>
                  <Slider 
                    value={[severity]} 
                    onValueChange={(v) => setSeverity(Array.isArray(v) ? v[0] : v)} 
                    max={5} 
                    min={1} 
                    step={1}
                    className="py-4"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Labor Intensity</Label>
                    <span className="text-[10px] font-black text-primary">{intensity}/5</span>
                  </div>
                  <Slider 
                    value={[intensity]} 
                    onValueChange={(v) => setIntensity(Array.isArray(v) ? v[0] : v)} 
                    max={5} 
                    min={1} 
                    step={1}
                    className="py-4"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Service Complexity</Label>
                    <span className="text-[10px] font-black text-primary">{complexity}/5</span>
                  </div>
                  <Slider 
                    value={[complexity]} 
                    onValueChange={(v) => setComplexity(Array.isArray(v) ? v[0] : v)} 
                    max={5} 
                    min={1} 
                    step={1}
                    className="py-4"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Job Description / Notes</Label>
                <Textarea 
                  placeholder="Describe the specific job details..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  className="bg-white/5 border-white/10 rounded-2xl min-h-[100px] text-white font-medium"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {recommendations && recommendations.upsells.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Strategic Upsell Opportunities
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendations.upsells.map((upsell, idx) => (
                <Card key={idx} className="bg-primary/5 border border-primary/20 rounded-2xl overflow-hidden group hover:bg-primary/10 transition-all cursor-pointer" onClick={() => {
                  if (upsell.type === "addon") {
                    if (!selectedAddOnSelections.some(sel => sel.addOnId === upsell.id)) {
                      const v = manualVehicles[0];
                      setSelectedAddOnSelections([...selectedAddOnSelections, { 
                        addOnId: upsell.id,
                        vehicleId: v ? `${v.year}-${v.make}-${v.model}` : undefined,
                        vehicleName: v ? `${v.year} ${v.make}` : undefined
                      }]);
                    }
                  } else {
                    if (!selectedServiceSelections.some(sel => sel.serviceId === upsell.id)) {
                      const v = manualVehicles[0];
                      setSelectedServiceSelections([...selectedServiceSelections, { 
                        serviceId: upsell.id,
                        vehicleId: v ? `${v.year}-${v.make}-${v.model}` : undefined,
                        vehicleName: v ? `${v.year} ${v.make}` : undefined
                      }]);
                    }
                  }
                }}>
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary shrink-0">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-black text-white uppercase tracking-tight text-sm">{upsell.name}</span>
                        <span className="text-xs font-black text-primary">+{upsell.price > 0 ? `$${upsell.price}` : `-$${Math.abs(upsell.price)}`}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 font-bold leading-relaxed">{upsell.reason}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-primary" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <Card className="border-none shadow-2xl bg-gray-900 rounded-3xl overflow-hidden sticky top-8">
          <CardHeader className="bg-black/40 border-b border-white/5 p-8">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter">Market Analysis</CardTitle>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">AI-Powered Market Estimate</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Selected Price Option</p>
                  <Badge className={cn(
                    "border-none text-[9px] font-black uppercase tracking-widest",
                    isPriceCustomized ? "bg-blue-500/20 text-blue-400" : "bg-primary/20 text-primary"
                  )}>
                    {isPriceCustomized ? "Customized" : selectedTier.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black text-white tracking-tighter">${finalPrice.toFixed(2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button 
                  type="button"
                  onClick={() => {
                    setSelectedTier("low");
                    setIsPriceCustomized(false);
                  }}
                  className={cn(
                    "p-3 rounded-xl border transition-all text-center",
                    selectedTier === "low" && !isPriceCustomized ? "bg-primary/20 border-primary ring-1 ring-primary" : "bg-white/5 border-white/5 hover:bg-white/10"
                  )}
                >
                  <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Low</p>
                  <p className="text-xs font-black text-white">${recommendations?.lowPrice.toFixed(0) || "0"}</p>
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setSelectedTier("safe");
                    setIsPriceCustomized(false);
                  }}
                  className={cn(
                    "p-3 rounded-xl border transition-all text-center",
                    selectedTier === "safe" && !isPriceCustomized ? "bg-primary/20 border-primary ring-1 ring-primary" : "bg-white/5 border-white/5 hover:bg-white/10"
                  )}
                >
                  <p className="text-[8px] font-black text-primary uppercase tracking-widest mb-1">Safe</p>
                  <p className="text-xs font-black text-white">${recommendations?.safePrice.toFixed(0) || "0"}</p>
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setSelectedTier("premium");
                    setIsPriceCustomized(false);
                  }}
                  className={cn(
                    "p-3 rounded-xl border transition-all text-center",
                    selectedTier === "premium" && !isPriceCustomized ? "bg-primary/20 border-primary ring-1 ring-primary" : "bg-white/5 border-white/5 hover:bg-white/10"
                  )}
                >
                  <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Premium</p>
                  <p className="text-xs font-black text-white">${recommendations?.premiumPrice.toFixed(0) || "0"}</p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline"
                className="bg-white/5 border-white/10 text-white font-black uppercase tracking-widest text-[10px] h-12 rounded-xl hover:bg-white/10"
                onClick={() => {
                  setIsPriceCustomized(false);
                  setCustomPrice(null);
                }}
              >
                Use AI Price
              </Button>
              <Dialog>
                <DialogTrigger render={
                  <Button 
                    variant="outline"
                    className="bg-white/5 border-white/10 text-white font-black uppercase tracking-widest text-[10px] h-12 rounded-xl hover:bg-white/10"
                  >
                    Customize
                  </Button>
                } />
                <DialogContent className="bg-gray-900 border-white/10 text-white">
                  <DialogHeader>
                    <DialogTitle className="text-white font-black uppercase">Manual Price Override</DialogTitle>
                  </DialogHeader>
                  <div className="py-6 space-y-4">
                    <Label className="text-gray-400 font-black uppercase tracking-widest text-[10px]">Set Custom Total Value</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                      <Input 
                        type="number"
                        value={customPrice || finalPrice}
                        onChange={(e) => setCustomPrice(Number(e.target.value))}
                        className="bg-white/5 border-white/10 h-14 pl-10 text-xl font-black text-white"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button 
                      className="w-full bg-primary hover:bg-red-700 text-white font-black h-12 rounded-xl uppercase tracking-widest"
                      onClick={() => setIsPriceCustomized(true)}
                    >
                      Apply Custom Price
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {recommendations && (
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
                    <Sparkles className="w-3 h-3" />
                    Analysis Logic
                  </p>
                  <Badge className="bg-white/10 text-white border-none text-[8px] font-black uppercase">
                    Difficulty: {recommendations.difficulty}
                  </Badge>
                </div>
                <p className="text-[11px] text-gray-300 font-medium leading-relaxed">
                  {recommendations.explanation}
                </p>
              </div>
            )}

            <div className="space-y-4 pt-6 border-t border-white/5">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Market Protocol Breakdown</p>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                {recommendations?.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm">
                    <span className="text-gray-400 font-bold truncate mr-4">{item.name}</span>
                    <span className="text-white font-black">${item.price.toFixed(2)}</span>
                  </div>
                ))}
                {(!recommendations || recommendations.items.length === 0) && (
                  <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest italic text-center py-4">No protocols selected.</p>
                )}
              </div>
            </div>

            <Button 
              className="w-full bg-primary hover:bg-red-700 text-white font-black h-14 rounded-2xl uppercase tracking-tight text-sm shadow-xl shadow-primary/20 transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center px-4"
              disabled={manualVehicles.length === 0 || (selectedServiceSelections.length === 0 && selectedAddOnSelections.length === 0)}
              onClick={handleApply}
            >
              <span>Convert to Standard Quote</span>
              <ArrowRight className="w-4 h-4 ml-2 shrink-0" />
            </Button>
            
            {manualVehicles.length === 0 && (
              <div className="flex items-center gap-2 p-4 bg-yellow-500/10 rounded-2xl border border-yellow-500/20">
                <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />
                <p className="text-[9px] text-yellow-500 font-black uppercase tracking-widest leading-relaxed">
                  Asset configuration required for market analysis.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Quotes() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [addOns, setAddOns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeTab, setActiveTab] = useState("standard");
  const [manualVehicles, setManualVehicles] = useState<{ year: string; make: string; model: string; size: string }[]>([]);
  const [smartQuoteNotes, setSmartQuoteNotes] = useState("");
  const [quoteDescription, setQuoteDescription] = useState("");
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  
  // Form state
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [manualClientInfo, setManualClientInfo] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    businessName: ""
  });
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ year: "", make: "", model: "", vin: "", size: "medium" as any });
  const [lineItems, setLineItems] = useState<{ serviceName: string; price: number }[]>([{ serviceName: "", price: 0 }]);
  const [attachedFormIds, setAttachedFormIds] = useState<string[]>([]);
  const [formTemplates, setFormTemplates] = useState<any[]>([]);

  const suggestedClients = clients.filter(c => {
    const search = clientSearchTerm.toLowerCase();
    const name = (c.businessName || `${c.firstName} ${c.lastName}`).toLowerCase();
    return search && (
      name.includes(search) || 
      c.email?.toLowerCase().includes(search) || 
      c.phone?.includes(search)
    );
  }).slice(0, 5);

  const handleSelectClient = (client: Client) => {
    setSelectedClientId(client.id);
    setClientSearchTerm(client.businessName || `${client.firstName} ${client.lastName}`);
    setManualClientInfo({
      name: client.businessName || `${client.firstName} ${client.lastName}`,
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      businessName: client.businessName || ""
    });
    setShowClientSuggestions(false);
  };

  useEffect(() => {
    if (authLoading || !profile) return;

    const fetchQuotesData = async () => {
      try {
        const [
          quotesSnap,
          clientsSnap,
          servicesSnap,
          addonsSnap,
          formsSnap,
          settingsSnap,
          invoicesSnap,
          appointmentsSnap
        ] = await Promise.all([
          getDocs(query(collection(db, "quotes"), orderBy("createdAt", "desc"), limit(100))),
          getDocs(query(collection(db, "clients"), limit(200))),
          getDocs(collection(db, "services")),
          getDocs(collection(db, "addons")),
          getDocs(query(collection(db, "form_templates"), orderBy("title", "asc"), limit(50))),
          getDoc(doc(db, "settings", "business")),
          getDocs(query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(50))),
          getDocs(query(collection(db, "appointments"), orderBy("createdAt", "desc"), limit(50)))
        ]);

        setQuotes(quotesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quote)));
        setClients(clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
        // Vehicles are managed per context
        setServices(servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service)));
        setAddOns(addonsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
        setFormTemplates(formsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setInvoices(invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
        setAppointments(appointmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
        if (settingsSnap.exists()) setSettings(settingsSnap.data() as BusinessSettings);
        
        setLoading(false);
      } catch (error) {
        console.error("Error fetching quotes data:", error);
        setLoading(false);
      }
    };

    fetchQuotesData();
  }, [profile, authLoading]);

  // Fetch vehicles when client is selected
  useEffect(() => {
    if (!selectedClientId) {
      setAllVehicles([]);
      return;
    }
    const fetchVehicles = async () => {
      try {
        const vehiclesSnap = await getDocs(query(collection(db, "vehicles"), where("clientId", "==", selectedClientId)));
        setAllVehicles(vehiclesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle)));
      } catch (error) {
        console.error("Error fetching vehicles for selected client in quotes:", error);
      }
    };
    fetchVehicles();
  }, [selectedClientId]);

  useEffect(() => {
    if (loading) return;
    if (location.state?.lead) {
      const lead = location.state.lead;
      setActiveLeadId(lead.id);
      setIsAddDialogOpen(true);
      setManualClientInfo({
        name: lead.name,
        email: lead.email || "",
        phone: lead.phone || "",
        address: lead.address || "",
        businessName: ""
      });
      setSmartQuoteNotes(lead.notes || "");
      // Clear state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname, loading]);

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { serviceName: "", price: 0 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (index: number, field: "serviceName" | "price", value: string | number) => {
    const newItems = [...lineItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setLineItems(newItems);
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  };

  const handleCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualClientInfo.name) {
      toast.error("Please enter a client name");
      return;
    }

    let vehicles = allVehicles.filter(v => selectedVehicleIds.includes(v.id)).map(v => ({
      id: v.id,
      year: v.year,
      make: v.make,
      model: v.model,
      roNumber: v.roNumber
    }));

    // Add manual vehicles from Smart Quote
    manualVehicles.forEach(mv => {
      vehicles.push({
        id: `manual_${Math.random().toString(36).substr(2, 9)}`,
        year: mv.year,
        make: mv.make,
        model: mv.model,
        roNumber: ""
      });
    });

    // Create new vehicle if requested
    if (isAddingVehicle && newVehicle.make && newVehicle.model && selectedClientId) {
      const vehicleRef = await addDoc(collection(db, "vehicles"), {
        ...newVehicle,
        clientId: selectedClientId,
        ownerId: selectedClientId,
        ownerType: "client",
        createdAt: serverTimestamp()
      });
      vehicles.push({
        id: vehicleRef.id,
        year: newVehicle.year,
        make: newVehicle.make,
        model: newVehicle.model,
        roNumber: ""
      });
    }

    const quoteData: any = {
      clientId: selectedClientId || undefined,
      clientName: manualClientInfo.name,
      clientEmail: manualClientInfo.email,
      clientPhone: manualClientInfo.phone,
      clientAddress: manualClientInfo.address,
      businessName: manualClientInfo.businessName,
      description: quoteDescription,
      isPotentialClient: !selectedClientId,
      vehicles,
      lineItems: lineItems.filter(item => item.serviceName),
      total: calculateTotal(),
      status: editingQuote?.status || "draft",
      attachedFormIds,
      updatedAt: serverTimestamp(),
      leadId: activeLeadId || editingQuote?.leadId || null
    };

    try {
      if (editingQuote) {
        await updateDoc(doc(db, "quotes", editingQuote.id), quoteData);
        toast.success("Quote updated!");
      } else {
        await addDoc(collection(db, "quotes"), {
          ...quoteData,
          createdAt: serverTimestamp(),
        });

        if (activeLeadId) {
          await updateDoc(doc(db, "leads", activeLeadId), {
            status: "quoted",
            quotedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }

        toast.success("Quote created!");
      }
      setIsAddDialogOpen(false);
      setEditingQuote(null);
      resetForm();
    } catch (error) {
      console.error("Error saving quote:", error);
      toast.error("Failed to save quote");
    }
  };

  const resetForm = () => {
    setSelectedClientId("");
    setClientSearchTerm("");
    setManualClientInfo({ name: "", email: "", phone: "", address: "", businessName: "" });
    setSelectedVehicleIds([]);
    setManualVehicles([]);
    setSmartQuoteNotes("");
    setQuoteDescription("");
    setLineItems([{ serviceName: "", price: 0 }]);
    setAttachedFormIds([]);
    setIsAddingVehicle(false);
    setNewVehicle({ year: "", make: "", model: "", vin: "", size: "medium" });
    setActiveLeadId(null);
  };

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<any>(null);

  const handleDeleteQuote = async (id: string) => {
    console.log("Attempting to delete quote:", id);
    if (!id) {
      toast.error("Invalid quote ID");
      return;
    }

    try {
      await deleteDoc(doc(db, "quotes", id));
      toast.success("Quote deleted successfully");
    } catch (error) {
      console.error("Error deleting quote:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `quotes/${id}`);
      } catch (err: any) {
        toast.error(`Failed to delete quote: ${err.message}`);
      }
    }
  };

  const filteredQuotes = quotes.filter(q => 
    q.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    q.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-20">
      <PageHeader 
        title="Service Estimates" 
        accentWord="Estimates" 
        subtitle="Quote Generation & Proposal Tracking"
        actions={
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) {
              setEditingQuote(null);
              resetForm();
            }
          }}>
            <DialogTrigger render={
              <Button className="bg-primary hover:bg-red-700 text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-primary/20 transition-all hover:scale-105" onClick={() => {
                setEditingQuote(null);
                resetForm();
                setIsAddDialogOpen(true);
              }}>
                <Plus className="w-4 h-4 mr-2" />
                Generate Quote
              </Button>
            } />
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto bg-card border-none rounded-3xl shadow-2xl shadow-black p-0">
            <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">{editingQuote ? "Edit Proposal" : "Generate Tactical Quote"}</DialogTitle>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">Strategic Opportunity Engine</p>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={handleCreateQuote} className="p-8 space-y-8">
              <div className="space-y-6">
                <div className="space-y-4 p-6 bg-white/5 rounded-2xl border border-white/10">
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Target Entity (Client)</Label>
                    <SearchableSelector
                      options={clients.map(c => ({
                        value: c.id,
                        label: c.businessName || `${c.firstName} ${c.lastName}`,
                        description: `${c.email || "No email"} • ${c.phone || "No phone"}`
                      }))}
                      value={selectedClientId}
                      onSelect={(val) => {
                        const client = clients.find(c => c.id === val);
                        if (client) handleSelectClient(client);
                      }}
                      placeholder="Search for a client..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Business Name (Optional)</Label>
                      <Input 
                        placeholder="Acme Corp"
                        value={manualClientInfo.businessName}
                        onChange={(e) => setManualClientInfo(prev => ({ ...prev, businessName: e.target.value }))}
                        className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                      />
                    </div>

                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Email Address</Label>
                      <Input 
                        type="email"
                        placeholder="client@example.com"
                        value={manualClientInfo.email}
                        onChange={(e) => setManualClientInfo(prev => ({ ...prev, email: e.target.value }))}
                        className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Phone Number</Label>
                      <Input 
                        placeholder="(555) 000-0000"
                        value={manualClientInfo.phone}
                        onChange={(e) => setManualClientInfo(prev => ({ ...prev, phone: e.target.value }))}
                        className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Mission Coordinates (Address)</Label>
                    <AddressInput 
                      defaultValue={manualClientInfo.address}
                      onAddressSelect={(address, lat, lng) => setManualClientInfo(prev => ({ ...prev, address, latitude: lat, longitude: lng }))}
                      placeholder="123 Main St, Austin, TX"
                      className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Service Description (Generated)</Label>
                    <Textarea 
                      placeholder="Detailed description of work to be performed..."
                      value={quoteDescription}
                      onChange={(e) => setQuoteDescription(e.target.value)}
                      className="bg-white/5 border-white/10 min-h-[100px] rounded-xl font-bold text-white"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Internal Notes / Job Details</Label>
                    <Textarea 
                      placeholder="Internal notes about the job..."
                      value={smartQuoteNotes}
                      onChange={(e) => setSmartQuoteNotes(e.target.value)}
                      className="bg-white/5 border-white/10 min-h-[80px] rounded-xl font-bold text-white"
                    />
                  </div>
                </div>

                <div className="space-y-4 p-6 bg-white/5 rounded-2xl border border-white/10">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Attach Forms & Waivers</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                    {formTemplates.map((form) => (
                      <div key={form.id} className="flex items-center space-x-3 p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-all">
                        <Checkbox 
                          id={`form-${form.id}`} 
                          checked={attachedFormIds.includes(form.id)}
                          onCheckedChange={(checked) => {
                            if (checked) setAttachedFormIds([...attachedFormIds, form.id]);
                            else setAttachedFormIds(attachedFormIds.filter(id => id !== form.id));
                          }}
                          className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <label htmlFor={`form-${form.id}`} className="text-[10px] font-bold text-white uppercase tracking-widest cursor-pointer flex-1">
                          {form.title}
                        </label>
                      </div>
                    ))}
                    {formTemplates.length === 0 && (
                      <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest italic p-4 text-center col-span-2">No forms detected in system.</p>
                    )}
                  </div>
                </div>

                {(selectedClientId || manualVehicles.length > 0) && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Asset Profile (Vehicle)</Label>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10"
                        onClick={() => setIsAddingVehicle(!isAddingVehicle)}
                      >
                        {isAddingVehicle ? "Select Existing Asset" : "+ Register New Asset"}
                      </Button>
                    </div>

                    {manualVehicles.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {manualVehicles.map((v, idx) => (
                          <Badge key={idx} className="bg-white/10 text-white border-none px-4 py-2 rounded-xl flex items-center gap-2">
                            <Car className="w-3 h-3 text-primary" />
                            <span className="font-black text-[10px] tracking-widest">{v.year} {v.make} {v.model}</span>
                          </Badge>
                        ))}
                      </div>
                    )}
                    
                    {isAddingVehicle ? (
                      <div className="space-y-4 p-6 bg-white/5 rounded-2xl border border-white/10">
                        <VehicleSelector 
                          onSelect={(v) => setNewVehicle(prev => ({ ...prev, ...v }))} 
                          initialValues={newVehicle}
                        />
                        <div className="grid grid-cols-1 gap-4 mt-2">
                          <Input 
                            placeholder="VIN (Optional)" 
                            value={newVehicle.vin} 
                            onChange={(e) => setNewVehicle(prev => ({ ...prev, vin: e.target.value }))}
                            className="bg-white/5 border-white/10 h-12 rounded-xl font-bold uppercase font-mono text-white"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 border border-white/10 rounded-2xl p-4 bg-white/5 max-h-48 overflow-y-auto custom-scrollbar">
                        {allVehicles.filter(v => v.clientId === selectedClientId).map((v, idx) => (
                          <div key={`${v.id}-${idx}`} className="flex items-center space-x-3 p-2 hover:bg-white/5 rounded-lg transition-colors">
                            <Checkbox 
                              id={`v-${v.id}`} 
                              checked={selectedVehicleIds.includes(v.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedVehicleIds([...selectedVehicleIds, v.id]);
                                } else {
                                  setSelectedVehicleIds(selectedVehicleIds.filter(id => id !== v.id));
                                }
                              }}
                              className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            />
                            <label htmlFor={`v-${v.id}`} className="text-sm font-bold text-white cursor-pointer">
                              {v.year} {v.make} {v.model} {v.roNumber ? `(RO: ${v.roNumber})` : ""}
                            </label>
                          </div>
                        ))}
                        {allVehicles.filter(v => v.clientId === selectedClientId).length === 0 && (
                          <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest italic p-4 text-center">No assets detected for this entity.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Service Protocols (Line Items)</Label>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={handleAddLineItem}
                      className="text-[10px] font-black uppercase tracking-widest border-white/10 hover:bg-white/5 h-8 px-4"
                    >
                      <Plus className="w-3 h-3 mr-2" /> Add Protocol
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {lineItems.map((item, index) => (
                      <div key={index} className="flex gap-4 items-start p-4 bg-white/5 rounded-2xl border border-white/10 group">
                        <div className="flex-1">
                          <Input 
                            placeholder="Protocol name" 
                            value={item.serviceName}
                            onChange={(e) => handleLineItemChange(index, "serviceName", e.target.value)}
                            className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                          />
                        </div>
                        <div className="w-32">
                          <Input 
                            type="number" 
                            placeholder="Value" 
                            value={item.price || ""}
                            onChange={(e) => handleLineItemChange(index, "price", Number(e.target.value))}
                            className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                          />
                        </div>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="h-12 w-12 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                          onClick={() => handleRemoveLineItem(index)}
                          disabled={lineItems.length === 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-8 bg-gray-900 rounded-3xl text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
                    <DollarSign className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Estimated Proposal Value</p>
                    <p className="text-4xl font-black tracking-tighter text-white">${calculateTotal().toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    className="text-gray-400 hover:text-white font-black uppercase tracking-widest text-[10px] h-14 px-8"
                    onClick={() => setIsPreviewOpen(true)}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Preview
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1 md:flex-none bg-primary hover:bg-red-700 text-white font-black h-14 px-12 rounded-2xl uppercase tracking-[0.2em] text-xs shadow-xl shadow-primary/20 transition-all hover:scale-105"
                  >
                    {editingQuote ? "Authorize Update" : "Authorize Proposal"}
                  </Button>
                </div>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      }
    />

    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
      <TabsList className="bg-card/50 border border-white/5 p-1 rounded-2xl">
        <TabsTrigger value="standard" className="rounded-xl px-8 py-3 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
          <FileText className="w-4 h-4 mr-2" />
          Standard Proposals
        </TabsTrigger>
        <TabsTrigger value="smart" className="rounded-xl px-8 py-3 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
          <Sparkles className="w-4 h-4 mr-2" />
          Smart Quote AI
        </TabsTrigger>
      </TabsList>

      <TabsContent value="standard" className="space-y-8">
        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <DialogContent className="max-w-5xl p-0 overflow-hidden bg-gray-100 border-none">
            <div className="max-h-[90vh] overflow-y-auto">
              <DocumentPreview 
                type="quote"
                settings={settings}
                document={{
                  clientName: manualClientInfo.name,
                  clientEmail: manualClientInfo.email,
                  clientPhone: manualClientInfo.phone,
                  clientAddress: manualClientInfo.address,
                  lineItems: lineItems.filter(item => item.serviceName),
                  total: calculateTotal(),
                  status: editingQuote?.status || "draft",
                  vehicles: selectedVehicleIds.map(id => {
                    const v = allVehicles.find(veh => veh.id === id);
                    return v ? { id: v.id, year: v.year, make: v.make, model: v.model } : null;
                  }).filter(Boolean) as any,
                  createdAt: editingQuote?.createdAt || undefined,
                }}
              />
            </div>
            <DialogFooter className="p-4 bg-white border-t">
              <Button variant="outline" onClick={() => setIsPreviewOpen(false)} className="font-bold">
                Close Preview
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
        <CardHeader className="bg-black/40 border-b border-white/5 p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <Input 
              placeholder="Search proposals..." 
              className="pl-12 bg-white border-border text-gray-900 rounded-xl h-12 font-medium focus:ring-primary/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="border-border bg-white text-gray-900 hover:bg-gray-50 rounded-xl h-12 px-6 font-black uppercase tracking-widest text-[10px]">
              <Filter className="w-4 h-4 mr-2 text-primary" />
              Filter Proposals
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-black/20 border-b border-white/5">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Proposal ID</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Client Entity</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Asset Profile</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Timestamp</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Estimated Value</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Status</TableHead>
                <TableHead className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="hover:bg-transparent border-border">
                  <TableCell colSpan={7} className="text-center py-20 text-gray-400 font-black uppercase tracking-widest text-[10px] animate-pulse">Synchronizing Proposals...</TableCell>
                </TableRow>
              ) : filteredQuotes.length === 0 ? (
                <TableRow className="hover:bg-transparent border-border">
                  <TableCell colSpan={7} className="text-center py-20 text-gray-400 font-black uppercase tracking-widest text-[10px]">No proposals detected.</TableCell>
                </TableRow>
              ) : (
                filteredQuotes.map((q) => (
                  <TableRow key={q.id} className="hover:bg-gray-50/50 transition-all duration-300 cursor-pointer group border-border">
                    <TableCell className="px-8 py-6 font-mono text-[10px] font-black uppercase text-gray-400 tracking-widest">
                      #{q.id.slice(-6)}
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary border border-primary/20">
                          <UserIcon className="w-4 h-4" />
                        </div>
                        <span className="font-black text-gray-900 uppercase tracking-tight text-sm">{q.clientName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <div className="flex flex-wrap gap-2">
                        {q.vehicles.map((v, idx) => (
                          <Badge key={`${v.id}-${idx}`} variant="outline" className="text-[9px] font-black uppercase tracking-widest bg-muted/50 border-none px-2 py-0.5 rounded-md">
                            <Car className="w-3 h-3 mr-1.5 text-primary" />
                            {v.year} {v.make}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      {q.createdAt ? format((q.createdAt as any).toDate(), "MMM d, yyyy") : "Pending"}
                    </TableCell>
                    <TableCell className="px-8 py-6 font-black text-gray-900 text-lg tracking-tighter">
                      ${q.total.toFixed(2)}
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <Badge className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border-none",
                        q.status === "approved" ? "bg-green-500/10 text-green-600" :
                        q.status === "sent" ? "bg-blue-500/10 text-blue-600" :
                        "bg-gray-500/10 text-gray-600"
                      )}>
                        {q.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-8 py-6 text-right">
                      <div className="flex justify-end gap-2 transition-all">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-gray-600 hover:text-primary hover:bg-primary/10 rounded-xl"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedQuote(q);
                            setIsDetailOpen(true);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-gray-600 hover:text-primary hover:bg-primary/10 rounded-xl"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingQuote(q);
                            setSelectedClientId(q.clientId || "");
                            setManualClientInfo({
                              name: q.clientName,
                              email: q.clientEmail || "",
                              phone: q.clientPhone || "",
                              address: q.clientAddress || "",
                              businessName: q.businessName || ""
                            });
                            setLineItems(q.lineItems);
                            setQuoteDescription(q.description || "");
                            setAttachedFormIds(q.attachedFormIds || []);
                            setSelectedVehicleIds(q.vehicles.map(v => v.id));
                            setIsAddDialogOpen(true);
                          }}
                        >
                          <Settings2 className="w-4 h-4" />
                        </Button>
                        <DeleteConfirmationDialog
                          trigger={
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Purge Proposal?"
                          itemName={`Quote #${q.id.slice(-6).toUpperCase()}`}
                          onConfirm={() => handleDeleteQuote(q.id)}
                        />
                    </div>
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="smart">
        <SmartQuote 
          clients={clients}
          allVehicles={allVehicles}
          services={services}
          addOns={addOns}
          invoices={invoices}
          appointments={appointments}
          onApply={(data) => {
            setSelectedClientId(data.clientId);
            setManualClientInfo(data.clientInfo);
            setManualVehicles(data.manualVehicles);
            setLineItems(data.lineItems);
            setSmartQuoteNotes(data.notes);
            setQuoteDescription(data.description);
            setActiveTab("standard");
            setIsAddDialogOpen(true);
          }}
        />
      </TabsContent>
    </Tabs>

      {/* Quote Details Dialog */}
      {selectedQuote && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden border-none shadow-2xl">
            <div className="bg-primary p-6 text-white shrink-0">
              <div className="flex justify-between items-start">
                <div>
                  <Badge className="bg-white/20 text-white border-none mb-2 uppercase font-black tracking-widest">
                    Proposal {selectedQuote.status}
                  </Badge>
                  <h2 className="text-3xl font-black tracking-tighter">#{selectedQuote.id.slice(-6)}</h2>
                  <p className="text-red-100 flex items-center gap-2 mt-1">
                    <UserIcon className="w-4 h-4" /> {selectedQuote.clientName}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-red-200 font-bold uppercase">Estimated Value</p>
                  <p className="text-3xl font-black">${selectedQuote.total.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6 bg-white">
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Asset Profile</p>
                <div className="flex flex-wrap gap-2">
                  {selectedQuote.vehicles.map((v: any) => (
                    <Badge key={v.id} variant="outline" className="text-[10px] font-black uppercase tracking-widest bg-gray-50 border-gray-100 px-3 py-1 rounded-lg">
                      <Car className="w-3 h-3 mr-2 text-primary" />
                      {v.year} {v.make} {v.model}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Line Items</p>
                <div className="space-y-2">
                  {selectedQuote.lineItems.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="font-bold text-gray-900">{item.serviceName}</span>
                      <span className="font-black text-primary">${item.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-6">
                {selectedQuote.status === "approved" && (
                  <Button 
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-[0.2em] text-[10px] h-12 rounded-xl shadow-lg shadow-green-500/20 transition-all hover:scale-105"
                    onClick={() => {
                      toast.success("Book Appointment Clicked");
                      setIsDetailOpen(false);
                      
                      document.body.style.pointerEvents = "";
                      document.body.style.overflow = "";
                      document.body.removeAttribute("data-scroll-locked");
                      
                      navigate(`/book-appointment?clientId=${selectedQuote.clientId}`);
                    }}
                  >
                    <Calendar className="w-4 h-4 mr-2" /> Book Appointment
                  </Button>
                )}
                <Button className="flex-1 bg-white border border-border text-gray-900 hover:bg-gray-50 font-black uppercase tracking-widest text-[10px] h-12 rounded-xl shadow-sm transition-all">
                  <FileText className="w-4 h-4 mr-2 text-primary" /> Download PDF
                </Button>
                <Button className="flex-1 bg-primary hover:bg-red-700 text-white font-black uppercase tracking-[0.2em] text-[10px] h-12 rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-105">
                  <Mail className="w-4 h-4 mr-2" /> Email Proposal
                </Button>
                <DeleteConfirmationDialog
                  trigger={
                    <Button 
                      variant="ghost" 
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 font-bold"
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </Button>
                  }
                  title="Delete Proposal?"
                  itemName={`Quote #${selectedQuote.id.slice(-6).toUpperCase()}`}
                  onConfirm={() => {
                    handleDeleteQuote(selectedQuote.id);
                    setIsDetailOpen(false);
                  }}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
