import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, serverTimestamp, deleteDoc, getDocs, addDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { processMaintenanceAutomation } from "../services/automationService";
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
  Loader2,
  Truck,
  ExternalLink,
  Scan,
  ShieldCheck,
  Plus,
  Trash2,
  Receipt,
  Calendar
} from "lucide-react";
import { format } from "date-fns";
import { cn, cleanAddress } from "@/lib/utils";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import PhotoDocumentation from "../components/PhotoDocumentation";
import ServiceChecklist from "../components/ServiceChecklist";
import SignaturePad from "../components/SignaturePad";
import { decodeVin } from "../services/vin";
import { addLoyaltyPoints } from "../services/promotions";
import { getUpsellRecommendations, UpsellRecommendation } from "../services/gemini";
import Logo from "../components/Logo";
import FormSigner from "../components/FormSigner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const [cancellationFee, setCancellationFee] = useState(0);
  const [isAfterCutoff, setIsAfterCutoff] = useState(false);

  // AI Upsell State
  const [technicianAssessment, setTechnicianAssessment] = useState("");
  const [isGeneratingUpsells, setIsGeneratingUpsells] = useState(false);
  const [recommendations, setRecommendations] = useState<UpsellRecommendation[]>([]);
  const [selectedRecommendations, setSelectedRecommendations] = useState<UpsellRecommendation[]>([]);

  // Manual Service Addition State
  const [showAddServiceDialog, setShowAddServiceDialog] = useState(false);
  const [allServices, setAllServices] = useState<any[]>([]);
  const [allAddons, setAllAddons] = useState<any[]>([]);
  const [customServiceName, setCustomServiceName] = useState("");
  const [customServicePrice, setCustomServicePrice] = useState("");
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  const handleConvertJobToInvoice = async () => {
    if (!job || !profile) return;
    try {
      const invoiceData = {
        clientId: job.clientId || job.customerId,
        clientName: job.customerName,
        clientEmail: job.customerEmail || "",
        clientPhone: job.customerPhone || "",
        clientAddress: job.address || "",
        technicianId: profile.uid,
        appointmentId: id,
        vehicles: [
          {
            id: job.vehicleId || "",
            year: "", 
            make: "", 
            model: job.vehicleInfo || "Vehicle",
            roNumber: job.roNumber || ""
          }
        ],
        vehicleInfo: job.vehicleInfo,
        lineItems: [
          ...(job.serviceNames || []).map((name: string, idx: number) => ({
            serviceName: name,
            price: job.servicePrices?.[idx] || (job.totalAmount / ((job.serviceNames?.length || 0) + (job.addOnNames?.length || 0) || 1))
          })),
          ...(job.addOnNames || []).map((name: string) => ({
            serviceName: `ADD-ON: ${name}`,
            price: 0 
          }))
        ],
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

      const docRef = await addDoc(collection(db, "invoices"), invoiceData);
      toast.success("Deployment converted to Tactical Invoice!");
      return docRef.id;
    } catch (error) {
      console.error("Error converting job to invoice:", error);
      toast.error("Invoice conversion failed");
    }
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
    const docRef = doc(db, "appointments", id);
    const unsubscribeJob = onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setJob({ id: docSnap.id, ...data });
        if (data.vin) {
          // Only decode if we haven't yet or if it changed
          setDecodedVin(prev => {
            if (prev?.vin === data.vin) return prev;
            decodeVin(data.vin).then(setDecodedVin);
            return prev;
          });
        }
        setLoading(false);
      } else {
        toast.error("Job not found");
        navigate("/calendar");
      }
    }, (error) => {
      console.error("Error listening to job:", error);
      toast.error("Failed to load job details");
      setLoading(false);
    });

    return () => {
      unsubscribeJob();
    };
  }, [id, profile, authLoading]);

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
      
      toast.success("Payment recorded and loyalty points added!");
    } catch (error) {
      toast.error("Failed to record payment");
    }
  };

  const updateStatus = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      const docRef = doc(db, "appointments", id!);
      const updates: any = { 
        status: newStatus,
        updatedAt: serverTimestamp(),
        [`statusHistory.${newStatus}`]: serverTimestamp()
      };
      
      // Handle status specific side effects
      if (newStatus === "completed") {
        await handleConvertJobToInvoice();
      }
      
      await updateDoc(docRef, updates);
      toast.success(`Status updated to ${newStatus.replace("_", " ")}`);
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
      await deleteDoc(doc(db, "appointments", id));
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
              <Badge variant="outline" className={cn(
                "text-[10px] font-black uppercase tracking-[0.2em] px-4 py-1 rounded-full border-none shadow-lg",
                statusColors[job.status]
              )}>
                {job.status?.replace("_", " ")}
              </Badge>
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
        <div className="flex items-center gap-3">
          {job.status === "requested" && (
            <div className="flex gap-2">
              <Button onClick={() => updateStatus("pending_approval")} disabled={isUpdating} className="bg-black text-white hover:bg-gray-900 font-bold">
                Review & Pre-Approve
              </Button>
              <Button onClick={() => updateStatus("declined")} variant="outline" disabled={isUpdating} className="border-red-200 text-red-600 hover:bg-red-50 font-bold">
                Decline
              </Button>
            </div>
          )}
          {job.status === "pending_approval" && (
            <div className="flex gap-2">
              <Button onClick={() => updateStatus("scheduled")} disabled={isUpdating} className="bg-primary hover:bg-red-700 text-white font-bold">
                Approve & Schedule
              </Button>
              <Button onClick={() => updateStatus("declined")} variant="outline" disabled={isUpdating} className="border-red-200 text-red-600 hover:bg-red-50 font-bold">
                Decline
              </Button>
            </div>
          )}
          {job.status === "scheduled" && (
            <Button onClick={() => updateStatus("confirmed")} disabled={isUpdating} className="bg-black text-white hover:bg-gray-900 font-bold">
              Confirm Job
            </Button>
          )}
          {(job.status === "confirmed" || job.status === "scheduled") && (
            <Button 
              onClick={() => {
                if (checkRequiredForms("before_start")) {
                  updateStatus("en_route");
                }
              }} 
              disabled={isUpdating} 
              className="bg-primary hover:bg-red-700 font-bold uppercase tracking-widest text-[10px] px-8 h-12 rounded-xl"
            >
              In Route
            </Button>
          )}
          {job.status === "en_route" && (
            <div className="flex items-center gap-2">
              <Button 
                onClick={() => updateStatus("scheduled")} 
                disabled={isUpdating} 
                variant="outline"
                className="border-white/10 bg-transparent text-white/50 hover:text-white rounded-xl font-bold uppercase tracking-widest text-[10px] px-4 h-12"
              >
                « Back
              </Button>
              <Button 
                onClick={() => updateStatus("arrived")} 
                disabled={isUpdating} 
                className="bg-blue-600 hover:bg-blue-700 font-bold uppercase tracking-widest text-[10px] px-8 h-12 rounded-xl"
              >
                Arrived
              </Button>
            </div>
          )}
          {job.status === "arrived" && (
            <div className="flex items-center gap-2">
              <Button 
                onClick={() => updateStatus("en_route")} 
                disabled={isUpdating} 
                variant="outline"
                className="border-white/10 bg-transparent text-white/50 hover:text-white rounded-xl font-bold uppercase tracking-widest text-[10px] px-4 h-12"
              >
                « Back
              </Button>
              <Button 
                onClick={() => {
                  if (checkRequiredForms("before_start")) {
                    updateStatus("in_progress");
                  }
                }} 
                disabled={isUpdating} 
                className="bg-primary hover:bg-red-700 font-bold uppercase tracking-widest text-[10px] px-8 h-12 rounded-xl"
              >
                Start Job
              </Button>
            </div>
          )}
          {job.status === "in_progress" && (
            <div className="flex items-center gap-2">
              <Button 
                onClick={() => updateStatus("arrived")} 
                disabled={isUpdating} 
                variant="outline"
                className="border-white/10 bg-transparent text-white/50 hover:text-white rounded-xl font-bold uppercase tracking-widest text-[10px] px-4 h-12"
              >
                « Back
              </Button>
              <Button 
                onClick={() => {
                  if (checkRequiredForms("before_complete")) {
                    setShowSignature(true);
                  }
                }} 
                disabled={isUpdating} 
                className="bg-green-600 hover:bg-green-700 text-white font-black h-12 px-8 rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-green-600/20"
              >
                Complete Job
              </Button>
            </div>
          )}
          {(job.status === "completed" || job.status === "paid") && (
            <div className="flex items-center gap-2">
              {job.status === "completed" && (
                <Button 
                  onClick={() => updateStatus("in_progress")} 
                  disabled={isUpdating} 
                  variant="outline"
                  className="border-white/10 bg-transparent text-white/50 hover:text-white rounded-xl font-bold uppercase tracking-widest text-[10px] px-4 h-12"
                >
                  « Revert
                </Button>
              )}
              <Button 
                onClick={() => {
                  navigate(`/book-appointment?clientId=${job.clientId || job.customerId}`);
                }}
                className="bg-primary hover:bg-red-700 text-white font-black h-12 px-8 rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 flex shrink-0"
              >
                <Calendar className="w-4 h-4 mr-2" /> Schedule Next
              </Button>
            </div>
          )}
          {job.status === "completed" && (
            <div className="flex items-center gap-2">
            <Button 
              onClick={() => {
                navigate("/invoices", { 
                  state: { 
                    preFillJob: job,
                    clientId: job.clientId || job.customerId,
                    vehicleIds: job.vehicleIds || (job.vehicleId ? [job.vehicleId] : [])
                  } 
                });
              }}
              className="bg-primary hover:bg-red-700 text-white font-black h-12 px-8 rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 shrink-0"
            >
              Generate Invoice
            </Button>
            <Dialog>
              <DialogTrigger render={
                <Button 
                  onClick={(e) => {
                    if (!checkRequiredForms("before_payment")) {
                      e.preventDefault();
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black h-12 px-8 rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-600/20"
                >
                  Record Instant Payment
                </Button>
              } />
              <DialogContent className="bg-white border-none shadow-2xl rounded-2xl p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b"><DialogTitle className="font-black">Collect Payment</DialogTitle></DialogHeader>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="space-y-2">
                    <Label className="font-bold">Payment Method</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="bg-white border-gray-200"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="credit">Credit Card</SelectItem>
                        <SelectItem value="venmo">Venmo</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="p-4 bg-red-50 rounded-xl flex justify-between items-center">
                    <span className="font-bold text-primary">Total Due</span>
                    <span className="text-2xl font-black text-primary">${job.totalAmount}</span>
                  </div>
                  <Button onClick={handlePayment} className="w-full bg-emerald-600 hover:bg-emerald-700 font-bold">Record Payment</Button>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="outline" size="icon">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            } />
            <DropdownMenuContent align="end" className="bg-white">
              <DropdownMenuItem 
                onSelect={() => {
                  calculateCancellationFee();
                  setShowCancelDialog(true);
                }} 
                className="text-orange-600 focus:text-orange-700 focus:bg-orange-50 font-bold"
                disabled={job.status === "canceled" || job.status === "completed" || job.status === "paid"}
              >
                <AlertCircle className="w-4 h-4 mr-2" />
                Cancel Job
              </DropdownMenuItem>
              <DeleteConfirmationDialog
                isNativeButton={false}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 focus:text-red-700 focus:bg-red-50 font-bold">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Job
                  </DropdownMenuItem>
                }
                title="Delete Job?"
                itemName={job.customerName || "this job"}
                onConfirm={handleDeleteJob}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Info Cards */}
        <div className="lg:col-span-1 space-y-6">
          {/* Customer Card */}
          <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
            <CardHeader className="bg-black/20 border-b border-white/5 p-6">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Target Intel</CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20 shadow-inner">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-xl font-black text-white tracking-tight uppercase">{job.customerName}</p>
                  <p className="text-[10px] text-primary font-black uppercase tracking-widest">Premium Client</p>
                </div>
              </div>
              <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="flex items-center gap-4 text-white group">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 group-hover:text-primary transition-colors">
                    <Phone className="w-4 h-4" />
                  </div>
                  <a href={`tel:${job.customerPhone}`} className="hover:text-primary transition-colors font-black uppercase tracking-tight text-xs">
                    {job.customerPhone || "(555) 123-4567"}
                  </a>
                </div>
                <div className="flex items-center gap-4 text-white group">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 group-hover:text-primary transition-colors">
                    <Mail className="w-4 h-4" />
                  </div>
                  <a href={`mailto:${job.customerEmail}`} className="hover:text-primary transition-colors font-black uppercase tracking-tight text-xs">
                    {job.customerEmail || "customer@example.com"}
                  </a>
                </div>
                <div className="flex items-start gap-4 text-white group">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 group-hover:text-primary transition-colors shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary transition-colors font-black uppercase tracking-tight text-xs block mb-2"
                    >
                      {cleanAddress(job.address)}
                    </a>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-lg font-black uppercase tracking-widest text-[9px] w-full"
                      onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`, '_blank')}
                    >
                      <Navigation className="w-3 h-3 mr-2 text-primary" />
                      Tactical Route
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vehicle Card */}
          <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border p-6">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Asset Profile</CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
                      <Car className="w-8 h-8" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xl font-black text-white tracking-tight">{job.vehicleInfo}</p>
                      <div className="flex items-center gap-2">
                        {job.vin ? (
                          <p className="text-[10px] font-mono text-white/40 font-black uppercase tracking-widest">{job.vin}</p>
                        ) : (
                          <p className="text-[10px] text-white/40 font-black uppercase tracking-widest italic">No VIN recorded</p>
                        )}
                      </div>
                    </div>
                    <Dialog>
                      <DialogTrigger render={
                        <Button variant="outline" size="icon" className="h-10 w-10 border-border bg-white text-gray-900 hover:bg-gray-50 rounded-xl shadow-sm">
                          <Scan className="w-5 h-5 text-primary" />
                        </Button>
                      } />
                      <DialogContent className="bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black">
                        <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                          <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase">Asset Intelligence</DialogTitle>
                        </DialogHeader>
                        <div className="p-8 space-y-6">
                          <div className="space-y-2">
                            <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Tactical VIN Entry</Label>
                            <div className="flex gap-3">
                              <Input 
                                placeholder="17-character VIN" 
                                className="bg-white/5 border-white/10 text-white rounded-xl h-12 uppercase font-mono focus:ring-primary/50"
                                defaultValue={job.vin}
                                id="vin-input"
                              />
                              <Button 
                                className="bg-primary text-white font-black h-12 px-6 rounded-xl uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all"
                                onClick={async () => {
                                  const vin = (document.getElementById("vin-input") as HTMLInputElement).value;
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
                          <div className="space-y-2">
                            <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">RO Identifier</Label>
                            <Input 
                              placeholder="Repair Order #" 
                              className="bg-white border-border text-gray-900 rounded-xl h-12 focus:ring-primary/50"
                              defaultValue={job.roNumber || (job as any).ro || (job as any).ro_number || (job as any).RONumber || (job as any).repairOrder || ""}
                              id="ro-input"
                            />
                          </div>
                          <Button 
                            className="w-full bg-primary text-white font-black h-14 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-primary/20 hover:bg-red-700 transition-all"
                            onClick={async () => {
                              const vin = (document.getElementById("vin-input") as HTMLInputElement).value;
                              const roNumber = (document.getElementById("ro-input") as HTMLInputElement).value;
                              await updateDoc(doc(db, "appointments", id!), { vin, roNumber });
                              setJob(prev => ({ ...prev, vin, roNumber }));
                              toast.success("Asset Intelligence Updated!");
                            }}
                          >
                            Synchronize Asset Data
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
              {decodedVin && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-wider">
                  <div className="text-white/40">Make: <span className="text-white">{decodedVin.make}</span></div>
                  <div className="text-white/40">Model: <span className="text-white">{decodedVin.model}</span></div>
                  <div className="text-white/40">Year: <span className="text-white">{decodedVin.year}</span></div>
                  <div className="text-white/40">Type: <span className="text-white">{decodedVin.type}</span></div>
                </div>
              )}
              {(() => {
                const rawRo = job.roNumber || (job as any).ro || (job as any).ro_number || (job as any).RONumber || (job as any).repairOrder;
                if (!rawRo) return null;
                return (
                  <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/20 rounded-xl">
                    <span className="text-xs font-black text-primary">RO Number</span>
                    <span className="text-xs font-black text-primary">{rawRo}</span>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Pricing Card */}
          <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border p-6">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Financial Intelligence</CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="space-y-4">
                {/* 1. Itemize Core Services */}
                {(job.serviceSelections || []).map((service: any, idx: number) => (
                  <div key={`service-${service.id || idx}`} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">{service.vehicleName ? `[${service.vehicleName}] ` : ""}{service.name}</span>
                    <span className="text-white font-black">${(service.price || 0).toFixed(2)}</span>
                  </div>
                ))}
                
                {/* 2. Itemize Add-ons & Enhancements */}
                {(job.addOnSelections || []).map((addon: any, idx: number) => (
                  <div key={`addon-${addon.id || idx}`} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 font-bold uppercase tracking-widest text-[10px] italic">{addon.name} {addon.qty > 1 ? `(x${addon.qty})` : ""}</span>
                    <span className="text-white font-black">${((addon.price || 0) * (addon.qty || 1)).toFixed(2)}</span>
                  </div>
                ))}

                {/* 3. Backward Compatibility: Unlisted Manual Additions */}
                {(() => {
                  const mappedServicesTotal = (job.serviceSelections || []).reduce((sum: number, s: any) => sum + (s.price || 0), 0);
                  const mappedAddonsTotal = (job.addOnSelections || []).reduce((sum: number, a: any) => sum + ((a.price || 0) * (a.qty || 1)), 0);
                  const unlistedTotal = (job.baseAmount || 0) - (mappedServicesTotal + mappedAddonsTotal);
                  
                  if (unlistedTotal > 0.01) {
                    return (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Additional Line Items</span>
                        <span className="text-white font-black">${unlistedTotal.toFixed(2)}</span>
                      </div>
                    );
                  }
                  return null;
                })()}
                
                {job.discountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm pt-2">
                    <span className="text-green-500 font-bold uppercase tracking-widest text-[10px]">Tactical Discount</span>
                    <span className="text-green-500 font-black">-${job.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                {/* Linked Invoice Link */}
                {(() => {
                  // We could fetch the invoice, but for DI summary we can just link to it if we know the ID or search by appointmentId
                  // For now, let's just show a note that an invoice was generated
                  if (job.status === "completed" || job.status === "paid") {
                    return (
                      <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl mt-4">
                        <Receipt className="w-4 h-4 text-green-500" />
                        <span className="text-[10px] font-black text-green-500 uppercase tracking-widest leading-none">Invoice Synchronized & Archived</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              <div className="pt-6 border-t border-border flex items-center justify-between">
                <span className="text-xl font-black text-white uppercase tracking-tighter">Final Total</span>
                <span className="text-3xl font-black text-primary">${job.totalAmount?.toFixed(2)}</span>
              </div>
              <div className="flex flex-col gap-2">
                <Button 
                  onClick={() => setShowAddServiceDialog(true)}
                  variant="outline"
                  className="w-full border-border bg-white text-gray-900 hover:bg-gray-50 rounded-xl h-12 font-black uppercase tracking-widest text-[10px]"
                >
                  <Plus className="w-4 h-4 mr-2 text-primary" />
                  Manually Add Service/Add-on
                </Button>
                <Dialog open={showInvoice} onOpenChange={(open) => {
                if (open && !checkRequiredForms("before_invoice")) return;
                setShowInvoice(open);
              }}>
                <DialogTrigger render={
                  <Button 
                    variant="outline" 
                    className="w-full border-border bg-white text-gray-900 hover:bg-gray-50 rounded-xl h-12 font-black uppercase tracking-widest text-[10px]"
                  >
                    <div className="flex items-center">
                      <FileText className="w-4 h-4 mr-2 text-primary" />
                      Generate Tactical Invoice
                    </div>
                  </Button>
                } />
                <DialogContent className="max-w-2xl bg-white p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
                  <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    <div className="flex justify-between items-start">
                      <div>
                        <Logo variant="full" className="mb-4" />
                        <h2 className="text-2xl font-black text-gray-900">Flatline Mobile Detail</h2>
                        <p className="text-xs text-gray-500">123 Detail Way, Austin, TX 78701</p>
                        <p className="text-xs text-gray-500">(555) 000-1111 • flatlinedetail.com</p>
                      </div>
                      <div className="text-right">
                        <h3 className="text-4xl font-black text-gray-900 uppercase tracking-tighter mb-2">Invoice</h3>
                        <p className="text-sm font-bold text-gray-900">#{id?.slice(-6).toUpperCase()}</p>
                        <p className="text-xs text-gray-500">{format(new Date(), "MMM d, yyyy")}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 pt-8 border-t border-gray-100">
                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Bill To</h4>
                        <p className="text-sm font-bold text-gray-900">{job.customerName}</p>
                        <p className="text-xs text-gray-500">{cleanAddress(job.address)}</p>
                      </div>
                      <div className="text-right">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Vehicle</h4>
                        <p className="text-sm font-bold text-gray-900">{job.vehicleInfo}</p>
                        {job.vin && <p className="text-[10px] font-mono text-gray-400 uppercase">{job.vin}</p>}
                        {(() => {
                          const rawRo = job.roNumber || (job as any).ro || (job as any).ro_number || (job as any).RONumber || (job as any).repairOrder;
                          if (!rawRo) return null;
                          return <p className="text-[10px] font-bold text-primary uppercase">RO: {rawRo}</p>;
                        })()}
                      </div>
                    </div>

                    <div className="pt-8">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 text-left">
                            <th className="pb-4 font-bold text-gray-400 uppercase text-[10px] tracking-widest">Service Description</th>
                            <th className="pb-4 text-right font-bold text-gray-400 uppercase text-[10px] tracking-widest">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {(job.serviceSelections || []).map((service: any, idx: number) => (
                            <tr key={`invoice-service-${service.id || idx}`}>
                              <td className="py-4 text-gray-700">{service.vehicleName ? `[${service.vehicleName}] ` : ""}{service.name}</td>
                              <td className="py-4 text-right font-bold text-gray-900">${(service.price || 0).toFixed(2)}</td>
                            </tr>
                          ))}
                          
                          {(job.addOnSelections || []).map((addon: any, idx: number) => (
                            <tr key={`invoice-addon-${addon.id || idx}`}>
                              <td className="py-4 text-gray-700 italic">{addon.name} {addon.qty > 1 ? `(x${addon.qty})` : ""}</td>
                              <td className="py-4 text-right font-bold text-gray-900">${((addon.price || 0) * (addon.qty || 1)).toFixed(2)}</td>
                            </tr>
                          ))}

                          {(() => {
                            const mappedServicesTotal = (job.serviceSelections || []).reduce((sum: number, s: any) => sum + (s.price || 0), 0);
                            const mappedAddonsTotal = (job.addOnSelections || []).reduce((sum: number, a: any) => sum + ((a.price || 0) * (a.qty || 1)), 0);
                            const unlistedTotal = (job.baseAmount || 0) - (mappedServicesTotal + mappedAddonsTotal);
                            
                            if (unlistedTotal > 0.01) {
                              return (
                                <tr>
                                  <td className="py-4 text-gray-700">Additional Line Items</td>
                                  <td className="py-4 text-right font-bold text-gray-900">${unlistedTotal.toFixed(2)}</td>
                                </tr>
                              );
                            }
                            return null;
                          })()}

                          {job.discountAmount > 0 && (
                            <tr>
                              <td className="py-4 text-green-600 font-bold italic">Discount / Promotion</td>
                              <td className="py-4 text-right font-bold text-green-600">-${(job.discountAmount || 0).toFixed(2)}</td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td className="pt-8 text-right font-bold text-gray-400 uppercase text-[10px] tracking-widest">Total</td>
                            <td className="pt-8 text-right text-2xl font-black text-red-600">${(job.totalAmount || 0).toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="pt-8 border-t border-gray-100">
                      <p className="text-[10px] text-gray-400 text-center">
                        Thank you for your business! Payment is due upon receipt. 
                        We accept Cash, Credit, and Venmo.
                      </p>
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setShowInvoice(false)} className="font-bold">Close</Button>
                    <Button className="bg-primary hover:bg-red-700 font-bold" onClick={() => window.print()}>
                      Print / PDF
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Tabs for Operations */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="checklist" className="w-full">
            <TabsList className="w-full bg-card border border-border p-1.5 h-16 rounded-3xl shadow-xl mb-8">
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

            <TabsContent value="ai_upsell" className="mt-0">
              <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
                <CardHeader className="p-8 border-b border-white/5 bg-black/40">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                      <Scan className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter">Tactical Upsell Intelligence</CardTitle>
                      <p className="text-[10px] text-white/50 font-black uppercase tracking-[0.2em] mt-1">AI-Powered Revenue Optimization</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-8">
                  <div className="space-y-4">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Field Assessment</Label>
                    <textarea 
                      className="w-full h-32 p-4 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-medium resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Describe what you see: 'Extreme pet hair in rear', 'Deep scratches on hood', 'Mold on driver seat belt'..."
                      value={technicianAssessment}
                      onChange={(e) => setTechnicianAssessment(e.target.value)}
                    />
                    <Button 
                      onClick={async () => {
                        if (!technicianAssessment) return;
                        setIsGeneratingUpsells(true);
                        try {
                          const recs = await getUpsellRecommendations(technicianAssessment, job);
                          setRecommendations(recs);
                          toast.success("AI Analysis Complete!");
                        } catch (err) {
                          toast.error("Failed to generate recommendations");
                        } finally {
                          setIsGeneratingUpsells(false);
                        }
                      }}
                      disabled={isGeneratingUpsells || !technicianAssessment}
                      className="w-full h-14 bg-primary hover:bg-red-700 text-white font-black rounded-xl uppercase tracking-[0.2em] text-[10px]"
                    >
                      {isGeneratingUpsells ? <Loader2 className="w-5 h-5 animate-spin" /> : "Initiate AI Analysis"}
                    </Button>
                  </div>

                  {recommendations.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      {recommendations.map((rec, idx) => {
                        const isSelected = selectedRecommendations.some(r => r.serviceName === rec.serviceName);
                        return (
                          <div 
                            key={idx} 
                            className={cn(
                              "p-6 rounded-2xl border transition-all cursor-pointer group flex flex-col",
                              isSelected ? "bg-primary/20 border-primary" : "bg-white/5 border-white/10 hover:border-white/20"
                            )}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedRecommendations(selectedRecommendations.filter(r => r.serviceName !== rec.serviceName));
                              } else {
                                setSelectedRecommendations([...selectedRecommendations, rec]);
                              }
                            }}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-black text-white uppercase tracking-tight">{rec.serviceName}</h4>
                              {isSelected ? (
                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  <span className="text-primary font-black text-lg">$</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={rec.recommendedPrice}
                                    onChange={(e) => {
                                      const newPrice = parseFloat(e.target.value) || 0;
                                      const updatedRec = { ...rec, recommendedPrice: newPrice };
                                      setRecommendations(recommendations.map(r => r.serviceName === rec.serviceName ? updatedRec : r));
                                      setSelectedRecommendations(selectedRecommendations.map(r => r.serviceName === rec.serviceName ? updatedRec : r));
                                    }}
                                    className="w-20 h-auto py-1 px-2 bg-black/40 border border-primary/50 text-white font-black text-lg text-right"
                                  />
                                </div>
                              ) : (
                                <span className="font-black text-primary text-lg">${rec.recommendedPrice}</span>
                              )}
                            </div>
                            <p className="text-xs text-white/60 font-medium mb-4 leading-relaxed flex-1">{rec.reason}</p>
                            <div className="flex items-center justify-between mt-auto">
                              <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">{rec.priceRange}</span>
                              <div className={cn(
                                "w-5 h-5 rounded-full border flex items-center justify-center transition-all",
                                isSelected ? "bg-primary border-primary text-white" : "border-white/20 text-transparent"
                              )}>
                                <CheckCircle2 className="w-3 h-3" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedRecommendations.length > 0 && (
                    <Button 
                      onClick={async () => {
                        setIsUpdating(true);
                        try {
                          const docRef = doc(db, "appointments", id!);
                          const currentAddons = job.addOnNames || [];
                          const currentTotal = job.totalAmount || 0;
                          const currentBase = job.baseAmount || 0;
                          
                          const newAddons = [...currentAddons, ...selectedRecommendations.map(r => `${r.serviceName} ($${r.recommendedPrice})`)];
                          const addedValue = selectedRecommendations.reduce((sum, r) => sum + r.recommendedPrice, 0);
                          
                          const newAddonSelections = [...(job.addOnSelections || []), ...selectedRecommendations.map(r => ({
                            id: `ai-upsell-${Date.now()}-${Math.random()}`,
                            name: r.serviceName,
                            price: r.recommendedPrice,
                            qty: 1
                          }))];

                          await updateDoc(docRef, {
                            addOnNames: newAddons,
                            addOnSelections: newAddonSelections,
                            totalAmount: currentTotal + addedValue,
                            baseAmount: currentBase + addedValue,
                            internalNotes: (job.internalNotes || "") + `\n\nAI Upsells Applied: ${selectedRecommendations.map(r => `${r.serviceName} ($${r.recommendedPrice})`).join(", ")}`
                          });
                          
                          toast.success("Tactical Upsells Synchronized!");
                          setRecommendations([]);
                          setSelectedRecommendations([]);
                          setTechnicianAssessment("");
                        } catch (err) {
                          toast.error("Failed to sync upsells");
                        } finally {
                          setIsUpdating(false);
                        }
                      }}
                      className="w-full h-14 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl uppercase tracking-[0.2em] text-xs shadow-xl shadow-green-600/20 shrink-0 mt-8"
                    >
                      Apply Selected Assets (+${selectedRecommendations.reduce((sum, r) => sum + r.recommendedPrice, 0)})
                    </Button>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="checklist" className="mt-0">
              <ServiceChecklist jobId={job.id} services={job.serviceNames || []} />
            </TabsContent>

            <TabsContent value="photos" className="mt-0 space-y-8">
              <PhotoDocumentation jobId={job.id} type="before" />
              <PhotoDocumentation jobId={job.id} type="after" />
              <PhotoDocumentation jobId={job.id} type="damage" />
            </TabsContent>

            <TabsContent value="notes" className="mt-0">
              <Card className="border-none shadow-sm bg-white">
                <CardContent className="p-6">
                  <textarea 
                    className="w-full h-40 p-4 rounded-2xl border border-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-sm font-medium"
                    placeholder="Add job notes, technician observations, or special instructions..."
                    defaultValue={job.notes}
                  />
                  <div className="flex justify-end mt-4">
                    <Button className="bg-primary hover:bg-red-700 font-bold">Save Notes</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="forms" className="mt-0 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold">Job Forms & Waivers</h3>
                <Dialog>
                  <DialogTrigger render={
                    <Button size="sm" variant="outline" className="font-bold">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Form
                    </Button>
                  } />
                  <DialogContent className="max-w-2xl bg-white p-6 rounded-2xl border-none shadow-2xl">
                    <DialogHeader><DialogTitle className="font-black">Select Form to Add</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-1 gap-3 mt-4">
                      {formTemplates.filter(t => t.isActive).map(t => (
                        <Button 
                          key={t.id} 
                          variant="outline" 
                          className="justify-start h-auto p-4 flex-col items-start gap-1"
                          onClick={() => setShowFormSigner(t)}
                        >
                          <span className="font-bold">{t.title}</span>
                          <span className="text-[10px] text-gray-500 capitalize">{t.category} • v{t.version}</span>
                        </Button>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {signedForms.length === 0 ? (
                <Card className="border-none shadow-sm bg-white">
                  <CardContent className="p-12 text-center space-y-3">
                    <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                      <FileText className="w-6 h-6 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-500 font-medium">No forms have been signed for this job yet.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {signedForms.map(sf => (
                    <Card key={sf.id} className="border-none shadow-sm bg-white overflow-hidden">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{sf.formTitle}</p>
                            <p className="text-[10px] text-gray-500">Signed on {format(new Date(sf.signedAt), "MMM d, yyyy h:mm a")}</p>
                          </div>
                        </div>
                        <Dialog>
                          <DialogTrigger render={<Button variant="ghost" size="sm" className="font-bold text-primary">View</Button>} />
                          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white p-8 rounded-2xl border-none shadow-2xl">
                            <div className="space-y-8">
                              <div className="flex justify-between items-start border-b pb-6">
                                <div>
                                  <h2 className="text-2xl font-black uppercase tracking-tighter">{sf.formTitle}</h2>
                                  <p className="text-xs text-gray-500">Version {sf.formVersion} • Signed At: {format(new Date(sf.signedAt), "MMM d, yyyy h:mm a")}</p>
                                </div>
                                <Badge className="bg-green-100 text-green-700 border-green-200">Verified Signature</Badge>
                              </div>
                              
                              <div className="prose prose-sm max-w-none p-6 bg-gray-50 rounded-xl border border-gray-100">
                                <ReactMarkdown>{formTemplates.find(t => t.id === sf.formId)?.content || "Content unavailable"}</ReactMarkdown>
                              </div>

                              <div className="grid grid-cols-2 gap-8">
                                {sf.printedName && (
                                  <div>
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Printed Name</Label>
                                    <p className="font-bold text-gray-900">{sf.printedName}</p>
                                  </div>
                                )}
                                {sf.initials && (
                                  <div>
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Initials</Label>
                                    <p className="font-bold text-gray-900">{sf.initials}</p>
                                  </div>
                                )}
                                {sf.date && (
                                  <div>
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Date</Label>
                                    <p className="font-bold text-gray-900">{sf.date}</p>
                                  </div>
                                )}
                              </div>

                              {sf.signature && (
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Signature</Label>
                                  <div className="border rounded-xl p-4 bg-white inline-block">
                                    <img src={sf.signature} alt="Signature" className="h-24" />
                                  </div>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

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
                      ${cancellationFee.toFixed(2)}
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
                          price: price
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
                        price: s.basePrice || 0
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
            <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Add-ons</Label>
            <div className="grid grid-cols-1 gap-2">
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
