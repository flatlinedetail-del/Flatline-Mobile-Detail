import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, deleteDoc, doc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Plus, Search, Filter, FileText, Trash2, Car, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Quote, Client, Vehicle, Service } from "../types";
import { Checkbox } from "../components/ui/checkbox";

export default function Quotes() {
  const { profile, loading: authLoading } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  // Form state
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [manualClientInfo, setManualClientInfo] = useState({
    name: "",
    email: "",
    phone: "",
    address: ""
  });
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [lineItems, setLineItems] = useState<{ serviceName: string; price: number }[]>([{ serviceName: "", price: 0 }]);

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
      name: client.businessName || `${client.firstName} ${client.lastName}`,
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || ""
    });
    setShowClientSuggestions(false);
  };

  useEffect(() => {
    if (authLoading || !profile) return;

    const q = query(collection(db, "quotes"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setQuotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quote)));
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

    return () => {
      unsubscribe();
      unsubClients();
      unsubVehicles();
      unsubServices();
    };
  }, [profile, authLoading]);

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { serviceName: "", price: 0 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (index: number, field: "serviceName" | "price", value: string | number) => {
    const newItems = [...lineItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setLineItems(newItems);
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  };

  const handleCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualClientInfo.name) {
      toast.error("Please enter a client name");
      return;
    }

    const vehicles = allVehicles.filter(v => selectedVehicleIds.includes(v.id)).map(v => ({
      id: v.id,
      year: v.year,
      make: v.make,
      model: v.model,
      roNumber: v.roNumber
    }));

    const newQuote: Partial<Quote> = {
      clientId: selectedClientId || undefined,
      clientName: manualClientInfo.name,
      clientEmail: manualClientInfo.email,
      clientPhone: manualClientInfo.phone,
      clientAddress: manualClientInfo.address,
      isPotentialClient: !selectedClientId,
      vehicles,
      lineItems: lineItems.filter(item => item.serviceName),
      total: calculateTotal(),
      status: "draft",
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "quotes"), newQuote);
      toast.success("Quote created!");
      setIsAddDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error creating quote:", error);
      toast.error("Failed to create quote");
    }
  };

  const resetForm = () => {
    setSelectedClientId("");
    setClientSearchTerm("");
    setManualClientInfo({ name: "", email: "", phone: "", address: "" });
    setSelectedVehicleIds([]);
    setLineItems([{ serviceName: "", price: 0 }]);
  };

  const handleDeleteQuote = async (id: string) => {
    console.log("Attempting to delete quote:", id);
    if (!id) {
      toast.error("Invalid quote ID");
      return;
    }

    if (!window.confirm("Are you sure you want to delete this quote?")) return;
    
    try {
      await deleteDoc(doc(db, "quotes", id));
      toast.success("Quote deleted successfully");
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Quotes</h1>
          <p className="text-gray-500 font-medium">Create and manage service estimates.</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger render={
            <Button className="bg-primary hover:bg-red-700 shadow-lg shadow-red-100 font-bold">
              <Plus className="w-4 h-4 mr-2" />
              New Quote
            </Button>
          } />
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-black">New Quote</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateQuote} className="space-y-6 py-4">
              <div className="space-y-4">
                <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="space-y-2 relative">
                    <Label>Client Name / Business</Label>
                    <Input 
                      placeholder="Type to search or enter manually..." 
                      value={clientSearchTerm}
                      onChange={(e) => {
                        setClientSearchTerm(e.target.value);
                        setManualClientInfo(prev => ({ ...prev, name: e.target.value }));
                        setSelectedClientId(""); // Reset selection if typing manually
                        setShowClientSuggestions(true);
                      }}
                      onFocus={() => setShowClientSuggestions(true)}
                      className="bg-white"
                    />
                    {showClientSuggestions && suggestedClients.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
                        {suggestedClients.map(c => (
                          <div 
                            key={c.id}
                            className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-0"
                            onClick={() => handleSelectClient(c)}
                          >
                            <p className="font-bold text-sm text-gray-900">{c.businessName || `${c.firstName} ${c.lastName}`}</p>
                            <p className="text-[10px] text-gray-500">{c.email} • {c.phone}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input 
                        type="email"
                        placeholder="client@example.com"
                        value={manualClientInfo.email}
                        onChange={(e) => setManualClientInfo(prev => ({ ...prev, email: e.target.value }))}
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input 
                        placeholder="(555) 000-0000"
                        value={manualClientInfo.phone}
                        onChange={(e) => setManualClientInfo(prev => ({ ...prev, phone: e.target.value }))}
                        className="bg-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input 
                      placeholder="123 Main St, Austin, TX"
                      value={manualClientInfo.address}
                      onChange={(e) => setManualClientInfo(prev => ({ ...prev, address: e.target.value }))}
                      className="bg-white"
                    />
                  </div>
                </div>

                {selectedClientId && (
                  <div className="space-y-2">
                    <Label>Select Vehicles</Label>
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
                          <Input 
                            placeholder="Service name" 
                            value={item.serviceName}
                            onChange={(e) => handleLineItemChange(index, "serviceName", e.target.value)}
                            className="bg-white"
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
              <Button type="submit" className="w-full bg-primary font-bold">Create Quote</Button>
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
                placeholder="Search quotes..." 
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
                <TableHead>Quote ID</TableHead>
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
                  <TableCell colSpan={6} className="text-center py-10 text-gray-500">Loading quotes...</TableCell>
                </TableRow>
              ) : filteredQuotes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-gray-500">No quotes found.</TableCell>
                </TableRow>
              ) : (
                filteredQuotes.map((q) => (
                  <TableRow key={q.id} className="hover:bg-gray-50/50 transition-colors">
                    <TableCell className="font-mono text-xs font-bold uppercase text-gray-400">
                      #{q.id.slice(-6)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-gray-400" />
                        <span className="font-bold text-gray-900">{q.clientName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {q.vehicles.map(v => (
                          <Badge key={v.id} variant="outline" className="text-[10px] font-bold bg-gray-50">
                            <Car className="w-3 h-3 mr-1" />
                            {v.year} {v.make}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {q.createdAt ? format((q.createdAt as any).toDate(), "MMM d, yyyy") : "Pending"}
                    </TableCell>
                    <TableCell className="font-black text-gray-900">
                      ${q.total.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        q.status === "approved" ? "bg-green-100 text-green-700 border-green-200" :
                        q.status === "sent" ? "bg-blue-100 text-blue-700 border-blue-200" :
                        "bg-gray-100 text-gray-700 border-gray-200"
                      }>
                        {q.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-gray-400 hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteQuote(q.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
