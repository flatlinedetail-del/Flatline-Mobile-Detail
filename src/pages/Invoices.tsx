import { useState, useEffect } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { db } from "../firebase";
import { collection, query, getDocs, orderBy, limit, where, doc, updateDoc } from "firebase/firestore";
import { useAuth } from "../hooks/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import { messagingService } from "../services/messagingService";
import { getInvoicesByBusiness, updateInvoiceFields, softDeleteInvoice, createInvoice } from "../services/invoiceService";
import { getClients } from "../services/clientService";

import { Client, Invoice, Vehicle, BusinessSettings, LineItem } from "../types";
import { PageHeader } from "../components/PageHeader";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { 
  Plus, 
  Search, 
  Filter, 
  Receipt, 
  Trash2, 
  User as UserIcon, 
  Settings2,
  DollarSign,
  FileText,
  Mail,
  Calendar,
  Undo,
  Ban,
  RefreshCcw
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { DocumentPreview } from "../components/DocumentPreview";
import { cn, formatCurrency } from "@/lib/utils";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";

export default function Invoices() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [newInvoiceData, setNewInvoiceData] = useState({
      clientId: "",
      clientName: "",
      description: "",
      price: 0
  });

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  const fetchInvoicesData = async (showToast = false) => {
    if (showToast) toast.loading("Syncing Ledger...", { id: "sync-invoices" });
    try {
      if (!profile) throw new Error("No authenticated user");
      if (!profile.businessId) throw new Error("No business context");

      const invoicesData = await getInvoicesByBusiness(profile.businessId);
      setInvoices(invoicesData);
      
      // Update cache
      sessionStorage.setItem('invoices_cache', JSON.stringify(invoicesData));
      sessionStorage.setItem('invoices_cache_time', Date.now().toString());
      
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

  useEffect(() => {
    if (isAddDialogOpen && profile) {
        const busId = profile.businessId;
        const uid = profile.uid;
        console.log("--- INVOICE CLIENT LOOKUP DEBUG ---");
        console.log("Current Profile BusinessID:", busId);
        console.log("Current Profile UID:", uid);

        // Match Clients.tsx pattern: Fetch global list and filter to ensure we see what security rules allow
        const q = query(collection(db, "clients"), orderBy("createdAt", "desc"), limit(200));
        
        getDocs(q).then(async (snapshot) => {
            const rawClients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            console.log("Total Raw Clients Fetched:", rawClients.length);
            
            const filteredClients: Client[] = [];
            
            for (const c of rawClients) {
                const displayName = c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim();
                const isDeleted = c.isDeleted === true;
                
                // Mismatch Check: Match by businessId, ownerId, or userId
                const belongsToUser = (
                    c.businessId === busId || 
                    c.businessId === uid ||
                    c.ownerId === uid ||
                    c.userId === uid ||
                    (!c.businessId && !c.ownerId && !c.userId) // Safe fallback for records without ownership field
                );

                console.log(`- ID: ${c.id}, Name: ${displayName}, businessId: ${c.businessId}, ownerId: ${c.ownerId}, userId: ${c.userId}, isDeleted: ${c.isDeleted}, belongs: ${belongsToUser}`);

                if (belongsToUser && !isDeleted) {
                    filteredClients.push(c as Client);
                    
                    // Backfill missing businessId if we have a target
                    if (!c.businessId && busId) {
                        try {
                            await updateDoc(doc(db, "clients", c.id), { 
                                businessId: busId,
                                updatedAt: new Date(),
                                updatedBy: uid
                            });
                            console.log(`Backfilled businessId to ${busId} for client ${c.id}`);
                        } catch (err) {
                            console.error("Failed to backfill businessId:", err);
                        }
                    }
                }
            }
            
            console.log("Total Clients After Filtering:", filteredClients.length);
            console.log("Exact query path/filters used: collection('clients'), orderBy('createdAt', 'desc'), limit(200), followed by in-memory ownership logic covering businessId, ownerId, and userId");
            setClients(filteredClients);
        }).catch(err => {
            console.error("Error loading clients for Generate Invoice:", err);
        });
    }
  }, [isAddDialogOpen, profile]);

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
    if (!profile?.businessId) return;
    
    try {
        await createInvoice({
            clientId: newInvoiceData.clientId,
            clientName: newInvoiceData.clientName,
            total: newInvoiceData.price,
            status: "draft",
            paymentStatus: "unpaid",
            lineItems: [{
               serviceName: newInvoiceData.description,
               description: newInvoiceData.description,
               quantity: 1,
               price: newInvoiceData.price,
               total: newInvoiceData.price,
               source: "manual",
               protocolAccepted: true
            }]
        }, profile.businessId);
        
        toast.success("Invoice created successfully.");
        setIsAddDialogOpen(false);
        fetchInvoicesData();
        resetForm();
    } catch(e) {
        toast.error("Failed to create invoice.");
    }
  };

  const resetForm = () => {
    setNewInvoiceData({
        clientId: "",
        clientName: "",
        description: "",
        price: 0
    });
  };

  const handleCloverPayment = async () => {
    // Payment integration coming soon
    toast.info("Clover payment not integrated.");
  };

  const handleMarkAsPaid = async (invoice: Invoice | null) => {
    if (!invoice?.id || !profile?.businessId) return;
    try {
      toast.loading("Processing payment...", { id: "payment" });
      await updateInvoiceFields(invoice.id, {
        status: "paid",
        paymentStatus: "paid",
        paymentProvider: "manual"
      }, profile.businessId);

      setSelectedInvoice((prev) => prev ? { 
        ...prev, 
        status: "paid", 
        paymentStatus: "paid", 
        paymentProvider: "manual"
      } as Invoice : null);
      
      // Send Payment Receipt SMS
      if (invoice.clientPhone) {
        messagingService.sendSms({
          to: invoice.clientPhone,
          body: `Flatline Mobile Detail: Payment received. Thank you! We appreciate your business. Reply STOP to opt out.`
        }).catch(e => console.error("Receipt SMS failed:", e));
      }

      // Invalidate cache
      sessionStorage.removeItem('invoices_cache');
      sessionStorage.removeItem('invoices_cache_time');
      
      toast.success("Payment recorded successfully", { id: "payment" });
    } catch (error) {
       console.error("Payment error", error);
       toast.error("Failed to process payment", { id: "payment" });
    }
  };

  const handleVoidInvoice = async (invoice: Invoice | null) => {
    if (!invoice?.id || !profile?.businessId) return;
    try {
      toast.loading("Applying void protocol...", { id: "delete" });
      await updateInvoiceFields(invoice.id, {
        status: "voided",
        paymentStatus: "voided"
      }, profile.businessId);

      setSelectedInvoice((prev) => prev ? { 
        ...prev, 
        status: "voided",
        paymentStatus: "voided"
      } as Invoice : null);
      setIsDetailOpen(false);
      
      // Invalidate cache
      sessionStorage.removeItem('invoices_cache');
      sessionStorage.removeItem('invoices_cache_time');
      
      toast.success("Invoice voided successfully", { id: "delete" });
    } catch (error) {
       console.error("Void error", error);
       toast.error("Failed to void invoice", { id: "delete" });
    }
  };

  const handleUndoPayment = async (invoice: Invoice | null) => {
    if (!invoice?.id || !profile?.businessId) return;
    try {
      toast.loading("Undoing payment...", { id: "payment-undo" });
      
      await updateInvoiceFields(invoice.id, {
        status: "pending",
        paymentStatus: "unpaid"
      }, profile.businessId);
      
      setSelectedInvoice((prev: any) => {
        if (!prev) return null;
        let newState = { ...prev };
        newState.status = "pending";
        newState.paymentStatus = "unpaid";
        return newState;
      });
      
      // Invalidate cache
      sessionStorage.removeItem('invoices_cache');
      sessionStorage.removeItem('invoices_cache_time');
      
      toast.success("Payment reversed to unpaid", { id: "payment-undo" });
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
          <DialogContent className="sm:max-w-[800px] p-8 bg-card border-none rounded-3xl shadow-2xl shadow-black">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">Generate Invoice</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateInvoice} className="py-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-white/70">Client</label>
                {clients.length > 0 ? (
                  <select 
                    className="w-full p-3 rounded-xl bg-white border border-gray-200"
                    onChange={(e) => {
                      const client = clients.find(c => c.id === e.target.value);
                      setNewInvoiceData({...newInvoiceData, clientId: e.target.value, clientName: client?.name || `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || "Unknown Client"});
                    }}
                    value={newInvoiceData.clientId}
                    required
                  >
                    <option value="">Select a client</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim()}</option>)}
                  </select>
                ) : (
                  <div className="w-full p-3 rounded-xl bg-white border border-gray-200 text-red-500 font-medium">
                    No clients found. Add a client first.
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm text-white/70">Description</label>
                <Input required value={newInvoiceData.description} onChange={(e) => setNewInvoiceData({...newInvoiceData, description: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-white/70">Amount</label>
                <Input required type="number" min="0.01" step="0.01" value={newInvoiceData.price || ''} onChange={(e) => setNewInvoiceData({...newInvoiceData, price: parseFloat(e.target.value) || 0})} />
              </div>
              <Button type="submit" disabled={!newInvoiceData.clientId || newInvoiceData.price <= 0} className="w-full bg-primary hover:bg-red-700 text-white font-black h-12 rounded-xl">Create Invoice</Button>
            </form>
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
                        "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border-none",
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
