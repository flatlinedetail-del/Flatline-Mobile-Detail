import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, deleteDoc, doc, updateDoc, getDocs, getDoc, limit, where } from "firebase/firestore";
import { SearchableSelector } from "../components/SearchableSelector";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useLocation } from "react-router-dom";
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
  Eye
} from "lucide-react";
import { paymentService } from "../services/paymentService";
import { toast } from "sonner";
import AddressInput from "../components/AddressInput";
import VehicleSelector from "../components/VehicleSelector";
import { format } from "date-fns";
import { Invoice, Client, Vehicle, Service, AddOn, BusinessSettings } from "../types";
import { DocumentPreview } from "../components/DocumentPreview";
import { Checkbox } from "../components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, getClientDisplayName } from "@/lib/utils";
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
  const { profile, loading: authLoading } = useAuth();
  const location = useLocation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [addons, setAddons] = useState<AddOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  // Form state
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [lineItems, setLineItems] = useState<{ serviceName: string; price: number }[]>([{ serviceName: "", price: 0 }]);
  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ year: "", make: "", model: "", vin: "", size: "medium" as any });
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [manualClient, setManualClient] = useState({
    firstName: "",
    lastName: "",
    businessName: "",
    phone: "",
    email: "",
    address: ""
  });

  useEffect(() => {
    if (authLoading || !profile) return;

    // Handle pre-fill from JobDetail
    if (location.state?.preFillJob) {
      const job = location.state.preFillJob;
      setSelectedClientId(location.state.clientId || "");
      setSelectedVehicleIds(location.state.vehicleIds || []);
      
      const items = (job.serviceSelections || []).map((s: any) => ({
        serviceName: `${s.vehicleName ? `[${s.vehicleName}] ` : ""}${s.name || "Service"}`,
        price: s.price || 0
      }));
      
      if (items.length > 0) setLineItems(items);
      setIsAddDialogOpen(true);
    }

    const fetchInvoicesData = async () => {
      try {
        const [invoicesSnap, clientsSnap, servicesSnap, addonsSnap, settingsSnap] = await Promise.all([
          getDocs(query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(100))),
          getDocs(query(collection(db, "clients"), limit(100))),
          getDocs(collection(db, "services")),
          getDocs(collection(db, "addons")),
          getDoc(doc(db, "settings", "business"))
        ]);

        setInvoices(invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
        setClients(clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
        // Vehicles will be fetched per client or manual entry when needed
        setServices(servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service)));
        setAddons(addonsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AddOn)));
        if (settingsSnap.exists()) setSettings(settingsSnap.data() as BusinessSettings);
        
        setLoading(false);
      } catch (error) {
        console.error("Error fetching invoice data:", error);
        setLoading(false);
      }
    };

    fetchInvoicesData();
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
        console.error("Error fetching vehicles for selected client:", error);
      }
    };
    fetchVehicles();
  }, [selectedClientId]);

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { serviceName: "", price: 0 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (index: number, field: "serviceName" | "price", value: string | number) => {
    setLineItems(prev => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: value };
      return newItems;
    });
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) {
      toast.error("Please select a client");
      return;
    }

    const finalLineItems = lineItems.filter(item => item.serviceName);
    if (finalLineItems.length === 0) {
      toast.error("Please add at least one service");
      return;
    }

    setIsCreating(true);
    try {
      let vehicles: any[] = [];
      let vehicleInfo = "N/A";

      // Create new vehicle if requested
      if (isAddingVehicle && newVehicle.make && newVehicle.model) {
        const vehicleRef = await addDoc(collection(db, "vehicles"), {
          ...newVehicle,
          clientId: selectedClientId,
          ownerId: selectedClientId,
          ownerType: "client",
          createdAt: serverTimestamp()
        });
        vehicles = [{
          id: vehicleRef.id,
          year: newVehicle.year,
          make: newVehicle.make,
          model: newVehicle.model
        }];
        vehicleInfo = `${newVehicle.year} ${newVehicle.make} ${newVehicle.model}`;
      } else if (selectedVehicleIds.length > 0) {
        vehicles = selectedVehicleIds.map(vid => {
          const v = allVehicles.find(veh => veh.id === vid);
          return v ? {
            id: v.id,
            year: v.year,
            make: v.make,
            model: v.model
          } : null;
        }).filter(Boolean);
        
        if (vehicles.length > 0) {
          vehicleInfo = `${vehicles[0].year} ${vehicles[0].make} ${vehicles[0].model}`;
        }
      }

      const client = clients.find(c => c.id === selectedClientId);
      const clientName = client ? getClientDisplayName(client) : `${manualClient.firstName} ${manualClient.lastName}`.trim() || manualClient.businessName || "Unknown";

      const invoiceData: any = {
        clientId: selectedClientId || "manual",
        clientName: clientName || "Unknown Client",
        clientEmail: client?.email || manualClient.email || "",
        clientPhone: client?.phone || manualClient.phone || "",
        clientAddress: client?.address || manualClient.address || "",
        businessName: client?.businessName || manualClient.businessName || "",
        vehicles: vehicles || [],
        vehicleInfo: vehicleInfo || "",
        lineItems: finalLineItems,
        total: calculateTotal(),
        status: editingInvoice?.status || "draft",
        paymentStatus: editingInvoice?.paymentStatus || "unpaid",
        amountPaid: editingInvoice?.amountPaid || 0,
        updatedAt: serverTimestamp(),
      };

      if (editingInvoice) {
        await updateDoc(doc(db, "invoices", editingInvoice.id), invoiceData);
        toast.success("Invoice updated!");
      } else {
        await addDoc(collection(db, "invoices"), {
          ...invoiceData,
          createdAt: serverTimestamp(),
        });
        toast.success("Invoice created!");
      }
      setIsAddDialogOpen(false);
      setEditingInvoice(null);
      resetForm();
    } catch (error) {
      console.error("Error saving invoice:", error);
      toast.error("Failed to save invoice");
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setSelectedClientId("");
    setSelectedVehicleIds([]);
    setLineItems([{ serviceName: "", price: 0 }]);
    setIsAddingVehicle(false);
    setNewVehicle({ year: "", make: "", model: "", vin: "", size: "medium" });
    setManualClient({
      firstName: "",
      lastName: "",
      businessName: "",
      phone: "",
      email: "",
      address: ""
    });
  };

  const handleDeleteInvoice = async (id: string) => {
    console.log("Attempting to delete invoice:", id);
    if (!id) {
      toast.error("Invalid invoice ID");
      return;
    }

    try {
      await deleteDoc(doc(db, "invoices", id));
      toast.success("Invoice deleted successfully");
      if (selectedInvoice?.id === id) {
        setIsDetailOpen(false);
      }
    } catch (error) {
      console.error("Error deleting invoice:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `invoices/${id}`);
      } catch (err: any) {
        toast.error(`Failed to delete invoice: ${err.message}`);
      }
    }
  };

  const handleCloverPayment = async () => {
    if (!selectedInvoice) return;
    
    const result = await paymentService.processPayment(selectedInvoice, "clover", { enabled: true });
    
    if (result.success) {
      await updateDoc(doc(db, "invoices", selectedInvoice.id), {
        paymentStatus: "paid",
        amountPaid: selectedInvoice.total,
        paymentProvider: "clover",
        transactionId: result.transactionId,
        paidAt: serverTimestamp()
      });

      if (selectedInvoice.leadId) {
        await updateDoc(doc(db, "leads", selectedInvoice.leadId), {
          paidAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      toast.success("Payment processed via Clover!");
    } else {
      toast.error(result.error || "Payment failed.");
    }
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
              setEditingInvoice(null);
              resetForm();
            }
          }}>
            <DialogTrigger render={
              <Button className="bg-primary hover:bg-red-700 text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-primary/20 transition-all hover:scale-105" onClick={() => {
                setEditingInvoice(null);
                resetForm();
                setIsAddDialogOpen(true);
              }}>
                <Plus className="w-4 h-4 mr-2" />
                Generate Invoice
              </Button>
            } />
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto bg-card border-none rounded-3xl shadow-2xl shadow-black p-0">
            <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">{editingInvoice ? "Edit Financial Record" : "Generate Tactical Invoice"}</DialogTitle>
                  <p className="text-[10px] text-white/50 font-black uppercase tracking-[0.2em] mt-1">Revenue Generation Protocol</p>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={handleCreateInvoice} className="p-8 space-y-8">
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Target Entity (Client)</Label>
                  <SearchableSelector
                    options={clients.map(c => ({
                      value: c.id,
                      label: getClientDisplayName(c),
                      description: `${c.email || "No email"} • ${c.phone || "No phone"}`
                    }))}
                    value={selectedClientId}
                    onSelect={(val) => {
                      setSelectedClientId(val);
                      const clientVehicles = allVehicles.filter(v => v.clientId === val);
                      if (clientVehicles.length > 0) {
                        setSelectedVehicleIds([clientVehicles[0].id]);
                      }
                    }}
                    placeholder="Search for a client..."
                  />
                </div>

                {!selectedClientId && (
                  <div className="space-y-4 p-6 bg-white/5 rounded-2xl border border-white/10">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Manual Entity Entry</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <Input 
                        placeholder="First Name" 
                        className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white" 
                        value={manualClient.firstName}
                        onChange={(e) => setManualClient(prev => ({ ...prev, firstName: e.target.value }))}
                      />
                      <Input 
                        placeholder="Last Name" 
                        className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white" 
                        value={manualClient.lastName}
                        onChange={(e) => setManualClient(prev => ({ ...prev, lastName: e.target.value }))}
                      />
                    </div>
                    <Input 
                      placeholder="Business Name" 
                      className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white" 
                      value={manualClient.businessName}
                      onChange={(e) => setManualClient(prev => ({ ...prev, businessName: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <Input 
                        placeholder="Phone" 
                        className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white" 
                        value={manualClient.phone}
                        onChange={(e) => setManualClient(prev => ({ ...prev, phone: e.target.value }))}
                      />
                      <Input 
                        placeholder="Email" 
                        className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white" 
                        value={manualClient.email}
                        onChange={(e) => setManualClient(prev => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                    <AddressInput 
                      defaultValue={manualClient.address}
                      onAddressSelect={(address, lat, lng) => setManualClient(prev => ({ ...prev, address, latitude: lat, longitude: lng }))}
                      placeholder="Mission Coordinates (Address)"
                      className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white"
                    />
                  </div>
                )}

                {selectedClientId && (
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
                    
                    {isAddingVehicle ? (
                      <div className="space-y-4 p-6 bg-white/5 rounded-2xl border border-white/10">
                        <VehicleSelector 
                          onSelect={(v) => setNewVehicle(prev => ({ ...prev, ...v }))} 
                          initialValues={newVehicle}
                        />
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <Input 
                            placeholder="VIN (Optional)" 
                            value={newVehicle.vin} 
                            onChange={(e) => setNewVehicle(prev => ({ ...prev, vin: e.target.value }))}
                            className="bg-white/5 border-white/10 h-12 rounded-xl font-bold uppercase font-mono text-white"
                          />
                          <Select 
                            value={newVehicle.size} 
                            onValueChange={(val: any) => setNewVehicle(prev => ({ ...prev, size: val }))}
                          >
                            <SelectTrigger className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white">
                              <SelectValue placeholder="Asset Class" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-900 border-white/10 text-white">
                              <SelectItem value="small">Small (Coupe/Sedan)</SelectItem>
                              <SelectItem value="medium">Medium (SUV/Crossover)</SelectItem>
                              <SelectItem value="large">Large (Truck/Full SUV)</SelectItem>
                              <SelectItem value="extra_large">Extra Large (Van/Fleet)</SelectItem>
                            </SelectContent>
                          </Select>
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
                          <SearchableSelector
                            options={[
                              ...services.map(s => ({
                                value: s.name,
                                label: s.name,
                                description: `Service • $${s.basePrice}`
                              })),
                              ...addons.map(a => ({
                                value: a.name,
                                label: a.name,
                                description: `Add-on • $${a.price}`
                              }))
                            ]}
                            value={item.serviceName}
                            onSelect={(val) => {
                              const service = services.find(s => s.name === val);
                              const addon = addons.find(a => a.name === val);
                              handleLineItemChange(index, "serviceName", val);
                              if (service) {
                                handleLineItemChange(index, "price", service.basePrice);
                              } else if (addon) {
                                handleLineItemChange(index, "price", addon.price);
                              }
                            }}
                            placeholder="Select protocol..."
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
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Total Record Value</p>
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
                    disabled={isCreating} 
                    className="flex-1 md:flex-none bg-primary hover:bg-red-700 text-white font-black h-14 px-12 rounded-2xl uppercase tracking-[0.2em] text-xs shadow-xl shadow-primary/20 transition-all hover:scale-105"
                  >
                    {isCreating ? "Processing..." : (editingInvoice ? "Authorize Update" : "Authorize Record")}
                  </Button>
                </div>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      }
    />

        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <DialogContent className="max-w-5xl p-0 overflow-hidden bg-gray-100 border-none">
            <div className="max-h-[90vh] overflow-y-auto">
              <DocumentPreview 
                type="invoice"
                settings={settings}
                document={{
                  clientName: selectedClientId ? getClientDisplayName(clients.find(c => c.id === selectedClientId)) : `${manualClient.firstName} ${manualClient.lastName}`,
                  clientEmail: selectedClientId ? clients.find(c => c.id === selectedClientId)?.email : manualClient.email,
                  clientPhone: selectedClientId ? clients.find(c => c.id === selectedClientId)?.phone : manualClient.phone,
                  clientAddress: selectedClientId ? clients.find(c => c.id === selectedClientId)?.address : manualClient.address,
                  lineItems: lineItems.filter(item => item.serviceName),
                  total: calculateTotal(),
                  status: editingInvoice?.status || "draft",
                  vehicles: selectedVehicleIds.map(id => {
                    const v = allVehicles.find(veh => veh.id === id);
                    return v ? { id: v.id, year: v.year, make: v.make, model: v.model } : null;
                  }).filter(Boolean) as any,
                  createdAt: editingInvoice?.createdAt || undefined,
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
              placeholder="Search financial records..." 
              className="pl-12 bg-white border-border text-gray-900 rounded-xl h-12 font-medium focus:ring-primary/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="border-border bg-white text-gray-900 hover:bg-gray-50 rounded-xl h-12 px-6 font-black uppercase tracking-widest text-[10px]">
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
                <TableHead className="px-8 py-5 text-[11px] font-black text-white/30 uppercase tracking-[0.25em] h-16">Asset Profile</TableHead>
                <TableHead className="px-8 py-5 text-[11px] font-black text-white/30 uppercase tracking-[0.25em] h-16">Timestamp</TableHead>
                <TableHead className="px-8 py-5 text-[11px] font-black text-white/30 uppercase tracking-[0.25em] h-16">Total Value</TableHead>
                <TableHead className="px-8 py-5 text-[11px] font-black text-white/30 uppercase tracking-[0.25em] h-16">Status</TableHead>
                <TableHead className="px-8 py-5 text-right text-[11px] font-black text-white/30 uppercase tracking-[0.25em] h-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="hover:bg-transparent border-border">
                  <TableCell colSpan={7} className="text-center py-20 text-white font-black uppercase tracking-widest text-[10px] animate-pulse">Synchronizing Ledger...</TableCell>
                </TableRow>
              ) : filteredInvoices.length === 0 ? (
                <TableRow className="hover:bg-transparent border-border">
                  <TableCell colSpan={7} className="text-center py-20 text-white font-black uppercase tracking-widest text-[10px]">No financial records detected.</TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((inv) => (
                  <TableRow 
                    key={inv.id} 
                    className="hover:bg-gray-50/50 transition-all duration-300 cursor-pointer group border-border"
                    onClick={() => {
                      setSelectedInvoice(inv);
                      setIsDetailOpen(true);
                    }}
                  >
                    <TableCell className="px-8 py-6 font-mono text-[10px] font-black uppercase text-white tracking-widest">
                      #{inv.id.slice(-6)}
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary border border-primary/20">
                          <UserIcon className="w-4 h-4" />
                        </div>
                        <span className="font-black text-white uppercase tracking-tight text-sm">{inv.clientName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <div className="flex flex-wrap gap-2">
                        {inv.vehicles.map((v, idx) => (
                          <Badge key={`${v.id}-${idx}`} variant="outline" className="text-[9px] font-black uppercase tracking-widest bg-muted/50 text-white border-none px-2 py-0.5 rounded-md">
                            <Car className="w-3 h-3 mr-1.5 text-primary" />
                            {v.year} {v.make}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="px-8 py-6 text-[10px] font-black text-white uppercase tracking-widest">
                      {inv.createdAt ? format((inv.createdAt as any).toDate(), "MMM d, yyyy") : "Pending"}
                    </TableCell>
                    <TableCell className="px-8 py-6 font-black text-white text-lg tracking-tighter">
                      ${inv.total.toFixed(2)}
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <Badge className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border-none",
                        inv.status === "paid" ? "bg-green-500/10 text-green-400" :
                        inv.status === "sent" ? "bg-blue-500/10 text-blue-400" :
                        "bg-gray-500/10 text-white"
                      )}>
                        {inv.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-8 py-6 text-right">
                      <div className="flex justify-end gap-2 transition-all">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-white/70 hover:text-primary hover:bg-primary/10 rounded-xl"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingInvoice(inv);
                            setSelectedClientId(inv.clientId);
                            setLineItems(inv.lineItems);
                            setSelectedVehicleIds(inv.vehicles.map(v => v.id));
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
                              className="h-9 w-9 text-white/70 hover:text-red-600 hover:bg-red-50 rounded-xl"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Purge Financial Record?"
                          itemName={`Invoice #${inv.id.slice(-6).toUpperCase()}`}
                          onConfirm={() => handleDeleteInvoice(inv.id)}
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

      {/* Invoice Details Dialog */}
      {selectedInvoice && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden border-none shadow-2xl">
            <div className="bg-primary p-6 text-white shrink-0">
              <div className="flex justify-between items-start">
                <div>
                  <Badge className="bg-white/20 text-white border-none mb-2 uppercase font-black tracking-widest">
                    Invoice {selectedInvoice.status}
                  </Badge>
                  <h2 className="text-3xl font-black tracking-tighter">#{selectedInvoice.id.slice(-6)}</h2>
                  <p className="text-red-100 flex items-center gap-2 mt-1">
                    <User className="w-4 h-4" /> {selectedInvoice.clientName}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-red-200 font-bold uppercase">Total Amount</p>
                  <p className="text-3xl font-black">${selectedInvoice.total.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6 bg-white">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Vehicle</p>
                  <p className="text-lg font-bold text-gray-900">{selectedInvoice.vehicleInfo}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Due Date</p>
                  <p className="text-lg font-bold text-gray-900">
                    {selectedInvoice.dueDate ? format((selectedInvoice.dueDate as any).toDate(), "MMM d, yyyy") : "N/A"}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Line Items</p>
                <div className="space-y-2">
                  {selectedInvoice.lineItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="font-bold text-gray-900">{item.serviceName}</span>
                      <span className="font-black text-primary">${item.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-6">
                <Button className="flex-1 bg-white border border-border text-gray-900 hover:bg-gray-50 font-black uppercase tracking-widest text-[10px] h-12 rounded-xl shadow-sm transition-all">
                  <FileText className="w-4 h-4 mr-2 text-primary" /> Download PDF
                </Button>
                <Button className="flex-1 bg-primary hover:bg-red-700 text-white font-black uppercase tracking-[0.2em] text-[10px] h-12 rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-105">
                  <Mail className="w-4 h-4 mr-2" /> Email Client
                </Button>
                <Button 
                  onClick={handleCloverPayment} 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-[10px] h-12 rounded-xl shadow-lg shadow-emerald-500/20 transition-all hover:scale-105"
                >
                  <CreditCard className="w-4 h-4 mr-2" /> Pay with Clover
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
                  title="Delete Invoice?"
                  itemName={`Invoice #${selectedInvoice.id.slice(-6).toUpperCase()}`}
                  onConfirm={() => handleDeleteInvoice(selectedInvoice.id)}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
