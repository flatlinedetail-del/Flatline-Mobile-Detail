import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Plus
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
import { collection, query, where, onSnapshot } from "firebase/firestore";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
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
    if (!id) return;
    
    // Fetch active form templates
    const templatesQuery = query(collection(db, "form_templates"), where("isActive", "==", true));
    const unsubscribeTemplates = onSnapshot(templatesQuery, (snapshot) => {
      setFormTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Fetch signed forms for this appointment
    const signedQuery = query(collection(db, "signed_forms"), where("appointmentId", "==", id));
    const unsubscribeSigned = onSnapshot(signedQuery, (snapshot) => {
      setSignedForms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeTemplates();
      unsubscribeSigned();
    };
  }, [id]);

  const handleSaveSignature = async (dataUrl: string) => {
    try {
      const docRef = doc(db, "appointments", id!);
      await updateDoc(docRef, { 
        signature: dataUrl,
        status: "completed",
        completedAt: serverTimestamp()
      });
      setJob(prev => ({ ...prev, signature: dataUrl, status: "completed" }));
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
      
      setJob(prev => ({ ...prev, status: "paid", paymentMethod }));
      toast.success("Payment recorded and loyalty points added!");
    } catch (error) {
      toast.error("Failed to record payment");
    }
  };

  useEffect(() => {
    if (id) loadJob();
  }, [id]);

  const loadJob = async () => {
    try {
      const docRef = doc(db, "appointments", id!);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setJob({ id: docSnap.id, ...data });
        if (data.vin) {
          const vinData = await decodeVin(data.vin);
          setDecodedVin(vinData);
        }
      } else {
        toast.error("Job not found");
        navigate("/appointments");
      }
    } catch (error) {
      console.error("Error loading job:", error);
      toast.error("Failed to load job details");
    } finally {
      setLoading(false);
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
      setJob(prev => ({ ...prev, status: newStatus }));
      toast.success(`Status updated to ${newStatus.replace("_", " ")}`);
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const statusColors: any = {
    scheduled: "bg-gray-100 text-gray-700 border-gray-200",
    confirmed: "bg-black text-white border-black",
    en_route: "bg-red-50 text-primary border-red-200",
    in_progress: "bg-primary text-white border-primary",
    completed: "bg-green-100 text-green-700 border-green-200",
    paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    canceled: "bg-red-100 text-red-700 border-red-200",
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Job #{id?.slice(-6).toUpperCase()}</h1>
              <Badge variant="outline" className={cn("text-[10px] font-bold uppercase tracking-wider", statusColors[job.status])}>
                {job.status?.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-sm text-gray-500">{job.customerName || "Client"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
              className="bg-black text-white hover:bg-gray-900 font-bold"
            >
              Complete Job
            </Button>
          )}
          {job.status === "completed" && (
            <Dialog>
              <DialogTrigger render={
                <Button 
                  onClick={(e) => {
                    if (!checkRequiredForms("before_payment")) {
                      e.preventDefault();
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 font-bold"
                >
                  Collect Payment
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
          )}
          <Button variant="outline" size="icon">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Info Cards */}
        <div className="lg:col-span-1 space-y-6">
          {/* Customer Card */}
          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-gray-400">Customer Info</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-primary">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">{job.customerName}</p>
                  <p className="text-xs text-gray-500">Client</p>
                </div>
              </div>
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <a href={`tel:${job.customerPhone}`} className="hover:text-primary transition-colors font-medium">
                    {job.customerPhone || "(555) 123-4567"}
                  </a>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <a href={`mailto:${job.customerEmail}`} className="hover:text-primary transition-colors font-medium">
                    {job.customerEmail || "customer@example.com"}
                  </a>
                </div>
                <div className="flex items-start gap-3 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 hover:text-primary transition-colors font-medium"
                  >
                    {job.address}
                  </a>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 text-primary hover:bg-red-50"
                    onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`, '_blank')}
                  >
                    <Navigation className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vehicle Card */}
          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-gray-400">Vehicle Info</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center text-white">
                      <Car className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-gray-900">{job.vehicleInfo}</p>
                      <div className="flex items-center gap-2">
                        {job.vin ? (
                          <p className="text-[10px] font-mono text-gray-400 uppercase">{job.vin}</p>
                        ) : (
                          <p className="text-[10px] text-gray-400 italic">No VIN recorded</p>
                        )}
                      </div>
                    </div>
                    <Dialog>
                      <DialogTrigger render={
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-red-50">
                          <Scan className="w-4 h-4" />
                        </Button>
                      } />
                      <DialogContent className="bg-white border-none shadow-2xl rounded-2xl p-0 overflow-hidden">
                        <DialogHeader className="p-6 border-b"><DialogTitle className="font-black">VIN Management</DialogTitle></DialogHeader>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                          <div className="space-y-2">
                            <Label className="font-bold">Enter VIN</Label>
                            <div className="flex gap-2">
                              <Input 
                                placeholder="17-character VIN" 
                                className="bg-white border-gray-200 uppercase font-mono"
                                defaultValue={job.vin}
                                id="vin-input"
                              />
                              <Button 
                                className="bg-black text-white font-bold"
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
                          <Button 
                            className="w-full bg-primary font-bold"
                            onClick={async () => {
                              const vin = (document.getElementById("vin-input") as HTMLInputElement).value;
                              await updateDoc(doc(db, "appointments", id!), { vin });
                              setJob(prev => ({ ...prev, vin }));
                              toast.success("VIN Saved!");
                            }}
                          >
                            Save to Job
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
              {decodedVin && (
                <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-wider">
                  <div className="text-gray-400">Make: <span className="text-gray-900">{decodedVin.make}</span></div>
                  <div className="text-gray-400">Model: <span className="text-gray-900">{decodedVin.model}</span></div>
                  <div className="text-gray-400">Year: <span className="text-gray-900">{decodedVin.year}</span></div>
                  <div className="text-gray-400">Type: <span className="text-gray-900">{decodedVin.type}</span></div>
                </div>
              )}
              {job.roNumber && (
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl">
                  <span className="text-xs font-bold text-primary">RO Number</span>
                  <span className="text-xs font-black text-primary">{job.roNumber}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pricing Card */}
          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-gray-400">Financials</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-2">
                {job.serviceNames?.map((service: string) => (
                  <div key={service} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{service}</span>
                    <span className="font-medium text-gray-900">Included</span>
                  </div>
                ))}
                {job.addOnNames?.map((addon: string) => (
                  <div key={addon} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 italic">{addon} (Add-on)</span>
                    <span className="font-medium text-gray-900">Included</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-50">
                  <span className="text-gray-400 uppercase text-[10px] font-bold">Subtotal</span>
                  <span className="font-bold text-gray-900">${job.baseAmount}</span>
                </div>
                {job.travelFee > 0 && (
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100 animate-in fade-in slide-in-from-right-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-primary uppercase tracking-widest">Travel Surcharge</span>
                        <span className="text-[10px] text-red-700 font-medium">{job.travelFeeBreakdown?.miles || 0} miles</span>
                      </div>
                    </div>
                    <span className="font-black text-primary">${job.travelFee}</span>
                  </div>
                )}
                {job.discountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm text-green-600 font-bold">
                    <span>Discount</span>
                    <span>-${job.discountAmount}</span>
                  </div>
                )}
              </div>
              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-lg font-bold text-gray-900">Total</span>
                <span className="text-2xl font-black text-red-600">${job.totalAmount}</span>
              </div>
              <Dialog open={showInvoice} onOpenChange={(open) => {
                if (open && !checkRequiredForms("before_invoice")) return;
                setShowInvoice(open);
              }}>
                <DialogTrigger render={
                  <Button 
                    variant="outline" 
                    className="w-full border-gray-200"
                  >
                    <div className="flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Generate Invoice
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
                                Travel Fee ({job.travelFeeBreakdown?.miles} miles)
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
            <TabsList className="w-full bg-white border border-gray-100 p-1 h-12 rounded-2xl shadow-sm mb-6">
              <TabsTrigger value="checklist" className="flex-1 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold">
                <ClipboardList className="w-4 h-4 mr-2" />
                Checklist
              </TabsTrigger>
              <TabsTrigger value="photos" className="flex-1 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold">
                <Camera className="w-4 h-4 mr-2" />
                Photos
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex-1 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold">
                <AlertCircle className="w-4 h-4 mr-2" />
                Notes
              </TabsTrigger>
              <TabsTrigger value="forms" className="flex-1 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white font-bold">
                <ShieldCheck className="w-4 h-4 mr-2" />
                Forms
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
    </div>
  );
}
