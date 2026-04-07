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
  ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import PhotoDocumentation from "../components/PhotoDocumentation";
import ServiceChecklist from "../components/ServiceChecklist";
import SignaturePad from "../components/SignaturePad";
import { decodeVin } from "../services/vin";
import { addLoyaltyPoints } from "../services/promotions";
import Logo from "../components/Logo";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
      
      // Add loyalty points for retail customers
      if (job.customerType === "retail" && job.customerId) {
        await addLoyaltyPoints(job.customerId, job.totalAmount);
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
            <p className="text-sm text-gray-500">{job.customerName || "Retail Client"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {job.status === "scheduled" && (
            <Button onClick={() => updateStatus("confirmed")} disabled={isUpdating} className="bg-black text-white hover:bg-gray-900 font-bold">
              Confirm Job
            </Button>
          )}
          {job.status === "confirmed" && (
            <Button onClick={() => updateStatus("en_route")} disabled={isUpdating} className="bg-primary hover:bg-red-700 font-bold">
              Start Route
            </Button>
          )}
          {job.status === "en_route" && (
            <Button onClick={() => updateStatus("in_progress")} disabled={isUpdating} className="bg-primary hover:bg-red-700 font-bold">
              Arrived & Start
            </Button>
          )}
          {job.status === "in_progress" && (
            <Button onClick={() => setShowSignature(true)} disabled={isUpdating} className="bg-black text-white hover:bg-gray-900 font-bold">
              Complete Job
            </Button>
          )}
          {job.status === "completed" && (
            <Dialog>
              <DialogTrigger render={<Button className="bg-emerald-600 hover:bg-emerald-700 font-bold">Collect Payment</Button>} />
              <DialogContent className="bg-white border-none shadow-2xl rounded-2xl">
                <DialogHeader><DialogTitle className="font-black">Collect Payment</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
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
                  <p className="text-xs text-gray-500">Retail Client</p>
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
                  <div>
                    <p className="font-bold text-gray-900">{job.vehicleInfo}</p>
                    {job.vin && <p className="text-[10px] font-mono text-gray-400 uppercase">{job.vin}</p>}
                  </div>
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
                    <span className="font-medium text-gray-900">${job.baseAmount / (job.serviceNames?.length || 1)}</span>
                  </div>
                ))}
                {job.travelFee > 0 && (
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-50">
                    <div className="flex items-center gap-1 text-primary font-bold">
                      <Truck className="w-3 h-3" />
                      <span>Travel Fee</span>
                    </div>
                    <span className="font-bold text-primary">${job.travelFee}</span>
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
              <Dialog open={showInvoice} onOpenChange={setShowInvoice}>
                <DialogTrigger render={<Button variant="outline" className="w-full border-gray-200" />}>
                  <div className="flex items-center">
                    <FileText className="w-4 h-4 mr-2" />
                    Generate Invoice
                  </div>
                </DialogTrigger>
                <DialogContent className="max-w-2xl bg-white p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
                  <div className="p-8 space-y-8">
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
                              <td className="py-4 text-right font-bold text-gray-900">${job.baseAmount / (job.serviceNames?.length || 1)}</td>
                            </tr>
                          ))}
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
          </Tabs>
        </div>
      </div>

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
