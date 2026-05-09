import { useState, useEffect, useMemo, useCallback } from "react";
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
import { Plus, Search, Filter, FileText, Trash2, Car, User as UserIcon, Settings2, Eye, Mail, DollarSign, Sparkles, Zap, TrendingUp, History, ShieldCheck, AlertCircle, ArrowRight, CheckCircle2, Calendar, Loader2, MapPin, RefreshCcw, Package } from "lucide-react";
import { toast } from "sonner";
import AddressInput from "../components/AddressInput";
import VehicleSelector from "../components/VehicleSelector";
import { format } from "date-fns";
import { cn, cleanAddress, formatCurrency, formatPhoneNumber } from "@/lib/utils";
import { StandardInput } from "../components/StandardInput";
import { CustomFeesEditor } from "../components/CustomFeesEditor";
import { CustomFee } from "../types";
import { useNavigate, useLocation } from "react-router-dom";
import { Quote, Client, Vehicle, Service, BusinessSettings, Invoice, Appointment, LineItem, PricingAnalysis, AdminPricingBreakdown, ClientVisibleAddOn, ProductCatalogItem } from "../types";
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

import {
  getRevenueOptimization,
  RevenueOptimizationResponse,
} from "../services/gemini";
import {
  canRunAI,
  loadAISettings,
  DEFAULT_AI_SETTINGS,
  logAIUsage,
  hashSnapshot,
} from "../services/aiControlService";
import { resolveModel } from "../services/aiModelMap";
import { generateRecommendationExplanation } from "../lib/recommendationSystem";
import { VinInput } from "../components/VinInput";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { ChevronDown, X as XIcon } from "lucide-react";

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
    lineItems: LineItem[];
    notes: string;
    description: string;
    businessName: string;
    productCosts: any[];
    pricingAnalysis?: PricingAnalysis | null;
    // AI quote enrichment fields
    quoteSource?: "standard" | "ai";
    adminPricingBreakdown?: AdminPricingBreakdown | null;
    clientDisplayPrice?: number;
    clientVisibleAddOns?: ClientVisibleAddOn[];
    aiRecommendedPrice?: number;
    baseServicePrice?: number;
    laborCost?: number;
    materialCost?: number;
    addonTotal?: number;
    internalJobCost?: number;
    finalQuoteTotal?: number;
    selectedServiceName?: string;
    internalNotes?: string;
  }) => void;
}

