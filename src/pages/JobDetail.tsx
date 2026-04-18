import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, serverTimestamp, deleteDoc, getDocs } from "firebase/firestore";
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
  Trash2
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import PhotoDocumentation from "../components/PhotoDocumentation";
import ServiceChecklist from "../components/ServiceChecklist";
import SignaturePad from "../components/SignaturePad";
import { decodeVin } from "../services/vin";
import { addLoyaltyPoints } from "../services/promotions";
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
      await updateDoc(docRef, { 
        status: newStatus,
        updatedAt: serverTimestamp(),
        [`statusHistory.${newStatus}`]: serverTimestamp()
      });
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
    en_route: "bg-primary text-white border-primary",
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
                Deployment <span className="text-primary italic">Details</span>
              </h1>
              <Badge variant="outline" className={cn(
                "text-[10px] font-black uppercase tracking-[0.2em] px-4 py-1 rounded-full border-none",
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
          {job.status === "confirmed" && (
            <Button 
              onClick={() => {
                if (checkRequiredForms("before_start")) {
                  updateStatus("en_route");
                }
              }} 
              disabled={isUpdating} 
              className="bg-primary hover:bg-red-700 font-bold"
            >
              Start Route
            </Button>
          )}
          {job.status === "en_route" && (
            <Button 
              onClick={() => {
                if (checkRequiredForms("before_start")) {
                  updateStatus("in_progress");
                }
              }} 
              disabled={isUpdating} 
              className="bg-primary hover:bg-red-700 font-bold"
            >
              Arrived & Start
            </Button>
          )}
          {job.status === "in_progress" && (
            <Button 
              onClick={() => {
                if (checkRequiredForms("before_complete")) {
                  setShowSignature(true);
                }
              }} 
              disabled={isUpdating} 
              className="bg-green-600 hover:bg-green-700 text-white font-black h-12 px-8 rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-green-600/20"
            >
              Complete Mission & Secure Signature
            </Button>
          )}
          {job.status === "completed" && (
            <div className="flex gap-2">
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
              className="bg-primary hover:bg-red-700 text-white font-black h-12 px-8 rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20"
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
                      {job.address}
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
                      <p className="text-xl font-black text-white tracking-tight uppercase">{job.vehicleInfo}</p>
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
                {job.serviceNames?.map((service: string) => (
                  <div key={service} className="flex items-center justify-between text-sm">
                    <span className="text-white/70 font-black uppercase tracking-tight text-xs">{service}</span>
                    <span className="font-black text-white text-xs uppercase tracking-widest">Included</span>
                  </div>
                ))}
                {job.addOnNames?.map((addon: string) => (
                  <div key={addon} className="flex items-center justify-between text-sm">
                    <span className="text-white/70 font-black uppercase tracking-tight text-xs italic">{addon} (Add-on)</span>
                    <span className="font-black text-white text-xs uppercase tracking-widest">Included</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm pt-4 border-t border-border">
                  <span className="text-gray-400 uppercase text-[10px] font-black tracking-widest">Subtotal</span>
                  <span className="font-black text-gray-900">${job.baseAmount}</span>
                </div>
                {job.travelFee > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 font-black uppercase tracking-tight text-xs">Travel Fee</span>
                    <span className="font-black text-gray-900 text-xs uppercase tracking-widest">${job.travelFee}</span>
                  </div>
                )}
                {job.discountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm text-green-600 font-black uppercase tracking-widest">
                    <span>Tactical Discount</span>
                    <span>-${job.discountAmount}</span>
                  </div>
                )}
              </div>
              <div className="pt-6 border-t border-border flex items-center justify-between">
                <span className="text-xl font-black text-gray-900 uppercase tracking-tighter">Final Total</span>
                <span className="text-3xl font-black text-primary">${job.totalAmount}</span>
              </div>
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
                        <h3 className="text-4xl font-black text-gray-100 uppercase tracking-tighter mb-2">Invoice</h3>
                        <p className="text-sm font-bold text-gray-900">#{id?.slice(-6).toUpperCase()}</p>
                        <p className="text-xs text-gray-500">{format(new Date(), "MMM d, yyyy")}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 pt-8 border-t border-gray-100">
                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Bill To</h4>
                        <p className="text-sm font-bold text-gray-900">{job.customerName}</p>
                        <p className="text-xs text-gray-500">{job.address}</p>
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
                          {job.serviceNames?.map((service: string) => (
                            <tr key={service}>
                              <td className="py-4 text-gray-700">{service}</td>
                              <td className="py-4 text-right font-bold text-gray-900">Included</td>
                            </tr>
                          ))}
                          {job.addOnNames?.map((addon: string) => (
                            <tr key={addon}>
                              <td className="py-4 text-gray-700 italic">{addon} (Add-on)</td>
                              <td className="py-4 text-right font-bold text-gray-900">Included</td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50/50">
                            <td className="py-2 px-4 text-gray-500 font-bold text-xs uppercase">Service Subtotal</td>
                            <td className="py-2 px-4 text-right font-black text-gray-900">${job.baseAmount}</td>
                          </tr>
                          {job.travelFee > 0 && (
                            <tr>
                              <td className="py-4 text-gray-700 flex items-center gap-2">
                                <Truck className="w-3 h-3 text-primary" />
                                Travel Fee
                              </td>
                              <td className="py-4 text-right font-bold text-primary">${job.travelFee}</td>
                            </tr>
                          )}
                          {job.discountAmount > 0 && (
                            <tr>
                              <td className="py-4 text-green-600 font-bold italic">Discount / Promotion</td>
                              <td className="py-4 text-right font-bold text-green-600">-${job.discountAmount}</td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td className="pt-8 text-right font-bold text-gray-400 uppercase text-[10px] tracking-widest">Total Amount Due</td>
                            <td className="pt-8 text-right text-2xl font-black text-red-600">${job.totalAmount}</td>
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
                <ShieldCheck className="w-4 h-4 mr-2" />
                Tactical Forms
              </TabsTrigger>
            </TabsList>

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
    </div>
  );
}
