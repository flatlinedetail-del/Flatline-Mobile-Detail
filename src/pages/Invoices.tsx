import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { SearchableSelector } from "../components/SearchableSelector";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
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
  Settings2
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Invoice, Client, Vehicle, Service, AddOn } from "../types";
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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [addons, setAddons] = useState<AddOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  
  // Form state
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [lineItems, setLineItems] = useState<{ serviceName: string; price: number }[]>([{ serviceName: "", price: 0 }]);
  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ year: "", make: "", model: "", vin: "", size: "medium" as any });
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (authLoading || !profile) return;

    const q = query(collection(db, "invoices"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
      setLoading(false);
    });

    const unsubClients = onSnapshot(query(collection(db, "clients")), (snap) => {
      setClients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
    });

    const unsubVehicles = onSnapshot(query(collection(db, "vehicles")), (snap) => {
      setAllVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle)));
    });

    const unsubServices = onSnapshot(query(collection(db, "services")), (snap) => {
      setServices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service)));
    });

    const unsubAddons = onSnapshot(query(collection(db, "addons")), (snap) => {
      setAddons(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AddOn)));
    });

    return () => {
      unsubscribe();
      unsubClients();
      unsubVehicles();
      unsubServices();
      unsubAddons();
    };
  }, [profile, authLoading]);

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

      const invoiceData: any = {
        clientId: selectedClientId,
        clientName: client ? getClientDisplayName(client) : "Unknown",
        clientEmail: client?.email || "",
        clientPhone: client?.phone || "",
        vehicles,
        vehicleInfo,
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

  const filteredInvoices = invoices.filter(inv => 
    inv.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Invoices</h1>
          <p className="text-gray-500 font-medium">Manage billing and payments.</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) {
            setEditingInvoice(null);
            resetForm();
          }
        }}>
          <DialogTrigger render={
            <Button className="bg-primary hover:bg-red-700 shadow-lg shadow-red-100 font-bold" onClick={() => {
              setEditingInvoice(null);
              resetForm();
              setIsAddDialogOpen(true);
            }}>
              <Plus className="w-4 h-4 mr-2" />
              Create Invoice
            </Button>
          } />
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-black">{editingInvoice ? "Edit Invoice" : "New Invoice"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateInvoice} className="space-y-6 py-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Select Client</Label>
                  <SearchableSelector
                    options={clients.map(c => ({
                      value: c.id,
                      label: getClientDisplayName(c),
                      description: `${c.email || "No email"} • ${c.phone || "No phone"} • ${c.firstName || ""} ${c.lastName || ""} ${c.businessName || ""}`
                    }))}
                    value={selectedClientId}
                    onSelect={(val) => {
                      setSelectedClientId(val);
                      // Auto-select first vehicle if exists
                      const clientVehicles = allVehicles.filter(v => v.clientId === val);
                      if (clientVehicles.length > 0) {
                        setSelectedVehicleIds([clientVehicles[0].id]);
                      }
                    }}
                    placeholder="Search for a client..."
                  />
                </div>

                {selectedClientId && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Vehicle</Label>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="text-[10px] font-bold uppercase text-primary"
                        onClick={() => setIsAddingVehicle(!isAddingVehicle)}
                      >
                        {isAddingVehicle ? "Select Existing" : "+ Add New Vehicle"}
                      </Button>
                    </div>
                    
                    {isAddingVehicle ? (
                      <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <Input 
                          placeholder="Year" 
                          value={newVehicle.year} 
                          onChange={(e) => setNewVehicle(prev => ({ ...prev, year: e.target.value }))}
                          className="bg-white"
                        />
                        <Input 
                          placeholder="Make" 
                          value={newVehicle.make} 
                          onChange={(e) => setNewVehicle(prev => ({ ...prev, make: e.target.value }))}
                          className="bg-white"
                        />
                        <Input 
                          placeholder="Model" 
                          value={newVehicle.model} 
                          onChange={(e) => setNewVehicle(prev => ({ ...prev, model: e.target.value }))}
                          className="bg-white"
                        />
                        <Input 
                          placeholder="VIN (Optional)" 
                          value={newVehicle.vin} 
                          onChange={(e) => setNewVehicle(prev => ({ ...prev, vin: e.target.value }))}
                          className="bg-white"
                        />
                        <Select 
                          value={newVehicle.size} 
                          onValueChange={(val: any) => setNewVehicle(prev => ({ ...prev, size: val }))}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Size" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="small">Small</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="large">Large</SelectItem>
                            <SelectItem value="extra_large">Extra Large</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 border rounded-lg p-3 bg-gray-50 max-h-40 overflow-y-auto">
                        {allVehicles.filter(v => v.clientId === selectedClientId).map(v => (
                          <div key={v.id} className="flex items-center space-x-2">
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
                            />
                            <label htmlFor={`v-${v.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                              {v.year} {v.make} {v.model} {v.roNumber ? `(RO: ${v.roNumber})` : ""}
                            </label>
                          </div>
                        ))}
                        {allVehicles.filter(v => v.clientId === selectedClientId).length === 0 && (
                          <p className="text-xs text-gray-500 italic">No vehicles found for this client.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-gray-400">Line Items</Label>
                      <Button type="button" variant="outline" size="sm" onClick={handleAddLineItem}>
                        <Plus className="w-3 h-3 mr-1" /> Add Item
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {lineItems.map((item, index) => (
                        <div key={index} className="flex gap-3 items-end">
                          <div className="flex-1 space-y-1">
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
                              placeholder="Select service or add-on..."
                            />
                          </div>
                          <div className="w-32 space-y-1">
                            <Input 
                              type="number" 
                              placeholder="Price" 
                              value={item.price || ""}
                              onChange={(e) => handleLineItemChange(index, "price", Number(e.target.value))}
                              className="bg-white"
                            />
                          </div>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="text-gray-400 hover:text-red-600"
                            onClick={() => handleRemoveLineItem(index)}
                            disabled={lineItems.length === 1}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                <div className="pt-4 border-t flex justify-between items-center">
                  <span className="text-lg font-black uppercase tracking-tighter">Total</span>
                  <span className="text-2xl font-black text-primary">${calculateTotal().toFixed(2)}</span>
                </div>
              </div>
              <Button type="submit" disabled={isCreating} className="w-full bg-primary font-bold">
                {isCreating ? "Saving..." : (editingInvoice ? "Update Invoice" : "Create Invoice")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="border-b border-gray-50 bg-gray-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Search invoices..." 
                className="pl-10 bg-white border-gray-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="border-gray-200">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead>Invoice ID</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Vehicles</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-gray-500">Loading invoices...</TableCell>
                </TableRow>
              ) : filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-gray-500">No invoices found.</TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((inv) => (
                  <TableRow 
                    key={inv.id} 
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                    onClick={() => {
                      setSelectedInvoice(inv);
                      setIsDetailOpen(true);
                    }}
                  >
                    <TableCell className="font-mono text-xs font-bold uppercase text-gray-400">
                      #{inv.id.slice(-6)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-gray-400" />
                        <span className="font-bold text-gray-900">{inv.clientName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {inv.vehicles.map(v => (
                          <Badge key={v.id} variant="outline" className="text-[10px] font-bold bg-gray-50">
                            <Car className="w-3 h-3 mr-1" />
                            {v.year} {v.make}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {inv.createdAt ? format((inv.createdAt as any).toDate(), "MMM d, yyyy") : "Pending"}
                    </TableCell>
                    <TableCell className="font-black text-gray-900">
                      ${inv.total.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        inv.status === "paid" ? "bg-green-100 text-green-700 border-green-200" :
                        inv.status === "sent" ? "bg-blue-100 text-blue-700 border-blue-200" :
                        "bg-gray-100 text-gray-700 border-gray-200"
                      }>
                        {inv.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-gray-400 hover:text-primary"
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
                              className="h-8 w-8 text-gray-400 hover:text-red-600"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Delete Invoice?"
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

              <div className="flex gap-3 pt-4">
                <Button className="flex-1 bg-primary hover:bg-red-700 font-bold">
                  <FileText className="w-4 h-4 mr-2" /> Download PDF
                </Button>
                <Button variant="outline" className="flex-1 border-gray-200 font-bold">
                  <Mail className="w-4 h-4 mr-2" /> Email Client
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
