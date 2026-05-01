import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, deleteDoc, doc, updateDoc, getDocs, getDoc, limit, where, arrayUnion, deleteField } from "firebase/firestore";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { SearchableSelector } from "../components/SearchableSelector";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import { messagingService } from "../services/messagingService";
import { PageHeader } from "../components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { 
  Plus, 
  Search, 
  Filter, 
  Receipt, 
  Trash2, 
  Car, 
  User as UserIcon, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileText,
  Mail,
  User,
  Settings2,
  CreditCard,
  DollarSign,
  Eye,
  Calendar,
  Undo,
  Ban,
  RefreshCcw
} from "lucide-react";
import { paymentService } from "../services/paymentService";
import { toast } from "sonner";
import AddressInput from "../components/AddressInput";
import VehicleSelector from "../components/VehicleSelector";
import { format } from "date-fns";
import { Invoice, Client, Vehicle, Service, AddOn, BusinessSettings, LineItem } from "../types";
import { DocumentPreview } from "../components/DocumentPreview";
import { Checkbox } from "../components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, getClientDisplayName, cleanAddress, formatCurrency } from "@/lib/utils";
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

export default function Invoices() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const location = useLocation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  const fetchInvoicesData = async (showToast = false) => {
    // Check cache first if not performing a manual sync
    if (!showToast) {
      const cached = sessionStorage.getItem('invoices_cache');
      const cacheTime = sessionStorage.getItem('invoices_cache_time');
      const now = Date.now();
      
      if (cached && cacheTime && now - Number(cacheTime) < 5 * 60 * 1000) { // 5 min cache
        setInvoices(JSON.parse(cached));
        setLoading(false);
        
        // Also try to get settings from cache if available
        const cachedSettings = sessionStorage.getItem('business_settings_cache');
        if (cachedSettings) {
          setSettings(JSON.parse(cachedSettings));
        } else {
          // If settings missing, fetch them
          const settingsSnap = await getDoc(doc(db, "settings", "business")).catch(e => handleFirestoreError(e, OperationType.GET, "settings/business"));
          if (settingsSnap && settingsSnap.exists()) {
            const sData = settingsSnap.data() as BusinessSettings;
            setSettings(sData);
            sessionStorage.setItem('business_settings_cache', JSON.stringify(sData));
          }
        }
        return;
      }
    }

    if (showToast) toast.loading("Syncing Ledger...", { id: "sync-invoices" });
    try {
      const queryRef = query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(50));
      const snap = await getDocs(queryRef).catch(e => handleFirestoreError(e, OperationType.LIST, "invoices"));
      if (!snap) return;
      const invoicesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      setInvoices(invoicesData);
      
      // Update cache
      sessionStorage.setItem('invoices_cache', JSON.stringify(invoicesData));
      sessionStorage.setItem('invoices_cache_time', Date.now().toString());
      
      const settingsSnap = await getDoc(doc(db, "settings", "business")).catch(e => handleFirestoreError(e, OperationType.GET, "settings/business"));
      if (settingsSnap && settingsSnap.exists()) {
        const sData = settingsSnap.data() as BusinessSettings;
        setSettings(sData);
        sessionStorage.setItem('business_settings_cache', JSON.stringify(sData));
      }
      setLoading(false);
      if (showToast) toast.success("Ledger Synchronized", { id: "sync-invoices" });
    } catch (error) {
      console.error("Error fetching invoice data:", error);
      setLoading(false);
      if (showToast) toast.error("Sync Failed", { id: "sync-invoices" });
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    fetchInvoicesData();
  }, [profile, authLoading]);

  // Fetch vehicles removed during rebuild
  useEffect(() => {
    // Placeholder
  }, []);

  const handleAddLineItem = () => {
    toast.info("Item management disabled during rebuild");
  };

  const handleRemoveLineItem = (index: number) => {
    // Placeholder
  };

  const handleLineItemChange = (index: number, field: keyof LineItem, value: any) => {
    // Placeholder
  };

  const calculateTotal = () => {
    return 0;
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.info("Invoice creation is temporarily disabled during system rebuild");
  };

  const resetForm = () => {
    // UI placeholder
  };

  const handleCloverPayment = async () => {
    toast.info("Payment system is being rebuilt");
  };

  const handleMarkAsPaid = async (invoice: Invoice | null) => {
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
      await updateDoc(invoiceRef, {
        status: "paid",
        paidAt: serverTimestamp(),
        paymentStatus: "paid",
        paymentProvider: "manual",
        paymentHistory: arrayUnion(paymentHistoryEntry)
      });
      setSelectedInvoice((prev) => prev ? { 
        ...prev, 
        status: "paid", 
        paymentStatus: "paid", 
        paymentProvider: "manual",
        paymentHistory: [...(prev.paymentHistory || []), { ...paymentHistoryEntry, timestamp: new Date() }]
      } as Invoice : null);
      
      // Send Payment Receipt SMS
      if (invoice.clientPhone) {
        messagingService.sendSms({
          to: invoice.clientPhone,
          body: `Flatline Mobile Detail: Payment received. Thank you! We appreciate your business. Reply STOP to opt out.`
        }).then(() => console.log("Payment Receipt SMS sent successfully."))
          .catch(e => console.error("Receipt SMS failed:", e));
      }

      // Invalidate cache
      sessionStorage.removeItem('invoices_cache');
      sessionStorage.removeItem('invoices_cache_time');
      
      toast.success("Payment recorded successfully", { id: "payment" });
      
      if (invoice.appointmentId) {
        const docRef = doc(db, "appointments", invoice.appointmentId);
        await updateDoc(docRef, { paymentStatus: "paid" });
      }
    } catch (error) {
       console.error("Payment error", error);
       toast.error("Failed to process payment", { id: "payment" });
    }
  };

  const handleVoidInvoice = async (invoice: Invoice | null) => {
    if (!invoice?.id) return;
    try {
      toast.loading("Applying void protocol...", { id: "delete" });
      const invoiceRef = doc(db, "invoices", invoice.id);
      const paymentHistoryEntry = {
        action: "voided",
        timestamp: serverTimestamp(),
        method: invoice.paymentMethodDetails || invoice.paymentProvider || "unknown"
      };
      await updateDoc(invoiceRef, {
        status: "voided",
        paymentStatus: "voided",
        paymentHistory: arrayUnion(paymentHistoryEntry)
      });
      setSelectedInvoice((prev) => prev ? { 
        ...prev, 
        status: "voided",
        paymentStatus: "voided",
        paymentHistory: [...(prev.paymentHistory || []), { ...paymentHistoryEntry, timestamp: new Date() }]
      } as Invoice : null);
      setIsDetailOpen(false);
      // Invalidate cache
      sessionStorage.removeItem('invoices_cache');
      sessionStorage.removeItem('invoices_cache_time');
      
      toast.success("Invoice voided successfully", { id: "delete" });

      if (invoice.appointmentId) {
        const docRef = doc(db, "appointments", invoice.appointmentId);
        await updateDoc(docRef, { paymentStatus: "voided" });
      }
    } catch (error) {
       console.error("Void error", error);
       toast.error("Failed to void invoice", { id: "delete" });
    }
  };

  const handleUndoPayment = async (invoice: Invoice | null) => {
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

      await updateDoc(invoiceRef, updateData as any);
      
      setSelectedInvoice((prev: any) => {
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
      
      // Invalidate cache
      sessionStorage.removeItem('invoices_cache');
      sessionStorage.removeItem('invoices_cache_time');
      
      toast.success("Payment reversed to unpaid", { id: "payment-undo" });
      
      if (invoice.appointmentId) {
        const docRef = doc(db, "appointments", invoice.appointmentId);
        await updateDoc(docRef, { paymentStatus: "unpaid" });
      }
    } catch (error) {
       console.error("Undo payment error:", error);
       toast.error("Failed to undo payment", { id: "payment-undo" });
    }
  };

  const handleDownloadPDF = async (invoice: Invoice | null) => {
    if (!invoice) return;
    
    // Use a small delay to ensure DOM is ready if it was just selected
    setTimeout(async () => {
      const element = document.getElementById("invoice-preview-content-detail");
      if (!element) {
        toast.error("Internal error: Capture target not found");
        return;
      }

      try {
        toast.loading("Generating Secure PDF...", { id: "pdf-gen" });
        
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#F3F4F6",
          windowWidth: 1000 
        });
        
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF("p", "mm", "a4");
        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
        pdf.save(`Invoice_${invoice.invoiceNumber || invoice.id.slice(-6).toUpperCase()}.pdf`);
        toast.success("Financial Record Exported successfully", { id: "pdf-gen" });
      } catch (error) {
        console.error("PDF generation failed:", error);
        toast.error("Failed to generate PDF document", { id: "pdf-gen" });
      }
    }, 100);
  };

  const filteredInvoices = invoices.filter(inv => 
    inv.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-20">
      <PageHeader 
        title="Financial Ledger" 
        accentWord="Ledger" 
        subtitle="Billing & Transaction Management"
        actions={
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) {
              resetForm();
            }
          }}>
            <DialogTrigger render={
              <Button className="bg-primary hover:bg-red-700 text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-primary/20 transition-all hover:scale-105" onClick={() => {
                resetForm();
                setIsAddDialogOpen(true);
              }}>
                <Plus className="w-4 h-4 mr-2" />
                Generate Invoice
              </Button>
            } />
          <DialogContent className="sm:max-w-[500px] p-8 bg-card border-none rounded-3xl shadow-2xl shadow-black flex flex-col items-center justify-center text-center">
            <DialogHeader>
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 mb-4 mx-auto">
                <Settings2 className="w-8 h-8 animate-spin-slow" />
              </div>
              <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">System Offline</DialogTitle>
            </DialogHeader>
            <div className="py-6">
              <p className="text-white/60 font-medium italic">"Invoice system is being rebuilt"</p>
              <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em] mt-4">Legacy Address Mapping Offline</p>
            </div>
            <DialogFooter className="w-full">
              <Button onClick={() => setIsAddDialogOpen(false)} className="w-full bg-primary hover:bg-red-700 text-white font-black h-12 rounded-xl">Acknowledged</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    />

      <div className="hidden" aria-hidden="true" />

      <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
        <CardHeader className="bg-black/40 border-b border-white/5 p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <Input 
              placeholder="Search financial records..." 
              className="pl-12 bg-white border-border text-black rounded-xl h-12 font-medium focus:ring-primary/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              className="border-border bg-white text-black hover:bg-gray-50 rounded-xl h-12 px-6 font-black uppercase tracking-widest text-[10px]"
              onClick={() => fetchInvoicesData(true)}
            >
              <RefreshCcw className="w-4 h-4 mr-2 text-primary" />
              Sync Ledger
            </Button>
            <Button variant="outline" size="sm" className="border-border bg-white text-black hover:bg-gray-50 rounded-xl h-12 px-6 font-black uppercase tracking-widest text-[10px]">
              <Filter className="w-4 h-4 mr-2 text-primary" />
              Filter Ledger
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-black/20 border-b border-white/5">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="px-8 py-5 text-[11px] font-black text-white/30 uppercase tracking-[0.25em] h-16">Record ID</TableHead>
                <TableHead className="px-8 py-5 text-[11px] font-black text-white/30 uppercase tracking-[0.25em] h-16">Client Entity</TableHead>
                <TableHead className="px-8 py-5 text-[11px] font-black text-white/30 uppercase tracking-[0.25em] h-16">Timestamp</TableHead>
                <TableHead className="px-8 py-5 text-[11px] font-black text-white/30 uppercase tracking-[0.25em] h-16">Total Value</TableHead>
                <TableHead className="px-8 py-5 text-[11px] font-black text-white/30 uppercase tracking-[0.25em] h-16">Status</TableHead>
                <TableHead className="px-8 py-5 text-[11px] font-black text-white/30 uppercase tracking-[0.25em] h-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="hover:bg-transparent border-border">
                  <TableCell colSpan={6} className="text-center py-20 text-white font-black uppercase tracking-widest text-[10px] animate-pulse">Synchronizing Ledger...</TableCell>
                </TableRow>
              ) : filteredInvoices.length === 0 ? (
                <TableRow className="hover:bg-transparent border-border">
                  <TableCell colSpan={6} className="text-center py-20 text-white font-black uppercase tracking-widest text-[10px]">No invoices found.</TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((inv) => (
                  <TableRow 
                    key={inv.id} 
                    className="hover:bg-gray-50/50 hover:text-black transition-all duration-300 cursor-pointer group border-border"
                    onClick={() => {
                      setSelectedInvoice(inv);
                      setIsDetailOpen(true);
                    }}
                  >
                    <TableCell className="px-8 py-6 font-mono text-[10px] font-black uppercase text-white group-hover:text-black tracking-widest">
                      {inv.invoiceNumber || `#${inv.id.slice(-6)}`}
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary border border-primary/20">
                          <UserIcon className="w-4 h-4" />
                        </div>
                        <span className="font-black text-white group-hover:text-black uppercase tracking-tight text-sm">{inv.clientName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-8 py-6 text-[10px] font-black text-white group-hover:text-black uppercase tracking-widest">
                      {inv.createdAt ? format((inv.createdAt as any).toDate(), "MMM d, yyyy") : "Pending"}
                    </TableCell>
                    <TableCell className="px-8 py-6 font-black text-white group-hover:text-black text-lg tracking-tighter">
                      {formatCurrency(inv.total || 0)}
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <Badge className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border-none whitespace-nowrap",
                        inv.status === "voided" ? "bg-red-500/10 text-red-500" :
                        inv.status === "paid" ? "bg-green-500/10 text-green-400 group-hover:text-green-600" :
                        inv.status === "sent" ? "bg-blue-500/10 text-blue-400 group-hover:text-blue-600" :
                        "bg-gray-500/10 text-gray-400 group-hover:text-black"
                      )}>
                        {inv.status?.toUpperCase() || 'DRAFT'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <Button variant="ghost" size="sm" onClick={(e) => {
                        e.stopPropagation();
                        setSelectedInvoice(inv);
                        setIsDetailOpen(true);
                      }}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Invoice Details Dialog */}
      {selectedInvoice && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-5xl p-0 overflow-hidden bg-gray-100 border-none rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex-1 overflow-y-auto" id="invoice-preview-container-detail">
              <div id="invoice-preview-content-detail">
                <DocumentPreview 
                  type="invoice"
                  settings={settings}
                  document={selectedInvoice}
                />
              </div>
            </div>
            <DialogFooter className="p-4 sm:p-6 bg-white border-t flex flex-col flex-wrap gap-4 shrink-0 sm:items-center sm:justify-between w-full">
              <div className="flex flex-wrap gap-2 w-full justify-center sm:justify-start">
                <Button variant="outline" onClick={() => setIsDetailOpen(false)} className="shrink-0 font-black uppercase tracking-widest text-[10px] h-12 px-4 sm:px-6 rounded-xl">
                  Close
                </Button>
                <Button 
                  className="shrink-0 bg-white border border-gray-200 text-black hover:bg-gray-50 font-black uppercase tracking-widest text-[10px] h-12 px-4 sm:px-5 rounded-xl shadow-sm"
                  onClick={() => {
                    setIsDetailOpen(false);
                    navigate(`/book-appointment?clientId=${selectedInvoice?.clientId}`);
                  }}
                >
                  <Calendar className="w-4 h-4 mr-2 text-primary shrink-0" /> Book Next
                </Button>
                <Button 
                  className="shrink-0 bg-white border border-gray-200 text-black hover:bg-gray-50 font-black uppercase tracking-widest text-[10px] h-12 px-4 sm:px-5 rounded-xl shadow-sm"
                  onClick={async () => {
                    if (!selectedInvoice) return;
                    try {
                      const to = selectedInvoice.clientEmail;
                      if (!to) {
                        toast.error("No email address found for this client.");
                        return;
                      }
                      toast.loading("Sending email...", { id: "email-invoice" });
                      await messagingService.sendEmail({
                        to,
                        subject: `Invoice ${selectedInvoice.invoiceNumber} from ${settings?.businessName || 'Us'}`,
                        html: `<p>Hi ${selectedInvoice.clientName},</p><p>Your invoice <strong>${selectedInvoice.invoiceNumber}</strong> is ready.</p><p>Total Amount: <strong>${formatCurrency(selectedInvoice.total)}</strong></p><p>Thank you for your business!</p>`
                      });
                      
                      if (selectedInvoice.clientPhone) {
                        try {
                          await messagingService.sendSms({
                            to: selectedInvoice.clientPhone,
                            body: `Flatline Mobile Detail: Your invoice is ready. Please complete payment at your convenience. Reply STOP to opt out.`
                          });
                          console.log("Manual Invoice SMS sent successfully to:", selectedInvoice.clientPhone);
                        } catch (smsErr) {
                          console.error("Failed to send invoice SMS:", smsErr);
                        }
                      }
                      
                      toast.success("Invoice successfully emailed to client!", { id: "email-invoice" });
                    } catch (e: any) {
                      toast.error(e.message || "Failed to send email", { id: "email-invoice" });
                    }
                  }}
                >
                  <Mail className="w-4 h-4 mr-2 text-primary shrink-0" /> Email
                </Button>
                <Button 
                  className="shrink-0 bg-primary hover:bg-red-700 text-white font-black uppercase tracking-widest text-[10px] h-12 px-4 sm:px-6 rounded-xl shadow-lg shadow-primary/20"
                  onClick={() => handleDownloadPDF(selectedInvoice)}
                >
                  <FileText className="w-4 h-4 mr-2 shrink-0" /> Download PDF
                </Button>
                
                {selectedInvoice?.status !== "paid" && selectedInvoice?.status !== "voided" && (
                  <Button 
                    className="shrink-0 bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-widest text-[10px] h-12 px-4 sm:px-6 rounded-xl shadow-lg shadow-green-500/20"
                    onClick={() => handleMarkAsPaid(selectedInvoice)}
                  >
                    <DollarSign className="w-4 h-4 mr-2 shrink-0" /> Pay Now
                  </Button>
                )}

                {selectedInvoice?.status === "paid" && (
                  <DeleteConfirmationDialog
                    title="Undo Payment"
                    description="Are you sure you want to undo this payment? This will revert the invoice to an unpaid state."
                    onConfirm={() => handleUndoPayment(selectedInvoice)}
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

                {selectedInvoice?.status !== "voided" && selectedInvoice?.status !== "paid" && (
                  <DeleteConfirmationDialog
                    title="Void Invoice"
                    description="Are you sure you want to void this invoice? This will mark it as voided and retain it for historical records."
                    onConfirm={() => handleVoidInvoice(selectedInvoice)}
                    trigger={
                      <Button 
                        variant="outline"
                        className="shrink-0 ml-auto border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-black uppercase tracking-widest text-[10px] h-12 px-4 sm:px-5 rounded-xl shadow-sm"
                      >
                        <Ban className="w-4 h-4 mr-2 shrink-0" /> Void
                      </Button>
                    }
                  />
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
