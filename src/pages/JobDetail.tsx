import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, serverTimestamp, getDocs, arrayUnion, addDoc, deleteDoc, deleteField, limit } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { 
  getJobById,
  updateJob,
  softDeleteJob,
  updateJobFields,
  addJobProductCost,
  onJobSnapshot
} from "../services/jobService";
import { getClient, updateClient } from "../services/clientService";
import { 
  createInvoice,
  getInvoicesByAppointment,
  updateInvoiceFields as updateInvoice,
  softDeleteInvoice
} from "../services/invoiceService";
import { processMaintenanceAutomation } from "../services/automationService";
import { messagingService } from "../services/messagingService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { 
  ChevronLeft, 
  Clock, 
  MapPin, 
  User, 
  Car, 
  Phone, 
  Mail, 
  ClipboardList, 
  Camera, 
  CheckCircle2, 
  AlertCircle, 
  MoreHorizontal,
  Navigation,
  FileText,
  DollarSign,
  CreditCard,
  Banknote,
  QrCode,
  Wallet,
  Loader2,
  Truck,
  ExternalLink,
  Scan,
  ShieldCheck,
  Plus,
  Trash2,
  Receipt,
  Calendar,
  Sparkles,
  Save,
  Search,
  Image as ImageIcon,
  X,
  Target,
  Undo,
  Ban,
  MessageSquare
} from "lucide-react";
import { format } from "date-fns";
import { cn, cleanAddress, formatCurrency, getClientDisplayName } from "@/lib/utils";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import PhotoDocumentation from "../components/PhotoDocumentation";
import ServiceChecklist from "../components/ServiceChecklist";
import SignaturePad from "../components/SignaturePad";
import { decodeVin } from "../services/vin";
import { addLoyaltyPoints } from "../services/promotions";
import { 
  getRevenueOptimization, 
  analyzeDeployment,
  RevenueOptimizationResponse, 
  UpsellRecommendation,
  DeploymentInsight,
  PricingAnalysis
} from "../services/gemini";
import { DocumentPreview } from "../components/DocumentPreview";
import { paymentService, PaymentProvider } from "../services/paymentService";
import Logo from "../components/Logo";
import FormSigner from "../components/FormSigner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

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

function SmallCardWrapper({ 
  id, 
  focusedId, 
  onFocus, 
  children 
}: { 
  id: string, 
  focusedId: string | null, 
  onFocus: (id: string | null) => void, 
  children: React.ReactNode 
}) {
  const isFocused = focusedId === id;
  const isDimmed = focusedId !== null && !isFocused;

  if (isFocused) {
    return (
      <React.Fragment>
        <div className="opacity-0 pointer-events-none" aria-hidden="true">{children}</div>
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => onFocus(null)} />
          <div className="relative z-10 w-full max-w-2xl animate-in zoom-in-95 duration-200">
            <Button size="icon" variant="ghost" onClick={() => onFocus(null)} className="absolute -top-12 right-0 text-white/70 hover:text-white hover:bg-white/10 rounded-full bg-black/40"><X className="w-5 h-5"/></Button>
            <div className="bg-[#050505] flex flex-col rounded-3xl border border-primary/50 shadow-[0_0_100px_-20px_rgba(239,68,68,0.4)]">
              {children}
            </div>
          </div>
        </div>
      </React.Fragment>
    );
  }

  return (
    <div 
      onClick={() => onFocus(id)} 
      className={cn(
        "cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:ring-1 hover:ring-white/20 rounded-2xl h-full flex flex-col relative", 
        isDimmed ? "opacity-30 grayscale-[50%] blur-[1px] pointer-events-none" : ""
      )}
    >
      <div className="absolute inset-0 z-10" aria-hidden="true" />
      <div className="relative z-0 h-full flex flex-col">{children}</div>
    </div>
  );
}