function SmartQuote({ clients, allVehicles, services, addOns, invoices, appointments, onApply }: SmartQuoteProps) {
  // Client Info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sqSelectedClientId, setSqSelectedClientId] = useState<string>("");
  const [address, setAddress] = useState("");
  const [serviceAddress, setServiceAddress] = useState("");
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

  // Product Cost State
  const [productCosts, setProductCosts] = useState<any[]>([]);
  const [pricingAnalysis, setPricingAnalysis] = useState<PricingAnalysis | null>(null);
  const [analysisSource, setAnalysisSource] = useState<"ai" | "benchmark" | "none">("none");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  // Product Catalog
  const [catalogProducts, setCatalogProducts] = useState<ProductCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  // Which line's dropdown is open (by product cost id)
  const [openCatalogFor, setOpenCatalogFor] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "business")).catch(e => handleFirestoreError(e, OperationType.GET, "settings/business"));
        if (snap && snap.exists()) {
          setSettings(snap.data() as BusinessSettings);
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
      }
    };
    fetchSettings();
  }, []);

  // Load product catalog from Firestore
  useEffect(() => {
    const loadCatalog = async () => {
      setCatalogLoading(true);
      try {
        const q = query(collection(db, "productCatalog"), where("active", "==", true), orderBy("productName"));
        const snap = await getDocs(q);
        setCatalogProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductCatalogItem)));
      } catch {
        // Catalog load failure must not block manual entry
        setCatalogProducts([]);
      } finally {
        setCatalogLoading(false);
      }
    };
    loadCatalog();
  }, []);

  const handleAddProductCost = () => {
    const newCost = {
      id: Math.random().toString(36).substr(2, 9),
      name: "",
      quantity: 1,
      unitCost: 0,
      totalCost: 0,
      category: "misc",
      costType: "inventory"
    };
    setProductCosts([...productCosts, newCost]);
  };

  const handleUpdateProductCost = (costId: string, updates: any) => {
    setProductCosts(productCosts.map(p => {
      if (p.id === costId) {
        const newP = { ...p, ...updates };
        newP.totalCost = newP.quantity * newP.unitCost;
        return newP;
      }
      return p;
    }));
  };

  const handleDeleteProductCost = (costId: string) => {
    setProductCosts(productCosts.filter(p => p.id !== costId));
  };

  // Ensure floor/rec/premium are always three distinct customer prices.
  // Called after receiving pricingAnalysis from AI or benchmark.
  // If all three tiers are equal (AI returned one price, or base=0), derives
  // distinct tiers: floor=85%, rec=100%, premium=120% of the service component,
  // with internalJobCost (totalProductCost) added exactly once to each tier.
  const normalizePricingTiers = (pa: PricingAnalysis): PricingAnalysis => {
    const allSame =
      Math.abs(pa.floorPrice - pa.recommendedPrice) < 1 &&
      Math.abs(pa.premiumPrice - pa.recommendedPrice) < 1;
    if (!allSame) return pa;

    const productCost = pa.totalProductCost || 0;
    const recServicePrice = pa.recommendedPrice - productCost;

    if (recServicePrice > 0) {
      return {
        ...pa,
        floorPrice:   parseFloat((recServicePrice * 0.85 + productCost).toFixed(2)),
        premiumPrice: parseFloat((recServicePrice * 1.20 + productCost).toFixed(2)),
      };
    }

    // Product-cost-only: scale the full recommended price proportionally
    return {
      ...pa,
      floorPrice:   parseFloat((pa.recommendedPrice * 0.85).toFixed(2)),
      premiumPrice: parseFloat((pa.recommendedPrice * 1.20).toFixed(2)),
    };
  };

  // Compute a deterministic benchmark PricingAnalysis when AI is unavailable
  const computeBenchmarkPricing = (svcs: any[], addons: any[], costs: any[], cfg: any): PricingAnalysis => {
    const svcTotal = svcs.reduce((s: number, svc: any) => s + (svc.basePrice || svc.price || 150), 0);
    const addonTotal = addons.reduce((s: number, a: any) => s + (a.price || 50) * (a.qty || 1), 0);
    const totalProductCost = costs.reduce((s: number, p: any) => s + (p.totalCost || 0), 0);
    const base = svcTotal + addonTotal;
    const floorPct = cfg?.marginTargets?.floor ?? 20;
    const recPct = cfg?.marginTargets?.recommended ?? 35;
    const premPct = cfg?.marginTargets?.premium ?? 50;
    const floorPrice = base + totalProductCost + (base * floorPct / 100);
    const recommendedPrice = base + totalProductCost + (base * recPct / 100);
    const premiumPrice = base + totalProductCost + (base * premPct / 100);
    const netAfterProductCost = recommendedPrice - totalProductCost;
    const estimatedMarginDollars = netAfterProductCost - base;
    const estimatedMarginPercent = recommendedPrice > 0 ? (estimatedMarginDollars / recommendedPrice) * 100 : 0;
    return {
      laborTarget: base * 0.6,
      overhead: base * 0.1,
      travelFee: 0,
      totalProductCost,
      floorPrice,
      recommendedPrice,
      premiumPrice,
      estimatedMarginDollars,
      estimatedMarginPercent,
      netAfterProductCost,
    };
  };

  const generateAIEstimate = async () => {
    console.log("[SmartQuote] Run Profit-Protected AI Diagnostics clicked", {
      vehicles: manualVehicles,
      services: selectedServiceSelections.map(s => s.serviceId),
      addOns: selectedAddOnSelections.map(a => a.addOnId),
      productCosts: productCosts.map(p => ({ name: p.name, cost: p.totalCost })),
      isGeneratingAI,
    });

    if (manualVehicles.length === 0 || isGeneratingAI) return;

    // Hard guard: product costs alone are not a service quote — require a protocol.
    const hasProtocols = selectedServiceSelections.length > 0 || selectedAddOnSelections.length > 0;
    if (!hasProtocols) {
      toast.error("Select a service protocol to generate market benchmark pricing.");
      return;
    }

    setIsGeneratingAI(true);

    // Compute benchmark early — used as fallback regardless of AI outcome
    const benchmarkPricing = computeBenchmarkPricing(selectedServices, selectedAddOns, productCosts, settings);

    // Build a data snapshot hash so the guard can detect unchanged data
    const dataHash = hashSnapshot({
      services: selectedServices.map(s => s.id || s.name),
      addOns: selectedAddOns.map(a => a.id || a.name),
      productCosts: productCosts.map(p => ({ id: p.id, cost: p.totalCost })),
      vehicle: manualVehicles[0],
      quoteType,
      intensity,
      complexity,
      jobDescription,
    });

    // --- AI guard ---
    let aiSettings = DEFAULT_AI_SETTINGS;
    try {
      aiSettings = await loadAISettings();
    } catch {
      // If settings fail to load, proceed with defaults
    }

    const guard = await canRunAI("smart_quote_pricing", "manual", aiSettings, {
      requestedTier: "balanced_intelligence",
      dataHash,
    });

    if (!guard.allowed) {
      setPricingAnalysis(normalizePricingTiers(benchmarkPricing));
      setAnalysisSource("benchmark");
      toast.info(`AI pricing skipped: ${guard.reason} Using market benchmarks.`);
      setIsGeneratingAI(false);
      await logAIUsage({
        featureName: "smart_quote_pricing",
        triggerType: "manual",
        allowed: false,
        blocked: true,
        reason: guard.reason,
        modelTier: guard.modelTier,
        modelUsed: resolveModel(guard.modelTier),
        cachedResultUsed: guard.useCachedResult,
      });
      return;
    }

    // --- AI call ---
    try {
      const svcTotal = selectedServices.reduce((s: number, svc: any) => s + (svc.basePrice || svc.price || 150), 0);
      const addonTotal = selectedAddOns.reduce((s: number, a: any) => s + (a.price || 50) * (a.qty || 1), 0);

      const structuredPayload = {
        services: selectedServices.map(s => s.name),
        addOns: selectedAddOns.map(a => a.name),
        totalPrice: svcTotal + addonTotal,
        vehicle: manualVehicles[0],
        customerType: quoteType,
      };

      const response = await getRevenueOptimization(
        jobDescription || "Standard detailing request",
        structuredPayload,
        productCosts,
        settings,
        [], // images
        guard.modelTier
      );

      if (response.pricingAnalysis) {
        setPricingAnalysis(normalizePricingTiers(response.pricingAnalysis));
        setAnalysisSource("ai");
        toast.success("AI Pricing Protection Active!");
      } else {
        // Response came back but pricingAnalysis field was empty — use benchmark
        setPricingAnalysis(normalizePricingTiers(benchmarkPricing));
        setAnalysisSource("benchmark");
        toast.warning("AI pricing response incomplete. Using market benchmarks.");
      }

      await logAIUsage({
        featureName: "smart_quote_pricing",
        triggerType: "manual",
        allowed: true,
        blocked: false,
        reason: "OK",
        modelTier: guard.modelTier,
        modelUsed: resolveModel(guard.modelTier),
        cachedResultUsed: false,
      });
    } catch (err: any) {
      console.error("[SmartQuote] AI pricing error:", err);
      // Always set the benchmark so the user sees usable prices
      setPricingAnalysis(normalizePricingTiers(benchmarkPricing));
      setAnalysisSource("benchmark");

      const hasProtocolsForToast = selectedServiceSelections.length > 0 || selectedAddOnSelections.length > 0;
      if (!hasProtocolsForToast) {
        toast.error("Select a service protocol to generate market benchmark pricing.");
      } else if (err.message?.includes("QUOTA_EXCEEDED")) {
        toast.warning("AI pricing unavailable: spending cap reached. Using market benchmarks.", {
          duration: 8000,
          action: { label: "Manage Cap", onClick: () => window.open("https://ai.studio/spend", "_blank") },
        });
      } else if (err.message?.includes("parse") || err.message?.includes("JSON") || err.message?.includes("json")) {
        toast.warning("AI pricing response could not be read. Using market benchmarks.");
      } else {
        // Surface the real error so the root cause is diagnosable
        const rawMsg =
          err?.error?.message || err?.message || String(err) || "Unknown error";
        console.error("[SmartQuote] AI pricing — unhandled error:", rawMsg, "\nFull:", err);
        toast.warning(`AI unavailable — market benchmark used. (${rawMsg.slice(0, 120)})`, {
          duration: 8000,
        });
      }
    } finally {
      setIsGeneratingAI(false);
    }
  };

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
    const rawValue = e.target.value.replace(/[^\d]/g, "");
    if (rawValue.length <= 10) {
      setPhone(formatPhoneNumber(e.target.value));
    }
  };

  const handleSqClientSelect = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    setSqSelectedClientId(clientId);
    setFirstName(client.firstName || "");
    setLastName(client.lastName || "");
    setEmail(client.email || "");
    setBusinessName(client.businessName || "");
    const raw = client.phone || "";
    const digits = raw.replace(/[^\d]/g, "");
    const formatted =
      digits.length === 10
        ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
        : raw;
    setPhone(formatted);
    const addr = (client as any).serviceAddress || client.address || "";
    setAddress(addr);
    setServiceAddress(addr);
  };

  // Clear stale pricingAnalysis when service selections change.
  // Case 1: $0 pricing from a no-protocol AI run — clear so recommendations take over.
  // Case 2: product-cost-only pricing (no service component) — clear when services are
  //         added so recommendations + product cost can produce correct tiers.
  useEffect(() => {
    if (!pricingAnalysis) return;
    const noServices = selectedServiceSelections.length === 0 && selectedAddOnSelections.length === 0;
    if (pricingAnalysis.recommendedPrice <= 0 && selectedServiceSelections.length > 0) {
      setPricingAnalysis(null);
    } else if (!noServices && pricingAnalysis.recommendedPrice > 0) {
      const svcComponent = pricingAnalysis.recommendedPrice - (pricingAnalysis.totalProductCost || 0);
      if (svcComponent <= 0) setPricingAnalysis(null);
    }
  }, [selectedServiceSelections.length, selectedAddOnSelections.length]);

  const selectedServices = selectedServiceSelections.map(sel => {
    const s = services.find(serv => serv.id === sel.serviceId);
    return { ...s, ...sel };
  }).filter(s => !!s.serviceId);

  const selectedAddOns = selectedAddOnSelections.map(sel => {
    const a = addOns.find(add => add.id === sel.addOnId);
    return { ...a, ...sel };
  }).filter(a => !!a.addOnId);

  const totalMarketPriceValue = useMemo(() => {
    if (manualVehicles.length === 0 || (selectedServiceSelections.length === 0 && selectedAddOnSelections.length === 0)) return 0;

    let descriptionAdjustment = 1.0;
    const desc = jobDescription.toLowerCase();
    const isBiohazard = desc.includes("vomit") || desc.includes("biohazard") || desc.includes("blood") || desc.includes("urine") || desc.includes("feces");
    let baseMarketHourlyRate = quoteType === "insurance" ? 145 : 95;
    if (isBiohazard) baseMarketHourlyRate = 250;

    const sizeMultipliers: Record<string, number> = {
      small: 0.85,
      medium: 1.0,
      large: 1.25,
      extra_large: 1.6
    };

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

    let total = 0;
    manualVehicles.forEach(vehicle => {
      const vehicleId = `${vehicle.year}-${vehicle.make}-${vehicle.model}`;
      const vehicleMult = sizeMultipliers[vehicle.size] || 1.0;
      const vehicleServices = selectedServices.filter(s => s.vehicleId === vehicleId);
      vehicleServices.forEach(service => {
        const estimatedHours = (service.estimatedDuration || 120) / 60;
        total += baseMarketHourlyRate * estimatedHours * vehicleMult * severityMult * intensityMult * complexityMult;
      });
      const vehicleAddOns = selectedAddOns.filter(a => a.vehicleId === vehicleId);
      vehicleAddOns.forEach(addOn => {
        total += addOn.price || 0;
      });
    });

    selectedServices.filter(s => !s.vehicleId).forEach(service => {
        const estimatedHours = (service.estimatedDuration || 120) / 60;
        total += baseMarketHourlyRate * estimatedHours * severityMult * intensityMult * complexityMult;
    });

    selectedAddOns.filter(a => !a.vehicleId).forEach(addOn => {
        total += addOn.price || 0;
    });

    return total;
  }, [manualVehicles, selectedServiceSelections, selectedAddOnSelections, severity, intensity, complexity, jobDescription, quoteType, services, addOns]);

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
          reason: generateRecommendationExplanation({
            serviceName: interiorAddon.name,
            recommendationType: "preventative",
            originalPrice: interiorAddon.price,
            bundlePrice: interiorAddon.price
          }).explanation,
          type: "addon"
        });
      }
    }

    if (manualVehicles.length > 1) {
      upsells.push({
        id: "multi-vehicle-discount",
        name: "Multi-Vehicle Bundle",
        price: -25,
        reason: "Reward loyalty for multiple assets in one job.",
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

  // ── Final price: custom → pricingAnalysis tier → recommendations tier → 0 ──
  // Product costs alone never produce a valid customer quote price.
  const hasServiceProtocol = selectedServiceSelections.length > 0 || selectedAddOnSelections.length > 0;
  const finalPrice = (() => {
    if (isPriceCustomized && customPrice !== null) return customPrice;
    if (pricingAnalysis && pricingAnalysis.recommendedPrice > 0 && hasServiceProtocol) {
      return selectedTier === "low"     ? pricingAnalysis.floorPrice
           : selectedTier === "premium" ? pricingAnalysis.premiumPrice
                                        : pricingAnalysis.recommendedPrice;
    }
    if (recommendations) {
      return selectedTier === "low"     ? recommendations.lowPrice
           : selectedTier === "safe"    ? recommendations.safePrice
           : selectedTier === "premium" ? recommendations.premiumPrice
                                        : recommendations.recommendedPrice;
    }
    return 0;
  })();

  // ── Protocol inference: scan job notes for service keywords ──────────────
  const inferredServiceMatch = useMemo(() => {
    if (selectedServiceSelections.length > 0 || !jobDescription || services.length === 0) return null;
    const lower = jobDescription.toLowerCase();
    // Try direct name match first, then keyword match
    const match = services.find(s => {
      const sName = s.name.toLowerCase();
      return lower.includes(sName) ||
        (sName.includes("ceramic") && (lower.includes("ceramic") || lower.includes("coating") || lower.includes("5yr") || lower.includes("5 yr"))) ||
        (sName.includes("clay") && (lower.includes("clay") || lower.includes("decontam"))) ||
        (sName.includes("interior") && lower.includes("interior")) ||
        (sName.includes("exterior") && lower.includes("exterior")) ||
        (sName.includes("wash") && lower.includes("wash")) ||
        (sName.includes("polish") && lower.includes("polish")) ||
        (sName.includes("detail") && lower.includes("detail")) ||
        (sName.includes("paint correction") && (lower.includes("correction") || lower.includes("swirl") || lower.includes("scratch")));
    });
    return match ?? null;
  }, [jobDescription, services, selectedServiceSelections]);

  const handleApply = () => {
    // Guard: a service protocol is required — product costs alone are not a quote.
    const hasServices = selectedServiceSelections.length > 0 || selectedAddOnSelections.length > 0;

    if (!hasServices && !(isPriceCustomized && customPrice && customPrice > 0)) {
      toast.error("Select at least one service protocol before converting.");
      return;
    }
    if (finalPrice <= 0) {
      toast.error("Cannot convert a $0.00 quote. Select a service protocol or run pricing diagnostics first.");
      return;
    }
    // If no service selected but user intentionally set a custom price, build minimal line items
    const hasPricingData = pricingAnalysis && pricingAnalysis.recommendedPrice > 0;
    if (!recommendations && hasPricingData && hasServices) {
      const productCostTotal = productCosts.reduce((s: number, p: any) => {
        const v = parseFloat(p.totalCost); return s + (isNaN(v) ? 0 : v);
      }, 0);
      const laborCostValue  = pricingAnalysis?.laborTarget ?? 0;
      const overheadValue   = pricingAnalysis?.overhead   ?? 0;
      const internalJobCostValue = productCostTotal + laborCostValue + overheadValue;
      const estimatedProfitValue = finalPrice - internalJobCostValue;
      const marginPercentValue   = finalPrice > 0 ? (estimatedProfitValue / finalPrice) * 100 : 0;

      // Build a single clean line item
      const lineItems: LineItem[] = [{
        serviceName: inferredServiceMatch?.name || jobDescription.split(" ").slice(0, 6).join(" ") || "Professional Detailing Service",
        price: parseFloat(finalPrice.toFixed(2)),
        description: `AI/benchmark-priced detailing service. ${jobDescription}`.slice(0, 200),
        quantity: 1,
        total: parseFloat(finalPrice.toFixed(2)),
        source: "ai",
        protocolAccepted: true,
      }];

      const adminBreakdown: AdminPricingBreakdown = {
        baseServicePrice: 0,
        conditionMultiplier: 1,
        vehicleSizeAdjustment: 0,
        laborCost: parseFloat(laborCostValue.toFixed(2)),
        materialCost: parseFloat(productCostTotal.toFixed(2)),
        travelCost: parseFloat((pricingAnalysis?.travelFee ?? 0).toFixed(2)),
        addonTotal: 0,
        discountTotal: 0,
        aiRecommendedPrice: parseFloat(finalPrice.toFixed(2)),
        selectedTier: isPriceCustomized ? "custom" : selectedTier,
        finalQuoteTotal: parseFloat(finalPrice.toFixed(2)),
        estimatedProfit: parseFloat(estimatedProfitValue.toFixed(2)),
        marginPercent: parseFloat(marginPercentValue.toFixed(2)),
        pricingConfidence: analysisSource === "ai" ? 85 : 60,
        conditionAdjustments: {},
        internalNotes: `Product-cost-only benchmark pricing. Job: ${jobDescription}`,
        source: analysisSource,
      };

      onApply({
        clientId: "",
        clientInfo: { name: `${firstName} ${lastName}`.trim() || "Valued Client", firstName, lastName, email, phone, address: address || serviceAddress, serviceAddress: serviceAddress || address, businessName },
        manualVehicles,
        lineItems,
        notes: jobDescription,
        description: generateHumanDescription(),
        businessName,
        productCosts: productCosts.length > 0 ? [...productCosts] : [],
        pricingAnalysis: pricingAnalysis ?? null,
        quoteSource: "ai",
        adminPricingBreakdown: adminBreakdown,
        clientDisplayPrice: parseFloat(finalPrice.toFixed(2)),
        clientVisibleAddOns: [],
        aiRecommendedPrice: parseFloat(finalPrice.toFixed(2)),
        baseServicePrice: 0,
        laborCost: parseFloat(laborCostValue.toFixed(2)),
        materialCost: parseFloat(productCostTotal.toFixed(2)),
        addonTotal: 0,
        internalJobCost: parseFloat(internalJobCostValue.toFixed(2)),
        finalQuoteTotal: parseFloat(finalPrice.toFixed(2)),
        selectedServiceName: inferredServiceMatch?.name ?? "",
        internalNotes: adminBreakdown.internalNotes,
      });
      return;
    }

    if (!recommendations) return;

    // ─── 1. Compute internal cost totals ───────────────────────────────────
    const productCostTotal = productCosts.reduce((s: number, p: any) => {
      const v = parseFloat(p.totalCost);
      return s + (isNaN(v) ? 0 : v);
    }, 0);

    const addonItems = recommendations.items.filter(i => i.type === "addon");
    const serviceItems = recommendations.items.filter(i => i.type === "service");
    const rawAddonTotal = addonItems.reduce((s: number, i) => s + i.price, 0);
    const rawServiceTotal = serviceItems.reduce((s: number, i) => s + i.price, 0);

    const laborCostValue = pricingAnalysis?.laborTarget ?? 0;
    const overheadValue  = pricingAnalysis?.overhead   ?? 0;
    const internalJobCostValue = productCostTotal + laborCostValue + overheadValue;

    // ─── 2. Determine final AI-recommended customer price ──────────────────
    // Priority: user explicitly typed customPrice → pricingAnalysis tier
    // (which already embeds materialCost) → market-based tier + materialCost
    let aiRecommendedPrice: number;
    if (isPriceCustomized && customPrice !== null) {
      aiRecommendedPrice = customPrice;
    } else if (pricingAnalysis) {
      // Benchmark/AI price already includes totalProductCost in its formula
      aiRecommendedPrice =
        selectedTier === "low"     ? pricingAnalysis.floorPrice
        : selectedTier === "premium" ? pricingAnalysis.premiumPrice
        : pricingAnalysis.recommendedPrice;
    } else {
      // Pure market-based — manually factor in product costs
      const tierMarketPrice =
        selectedTier === "low"     ? recommendations.lowPrice
        : selectedTier === "safe"    ? recommendations.safePrice
        : selectedTier === "premium" ? recommendations.premiumPrice
        : recommendations.recommendedPrice;
      aiRecommendedPrice = tierMarketPrice + productCostTotal;
    }

    // ─── 3. Build CLEAN client-facing line items ───────────────────────────
    // Services: proportionally scale raw service prices to match the service
    // portion of aiRecommendedPrice (= total minus add-ons), preserving names.
    // Add-ons stay at their actual price as separate lines.
    const servicePortionOfFinalPrice = aiRecommendedPrice - rawAddonTotal;

    const lineItems: LineItem[] = serviceItems.map(item => {
      const scaledPrice = rawServiceTotal > 0
        ? parseFloat(((item.price / rawServiceTotal) * servicePortionOfFinalPrice).toFixed(2))
        : parseFloat((servicePortionOfFinalPrice / serviceItems.length).toFixed(2));
      return {
        serviceName: item.name,
        price: scaledPrice,
        description: recommendations.explanation || "",
        quantity: 1,
        total: scaledPrice,
        source: "ai",
        protocolAccepted: true,
      };
    });

    // Add-on line items — kept at their actual price (client-visible, optional upsell)
    addonItems.forEach(addOn => {
      lineItems.push({
        serviceName: addOn.name,
        price: addOn.price,
        description: "Optional add-on service",
        quantity: 1,
        total: addOn.price,
        source: "addon",
        protocolAccepted: true,
      });
    });

    // ─── 4. Build admin pricing breakdown (internal, never shown to client) ─
    const baseServicePrice = rawServiceTotal;
    const finalQuoteTotal  = aiRecommendedPrice;
    const estimatedProfitValue = finalQuoteTotal - internalJobCostValue;
    const marginPercentValue   = finalQuoteTotal > 0 ? (estimatedProfitValue / finalQuoteTotal) * 100 : 0;

    // Collect condition flags that fired
    const conditionAdjMap: Record<string, number> = {};
    const desc = jobDescription.toLowerCase();
    if (desc.includes("mold") || desc.includes("mildew"))        conditionAdjMap.mold_mildew = 0.45;
    if (desc.includes("smoke") || desc.includes("nicotine"))     conditionAdjMap.smoke_nicotine = 0.35;
    if (desc.includes("biohazard") || desc.includes("vomit"))    conditionAdjMap.biohazard = 0.6;
    if (desc.includes("pet hair") || desc.includes("dog hair"))  conditionAdjMap.pet_hair = 0.2;
    if (desc.includes("stain") || desc.includes("spill"))        conditionAdjMap.stains = 0.15;
    if (desc.includes("heavy") || desc.includes("extreme"))      conditionAdjMap.heavy_soiling = 0.25;
    if (desc.includes("scratch") || desc.includes("swirl"))      conditionAdjMap.paint_correction = 0.3;

    const avgVehicleSizeMult = manualVehicles.reduce((s, v) => {
      const m: Record<string, number> = { small: 0.85, medium: 1.0, large: 1.25, extra_large: 1.6 };
      return s + ((m[v.size] || 1.0) - 1.0);
    }, 0) / Math.max(manualVehicles.length, 1);
    const vehicleSizeAdjValue = rawServiceTotal * avgVehicleSizeMult;

    const condMult = (1 + (severity - 3) * 0.25) * (1 + Object.values(conditionAdjMap).reduce((s, v) => s + v, 0));

    const adminBreakdown: AdminPricingBreakdown = {
      baseServicePrice,
      conditionMultiplier:    parseFloat(condMult.toFixed(4)),
      vehicleSizeAdjustment:  parseFloat(vehicleSizeAdjValue.toFixed(2)),
      laborCost:              parseFloat(laborCostValue.toFixed(2)),
      materialCost:           parseFloat(productCostTotal.toFixed(2)),
      travelCost:             parseFloat((pricingAnalysis?.travelFee ?? 0).toFixed(2)),
      addonTotal:             parseFloat(rawAddonTotal.toFixed(2)),
      discountTotal:          0,
      aiRecommendedPrice:     parseFloat(aiRecommendedPrice.toFixed(2)),
      selectedTier:           isPriceCustomized ? "custom" : selectedTier,
      finalQuoteTotal:        parseFloat(finalQuoteTotal.toFixed(2)),
      estimatedProfit:        parseFloat(estimatedProfitValue.toFixed(2)),
      marginPercent:          parseFloat(marginPercentValue.toFixed(2)),
      pricingConfidence:      analysisSource === "ai" ? 85 : 60,
      conditionAdjustments:   conditionAdjMap,
      internalNotes:          recommendations.explanation,
      source:                 analysisSource,
    };

    // ─── 5. Client-visible add-ons list ──────────────────────────────────
    const clientVisibleAddOns: ClientVisibleAddOn[] = addonItems.map(a => ({
      id: `addon_${a.name.replace(/\s+/g, "_").toLowerCase()}`,
      name: a.name,
      price: a.price,
      selected: true,
    }));

    // ─── 6. Primary selected service metadata ─────────────────────────────
    const primaryService = selectedServices[0];

    // ─── 7. Fire onApply ──────────────────────────────────────────────────
    onApply({
      clientId: "",
      clientInfo: {
        name: `${firstName} ${lastName}`.trim() || "Valued Client",
        firstName,
        lastName,
        email,
        phone,
        address: address || serviceAddress,
        serviceAddress: serviceAddress || address,
        businessName,
      },
      manualVehicles,
      lineItems,
      notes: jobDescription,
      description: generateHumanDescription(),
      businessName,
      productCosts: productCosts.length > 0 ? [...productCosts] : [],
      pricingAnalysis: pricingAnalysis ?? null,
      // AI enrichment
      quoteSource: "ai",
      adminPricingBreakdown: adminBreakdown,
      clientDisplayPrice: parseFloat(finalQuoteTotal.toFixed(2)),
      clientVisibleAddOns,
      aiRecommendedPrice: parseFloat(aiRecommendedPrice.toFixed(2)),
      baseServicePrice:   parseFloat(baseServicePrice.toFixed(2)),
      laborCost:          parseFloat(laborCostValue.toFixed(2)),
      materialCost:       parseFloat(productCostTotal.toFixed(2)),
      addonTotal:         parseFloat(rawAddonTotal.toFixed(2)),
      internalJobCost:    parseFloat(internalJobCostValue.toFixed(2)),
      finalQuoteTotal:    parseFloat(finalQuoteTotal.toFixed(2)),
      selectedServiceName: primaryService?.name ?? "",
      internalNotes: recommendations.explanation,
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
              <p className="text-[10px] text-white/60 font-black uppercase tracking-[0.2em] mt-1">Market-Based Pricing & Analysis</p>
              </div>
              <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-xl border border-white/10">
                <Button
                  variant="ghost"
                  className={cn("rounded-lg text-[10px] font-black uppercase tracking-widest px-4 h-8 transition-all", quoteType === "retail" ? "bg-primary text-white" : "text-white/60 hover:text-white")}
                  onClick={() => setQuoteType("retail")}
                >
                  Retail Customer
                </Button>
                <Button
                  variant="ghost"
                  className={cn("rounded-lg text-[10px] font-black uppercase tracking-widest px-4 h-8 transition-all", quoteType === "insurance" ? "bg-blue-600 text-white" : "text-white/60 hover:text-white")}
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
              <h3 className="text-xs font-black text-[#A0A0A0] uppercase tracking-[0.2em] flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-primary" />
                Target Entity Information
              </h3>
              {clients.length > 0 && (
                <div className="space-y-2 pb-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">
                    Auto-fill from existing client (optional)
                  </Label>
                  <SearchableSelector
                    options={clients.map(c => ({
                      value: c.id,
                      label: c.businessName || `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Unnamed Client",
                      description: [c.email, c.phone].filter(Boolean).join(" • ") || "No contact info",
                    }))}
                    value={sqSelectedClientId}
                    onSelect={handleSqClientSelect}
                    placeholder="Search existing clients to auto-fill address..."
                  />
                  {!sqSelectedClientId && (
                    <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">
                      Or enter manually below
                    </p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white">First Name</Label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white">Last Name</Label>
                  <Input 
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white">Business Name (Optional)</Label>
                  <Input 
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Acme Corp"
                    className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white">Email Address</Label>
                  <Input 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white">Phone Number</Label>
                  <Input 
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="(555) 000-0000"
                    className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                  />
                </div>
              </div>
              <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white">Customer Invoice Address</Label>
                </div>
                <AddressInput 
                  defaultValue={serviceAddress || address}
                  onAddressSelect={(addr) => setServiceAddress(addr)}
                  placeholder="Search for invoice address..."
                  className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                />
              </div>
            </div>

            {/* Vehicle Selection Section */}
            <div className="space-y-6 pt-6 border-t border-white/5">
              <h3 className="text-xs font-black text-[#A0A0A0] uppercase tracking-[0.2em] flex items-center gap-2">
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
                    <Label className="text-[10px] font-black uppercase tracking-widest text-white">Vehicle Size</Label>
                    <Select value={currentVehicle.size} onValueChange={(v) => setCurrentVehicle(prev => ({ ...prev, size: v }))}>
                      <SelectTrigger className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#121212] border-white/10 text-white">
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
                    className="bg-primary hover:opacity-90 text-white font-black h-12 rounded-xl uppercase tracking-widest text-[10px]"
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
                      <button onClick={() => removeVehicle(idx)} className="text-white hover:text-red-500 transition-colors p-1 bg-white/10 rounded-md">
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
                <Label className="font-black uppercase tracking-widest text-[10px] text-white">Service Protocols</Label>
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
                                  isSelected ? "bg-primary text-white border-primary" : "bg-white/5 text-white/60 border-white/10"
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
                <Label className="font-black uppercase tracking-widest text-[10px] text-white">Add-On Protocols</Label>
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
                                  isSelected ? "bg-primary text-white border-primary" : "bg-white/5 text-white/60 border-white/10"
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:col-span-1">
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">Job Severity</Label>
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
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">Labor Intensity</Label>
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
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">Service Complexity</Label>
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

                {/* Product Cost Area — with catalog dropdown */}
                <div className="space-y-6 md:col-span-1">
                  <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary" />
                    Internal Job Costs (Products)
                  </h3>

                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                    {productCosts.length > 0 ? (
                      <div className="space-y-3">
                        {productCosts.map((cost) => (
                          <div key={cost.id} className="space-y-2 bg-black/40 p-3 rounded-xl border border-white/5">
                            {/* Row 1: Catalog picker + manual name */}
                            <div className="flex gap-2 items-center">
                              <div className="flex-1">
                                <Select
                                  value={cost.catalogId || "__manual__"}
                                  onValueChange={(val) => {
                                    if (val === "__manual__") {
                                      handleUpdateProductCost(cost.id, { catalogId: null });
                                      return;
                                    }
                                    const cat = catalogProducts.find(c => c.id === val);
                                    if (cat) {
                                      handleUpdateProductCost(cost.id, {
                                        catalogId: cat.id,
                                        name: cat.productName,
                                        category: cat.category,
                                        unitCost: cat.defaultUnitCost,
                                        quantity: cat.defaultQuantity || 1,
                                        source: "catalog",
                                      });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-[10px] bg-transparent border-white/10 text-white">
                                    <SelectValue placeholder={catalogLoading ? "Loading…" : "Select from catalog"} />
                                  </SelectTrigger>
                                  <SelectContent className="bg-[#0B0B0B] border-white/10 text-white">
                                    <SelectItem value="__manual__" className="text-[10px] text-white/50 focus:bg-white/5">
                                      <span className="flex items-center gap-2">
                                        <Plus className="w-3 h-3" /> Enter manually
                                      </span>
                                    </SelectItem>
                                    {catalogProducts.map(cat => (
                                      <SelectItem key={cat.id} value={cat.id} className="text-[10px] focus:bg-primary/20 focus:text-primary">
                                        {cat.productName}
                                        <span className="ml-2 text-white/30">${cat.defaultUnitCost}/{cat.unitType}</span>
                                      </SelectItem>
                                    ))}
                                    {catalogProducts.length === 0 && !catalogLoading && (
                                      <div className="px-2 py-1.5 text-[9px] text-white/20 uppercase tracking-widest">
                                        No catalog products — add in Settings → Product Catalog
                                      </div>
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteProductCost(cost.id)}
                                className="text-white hover:text-red-500 bg-white/10 p-1.5 rounded-md transition-colors shrink-0"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            {/* Row 2: Manual name (shown when no catalog item selected or overriding) */}
                            <Input
                              placeholder="Product / material name"
                              value={cost.name}
                              onChange={(e) => handleUpdateProductCost(cost.id, { name: e.target.value, catalogId: null })}
                              className="h-8 text-[10px] bg-transparent border-white/10 text-white"
                            />
                            {/* Row 3: Qty × unit cost = total */}
                            <div className="grid grid-cols-3 gap-2 items-center">
                              <div>
                                <p className="text-[8px] text-white/30 font-black uppercase tracking-widest mb-1">Qty</p>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="1"
                                  value={cost.quantity}
                                  onFocus={(e) => { if (parseFloat(e.target.value) === 1) e.target.value = ""; }}
                                  onBlur={(e) => { if (e.target.value === "") handleUpdateProductCost(cost.id, { quantity: 1 }); }}
                                  onChange={(e) => handleUpdateProductCost(cost.id, { quantity: parseFloat(e.target.value) || 1 })}
                                  className="h-8 text-[10px] bg-transparent border-white/10 text-white"
                                />
                              </div>
                              <div>
                                <p className="text-[8px] text-white/30 font-black uppercase tracking-widest mb-1">Unit Cost</p>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="0.00"
                                  value={cost.unitCost}
                                  onFocus={(e) => { if (parseFloat(e.target.value) === 0) e.target.value = ""; }}
                                  onBlur={(e) => { if (e.target.value === "") handleUpdateProductCost(cost.id, { unitCost: 0 }); }}
                                  onChange={(e) => handleUpdateProductCost(cost.id, { unitCost: parseFloat(e.target.value) || 0 })}
                                  className="h-8 text-[10px] bg-transparent border-white/10 text-white"
                                />
                              </div>
                              <div className="text-center">
                                <p className="text-[8px] text-white/30 font-black uppercase tracking-widest mb-1">Total</p>
                                <span className="text-[11px] font-black text-primary">{formatCurrency(cost.totalCost || 0)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-between items-center py-2 border-t border-white/5">
                          <span className="text-[9px] font-black uppercase text-white/60 tracking-widest">Total internal cost</span>
                          <span className="text-xs font-black text-primary">{formatCurrency(productCosts.reduce((sum, p) => sum + (parseFloat((p.totalCost || 0).toFixed(2))), 0))}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-[9px] font-bold text-white/20 uppercase tracking-widest">
                        No materials recorded
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddProductCost}
                      className="w-full h-8 text-[9px] font-black uppercase tracking-widest border-white/10 hover:bg-white/5 text-white"
                    >
                      <Plus className="w-3 h-3 mr-2" />
                      Add Detail Product Cost
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-black uppercase tracking-widest text-[10px] text-white">Job Description / Notes</Label>
                <Textarea 
                  placeholder="Describe the specific job details for AI pricing diagnostics..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  className="bg-white/5 border-white/10 rounded-2xl min-h-[100px] text-white font-medium"
                />
                <Button
                  onClick={generateAIEstimate}
                  disabled={isGeneratingAI || manualVehicles.length === 0 || (selectedServiceSelections.length === 0 && selectedAddOnSelections.length === 0)}
                  className="w-full h-12 bg-black border border-primary/40 text-primary hover:bg-primary/5 font-black rounded-xl uppercase tracking-widest text-[10px] mt-4"
                >
                  {isGeneratingAI ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Run Profit-Protected AI Diagnostics
                </Button>
                {manualVehicles.length === 0 && (
                  <p className="text-[9px] text-amber-400/70 font-bold uppercase tracking-widest text-center -mt-1">
                    Add an asset above first, then click Run Diagnostics
                  </p>
                )}
                {manualVehicles.length > 0 && selectedServiceSelections.length === 0 && selectedAddOnSelections.length === 0 && (
                  <p className="text-[9px] text-amber-400/70 font-bold uppercase tracking-widest text-center -mt-1">
                    Select a service protocol above first
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

            {recommendations && recommendations.upsells.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-xs font-black text-[#A0A0A0] uppercase tracking-[0.2em] flex items-center gap-2">
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
                      <p className="text-[10px] text-white font-bold leading-relaxed">{upsell.reason}</p>
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
        <Card className="border-none shadow-2xl bg-[#121212] rounded-3xl overflow-hidden sticky top-8">
          <CardHeader className="bg-black/40 border-b border-white/5 p-8">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter">Market Analysis</CardTitle>
                <p className="text-[10px] text-white font-black uppercase tracking-[0.2em] mt-1">AI-Powered Market Estimate</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-glow-blue">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <p className="text-[10px] font-black text-white uppercase tracking-widest">Selected Price Option</p>
                  <Badge className={cn(
                    "border-none text-[9px] font-black uppercase tracking-widest",
                    isPriceCustomized ? "bg-[#0A4DFF]/20 text-[#0A4DFF]" : "bg-primary/20 text-primary"
                  )}>
                    {isPriceCustomized ? "Customized" : selectedTier.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black text-white tracking-tighter">{formatCurrency(finalPrice)}</span>
                </div>
              </div>

              {pricingAnalysis ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className={cn("w-3 h-3", analysisSource === "ai" ? "text-primary" : "text-amber-400")} />
                    <span className={cn("text-[10px] font-black uppercase tracking-widest", analysisSource === "ai" ? "text-primary" : "text-amber-400")}>
                      {analysisSource === "ai" ? "AI-Powered Market Estimate" : "Market Benchmark Estimate"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTier("low");
                        setIsPriceCustomized(false);
                        setCustomPrice(null);
                      }}
                      className={cn(
                        "p-3 rounded-xl border transition-all text-center",
                        selectedTier === "low" && !isPriceCustomized ? "bg-amber-500/20 border-amber-500/40 ring-1 ring-amber-500" : "bg-white/5 border-white/5 hover:bg-white/10"
                      )}
                    >
                      <p className="text-[8px] font-black text-amber-500 uppercase tracking-widest mb-1">Floor</p>
                      <p className="text-xs font-black text-white">{formatCurrency(pricingAnalysis.floorPrice)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTier("recommended");
                        setIsPriceCustomized(false);
                        setCustomPrice(null);
                      }}
                      className={cn(
                        "p-3 rounded-xl border transition-all text-center",
                        selectedTier === "recommended" && !isPriceCustomized ? "bg-primary/20 border-primary ring-1 ring-primary" : "bg-white/5 border-white/5 hover:bg-white/10"
                      )}
                    >
                      <p className="text-[8px] font-black text-primary uppercase tracking-widest mb-1">{analysisSource === "ai" ? "AI-Rec" : "Rec"}</p>
                      <p className="text-xs font-black text-white">{formatCurrency(pricingAnalysis.recommendedPrice)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTier("premium");
                        setIsPriceCustomized(false);
                        setCustomPrice(null);
                      }}
                      className={cn(
                        "p-3 rounded-xl border transition-all text-center",
                        selectedTier === "premium" && !isPriceCustomized ? "bg-purple-500/20 border-purple-500/40 ring-1 ring-purple-500" : "bg-white/5 border-white/5 hover:bg-white/10"
                       )}
                    >
                      <p className="text-[8px] font-black text-purple-400 uppercase tracking-widest mb-1">Premium</p>
                      <p className="text-xs font-black text-white">{formatCurrency(pricingAnalysis.premiumPrice)}</p>
                    </button>
                  </div>
                  
                  {(() => {
                    const actualCost = productCosts.reduce((s: number, p: any) => s + (parseFloat(p.totalCost) || 0), 0);
                    // pricingAnalysis prices already bake in totalProductCost via computeBenchmarkPricing / AI.
                    // Net profit = final price minus material costs (labor/overhead baked into margin targets).
                    const liveProfit  = finalPrice - actualCost;
                    const liveMargin  = finalPrice > 0 ? (liveProfit / finalPrice) * 100 : 0;
                    return (
                      <>
                        {actualCost > 0 && (
                          <div className="flex items-center gap-1.5 px-1">
                            <Package className="w-3 h-3 text-amber-400 shrink-0" />
                            <p className="text-[9px] text-amber-400 font-bold uppercase tracking-widest">
                              Price includes {formatCurrency(actualCost)} in product costs
                            </p>
                          </div>
                        )}
                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
                          <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                            <span className="text-white/60">Product Cost</span>
                            <span className="text-white">{formatCurrency(actualCost)}</span>
                          </div>
                          <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                            <span className="text-white">Net After Product Costs</span>
                            <span className={liveProfit >= 0 ? "text-primary" : "text-red-400"}>{formatCurrency(liveProfit)}</span>
                          </div>
                          <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                            <span className="text-white">Gross Margin</span>
                            <span className={liveMargin >= 0 ? "text-primary" : "text-red-400"}>{liveMargin.toFixed(1)}%</span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTier("low");
                        setIsPriceCustomized(false);
                        setCustomPrice(null);
                      }}
                      className={cn(
                        "p-3 rounded-xl border transition-all text-center",
                        selectedTier === "low" && !isPriceCustomized ? "bg-primary/20 border-primary ring-1 ring-primary" : "bg-white/5 border-white/5 hover:bg-white/10"
                      )}
                    >
                      <p className="text-[8px] font-black text-white uppercase tracking-widest mb-1">Low</p>
                      <p className="text-xs font-black text-white">{formatCurrency(recommendations?.lowPrice || 0)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTier("safe");
                        setIsPriceCustomized(false);
                        setCustomPrice(null);
                      }}
                      className={cn(
                        "p-3 rounded-xl border transition-all text-center",
                        selectedTier === "safe" && !isPriceCustomized ? "bg-primary/20 border-primary ring-1 ring-primary" : "bg-white/5 border-white/5 hover:bg-white/10"
                      )}
                    >
                      <p className="text-[8px] font-black text-primary uppercase tracking-widest mb-1">Safe</p>
                      <p className="text-xs font-black text-white">{formatCurrency(recommendations?.safePrice || 0)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTier("premium");
                        setIsPriceCustomized(false);
                        setCustomPrice(null);
                      }}
                      className={cn(
                        "p-3 rounded-xl border transition-all text-center",
                        selectedTier === "premium" && !isPriceCustomized ? "bg-primary/20 border-primary ring-1 ring-primary" : "bg-white/5 border-white/5 hover:bg-white/10"
                      )}
                    >
                      <p className="text-[8px] font-black text-white uppercase tracking-widest mb-1">Premium</p>
                      <p className="text-xs font-black text-white">{formatCurrency(recommendations?.premiumPrice || 0)}</p>
                    </button>
                  </div>
                  {(() => {
                    const actualCost = productCosts.reduce((s: number, p: any) => s + (parseFloat(p.totalCost) || 0), 0);
                    if (actualCost <= 0) return null;
                    // Market-only tiers don't include product costs — show cost-protected price and flag it
                    const costProtectedPrice = finalPrice + actualCost;
                    const netProfit = finalPrice - actualCost;
                    const netMargin = finalPrice > 0 ? (netProfit / finalPrice) * 100 : 0;
                    return (
                      <div className="space-y-2 mt-1">
                        <div className="flex items-start gap-1.5 px-1">
                          <AlertCircle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-[9px] text-amber-400 font-bold uppercase tracking-widest leading-relaxed">
                            Market rate does not include your {formatCurrency(actualCost)} in product costs. Run AI Diagnostics for cost-protected pricing.
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                          <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                            <span className="text-white/60">Product Cost</span>
                            <span className="text-white">{formatCurrency(actualCost)}</span>
                          </div>
                          <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                            <span className="text-white">Cost-Protected Price</span>
                            <span className="text-amber-400">{formatCurrency(costProtectedPrice)}</span>
                          </div>
                          <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                            <span className="text-white/60">Net If Using Market Rate</span>
                            <span className={netProfit >= 0 ? "text-white/60" : "text-red-400"}>{formatCurrency(netProfit)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="bg-white/5 border-white/10 text-white font-black uppercase tracking-widest text-[10px] h-12 rounded-xl hover:bg-white/10 disabled:opacity-50"
                disabled={!hasServiceProtocol}
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
                <DialogContent className="bg-[#121212] border-white/10 text-white">
                  <DialogHeader>
                    <DialogTitle className="text-white font-black uppercase">Manual Price Override</DialogTitle>
                  </DialogHeader>
                  <div className="py-6 space-y-4">
                    <Label className="text-white font-black uppercase tracking-widest text-[10px]">Set Custom Total Value</Label>
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
                      className="w-full bg-primary hover:opacity-90 text-white font-black h-12 rounded-xl uppercase tracking-widest"
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
                <p className="text-[11px] text-[#FFFFFF] font-medium leading-relaxed overflow-hidden">
                  {recommendations.explanation}
                </p>
              </div>
            )}

            <div className="space-y-4 pt-6 border-t border-white/5">
              <p className="text-[10px] font-black text-white uppercase tracking-widest">Market Protocol Breakdown</p>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                {recommendations?.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm">
                    <span className="text-white font-bold truncate mr-4">{item.name}</span>
                    <span className="text-white font-black">{formatCurrency(item.price)}</span>
                  </div>
                ))}
                {(!recommendations || recommendations.items.length === 0) && (
                  <p className="text-[10px] text-white font-black uppercase tracking-widest italic text-center py-4">No protocols selected.</p>
                )}
              </div>
            </div>

            <Button
              className="w-full bg-primary hover:bg-[#2A6CFF] text-white font-black h-14 rounded-2xl uppercase tracking-tight text-sm shadow-glow-blue transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center px-4"
              disabled={
                manualVehicles.length === 0 ||
                finalPrice <= 0 ||
                (selectedServiceSelections.length === 0 && selectedAddOnSelections.length === 0 && !(isPriceCustomized && customPrice && customPrice > 0))
              }
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

            {manualVehicles.length > 0 && selectedServiceSelections.length === 0 && selectedAddOnSelections.length === 0 && (
              <div className="flex items-start gap-2 p-4 bg-yellow-500/10 rounded-2xl border border-yellow-500/20">
                <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[9px] text-yellow-500 font-black uppercase tracking-widest leading-relaxed">
                    No service protocol selected.
                  </p>
                  {inferredServiceMatch ? (
                    <p className="text-[9px] text-yellow-400 font-bold leading-relaxed">
                      Suggested match from notes: <span className="font-black">{inferredServiceMatch.name}</span> —{" "}
                      <button
                        type="button"
                        className="underline font-black text-primary hover:text-primary/80"
                        onClick={() => setSelectedServiceSelections([{ serviceId: inferredServiceMatch.id }])}
                      >
                        Select it
                      </button>
                    </p>
                  ) : (
                    <p className="text-[9px] text-yellow-400 font-bold leading-relaxed">
                      Select at least one service protocol before generating pricing.
                      {pricingAnalysis && finalPrice > 0 && " Benchmark pricing from product costs is available — you may still convert."}
                    </p>
                  )}
                </div>
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
  const [activeTab, setActiveTab] = useState("smart");
  const [manualVehicles, setManualVehicles] = useState<{ year: string; make: string; model: string; size: string }[]>([]);
  const [smartQuoteNotes, setSmartQuoteNotes] = useState("");
  const [quoteDescription, setQuoteDescription] = useState("");
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  
  // Form state
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [manualClientInfo, setManualClientInfo] = useState({
    name: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    serviceAddress: "",
    businessName: ""
  });
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ year: "", make: "", model: "", vin: "", size: "medium" as any });
  const [lineItems, setLineItems] = useState<LineItem[]>([{ 
    serviceName: "", 
    price: 0, 
    description: "", 
    quantity: 1, 
    total: 0, 
    source: "manual", 
    protocolAccepted: true 
  }]);
  const [attachedFormIds, setAttachedFormIds] = useState<string[]>([]);
  const [formTemplates, setFormTemplates] = useState<any[]>([]);
  const [travelFeeAmount, setTravelFeeAmount] = useState(0);
  const [customFees, setCustomFees] = useState<CustomFee[]>([]);
  const [productCosts, setProductCosts] = useState<any[]>([]);
  const [quotePricingAnalysis, setQuotePricingAnalysis] = useState<PricingAnalysis | null>(null);
  const [formsDropdownOpen, setFormsDropdownOpen] = useState(false);
  // AI quote enrichment state
  const [quoteSource, setQuoteSource] = useState<"standard" | "ai">("standard");
  const [adminPricingBreakdown, setAdminPricingBreakdown] = useState<AdminPricingBreakdown | null>(null);
  const [clientDisplayPrice, setClientDisplayPrice] = useState<number | null>(null);
  const [clientVisibleAddOns, setClientVisibleAddOns] = useState<ClientVisibleAddOn[]>([]);
  const [aiRecommendedPrice, setAiRecommendedPrice] = useState<number | null>(null);
  const [selectedServiceName, setSelectedServiceName] = useState("");

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
      name: client.businessName || `${client.firstName} ${client.lastName}`.trim(),
      firstName: client.firstName || "",
      lastName: client.lastName || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      serviceAddress: client.address || "",
      businessName: client.businessName || ""
    });
    setShowClientSuggestions(false);
  };

  const fetchQuotesData = async (showToast = false) => {
    // Check cache first if not performing a manual sync
    if (!showToast) {
      const cached = sessionStorage.getItem('quotes_cache_data');
      const cacheTime = sessionStorage.getItem('quotes_cache_time');
      const now = Date.now();
      
      if (cached && cacheTime && now - Number(cacheTime) < 5 * 60 * 1000) { // 5 min cache
        try {
          const parsed = JSON.parse(cached);
          setQuotes(parsed.quotes);
          setClients(parsed.clients);
          setServices(parsed.services);
          setAddOns(parsed.addOns);
          setFormTemplates(parsed.formTemplates);
          setInvoices(parsed.invoices);
          setAppointments(parsed.appointments);
          setSettings(parsed.settings);
          setLoading(false);
          return;
        } catch (e) {
          console.warn("[Quotes] Cache parse failed", e);
        }
      }
    }

    if (showToast) toast.loading("Syncing Estimates...", { id: "sync-quotes" });
    setLoading(true);
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

      const quotesData = quotesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quote));
      const clientsData = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      const servicesData = servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service));
      const addonsData = addonsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const formsData = formsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const invoicesData = invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      const apptsData = appointmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      const businessSettings = settingsSnap.exists() ? (settingsSnap.data() as BusinessSettings) : null;

      setQuotes(quotesData);
      setClients(clientsData);
      setServices(servicesData);
      setAddOns(addonsData);
      setFormTemplates(formsData);
      setInvoices(invoicesData);
      setAppointments(apptsData);
      if (businessSettings) setSettings(businessSettings);
      
      // Update cache
      sessionStorage.setItem('quotes_cache_data', JSON.stringify({
        quotes: quotesData,
        clients: clientsData,
        services: servicesData,
        addOns: addonsData,
        formTemplates: formsData,
        invoices: invoicesData,
        appointments: apptsData,
        settings: businessSettings
      }));
      sessionStorage.setItem('quotes_cache_time', Date.now().toString());

      if (showToast) toast.success("Estimates Synchronized", { id: "sync-quotes" });
    } catch (error: any) {
      console.error("Error fetching quotes data:", error);
      if (error?.message?.includes("Quota limit exceeded")) {
        toast.error("Quotes Sync Failed: Quota exceeded");
      } else if (showToast) {
        toast.error("Sync Failed", { id: "sync-quotes" });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    fetchQuotesData();
  }, [profile, authLoading]);

  // Fetch vehicles when client is selected
  useEffect(() => {
    if (!selectedClientId) {
      setAllVehicles([]);
      return;
    }
    const q = query(collection(db, "vehicles"), where("clientId", "==", selectedClientId));
    const unsubscribe = onSnapshot(q, (snap) => {
      setAllVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle)));
    }, (error: any) => {
      if (error?.code === 'cancelled' || error?.message?.includes('CANCELLED') || error?.message?.includes('idle stream')) {
        return; // Ignore idle stream disconnects
      }
      console.error("Error fetching vehicles for selected client in quotes:", error);
    });
    return () => unsubscribe();
  }, [selectedClientId]);

  useEffect(() => {
    if (loading) return;
    if (location.state?.lead) {
      const lead = location.state.lead;
      setActiveLeadId(lead.id);
      setIsAddDialogOpen(true);
      setManualClientInfo({
        name: lead.name,
        firstName: lead.name.split(' ')[0] || "",
        lastName: lead.name.split(' ').slice(1).join(' ') || "",
        email: lead.email || "",
        phone: lead.phone || "",
        address: lead.address || "",
        serviceAddress: lead.address || "",
        businessName: ""
      });
      setSmartQuoteNotes(lead.notes || "");
      // Clear state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname, loading]);

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { 
      serviceName: "", 
      price: 0, 
      description: "", 
      quantity: 1, 
      total: 0, 
      source: "manual", 
      protocolAccepted: true 
    }]);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (index: number, field: keyof LineItem, value: any) => {
    const newItems = [...lineItems];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === "price" || field === "quantity") {
      newItems[index].total = (Number(newItems[index].price) || 0) * (Number(newItems[index].quantity) || 1);
    }
    setLineItems(newItems);
  };

  const calculateTotal = () => {
    const lineItemsTotal = lineItems.reduce((sum, item) => sum + ((Number(item.price) || 0) * (item.quantity || 1)), 0);
    const customFeesTotal = (customFees || []).reduce((acc, f) => acc + (f.amount || 0), 0);
    return lineItemsTotal + (travelFeeAmount || 0) + customFeesTotal;
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

    // Normalize product costs: ensure numeric values, provide safe fallback names, drop zero-cost blank lines
    const normalizedProductCosts = productCosts
      .map((p: any) => ({
        id: p.id || `pc_${Math.random().toString(36).substr(2, 9)}`,
        name: (p.name && p.name.toString().trim()) || (p.productName && p.productName.toString().trim()) || "Detail Product Cost",
        productName: (p.productName && p.productName.toString().trim()) || (p.name && p.name.toString().trim()) || "Detail Product Cost",
        quantity: isNaN(parseFloat(p.quantity)) ? 1 : parseFloat(p.quantity),
        unitCost: isNaN(parseFloat(p.unitCost)) ? 0 : parseFloat(p.unitCost),
        totalCost: isNaN(parseFloat(p.totalCost)) ? 0 : parseFloat(p.totalCost),
        category: p.category || "misc",
        costType: p.costType || "must_buy",
        associatedServiceId: p.associatedServiceId || null,
        associatedServiceName: p.associatedServiceName || null,
        notes: p.notes || null,
      }))
      // Keep lines that have a real cost OR a real name (don't silently drop named zero-cost products)
      .filter((p: any) => p.totalCost > 0 || (p.name && p.name !== "Detail Product Cost"));

    const totalProductCost = parseFloat(
      normalizedProductCosts.reduce((sum: number, p: any) => sum + (p.totalCost || 0), 0).toFixed(2)
    );

    const quoteTotal = calculateTotal();
    // internalJobCost = product costs + any labor overhead if available from pricingAnalysis
    const laborOverhead = quotePricingAnalysis
      ? (quotePricingAnalysis.laborTarget || 0) + (quotePricingAnalysis.overhead || 0)
      : 0;
    const internalJobCost = parseFloat((totalProductCost + laborOverhead).toFixed(2));
    const estimatedProfit = parseFloat((quoteTotal - internalJobCost).toFixed(2));
    const estimatedMarginPercent = quoteTotal > 0
      ? parseFloat(((estimatedProfit / quoteTotal) * 100).toFixed(2))
      : 0;

    const quoteData: any = {
      clientId: selectedClientId || undefined,
      clientName: manualClientInfo.name || `${manualClientInfo.firstName} ${manualClientInfo.lastName}`.trim() || manualClientInfo.businessName || "Valued Client",
      clientFirstName: manualClientInfo.firstName,
      clientLastName: manualClientInfo.lastName,
      clientEmail: manualClientInfo.email,
      clientPhone: manualClientInfo.phone,
      clientAddress: manualClientInfo.address,
      serviceAddress: manualClientInfo.serviceAddress || manualClientInfo.address,
      businessName: manualClientInfo.businessName,
      description: quoteDescription,
      isPotentialClient: !selectedClientId,
      vehicles,
      lineItems: lineItems.filter(item => item.serviceName),
      total: quoteTotal,
      travelFeeAmount: travelFeeAmount,
      customFees: customFees,
      status: editingQuote?.status || "draft",
      attachedFormIds,
      // --- Internal cost fields (admin-only, never customer-facing) ---
      productCosts: normalizedProductCosts,
      totalProductCost,
      internalJobCost,
      estimatedProfit,
      estimatedMarginPercent,
      pricingAnalysis: quotePricingAnalysis ?? null,
      // --- AI quote provenance & enrichment ---
      quoteSource,
      adminPricingBreakdown: adminPricingBreakdown ?? null,
      clientDisplayPrice: clientDisplayPrice ?? quoteTotal,
      clientVisibleAddOns,
      aiRecommendedPrice: aiRecommendedPrice ?? null,
      selectedServiceName: selectedServiceName || null,
      finalQuoteTotal: quoteTotal,
      pricingConfidence: adminPricingBreakdown?.pricingConfidence ?? null,
      internalNotes: adminPricingBreakdown?.internalNotes || null,
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

      // Invalidate cache
      sessionStorage.removeItem('quotes_cache_data');
      sessionStorage.removeItem('quotes_cache_time');

      setIsAddDialogOpen(false);
      setEditingQuote(null);
      resetForm();
      fetchQuotesData(); // Refresh data manually
    } catch (error) {
      console.error("Error saving quote:", error);
      toast.error("Failed to save quote");
    }
  };

  const resetForm = () => {
    setSelectedClientId("");
    setClientSearchTerm("");
    setManualClientInfo({ 
      name: "", 
      firstName: "",
      lastName: "",
      email: "", 
      phone: "", 
      address: "", 
      serviceAddress: "",
      businessName: "" 
    });
    setSelectedVehicleIds([]);
    setManualVehicles([]);
    setSmartQuoteNotes("");
    setQuoteDescription("");
    setLineItems([{ 
      serviceName: "", 
      price: 0, 
      description: "", 
      quantity: 1, 
      total: 0, 
      source: "manual", 
      protocolAccepted: true 
    }]);
    setAttachedFormIds([]);
    setProductCosts([]);
    setQuotePricingAnalysis(null);
    setFormsDropdownOpen(false);
    setIsAddingVehicle(false);
    setNewVehicle({ year: "", make: "", model: "", vin: "", size: "medium" });
    setActiveLeadId(null);
    // AI enrichment reset
    setQuoteSource("standard");
    setAdminPricingBreakdown(null);
    setClientDisplayPrice(null);
    setClientVisibleAddOns([]);
    setAiRecommendedPrice(null);
    setSelectedServiceName("");
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
      
      // Invalidate cache
      sessionStorage.removeItem('quotes_cache_data');
      sessionStorage.removeItem('quotes_cache_time');
      
      toast.success("Quote deleted successfully");
      fetchQuotesData(); // Refresh data manually
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
    <div className="w-full space-y-8 pb-20">
      <PageHeader 
        title="Service Estimates" 
        accentWord="Estimates" 
        subtitle="Quote Generation & Proposal Tracking"
        actions={
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              className={cn("border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl px-6 h-12 font-bold uppercase tracking-widest text-[10px]", loading && "animate-spin")}
              onClick={() => fetchQuotesData(true)}
              disabled={loading}
            >
              <RefreshCcw className="w-4 h-4 mr-2 text-primary" />
              Sync Estimates
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) {
              setEditingQuote(null);
              resetForm();
            }
          }}>
            <DialogTrigger render={
              <Button className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue transition-all hover:scale-105" onClick={() => {
                setEditingQuote(null);
                resetForm();
                setIsAddDialogOpen(true);
              }}>
                <Plus className="w-4 h-4 mr-2" />
                Generate Quote
              </Button>
            } />
          <DialogContent className="sm:max-w-[920px] max-h-[90vh] overflow-y-auto bg-[#0B0B0B] border border-white/10 rounded-3xl shadow-2xl shadow-black p-0">
            <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">{editingQuote ? "Edit Proposal" : "Generate Professional Quote"}</DialogTitle>
                  <p className="text-[10px] text-white font-black uppercase tracking-[0.2em] mt-1">Strategic Opportunity Engine</p>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={handleCreateQuote} className="p-8 space-y-8">
              <div className="space-y-6">
                <div className="space-y-4 p-6 bg-white/5 rounded-2xl border border-white/10">
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Target Entity (Client)</Label>
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

                <div className="space-y-3">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white">Customer Invoice Address</Label>
                  <AddressInput 
                    defaultValue={manualClientInfo.serviceAddress || manualClientInfo.address}
                    onAddressSelect={(address) => setManualClientInfo(prev => ({ ...prev, serviceAddress: address, address: address }))}
                    placeholder="Search for invoice address..."
                    className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                  />
                </div>                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">First Name</Label>
                    <StandardInput 
                      placeholder="John"
                      value={manualClientInfo.firstName}
                      onValueChange={(val) => setManualClientInfo(prev => ({ ...prev, firstName: val }))}
                      className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Last Name</Label>
                    <StandardInput 
                      placeholder="Doe"
                      value={manualClientInfo.lastName}
                      onValueChange={(val) => setManualClientInfo(prev => ({ ...prev, lastName: val }))}
                      className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">Business Name (Optional)</Label>
                      <StandardInput 
                        placeholder="Acme Corp"
                        value={manualClientInfo.businessName}
                        onValueChange={(val) => setManualClientInfo(prev => ({ ...prev, businessName: val }))}
                        className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                      />
                    </div>

                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">Email Address</Label>
                      <StandardInput 
                        variant="email"
                        placeholder="client@example.com"
                        value={manualClientInfo.email}
                        onValueChange={(val) => setManualClientInfo(prev => ({ ...prev, email: val }))}
                        className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">Phone Number</Label>
                      <StandardInput 
                        variant="phone"
                        placeholder="(555) 000-0000"
                        value={manualClientInfo.phone}
                        onValueChange={(val) => setManualClientInfo(prev => ({ ...prev, phone: val }))}
                        className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                      />
                    </div>
                </div>

                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Job Location (Address)</Label>
                    <AddressInput 
                      defaultValue={manualClientInfo.address}
                      onAddressSelect={(address, lat, lng) => setManualClientInfo(prev => ({ ...prev, address, latitude: lat, longitude: lng }))}
                      placeholder="123 Main St, Austin, TX"
                      className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Service Description (Generated)</Label>
                    <Textarea 
                      placeholder="Detailed description of work to be performed..."
                      value={quoteDescription}
                      onChange={(e) => setQuoteDescription(e.target.value)}
                      className="bg-white/5 border-white/10 min-h-[100px] rounded-xl font-bold text-white"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Internal Notes / Job Details</Label>
                    <Textarea 
                      placeholder="Internal notes about the job..."
                      value={smartQuoteNotes}
                      onChange={(e) => setSmartQuoteNotes(e.target.value)}
                      className="bg-white/5 border-white/10 min-h-[80px] rounded-xl font-bold text-white"
                    />
                  </div>
                </div>

                {/* Forms & Waivers Multi-Select Dropdown */}
                <div className="space-y-3 p-6 bg-white/5 rounded-2xl border border-white/10">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white">Attach Forms & Waivers</Label>

                  {/* Selected form badges */}
                  {attachedFormIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {attachedFormIds.map(fid => {
                        const form = formTemplates.find(f => f.id === fid);
                        if (!form) return null;
                        return (
                          <span key={fid} className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg">
                            {form.title}
                            <button
                              type="button"
                              onClick={() => setAttachedFormIds(attachedFormIds.filter(id => id !== fid))}
                              className="hover:text-white transition-colors"
                            >
                              <XIcon className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Dropdown trigger */}
                  <Popover open={formsDropdownOpen} onOpenChange={setFormsDropdownOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between h-11 px-4 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-colors"
                      >
                        <span>
                          {attachedFormIds.length === 0
                            ? "Select forms to attach…"
                            : `${attachedFormIds.length} form${attachedFormIds.length > 1 ? "s" : ""} selected`}
                        </span>
                        <ChevronDown className="w-4 h-4 text-white/40" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[420px] p-2 bg-[#0B0B0B] border border-white/10 rounded-2xl shadow-2xl"
                      align="start"
                    >
                      {formTemplates.length === 0 ? (
                        <p className="text-[10px] text-white/40 font-black uppercase tracking-widest italic p-4 text-center">
                          No forms detected in system.
                        </p>
                      ) : (
                        <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                          {formTemplates.map((form) => {
                            const isChecked = attachedFormIds.includes(form.id);
                            return (
                              <div
                                key={form.id}
                                className={cn(
                                  "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all",
                                  isChecked
                                    ? "bg-primary/10 border border-primary/20"
                                    : "hover:bg-white/5 border border-transparent"
                                )}
                                onClick={() => {
                                  if (isChecked) {
                                    setAttachedFormIds(attachedFormIds.filter(id => id !== form.id));
                                  } else {
                                    setAttachedFormIds([...attachedFormIds, form.id]);
                                  }
                                }}
                              >
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={(checked) => {
                                    if (checked) setAttachedFormIds([...attachedFormIds, form.id]);
                                    else setAttachedFormIds(attachedFormIds.filter(id => id !== form.id));
                                  }}
                                  className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <span className="text-[10px] font-bold text-white uppercase tracking-widest flex-1">
                                  {form.title}
                                </span>
                                {form.type && (
                                  <span className="text-[8px] font-black uppercase tracking-widest text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
                                    {form.type}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {attachedFormIds.length > 0 && (
                        <div className="pt-2 border-t border-white/5 mt-2 flex justify-between items-center px-2">
                          <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                            {attachedFormIds.length} selected
                          </span>
                          <button
                            type="button"
                            onClick={() => setAttachedFormIds([])}
                            className="text-[9px] font-black uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors"
                          >
                            Clear all
                          </button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>

                {(selectedClientId || manualVehicles.length > 0) && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">Asset Profile (Vehicle)</Label>
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
                          <VinInput
                            value={newVehicle.vin}
                            onChange={(val) => setNewVehicle(prev => ({ ...prev, vin: val }))}
                            label="VIN (Optional)"
                            placeholder="VIN (Optional)"
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
                          <p className="text-[10px] text-white font-black uppercase tracking-widest italic p-4 text-center">No assets detected for this entity.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Services (Line Items)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddLineItem}
                      className="text-[10px] font-black uppercase tracking-widest border-white/10 hover:bg-white/5 h-8 px-4"
                    >
                      <Plus className="w-3 h-3 mr-2" /> Add Service
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {lineItems.map((item, index) => (
                      <div key={index} className="flex gap-4 items-start p-4 bg-white/5 rounded-2xl border border-white/10 group">
                        <div className="flex-1">
                          <StandardInput
                            placeholder="Service name"
                            value={item.serviceName}
                            onValueChange={(val) => handleLineItemChange(index, "serviceName", val)}
                            className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                          />
                        </div>
                        <div className="w-32">
                          <StandardInput 
                            variant="currency" 
                            placeholder="Value" 
                            value={item.price || 0}
                            onValueChange={(val) => handleLineItemChange(index, "price", val)}
                            className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                          />
                        </div>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="h-12 w-12 text-white hover:text-red-500 hover:bg-red-500/20 bg-white/10 rounded-xl transition-all"
                          onClick={() => handleRemoveLineItem(index)}
                          disabled={lineItems.length === 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-4">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Logistics & Service Fees</Label>
                    <CustomFeesEditor 
                      fees={customFees}
                      onChange={setCustomFees}
                      serviceFeeLabel={settings?.serviceFeeLabel}
                      onTravelFeeChange={setTravelFeeAmount}
                      travelFeeAmount={travelFeeAmount}
                      theme="dark"
                    />
                  </div>
                </div>
              </div>

              {/* ── AI Pricing Breakdown Panel (admin-only, shown when quote source is AI) ── */}
              {quoteSource === "ai" && adminPricingBreakdown && (
                <div className="p-6 bg-primary/5 border border-primary/20 rounded-3xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                        AI Pricing Breakdown — Admin View
                      </Label>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/30 bg-white/5 px-2.5 py-1 rounded-lg">
                      {adminPricingBreakdown.source === "ai" ? "AI-Generated" : "Benchmark"} · {adminPricingBreakdown.pricingConfidence}% confidence
                    </span>
                  </div>

                  {/* Price construction table */}
                  <div className="space-y-1.5">
                    {[
                      { label: "Base Service Price", value: adminPricingBreakdown.baseServicePrice, color: "text-white/70" },
                      adminPricingBreakdown.vehicleSizeAdjustment !== 0 && { label: "Vehicle Size Adjustment", value: adminPricingBreakdown.vehicleSizeAdjustment, color: "text-white/50" },
                      { label: "Material / Supply Cost", value: adminPricingBreakdown.materialCost, color: "text-amber-400" },
                      adminPricingBreakdown.laborCost > 0 && { label: "Internal Labor Allocation", value: adminPricingBreakdown.laborCost, color: "text-white/50" },
                      adminPricingBreakdown.travelCost > 0 && { label: "Travel Fee", value: adminPricingBreakdown.travelCost, color: "text-white/50" },
                      adminPricingBreakdown.addonTotal > 0 && { label: "Add-Ons Total", value: adminPricingBreakdown.addonTotal, color: "text-white/70" },
                      adminPricingBreakdown.discountTotal > 0 && { label: "Discounts Applied", value: -adminPricingBreakdown.discountTotal, color: "text-red-400" },
                    ].filter(Boolean).map((row: any, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] font-bold bg-white/5 rounded-xl px-4 py-2.5">
                        <span className="text-white/50">{row.label}</span>
                        <span className={row.color}>{formatCurrency(row.value)}</span>
                      </div>
                    ))}

                    {/* Divider + AI recommended */}
                    <div className="flex items-center justify-between text-[12px] font-black bg-primary/10 border border-primary/20 rounded-xl px-4 py-3">
                      <span className="text-primary uppercase tracking-widest text-[10px]">AI Recommended Price</span>
                      <span className="text-primary">{formatCurrency(adminPricingBreakdown.aiRecommendedPrice)}</span>
                    </div>
                  </div>

                  {/* Condition adjustments */}
                  {Object.keys(adminPricingBreakdown.conditionAdjustments || {}).length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Condition Surcharges Applied</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(adminPricingBreakdown.conditionAdjustments).map(([k, v]) => (
                          <span key={k} className="text-[9px] font-black uppercase tracking-widest bg-orange-500/10 border border-orange-500/20 text-orange-400 px-2 py-0.5 rounded-lg">
                            {k.replace(/_/g, " ")} +{(v * 100).toFixed(0)}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Profit / margin summary */}
                  <div className="border-t border-primary/10 pt-3 grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">Final Price</p>
                      <p className="text-sm font-black text-white">{formatCurrency(adminPricingBreakdown.finalQuoteTotal)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">Est. Profit</p>
                      <p className={cn("text-sm font-black", adminPricingBreakdown.estimatedProfit >= 0 ? "text-primary" : "text-red-400")}>
                        {formatCurrency(adminPricingBreakdown.estimatedProfit)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">Margin</p>
                      <p className={cn("text-sm font-black", adminPricingBreakdown.marginPercent >= 0 ? "text-primary" : "text-red-400")}>
                        {adminPricingBreakdown.marginPercent.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {/* Internal notes */}
                  {adminPricingBreakdown.internalNotes && (
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Pricing Rationale (Internal)</p>
                      <p className="text-[10px] text-white/50 leading-relaxed">{adminPricingBreakdown.internalNotes}</p>
                    </div>
                  )}

                  <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest text-center">
                    This breakdown is never visible on the customer-facing quote
                  </p>
                </div>
              )}

              {/* ── Internal Job Costs Panel (admin-only, never shown to customer) ── */}
              {productCosts.length > 0 && (() => {
                const totalPC = productCosts.reduce((s: number, p: any) => {
                  const v = parseFloat(p.totalCost);
                  return s + (isNaN(v) ? 0 : v);
                }, 0);
                const qTotal = calculateTotal();
                const laborOH = quotePricingAnalysis
                  ? (quotePricingAnalysis.laborTarget || 0) + (quotePricingAnalysis.overhead || 0)
                  : 0;
                const jobCost = totalPC + laborOH;
                const profit = qTotal - jobCost;
                const margin = qTotal > 0 ? (profit / qTotal) * 100 : 0;
                return (
                  <div className="p-6 bg-amber-500/5 border border-amber-500/20 rounded-3xl space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-400" />
                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">
                        Internal Job Costs — Admin Only
                      </Label>
                    </div>

                    {/* Product cost lines */}
                    <div className="space-y-2">
                      {productCosts.map((p: any, idx: number) => {
                        const cost = isNaN(parseFloat(p.totalCost)) ? 0 : parseFloat(p.totalCost);
                        return (
                          <div key={p.id || idx} className="flex items-center justify-between text-[11px] font-bold text-white/70 bg-white/5 rounded-xl px-4 py-2.5">
                            <span className="truncate max-w-[60%]">
                              {p.name || p.productName || "Detail Product Cost"}
                              {p.quantity && p.quantity !== 1 && (
                                <span className="ml-2 text-white/40">× {p.quantity}</span>
                              )}
                              {p.associatedServiceName && (
                                <span className="ml-2 text-white/30 text-[9px] uppercase tracking-widest">
                                  ({p.associatedServiceName})
                                </span>
                              )}
                            </span>
                            <span className="font-black text-amber-400 shrink-0 ml-2">
                              {formatCurrency(cost)}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary row */}
                    <div className="border-t border-amber-500/10 pt-3 grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">Product Cost</p>
                        <p className="text-sm font-black text-amber-400">{formatCurrency(totalPC)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">Est. Profit</p>
                        <p className={cn("text-sm font-black", profit >= 0 ? "text-primary" : "text-red-400")}>
                          {formatCurrency(profit)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">Margin</p>
                        <p className={cn("text-sm font-black", margin >= 0 ? "text-primary" : "text-red-400")}>
                          {margin.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest text-center">
                      Product costs do not affect customer-facing quote total
                    </p>
                  </div>
                );
              })()}

              <div className="p-8 bg-[#121212] border border-white/5 rounded-3xl text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-glow-blue">
                    <DollarSign className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-1">Estimated Proposal Value</p>
                    <p className="text-4xl font-black tracking-tighter text-white">{formatCurrency(calculateTotal())}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    className="text-white hover:text-white font-black uppercase tracking-widest text-[10px] h-14 px-8"
                    onClick={() => {
                      const validLineItems = lineItems.filter(item => item.serviceName);
                      if (!manualClientInfo.name) {
                        toast.error("Add a client before previewing.");
                        return;
                      }
                      if (validLineItems.length === 0) {
                        toast.error("Select at least one service before previewing.");
                        return;
                      }
                      console.log("[QuotePreview] Preview clicked", { client: manualClientInfo.name, services: validLineItems.length, total: calculateTotal() });
                      setIsPreviewOpen(true);
                    }}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Preview
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1 md:flex-none bg-primary hover:bg-[#2A6CFF] text-white font-black h-14 px-12 rounded-2xl uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-105"
                  >
                    {editingQuote ? "Authorize Update" : "Authorize Proposal"}
                  </Button>
                </div>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      }
    />

    <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-gray-100 border-none flex flex-col max-h-[90vh]">
        <div className="flex-1 overflow-y-auto">
          <DocumentPreview
            type="quote"
            settings={settings}
            document={{
              clientName: manualClientInfo.name,
              clientEmail: manualClientInfo.email,
              clientPhone: manualClientInfo.phone,
              clientAddress: manualClientInfo.address,
              serviceAddress: manualClientInfo.serviceAddress || manualClientInfo.address,
              lineItems: lineItems.filter(item => item.serviceName),
              total: calculateTotal(),
              status: editingQuote?.status || "draft",
              vehicles: [
                ...selectedVehicleIds.map(id => {
                  const v = allVehicles.find(veh => veh.id === id);
                  return v ? { id: v.id, year: v.year, make: v.make, model: v.model } : null;
                }).filter(Boolean),
                ...manualVehicles.map((mv, i) => ({ id: `manual-${i}`, year: mv.year, make: mv.make, model: mv.model })),
              ] as any,
              travelFeeAmount: travelFeeAmount || 0,
              customFees: customFees || [],
              description: quoteDescription || smartQuoteNotes || "",
              attachedFormIds: attachedFormIds,
              createdAt: editingQuote?.createdAt || undefined,
            } as any}
            onAddRecommendation={(item) => {
              setLineItems(current => [...current, { ...item, quantity: item.quantity || 1, total: item.price * (item.quantity || 1) }]);
            }}
          />
        </div>
        <DialogFooter className="p-4 bg-white border-t shrink-0">
          <Button variant="outline" onClick={() => setIsPreviewOpen(false)} className="font-bold">
            Close Preview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
      <TabsList className="bg-card/50 border border-white/5 p-1 rounded-2xl">
        <TabsTrigger value="smart" className="rounded-xl px-8 py-3 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
          <Sparkles className="w-4 h-4 mr-2" />
          Smart Quote AI
        </TabsTrigger>
        <TabsTrigger value="standard" className="rounded-xl px-8 py-3 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
          <FileText className="w-4 h-4 mr-2" />
          Quote History
        </TabsTrigger>
      </TabsList>

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
            setProductCosts(data.productCosts || []);
            setQuotePricingAnalysis(data.pricingAnalysis ?? null);
            // AI enrichment
            setQuoteSource(data.quoteSource ?? "standard");
            setAdminPricingBreakdown(data.adminPricingBreakdown ?? null);
            setClientDisplayPrice(data.clientDisplayPrice ?? null);
            setClientVisibleAddOns(data.clientVisibleAddOns ?? []);
            setAiRecommendedPrice(data.aiRecommendedPrice ?? null);
            setSelectedServiceName(data.selectedServiceName ?? "");
            setActiveTab("smart");
            setIsAddDialogOpen(true);
          }}
        />
      </TabsContent>

      <TabsContent value="standard" className="space-y-8">
      <Card className="border-none shadow-xl bg-[#0B0B0B] rounded-3xl overflow-hidden border border-white/5">
        <CardHeader className="bg-black/40 border-b border-white/5 p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <Input 
              placeholder="Search proposals..." 
              className="pl-12 bg-white/5 border-white/10 text-white rounded-xl h-12 font-medium focus:ring-primary/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl h-12 px-6 font-black uppercase tracking-widest text-[10px]">
              <Filter className="w-4 h-4 mr-2 text-primary" />
              Filter Proposals
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-black/20 border-b border-white/5">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em]">Proposal ID</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em]">Client Entity</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em]">Asset Profile</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em]">Timestamp</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em]">Estimated Value</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em]">Status</TableHead>
                <TableHead className="px-8 py-5 text-right text-[10px] font-black text-white uppercase tracking-[0.2em]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="hover:bg-transparent border-none">
                  <TableCell colSpan={7} className="text-center py-20 text-white font-black uppercase tracking-widest text-[10px] animate-pulse">Synchronizing Proposals...</TableCell>
                </TableRow>
              ) : filteredQuotes.length === 0 ? (
                <TableRow className="hover:bg-transparent border-none">
                  <TableCell colSpan={7} className="text-center py-20 text-white font-black uppercase tracking-widest text-[10px]">No proposals detected.</TableCell>
                </TableRow>
              ) : (
                filteredQuotes.map((q) => (
                  <TableRow key={q.id} className="hover:bg-white/5 transition-all duration-300 cursor-pointer group border-b border-white/5">
                    <TableCell className="px-8 py-6 font-mono text-[10px] font-black uppercase text-white tracking-widest">
                      #{q.id.slice(-6)}
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary border border-primary/20">
                          <UserIcon className="w-4 h-4" />
                        </div>
                        <span className="font-black text-white uppercase tracking-tight text-sm">{q.clientName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <div className="flex flex-wrap gap-2">
                        {q.vehicles.map((v, idx) => (
                          <Badge key={`${v.id}-${idx}`} variant="outline" className="text-[9px] font-black uppercase tracking-widest bg-white/5 text-white border-white/5 px-2 py-0.5 rounded-md">
                            <Car className="w-3 h-3 mr-1.5 text-primary" />
                            {v.year} {v.make}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="px-8 py-6 text-[10px] font-black text-white uppercase tracking-widest">
                      {q.createdAt ? format((q.createdAt as any).toDate(), "MMM d, yyyy") : "Pending"}
                    </TableCell>
                    <TableCell className="px-8 py-6 font-black text-white text-lg tracking-tighter">
                      {formatCurrency(q.total)}
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <Badge className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border-none",
                        q.status === "approved" ? "bg-green-500/10 text-green-600" :
                        q.status === "sent" ? "bg-[#0A4DFF]/10 text-[#0A4DFF]" :
                        "bg-white/10 text-white"
                      )}>
                        {q.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-8 py-6 text-right">
                      <div className="flex justify-end gap-2 transition-all">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-[#A0A0A0] hover:text-white hover:bg-white/10 rounded-xl"
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
                          className="h-9 w-9 text-[#A0A0A0] hover:text-white hover:bg-white/10 rounded-xl"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingQuote(q);
                            setSelectedClientId(q.clientId || "");
                            setManualClientInfo({
                              name: q.clientName,
                              firstName: q.clientFirstName || "",
                              lastName: q.clientLastName || "",
                              email: q.clientEmail || "",
                              phone: q.clientPhone || "",
                              address: q.clientAddress || "",
                              serviceAddress: q.serviceAddress || q.clientAddress || "",
                              businessName: q.businessName || ""
                            });
                            setLineItems(q.lineItems);
                            setQuoteDescription(q.description || "");
                            setAttachedFormIds(q.attachedFormIds || []);
                            setProductCosts((q as any).productCosts || []);
                            setQuotePricingAnalysis((q as any).pricingAnalysis ?? null);
                            // AI enrichment
                            setQuoteSource((q as any).quoteSource ?? "standard");
                            setAdminPricingBreakdown((q as any).adminPricingBreakdown ?? null);
                            setClientDisplayPrice((q as any).clientDisplayPrice ?? null);
                            setClientVisibleAddOns((q as any).clientVisibleAddOns ?? []);
                            setAiRecommendedPrice((q as any).aiRecommendedPrice ?? null);
                            setSelectedServiceName((q as any).selectedServiceName ?? "");
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
                              className="h-9 w-9 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all"
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
                  <p className="text-3xl font-black">{formatCurrency(selectedQuote.total)}</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6 bg-[#0B0B0B] border-t border-white/10">
              <div className="space-y-3">
                <p className="text-xs font-bold text-white uppercase tracking-widest">Asset Profile</p>
                <div className="flex flex-wrap gap-2">
                  {selectedQuote.vehicles.map((v: any) => (
                    <Badge key={v.id} variant="outline" className="text-[10px] font-black uppercase tracking-widest bg-white/5 border-white/10 px-3 py-1 rounded-lg text-white">
                      <Car className="w-3 h-3 mr-2 text-primary" />
                      {v.year} {v.make} {v.model}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-white uppercase tracking-widest">Line Items</p>
                <div className="space-y-2">
                  {selectedQuote.lineItems.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                      <span className="font-bold text-white">{item.serviceName}</span>
                      <span className="font-black text-primary">{formatCurrency(item.price)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-6">
                {selectedQuote.status === "approved" && (
                  <Button 
                    className="flex-1 min-w-[140px] bg-green-600 hover:opacity-90 text-white font-black uppercase tracking-[0.2em] text-[10px] h-12 rounded-xl shadow-lg shadow-green-500/20 transition-all hover:scale-105"
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
                <Button className="flex-1 min-w-[140px] bg-white/5 border border-white/10 text-white hover:bg-white/10 font-black uppercase tracking-widest text-[10px] h-12 rounded-xl shadow-sm transition-all">
                  <FileText className="w-4 h-4 mr-2 text-primary" /> Download PDF
                </Button>
                <Button className="flex-1 min-w-[140px] bg-primary hover:bg-[#2A6CFF] text-white font-black uppercase tracking-[0.2em] text-[10px] h-12 rounded-xl shadow-glow-blue transition-all hover:scale-105">
                  <Mail className="w-4 h-4 mr-2" /> Email Proposal
                </Button>
                <DeleteConfirmationDialog
                  trigger={
                    <Button 
                      variant="ghost" 
                      className="text-red-500 hover:text-red-700 hover:bg-red-500/10 font-bold shrink-0"
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
