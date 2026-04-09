import { useState, useEffect, useRef } from "react";
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  orderBy, 
  where, 
  getDocs,
  deleteDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { 
  Users, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  Clock, 
  ArrowRight, 
  UserPlus, 
  Star, 
  History,
  Car,
  Tag,
  Plus,
  Trash2,
  Save,
  ChevronRight,
  ExternalLink,
  Crown,
  ShieldAlert,
  Truck,
  FileText,
  Camera,
  Settings2,
  Building2,
  Briefcase,
  CheckCircle2
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  cn, 
  formatPhoneNumber, 
  getClientDisplayName 
} from "../lib/utils";
import { Client, ClientType, ClientCategory, Vehicle, Service, Appointment } from "../types";
import AddressInput from "../components/AddressInput";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { getClientTypes, getClientCategories, migrateDataToClients, ensureClientTypes, ensureClientNameFields } from "../services/clientService";

export default function Clients() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientTypes, setClientTypes] = useState<ClientType[]>([]);
  const [categories, setCategories] = useState<ClientCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [clientVehicles, setClientVehicles] = useState<Vehicle[]>([]);
  const [clientHistory, setClientHistory] = useState<Appointment[]>([]);
  const [signedForms, setSignedForms] = useState<any[]>([]);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newClientAddress, setNewClientAddress] = useState({ address: "", lat: 0, lng: 0 });

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [types, cats] = await Promise.all([
          ensureClientTypes(), 
          getClientCategories(),
          ensureClientNameFields()
        ]);
        // Ensure unique types by ID just in case
        const uniqueTypes = Array.from(new Map(types.map(t => [t.id, t])).values());
        setClientTypes(uniqueTypes);
        setCategories(cats);
      } catch (error) {
        console.error("Error loading metadata:", error);
      }
    };
    loadMetadata();

    const q = query(collection(db, "clients"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const clientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClients(clientsData);
      setLoading(false);
    });

    const qServices = query(collection(db, "services"));
    getDocs(qServices).then(snap => {
      setServices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service)));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      const qVehicles = query(
        collection(db, "vehicles"), 
        where("clientId", "==", selectedClient.id)
      );
      getDocs(qVehicles).then(snap => {
        setClientVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle)));
      });

      const qHistory = query(
        collection(db, "appointments"),
        where("clientId", "==", selectedClient.id),
        orderBy("scheduledAt", "desc")
      );
      getDocs(qHistory).then(snap => {
        setClientHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
      });

      const qForms = query(
        collection(db, "signed_forms"),
        where("clientId", "==", selectedClient.id)
      );
      getDocs(qForms).then(snap => {
        setSignedForms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
    }
  }, [selectedClient]);

  const handleAddClient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const clientTypeId = formData.get("clientTypeId") as string;
    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;
    const businessName = formData.get("businessName") as string;
    
    // Derive a full name for backward compatibility
    let derivedName = "";
    if (businessName) {
      derivedName = businessName;
      const personName = [firstName, lastName].filter(Boolean).join(" ");
      if (personName) derivedName += ` (${personName})`;
    } else {
      derivedName = [firstName, lastName].filter(Boolean).join(" ");
    }

    const newClient: Partial<Client> = {
      name: derivedName || "Unnamed Client",
      firstName,
      lastName,
      businessName,
      contactPerson: formData.get("contactPerson") as string,
      phone: formData.get("phone") as string,
      email: formData.get("email") as string,
      address: newClientAddress.address,
      latitude: newClientAddress.lat,
      longitude: newClientAddress.lng,
      clientTypeId,
      categoryIds: [],
      loyaltyPoints: 0,
      membershipLevel: "none",
      isVIP: formData.get("isVIP") === "on",
      isOneTime: formData.get("isOneTime") === "on",
      notes: formData.get("notes") as string,
      createdAt: serverTimestamp() as any,
    };

    try {
      await addDoc(collection(db, "clients"), newClient);
      toast.success("Client added successfully");
      setIsAddDialogOpen(false);
    } catch (error) {
      toast.error("Failed to add client");
    }
  };

  const updateClient = async (data: Partial<Client>) => {
    if (!selectedClient) return;
    try {
      const updatedClient = { ...selectedClient, ...data };
      
      // If name fields changed, update the derived name and related appointments
      if (data.firstName !== undefined || data.lastName !== undefined || data.businessName !== undefined) {
        const newDisplayName = getClientDisplayName(updatedClient);
        data.name = newDisplayName;
        
        // Update related appointments
        const appointmentsQuery = query(
          collection(db, "appointments"), 
          where("clientId", "==", selectedClient.id)
        );
        const appointmentsSnap = await getDocs(appointmentsQuery);
        const batch = writeBatch(db);
        
        appointmentsSnap.docs.forEach(appDoc => {
          batch.update(appDoc.ref, { customerName: newDisplayName });
        });
        
        await batch.commit();
      }

      await updateDoc(doc(db, "clients", selectedClient.id), data);
      toast.success("Profile updated");
    } catch (error) {
      console.error("Error updating client:", error);
      toast.error("Failed to update profile");
    }
  };

  const handleDeleteClient = async (id: string) => {
    try {
      const qVehicles = query(collection(db, "vehicles"), where("clientId", "==", id));
      const qAppointments = query(collection(db, "appointments"), where("clientId", "==", id));
      
      const [vehiclesSnap, appointmentsSnap] = await Promise.all([
        getDocs(qVehicles),
        getDocs(qAppointments)
      ]);

      if (!vehiclesSnap.empty || !appointmentsSnap.empty) {
        toast.error("Cannot delete client with linked vehicles or appointments.");
        return;
      }

      await deleteDoc(doc(db, "clients", id));
      toast.success("Client deleted successfully");
      setIsDetailOpen(false);
    } catch (error) {
      toast.error("Failed to delete client");
    }
  };

  const filteredClients = clients.filter(client => {
    const matchesSearch = 
      (client.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (client.firstName?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (client.lastName?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (client.businessName?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (client.phone || "").includes(searchTerm) ||
      (client.email?.toLowerCase() || "").includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === "all" || client.clientTypeId === typeFilter;
    const matchesCategory = categoryFilter === "all" || client.categoryIds?.includes(categoryFilter);

    return matchesSearch && matchesType && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Clients</h1>
          <p className="text-gray-500 font-medium">Unified database for retail, business, and fleet accounts.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/settings?tab=client-management")}>
            <Settings2 className="w-4 h-4 mr-2" />
            Manage Types
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger render={
              <Button className="bg-primary hover:bg-red-700 shadow-lg shadow-red-100 font-bold">
                <UserPlus className="w-4 h-4 mr-2" />
                Add New Client
              </Button>
            } />
            <DialogContent className="sm:max-w-[500px] p-0">
              <DialogHeader className="px-6 pt-6 pb-2">
                <DialogTitle className="text-xl font-black">Add New Client</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddClient} className="px-6 py-4 space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Business Name (Optional)</Label>
                    <Input id="businessName" name="businessName" placeholder="Elite Collision or Austin Fleet" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input id="firstName" name="firstName" placeholder="John" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input id="lastName" name="lastName" placeholder="Doe" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="clientTypeId">Client Type</Label>
                    <Select name="clientTypeId" required>
                      <SelectTrigger className="bg-white border-gray-200">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        {clientTypes.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactPerson">Contact Person (Optional)</Label>
                    <Input id="contactPerson" name="contactPerson" placeholder="Jane Smith" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input 
                      id="phone" 
                      name="phone" 
                      placeholder="(555) 000-0000" 
                      required 
                      onChange={(e) => {
                        e.target.value = formatPhoneNumber(e.target.value);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" name="email" type="email" placeholder="client@example.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <AddressInput 
                    onAddressSelect={(address, lat, lng) => setNewClientAddress({ address, lat, lng })}
                    placeholder="123 Main St, City, ST"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <Label className="font-bold text-xs">VIP Status</Label>
                    <Switch name="isVIP" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <Label className="font-bold text-xs">One-time Client</Label>
                    <Switch name="isOneTime" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Internal Notes</Label>
                  <Textarea id="notes" name="notes" placeholder="Any special instructions..." />
                </div>
                <Button type="submit" className="w-full bg-primary font-bold">Create Client Profile</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="border-b border-gray-50 bg-gray-50/50">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Search clients..." 
                className="pl-10 bg-white border-gray-200 rounded-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[150px] h-9 bg-white border-gray-200 rounded-full">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {clientTypes.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px] h-9 bg-white border-gray-200 rounded-full">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="ghost" size="sm" onClick={() => {
                setSearchTerm("");
                setTypeFilter("all");
                setCategoryFilter("all");
              }}>
                Reset
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead className="w-[300px]">Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-gray-500">Loading clients...</TableCell>
                </TableRow>
              ) : filteredClients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-gray-500">No clients found.</TableCell>
                </TableRow>
              ) : (
                filteredClients.map((client) => {
                  const type = clientTypes.find(t => t.id === client.clientTypeId);
                  return (
                    <TableRow 
                      key={client.id} 
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                      onClick={() => {
                        setSelectedClient(client);
                        setIsDetailOpen(true);
                      }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center text-primary font-black text-sm">
                            {getClientDisplayName(client).charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900">{getClientDisplayName(client)}</span>
                              {client.isVIP && <Crown className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                            </div>
                            <span className="text-xs text-gray-500 truncate max-w-[200px]">{client.address || "No address"}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-600 border-gray-200">
                          {type?.name || "Unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <a 
                            href={`tel:${client.phone}`} 
                            className="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-primary transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Phone className="w-3 h-3 text-gray-400" />
                            {client.phone}
                          </a>
                          {client.email && (
                            <a 
                              href={`mailto:${client.email}`} 
                              className="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-primary transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Mail className="w-3 h-3 text-gray-400" />
                              {client.email}
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {client.categoryIds?.map(catId => {
                            const cat = categories.find(c => c.id === catId);
                            return cat ? (
                              <Badge key={catId} variant="secondary" className="text-[9px] font-bold px-1.5 h-4">
                                {cat.name}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 group-hover:text-primary">
                          <ChevronRight className="w-5 h-5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Client Details Dialog */}
      {selectedClient && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="sm:max-w-[900px] p-0 overflow-hidden border-none shadow-2xl">
            <div className="bg-primary p-8 text-white shrink-0">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-white font-black text-2xl backdrop-blur-sm">
                    {getClientDisplayName(selectedClient).charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-3xl font-black tracking-tighter">{getClientDisplayName(selectedClient)}</h2>
                    <div className="text-red-100 flex items-center gap-4 mt-1 font-medium">
                      <a href={`tel:${selectedClient.phone}`} className="flex items-center gap-2 hover:text-white transition-colors">
                        <Phone className="w-4 h-4" /> {formatPhoneNumber(selectedClient.phone)}
                      </a>
                      <span className="opacity-30">|</span>
                      <a href={`mailto:${selectedClient.email}`} className="flex items-center gap-2 hover:text-white transition-colors">
                        <Mail className="w-4 h-4" /> {selectedClient.email}
                      </a>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end mb-2">
                    {selectedClient.isVIP && (
                      <Badge className="bg-yellow-400 text-yellow-900 border-none font-black uppercase tracking-widest">
                        VIP
                      </Badge>
                    )}
                    <Badge className="bg-white/20 text-white border-none font-black uppercase tracking-widest">
                      {clientTypes.find(t => t.id === selectedClient.clientTypeId)?.name || "CLIENT"}
                    </Badge>
                  </div>
                  <div className="flex flex-col items-end">
                    <p className="text-4xl font-black tracking-tighter">{selectedClient.loyaltyPoints || 0} <span className="text-lg opacity-50">PTS</span></p>
                    <div className="flex items-center gap-2 mt-2">
                      <Button 
                        size="sm" 
                        className="bg-white text-primary hover:bg-red-50 font-bold shadow-lg"
                        onClick={() => {
                          navigate("/appointments", { 
                            state: { 
                              openAddDialog: true, 
                              clientId: selectedClient.id,
                              customerType: "client"
                            } 
                          });
                        }}
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        Book Appointment
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Tabs defaultValue="profile" className="w-full flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-full justify-start rounded-none border-b bg-gray-50/50 px-8 h-12 shrink-0">
                <TabsTrigger value="profile" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Profile</TabsTrigger>
                <TabsTrigger value="vehicles" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Vehicles ({clientVehicles.length})</TabsTrigger>
                <TabsTrigger value="history" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">History ({clientHistory.length})</TabsTrigger>
                <TabsTrigger value="photos" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Photos</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto p-8 bg-white">
                <TabsContent value="profile" className="mt-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Business Name</Label>
                        <Input 
                          defaultValue={selectedClient.businessName} 
                          className="bg-gray-50 border-none font-medium"
                          onBlur={(e) => updateClient({ businessName: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs font-black uppercase tracking-widest text-gray-400">First Name</Label>
                          <Input 
                            defaultValue={selectedClient.firstName} 
                            className="bg-gray-50 border-none font-medium"
                            onBlur={(e) => updateClient({ firstName: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Last Name</Label>
                          <Input 
                            defaultValue={selectedClient.lastName} 
                            className="bg-gray-50 border-none font-medium"
                            onBlur={(e) => updateClient({ lastName: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Address</Label>
                          {selectedClient.address && (
                            <a 
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedClient.address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-black text-primary flex items-center gap-1 hover:underline uppercase tracking-widest"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Open in Maps
                            </a>
                          )}
                        </div>
                        <AddressInput 
                          defaultValue={selectedClient.address}
                          onAddressSelect={(address, lat, lng) => updateClient({ address, latitude: lat, longitude: lng })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Client Type</Label>
                          <Select 
                            key={selectedClient.clientTypeId}
                            defaultValue={selectedClient.clientTypeId}
                            onValueChange={(val) => updateClient({ clientTypeId: val })}
                          >
                            <SelectTrigger className="bg-gray-50 border-none font-medium">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              {clientTypes.map(t => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Membership</Label>
                          <Select 
                            defaultValue={selectedClient.membershipLevel}
                            onValueChange={(val: any) => updateClient({ membershipLevel: val })}
                          >
                            <SelectTrigger className="bg-gray-50 border-none font-medium">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="silver">Silver</SelectItem>
                              <SelectItem value="gold">Gold</SelectItem>
                              <SelectItem value="platinum">Platinum</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 p-6 bg-gray-50 rounded-2xl border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Tag className="w-5 h-5 text-primary" />
                          <Label className="text-base font-black uppercase tracking-tighter">Categories / Tags</Label>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {categories.map(cat => (
                          <Badge 
                            key={cat.id} 
                            variant={selectedClient.categoryIds?.includes(cat.id) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => {
                              const current = selectedClient.categoryIds || [];
                              const next = current.includes(cat.id) 
                                ? current.filter(id => id !== cat.id)
                                : [...current, cat.id];
                              updateClient({ categoryIds: next });
                            }}
                          >
                            {cat.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Internal Notes</Label>
                    <Textarea 
                      defaultValue={selectedClient.notes} 
                      className="bg-gray-50 border-none min-h-[100px] font-medium"
                      onBlur={(e) => updateClient({ notes: e.target.value })}
                    />
                  </div>

                  <div className="pt-6 border-t border-gray-100">
                    <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 mb-4">Marketing & Automation</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="space-y-0.5">
                          <Label className="font-bold">VIP Status</Label>
                          <p className="text-[10px] text-gray-500">Enable special pricing and priority.</p>
                        </div>
                        <Switch 
                          checked={selectedClient.isVIP}
                          onCheckedChange={(val) => updateClient({ isVIP: val })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="space-y-0.5">
                          <Label className="font-bold">One-time Client</Label>
                          <p className="text-[10px] text-gray-500">Mark as a non-recurring customer.</p>
                        </div>
                        <Switch 
                          checked={selectedClient.isOneTime}
                          onCheckedChange={(val) => updateClient({ isOneTime: val })}
                        />
                      </div>
                    </div>
                    {selectedClient.followUpStatus && (
                      <div className="mt-4 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                        <div className="flex items-center gap-2 text-blue-700 mb-1">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-wider">Follow-up Sent</span>
                        </div>
                        <p className="text-xs text-blue-600">
                          Last follow-up sent on {format(selectedClient.followUpStatus.lastSentAt?.toDate() || new Date(), "MMM d, yyyy")} via {selectedClient.followUpStatus.channel}.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-6 border-t border-gray-100">
                    <AlertDialog>
                      <AlertDialogTrigger render={
                        <Button variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 font-bold">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Client Profile
                        </Button>
                      } />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-black">Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the client profile
                            and all associated local data. We will check for linked vehicles and appointments first.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="font-bold">Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDeleteClient(selectedClient.id)}
                            className="bg-red-600 hover:bg-red-700 font-bold"
                          >
                            Delete Client
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TabsContent>

                <TabsContent value="vehicles" className="mt-0 space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-black text-gray-900">Saved Vehicles</h3>
                    <Dialog>
                      <DialogTrigger render={
                        <Button size="sm" className="bg-primary font-bold">
                          <Plus className="w-4 h-4 mr-2" /> Add Vehicle
                        </Button>
                      } />
                      <DialogContent>
                        <DialogHeader><DialogTitle className="font-black">Add New Vehicle</DialogTitle></DialogHeader>
                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          const formData = new FormData(e.currentTarget);
                          const newVehicle = {
                            clientId: selectedClient.id,
                            ownerId: selectedClient.id,
                            ownerType: "client",
                            year: formData.get("year"),
                            make: formData.get("make"),
                            model: formData.get("model"),
                            color: formData.get("color"),
                            size: formData.get("size"),
                            vin: formData.get("vin"),
                            createdAt: serverTimestamp(),
                          };
                          await addDoc(collection(db, "vehicles"), newVehicle);
                          toast.success("Vehicle added");
                          // Refresh logic...
                        }} className="space-y-4 py-4">
                          <div className="grid grid-cols-2 gap-4">
                            <Input name="year" placeholder="Year" required />
                            <Input name="make" placeholder="Make" required />
                            <Input name="model" placeholder="Model" required />
                            <Input name="color" placeholder="Color" />
                          </div>
                          <Select name="size" defaultValue="medium">
                            <SelectTrigger><SelectValue placeholder="Vehicle Size" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="small">Small</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="large">Large</SelectItem>
                              <SelectItem value="extra_large">Extra Large</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input name="vin" placeholder="VIN (Optional)" />
                          <Button type="submit" className="w-full bg-primary font-bold">Save Vehicle</Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {clientVehicles.map(v => (
                      <div key={v.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 flex items-center gap-4 group">
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm">
                          <Car className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">{v.year} {v.make} {v.model}</p>
                          <p className="text-xs text-gray-500 uppercase font-black tracking-widest">{v.size.replace("_", " ")} • {v.color}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" onClick={async () => {
                          await deleteDoc(doc(db, "vehicles", v.id));
                          setClientVehicles(prev => prev.filter(x => x.id !== v.id));
                          toast.success("Vehicle removed");
                        }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-0 space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-black text-gray-900">Appointment History</h3>
                    {clientHistory.length === 0 ? (
                      <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-2xl border border-dashed">
                        <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p className="font-bold">No history found.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {clientHistory.map(app => (
                          <div key={app.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 flex items-center justify-between group hover:border-primary transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-gray-400 shadow-sm">
                                <Calendar className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="font-bold text-gray-900">{app.vehicleInfo}</p>
                                <p className="text-xs text-gray-500 font-medium">{format(app.scheduledAt.toDate(), "MMM d, yyyy")} • {app.status}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-black text-gray-900">${app.totalAmount}</p>
                              <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold" onClick={() => navigate(`/appointments/${app.id}`)}>Details</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="photos" className="mt-0 space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-black text-gray-900">Inspection & Service Photos</h3>
                    <Button size="sm" className="bg-primary font-bold">
                      <Camera className="w-4 h-4 mr-2" />
                      Upload Photos
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Placeholder for photos */}
                    <div className="aspect-square bg-gray-50 rounded-2xl border border-dashed flex flex-col items-center justify-center text-gray-400">
                      <Plus className="w-6 h-6 mb-2" />
                      <span className="text-[10px] font-bold uppercase">Add Photo</span>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