import { JobAnalytics } from "../components/JobAnalytics";
import { JobForms } from "../components/JobForms";
import { JobSettings } from "../components/JobSettings";
import { JobRevenueIntel } from "../components/JobRevenueIntel";
import { JobOperations } from "../components/JobOperations";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [decodedVin, setDecodedVin] = useState<any>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [formTemplates, setFormTemplates] = useState<any[]>([]);
  const [signedForms, setSignedForms] = useState<any[]>([]);
  const [showFormSigner, setShowFormSigner] = useState<any>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ newStatus: string, oldStatus: string, actionText: string } | null>(null);
  const [cancellationFee, setCancellationFee] = useState(0);
  const [isAfterCutoff, setIsAfterCutoff] = useState(false);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);
  
  // Bring-to-front focus for small cards
  const [focusedSmallCardId, setFocusedSmallCardId] = useState<string | null>(null);

  // AI Upsell / Field Assessment State (Per Vehicle)
  const [vehicleStates, setVehicleStates] = useState<Record<string, {
    assessment: string;
    tags: string[];
    images: string[];
    protocol: RevenueOptimizationResponse | null;
    recommendations: UpsellRecommendation[];
  }>>({});

  const technicianAssessment = activeVehicleId ? (vehicleStates[activeVehicleId]?.assessment || "") : "";
  const assessmentTags = activeVehicleId ? (vehicleStates[activeVehicleId]?.tags || []) : [];
  const assessmentImages = activeVehicleId ? (vehicleStates[activeVehicleId]?.images || []) : [];
  const revenueProtocol = activeVehicleId ? (vehicleStates[activeVehicleId]?.protocol || null) : null;
  const recommendations = activeVehicleId ? (vehicleStates[activeVehicleId]?.recommendations || []) : [];

  const updateVehicleState = (updater: (prev: any) => any) => {
    if (!activeVehicleId) return;
    setVehicleStates(prev => {
      const current = prev[activeVehicleId] || {
        assessment: "",
        tags: [],
        images: [],
        protocol: null,
        recommendations: []
      };
      return {
        ...prev,
        [activeVehicleId]: updater(current)
      };
    });
  };

  const setTechnicianAssessment = (val: string | ((prev: string) => string)) => {
    updateVehicleState(curr => ({ ...curr, assessment: typeof val === 'function' ? val(curr.assessment) : val }));
  };
  const setAssessmentTags = (val: string[] | ((prev: string[]) => string[])) => {
    updateVehicleState(curr => ({ ...curr, tags: typeof val === 'function' ? val(curr.tags) : val }));
  };
  const setAssessmentImages = (val: string[] | ((prev: string[]) => string[])) => {
    updateVehicleState(curr => ({ ...curr, images: typeof val === 'function' ? val(curr.images) : val }));
  };
  const setRevenueProtocol = (val: any | ((prev: any) => any)) => {
    updateVehicleState(curr => ({ ...curr, protocol: typeof val === 'function' ? val(curr.protocol) : val }));
  };
  const setRecommendations = (val: any[] | ((prev: any[]) => any[])) => {
    updateVehicleState(curr => ({ ...curr, recommendations: typeof val === 'function' ? val(curr.recommendations) : val }));
  };

  const [isGeneratingUpsells, setIsGeneratingUpsells] = useState(false);
  const [selectedRecommendations, setSelectedRecommendations] = useState<UpsellRecommendation[]>([]);
  const [selectedAdjustments, setSelectedAdjustments] = useState<any[]>([]);
  const [selectedBundles, setSelectedBundles] = useState<any[]>([]);

  // Compute conflicts for bundles
  const allAppliedIndividualServices = [
    ...(job?.serviceNames || []),
    ...(job?.addOnNames || [])
  ];
  
  const allAppliedBundledItems = (job?.serviceSelections || [])
    .filter((s:any) => s.bundledServiceNames)
    .flatMap((s:any) => s.bundledServiceNames as string[]);
    
  const allStagingBundledItems = selectedBundles.flatMap(b => b.items);
  
  const allConflictingBundledItems = [...allAppliedBundledItems, ...allStagingBundledItems];

  // Deployment Intelligence State
  const [isAnalyzingDeployment, setIsAnalyzingDeployment] = useState(false);
  const [deploymentInsights, setDeploymentInsights] = useState<DeploymentInsight[]>([]);
  const [selectedDeploymentInsights, setSelectedDeploymentInsights] = useState<DeploymentInsight[]>([]);
  
  // Product Cost State
  const [productCosts, setProductCosts] = useState<any[]>([]);
  const [pricingAnalysis, setPricingAnalysis] = useState<PricingAnalysis | null>(null);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [businessSettings, setBusinessSettings] = useState<any>(null);
  const [isApplyingPrice, setIsApplyingPrice] = useState(false);
  const [integrationSettings, setIntegrationSettings] = useState<any>(null);

  // Invoice Modal State
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isPaymentSelectionOpen, setIsPaymentSelectionOpen] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<any>(null);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [communicationLogs, setCommunicationLogs] = useState<any[]>([]);

  // Manual Service Addition State
  const [showAddServiceDialog, setShowAddServiceDialog] = useState(false);
  const [allServices, setAllServices] = useState<any[]>([]);
  const [allAddons, setAllAddons] = useState<any[]>([]);
  const [selectedVehicleForAdd, setSelectedVehicleForAdd] = useState<string>("");
  const [selectedServiceToAdd, setSelectedServiceToAdd] = useState<string>("");
  const [customServiceName, setCustomServiceName] = useState("");
  const [customServicePrice, setCustomServicePrice] = useState("");
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  // Pricing Adjustments State
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [adjSource, setAdjSource] = useState("manual");
  const [adjAmount, setAdjAmount] = useState("");

  // Field Assessment Logic
  const AVAILABLE_TAGS = ['Pet Hair', 'Stains', 'Odor', 'Mold', 'Heavy Dirt', 'Paint Issues'];

  const toggleAssessmentTag = (tag: string) => {
    setAssessmentTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const optimizeImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const maxDim = 1000;
        // Skip optimization if image is already small
        if (img.width <= maxDim && img.height <= maxDim && base64Str.length < 500000) {
          return resolve(base64Str);
        }

        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height *= maxDim / width;
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width *= maxDim / height;
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(base64Str);
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => reject(new Error("Failed to load image for optimization"));
    });
  };

  const handleAssessmentImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          try {
            const optimized = await optimizeImage(event.target.result as string);
            setAssessmentImages(prev => [...prev, optimized]);
          } catch (err) {
            console.error("Optimization failed:", err);
            toast.error("Image processing failed. Resource may be too large.");
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAssessmentImage = (index: number) => {
    setAssessmentImages(prev => prev.filter((_, i) => i !== index));
  };

  const getDualLabels = (source: string) => {
    switch (source) {
      case 'ai_pricing': return { internalLabel: "AI Pricing Adjustment", clientLabel: "Service Adjustment" };
      case 'upsell': return { internalLabel: "Upsell Adjustment", clientLabel: "Service Upgrade" };
      case 'discount': return { internalLabel: "Discount Adjustment", clientLabel: "Discount" };
      case 'manual':
      default: return { internalLabel: "Custom Price Override", clientLabel: "Price Adjustment" };
    }
  };

  const getAdjustmentExplanation = (adj: any) => {
    let internalExp = "This adjustment was applied but no detailed internal reasoning was recorded.";
    let customerExp = "This adjustment reflects updated service scope and pricing.";

    const source = adj.source?.toLowerCase() || '';

    if (source === 'ai_pricing') {
      internalExp = adj.reasoning || "AI pricing engine recommended this adjustment based on field assessment and profitability parameters.";
      customerExp = "Pricing updated based on condition and scope.";
    } else if (source === 'upsell' || source === 'ai_revenue_intelligence' || source === 'deployment_intelligence') {
      internalExp = adj.reasoning || adj.description || "Revenue intelligence detected an optimization opportunity.";
      customerExp = "Additional labor and treatment needs were identified based on vehicle assessment.";
    } else if (source === 'discount') {
      internalExp = adj.reasoning || "Discount applied to secure operation.";
      customerExp = "Promotional or courtesy discount applied.";
    } else if (source === 'manual') {
      internalExp = adj.internalReasoning || "Manual adjustment applied by technician.";
      customerExp = adj.customerReasoning || "Pricing adjusted based on unique project requirements.";
    }
    
    if (adj.internalReasoning) internalExp = adj.internalReasoning;
    if (adj.customerReasoning) customerExp = adj.customerReasoning;

    return { internal: internalExp, customer: customerExp };
  };

  const handleApplyOneTapUpsell = async (rec: UpsellRecommendation) => {
    if (!job) return;
    setIsUpdating(true);
    try {
      const priceToUse = rec.bundlePrice ?? rec.recommendedPrice;
      const docRef = doc(db, "appointments", id!);
      const newItem = {
        id: `ai-upsell-${Date.now()}-${Math.random()}`,
        name: rec.serviceName,
        description: rec.reason || `Strategic ${rec.serviceName} enhancement based on vehicle condition.`,
        price: priceToUse,
        qty: 1,
        total: priceToUse,
        source: "ai_revenue_intelligence",
        protocolAccepted: true,
        recommendedProduct: rec.recommendedProduct || "",
        productReason: rec.productReason || "",
        instruction: rec.reason || "Execute strategic optimization package",
        vehicleId: activeVehicleId || ""
      };

      const newNames = [...(job.serviceNames || []), rec.serviceName];
      const newSelections = [...(job.serviceSelections || []), newItem];
      const currentTotal = job.totalAmount || 0;
      const currentBase = job.baseAmount || 0;

      await updateJobFields(id!, {
        serviceNames: newNames,
        serviceSelections: newSelections,
        totalAmount: currentTotal + priceToUse,
        baseAmount: currentBase + priceToUse,
        internalNotes: (job.internalNotes || "") + `\n\n[REVENUE PROTOCOL] Added ${rec.serviceName} for $${priceToUse.toFixed(2)} at ${new Date().toLocaleString()}.`
      }, profile!.businessId);

      const client = await getClient(job.clientId);
      if (client) {
        await updateClient(client.id, { notes: (client.notes || "") + `\n\n[REVENUE PROTOCOL] Recommended ${rec.serviceName} for Job #${id?.slice(-6).toUpperCase()}. Insight: ${rec.reason}` });
      }

      toast.success(`Smart Add-On Applied: ${rec.serviceName}`);
      
      // Remove it from the recommendations list so it's not suggested twice
      setRecommendations(recommendations.filter(r => r.serviceName !== rec.serviceName));
    } catch (err) {
      console.error("Apply Upsell Error:", err);
      toast.error("Failed to apply Smart Add-On");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleApplyPriceTier = async (tier: 'floor' | 'recommended' | 'premium') => {
    if (!pricingAnalysis || !job || !profile) return;
    
    setIsApplyingPrice(true);
    try {
      const price = pricingAnalysis[`${tier}Price` as keyof PricingAnalysis] as number;
      const docRef = doc(db, "appointments", id!);
      const diff = price - (job.baseAmount || 0);

      const newAdj = {
        id: `ai-price-${Date.now()}`,
        source: 'ai_pricing',
        amount: diff,
      };

      const currentAdjustments = job.priceAdjustments || [];
      const newAdjustments = [...currentAdjustments, newAdj];

      await updateJobFields(id!, {
        priceAdjustments: newAdjustments,
        totalAmount: price,
        baseAmount: price,
        updatedAt: serverTimestamp() as any
      }, profile!.businessId);
      toast.success(`Applied ${tier} price: $${price}`);
    } catch (error) {
      console.error("Error applying price tier:", error);
      toast.error("Failed to apply AI price");
    } finally {
      setIsApplyingPrice(false);
    }
  };

  const saveProductCosts = async (costs: any[]) => {
    try {
      await updateJob(id!, {
        productCosts: costs
      }, profile!.businessId);
      setProductCosts(costs);
    } catch (error) {
      console.error("Error saving product costs:", error);
      toast.error("Failed to save product costs");
    }
  };

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
    const updated = [...productCosts, newCost];
    setProductCosts(updated);
  };

  const handleUpdateProductCost = (costId: string, updates: any) => {
    const updated = productCosts.map(p => {
      if (p.id === costId) {
        const newP = { ...p, ...updates };
        newP.totalCost = newP.quantity * newP.unitCost;
        return newP;
      }
      return p;
    });
    setProductCosts(updated);
  };

  const handleDeleteProductCost = (costId: string) => {
    const updated = productCosts.filter(p => p.id !== costId);
    setProductCosts(updated);
  };

  const toggleSmsAutomation = async () => {
    if (!job || !id) return;
    try {
      await updateJob(id, {
        smsAutomationPaused: !job.smsAutomationPaused
      }, profile!.businessId);
      toast.success(job.smsAutomationPaused ? "SMS Automation Enabled" : "SMS Automation Paused");
    } catch (err: any) {
      toast.error("Failed to toggle SMS automation: " + err.message);
    }
  };

  const handleResendReminder = async (type: "confirmation" | "reminder_24h" | "reminder_2h") => {
    if (!job || !job.customerPhone) {
      toast.error("No customer phone number available");
      return;
    }

    try {
      let messageBody = "";
      const scheduledDate = job.scheduledAt?.toDate ? job.scheduledAt.toDate() : new Date(job.scheduledAt);
      const formattedTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(scheduledDate);
      const serviceText = job.serviceNames?.length ? job.serviceNames.join(", ") : "service";
      const formattedDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(scheduledDate);

      if (type === "confirmation") {
        messageBody = `Flatline Mobile Detail: Your appointment is confirmed for ${formattedDate} at ${formattedTime} for ${serviceText}. Reply STOP to opt out.`;
      } else if (type === "reminder_24h") {
        messageBody = `Hi ${getClientDisplayName(job)}, reminder: your Flatline Mobile Detail appointment is tomorrow at ${formattedTime}.`;
      } else if (type === "reminder_2h") {
        messageBody = `Hi ${getClientDisplayName(job)}, Flatline Mobile Detail will see you in about 2 hours for your appointment at ${formattedTime}.`;
      }

      const res = await messagingService.sendSms({
        to: job.customerPhone,
        body: messageBody
      });

      console.log(`Manual resend (${type}) successful`);
      toast.success("Reminder manually resent!");

      // Log success
      await addDoc(collection(db, "communication_logs"), {
        clientId: job.clientId || "walk-in",
        appointmentId: job.id,
        type,
        content: messageBody,
        status: "sent",
        messageId: (res as any)?.messageId || "sent",
        createdAt: serverTimestamp()
      });

      // Update reminders state
      const reminderKey = type === 'confirmation' ? 'confirmation' : (type === 'reminder_24h' ? 'twentyFourHour' : 'twoHour');
      await updateJob(job.id, {
        [`reminders.${reminderKey}`]: "sent"
      }, profile!.businessId);

    } catch (err: any) {
      console.error(`Failed to manually send ${type}:`, err);
      toast.error(`Failed to send reminder: ${err.message}`);

      // Log failure
      await addDoc(collection(db, "communication_logs"), {
        clientId: job.clientId || "walk-in",
        appointmentId: job.id,
        type,
        content: "Manual resend attempt",
        status: "failed",
        errorDetail: err.message || String(err),
        createdAt: serverTimestamp()
      });
      
      const reminderKey = type === 'confirmation' ? 'confirmation' : (type === 'reminder_24h' ? 'twentyFourHour' : 'twoHour');
      await updateJob(job.id, {
        [`reminders.${reminderKey}`]: "failed"
      }, profile!.businessId);
    }
  };

  const handleAcceptRecommendation = async (item: any) => {
    if (!job) return;
    setIsUpdating(true);
    try {
      // Create new line item payload based on recommended item
      const newItem = {
        id: `rec-add-${Date.now()}`,
        name: item.serviceName,
        description: item.description,
        price: item.price,
        qty: item.quantity || 1,
        total: item.price * (item.quantity || 1),
        source: "recommendation",
        protocolAccepted: true,
        vehicleId: activeVehicleId || ""
      };

      // Add to job service selections
      const newServiceSelections = [...(job.serviceSelections || []), newItem];
      const addedAmount = newItem.total;
      const newTotalAmount = (job.totalAmount || 0) + addedAmount;
      const newBaseAmount = (job.baseAmount || 0) + addedAmount;

      await updateJob(job.id, {
        serviceSelections: newServiceSelections,
        serviceNames: [...(job.serviceNames || []), item.serviceName],
        totalAmount: newTotalAmount,
        baseAmount: newBaseAmount,
        internalNotes: (job.internalNotes || "") + `\n\n[USER ACTION] Added recommended service ${item.serviceName} for $${item.price.toFixed(2)}.`
      }, profile!.businessId);

      const client = await getClient(job.clientId);
      if (client) {
        await updateClient(client.id, { notes: (client.notes || "") + `\n\n[USER ACTION] Added recommended service ${item.serviceName} for Job #${job.id.slice(-6).toUpperCase()}.` });
      }

      // Also update currently displayed invoice if open
      if (currentInvoice) {
        const currentLineItems = currentInvoice.lineItems || [];
        const currentRecommended = currentInvoice.recommendedItems || [];
        
        const updatedRecommended = currentRecommended.filter((r: any) => r.serviceName !== item.serviceName);
        const updatedLineItems = [...currentLineItems, ...[newItem]];
        
        const newSubtotal = (currentInvoice.subtotal || 0) + addedAmount;
        const taxRate = businessSettings?.taxRate || 0;
        const newTaxAmount = ((newSubtotal - (currentInvoice.discountAmount || 0)) * taxRate) / 100;
        const invTotal = newSubtotal - (currentInvoice.discountAmount || 0) + (currentInvoice.travelFeeAmount || 0) + (currentInvoice.afterHoursFeeAmount || 0) + newTaxAmount;
        
        const invoiceUpdate = {
          lineItems: updatedLineItems,
          recommendedItems: updatedRecommended,
          subtotal: newSubtotal,
          total: invTotal
        };
        
        await updateInvoice(currentInvoice.id, invoiceUpdate, profile.businessId);
        setCurrentInvoice({ ...currentInvoice, ...invoiceUpdate });
      }

      toast.success(`Added ${item.serviceName}`);
    } catch (err) {
      console.error("Failed to add recommendation:", err);
      toast.error("Failed to add recommended service");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConvertJobToInvoice = async (showPaymentSelection = false) => {
    if (!job || !profile) return;
    try {
      setIsGeneratingInvoice(true);
      
      // Check if invoice already exists for this job to prevent duplicates
      const invoices = await getInvoicesByAppointment(id!, profile.businessId);
      
      if (invoices.length > 0) {
        const existingInvoice = invoices[0];
        setCurrentInvoice(existingInvoice);
        if (showPaymentSelection) {
          setIsPaymentSelectionOpen(true);
        } else {
          setIsInvoiceModalOpen(true);
        }
        setIsGeneratingInvoice(false);
        return existingInvoice.id;
      }

      const lineItems: any[] = [];
      
      // Services
      (job.serviceSelections || []).forEach((s: any) => {
        lineItems.push({
          serviceName: s.name || s.serviceName,
          description: s.description || s.reason || "Service",
          quantity: s.qty || 1,
          price: s.price || 0,
          total: (s.price || 0) * (s.qty || 1),
          source: s.source || "standard",
          protocolAccepted: true
        });
      });

      // Addons
      (job.addOnSelections || []).forEach((a: any) => {
        lineItems.push({
          serviceName: a.name || a.serviceName || "Add-on",
          description: a.description || a.reason || "Additional Enhancement",
          quantity: a.qty || 1,
          price: a.price || 0,
          total: (a.price || 0) * (a.qty || 1),
          source: a.source || "standard",
          protocolAccepted: true
        });
      });

      // Price Adjustments mapping to line items
      (job.priceAdjustments || []).forEach((adj: any) => {
        if (adj.source !== 'discount' && adj.source !== 'ai_pricing') {
          lineItems.push({
            serviceName: adj.source.replace(/_/g, " "),
            description: adj.reason || "Pricing adjustment",
            quantity: 1,
            price: adj.amount,
            total: adj.amount,
            source: adj.source,
            protocolAccepted: true
          });
        }
      });

      // Map unseen recommendations to recommended properties
      const recommendedItems = recommendations.map(rec => ({
        serviceName: rec.serviceName,
        description: rec.reason || "Recommended based on vehicle condition",
        quantity: 1,
        price: rec.bundlePrice ?? rec.recommendedPrice,
        originalPrice: rec.recommendedPrice,
        bundlePrice: rec.bundlePrice,
        total: rec.bundlePrice ?? rec.recommendedPrice,
        source: "recommendation",
        protocolAccepted: false
      }));

      if (job.unacceptedRecommendations?.length > 0) {
        job.unacceptedRecommendations.forEach((ur: any) => {
          if (!recommendedItems.find(r => r.serviceName === ur.name)) {
            recommendedItems.push({
              serviceName: ur.name,
              description: ur.reason || "Suggested Enhancement",
              quantity: 1,
              price: ur.price || 0,
              originalPrice: ur.price || 0,
              bundlePrice: ur.bundlePrice,
              total: ur.price || 0,
              source: "recommendation",
              protocolAccepted: false
            });
          }
        });
      }

      // Find discount amount specifically
      let discountAmount = job.discountAmount || 0;
      (job.priceAdjustments || []).forEach((adj: any) => {
        if (adj.source === 'discount') {
          discountAmount += Math.abs(adj.amount);
        }
      });

      const unacceptedBundles = job.unacceptedBundles || [];
      const invoiceVehicleInfo = job.vehicleInfo || "";

      const invoiceData = {
        clientId: job.clientId || job.customerId,
        clientName: job.customerName,
        clientEmail: job.customerEmail || "",
        clientPhone: job.customerPhone || "",
        clientAddress: job.clientAddress || "", 
        serviceAddress: job.address || "", // Strict mapping
        technicianId: profile.uid,
        appointmentId: id,
        vehicles: [
          {
            id: job.vehicleId || "",
            year: "", 
            make: "", 
            model: invoiceVehicleInfo || "Vehicle",
            roNumber: job.roNumber || ""
          }
        ],
        vehicleInfo: invoiceVehicleInfo,
        lineItems,
        recommendedItems,
        unacceptedBundles,
        subtotal: lineItems.reduce((acc, curr) => acc + curr.total, 0),
        discountAmount,
        travelFeeAmount: job.travelFee || 0,
        afterHoursFeeAmount: job.afterHoursRecord?.afterHoursFee || 0,
        total: job.totalAmount || 0,
        amountPaid: 0,
        status: "pending",
        paymentStatus: "unpaid",
        createdAt: serverTimestamp(),
        invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
        description: job.internalNotes || `Generated from Job #${id?.slice(-6).toUpperCase()}`,
        lateFeeEnabled: false,
        lateFeeType: "fixed",
        lateFeeAmount: 0,
        lateFeeGracePeriodDays: 3
      };

      const invoiceId = await createInvoice(invoiceData, profile.businessId);
      const newInvoice = { id: invoiceId, ...invoiceData } as any;
      setCurrentInvoice(newInvoice);

      // Auto-send Invoice SMS
      if (invoiceData.clientPhone) {
        const smsData = {
          clientName: invoiceData.clientName || "Customer",
          businessName: businessSettings?.businessName || "Flatline Mobile Detail",
          invoiceAmount: formatCurrency(invoiceData.total || 0),
          invoiceLink: window.location.origin + "/public-invoice/" + invoiceId,
          paymentLink: window.location.origin + "/public-invoice/" + invoiceId + "/pay"
        };
        messagingService.sendTemplateSms(
          invoiceData.clientPhone,
          "invoice_sent",
          smsData,
          id,
          invoiceData.clientId
        ).then(() => console.log("Auto-Invoice SMS template sent successfully."))
         .catch(e => console.error("Auto-Invoice SMS template failed to send:", e));
      }

      if (showPaymentSelection) {
        setIsPaymentSelectionOpen(true);
      } else {
        setIsInvoiceModalOpen(true);
      }
      toast.success(showPaymentSelection ? "Invoice created and payment opened!" : "Job converted to Invoice and opened!");
      setIsGeneratingInvoice(false);
      return invoiceId;
    } catch (error) {
      console.error("Error converting job to invoice:", error);
      toast.error("Invoice conversion failed");
      setIsGeneratingInvoice(false);
    }
  };

  const handleAcceptPayment = async (invoice: any) => {
    if (!invoice) return;
    setIsPaymentSelectionOpen(true);
  };

  const handleIntegratedPayment = async (invoice: any) => {
    if (!invoice) return;
    
    // Check if integratons are loaded
    if (!integrationSettings) {
      toast.error("Loading payment configuration...");
      return;
    }

    const integrations = integrationSettings?.paymentIntegrations || {};
    const providers: PaymentProvider[] = ["clover", "stripe", "square", "paypal"];
    const activeProvider = providers.find(p => integrations[p]?.enabled);
    
    if (!activeProvider) {
      toast.error("Digital payment provider not configured in settings.");
      return;
    }
    
    try {
      toast.loading(`Initializing ${activeProvider}...`, { id: "payment" });
      const result = await paymentService.processPayment(invoice, activeProvider, integrations[activeProvider]);
      
      if (result.success) {
        const invoiceRef = doc(db, "invoices", invoice.id);
        const paymentHistoryEntry = {
          action: "paid",
          timestamp: serverTimestamp(),
          method: "integrated",
          provider: activeProvider
        };
        const updateData = {
          status: "paid",
          paidAt: serverTimestamp(),
          paymentStatus: "paid",
          paymentProvider: activeProvider,
          transactionReference: result.transactionId || "integrated-payment",
          paymentHistory: arrayUnion(paymentHistoryEntry)
        };
        await updateInvoice(invoice.id, updateData, profile.businessId);
        setCurrentInvoice((prev: any) => prev ? { 
          ...prev, 
          ...updateData,
          paymentHistory: [...(prev.paymentHistory || []), { ...paymentHistoryEntry, timestamp: new Date() }]
        } : null);
        toast.success("Payment successful!", { id: "payment" });
        setIsPaymentSelectionOpen(false);
        if (id) {
          await updateJobFields(id!, { paymentStatus: "paid" }, profile!.businessId);
          setJob(prev => ({ ...prev, paymentStatus: "paid" }));
          updateStatus("paid");
        }
      } else {
        toast.error(result.error || "Payment failed", { id: "payment" });
      }
    } catch (error) {
      console.error("Payment error:", error);
      toast.error("Unexpected error during integrated payment.", { id: "payment" });
    }
  };

  const handleManualPayment = async (invoice: any, method: string) => {
    if (!invoice?.id) return;
    try {
      toast.loading(`Recording ${method} payment...`, { id: "payment" });
      const invoiceRef = doc(db, "invoices", invoice.id);
      const paymentHistoryEntry = {
        action: "paid",
        timestamp: serverTimestamp(),
        method: method,
        provider: "manual"
      };
      const updateData = {
        status: "paid",
        paidAt: serverTimestamp(),
        paymentStatus: "paid",
        paymentProvider: "manual",
        paymentMethodDetails: method,
        paymentHistory: arrayUnion(paymentHistoryEntry)
      };
      await updateDoc(invoiceRef, updateData);
      setCurrentInvoice((prev: any) => prev ? { 
        ...prev, 
        ...updateData,
        paymentHistory: [...(prev.paymentHistory || []), { ...paymentHistoryEntry, timestamp: new Date() }]
      } : null);
      toast.success(`${method} payment recorded!`, { id: "payment" });
      setIsPaymentSelectionOpen(false);
      if (id) {
        await updateJobFields(id!, { paymentStatus: "paid" }, profile!.businessId);
        setJob(prev => ({ ...prev, paymentStatus: "paid" }));
        updateStatus("paid");
      }
    } catch (error) {
      console.error("Manual payment error:", error);
      toast.error("Failed to record manual payment", { id: "payment" });
    }
  };

  const handleMarkAsPaid = async (invoice: any) => {
    if (!invoice?.id) return;
    try {
      toast.loading("Processing payment...", { id: "payment" });
      const invoiceRef = doc(db, "invoices", invoice.id);
      const paymentHistoryEntry = {
        action: "paid",
        timestamp: serverTimestamp(),
        method: "Admin Override",
        provider: "manual"
      };
      await updateInvoice(invoice.id, {
        status: "paid",
        paidAt: serverTimestamp(),
        paymentStatus: "paid",
        paymentProvider: "manual",
        paymentHistory: arrayUnion(paymentHistoryEntry)
      }, profile.businessId);
      setCurrentInvoice((prev: any) => prev ? { 
        ...prev, 
        status: "paid", 
        paymentStatus: "paid", 
        paymentProvider: "manual",
        paymentHistory: [...(prev.paymentHistory || []), { ...paymentHistoryEntry, timestamp: new Date() }]
      } : null);
      toast.success("Payment recorded successfully", { id: "payment" });
      
      // Sync to appointment status
      if (id) {
        await updateJobFields(id!, { paymentStatus: "paid" }, profile!.businessId);
        setJob(prev => ({ ...prev, paymentStatus: "paid" }));
        updateStatus("paid");
      }
    } catch (error) {
       console.error("Payment error", error);
       toast.error("Failed to process payment", { id: "payment" });
    }
  };

  const handleVoidPayment = async (invoice: any) => {
    if (!invoice?.id) return;
    try {
      toast.loading("Voiding payment...", { id: "payment-void" });
      const invoiceRef = doc(db, "invoices", invoice.id);
      
      const paymentHistoryEntry = {
        action: "voided",
        timestamp: serverTimestamp(),
        method: invoice.paymentMethodDetails || invoice.paymentProvider || "unknown"
      };

      const updateData = {
        status: "voided",
        paymentStatus: "voided",
        paymentHistory: arrayUnion(paymentHistoryEntry)
      };

      await updateInvoice(invoice.id, updateData, profile.businessId);
      setCurrentInvoice((prev: any) => prev ? { 
        ...prev, 
        ...updateData,
        paymentHistory: [...(prev.paymentHistory || []), { ...paymentHistoryEntry, timestamp: new Date() }]
      } : null);
      
      toast.success("Payment voided successfully", { id: "payment-void" });
      
      if (id) {
        await updateJobFields(id!, { paymentStatus: "voided" }, profile!.businessId);
        setJob(prev => ({ ...prev, paymentStatus: "voided" }));
        if (job.status === "paid") {
          updateStatus("completed"); 
        }
      }
    } catch (error) {
      console.error("Void payment error:", error);
      toast.error("Failed to void payment", { id: "payment-void" });
    }
  };

  const handleUndoPayment = async (invoice: any) => {
    if (!invoice?.id) return;
    try {
      toast.loading("Undoing payment...", { id: "payment-undo" });
      const invoiceRef = doc(db, "invoices", invoice.id);
      
      const paymentHistoryEntry = {
        action: "undone",
        timestamp: serverTimestamp(),
        method: invoice.paymentMethodDetails || invoice.paymentProvider || "unknown"
      };

      const updateData = {
        status: "pending",
        paymentStatus: "unpaid",
        paymentProvider: deleteField(),
        paymentMethodDetails: deleteField(),
        paidAt: deleteField(),
        transactionReference: deleteField(),
        paymentHistory: arrayUnion(paymentHistoryEntry)
      };

      await updateInvoice(invoice.id, updateData as any, profile.businessId);
      
      setCurrentInvoice((prev: any) => {
        if (!prev) return null;
        let newState = { ...prev };
        newState.status = "pending";
        newState.paymentStatus = "unpaid";
        delete newState.paymentProvider;
        delete newState.paymentMethodDetails;
        delete newState.paidAt;
        delete newState.transactionReference;
        newState.paymentHistory = [...(prev.paymentHistory || []), { ...paymentHistoryEntry, timestamp: new Date() }];
        return newState;
      });
      
      toast.success("Payment reversed to unpaid", { id: "payment-undo" });
      
      if (id) {
        await updateJobFields(id!, { paymentStatus: "unpaid" }, profile!.businessId);
        setJob(prev => ({ ...prev, paymentStatus: "unpaid" }));
        if (job.status === "paid") {
          updateStatus("completed");
        }
      }
    } catch (error) {
      console.error("Undo payment error:", error);
      toast.error("Failed to undo payment", { id: "payment-undo" });
    }
  };

  const handleDeleteInvoice = async (invoice: any) => {
    if (!invoice?.id) return;
    try {
      toast.loading("Deleting invoice...", { id: "delete-inv" });
      const invoiceRef = doc(db, "invoices", invoice.id);
      await softDeleteInvoice(invoice.id, profile.businessId);
      setIsInvoiceModalOpen(false);
      setCurrentInvoice(null);
      toast.success("Invoice deleted successfully", { id: "delete-inv" });
    } catch (error) {
       console.error("Delete error", error);
       toast.error("Failed to delete invoice", { id: "delete-inv" });
    }
  };

  const handleDownloadPDF = async (invoice: any) => {
    if (!invoice) return;
    setTimeout(async () => {
      const element = document.getElementById(`invoice-preview-content-detail-${invoice.id || 'new'}`);
      if (!element) {
        toast.error("Internal error: Capture target not found");
        return;
      }
      toast.loading("Generating Secure PDF...", { id: "pdf" });
      try {
        const html2canvas = (await import('html2canvas')).default;
        const { jsPDF } = await import('jspdf');

        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#F3F4F6",
          windowWidth: 1000 
        });
        
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF("p", "mm", "a4");
        
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`invoice_${invoice.id?.slice(-6) || 'new'}.pdf`);
        toast.success("PDF Downloaded!", { id: "pdf" });
      } catch (error) {
        console.error("PDF generation failed:", error);
        toast.error("Failed to generate PDF", { id: "pdf" });
      }
    }, 100);
  };

  const calculateCancellationFee = () => {
    if (!job?.scheduledAt) return;
    const scheduledDate = job.scheduledAt.toDate();
    const now = new Date();
    const hoursUntilJob = (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const afterCutoff = hoursUntilJob < (job.cancellationCutoffHours || 0);
    setIsAfterCutoff(afterCutoff);

    let fee = 0;
    if (job.cancellationFeeEnabled && afterCutoff) {
      if (job.cancellationFeeType === "percentage") {
        fee = (job.totalAmount * job.cancellationFeeAmount) / 100;
      } else {
        fee = job.cancellationFeeAmount;
      }
    }
    setCancellationFee(fee);
  };

  const handleWaitlistAction = async (action: "offerOriginal" | "offerSuggested" | "approveBackup" | "decline") => {
    setIsUpdating(true);
    try {
      let newDate = job.scheduledAt;

      if (action === "approveBackup" && job.waitlistInfo?.backupScheduledAt) {
        newDate = job.waitlistInfo.backupScheduledAt;
      }
      
      const newStatus = action === "decline" ? "declined" : "requested"; // moving to requested will trigger requested approval flow or accepted directly
      
      const updateData: any = { 
        status: action === "decline" ? "declined" : "scheduled", // skip straight to scheduled, accepted it is 
        updatedAt: serverTimestamp() 
      };

      if (action === "approveBackup") {
        updateData.scheduledAt = newDate;
        updateData["waitlistInfo.status"] = "accepted_backup";
      } else if (action === "offerOriginal") {
        updateData["waitlistInfo.status"] = "accepted_original";
      } else if (action === "decline") {
        updateData["waitlistInfo.status"] = "declined";
      }

      await updateJobFields(id!, updateData, profile!.businessId);

      // Optionally send SMS here: Let's log it to communicationLogs or similar, 
      // but actually we send SMS manually if possible
      if (job.customerPhone) {
         let message = "";
         let dateStr = newDate ? new Date(newDate.toDate()).toLocaleString() : "";
         if (action === "offerOriginal") {
           message = `Good news! The time you requested is now available. Your appointment has been scheduled for ${dateStr}.`;
         } else if (action === "approveBackup") {
           message = `Your backup time has been accepted for ${dateStr}.`;
         } else if (action === "offerSuggested") {
           message = `We have an opening available. Please call or text us back to confirm.`;
         } else if (action === "decline") {
           message = `Unfortunately, we are unable to fulfill your booking at this time.`;
         }

         if (message) {
           messagingService.sendSms({
             to: job.customerPhone,
             body: message
           }).catch(console.error);
         }
      }

      toast.success(action === "decline" ? "Waitlist request declined" : "Waitlist request processed");
      if (action !== "offerSuggested") {
         setJob(prev => ({ ...prev, status: updateData.status, scheduledAt: newDate }));
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to process action");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelJob = async () => {
    setIsUpdating(true);
    try {
      const docRef = doc(db, "appointments", id!);
      await updateDoc(docRef, { 
        status: "canceled",
        cancellationStatus: cancellationFee > 0 ? "applied" : "none",
        cancellationFeeApplied: cancellationFee,
        cancellationTimestamp: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      if (job.customerPhone) {
        const smsData = {
          clientName: job.customerName || "Customer",
          businessName: businessSettings?.businessName || "Flatline Mobile Detail",
          appointmentDate: job.scheduledAt ? job.scheduledAt.toDate().toLocaleDateString() : 'your appointment',
          appointmentTime: job.scheduledAt ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(job.scheduledAt.toDate()) : ''
        };
        messagingService.sendTemplateSms(
          job.customerPhone,
          "canceled",
          smsData,
          id,
          job.customerId
        ).catch(e => console.error("Cancel SMS failed:", e));
      }

      // Check Waitlist Opportunities
      if (job.scheduledAt) {
        try {
          const waitlistQuery = query(collection(db, "appointments"), where("status", "==", "waitlisted"));
          const waitlistSnap = await getDocs(waitlistQuery);
          const canceledDateStr = job.scheduledAt.toDate().toLocaleDateString();

          for (const wDoc of waitlistSnap.docs) {
            const wData = wDoc.data();
            let match = false;
            
            const reqDateStr = wData.scheduledAt?.toDate?.()?.toLocaleDateString() || new Date(wData.scheduledAt).toLocaleDateString();
            if (reqDateStr === canceledDateStr) match = true;
            else if (wData.waitlistInfo?.flexibleSameDay) {
              const bkpDateStr = wData.waitlistInfo?.backupScheduledAt?.toDate?.()?.toLocaleDateString() || wData.waitlistInfo?.backupScheduledAt ? new Date(wData.waitlistInfo.backupScheduledAt).toLocaleDateString() : null;
              if (bkpDateStr === canceledDateStr) match = true;
            }

            if (match) {
              // Notify Admins
              const adminsQuery = query(collection(db, "users"), where("role", "==", "admin"));
              const adminsSnap = await getDocs(adminsQuery);
              const notifyPromises = adminsSnap.docs.map(admin => addDoc(collection(db, "notifications"), {
                userId: admin.id,
                title: "Waitlist Opportunity",
                message: `Slot opened! Waitlisted client ${wData.customerName} may fit here for ${wData.serviceNames?.join(", ") || 'Service'} (Estimated ${wData.estimatedDuration || 120} mins).`,
                type: "waitlist_opportunity",
                relatedId: wDoc.id,
                relatedType: "appointment",
                createdAt: serverTimestamp(),
                read: false
              }));
              await Promise.all(notifyPromises);
            }
          }
        } catch (e) {
          console.error("Error processing waitlist match:", e);
        }
      }

      toast.success("Job canceled successfully");
      setShowCancelDialog(false);
    } catch (error) {
      console.error("Error canceling job:", error);
      toast.error("Failed to cancel job");
    } finally {
      setIsUpdating(false);
    }
  };

  const checkRequiredForms = (stage: string) => {
    const applicableTemplates = formTemplates.filter(t => {
      // Check if template is assigned to any of the job's services or addons
      const hasService = t.assignedServices?.some((sid: string) => job.serviceIds?.includes(sid));
      const hasAddon = t.assignedAddons?.some((aid: string) => job.addOnIds?.includes(aid));
      
      // Check client type assignment
      const matchesClientType = true; // Simplified for unified clients, or we could check clientTypeId

      // A form is required if it matches the client type AND (it's assigned to a service/addon OR it has no specific service/addon assignments)
      const isAssignedToSpecifics = (t.assignedServices?.length > 0 || t.assignedAddons?.length > 0);
      const assignmentMatches = isAssignedToSpecifics ? (hasService || hasAddon) : true;

      return matchesClientType && assignmentMatches && t.enforcement === stage;
    });

    const unsigned = applicableTemplates.filter(t => 
      !signedForms.some(sf => sf.formId === t.id && sf.formVersion === t.version)
    );

    if (unsigned.length > 0) {
      setShowFormSigner(unsigned[0]);
      toast.error(`Required form: ${unsigned[0].title} must be signed ${stage.replace("_", " ")}`);
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (!id || authLoading || !profile) return;
    
    // Fetch templates and signed forms once to save quota
    const fetchMetadata = async () => {
      try {
        const [templatesSnap, signedSnap] = await Promise.all([
          getDocs(query(collection(db, "form_templates"), where("isActive", "==", true))),
          getDocs(query(collection(db, "signed_forms"), where("appointmentId", "==", id)))
        ]);

        setFormTemplates(templatesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setSignedForms(signedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching job metadata:", error);
      }
    };

    fetchMetadata();

    // Fetch all services and addons for manual addition
    const fetchServices = async () => {
      try {
        const [servSnap, addSnap] = await Promise.all([
          getDocs(collection(db, "services")),
          getDocs(collection(db, "addons"))
        ]);
        setAllServices(servSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setAllAddons(addSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Error fetching services:", err);
      }
    };
    fetchServices();

    // Real-time job listener
    const unsubscribeJob = onJobSnapshot(id!, profile!.businessId, (jobData) => {
      if (jobData) {
        setJob(jobData);
        console.log("Job loaded:", jobData.id);
        setProductCosts(jobData.productCosts || []);
        setPricingAnalysis(jobData.pricingAnalysis || null);
        
        if (jobData.vin) {
          setDecodedVin(prev => {
            if (prev?.vin === jobData.vin) return prev;
            decodeVin(jobData.vin!).then(setDecodedVin);
            return prev;
          });
        }
        setLoading(false);
      } else {
        toast.error("Job not found");
        navigate("/calendar");
      }
    });

    const logsQuery = query(collection(db, "communication_logs"), where("appointmentId", "==", id), limit(50));
    const unsubscribeLogs = onSnapshot(logsQuery, (snap) => {
      setCommunicationLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const db = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return db - da; // Descending
      }));
    }, (error: any) => {
      if (error?.code === 'cancelled' || error?.message?.includes('CANCELLED') || error?.message?.includes('idle stream')) {
        return; // Ignore idle stream disconnects
      }
      console.error("Error listening to logs:", error);
    });

    return () => {
      unsubscribeJob();
      unsubscribeLogs();
    };
  }, [id, profile, authLoading]);

  // Derive stable, highly unique list of vehicles for the selector
  const derivedVehicles = useMemo(() => {
    if (!job) return [];
    
    let rawNames: string[] = [];
    if (job.vehicleNames && Array.isArray(job.vehicleNames) && job.vehicleNames.length > 0) {
      rawNames = job.vehicleNames;
    } else if (job.vehicleInfo) {
      const parts = job.vehicleInfo.split(',');
      if (parts.length > 1) {
        rawNames = parts.map((p: string) => p.trim()).filter(Boolean);
      } else {
        rawNames = [job.vehicleInfo.trim()];
      }
    }

    // Convert raw names into reliable objects with guaranteed unique IDs
    return rawNames.map((name, index) => {
      // Try to match with an existing vehicleId if it exists by index, otherwise generate a stable fallback ID
      const stableId = (job.vehicleIds && job.vehicleIds[index]) ? job.vehicleIds[index] : `veh-${index}-${name.replace(/\s+/g, '-').toLowerCase()}`;
      return { id: stableId, name: name.trim() };
    });
  }, [job]);

  // Handle active vehicle initialization for multi-asset jobs based strictly on ID
  useEffect(() => {
    if (derivedVehicles.length > 0 && !activeVehicleId) {
      setActiveVehicleId(derivedVehicles[0].id);
    }
  }, [derivedVehicles, activeVehicleId]);

  const handleSaveSignature = async (dataUrl: string) => {
    try {
      const docRef = doc(db, "appointments", id!);
      
      // Calculate commission based on settings
      let commissionAmount = 0;
      try {
        const settingsSnap = await getDoc(doc(db, "settings", "business"));
        if (settingsSnap.exists()) {
          const settings = settingsSnap.data();
          const rate = settings.commissionRate || 0;
          const type = settings.commissionType || "percentage";
          
          if (type === "percentage") {
            commissionAmount = (job.totalAmount * rate) / 100;
          } else {
            commissionAmount = rate;
          }
        }
      } catch (err) {
        console.error("Error calculating commission:", err);
      }

      await updateDoc(docRef, { 
        signature: dataUrl,
        status: "completed",
        completedAt: serverTimestamp(),
        commissionAmount: commissionAmount
      });
      
      // Auto-convert to invoice
      await handleConvertJobToInvoice();
      
      // Call maintenance automation
      if (job) {
        await processMaintenanceAutomation(job);
      }

      setShowSignature(false);
      toast.success("Job completed with signature!");
    } catch (error) {
      toast.error("Failed to save signature");
    }
  };

  const handlePayment = async () => {
    try {
      const docRef = doc(db, "appointments", id!);
      await updateDoc(docRef, { 
        status: "paid",
        paymentMethod,
        paidAt: serverTimestamp()
      });
      
      // Add loyalty points for clients
      if (job.clientId || job.customerId) {
        await addLoyaltyPoints(job.clientId || job.customerId, job.totalAmount);
      }

      if (job.customerEmail) {
        messagingService.sendEmail({
          to: job.customerEmail,
          subject: `${businessSettings?.businessName || 'Us'} - Payment Receipt`,
          html: `<p>Hi ${job.customerName},</p><p>We received your payment of <strong>${formatCurrency(job.totalAmount)}</strong>.</p><p>Thank you for choosing ${businessSettings?.businessName || 'Us'}!</p>`
        }).catch(e => console.error("Receipt email failed", e));
      }

      if (job.customerPhone) {
        messagingService.sendSms({
          to: job.customerPhone,
          body: `Flatline Mobile Detail: Payment received. Thank you! We appreciate your business. Reply STOP to opt out.`
        }).then(() => console.log("Payment Receipt SMS sent successfully."))
          .catch(e => console.error("Receipt SMS failed:", e));
      }
      
      toast.success("Payment recorded and loyalty points added!");
    } catch (error) {
      toast.error("Failed to record payment");
    }
  };

  const handleAddServiceManually = async () => {
    if (!selectedServiceToAdd || !job) return;
    setIsUpdating(true);
    try {
      const [type, serviceId] = selectedServiceToAdd.split(":");
      const sourceList = type === "service" ? allServices : allAddons;
      const originalItem = sourceList.find(s => s.id === serviceId);
      
      if (!originalItem) return;

      const newItem = {
        id: `${type}-${Date.now()}`,
        name: originalItem.name,
        price: Number(originalItem.basePrice || 0),
        qty: 1,
        vehicleName: selectedVehicleForAdd || (job.vehicleNames && job.vehicleNames[0]) || "Main Asset",
        source: "deployment_intelligence",
        description: originalItem.description || ""
      };

      const currentTotal = Number(job.totalAmount || 0);
      const currentBase = Number(job.baseAmount || 0);
      
      const updateData: any = {
        updatedAt: serverTimestamp(),
        totalAmount: currentTotal + newItem.price,
        baseAmount: currentBase + newItem.price
      };

      if (type === "service") {
        updateData.serviceSelections = [...(job.serviceSelections || []), newItem];
        updateData.serviceNames = [...(job.serviceNames || []), newItem.name];
        updateData.serviceIds = [...(job.serviceIds || []), serviceId];
      } else {
        updateData.addOnSelections = [...(job.addOnSelections || []), newItem];
        updateData.addOnNames = [...(job.addOnNames || []), newItem.name];
        updateData.addOnIds = [...(job.addOnIds || []), serviceId];
      }

      await updateJobFields(id!, updateData, profile!.businessId);
      toast.success(`${newItem.name} added to deployment`);
      setShowAddServiceDialog(false);
      setSelectedServiceToAdd("");
    } catch (err) {
      console.error("Manual Add Error:", err);
      toast.error("Failed to add service manually");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddAdjustment = async () => {
    if (!job || !adjAmount) return;
    const amount = parseFloat(adjAmount);
    if (isNaN(amount) || amount === 0) {
      toast.error("Please enter a valid non-zero amount");
      return;
    }

    setIsUpdating(true);
    try {
      const newAdj = {
        id: `adj-${Date.now()}`,
        source: adjSource,
        amount: amount,
      };

      const currentAdjustments = job.priceAdjustments || [];
      const newAdjustments = [...currentAdjustments, newAdj];

      await updateJobFields(id!, {
        priceAdjustments: newAdjustments,
        totalAmount: (job.totalAmount || 0) + amount,
        baseAmount: (job.baseAmount || 0) + amount,
        updatedAt: serverTimestamp()
      }, profile!.businessId);

      toast.success("Pricing adjustment applied");
      setShowAdjustmentDialog(false);
      setAdjAmount("");
      setAdjSource("manual");
    } catch (err) {
      console.error("Adjustment Error:", err);
      toast.error("Failed to apply pricing adjustment");
    } finally {
      setIsUpdating(false);
    }
  };

  const formatStatusText = (s: string) => {
    if (!s) return "Unknown";
    if (s === "en_route") return "In Route";
    if (s === "in_progress") return "Start Job";
    return s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  const getPreviousStatus = (currentStatus: string) => {
    const sequence = [
      'requested',
      'pending_approval',
      'scheduled',
      'en_route',
      'arrived',
      'in_progress',
      'completed',
      'pending_payment',
      'paid'
    ];
    const currentIndex = sequence.indexOf(currentStatus);
    if (currentIndex > 0) {
      return sequence[currentIndex - 1];
    }
    if (currentStatus === 'confirmed') return 'scheduled';
    return null;
  };

  const handleRevertStatus = () => {
    const prevStatus = getPreviousStatus(job.status);
    if (prevStatus) {
      handleStatusChangeRequest(prevStatus, true);
    } else {
      toast.error("No previous status found to revert to.");
    }
  };

  const handleStatusChangeRequest = (newStatus: string, isBackward: boolean = false) => {
    if (isBackward) {
      setPendingStatusChange({
        newStatus,
        oldStatus: job.status,
        actionText: `Are you sure you want to change status from ${formatStatusText(job.status)} back to ${formatStatusText(newStatus)}?`
      });
    } else {
      updateStatus(newStatus, job.status);
    }
  };

  const updateStatus = async (newStatus: string, oldStatusOverride?: string) => {
    setIsUpdating(true);
    try {
      const currentStatus = oldStatusOverride || job.status;
      
      const statusLogEntry = {
          oldStatus: currentStatus,
          newStatus: newStatus,
          timestamp: new Date().toISOString(),
      };

      const updates: any = { 
        status: newStatus,
        updatedAt: serverTimestamp(),
        [`statusHistory.${newStatus}`]: serverTimestamp()
      };
      
      const currentLog = job.statusActivityLog || [];
      updates.statusActivityLog = [...currentLog, statusLogEntry];
      
      const smsData = {
        clientName: job.customerName || "Customer",
        businessName: businessSettings?.businessName || "Flatline Mobile Detail"
      };

      if (newStatus === "canceled") {
         try {
           const { handleWaitlistRouting } = await import("../services/waitlistRouting");
           const { createNotification } = await import("../services/notificationService");
           const adminsQuery = query(collection(db, "users"), where("role", "==", "admin"));
           const adminsSnap = await getDocs(adminsQuery);
           const promises = adminsSnap.docs.map(admin => 
             createNotification({
               userId: admin.id,
               title: "Appointment Canceled",
               message: `Appointment for ${job.customerName} was canceled.`,
               type: "cancellation",
               category: "Schedule Changes",
               relatedId: id,
               relatedType: "appointment",
               appointmentId: id,
               clientName: job.customerName
             }, profile!.businessId)
           );
           await Promise.all(promises);
           await handleWaitlistRouting(job, profile!.businessId);
         } catch(e) {
           console.error("Failed to notify about cancellation", e);
         }
      }

      if (newStatus === "completed") {
        await handleConvertJobToInvoice();
        
        if (job.customerEmail) {
          messagingService.sendEmail({
            to: job.customerEmail,
            subject: `Job Completed - Thank you from ${businessSettings?.businessName || 'Us'}`,
            html: `<p>Hi ${job.customerName},</p><p>We have successfully completed your requested service(s). Thank you for your business!</p><p>Your invoice will be sent shortly if it hasn't been already.</p>`
          }).catch(e => console.error("Completed email failed", e));
        }

        if (job.customerPhone) {
          messagingService.sendTemplateSms(
            job.customerPhone,
            "completed",
            smsData,
            profile!.businessId,
            id,
            job.customerId
          ).catch(e => console.error("Completed SMS template failed:", e));

          // Also allow review request
          setTimeout(() => {
            messagingService.sendTemplateSms(
              job.customerPhone,
              "review_request",
              { ...smsData, reviewLink: "https://g.page/r/your-review-link" }, // Could pull from settings
              profile!.businessId,
              id,
              job.customerId
            ).catch(e => console.error("Review request SMS failed: ", e));
          }, 3000);
        }
      }

      if (newStatus === "en_route" && job.customerPhone) {
        messagingService.sendTemplateSms(
          job.customerPhone,
          "on_the_way",
          smsData,
          profile!.businessId,
          id,
          job.customerId
        ).catch(e => console.error("En route SMS failed:", e));
      }

      if (newStatus === "in_progress" && job.customerPhone) {
        messagingService.sendTemplateSms(
          job.customerPhone,
          "started",
          smsData,
          profile!.businessId,
          id,
          job.customerId
        ).catch(e => console.error("Started SMS failed:", e));
      }

      await updateJobFields(id!, updates, profile!.businessId);
      toast.success(`Status updated to ${formatStatusText(newStatus)}`);
      setPendingStatusChange(null);
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteJob = async () => {
    console.log("Attempting to delete job:", id);
    if (!id) {
      toast.error("Invalid job ID");
      return;
    }
    
    try {
      const { handleWaitlistRouting } = await import("../services/waitlistRouting");
      const { createNotification } = await import("../services/notificationService");
      const adminsQuery = query(collection(db, "users"), where("role", "==", "admin"));
      const adminsSnap = await getDocs(adminsQuery);
      const promises = adminsSnap.docs.map(admin => 
        createNotification({
          userId: admin.id,
          title: "Appointment Deleted",
          message: `Appointment for ${job?.customerName} was deleted.`,
          type: "cancellation",
          category: "Schedule Changes",
          relatedId: id,
          relatedType: "appointment",
          appointmentId: id,
          clientName: job?.customerName
        }, profile!.businessId)
      );
      await Promise.all(promises);

      await softDeleteJob(id, profile!.businessId);
      
      if (job) await handleWaitlistRouting(job, profile!.businessId);
      
      toast.success("Job deleted successfully");
      navigate("/calendar");
    } catch (error) {
      console.error("Error deleting job:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `appointments/${id}`);
      } catch (err: any) {
        toast.error(`Failed to delete job: ${err.message}`);
      }
    }
  };

  const removeBillableItem = async (itemId: string, type: "service" | "addon" | "adjustment" | "mystery") => {
    try {
      const docRef = doc(db, "appointments", id!);
      
      if (type === "mystery") {
        const itemsTotal = [...(job.serviceSelections || []), ...(job.addOnSelections || [])].reduce((acc, curr) => acc + (curr.price * (curr.qty || 1)), 0);
        const adjTotal = (job.priceAdjustments || []).reduce((acc: number, curr: any) => acc + curr.amount, 0);
        
        const newBase = itemsTotal + adjTotal;
        const discountAmount = job.discountAmount || 0;
        const updateData = {
          baseAmount: newBase,
          totalAmount: Math.max(0, newBase - discountAmount),
          updatedAt: serverTimestamp()
        };
        await updateDoc(docRef, updateData);
        setJob(prev => ({ ...prev, ...updateData }));
        toast.success(`Custom override removed`);
        return;
      }

      if (type === "adjustment") {
        const currentAdjustments = job.priceAdjustments || [];
        const removedAdj = currentAdjustments.find((a: any) => a.id === itemId);
        if (!removedAdj) return;
        
        const updatedAdjustments = currentAdjustments.filter((a: any) => a.id !== itemId);
        const amountToRemove = removedAdj.amount || 0;
        
        const updateData = {
          priceAdjustments: updatedAdjustments,
          totalAmount: Math.max(0, (job.totalAmount || 0) - amountToRemove),
          baseAmount: Math.max(0, (job.baseAmount || 0) - amountToRemove)
        };
        await updateDoc(docRef, updateData);
        setJob(prev => ({ ...prev, ...updateData }));
        toast.success(`Adjustment removed`);
        return;
      }

      const currentSelections = type === "service" ? (job.serviceSelections || []) : (job.addOnSelections || []);
      const removedItem = currentSelections.find((s: any) => (s.id === itemId || (!s.id && s.name === itemId)));

      if (!removedItem) {
        toast.error("Item not found");
        return;
      }

      const updatedSelections = currentSelections.filter((s: any) => (s.id ? s.id !== itemId : s.name !== itemId));
      const priceToRemove = type === "service" 
        ? (removedItem.price || 0) 
        : ((removedItem.price || 0) * (removedItem.qty || 1));

      const updateData: any = {
        totalAmount: Math.max(0, (job.totalAmount || 0) - priceToRemove),
        baseAmount: Math.max(0, (job.baseAmount || 0) - priceToRemove)
      };

      if (type === "service") {
        updateData.serviceSelections = updatedSelections;
        const newNames = [...(job.serviceNames || [])];
        const nameIdx = newNames.indexOf(removedItem.name);
        if (nameIdx !== -1) {
          newNames.splice(nameIdx, 1);
        }
        updateData.serviceNames = newNames;
      } else {
        updateData.addOnSelections = updatedSelections;
      }

      await updateDoc(docRef, updateData);
      setJob(prev => ({ ...prev, ...updateData }));
      toast.success(`${removedItem.name} removed from protocol`);
    } catch (err) {
      console.error("Error removing item:", err);
      toast.error("Failed to remove item");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const statusColors: any = {
    scheduled: "bg-white text-black border-black",
    confirmed: "bg-black text-white border-black",
    en_route: "bg-orange-600 text-white border-orange-700",
    arrived: "bg-blue-600 text-white border-blue-700",
    in_progress: "bg-primary text-white border-primary border-2",
    completed: "bg-green-600 text-white border-green-700",
    paid: "bg-emerald-600 text-white border-emerald-700",
    canceled: "bg-red-600 text-white border-red-700",
    suggested: "bg-indigo-600 text-white border-indigo-700",
    requested: "bg-orange-600 text-white border-orange-700",
    waitlisted: "bg-purple-600 text-white border-purple-700",
    pending_approval: "bg-orange-600 text-white border-orange-700",
    approved: "bg-green-600 text-white border-green-700",
    declined: "bg-red-600 text-white border-red-700",
    reschedule_suggested: "bg-pink-600 text-white border-pink-700",
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(-1)} 
            className="rounded-2xl w-12 h-12 bg-card border border-border text-gray-400 hover:text-primary transition-all shadow-sm"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <div>
            <div className="flex items-center gap-4 mb-2">
              <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase font-heading">
                Deployment <span className="text-primary italic">Intelligence</span>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-white font-black tracking-[0.2em] uppercase text-[10px] flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
                Job ID: #{id?.slice(-6).toUpperCase()}
              </p>
              {job.followUpSent && (
                <Badge variant="secondary" className="bg-primary text-white border-primary text-[9px] font-black uppercase tracking-widest flex items-center gap-1 px-3 py-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Follow-up Sent
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Live Job Command Summary */}
      <div className="sticky top-4 z-40 bg-black/90 backdrop-blur-xl border border-white/10 rounded-3xl p-4 shadow-2xl shadow-black flex flex-wrap lg:flex-nowrap items-center gap-5 justify-between animate-in slide-in-from-top-4 duration-500 overflow-hidden">
        <div className="flex flex-wrap items-center gap-6 flex-1 min-w-0">
          <div className="flex flex-col min-w-[140px] max-w-[200px] border-r border-white/5 pr-4 shrink-0">
            <span className="text-[9px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">Target</span>
            <span className="text-white font-black text-sm truncate uppercase tracking-tight">{getClientDisplayName(job)}</span>
          </div>

          <div className="flex flex-col min-w-[140px] max-w-[200px] border-r border-white/5 pr-4 shrink-0">
            <span className="text-[9px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">Asset(s)</span>
            <span className="text-white font-black text-sm truncate uppercase tracking-tight" title={job.vehicleInfo || (job.vehicleNames?.join(", ")) || "Asset"}>
              {job.vehicleInfo || (job.vehicleNames?.join(", ")) || "Asset"}
            </span>
          </div>

          <div className="flex flex-col min-w-[150px] max-w-[250px] hidden md:flex border-r border-white/5 pr-4 shrink-0">
            <span className="text-[9px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">Location</span>
            <span className="text-white font-black text-sm truncate uppercase tracking-tight" title={cleanAddress(job.address)}>
              {cleanAddress(job.address)}
            </span>
          </div>

          <div className="flex flex-col min-w-[100px] border-r border-white/5 pr-4 shrink-0">
            <span className="text-[9px] text-primary/60 font-black uppercase tracking-[0.2em] mb-1">Intelligence</span>
            <Dialog>
              <DialogTrigger render={
                <Button variant="outline" className="h-9 border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-xl font-black uppercase tracking-widest text-[9px] px-4 transition-all">
                  <Target className="w-3.5 h-3.5 mr-2" />
                  Intel Hub
                </Button>
              } />
              <DialogContent className="max-w-md bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] shadow-2xl p-0 overflow-hidden">
                <DialogHeader className="bg-black/40 border-b border-white/5 p-8 pb-6">
                  <div className="flex flex-col gap-1">
                    <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">Intelligence Hub</DialogTitle>
                    <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Job & Target Data Management</p>
                  </div>
                </DialogHeader>
                <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                  {/* Target Intel Section */}
                  <div className="space-y-4">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-2">Primary Target</Label>
                    <div className="flex items-center gap-4 text-white group">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-primary transition-colors border border-white/5">
                        <Phone className="w-4 h-4" />
                      </div>
                      <a href={`tel:${job.customerPhone}`} className="hover:text-primary transition-colors font-black uppercase tracking-tight text-sm">
                        {job.customerPhone || "Unspecified"}
                      </a>
                    </div>
                    <div className="flex items-center gap-4 text-white group">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-primary transition-colors border border-white/5">
                        <Mail className="w-4 h-4" />
                      </div>
                      <a href={`mailto:${job.customerEmail}`} className="hover:text-primary transition-colors font-black uppercase tracking-tight text-sm">
                        {job.customerEmail || "Unspecified"}
                      </a>
                    </div>
                    <div className="flex items-start gap-4 text-white group pt-2">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-primary transition-colors shrink-0 border border-white/5">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary transition-colors font-black uppercase tracking-tight text-sm block mb-4"
                        >
                          {cleanAddress(job.address)}
                        </a>
                        <Button 
                          variant="outline" 
                          size="lg" 
                          className="h-12 border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-xl font-black uppercase tracking-widest text-[10px] w-full shadow-lg shadow-primary/10"
                          onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`, '_blank')}
                        >
                          <Navigation className="w-4 h-4 mr-2" />
                          Plot Tactical Route
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-white/5" />

                  {/* Asset Profile Section */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <Label className="text-[9px] font-black uppercase tracking-widest text-white/30">Asset Intelligence</Label>
                    </div>
                    
                    <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">VIN / Asset ID</Label>
                        <div className="flex gap-3">
                          <Input 
                            placeholder="Enter VIN" 
                            className="bg-black/40 border-white/10 text-white rounded-xl h-12 uppercase font-mono text-sm focus:ring-primary/50"
                            defaultValue={job.vin}
                            id="vin-input-hub"
                          />
                          <Button 
                            className="bg-primary text-white font-black h-12 px-4 rounded-xl uppercase tracking-widest text-[9px] hover:bg-red-700 shrink-0"
                            onClick={async () => {
                              const vin = (document.getElementById("vin-input-hub") as HTMLInputElement).value;
                              if (vin) {
                                const data = await decodeVin(vin);
                                if (data) {
                                  setDecodedVin(data);
                                  toast.success("VIN Decoded!");
                                } else {
                                  toast.error("Invalid VIN or decoding failed");
                                }
                              }
                            }}
                          >
                            Decode
                          </Button>
                        </div>
                      </div>

                      {decodedVin && (
                        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 grid grid-cols-2 gap-4 text-[10px] font-black uppercase tracking-[0.1em]">
                          <div className="text-white/40">Make: <span className="text-white">{decodedVin.make}</span></div>
                          <div className="text-white/40">Model: <span className="text-white">{decodedVin.model}</span></div>
                          <div className="text-white/40">Year: <span className="text-white">{decodedVin.year}</span></div>
                          <div className="text-white/40">Type: <span className="text-white">{decodedVin.type}</span></div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">RO Identifier</Label>
                        <Input 
                          placeholder="Repair Order #" 
                          className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-black uppercase tracking-widest text-sm"
                          defaultValue={job.roNumber || (job as any).ro || (job as any).ro_number || ""}
                          id="ro-input-hub"
                        />
                      </div>

                      <Button 
                        className="w-full bg-white text-black font-black h-14 rounded-2xl uppercase tracking-[0.15em] text-[11px] shadow-xl hover:bg-gray-100 transition-all mt-4"
                        onClick={async () => {
                          const vin = (document.getElementById("vin-input-hub") as HTMLInputElement).value;
                          const roNumber = (document.getElementById("ro-input-hub") as HTMLInputElement).value;
                          await updateJob(id!, { vin, roNumber }, profile!.businessId);
                          setJob(prev => ({ ...prev, vin, roNumber }));
                          toast.success("Intelligence Updated!");
                        }}
                      >
                        Commit Updates
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex flex-col flex-1 min-w-[200px] hidden xl:flex">
            <span className="text-[9px] text-primary/60 font-black uppercase tracking-[0.2em] mb-1">Active Protocols</span>
            <span className="text-primary font-black text-sm truncate uppercase tracking-tight" title={[...(job.serviceNames || []), ...(job.addOnNames || [])].join(", ") || "No protocols initiated"}>
              {[...(job.serviceNames || []), ...(job.addOnNames || [])].join(", ") || "No protocols initiated"}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-6 shrink-0">
          <div className="flex flex-col min-w-[120px]">
            <span className="text-[9px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">Status</span>
            <div className="flex items-center gap-3">
              <Badge className={cn("text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded border-none w-fit shadow-md shrink-0", statusColors[job.status] || "bg-gray-500 text-white")}>
                {job.status?.replace("_", " ")}
              </Badge>

              <div className="flex items-center gap-2">
                {job.status === "scheduled" && (
                  <Button onClick={() => handleStatusChangeRequest("confirmed")} disabled={isUpdating} className="bg-white text-black hover:bg-gray-100 font-black uppercase tracking-widest text-[9px] h-9 px-4 rounded-xl shadow-lg shadow-black/20 whitespace-nowrap">
                    Confirm
                  </Button>
                )}
                {(job.status === "confirmed" || job.status === "scheduled") && (
                  <Button 
                    onClick={() => {
                      if (checkRequiredForms("before_start")) {
                        handleStatusChangeRequest("en_route");
                      }
                    }} 
                    disabled={isUpdating} 
                    className="bg-primary hover:bg-red-700 text-white font-black uppercase tracking-widest text-[9px] h-9 px-4 rounded-xl shadow-lg shadow-primary/20 whitespace-nowrap"
                  >
                    Initiate Route
                  </Button>
                )}
                {(job.status === "completed" || job.status === "paid" || job.status === "pending_payment") && (
                  <Button 
                    variant="outline"
                    onClick={() => handleConvertJobToInvoice()} 
                    disabled={isGeneratingInvoice} 
                    className="border-primary/30 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl font-black uppercase tracking-widest text-[9px] h-9 px-4 transition-all whitespace-nowrap"
                  >
                    {isGeneratingInvoice ? "Loading..." : "View Invoice"}
                  </Button>
                )}
                {(job.status === "completed" || job.status === "pending_payment") && job.status !== "paid" && (
                  <Button 
                    onClick={() => handleConvertJobToInvoice(true)} 
                    disabled={isGeneratingInvoice}
                    className="bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-widest text-[9px] h-9 px-4 rounded-xl shadow-lg shadow-green-500/20 whitespace-nowrap"
                  >
                    Accept Payment
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger render={
                    <Button variant="outline" className="border-white/10 bg-white/5 text-white/60 hover:text-white rounded-xl font-black uppercase tracking-widest text-[9px] h-9 px-4 transition-all whitespace-nowrap">
                      Options
                    </Button>
                  } />
                  <DropdownMenuContent align="end" className="bg-card border-white/10 text-white w-56 p-2 rounded-2xl shadow-2xl z-[50]">
                    <DropdownMenuItem 
                      onSelect={() => {
                        calculateCancellationFee();
                        setShowCancelDialog(true);
                      }} 
                      className="text-orange-500 font-bold focus:bg-orange-500/10 focus:text-orange-400 rounded-xl cursor-pointer"
                      disabled={job.status === "canceled" || job.status === "completed" || job.status === "paid"}
                    >
                      <AlertCircle className="w-4 h-4 mr-2" />
                      Cancel Mission
                    </DropdownMenuItem>
                    <DeleteConfirmationDialog
                      isNativeButton={false}
                      trigger={
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500 font-bold focus:bg-red-500/10 focus:text-red-400 rounded-xl cursor-pointer text-[10px]">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Terminate Mission
                        </DropdownMenuItem>
                      }
                      title="Terminate Mission?"
                      itemName={job.customerName || "this job"}
                      onConfirm={handleDeleteJob}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
          <div className="flex flex-col min-w-[120px] items-end border-l border-white/10 pl-6 shrink-0 relative">
            <span className="text-[9px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">Running Total</span>
            <span className="text-2xl text-primary font-black leading-none">{formatCurrency(job.totalAmount || 0)}</span>
            
            {/* Real-time Payment Status from Invoice or Job */}
            {(currentInvoice?.paymentStatus || job?.paymentStatus) && (
               <div className="absolute -bottom-6 right-0">
                 <Badge 
                  className={cn(
                    "text-[8px] font-black uppercase tracking-widest px-2 py-0.5",
                    (currentInvoice?.paymentStatus || job?.paymentStatus) === "paid" ? "bg-emerald-600" :
                    (currentInvoice?.paymentStatus || job?.paymentStatus) === "voided" ? "bg-amber-600" :
                    (currentInvoice?.paymentStatus || job?.paymentStatus) === "refunded" ? "bg-purple-600" :
                    "bg-gray-600"
                  )}
                 >
                   {(currentInvoice?.paymentStatus || job?.paymentStatus)}
                 </Badge>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Asset Selector: Clean ID-based Implementation moved to separate row */}
      {derivedVehicles.length > 1 && (
        <div className="w-full">
          <div className="p-3 bg-card/50 backdrop-blur-md border border-white/5 rounded-[2.5rem] shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
              <Target className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 overflow-x-auto custom-scrollbar flex gap-3 p-1">
              {derivedVehicles.map((vehicle) => {
                const isActive = activeVehicleId === vehicle.id;
                return (
                  <Button
                    key={vehicle.id}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-12 px-6 rounded-2xl font-black uppercase tracking-[0.15em] text-[10px] transition-all duration-300 whitespace-nowrap shrink-0 border",
                      isActive 
                        ? "bg-primary text-white border-primary shadow-xl shadow-primary/40 scale-105 z-10" 
                        : "bg-black/40 text-gray-500 border-white/5 hover:bg-white/5 hover:text-white"
                    )}
                    onClick={() => {
                      setActiveVehicleId(vehicle.id);
                      toast.success("Active Vehicle Changed", { duration: 1500 });
                    }}
                  >
                    {vehicle.name}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      )}


      <Tabs defaultValue="checklist" className="w-full">
        <div className="flex justify-center mb-10 px-4">
          <TabsList className="w-full max-w-5xl bg-card border border-border p-1.5 h-16 rounded-3xl shadow-xl">
            <TabsTrigger value="checklist" className="flex-1 rounded-2xl data-[state=active]:bg-primary data-[state=active]:text-white font-black uppercase tracking-widest text-[10px] transition-all duration-300 h-full">
              <ClipboardList className="w-4 h-4 mr-2" />
              Operations
            </TabsTrigger>
            <TabsTrigger value="photos" className="flex-1 rounded-2xl data-[state=active]:bg-primary data-[state=active]:text-white font-black uppercase tracking-widest text-[10px] transition-all duration-300 h-full">
              <Camera className="w-4 h-4 mr-2" />
              Visual Intel
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1 rounded-2xl data-[state=active]:bg-primary data-[state=active]:text-white font-black uppercase tracking-widest text-[10px] transition-all duration-300 h-full">
              <AlertCircle className="w-4 h-4 mr-2" />
              Field Notes
            </TabsTrigger>
            <TabsTrigger value="forms" className="flex-1 rounded-2xl data-[state=active]:bg-primary data-[state=active]:text-white font-black uppercase tracking-widest text-[10px] transition-all duration-300 h-full">
              <ShieldCheck className="w-4 h-4 mr-2 hidden md:inline-block" />
              <span className="hidden md:inline-block">Tactical </span>Forms
            </TabsTrigger>
            <TabsTrigger value="ai_upsell" className="flex-1 rounded-2xl data-[state=active]:bg-primary data-[state=active]:text-white font-black uppercase tracking-widest text-[10px] transition-all duration-300 h-full">
              <Scan className="w-4 h-4 mr-2 hidden md:inline-block" />
              Revenue Intel
            </TabsTrigger>
          </TabsList>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 gap-y-12 items-start mt-6">
        {/* Center Column: Operations & Intelligence - Now Primary Wide Area */}
        <div className="lg:col-span-9 order-last lg:order-none min-w-0 pt-0">
          <TabsContent value="ai_upsell" className="mt-0 space-y-12">
            <JobRevenueIntel
              technicianAssessment={technicianAssessment}
              setTechnicianAssessment={setTechnicianAssessment}
              assessmentTags={assessmentTags}
              toggleAssessmentTag={toggleAssessmentTag}
              assessmentImages={assessmentImages}
              handleAssessmentImageUpload={handleAssessmentImageUpload}
              removeAssessmentImage={removeAssessmentImage}
              isGeneratingUpsells={isGeneratingUpsells}
              generateUpsells={async () => {
                const hasAssessmentData = technicianAssessment.trim() !== "" || assessmentTags.length > 0 || assessmentImages.length > 0;
                if (!hasAssessmentData || isGeneratingUpsells) return;
                setIsGeneratingUpsells(true);
                try {
                  const structuredPayload = {
                    services: job.serviceNames || [],
                    addOns: job.addOnNames || [],
                    totalPrice: job.totalAmount || 0,
                    travelFee: job.travelFee || 0,
                    vehicle: {
                      year: job.vehicleInfo?.split(" ")[0],
                      make: job.vehicleInfo?.split(" ")[1],
                      model: job.vehicleInfo?.split(" ").slice(2).join(" "),
                      size: job.vehicleSize
                    },
                    customerType: job.clientType || "Retail"
                  };
                  const fullAssessmentContext = `${assessmentTags.length > 0 ? 'Tags: ' + assessmentTags.join(', ') + '. ' : ''}${technicianAssessment}`;
                  const response = await getRevenueOptimization(fullAssessmentContext, structuredPayload, productCosts, businessSettings, assessmentImages);
                  setRevenueProtocol(response);
                  setRecommendations(response.recommendedUpsells);
                  if (response.pricingAnalysis) {
                    setPricingAnalysis(response.pricingAnalysis);
                    await updateJob(id!, { pricingAnalysis: response.pricingAnalysis }, profile!.businessId);
                  }
                  toast.success("Revenue generation protocol synthesized!");
                } catch (err) {
                  toast.error("Failed to generate strategic recommendations");
                } finally {
                  setIsGeneratingUpsells(false);
                }
              }}
              productCosts={productCosts}
              handleAddProductCost={handleAddProductCost}
              handleUpdateProductCost={handleUpdateProductCost}
              handleDeleteProductCost={handleDeleteProductCost}
              saveProductCosts={saveProductCosts}
              revenueProtocol={revenueProtocol}
              recommendations={recommendations}
              pricingAnalysis={pricingAnalysis}
              AVAILABLE_TAGS={AVAILABLE_TAGS}
            />
          </TabsContent>

          <TabsContent value="checklist" className="mt-6 space-y-12">
              {/* Live Revenue Intelligence Directives (Restored) */}
              {(() => {
                const liveRecommendations = recommendations.map(r => ({
                  id: r.serviceName,
                  name: r.serviceName,
                  source: 'ai_revenue_intelligence',
                  instruction: r.reason,
                  recommendedProduct: r.recommendedProduct,
                  productReason: r.productReason
                }));
                const liveInsights = deploymentInsights.map(d => ({
                  id: d.name,
                  name: d.name,
                  source: 'deployment_intelligence',
                  instruction: d.reason || d.description,
                  recommendedProduct: null,
                  productReason: null
                }));
                const activeDirectives = [...liveRecommendations, ...liveInsights];
                
                return (
                  <Card className="border-primary/20 shadow-xl shadow-primary/5 bg-black/60 rounded-3xl relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[80px] -mr-32 -mt-32 rounded-full pointer-events-none"></div>
                    <CardHeader className="bg-black/40 border-b border-primary/20 p-6 flex flex-row items-center gap-3 relative z-10 w-full">
                      <Sparkles className="w-5 h-5 text-primary" />
                      <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Revenue Intelligence Directives</CardTitle>
                    </CardHeader>
                    <CardContent className="p-8 relative z-10">
                      {activeDirectives.length === 0 ? (
                        <div className="text-center py-6">
                           <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 mb-2">NO ACTIVE DIRECTIVES</p>
                           <p className="text-xs text-white/40">Run Revenue Optimization in the Revenue Intel tab to generate tactical directives for this deployment.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full items-stretch">
                          {activeDirectives.map((item, idx) => (
                            <SmallCardWrapper key={`dir-${item.id || idx}`} id={`dir-${item.id || idx}`} focusedId={focusedSmallCardId} onFocus={setFocusedSmallCardId}>
                            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-4 w-full relative group h-auto min-h-full">
                              <div className="flex justify-between items-start gap-4">
                                <div className="space-y-1">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-primary/70">{item.source === 'deployment_intelligence' ? 'Deployment Insight' : 'Operational Enhancement'}</span>
                                  <h4 className="font-black text-white text-lg tracking-tight uppercase px-4 py-1 bg-white/5 rounded-md w-fit">{item.name}</h4>
                                </div>
                                <div className="flex-shrink-0 bg-primary/20 px-3 py-1 rounded-md border border-primary/30">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">In Progress</span>
                                </div>
                              </div>
                              
                              <div className="p-4 bg-black/40 rounded-xl border border-white/5 flex-1">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-2 block">Action Required</Label>
                                <div className="text-sm font-medium text-white/90 leading-relaxed">
                                  {item.instruction}
                                </div>
                              </div>
                              
                              {item.recommendedProduct && (
                                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 mt-auto">
                                  <Label className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-2 block">Tooling / Product Recommendation</Label>
                                  <p className="text-sm font-black text-white">{item.recommendedProduct}</p>
                                  {item.productReason && <p className="text-xs text-blue-200/60 mt-1">{item.productReason}</p>}
                                </div>
                              )}
                            </div>
                            </SmallCardWrapper>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Revenue Summary Card (Restored to Operations Tab) */}
              <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
                <CardHeader className="bg-black/20 border-b border-white/5 p-6">
                  <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Revenue Summary</CardTitle>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  <div className="space-y-4">
                    {/* 1. Itemize Core Services */}
                    <div className="space-y-3">
                      {(job.serviceSelections || []).length > 0 && (
                        <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Primary Assets & Protocols</div>
                      )}
                      {(job.serviceSelections || []).map((service: any, idx: number) => {
                        const isAI = service.source === 'ai_revenue_intelligence' || service.source === 'deployment_intelligence' || service.source === 'ai_pricing';
                        const explanations = isAI ? getAdjustmentExplanation(service) : null;
                        
                        return (
                          <div key={`service-fin-${service.id || idx}-${idx}`} className="group flex items-center justify-between">
                            <div className="flex flex-col flex-1 min-w-0">
                              {isAI ? (
                                <Dialog onOpenChange={(open) => {
                                  if (open) toast.success(`${service.name} Explanation Opened`);
                                }}>
                                  <DialogTrigger render={
                                    <button 
                                      type="button"
                                      className="text-left bg-transparent border-none p-0 group flex flex-col"
                                      onClick={() => toast.success(`${service.name} Clicked`)}
                                    >
                                      <span className="text-white font-black uppercase tracking-widest text-[9px] leading-none mb-1 border-b border-dashed border-white/40 group-hover:border-white/70 transition-colors inline-block truncate max-w-full">{service.name}</span>
                                    </button>
                                  } />
                                  <DialogContent className="max-w-md bg-card border border-white/10 shadow-2xl p-6 rounded-2xl">
                                    <DialogHeader className="mb-4 text-left">
                                      <DialogTitle className="font-black text-lg tracking-tighter text-white uppercase">{service.name}</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-6">
                                      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-primary">Internal Explanation</Label>
                                        <p className="text-sm text-white/80 leading-relaxed font-medium">{explanations?.internal}</p>
                                      </div>
                                      <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/50">Customer Explanation</Label>
                                        <p className="text-sm text-white/80 leading-relaxed font-medium">{explanations?.customer}</p>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              ) : (
                                <span className="text-white font-black uppercase tracking-widest text-[9px] leading-none mb-1 truncate">{service.name}</span>
                              )}
                              <span className="text-[9px] text-white/30 font-bold uppercase tracking-tight truncate">{service.vehicleName || "Main Asset"}</span>
                            </div>
                            <div className="flex items-center gap-3 ml-2">
                              <span className="text-white font-black text-xs font-mono whitespace-nowrap">{formatCurrency(service.price || 0)}</span>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-white/40 hover:text-red-500 hover:bg-red-500/10 transition-all border border-white/5 hover:border-red-500/20 relative z-10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeBillableItem(service.id || service.name, "service");
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 2. Itemize Add-ons */}
                    <div className="space-y-3 pt-3 border-t border-white/5">
                      {(job.addOnSelections || []).length > 0 && (
                        <div className="text-[9px] font-black uppercase tracking-widest text-primary/40 mb-2">Operational Enhancements</div>
                      )}
                      {(job.addOnSelections || []).map((addon: any, idx: number) => {
                        const isAI = addon.source === 'ai_revenue_intelligence' || addon.source === 'deployment_intelligence';
                        const explanations = isAI ? getAdjustmentExplanation(addon) : null;
                        
                        return (
                          <div key={`addon-fin-${addon.id || idx}-${idx}`} className="group flex items-center justify-between">
                            <div className="flex flex-col flex-1 min-w-0">
                              {isAI ? (
                                <Dialog onOpenChange={(open) => {
                                  if (open) toast.success(`${addon.name} Explanation Opened`);
                                }}>
                                  <DialogTrigger render={
                                    <button 
                                      type="button"
                                      className="text-left bg-transparent border-none p-0 group flex flex-col"
                                      onClick={() => toast.success(`${addon.name} Clicked`)}
                                    >
                                      <span className="text-primary/70 font-black uppercase tracking-widest text-[9px] leading-none mb-1 italic border-b border-dashed border-primary/40 group-hover:border-primary/70 transition-colors inline-block truncate max-w-full">{addon.name} {addon.qty > 1 ? `(x${addon.qty})` : ""}</span>
                                    </button>
                                  } />
                                  <DialogContent className="max-w-md bg-card border border-white/10 shadow-2xl p-6 rounded-2xl">
                                    <DialogHeader className="mb-4 text-left">
                                      <DialogTitle className="font-black text-lg tracking-tighter text-white uppercase">{addon.name}</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-6">
                                      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-primary">Internal Explanation</Label>
                                        <p className="text-sm text-white/80 leading-relaxed font-medium">{explanations?.internal}</p>
                                      </div>
                                      <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/50">Customer Explanation</Label>
                                        <p className="text-sm text-white/80 leading-relaxed font-medium">{explanations?.customer}</p>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              ) : (
                                <span className="text-primary/70 font-black uppercase tracking-widest text-[9px] leading-none mb-1 italic truncate">{addon.name} {addon.qty > 1 ? `(x${addon.qty})` : ""}</span>
                              )}
                              <span className="text-[9px] text-white/30 font-bold uppercase tracking-tight truncate">{addon.vehicleName || "Main Asset"}</span>
                            </div>
                            <div className="flex items-center gap-3 ml-2">
                              <span className="text-primary font-black text-xs font-mono whitespace-nowrap">{formatCurrency((addon.price || 0) * (addon.qty || 1))}</span>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-white/40 hover:text-red-500 hover:bg-red-500/10 transition-all border border-white/5 hover:border-red-500/20 relative z-10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeBillableItem(addon.id || addon.name, "addon");
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 3. Explicit Adjustments */}
                    {(job.priceAdjustments || []).length > 0 && (
                      <div className="space-y-3 pt-3 border-t border-white/5">
                        {(job.priceAdjustments || []).map((adj: any) => {
                          const labels = getDualLabels(adj.source);
                          const explanations = getAdjustmentExplanation(adj);
                          
                          return (
                            <Dialog key={adj.id} onOpenChange={(open) => {
                              if (open) toast.success(`${labels.internalLabel} Explanation Opened`);
                            }}>
                              <div className="group flex items-center justify-between">
                                <DialogTrigger render={
                                  <button 
                                    type="button"
                                    className="cursor-pointer flex-1 py-1 -ml-2 pl-2 hover:bg-white/5 rounded transition-colors group text-left bg-transparent border-none"
                                    onClick={() => toast.success(`${labels.internalLabel} Clicked`)}
                                  >
                                    <span className="text-[9px] font-black uppercase tracking-widest text-primary/70 border-b border-dashed border-primary/30 group-hover:border-primary/60 transition-colors">{labels.internalLabel}</span>
                                  </button>
                                } />
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-black text-white font-mono">{formatCurrency(adj.amount)}</span>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-white/40 hover:text-red-500 hover:bg-red-500/10 transition-all border border-white/5 hover:border-red-500/20 relative z-10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeBillableItem(adj.id, "adjustment");
                                    }}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>

                              <DialogContent className="max-w-md bg-card border border-white/10 shadow-2xl p-6 rounded-2xl">
                                <DialogHeader className="mb-4 text-left">
                                  <DialogTitle className="font-black text-lg tracking-tighter text-white uppercase">{labels.internalLabel}</DialogTitle>
                                </DialogHeader>
                                
                                <div className="space-y-6">
                                  <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-primary">Internal Explanation</Label>
                                    <p className="text-sm text-white/80 leading-relaxed font-medium">{explanations?.internal}</p>
                                  </div>
                                  <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-white/50">Customer Explanation</Label>
                                    <p className="text-sm text-white/80 leading-relaxed font-medium">{explanations?.customer}</p>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="pt-6 border-t border-white/10 space-y-2">
                    <div className="flex justify-between items-center px-4 py-1">
                      <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">Base Amount</span>
                      <span className="text-sm font-black text-white/80">{formatCurrency(job.baseAmount || 0)}</span>
                    </div>
                    {job.travelFee ? (
                      <div className="flex justify-between items-center px-4 py-1">
                        <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">Travel Fee</span>
                        <span className="text-sm font-black text-white/80">{formatCurrency(job.travelFee)}</span>
                      </div>
                    ) : null}
                    {job.afterHoursRecord?.afterHoursFee ? (
                      <div className="flex justify-between items-center px-4 py-1">
                        <span className="text-[10px] font-black uppercase text-yellow-500/80 tracking-widest">After-Hours Fee</span>
                        <span className="text-sm font-black text-yellow-500">{formatCurrency(job.afterHoursRecord.afterHoursFee)}</span>
                      </div>
                    ) : null}
                    {job.discountAmount ? (
                      <div className="flex justify-between items-center px-4 py-1">
                        <span className="text-[10px] font-black uppercase text-green-400/80 tracking-widest">Discount</span>
                        <span className="text-sm font-black text-green-400">-{formatCurrency(job.discountAmount)}</span>
                      </div>
                    ) : null}
                    {job.taxAmount ? (
                      <div className="flex justify-between items-center px-4 py-1">
                        <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">Tax</span>
                        <span className="text-sm font-black text-white/80">{formatCurrency(job.taxAmount)}</span>
                      </div>
                    ) : null}

                    <div className="flex justify-between items-center px-4 py-3 bg-black/40 rounded-xl border border-white/5 mt-2">
                      <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">Calculated Balance</span>
                      <span className="text-xl font-black text-primary">{formatCurrency(job.totalAmount || 0)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>


              <div>
                <ServiceChecklist jobId={job.id} services={job.serviceNames || []} businessId={profile!.businessId} />
              </div>
            </TabsContent>

            <TabsContent value="photos" className="mt-6 space-y-12">
              <PhotoDocumentation jobId={job.id} type="before" />
              <PhotoDocumentation jobId={job.id} type="after" />
              <PhotoDocumentation jobId={job.id} type="damage" />
            </TabsContent>

            <TabsContent value="notes" className="mt-6 space-y-12">
              <Card className="bg-card border-white/5 rounded-3xl shadow-xl">
                <CardContent className="p-8">
                  <textarea 
                    className="w-full h-40 p-4 rounded-2xl bg-white/5 border border-white/10 text-white focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-sm font-medium"
                    placeholder="Job notes..."
                    defaultValue={job.notes}
                    onBlur={async (e) => {
                      await updateJobFields(id!, { notes: e.target.value }, profile!.businessId);
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="forms" className="mt-6 space-y-12">
               <JobForms 
                 signedForms={signedForms}
                 formTemplates={formTemplates}
                 setShowFormSigner={setShowFormSigner}
               />
            </TabsContent>
        </div>

        {/* Right Column: Financials & Actions */}
        <div className="lg:col-span-3 space-y-6 lg:sticky lg:top-32 h-fit">

          {job.status === "waitlisted" && (
            <Card className="border-none shadow-xl bg-orange-500/10 border border-orange-500/20 rounded-3xl overflow-hidden">
              <CardHeader className="bg-orange-500/10 border-b border-orange-500/10 p-6 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">Waitlisted Booking</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                   <p className="text-xs text-white/70"><strong>Original:</strong> {job.scheduledAt ? job.scheduledAt.toDate().toLocaleString() : "--"}</p>
                   {job.waitlistInfo?.backupScheduledAt && (
                     <p className="text-xs text-white/70"><strong>Backup:</strong> {job.waitlistInfo.backupScheduledAt.toDate().toLocaleString()}</p>
                   )}
                   {job.waitlistInfo?.flexibleSameDay && (
                     <p className="text-xs text-emerald-400 font-bold">Client is flexible on date</p>
                   )}
                   {job.waitlistInfo?.clientNote && (
                     <div className="p-2 mt-2 bg-white/5 rounded-lg border border-white/5">
                        <p className="text-[10px] uppercase font-black tracking-widest text-white/40 mb-1">Client Note</p>
                        <p className="text-xs text-white">{job.waitlistInfo.clientNote}</p>
                     </div>
                   )}
                </div>
                <div className="grid grid-cols-1 gap-2 pt-2 border-t border-orange-500/10">
                   <Button onClick={() => handleWaitlistAction("offerOriginal")} size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-10 w-full" disabled={isUpdating}>
                     Offer Original Time
                   </Button>
                   {job.waitlistInfo?.backupScheduledAt && (
                     <Button onClick={() => handleWaitlistAction("approveBackup")} size="sm" className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-10 w-full" disabled={isUpdating}>
                       Approve Backup Time
                     </Button>
                   )}
                   <Button onClick={() => handleWaitlistAction("offerSuggested")} size="sm" variant="outline" className="border-white/10 text-white hover:bg-white/5 font-bold h-10 w-full bg-transparent" disabled={isUpdating}>
                     Text Custom Offer
                   </Button>
                   <Button onClick={() => handleWaitlistAction("decline")} size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 hover:text-red-300 font-bold h-10 w-full mt-2" disabled={isUpdating}>
                     Decline Request
                   </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Client Communication */}
          {job.status !== "requested" && job.status !== "canceled" && (
            <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
              <CardHeader className="bg-black/20 border-b border-white/5 p-6 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Client Communication</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Pause</span>
                  <Switch 
                    checked={job.smsAutomationPaused || false}
                    onCheckedChange={toggleSmsAutomation}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  {communicationLogs.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-black text-white/40 tracking-widest">Recent Messages</span>
                        <Badge className="bg-white/10 text-white hover:bg-white/20 border-none px-2">{communicationLogs.length}</Badge>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                        {communicationLogs.slice(0, 3).map(log => (
                          <div key={log.id} className="p-3 bg-black/40 border border-white/5 rounded-xl">
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-xs font-bold text-white capitalize">{log.type.replace(/_/g, " ")}</span>
                              <span className={cn(
                                "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded",
                                log.status === "sent" ? "text-emerald-500 bg-emerald-500/10" : 
                                log.status === "failed" ? "text-red-500 bg-red-500/10" : "text-blue-500 bg-blue-500/10"
                              )}>
                                {log.status}
                              </span>
                            </div>
                            <p className="text-[10px] text-white/60 truncate">{log.content}</p>
                            {log.status === "failed" && job.customerPhone && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    messagingService.sendTemplateSms(job.customerPhone!, log.type, {
                                      clientName: job.customerName || "Customer",
                                      businessName: "Flatline Mobile Detail"
                                    }, id, job.customerId);
                                  }}
                                  className="w-full text-[10px] bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-400 mt-2 h-6"
                                >
                                  Retry 
                                </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <span className="text-[10px] uppercase font-black text-white/40 tracking-widest pl-1">Scheduled Reminders</span>
                    {[
                      { key: "confirmation", label: "Booking Confirmation" },
                      { key: "twentyFourHour", label: "24-Hour Reminder" },
                      { key: "twoHour", label: "2-Hour Reminder" }
                    ].map(({ key, label }) => {
                      const status = job.reminders?.[key];
                      let statusLabel = "Scheduled";
                      let statusColor = "text-yellow-600 bg-yellow-600/10";
                      
                      if (status === "sent") {
                        statusLabel = "Sent";
                        statusColor = "text-green-600 bg-green-600/10";
                      } else if (status === "failed") {
                        statusLabel = "Failed";
                        statusColor = "text-red-600 bg-red-600/10";
                      } else if (status === "skipped" || job.smsAutomationPaused) {
                        statusLabel = "Skipped/Paused";
                        statusColor = "text-gray-400 bg-gray-400/10";
                      }

                      return (
                        <div key={key} className="flex flex-col gap-2 p-3 bg-white/5 rounded-xl border border-white/5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-300">{label}</span>
                            <span className={`px-2 py-1 rounded text-[10px] uppercase font-black tracking-wider ${statusColor}`}>
                              {statusLabel}
                            </span>
                          </div>
                          {(status === "failed" || !status) && job.customerPhone && (
                            <Button
                              variant="ghost" 
                              size="sm"
                              className="w-full text-xs hover:bg-white/10 mt-1 h-8 bg-black/20"
                              onClick={() => handleResendReminder(key === 'confirmation' ? 'confirmation' : (key === 'twentyFourHour' ? 'reminder_24h' : 'reminder_2h'))}
                            >
                              <Mail className="w-3 h-3 mr-2" />
                              {status === "failed" ? "Retry" : "Send Now"}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tactical Command Card */}
          <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
            <CardHeader className="bg-black/20 border-b border-white/5 p-6">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Tactical Command</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex flex-col gap-3">
                {job.status === "requested" && (
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => handleStatusChangeRequest("pending_approval")} disabled={isUpdating} className="w-full bg-white text-black hover:bg-gray-100 font-black uppercase tracking-widest text-[10px] h-12 rounded-xl">
                      Review & Pre-Approve
                    </Button>
                    <Button onClick={() => handleStatusChangeRequest("declined")} variant="outline" disabled={isUpdating} className="w-full border-red-500/20 text-red-500 hover:bg-red-500/10 font-black uppercase tracking-widest text-[10px] h-12 rounded-xl">
                      Decline Mission
                    </Button>
                  </div>
                )}
                {job.status === "pending_approval" && (
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => handleStatusChangeRequest("scheduled")} disabled={isUpdating} className="w-full bg-primary hover:bg-red-700 text-white font-black uppercase tracking-widest text-[10px] h-12 rounded-xl shadow-lg shadow-primary/20">
                      Approve & Schedule
                    </Button>
                    <Button onClick={() => handleStatusChangeRequest("declined")} variant="outline" disabled={isUpdating} className="w-full border-red-500/20 text-red-500 hover:bg-red-500/10 font-black uppercase tracking-widest text-[10px] h-12 rounded-xl">
                      Decline
                    </Button>
                  </div>
                )}
                {/* Buttons moved to top summary bar */}
                {job.status === "en_route" && (
                  <div className="flex flex-col gap-2">
                    <Button 
                      onClick={() => handleStatusChangeRequest("arrived")} 
                      disabled={isUpdating} 
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest text-[10px] h-12 rounded-xl shadow-lg shadow-blue-600/20"
                    >
                      Mark Arrived
                    </Button>
                  </div>
                )}
                {job.status === "arrived" && (
                  <div className="flex flex-col gap-2">
                    <Button 
                      onClick={() => {
                        if (checkRequiredForms("before_start")) {
                          handleStatusChangeRequest("in_progress");
                        }
                      }} 
                      disabled={isUpdating} 
                      className="w-full bg-primary hover:bg-red-700 text-white font-black uppercase tracking-widest text-[10px] h-14 rounded-xl shadow-lg shadow-primary/20"
                    >
                      Start Operations
                    </Button>
                  </div>
                )}
                {job.status === "in_progress" && (
                  <div className="flex flex-col gap-2">
                    <Button 
                      onClick={() => {
                        if (checkRequiredForms("before_complete")) {
                          setShowSignature(true);
                        }
                      }} 
                      disabled={isUpdating} 
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-black h-14 rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-green-600/20"
                    >
                      Complete Mission
                    </Button>
                  </div>
                )}
                {(job.status === "completed" || job.status === "paid") && (
                  <div className="flex flex-col gap-2">
                    <Button 
                      onClick={() => {
                        navigate(`/book-appointment?clientId=${job.clientId || job.customerId}`);
                      }}
                      className="w-full bg-primary hover:bg-red-700 text-white font-black h-12 rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20"
                    >
                      <Calendar className="w-4 h-4 mr-2" /> Schedule Follow-up
                    </Button>
                  </div>
                )}

                {/* Universal Revert Button */}
                {getPreviousStatus(job.status) && (
                  <Button 
                    onClick={() => handleRevertStatus()} 
                    disabled={isUpdating} 
                    variant="outline"
                    className="w-full border-orange-500/20 text-orange-500 hover:bg-orange-500/10 font-black uppercase tracking-widest text-[10px] h-11 rounded-xl shadow-sm mt-1"
                  >
                    <Undo className="w-4 h-4 mr-2 shrink-0" /> Revert Status
                  </Button>
                )}

                {/* Additional Job Actions moved to top summary bar */}
                
                {/* Status Activity Log */}
                {(job.statusActivityLog && job.statusActivityLog.length > 0) && (
                  <div className="pt-4 mt-4 border-t border-white/5 space-y-3">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/50">Status Activity</Label>
                    <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar pr-2">
                      {[...job.statusActivityLog].reverse().map((log: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-[10px] bg-white/5 p-2 rounded border border-white/5">
                          <span className="text-white/60 font-black uppercase tracking-widest">
                            {formatStatusText(log.oldStatus)} <span className="text-primary mx-1 text-xs leading-none">→</span> {formatStatusText(log.newStatus)}
                          </span>
                          <span className="text-white/30 font-black tracking-widest">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>






        </div>
      </div>
    </Tabs>

      {/* Form Signer Dialog */}
      {showFormSigner && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-8">
            <FormSigner 
              template={showFormSigner}
              appointmentId={id!}
              clientId={job.clientId || job.customerId}
              onComplete={() => setShowFormSigner(null)}
              onCancel={() => setShowFormSigner(null)}
            />
          </div>
        </div>
      )}

      {/* Signature Dialog */}
      {showSignature && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <SignaturePad 
            onSave={handleSaveSignature}
            onCancel={() => setShowSignature(false)}
            title="Complete Job - Customer Signature"
          />
        </div>
      )}

      {/* Status Revert Confirmation */}
      <AlertDialog open={!!pendingStatusChange} onOpenChange={(open) => !open && setPendingStatusChange(null)}>
        <AlertDialogContent className="bg-card border-white/10 rounded-2xl shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black text-xl text-white uppercase tracking-tight">Confirm Status Correction</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60 font-medium">
              {pendingStatusChange?.actionText}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="font-bold border-white/10 text-white/50 hover:bg-white/5 rounded-xl uppercase tracking-widest text-[10px]">Keep Current Status</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (pendingStatusChange) {
                  updateStatus(pendingStatusChange.newStatus, pendingStatusChange.oldStatus);
                }
              }}
              className="bg-primary hover:bg-red-700 text-white font-black rounded-xl uppercase tracking-widest text-[10px]"
            >
              Confirm Revert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent className="bg-white rounded-2xl border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black text-xl">Cancel Appointment?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 pt-2">
              <p>Are you sure you want to cancel this appointment? This action cannot be undone.</p>
              
              {job.cancellationFeeEnabled && (
                <div className={cn(
                  "p-4 rounded-xl border",
                  isAfterCutoff ? "bg-red-50 border-red-100" : "bg-green-50 border-green-100"
                )}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Policy Status</span>
                    <Badge variant="outline" className={cn(
                      "text-[10px] uppercase font-black",
                      isAfterCutoff ? "bg-red-100 text-red-700 border-red-200" : "bg-green-100 text-green-700 border-green-200"
                    )}>
                      {isAfterCutoff ? "After Cutoff" : "Before Cutoff"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-700">Cancellation Fee</span>
                    <span className={cn("text-lg font-black", isAfterCutoff ? "text-red-600" : "text-green-600")}>
                      {formatCurrency(cancellationFee)}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">
                    Cutoff: {job.cancellationCutoffHours} hours before scheduled time.
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="font-bold rounded-xl">Keep Appointment</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCancelJob}
              className="bg-red-600 hover:bg-red-700 text-white font-black rounded-xl"
            >
              Confirm Cancellation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual Service Addition Dialog */}
      <Dialog open={showAddServiceDialog} onOpenChange={setShowAddServiceDialog}>
        <DialogContent className="max-w-xl bg-card border-none rounded-3xl shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
            <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">Manual Asset Addition</DialogTitle>
          </DialogHeader>
          <div className="p-8 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Global Services</Label>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsAddingCustom(!isAddingCustom)}
                className="text-primary font-black uppercase text-[9px] tracking-widest hover:bg-primary/5"
              >
                {isAddingCustom ? "Cancel Custom" : "+ Add Custom Asset"}
              </Button>
            </div>

            {isAddingCustom && (
              <Card className="bg-white/5 border-white/10 p-4 space-y-4 animate-in slide-in-from-top-2 duration-300">
                <div className="space-y-2">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-white/40">Asset Name</Label>
                  <Input 
                    placeholder="e.g. Excessive Clay Bar Treatment" 
                    value={customServiceName}
                    onChange={(e) => setCustomServiceName(e.target.value)}
                    className="bg-black/40 border-white/10 text-white rounded-xl h-10 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-white/40">Custom Price ($)</Label>
                  <Input 
                    type="number"
                    placeholder="0.00" 
                    value={customServicePrice}
                    onChange={(e) => setCustomServicePrice(e.target.value)}
                    className="bg-black/40 border-white/10 text-white rounded-xl h-10 text-xs"
                  />
                </div>
                <Button 
                  disabled={!customServiceName || !customServicePrice}
                  onClick={async () => {
                    setIsUpdating(true);
                    try {
                      const docRef = doc(db, "appointments", id!);
                      const price = parseFloat(customServicePrice);
                      const newServiceSelection = {
                          id: `custom-asset-${Date.now()}`,
                          name: customServiceName,
                          description: `Custom ${customServiceName} - Manually deployed by technician.`,
                          qty: 1,
                          price: price,
                          total: price,
                          source: "manual",
                          protocolAccepted: true
                      };
                      await updateDoc(docRef, {
                        serviceNames: [...(job.serviceNames || []), customServiceName],
                        serviceSelections: [...(job.serviceSelections || []), newServiceSelection],
                        totalAmount: (job.totalAmount || 0) + price,
                        baseAmount: (job.baseAmount || 0) + price
                      });
                      toast.success(`Custom Asset Added: ${customServiceName}`);
                      setIsAddingCustom(false);
                      setCustomServiceName("");
                      setCustomServicePrice("");
                      setShowAddServiceDialog(false);
                    } catch (err) {
                      toast.error("Failed to add custom asset");
                    } finally {
                      setIsUpdating(false);
                    }
                  }}
                  className="w-full bg-primary hover:bg-red-700 text-white font-black rounded-lg h-10 uppercase text-[9px] tracking-widest"
                >
                  Deploy Custom Asset
                </Button>
              </Card>
            )}

            <div className="grid grid-cols-1 gap-2">
              {allServices.map(s => (
                <Button 
                  key={s.id}
                  variant="outline"
                  className="bg-white/5 border-white/10 text-white hover:bg-white/10 h-auto p-4 flex justify-between items-center text-left"
                  onClick={async () => {
                    if (!job) return;
                    setIsUpdating(true);
                    try {
                      const docRef = doc(db, "appointments", id!);
                      const newServiceSelection = {
                        id: s.id,
                        name: s.name,
                        description: s.description || `Professional ${s.name} service.`,
                        qty: 1,
                        price: s.basePrice || 0,
                        total: s.basePrice || 0,
                        source: "standard",
                        protocolAccepted: true
                      };
                      await updateDoc(docRef, {
                        serviceIds: [...(job.serviceIds || []), s.id],
                        serviceNames: [...(job.serviceNames || []), s.name],
                        serviceSelections: [...(job.serviceSelections || []), newServiceSelection],
                        totalAmount: (job.totalAmount || 0) + (s.basePrice || 0),
                        baseAmount: (job.baseAmount || 0) + (s.basePrice || 0)
                      });
                      toast.success(`Service Added: ${s.name}`);
                      setShowAddServiceDialog(false);
                    } catch (err) {
                      toast.error("Failed to add service");
                    } finally {
                      setIsUpdating(false);
                    }
                  }}
                >
                  <span className="font-black uppercase tracking-tight text-xs">{s.name}</span>
                  <span className="font-black text-primary">${s.basePrice}</span>
                </Button>
              ))}
            </div>
            <div className="mt-6 pt-6 border-t border-white/10">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/60 block">Static Catalog</Label>
                  <p className="text-[9px] text-white/40 mt-1 uppercase tracking-tight">For intelligent suggestions, use AI Revenue Optimization.</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                     const el = document.getElementById("manual-addons-list");
                     if (el) el.classList.toggle("hidden");
                  }}
                  className="h-7 text-[9px] bg-white/5 font-black uppercase tracking-widest border-white/10"
                >
                  <Search className="w-3 h-3 mr-1" />
                  Browse Catalog
                </Button>
              </div>
              <div id="manual-addons-list" className="hidden grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {allAddons.map(a => (
                <Button 
                  key={a.id}
                  variant="outline"
                  className="bg-white/5 border-white/10 text-white hover:bg-white/10 h-auto p-4 flex justify-between items-center text-left"
                  onClick={async () => {
                    if (!job) return;
                    setIsUpdating(true);
                    try {
                      const docRef = doc(db, "appointments", id!);
                      const newAddonSelection = {
                        id: a.id,
                        name: a.name,
                        price: a.price || 0,
                        qty: 1
                      };
                      await updateDoc(docRef, {
                        addOnIds: [...(job.addOnIds || []), a.id],
                        addOnNames: [...(job.addOnNames || []), a.name],
                        addOnSelections: [...(job.addOnSelections || []), newAddonSelection],
                        totalAmount: (job.totalAmount || 0) + (a.price || 0),
                        baseAmount: (job.baseAmount || 0) + (a.price || 0)
                      });
                      toast.success(`Add-on Added: ${a.name}`);
                      setShowAddServiceDialog(false);
                    } catch (err) {
                      toast.error("Failed to add add-on");
                    } finally {
                      setIsUpdating(false);
                    }
                  }}
                >
                  <span className="font-black uppercase tracking-tight text-xs italic">{a.name}</span>
                  <span className="font-black text-primary">${a.price}</span>
                </Button>
              ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isInvoiceModalOpen} onOpenChange={setIsInvoiceModalOpen}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden bg-gray-100 border-none rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
          <div className="flex-1 overflow-y-auto" id={`invoice-preview-container-detail-${currentInvoice?.id || 'new'}`}>
            <div id={`invoice-preview-content-detail-${currentInvoice?.id || 'new'}`}>
              {currentInvoice && (
                <DocumentPreview 
                  type="invoice"
                  settings={businessSettings}
                  document={currentInvoice}
                  onAddRecommendation={handleAcceptRecommendation}
                />
              )}
            </div>
          </div>
          <div className="p-4 sm:p-6 bg-white border-t flex flex-col gap-4 shrink-0 w-full mb-safe">
            <div className="flex flex-wrap gap-2 w-full justify-center sm:justify-start items-center">
              <Button variant="outline" onClick={() => setIsInvoiceModalOpen(false)} className="shrink-0 font-black uppercase tracking-widest text-[10px] h-12 px-4 sm:px-6 rounded-xl">
                Close
              </Button>
              <Button 
                className="shrink-0 bg-white border border-gray-200 text-black hover:bg-gray-50 font-black uppercase tracking-widest text-[10px] h-12 px-4 sm:px-5 rounded-xl shadow-sm"
                onClick={async () => {
                  try {
                    const to = currentInvoice?.clientEmail || job?.customerEmail;
                    if (!to) {
                      toast.error("No email address found for this client.");
                      return;
                    }
                    toast.loading("Sending email...", { id: "email-invoice" });
                    await messagingService.sendEmail({
                      to,
                      subject: `Invoice ${currentInvoice?.invoiceNumber} from ${businessSettings?.businessName || 'Us'}`,
                      html: `<p>Hi ${currentInvoice?.clientName || job?.customerName},</p><p>Your invoice <strong>${currentInvoice?.invoiceNumber}</strong> is ready.</p><p>Total Amount: <strong>${formatCurrency(currentInvoice?.total)}</strong></p><p>Thank you for your business!</p>`
                    });

                    if (currentInvoice?.clientPhone || job?.customerPhone) {
                      try {
                        const targetPhone = currentInvoice?.clientPhone || job?.customerPhone;
                        const smsData = {
                          clientName: currentInvoice?.clientName || job?.customerName || "Customer",
                          businessName: businessSettings?.businessName || "Flatline Mobile Detail",
                          invoiceAmount: formatCurrency(currentInvoice?.total || 0),
                          invoiceLink: window.location.origin + "/public-invoice/" + currentInvoice?.id,
                          paymentLink: window.location.origin + "/public-invoice/" + currentInvoice?.id + "/pay"
                        };
                        await messagingService.sendTemplateSms(
                          targetPhone,
                          "invoice_sent",
                          smsData,
                          id,
                          currentInvoice?.clientId || job?.customerId
                        );
                        console.log("Manual Invoice SMS template sent successfully.");
                      } catch (smsErr) {
                        console.error("Failed to send invoice ready SMS:", smsErr);
                      }
                    }

                    toast.success("Invoice successfully emailed/texted to client!", { id: "email-invoice" });
                  } catch (e: any) {
                    toast.error(e.message || "Failed to send email", { id: "email-invoice" });
                  }
                }}
              >
                <Mail className="w-4 h-4 mr-2 text-primary shrink-0" /> Email
              </Button>

              <Button 
                className="shrink-0 bg-white border border-gray-200 text-black hover:bg-gray-50 font-black uppercase tracking-widest text-[10px] h-12 px-4 sm:px-5 rounded-xl shadow-sm"
                onClick={async () => {
                  try {
                    const targetPhone = currentInvoice?.clientPhone || job?.customerPhone;
                    if (!targetPhone) {
                      toast.error("No phone number found for this client.");
                      return;
                    }
                    toast.loading("Sending SMS reminder...", { id: "sms-reminder" });
                    const smsData = {
                      clientName: currentInvoice?.clientName || job?.customerName || "Customer",
                      businessName: businessSettings?.businessName || "Flatline Mobile Detail",
                      invoiceAmount: formatCurrency(currentInvoice?.total || 0),
                      invoiceLink: window.location.origin + "/public-invoice/" + currentInvoice?.id,
                      paymentLink: window.location.origin + "/public-invoice/" + currentInvoice?.id + "/pay"
                    };
                    await messagingService.sendTemplateSms(
                      targetPhone,
                      "payment_reminder",
                      smsData,
                      id,
                      currentInvoice?.clientId || job?.customerId
                    );
                    toast.success("SMS reminder sent to client!", { id: "sms-reminder" });
                  } catch (e: any) {
                    toast.error(e.message || "Failed to send SMS reminder", { id: "sms-reminder" });
                  }
                }}
              >
                <MessageSquare className="w-4 h-4 mr-2 text-primary shrink-0" /> SMS Reminder
              </Button>

              <Button 
                className="shrink-0 bg-primary hover:bg-red-700 text-white font-black uppercase tracking-widest text-[10px] h-12 px-4 sm:px-6 rounded-xl shadow-lg shadow-primary/20"
                onClick={() => handleDownloadPDF(currentInvoice)}
              >
                <FileText className="w-4 h-4 mr-2 shrink-0" /> Download PDF
              </Button>
              
              {currentInvoice?.status !== "paid" && currentInvoice?.status !== "voided" && (
                <Button 
                  className="shrink-0 bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-widest text-[10px] h-12 px-4 sm:px-6 rounded-xl shadow-lg shadow-green-500/20"
                  onClick={() => handleAcceptPayment(currentInvoice)}
                >
                  <DollarSign className="w-4 h-4 mr-2 shrink-0" /> Accept Payment
                </Button>
              )}

              {currentInvoice?.status === "paid" && (
                <DeleteConfirmationDialog
                  title="Undo Payment"
                  description="Are you sure you want to undo this payment? This will revert the invoice to an unpaid state."
                  onConfirm={() => handleUndoPayment(currentInvoice)}
                  trigger={
                    <Button 
                      variant="outline"
                      className="shrink-0 border-orange-200 text-orange-600 hover:bg-orange-50 hover:text-orange-700 font-black uppercase tracking-widest text-[10px] h-12 px-4 sm:px-6 rounded-xl shadow-sm"
                    >
                      <Undo className="w-4 h-4 mr-2 shrink-0" /> Undo Payment
                    </Button>
                  }
                />
              )}

              {currentInvoice?.status !== "voided" && (
                <DeleteConfirmationDialog
                  title="Void Invoice"
                  description="Are you sure you want to void this invoice? This will cancel the payment status and mark the invoice as voided."
                  onConfirm={() => handleVoidPayment(currentInvoice)}
                  trigger={
                    <Button 
                      variant="outline"
                      className="shrink-0 border-amber-200 text-amber-600 hover:bg-amber-50 hover:text-amber-700 font-black uppercase tracking-widest text-[10px] h-12 px-4 sm:px-6 rounded-xl shadow-sm"
                    >
                      <Ban className="w-4 h-4 mr-2 shrink-0" /> Void
                    </Button>
                  }
                />
              )}

              {currentInvoice?.status !== "voided" && currentInvoice?.status !== "paid" && (
                <DeleteConfirmationDialog
                  title="Delete Invoice"
                  description="Are you sure you want to delete this invoice? This action cannot be reversed."
                  onConfirm={() => handleDeleteInvoice(currentInvoice)}
                  trigger={
                    <Button 
                      variant="outline"
                      className="shrink-0 ml-auto border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-black uppercase tracking-widest text-[10px] h-12 px-4 sm:px-5 rounded-xl shadow-sm"
                    >
                      <Trash2 className="w-4 h-4 mr-2 shrink-0" /> Delete
                    </Button>
                  }
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPaymentSelectionOpen} onOpenChange={setIsPaymentSelectionOpen}>
        <DialogContent className="max-w-md bg-[#0a0a0a] border-white/10 rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-3">
              <DollarSign className="w-6 h-6 text-green-500" />
              Accept Payment
            </DialogTitle>
            <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold mt-1">Select payment method for {formatCurrency(currentInvoice?.total)}</p>
          </DialogHeader>
          
          <div className="grid grid-cols-1 gap-3 mt-6">
            <Button 
              className="h-16 justify-between bg-white text-black hover:bg-gray-100 rounded-2xl p-4 transition-all"
              onClick={() => handleIntegratedPayment(currentInvoice)}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-black/5 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 flex-shrink-0" />
                </div>
                <div className="text-left">
                  <span className="block font-black uppercase tracking-tight text-sm">Credit / Debit Card</span>
                  <span className="block text-[9px] text-black/40 font-bold uppercase tracking-widest">Process via Terminal</span>
                </div>
              </div>
              <ChevronLeft className="w-4 h-4 rotate-180" />
            </Button>

            <div className="h-px bg-white/5 my-2" />

            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline"
                className="h-20 flex-col gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-2xl"
                onClick={() => handleManualPayment(currentInvoice, "Cash")}
              >
                <Banknote className="w-5 h-5 text-green-500" />
                <span className="font-black uppercase tracking-widest text-[9px]">Cash</span>
              </Button>
              
              <Button 
                variant="outline"
                className="h-20 flex-col gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-2xl"
                onClick={() => handleManualPayment(currentInvoice, "Zelle")}
              >
                <QrCode className="w-5 h-5 text-blue-400" />
                <span className="font-black uppercase tracking-widest text-[9px]">Zelle</span>
              </Button>

              <Button 
                variant="outline"
                className="h-20 flex-col gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-2xl"
                onClick={() => handleManualPayment(currentInvoice, "Apple Pay")}
              >
                <Wallet className="w-5 h-5 text-white" />
                <span className="font-black uppercase tracking-widest text-[9px]">Mobile Pay</span>
              </Button>

              <Button 
                variant="outline"
                className="h-20 flex-col gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-2xl"
                onClick={() => handleManualPayment(currentInvoice, "Check")}
              >
                <FileText className="w-5 h-5 text-orange-400" />
                <span className="font-black uppercase tracking-widest text-[9px]">Check</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
