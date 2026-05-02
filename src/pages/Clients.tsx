import { useState, useEffect, useRef, useMemo } from "react";
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
  getDoc,
  deleteDoc,
  writeBatch,
  limit,
  FieldValue
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { PageHeader } from "../components/PageHeader";
import { ClientAddressesManager } from "../components/ClientAddressesManager";
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
import { geocodeAddress } from "../services/geocodingService";
import { useNavigate } from "react-router-dom";
import { NumberInput } from "../components/NumberInput";
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
  AlertTriangle,
  Truck,
  FileText,
  Receipt,
  Camera,
  Edit2,
  Settings2,
  Building2,
  Briefcase,
  CheckCircle2,
  Brain,
  MessageSquare,
  RefreshCcw,
  Zap
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import VehicleSelector from "../components/VehicleSelector";
import { 
  cn, 
  formatPhoneNumber, 
  getClientDisplayName,
  cleanAddress,
  formatCurrency,
  convertToDate 
} from "../lib/utils";
import { Client, ClientType, ClientCategory, Vehicle, Service, Appointment, Invoice, Quote } from "../types";
import AddressInput from "../components/AddressInput";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { getClientTypes, getClientCategories, migrateDataToClients, ensureClientTypes, ensureClientNameFields } from "../services/clientService";
import { ClientAIStrategy } from "../components/ClientAIStrategy";
import { ClientCommunication } from "../components/ClientCommunication";
import { generateServiceTimingIntelligence, ServiceTimingOutput } from "../services/serviceTimingEngine";

interface AddVehicleFormProps {
  clientId: string;
  isCollisionCenter: boolean;
  onSuccess?: () => void;
}

function AddVehicleForm({ clientId, isCollisionCenter, onSuccess }: AddVehicleFormProps) {
  const [vData, setVData] = useState({ year: "", make: "", model: "" });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newVehicle = {
      clientId: clientId,
      ownerId: clientId,
      ownerType: "client",
      year: vData.year,
      make: vData.make,
      model: vData.model,
      color: formData.get("color"),
      size: formData.get("size"),
      vin: formData.get("vin"),
      roNumber: formData.get("roNumber") || null,
      createdAt: serverTimestamp(),
    };

    if (!newVehicle.year || !newVehicle.make || !newVehicle.model) {
      toast.error("Please select a complete vehicle (Year, Make, and Model)");
      return;
    }
    try {
      await addDoc(collection(db, "vehicles"), newVehicle);
      toast.success("Vehicle added");
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error adding vehicle:", error);
      toast.error("Failed to add vehicle");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-4">
      <VehicleSelector onSelect={setVData} />
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Color</Label>
          <Input name="color" placeholder="Color" className="bg-white/5 border-white/10 text-white rounded-xl h-12" />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">VIN</Label>
          <Input name="vin" placeholder="VIN (Optional)" className="bg-white/5 border-white/10 text-white rounded-xl h-12" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Vehicle Size</Label>
          <Select name="size" defaultValue="medium">
            <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-12">
              <SelectValue placeholder="Vehicle Size" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border text-white">
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
              <SelectItem value="extra_large">Extra Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isCollisionCenter && (
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">RO Number</Label>
            <Input name="roNumber" placeholder="Repair Order #" required className="bg-white/5 border-white/10 text-white rounded-xl h-12" />
          </div>
        )}
      </div>
      <Button type="submit" className="w-full bg-primary font-bold">Save Vehicle</Button>
    </form>
  );
}

export default function Clients() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
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
  const [clientInvoices, setClientInvoices] = useState<Invoice[]>([]);
  const [clientQuotes, setClientQuotes] = useState<Quote[]>([]);
  const [signedForms, setSignedForms] = useState<any[]>([]);
  
  const serviceTiming = useMemo(() => {
    if (!selectedClient || clientVehicles.length === 0 || clientHistory.length === 0 || services.length === 0) return [];
    return generateServiceTimingIntelligence(clientVehicles, clientHistory, services);
  }, [selectedClient, clientVehicles, clientHistory, services]);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isEditVehicleOpen, setIsEditVehicleOpen] = useState(false);
  const [newClientAddress, setNewClientAddress] = useState({ address: "", lat: 0, lng: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Keep selectedClient in sync with the clients list
  useEffect(() => {
    if (selectedClient && clients.length > 0) {
      const latest = clients.find(c => c.id === selectedClient.id);
      if (latest) {
        // Deep compare specific fields to avoid unnecessary updates and FieldValue issues
        const isDifferent = 
          JSON.stringify(latest.vipSettings) !== JSON.stringify(selectedClient.vipSettings) ||
          JSON.stringify(latest.gallery) !== JSON.stringify(selectedClient.gallery) ||
          latest.firstName !== selectedClient.firstName ||
          latest.lastName !== selectedClient.lastName ||
          latest.businessName !== selectedClient.businessName ||
          latest.phone !== selectedClient.phone ||
          latest.email !== selectedClient.email ||
          latest.address !== selectedClient.address ||
          latest.notes !== selectedClient.notes ||
          latest.isVIP !== selectedClient.isVIP ||
          latest.isOneTime !== selectedClient.isOneTime;

        if (isDifferent) {
          setSelectedClient(latest);
        }
      }
    }
  }, [clients, selectedClient]);

  const defaultStatusColors: Record<string, string> = {
    scheduled: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    confirmed: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    en_route: "bg-primary/20 text-primary border border-primary/30",
    in_progress: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
    arrived: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    completed: "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30",
    paid: "bg-zinc-400/20 text-zinc-300 border border-zinc-400/30",
    canceled: "bg-red-500/20 text-red-400 border border-red-500/30",
    no_show: "bg-rose-500/20 text-rose-400 border border-rose-500/30",
    waitlisted: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
  };

  const getStatusColor = (status: string, isVip?: boolean) => {
    let baseColor = defaultStatusColors[status] || "bg-white/5 text-white/40 border border-white/5";
    if (isVip) {
      baseColor += " border-amber-500/50";
    }
    return baseColor;
  };

  const fetchClientsData = async (showToast = false) => {
    // Check cache first if not performing a manual sync
    if (!showToast) {
      const cached = sessionStorage.getItem('clients_registry_cache');
      const cacheTime = sessionStorage.getItem('clients_registry_cache_time');
      const now = Date.now();
      
      if (cached && cacheTime && now - Number(cacheTime) < 5 * 60 * 1000) { // 5 min cache
        setClients(JSON.parse(cached));
        setLoading(false);
        return;
      }
    }

    if (showToast) toast.loading("Syncing Registry...", { id: "sync-clients" });
    setLoading(true);
    try {
      const q = query(collection(db, "clients"), orderBy("createdAt", "desc"), limit(200));
      const snapshot = await getDocs(q).catch(e => handleFirestoreError(e, OperationType.LIST, "clients"));
      if (!snapshot) return;
      const clientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClients(clientsData);
      
      // Update cache
      sessionStorage.setItem('clients_registry_cache', JSON.stringify(clientsData));
      sessionStorage.setItem('clients_registry_cache_time', Date.now().toString());

      setLoading(false);
      if (showToast) toast.success("Registry Synchronized", { id: "sync-clients" });
    } catch (error: any) {
      console.error("Error fetching clients:", error);
      setLoading(false);
      if (error?.message?.includes("Quota limit exceeded")) {
        toast.error("Registry Sync Failed: Quota exceeded");
      } else if (showToast) {
        toast.error("Sync Failed", { id: "sync-clients" });
      }
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;

    const loadMetadata = async () => {
      // Small metadata caching
      const cachedTypes = sessionStorage.getItem('client_types_cache');
      const cachedCats = sessionStorage.getItem('client_categories_cache');
      if (cachedTypes && cachedCats) {
        setClientTypes(JSON.parse(cachedTypes));
        setCategories(JSON.parse(cachedCats));
        return;
      }

      try {
        const typesSnap = await getDocs(query(collection(db, "client_types"), orderBy("sortOrder", "asc"))).catch(e => handleFirestoreError(e, OperationType.LIST, "client_types"));
        const catsSnap = await getDocs(query(collection(db, "client_categories"), orderBy("name", "asc"))).catch(e => handleFirestoreError(e, OperationType.LIST, "client_categories"));
        
        if (!typesSnap || !catsSnap) return;
        const typesData = typesSnap.docs.map(t => ({ id: t.id, ...t.data() } as ClientType));
        const catsData = catsSnap.docs.map(c => ({ id: c.id, ...c.data() } as ClientCategory));
        
        setClientTypes(typesData);
        setCategories(catsData);
        
        sessionStorage.setItem('client_types_cache', JSON.stringify(typesData));
        sessionStorage.setItem('client_categories_cache', JSON.stringify(catsData));
      } catch (error) {
        console.error("Error loading metadata:", error);
      }
    };
    loadMetadata();
    fetchClientsData();

    const loadServices = async () => {
      const cachedServices = sessionStorage.getItem('services_list_cache');
      if (cachedServices) {
        setServices(JSON.parse(cachedServices));
        return;
      }
      try {
        const servicesSnap = await getDocs(collection(db, "services")).catch(e => handleFirestoreError(e, OperationType.LIST, "services"));
        if (!servicesSnap) return;
        const servicesData = servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service));
        setServices(servicesData);
        sessionStorage.setItem('services_list_cache', JSON.stringify(servicesData));
      } catch (error) {
        console.error("Error fetching services in clients:", error);
      }
    };
    loadServices();

    return () => {
      // Cleanup
    };
  }, [profile, authLoading]);

  useEffect(() => {
    if (!selectedClient) {
      setClientVehicles([]);
      setClientHistory([]);
      setSignedForms([]);
      setClientInvoices([]);
      setClientQuotes([]);
      return;
    }

    const fetchClientDetails = async () => {
      // Detail caching per client
      const CACHE_KEY = `client_details_cache_${selectedClient.id}`;
      const cachedDetails = sessionStorage.getItem(CACHE_KEY);
      const cacheTime = sessionStorage.getItem(`${CACHE_KEY}_time`);
      const now = Date.now();

      if (cachedDetails && cacheTime && now - Number(cacheTime) < 2 * 60 * 1000) {
        const parsed = JSON.parse(cachedDetails);
        setClientHistory(parsed.history);
        setSignedForms(parsed.forms);
        setClientInvoices(parsed.invoices);
        setClientQuotes(parsed.quotes);
        return;
      }

      try {
        const [historySnap, formsSnap, invoicesSnap, quotesSnap] = await Promise.all([
          getDocs(query(collection(db, "appointments"), where("clientId", "==", selectedClient.id), orderBy("scheduledAt", "desc"), limit(50))),
          getDocs(query(collection(db, "signed_forms"), where("clientId", "==", selectedClient.id))),
          getDocs(query(collection(db, "invoices"), where("clientId", "==", selectedClient.id), orderBy("createdAt", "desc"), limit(50))),
          getDocs(query(collection(db, "quotes"), where("clientId", "==", selectedClient.id), orderBy("createdAt", "desc"), limit(50)))
        ]);

        const historyData = historySnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
        const formsData = formsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const invoicesData = invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
        const quotesData = quotesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quote));

        setClientHistory(historyData);
        setSignedForms(formsData);
        setClientInvoices(invoicesData);
        setClientQuotes(quotesData);

        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
          history: historyData,
          forms: formsData,
          invoices: invoicesData,
          quotes: quotesData
        }));
        sessionStorage.setItem(`${CACHE_KEY}_time`, now.toString());
      } catch (error) {
        console.error("Error fetching client details:", error);
      }
    };

    fetchClientDetails();
    
    const unsubVehicles = onSnapshot(query(collection(db, "vehicles"), where("clientId", "==", selectedClient.id)), snap => {
      setClientVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle)));
    }, (error: any) => {
      if (error?.code === 'cancelled' || error?.message?.includes('CANCELLED') || error?.message?.includes('idle stream')) {
        return; // Ignore idle stream disconnects
      }
      console.error("Error listening to client vehicles:", error);
    });

    // Auto-geocode if missing lat/lng
    if (selectedClient.address && (!selectedClient.latitude || !selectedClient.longitude)) {
      const performGeocoding = async () => {
        try {
          const coords = await geocodeAddress(selectedClient.address);
          await updateDoc(doc(db, "clients", selectedClient.id), {
            latitude: coords.lat,
            longitude: coords.lng
          });
        } catch (error: any) {
          console.error("Auto-geocode error for client:", error);
        }
      };
      performGeocoding();
    }

    return () => {
      unsubVehicles();
    };
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

    const clientData: any = {
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
      isVIP: formData.get("isVIP") === "on",
      isOneTime: formData.get("isOneTime") === "on",
      notes: formData.get("notes") as string,
    };

    try {
      if (editingClient) {
        await updateDoc(doc(db, "clients", editingClient.id), clientData);
        toast.success("Client profile updated");
      } else {
        await addDoc(collection(db, "clients"), {
          ...clientData,
          categoryIds: [],
          loyaltyPoints: 0,
          membershipLevel: "none",
          createdAt: serverTimestamp(),
        });
        toast.success("Client added successfully");
      }
      
      // Invalidate cache
      sessionStorage.removeItem('clients_registry_cache');
      sessionStorage.removeItem('clients_registry_cache_time');
      if (editingClient) {
        sessionStorage.removeItem(`client_details_cache_${editingClient.id}`);
      }

      setIsAddDialogOpen(false);
      setEditingClient(null);
      fetchClientsData(); // Sync manually
    } catch (error) {
      console.error("Error saving client:", error);
      toast.error(editingClient ? "Failed to update client" : "Failed to add client");
    }
  };

  const updateClient = async (data: Partial<Client>) => {
    if (!selectedClient) return;
    try {
      // Optimistic update for immediate UI feedback
      const updatedClient = { ...selectedClient, ...data };
      setSelectedClient(updatedClient);

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
      
      // Invalidate cache
      sessionStorage.removeItem('clients_registry_cache');
      sessionStorage.removeItem('clients_registry_cache_time');
      sessionStorage.removeItem(`client_details_cache_${selectedClient.id}`);
      
      toast.success("Profile updated");
    } catch (error) {
      console.error("Error updating client:", error);
      toast.error("Failed to update profile");
    }
  };

  const handleDeleteClient = async (id: string) => {
    console.log("Attempting to force-delete client:", id);
    if (!id) {
      toast.error("Invalid client ID");
      return;
    }

    try {
      const batch = writeBatch(db);
      
      // 1. Find all linked records
      const [
        vehiclesSnap, 
        appointmentsSnap, 
        invoicesSnap, 
        quotesSnap, 
        leadsSnap,
        formsSnap,
        logsSnap
      ] = await Promise.all([
        getDocs(query(collection(db, "vehicles"), where("clientId", "==", id))),
        getDocs(query(collection(db, "appointments"), where("clientId", "==", id))),
        getDocs(query(collection(db, "invoices"), where("clientId", "==", id))),
        getDocs(query(collection(db, "quotes"), where("clientId", "==", id))),
        getDocs(query(collection(db, "leads"), where("clientId", "==", id))),
        getDocs(query(collection(db, "signed_forms"), where("clientId", "==", id))),
        getDocs(query(collection(db, "campaign_logs"), where("clientId", "==", id)))
      ]);

      // 2. Add all linked records to batch delete
      vehiclesSnap.docs.forEach(d => batch.delete(d.ref));
      appointmentsSnap.docs.forEach(d => batch.delete(d.ref));
      invoicesSnap.docs.forEach(d => batch.delete(d.ref));
      quotesSnap.docs.forEach(d => batch.delete(d.ref));
      leadsSnap.docs.forEach(d => batch.delete(d.ref));
      formsSnap.docs.forEach(d => batch.delete(d.ref));
      logsSnap.docs.forEach(d => batch.delete(d.ref));

      // 3. Delete the client itself
      batch.delete(doc(db, "clients", id));

      // 4. Commit the batch
      await batch.commit();
      
      // Invalidate cache
      sessionStorage.removeItem('clients_registry_cache');
      sessionStorage.removeItem('clients_registry_cache_time');
      sessionStorage.removeItem(`client_details_cache_${id}`);
      
      toast.success("Client and all linked records deleted successfully");
      setIsDetailOpen(false);
      setSelectedClient(null);
      fetchClientsData(); // Sync manually
    } catch (error) {
      console.error("Error force-deleting client:", error);
      toast.error("Failed to force-delete client profile and linked data");
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>, isCapture = false) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClient) return;

    try {
      setIsUploading(true);
      const storageRef = ref(storage, `clients/${selectedClient.id}/gallery/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      const currentGallery = selectedClient.gallery || [];
      await updateClient({
        gallery: [...currentGallery, downloadURL],
        updatedAt: serverTimestamp() as any
      });

      toast.success(isCapture ? "Photo captured and saved" : "Media added successfully");
    } catch (error) {
      console.error("Error uploading media:", error);
      toast.error("Failed to upload media");
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const filteredClients = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase().trim();
    
    return clients.filter(client => {
      // 1. Basic Client Info Search
      const firstName = (client.firstName || "").toLowerCase();
      const lastName = (client.lastName || "").toLowerCase();
      const fullName = `${firstName} ${lastName}`.trim();
      const businessName = (client.businessName || "").toLowerCase();
      const phone = (client.phone || "").toLowerCase();
      const email = (client.email || "").toLowerCase();
      const name = (client.name || "").toLowerCase();

      const matchesSearch = 
        name.includes(normalizedSearch) ||
        firstName.includes(normalizedSearch) ||
        lastName.includes(normalizedSearch) ||
        fullName.includes(normalizedSearch) ||
        businessName.includes(normalizedSearch) ||
        phone.includes(normalizedSearch) ||
        email.includes(normalizedSearch);
      
      const matchesType = typeFilter === "all" || client.clientTypeId === typeFilter;
      const matchesCategory = categoryFilter === "all" || client.categoryIds?.includes(categoryFilter);

      return matchesSearch && matchesType && matchesCategory;
    });
  }, [clients, searchTerm, typeFilter, categoryFilter]);

  return (
    <div className="space-y-10 pb-24 w-full">
      <PageHeader 
        title="Client Registry" 
        accentWord="Registry" 
        subtitle="Unified database for retail, business, and vehicle accounts."
        actions={
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              className="border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl px-6 h-12 font-bold uppercase tracking-widest text-[10px]"
              onClick={() => fetchClientsData(true)}
              disabled={loading}
            >
              <RefreshCcw className={cn("w-4 h-4 mr-2 text-primary", loading && "animate-spin")} />
              Sync Registry
            </Button>
            <Button variant="outline" onClick={() => navigate("/settings?tab=client-management")} className="border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl px-6 h-12 font-bold uppercase tracking-widest text-[10px]">
              <Settings2 className="w-4 h-4 mr-2 text-primary" />
              Manage Types
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
                if (!open) {
                  setIsAddDialogOpen(false);
                  setEditingClient(null);
                  setNewClientAddress({ address: "", lat: 0, lng: 0 });
                } else {
                  setIsAddDialogOpen(true);
                }
              }}>
              <DialogTrigger render={
                <Button className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue transition-all hover:scale-105">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add New Client
                </Button>
              } />
              <DialogContent className="bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black sm:max-w-[1000px]">
                <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                  <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase">{editingClient ? "Update Client Profile" : "New Client Profile"}</DialogTitle>
                </DialogHeader>
                <form key={editingClient?.id || "new"} onSubmit={handleAddClient} className="p-10 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="businessName" className="font-black uppercase tracking-widest text-[10px] text-white/60">Business Name (Optional)</Label>
                      <Input id="businessName" name="businessName" defaultValue={editingClient?.businessName || ""} placeholder="Elite Collision or Austin Vehicles" className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName" className="font-black uppercase tracking-widest text-[10px] text-white/60">First Name</Label>
                        <Input id="firstName" name="firstName" defaultValue={editingClient?.firstName || ""} placeholder="John" className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName" className="font-black uppercase tracking-widest text-[10px] text-white/60">Last Name</Label>
                        <Input id="lastName" name="lastName" defaultValue={editingClient?.lastName || ""} placeholder="Doe" className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="clientTypeId" className="font-black uppercase tracking-widest text-[10px] text-white/60">Client Type</Label>
                      <Select name="clientTypeId" defaultValue={editingClient?.clientTypeId || ""} required>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-white/10 text-white font-bold">
                          {clientTypes.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactPerson" className="font-black uppercase tracking-widest text-[10px] text-white/60">Contact Person (Optional)</Label>
                      <Input id="contactPerson" name="contactPerson" defaultValue={editingClient?.contactPerson || ""} placeholder="Jane Smith" className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="font-black uppercase tracking-widest text-[10px] text-white/60">Phone Number</Label>
                      <Input 
                        id="phone" 
                        name="phone" 
                        placeholder="(555) 000-0000" 
                        defaultValue={editingClient?.phone || ""}
                        required 
                        className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12"
                        onChange={(e) => {
                          e.target.value = formatPhoneNumber(e.target.value);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="font-black uppercase tracking-widest text-[10px] text-white/60">Email Address</Label>
                      <Input id="email" name="email" type="email" defaultValue={editingClient?.email || ""} placeholder="client@example.com" className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address" className="font-black uppercase tracking-widest text-[10px] text-white/60">Address</Label>
                    <AddressInput 
                      defaultValue={editingClient?.address || ""}
                      onAddressSelect={(address, lat, lng) => setNewClientAddress({ address, lat, lng })}
                      placeholder="123 Main St, City, ST"
                      className="bg-white/5 border-white/10 text-white font-bold rounded-xl h-12"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                      <Label className="font-black text-[10px] uppercase tracking-widest text-white/60">VIP Status</Label>
                      <Switch name="isVIP" defaultChecked={editingClient?.isVIP || false} />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                      <Label className="font-black text-[10px] uppercase tracking-widest text-white/60">One-time Client</Label>
                      <Switch name="isOneTime" defaultChecked={editingClient?.isOneTime || false} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes" className="font-black uppercase tracking-widest text-[10px] text-white/60">Internal Notes</Label>
                    <Textarea id="notes" name="notes" defaultValue={editingClient?.notes || ""} placeholder="Any special instructions..." className="bg-white/5 border-white/10 text-white rounded-xl min-h-[100px]" />
                  </div>
                  <Button type="submit" className="w-full bg-primary text-white hover:bg-[#2A6CFF] font-black h-14 rounded-xl uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-105">
                    {editingClient ? "Update Client Profile" : "Register Client Profile"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Card className="border-none bg-card rounded-3xl overflow-hidden shadow-xl">
        <CardHeader className="p-8 border-b border-white/5 bg-black/40">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input 
                placeholder="Search registry by name, phone, or vehicle..." 
                className="pl-12 bg-white/5 border-white/10 text-white font-bold rounded-2xl h-14 focus:ring-primary/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px] h-12 bg-white/5 border-white/10 text-white rounded-xl font-bold uppercase tracking-widest text-[10px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-white/10 text-white">
                  <SelectItem value="all">All Types</SelectItem>
                  {clientTypes.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px] h-12 bg-white/5 border-white/10 text-white rounded-xl font-bold uppercase tracking-widest text-[10px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-white/10 text-white">
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="ghost" size="sm" className="text-white/40 hover:text-white font-black uppercase tracking-widest text-[10px]" onClick={() => {
                setSearchTerm("");
                setTypeFilter("all");
                setCategoryFilter("all");
              }}>
                Reset Filters
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-black/20 hover:bg-black/20">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-[350px] text-white/30 font-black uppercase tracking-widest text-[11px] h-16 px-8">Client Entity</TableHead>
                <TableHead className="text-white/30 font-black uppercase tracking-widest text-[11px] h-16">Classification</TableHead>
                <TableHead className="text-white/30 font-black uppercase tracking-widest text-[11px] h-16">Communication</TableHead>
                <TableHead className="text-white/30 font-black uppercase tracking-widest text-[11px] h-16">Tags</TableHead>
                <TableHead className="text-right text-white/30 font-black uppercase tracking-widest text-[11px] h-16 px-8">Operations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-20 text-gray-400 uppercase tracking-widest text-[10px] font-black">Synchronizing database...</TableCell>
                </TableRow>
              ) : filteredClients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-20 text-gray-400 uppercase tracking-widest text-[10px] font-black">No matching records found.</TableCell>
                </TableRow>
              ) : (
                filteredClients.map((client) => {
                  const type = clientTypes.find(t => t.id === client.clientTypeId);
                  return (
                    <TableRow 
                      key={client.id} 
                      className="border-border hover:bg-white/5 transition-all duration-300 cursor-pointer group"
                      onClick={() => {
                        setSelectedClient(client);
                        setIsDetailOpen(true);
                      }}
                    >
                      <TableCell className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary font-black text-lg border border-primary/20 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                            {getClientDisplayName(client).charAt(0)}
                          </div>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-white tracking-tight uppercase text-sm">{getClientDisplayName(client)}</span>
                              {client.isVIP && <Crown className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />}
                              {(() => {
                                const risk = (client as any).riskLevel || (client as any).risk_level || (client as any).riskStatus || (client as any).clientRiskLevel || (client as any).riskManagement?.level;
                                if (!risk) return null;
                                return (
                                  <Badge variant="outline" className="bg-red-500/10 text-destructive border-destructive/20 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest">
                                    {risk}
                                  </Badge>
                                );
                              })()}
                              {(() => {
                                if (!searchTerm) return null;
                                const matchingVehicle = allVehicles.find(v => {
                                  if (v.clientId !== client.id) return false;
                                  const rawRo = v.roNumber || (v as any).ro || (v as any).ro_number || (v as any).RONumber || (v as any).repairOrder || "";
                                  return rawRo.toString().toLowerCase().includes(searchTerm.toLowerCase());
                                });
                                if (!matchingVehicle) return null;
                                const ro = matchingVehicle.roNumber || (matchingVehicle as any).ro || (matchingVehicle as any).ro_number || (matchingVehicle as any).RONumber || (matchingVehicle as any).repairOrder;
                                return (
                                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest">
                                    RO: {ro}
                                  </Badge>
                                );
                              })()}
                            </div>
                            <span className="text-[10px] text-white/60 font-medium truncate max-w-[220px] uppercase tracking-wide">{cleanAddress(client.address) || "No address assigned"}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest bg-white/10 text-white/60 border-white/10 px-3 py-1 rounded-full">
                          {type?.name || "Unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <a 
                            href={`tel:${client.phone}`} 
                            className="flex items-center gap-2 text-xs font-black text-white/80 hover:text-primary transition-all duration-300 group/link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Phone className="w-3.5 h-3.5 text-white/30 group-hover/link:text-primary" />
                            {formatPhoneNumber(client.phone)}
                          </a>
                          {client.email && (
                            <a 
                              href={`mailto:${client.email}`} 
                              className="flex items-center gap-2 text-xs font-medium text-white/60 hover:text-white transition-all duration-300 group/link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Mail className="w-3.5 h-3.5 text-white/30 group-hover/link:text-white" />
                              <span className="truncate max-w-[150px]">{client.email}</span>
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {client.categoryIds?.map(catId => {
                            const cat = categories.find(c => c.id === catId);
                            return cat ? (
                              <Badge key={catId} variant="secondary" className="text-[8px] font-black px-2 py-0.5 bg-white/10 text-white/60 border border-white/10 uppercase tracking-widest rounded-md">
                                {cat.name}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="px-8 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-10 w-10 text-white/70 hover:text-primary hover:bg-primary/5 rounded-xl transition-all duration-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              toast.success("Book Appointment Clicked");
                              
                              document.body.style.pointerEvents = "";
                              document.body.style.overflow = "";
                              document.body.removeAttribute("data-scroll-locked");
                              
                              navigate(`/book-appointment?clientId=${client.id}`);
                            }}
                            title="Book Appointment"
                          >
                            <Calendar className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-10 w-10 text-white/70 hover:text-primary hover:bg-primary/5 rounded-xl transition-all duration-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingClient(client);
                              setNewClientAddress({
                                address: client.address || "",
                                lat: client.latitude || 0,
                                lng: client.longitude || 0
                              });
                              setIsAddDialogOpen(true);
                            }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-10 w-10 text-white/60 group-hover:text-primary hover:bg-primary/5 rounded-xl transition-all duration-300">
                            <ChevronRight className="w-6 h-6" />
                          </Button>
                          <DeleteConfirmationDialog
                            trigger={
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-10 w-10 text-white hover:text-red-500 hover:bg-red-500/20 bg-white/5 transition-all duration-300 rounded-xl"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            }
                            title="Delete Client?"
                            itemName={getClientDisplayName(client)}
                            onConfirm={() => handleDeleteClient(client.id)}
                          />
                        </div>
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
          <DialogContent className="sm:max-w-6xl w-[95vw] p-0 overflow-hidden border-none shadow-2xl bg-card rounded-3xl max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-br from-primary via-primary to-red-700 p-8 text-white shrink-0 relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
              <div className="relative z-10 flex justify-between items-start">
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 bg-white/20 rounded-[2rem] flex items-center justify-center text-white font-black text-3xl backdrop-blur-md border border-white/20 shadow-xl shrink-0">
                    {getClientDisplayName(selectedClient).charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-4 mb-2 flex-wrap">
                      <h2 className="text-3xl font-black tracking-tighter font-heading uppercase leading-none">{getClientDisplayName(selectedClient)}</h2>
                      {selectedClient.isVIP && <Crown className="w-6 h-6 text-yellow-400 fill-yellow-400 drop-shadow-lg" />}
                    </div>
                    <div className="text-white/80 flex items-center gap-8 mt-3 font-bold uppercase tracking-widest text-xs flex-wrap">
                      <a href={`tel:${selectedClient.phone}`} className="flex items-center gap-2.5 hover:text-white transition-all duration-300">
                        <Phone className="w-5 h-5 text-white" /> {formatPhoneNumber(selectedClient.phone)}
                      </a>
                      <span className="opacity-30 hidden sm:block">|</span>
                      <a href={`mailto:${selectedClient.email}`} className="flex items-center gap-2.5 hover:text-white transition-all duration-300">
                        <Mail className="w-5 h-5 text-white" /> {selectedClient.email}
                      </a>
                    </div>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-4">
                  <Badge className="bg-white/10 text-white border border-white/20 font-black uppercase tracking-widest text-[10px] px-5 py-2 rounded-full backdrop-blur-md">
                    {clientTypes.find(t => t.id === selectedClient.clientTypeId)?.name || "CLIENT"}
                  </Badge>
                  <div className="flex flex-col items-end">
                    <p className="text-4xl font-black tracking-tighter font-heading leading-none">{selectedClient.loyaltyPoints || 0} <span className="text-sm uppercase tracking-widest opacity-60 ml-1">Credits</span></p>
                    <div className="flex items-center gap-3 mt-4">
                      <Button 
                        size="lg" 
                        className="bg-white text-primary hover:bg-red-50 font-black shadow-xl rounded-2xl h-12 px-8 uppercase tracking-widest text-xs"
                        onClick={() => {
                          toast.success("Book Appointment Clicked");
                          setIsDetailOpen(false);
                          
                          // Force absolute DOM reset immediately
                          document.body.style.pointerEvents = "";
                          document.body.style.overflow = "";
                          document.body.removeAttribute("data-scroll-locked");
                          
                          navigate(`/book-appointment?clientId=${selectedClient.id}`);
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

            <Tabs defaultValue="overview" className="w-full flex-1 flex flex-col overflow-hidden bg-card">
              <TabsList className="w-full justify-start rounded-none border-b border-white/5 bg-black/40 px-8 h-14 shrink-0 gap-6">
                <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none h-full px-0 font-black uppercase tracking-widest text-[11px]">Overview</TabsTrigger>
                <TabsTrigger value="profile" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none h-full px-0 font-black uppercase tracking-widest text-[11px]">Profile</TabsTrigger>
                <TabsTrigger value="appointments" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none h-full px-0 font-black uppercase tracking-widest text-[11px]">Appointments ({clientHistory.length})</TabsTrigger>
                <TabsTrigger value="vehicles" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none h-full px-0 font-black uppercase tracking-widest text-[11px]">Vehicles ({clientVehicles.length})</TabsTrigger>
                <TabsTrigger value="forms" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none h-full px-0 font-black uppercase tracking-widest text-[11px]">Forms ({signedForms.length})</TabsTrigger>
                {selectedClient.isVIP && (
                  <TabsTrigger value="vip-pricing" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none h-full px-0 font-black uppercase tracking-widest text-[11px] text-yellow-500">VIP Pricing</TabsTrigger>
                )}
                <TabsTrigger value="billing" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none h-full px-0 font-black uppercase tracking-widest text-[11px]">Billing ({clientInvoices.length + clientQuotes.length})</TabsTrigger>
                <TabsTrigger value="photos" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none h-full px-0 font-black uppercase tracking-widest text-[11px]">Gallery</TabsTrigger>
                <TabsTrigger value="timing" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none h-full px-0 font-black uppercase tracking-widest text-[11px] text-purple-500">
                  <Clock className="w-3.5 h-3.5 mr-2" />
                  Service Timing
                </TabsTrigger>
                <TabsTrigger value="strategy" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none h-full px-0 font-black uppercase tracking-widest text-[11px] text-primary">
                  <Brain className="w-3.5 h-3.5 mr-2" />
                  AI Strategy
                </TabsTrigger>
                <TabsTrigger value="comms" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none h-full px-0 font-black uppercase tracking-widest text-[11px] text-emerald-500">
                  <MessageSquare className="w-3.5 h-3.5 mr-2" />
                  Client Comms
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto p-8 bg-card custom-scrollbar">
                <TabsContent value="overview" className="mt-0 space-y-8 outline-none">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Status Summary */}
                    <div className="lg:col-span-2 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-6 bg-white/5 rounded-[2rem] border border-white/5 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Financial Standing</span>
                            <Receipt className="w-4 h-4 text-primary" />
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-3xl font-black text-white tracking-tighter">
                              {formatCurrency(clientHistory.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0))}
                            </h4>
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Lifetime Value</p>
                          </div>
                          <div className="pt-4 border-t border-white/5">
                            {(() => {
                              const pendingAmount = clientInvoices
                                .filter(i => i.status !== "paid")
                                .reduce((acc, curr) => acc + (curr.total || 0), 0);
                              return (
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">Outstanding</span>
                                  <span className="text-sm font-black text-white">{formatCurrency(pendingAmount)}</span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        <div className="p-6 bg-white/5 rounded-[2rem] border border-white/5 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Service Activity</span>
                            <History className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-3xl font-black text-white tracking-tighter">
                              {clientHistory.length}
                            </h4>
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Total Services</p>
                          </div>
                          <div className="pt-4 border-t border-white/5">
                            {(() => {
                              const lastService = clientHistory[0];
                              return (
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Last Service</span>
                                  <span className="text-[10px] font-black text-white uppercase tracking-widest">
                                    {lastService ? format(convertToDate(lastService.scheduledAt), "MMM d") : "None"}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Timeline/Recent */}
                      <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
                        <div className="flex items-center justify-between mb-8">
                          <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white">Recent Dossier Activity</h4>
                          <History className="w-4 h-4 text-primary" />
                        </div>
                        <div className="space-y-6 max-h-[500px] overflow-y-auto no-scrollbar pr-2">
                          {[...clientHistory, ...clientInvoices, ...clientQuotes, ...signedForms].length === 0 ? (
                            <div className="text-center py-10 opacity-30 italic text-sm">No recent activity detected.</div>
                          ) : (
                            [...clientHistory, ...clientInvoices, ...clientQuotes, ...signedForms]
                              .sort((a, b) => {
                                const dateA = convertToDate(a.scheduledAt || a.createdAt || a.signedAt).getTime();
                                const dateB = convertToDate(b.scheduledAt || b.createdAt || b.signedAt).getTime();
                                return dateB - dateA;
                              })
                              .map((item, idx) => (
                                <div key={idx} className="flex gap-6 items-start group/item">
                                  <div className="relative flex flex-col items-center shrink-0">
                                    <div className={cn(
                                      "w-10 h-10 rounded-2xl flex items-center justify-center border transition-all duration-300 group-hover/item:scale-110",
                                      item.status === "paid" || item.status === "completed" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                                      item.status === "pending" || item.status === "sent" ? "bg-orange-500/10 border-orange-500/20 text-orange-400" :
                                      "bg-white/5 border-white/10 text-white/40"
                                    )}>
                                      {(item as any).serviceNames ? <Calendar className="w-5 h-5" /> : 
                                       (item as any).formName ? <FileText className="w-5 h-5" /> :
                                       <Receipt className="w-5 h-5" />}
                                    </div>
                                    {idx !== ([...clientHistory, ...clientInvoices, ...clientQuotes, ...signedForms].length - 1) && <div className="w-px h-12 bg-white/5 mt-2" />}
                                  </div>
                                  <div className="flex-1 pt-1">
                                    <div className="flex justify-between items-start mb-1">
                                      <p className="text-xs font-black text-white uppercase tracking-tight">
                                        {(item as any).serviceNames ? "Service Appointment" : 
                                         (item as any).items ? "Financial Transaction" :
                                         (item as any).formName ? "Signed Document" : "Strategic Quote"}
                                      </p>
                                      <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest text-right ml-2 shrink-0">
                                        {format(convertToDate(item.scheduledAt || item.createdAt || item.signedAt), "MMM d, yyyy")}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <p className="text-[10px] text-white/40 font-medium uppercase tracking-wide truncate">
                                        {(item as any).vehicleInfo || (item as any).formName || (item as any).quoteNum || "Entity Operation"}
                                      </p>
                                      <Badge variant="outline" className={cn(
                                        "text-[7px] font-black uppercase tracking-widest px-1.5 py-0 border-none shrink-0 ml-2",
                                        getStatusColor(item.status || 'scheduled', selectedClient.isVIP)
                                      )}>
                                        {item.status?.replace("_", " ") || "Active"}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Pending Actions & Details */}
                    <div className="space-y-6">
                      <div className="p-6 bg-primary rounded-[2rem] shadow-glow-blue space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
                            <Zap className="w-5 h-5 text-white" />
                          </div>
                          <p className="text-sm font-black text-white uppercase tracking-widest">Active Alerts</p>
                        </div>
                        <div className="space-y-3">
                          {clientInvoices.some(i => i.status !== "paid") && (
                            <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl border border-white/10">
                              <AlertTriangle className="w-4 h-4 text-white" />
                              <span className="text-[10px] font-black uppercase text-white tracking-widest">Unpaid Invoices Present</span>
                            </div>
                          )}
                          {clientQuotes.some(q => q.status === "sent") && (
                            <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl border border-white/10">
                              <FileText className="w-4 h-4 text-white" />
                              <span className="text-[10px] font-black uppercase text-white tracking-widest">Pending Quotes Active</span>
                            </div>
                          )}
                          {!selectedClient.loyaltyPoints && (
                            <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl border border-white/10">
                              <Star className="w-4 h-4 text-white" />
                              <span className="text-[10px] font-black uppercase text-white tracking-widest">Register Loyalty Profile</span>
                            </div>
                          )}
                          {clientHistory.length === 0 && (
                            <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl border border-white/10">
                              <Calendar className="w-4 h-4 text-white" />
                              <span className="text-[10px] font-black uppercase text-white tracking-widest">No Service History</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="p-6 bg-white/5 rounded-[2rem] border border-white/5 space-y-6">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Engagement Analysis</h4>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-white/40">Signed Documents</span>
                            <span className="text-white font-black">{signedForms.length}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-white/40">Active Assets</span>
                            <span className="text-white font-black">{clientVehicles.length}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-white/40">Avg. Order Value</span>
                            <span className="text-white font-black">
                              {formatCurrency(clientHistory.length ? clientHistory.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0) / clientHistory.length : 0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="profile" className="mt-0 space-y-8 outline-none">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Business Entity</Label>
                        <Input 
                          defaultValue={selectedClient.businessName} 
                          className="bg-black/40 border-white/10 text-white rounded-xl h-12 focus:ring-primary/50"
                          onBlur={(e) => updateClient({ businessName: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">First Name</Label>
                          <Input 
                            defaultValue={selectedClient.firstName} 
                            className="bg-black/40 border-white/10 text-white rounded-xl h-12 focus:ring-primary/50"
                            onBlur={(e) => updateClient({ firstName: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Last Name</Label>
                          <Input 
                            defaultValue={selectedClient.lastName} 
                            className="bg-black/40 border-white/10 text-white rounded-xl h-12 focus:ring-primary/50"
                            onBlur={(e) => updateClient({ lastName: e.target.value })}
                          />
                        </div>
                      </div>
                      <ClientAddressesManager 
                        client={selectedClient}
                        onUpdate={(updates) => updateClient(updates)}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Client Classification</Label>
                          <Select 
                            key={selectedClient.clientTypeId}
                            defaultValue={selectedClient.clientTypeId}
                            onValueChange={(val) => updateClient({ clientTypeId: val })}
                          >
                            <SelectTrigger className="bg-black/40 border-white/10 text-white rounded-xl h-12">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-900 border-white/10 text-white">
                              {clientTypes.map(t => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Membership Tier</Label>
                          <Select 
                            defaultValue={selectedClient.membershipLevel}
                            onValueChange={(val: any) => updateClient({ membershipLevel: val })}
                          >
                            <SelectTrigger className="bg-black/40 border-white/10 text-white rounded-xl h-12">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-900 border-white/10 text-white">
                              <SelectItem value="none">Standard</SelectItem>
                              <SelectItem value="silver">Silver Elite</SelectItem>
                              <SelectItem value="gold">Gold Premium</SelectItem>
                              <SelectItem value="platinum">Platinum Luxury</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6 p-5 bg-white/5 rounded-3xl border border-white/5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Tag className="w-5 h-5 text-primary" />
                          <Label className="text-lg font-black uppercase tracking-tighter text-white">Registry Tags</Label>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {categories.map(cat => (
                          <Badge 
                            key={cat.id} 
                            variant={selectedClient.categoryIds?.includes(cat.id) ? "default" : "outline"}
                            className={cn(
                              "cursor-pointer px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300",
                              selectedClient.categoryIds?.includes(cat.id) 
                                ? "bg-primary text-white border-primary shadow-glow-blue" 
                                : "bg-transparent text-white/40 border-white/10 hover:border-white/20 hover:text-white"
                            )}
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
                    <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Internal Dossier / Notes</Label>
                    <Textarea 
                      defaultValue={selectedClient.notes} 
                      className="bg-black/40 border-white/10 text-white rounded-xl min-h-[120px] focus:ring-primary/50"
                      onBlur={(e) => updateClient({ notes: e.target.value })}
                    />
                  </div>

                  <div className="pt-8 border-t border-white/5">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/40 mb-6">Marketing & Automation</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between p-5 bg-white/5 rounded-3xl border border-white/5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-yellow-400/10 rounded-2xl flex items-center justify-center border border-yellow-400/20">
                            <Crown className="w-5 h-5 text-yellow-500" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-white uppercase tracking-widest">VIP Status</p>
                            <p className="text-[10px] text-white/40 font-medium uppercase tracking-wide">Priority care</p>
                          </div>
                        </div>
                        <Switch 
                          checked={selectedClient.isVIP}
                          onCheckedChange={(val) => updateClient({ isVIP: val })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-5 bg-white/5 rounded-3xl border border-white/5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20">
                            <ShieldAlert className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-white uppercase tracking-widest">One-Time</p>
                            <p className="text-[10px] text-white/40 font-medium uppercase tracking-wide">Single service</p>
                          </div>
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
                          Last follow-up sent on {format(convertToDate(selectedClient.followUpStatus.lastSentAt), "MMM d, yyyy")} via {selectedClient.followUpStatus.channel}.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-6 border-t border-gray-100">
                    <DeleteConfirmationDialog
                      trigger={
                        <Button variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 font-bold">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Client Profile
                        </Button>
                      }
                      title="Delete Client Profile?"
                      itemName={getClientDisplayName(selectedClient)}
                      onConfirm={() => handleDeleteClient(selectedClient.id)}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="vehicles" className="mt-0 space-y-8 outline-none">
                  {(() => {
                    const selectedClientType = clientTypes.find(t => t.id === selectedClient.clientTypeId);
                    const isCollisionCenter = selectedClientType?.slug === "collision_center";
                    
                    return (
                      <>
                        <div className="flex justify-between items-center">
                          <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading">Active Vehicle <span className="text-primary italic">Inventory</span></h3>
                          <Dialog>
                            <DialogTrigger render={
                              <Button size="sm" className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-10 px-6 rounded-xl uppercase tracking-widest text-[10px] shadow-glow-blue transition-all hover:scale-105">
                                <Plus className="w-4 h-4 mr-2" /> Add Asset
                              </Button>
                            } />
                            <DialogContent className="bg-card border-border p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black sm:max-w-[800px]">
                              <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                                <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase">Register New Asset</DialogTitle>
                              </DialogHeader>
                              <div className="p-10">
                                <AddVehicleForm 
                                  clientId={selectedClient.id} 
                                  isCollisionCenter={isCollisionCenter} 
                                />
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {clientVehicles.map(v => (
                            <div 
                              key={v.id} 
                              onClick={() => {
                                setEditingVehicle(v);
                                setIsEditVehicleOpen(true);
                              }}
                              className="p-4 rounded-3xl border border-white/5 bg-white/5 flex items-center gap-4 group/v transition-all duration-300 hover:bg-white/[0.08] cursor-pointer"
                            >
                              <div className="w-12 h-12 bg-black/40 rounded-2xl flex items-center justify-center text-primary border border-white/10 shadow-xl group-hover/v:scale-110 transition-transform duration-300">
                                <Car className="w-6 h-6" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-black text-white uppercase tracking-tight text-xs truncate">
                                    {v.year} {v.make} {v.model}
                                  </h4>
                                  {(() => {
                                    const rawRo = v.roNumber || (v as any).ro || (v as any).ro_number || (v as any).RONumber || (v as any).repairOrder;
                                    if (!rawRo) return null;
                                    return (
                                      <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md">
                                        RO: {rawRo}
                                      </Badge>
                                    );
                                  })()}
                                </div>
                                <div className="flex items-center gap-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                  <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color?.toLowerCase() || 'gray' }}></div> {v.color || "Unknown Color"}</span>
                                  <span className="opacity-30">|</span>
                                  <span>{v.size?.replace("_", " ") || "Standard"}</span>
                                </div>
                              </div>
                              <AlertDialog>
                                <AlertDialogTrigger render={
                                  <Button variant="ghost" size="icon" className="h-10 w-10 text-white hover:text-red-500 hover:bg-red-500/20 bg-white/5 transition-all duration-300 rounded-xl" onClick={(e) => e.stopPropagation()}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                } />
                                <AlertDialogContent className="bg-card border-border rounded-3xl shadow-2xl">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="text-white font-black uppercase tracking-tighter text-xl">Remove Vehicle?</AlertDialogTitle>
                                    <AlertDialogDescription className="text-white/60 font-medium">
                                      Are you sure you want to remove this asset from the registry? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter className="gap-3">
                                    <AlertDialogCancel onClick={(e) => e.stopPropagation()} className="bg-white/5 border-white/10 text-white rounded-xl h-12 font-bold uppercase tracking-widest text-[10px]">Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        await deleteDoc(doc(db, "vehicles", v.id));
                                        setClientVehicles(prev => prev.filter(x => x.id !== v.id));
                                        toast.success("Vehicle removed");
                                      }}
                                      className="bg-primary hover:bg-[#2A6CFF] text-white rounded-xl h-12 px-8 font-black uppercase tracking-widest text-[10px] shadow-glow-blue transition-all hover:scale-105"
                                    >
                                      Remove Asset
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          ))}
                        </div>

                        <Dialog open={isEditVehicleOpen} onOpenChange={setIsEditVehicleOpen}>
                          <DialogContent className="bg-card border-border p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black sm:max-w-[800px]">
                            <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                              <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase">Update Asset Profile</DialogTitle>
                            </DialogHeader>
                            <div className="p-10">
                              {editingVehicle && (
                                <form 
                                  onSubmit={async (e) => {
                                    e.preventDefault();
                                    const formData = new FormData(e.currentTarget);
                                    const updates = {
                                      color: formData.get("color") as string,
                                      vin: formData.get("vin") as string,
                                      size: formData.get("size") as any,
                                      roNumber: formData.get("roNumber") as string || null,
                                      notes: formData.get("notes") as string || null,
                                      licensePlate: formData.get("licensePlate") as string || null,
                                    };
                                    try {
                                      await updateDoc(doc(db, "vehicles", editingVehicle.id), updates);
                                      toast.success("Asset profile updated");
                                      setIsEditVehicleOpen(false);
                                      setEditingVehicle(null);
                                    } catch (err) {
                                      console.error("Error updating vehicle:", err);
                                      toast.error("Failed to update asset");
                                    }
                                  }}
                                  className="space-y-6"
                                >
                                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                                      <Car className="w-6 h-6" />
                                    </div>
                                    <div>
                                      <h4 className="font-black text-white uppercase tracking-tight">{editingVehicle.year} {editingVehicle.make} {editingVehicle.model}</h4>
                                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Permanent Asset ID: {editingVehicle.id}</p>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Exterior Color</Label>
                                      <Input name="color" defaultValue={editingVehicle.color} className="bg-white/5 border-white/10 text-white rounded-xl h-12" />
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">VIN (Chassis Number)</Label>
                                      <Input name="vin" defaultValue={editingVehicle.vin} className="bg-white/5 border-white/10 text-white rounded-xl h-12" />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Asset Classification</Label>
                                      <Select name="size" defaultValue={editingVehicle.size}>
                                        <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-12">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border text-white">
                                          <SelectItem value="small">Small</SelectItem>
                                          <SelectItem value="medium">Medium</SelectItem>
                                          <SelectItem value="large">Large</SelectItem>
                                          <SelectItem value="extra_large">Extra Large</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">License Plate</Label>
                                      <Input name="licensePlate" defaultValue={editingVehicle.licensePlate} className="bg-white/5 border-white/10 text-white rounded-xl h-12" />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 gap-6">
                                    {isCollisionCenter && (
                                      <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Repair Order (RO) Number</Label>
                                        <Input name="roNumber" defaultValue={editingVehicle.roNumber} className="bg-white/5 border-white/10 text-white rounded-xl h-12" />
                                      </div>
                                    )}
                                    <div className="space-y-2">
                                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Internal Asset Notes</Label>
                                      <Textarea name="notes" defaultValue={editingVehicle.notes} className="bg-white/5 border-white/10 text-white rounded-xl min-h-[100px]" />
                                    </div>
                                  </div>

                                  <div className="flex gap-4 pt-4">
                                    <Button type="button" variant="ghost" onClick={() => setIsEditVehicleOpen(false)} className="flex-1 bg-white/5 text-white hover:bg-white/10 rounded-xl h-14 font-black uppercase tracking-widest text-xs">Cancel</Button>
                                    <Button type="submit" className="flex-1 bg-primary hover:bg-[#2A6CFF] text-white rounded-xl h-14 font-black uppercase tracking-widest text-xs shadow-glow-blue transition-all hover:scale-105">Save Changes</Button>
                                  </div>
                                </form>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </>
                    );
                  })()}
                </TabsContent>

                <TabsContent value="appointments" className="mt-0 space-y-8 outline-none">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading">Service <span className="text-primary italic">History</span></h3>
                    <Button 
                      size="sm" 
                      className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-10 px-6 rounded-xl uppercase tracking-widest text-[10px] shadow-glow-blue"
                      onClick={() => {
                        toast.success("Book Appointment Clicked");
                        setIsDetailOpen(false);
                        
                        document.body.style.pointerEvents = "";
                        document.body.style.overflow = "";
                        document.body.removeAttribute("data-scroll-locked");
                        
                        navigate(`/book-appointment?clientId=${selectedClient.id}`);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" /> Book Appointment
                    </Button>
                  </div>
                  {clientHistory.length === 0 ? (
                    <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
                      <Calendar className="w-12 h-12 text-white/20 mx-auto mb-4" />
                      <p className="text-white/40 font-black uppercase tracking-widest text-[10px]">No service history recorded.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {clientHistory.map(app => (
                        <div key={app.id} className="p-4 rounded-3xl border border-white/5 bg-white/5 flex items-center justify-between group/app transition-all duration-300 hover:bg-white/[0.08]">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-black/40 rounded-2xl flex items-center justify-center text-primary border border-white/10 shadow-xl">
                              <Calendar className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-3 mb-1">
                                <h4 className="font-black text-white uppercase tracking-tight text-xs">
                                  {app.vehicleInfo || "No Vehicle Info"}
                                </h4>
                                <Badge className={cn(
                                  "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md",
                                  app.status === "completed" ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                  app.status === "canceled" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                  "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                )}>
                                  {app.status}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {format(convertToDate(app.scheduledAt), "MMM d, yyyy")}</span>
                                <span className="opacity-30">|</span>
                                <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {format(convertToDate(app.scheduledAt), "h:mm a")}</span>
                                <span className="opacity-30">|</span>
                                <span className="text-white font-black">{formatCurrency(app.totalAmount)}</span>
                              </div>
                              <p className="text-[10px] text-white/40 mt-2 font-medium uppercase tracking-wide truncate max-w-[300px]">
                                {app.serviceNames?.join(", ")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-10 w-10 text-white/70 hover:text-primary hover:bg-primary/5 rounded-xl transition-all duration-300"
                              onClick={() => navigate("/calendar", { state: { editingAppointmentId: app.id } })}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <DeleteConfirmationDialog
                              trigger={
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-10 w-10 text-white hover:text-red-500 hover:bg-red-500/20 bg-white/5 rounded-xl transition-all duration-300"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              }
                              title="Delete Appointment?"
                              itemName={`Appointment on ${format(convertToDate(app.scheduledAt), "MMM d")}`}
                              onConfirm={async () => {
                                try {
                                  await deleteDoc(doc(db, "appointments", app.id));
                                  toast.success("Appointment deleted");
                                } catch (error) {
                                  console.error("Error deleting appointment:", error);
                                  toast.error("Failed to delete appointment");
                                }
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="vip-pricing" className="mt-0 space-y-8 outline-none">
                  {(() => {
                    const selectedClientType = clientTypes.find(t => t.id === selectedClient.clientTypeId);
                    const isCollisionCenter = selectedClientType?.slug === "collision_center";

                    return (
                      <>
                        <div className="flex justify-between items-center">
                          <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading">VIP <span className="text-yellow-500 italic">Pricing Profiles</span></h3>
                        </div>
                        <div className="p-8 bg-white/5 rounded-3xl border border-white/5 space-y-8">
                          {isCollisionCenter ? (
                            <div className="space-y-6">
                              <div className="flex justify-between items-center">
                                <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Custom Collision Service Pricing</p>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl h-10 px-4 font-black uppercase tracking-widest text-[9px]"
                                  onClick={() => {
                                    const current = selectedClient.vipSettings?.customCollisionServices || [];
                                    updateClient({
                                      vipSettings: {
                                        ...selectedClient.vipSettings,
                                        customCollisionServices: [
                                          ...current,
                                          { id: crypto.randomUUID(), name: "New Service", price: 0 }
                                        ]
                                      }
                                    });
                                  }}
                                >
                                  <Plus className="w-3 h-3 mr-2" /> Add Custom Service
                                </Button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(selectedClient.vipSettings?.customCollisionServices || []).map((service, idx) => (
                                  <div key={service.id} className="p-6 bg-black/40 rounded-2xl border border-white/5 space-y-4 group/cs">
                                    <div className="flex justify-between items-start gap-4">
                                      <div className="flex-1 space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Service Name</Label>
                                        <Input 
                                          value={service.name}
                                          className="bg-white/5 border-white/10 text-white rounded-xl h-12 font-bold"
                                          onChange={(e) => {
                                            const next = [...(selectedClient.vipSettings?.customCollisionServices || [])];
                                            next[idx] = { ...next[idx], name: e.target.value };
                                            updateClient({
                                              vipSettings: {
                                                ...selectedClient.vipSettings,
                                                customCollisionServices: next
                                              }
                                            });
                                          }}
                                        />
                                      </div>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-10 w-10 text-white hover:text-red-500 hover:bg-red-500/20 bg-white/5 rounded-xl mt-6 transition-all duration-300"
                                        onClick={() => {
                                          const next = (selectedClient.vipSettings?.customCollisionServices || []).filter((_, i) => i !== idx);
                                          updateClient({
                                            vipSettings: {
                                              ...selectedClient.vipSettings,
                                              customCollisionServices: next
                                            }
                                          });
                                        }}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Fixed VIP Rate</Label>
                                      <NumberInput 
                                        value={service.price}
                                        onValueChange={(val) => {
                                          const next = [...(selectedClient.vipSettings?.customCollisionServices || [])];
                                          next[idx] = { ...next[idx], price: val };
                                          updateClient({
                                            vipSettings: {
                                              ...selectedClient.vipSettings,
                                              customCollisionServices: next
                                            }
                                          });
                                        }}
                                        className="bg-white/5 border-white/10 text-white rounded-xl h-12 font-bold"
                                      />
                                    </div>
                                  </div>
                                ))}
                                {(selectedClient.vipSettings?.customCollisionServices || []).length === 0 && (
                                  <div className="col-span-full p-12 border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-center space-y-4">
                                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center">
                                      <Tag className="w-8 h-8 text-white/20" />
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-sm font-black text-white uppercase tracking-tight">No Custom Services Defined</p>
                                      <p className="text-xs text-white/40 font-medium">Add custom service names and prices specifically for this collision center.</p>
                                    </div>
                                    <Button 
                                      onClick={() => {
                                        updateClient({
                                          vipSettings: {
                                            ...selectedClient.vipSettings,
                                            customCollisionServices: [{ id: crypto.randomUUID(), name: "Collision Detail", price: 150 }]
                                          }
                                        });
                                      }}
                                      className="bg-white/10 hover:bg-white/20 text-white rounded-xl h-10 px-6 font-black uppercase tracking-widest text-[10px]"
                                    >
                                      Add First Service
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="space-y-4">
                                <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Global VIP Service Overrides</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {services.map(service => (
                                    <div key={service.id} className="p-4 bg-black/40 rounded-2xl border border-white/5 flex flex-col gap-3">
                                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 truncate">{service.name}</Label>
                                      <div className="relative">
                                        <NumberInput 
                                          placeholder={service.basePrice?.toString()}
                                          className="bg-white/5 border-white/10 text-white rounded-xl h-10"
                                          value={selectedClient.vipSettings?.customServicePricing?.[service.id]}
                                          onValueChange={(val) => {
                                            const currentPricing = selectedClient.vipSettings?.customServicePricing || {};
                                            const nextPricing = { ...currentPricing };
                                            if (val === 0) delete nextPricing[service.id];
                                            else nextPricing[service.id] = val;
                                            
                                            updateClient({
                                              vipSettings: {
                                                ...selectedClient.vipSettings,
                                                customServicePricing: nextPricing
                                              }
                                            });
                                          }}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-6 pt-8 border-t border-white/5">
                                <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Vehicle-Specific Pricing Overrides</p>
                                {clientVehicles.length === 0 ? (
                                  <p className="text-xs text-white/20 italic">Add vehicles to the registry to enable per-vehicle pricing.</p>
                                ) : (
                                  <div className="space-y-8">
                                    {clientVehicles.map(vehicle => (
                                      <div key={vehicle.id} className="space-y-4 p-6 bg-white/5 rounded-2xl border border-white/5">
                                        <div className="flex items-center gap-3">
                                          <Car className="w-4 h-4 text-primary" />
                                          <h4 className="font-black text-white uppercase tracking-tight text-sm">{vehicle.year} {vehicle.make} {vehicle.model}</h4>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                          {services.map(service => (
                                            <div key={`${vehicle.id}-${service.id}`} className="p-4 bg-black/40 rounded-2xl border border-white/5 flex flex-col gap-3">
                                              <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 truncate">{service.name}</Label>
                                              <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-bold">$</span>
                                                <Input 
                                                  type="number"
                                                  placeholder={(selectedClient.vipSettings?.customServicePricing?.[service.id] || service.basePrice)?.toString()}
                                                  className="pl-7 bg-white/5 border-white/10 text-white rounded-xl h-10"
                                                  value={selectedClient.vipSettings?.vipVehiclePricing?.[vehicle.id]?.[service.id] || ""}
                                                  onChange={(e) => {
                                                    const val = e.target.value ? parseFloat(e.target.value) : undefined;
                                                    const currentVehiclePricing = selectedClient.vipSettings?.vipVehiclePricing || {};
                                                    const nextVehiclePricing = { ...currentVehiclePricing };
                                                    
                                                    if (!nextVehiclePricing[vehicle.id]) nextVehiclePricing[vehicle.id] = {};
                                                    
                                                    if (val === undefined) delete nextVehiclePricing[vehicle.id][service.id];
                                                    else nextVehiclePricing[vehicle.id][service.id] = val;
                                                    
                                                    updateClient({
                                                      vipSettings: {
                                                        ...selectedClient.vipSettings,
                                                        vipVehiclePricing: nextVehiclePricing
                                                      }
                                                    });
                                                  }}
                                                />
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </TabsContent>

                <TabsContent value="billing" className="mt-0 space-y-10 outline-none">
                  <div className="space-y-8">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading">Financial <span className="text-primary italic">Ledger</span></h3>
                      <AlertDialog>
                        <AlertDialogTrigger render={
                          <Button 
                            variant="outline" 
                            className="bg-red-500/5 border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white font-black h-10 px-6 rounded-xl uppercase tracking-widest text-[10px] transition-all duration-300"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Purge Profile
                          </Button>
                        } />
                        <AlertDialogContent className="bg-card border-border rounded-3xl shadow-2xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-white font-black uppercase tracking-tighter text-xl">Purge Client Profile?</AlertDialogTitle>
                            <AlertDialogDescription className="text-white/60 font-medium">
                              Are you sure you want to permanently delete this client profile? This action is irreversible and will remove all associated history.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="gap-3">
                            <AlertDialogCancel className="bg-white/5 border-white/10 text-white rounded-xl h-12 font-bold uppercase tracking-widest text-[10px]">Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDeleteClient(selectedClient.id)}
                              className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-12 px-8 font-black uppercase tracking-widest text-[10px] shadow-glow-red transition-all hover:scale-105"
                            >
                              Confirm Purge
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-white/5 rounded-3xl border border-white/5">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Lifetime Value</p>
                        <p className="text-xl font-black text-white tracking-tighter">{formatCurrency(clientHistory.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0))}</p>
                      </div>
                      <div className="p-4 bg-white/5 rounded-3xl border border-white/5">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Total Engagements</p>
                        <p className="text-xl font-black text-white tracking-tighter">{clientHistory.length}</p>
                      </div>
                      <div className="p-4 bg-white/5 rounded-3xl border border-white/5">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Loyalty Points</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xl font-black text-primary tracking-tighter">{selectedClient.loyaltyPoints || 0}</p>
                          <Star className="w-4 h-4 text-primary fill-primary" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-4">Invoicing History</h3>
                      <div className="space-y-3">
                        {clientInvoices.length === 0 ? (
                          <div className="text-center py-10 bg-white/5 rounded-3xl border border-white/5">
                            <p className="text-white/40 font-black uppercase tracking-widest text-[10px]">No invoices generated.</p>
                          </div>
                        ) : (
                          clientInvoices.map(inv => (
                            <div key={inv.id} className="p-4 rounded-3xl border border-white/5 bg-white/5 flex items-center justify-between group/inv transition-all duration-300 hover:bg-white/[0.08]">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-black/40 rounded-2xl flex items-center justify-center text-white/40 border border-white/10">
                                  <Receipt className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="font-black text-white uppercase tracking-tight text-xs">INV-{inv.id.slice(-6).toUpperCase()}</p>
                                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">
                                    {inv.createdAt ? format(convertToDate(inv.createdAt), "MMM d, yyyy") : "Pending"}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="font-black text-white tracking-tighter text-sm">{formatCurrency(inv.total)}</p>
                                  <Badge className={cn(
                                    "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md mt-1",
                                    inv.status === "paid" ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                    inv.status === "sent" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                                    "bg-white/5 text-white/40 border-white/10"
                                  )}>
                                    {inv.status}
                                  </Badge>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 rounded-xl h-8 px-3"
                                >
                                  View
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-4">Service Quotes</h3>
                      <div className="space-y-3">
                        {clientQuotes.length === 0 ? (
                          <div className="text-center py-10 bg-white/5 rounded-3xl border border-white/5">
                            <p className="text-white/40 font-black uppercase tracking-widest text-[10px]">No quotes generated.</p>
                          </div>
                        ) : (
                          clientQuotes.map(q => (
                            <div key={q.id} className="p-4 rounded-3xl border border-white/5 bg-white/5 flex items-center justify-between group/q transition-all duration-300 hover:bg-white/[0.08]">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-black/40 rounded-2xl flex items-center justify-center text-white/40 border border-white/10">
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="font-black text-white uppercase tracking-tight text-xs">QUOTE-{q.id.slice(-6).toUpperCase()}</p>
                                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">
                                    {q.createdAt ? format(convertToDate(q.createdAt), "MMM d, yyyy") : "Pending"}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="font-black text-white tracking-tighter text-sm">{formatCurrency(q.total)}</p>
                                  <Badge className={cn(
                                    "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md mt-1",
                                    q.status === "approved" ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                    q.status === "sent" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                                    "bg-white/5 text-white/40 border-white/10"
                                  )}>
                                    {q.status}
                                  </Badge>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 rounded-xl h-8 px-3"
                                >
                                  View
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                 <TabsContent value="forms" className="mt-0 space-y-8 outline-none">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading">Document <span className="text-primary italic">Vault</span></h3>
                    <Button 
                      size="sm" 
                      className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-10 px-6 rounded-xl uppercase tracking-widest text-[10px] shadow-glow-blue transition-all hover:scale-105"
                      onClick={() => navigate("/forms-builder")}
                    >
                      <Plus className="w-4 h-4 mr-2" /> Send New Form
                    </Button>
                  </div>
                  {signedForms.length === 0 ? (
                    <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
                      <FileText className="w-12 h-12 text-white/20 mx-auto mb-4" />
                      <p className="text-white/40 font-black uppercase tracking-widest text-[10px]">No signed documents detected.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {signedForms.map(form => (
                        <div key={form.id} className="p-5 rounded-3xl border border-white/5 bg-white/5 space-y-4 group/form transition-all duration-300 hover:bg-white/[0.08]">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-black/40 rounded-2xl flex items-center justify-center text-primary border border-white/10 shadow-xl">
                                <FileText className="w-6 h-6" />
                              </div>
                              <div>
                                <h4 className="font-black text-white uppercase tracking-tight text-xs">{form.formName}</h4>
                                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">
                                  Signed: {format(convertToDate(form.signedAt), "MMM d, yyyy")}
                                </p>
                              </div>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-10 w-10 text-white hover:text-primary hover:bg-primary/5 rounded-xl border border-white/5"
                              onClick={() => {
                                if (form.signatureUrl) window.open(form.signatureUrl, '_blank');
                              }}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </div>
                          
                          {form.vehicleInfo && (
                            <div className="p-3 bg-black/20 rounded-xl border border-white/5 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Car className="w-3.5 h-3.5 text-white/40" />
                                <span className="text-[10px] font-black uppercase text-white/60 tracking-tight">{form.vehicleInfo}</span>
                              </div>
                            </div>
                          )}
                          
                          <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-[0.2em] text-white/20">
                            <span>ID: {form.id.slice(0, 8)}</span>
                            <span className="text-emerald-500/60 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> Legally Bound</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="photos" className="mt-0 space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading">Asset <span className="text-primary italic">Gallery</span></h3>
                    <div className="flex gap-2">
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={(e) => handleGalleryUpload(e, false)} 
                      />
                      <input 
                        type="file" 
                        ref={cameraInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        capture="environment" 
                        onChange={(e) => handleGalleryUpload(e, true)} 
                      />
                      <Button 
                        size="sm" 
                        disabled={isUploading}
                        onClick={() => cameraInputRef.current?.click()}
                        className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-10 px-6 rounded-xl uppercase tracking-widest text-[10px] shadow-glow-blue transition-all hover:scale-105"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        {isUploading ? "Capturing..." : "Capture Media"}
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Gallery Photos */}
                    {selectedClient.gallery?.map((url, index) => (
                      <div key={`${url}-${index}`} className="aspect-square bg-white/5 rounded-2xl border border-white/5 overflow-hidden group relative">
                        <img 
                          src={url} 
                          alt={`Gallery ${index}`} 
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-transparent flex items-start justify-end p-2 pointer-events-none">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="bg-black/60 text-white hover:text-red-500 hover:bg-black/80 rounded-xl backdrop-blur-md h-8 w-8 border border-white/10 pointer-events-auto transition-all duration-300 shadow-xl"
                            onClick={async () => {
                              const nextGallery = selectedClient.gallery?.filter((_, i) => i !== index);
                              await updateClient({ gallery: nextGallery });
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    
                    <div 
                      onClick={() => !isUploading && fileInputRef.current?.click()}
                      className={cn(
                        "aspect-square bg-white/5 rounded-2xl border border-white/5 border-dashed flex flex-col items-center justify-center text-white/20 group/add-photo cursor-pointer hover:bg-white/[0.08] hover:border-white/10 transition-all duration-300",
                        isUploading && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="w-10 h-10 bg-black/40 rounded-2xl flex items-center justify-center mb-3 border border-white/5 group-hover/add-photo:scale-110 transition-transform duration-300">
                        <Plus className="w-5 h-5 text-primary" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                        {isUploading ? "Uploading..." : "Add Media"}
                      </span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="timing" className="mt-0 outline-none">
                  <div className="space-y-6">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading">
                      Service <span className="text-primary italic">Timing Engine</span>
                    </h3>
                    
                    {serviceTiming.length === 0 ? (
                      <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
                        <Clock className="w-12 h-12 text-white/20 mx-auto mb-4" />
                        <p className="text-white/40 font-black uppercase tracking-widest text-[10px]">No timing intel generated.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {serviceTiming.map((timing, idx) => (
                          <div key={idx} className="p-6 rounded-3xl border border-white/5 bg-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all duration-300 hover:bg-white/[0.08]">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black tracking-widest uppercase text-white/40 mb-1">{timing.vehicleName}</span>
                              <span className="text-sm font-black text-white uppercase tracking-tight">{timing.serviceName}</span>
                              {timing.intervalUsed && (
                                <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1">
                                  Interval: {timing.intervalUsed}
                                </span>
                              )}
                            </div>
                            
                            <div className="flex flex-col md:items-end gap-1">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] tracking-widest uppercase text-white/40">Last Done:</span>
                                <span className="text-xs font-bold text-white">
                                  {timing.lastCompletedDate ? format(timing.lastCompletedDate, "MMM d, yyyy") : "Never"}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] tracking-widest uppercase text-white/40">Next Due:</span>
                                <span className="text-xs font-bold text-white">
                                  {timing.nextDueDate ? format(timing.nextDueDate, "MMM d, yyyy") : "Unknown"}
                                </span>
                              </div>
                            </div>
                            
                            <div>
                              <Badge className={cn(
                                "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-xl",
                                timing.dueStatus === "Overdue" ? "bg-red-500/10 text-red-500 border border-red-500/20" :
                                timing.dueStatus === "Due" ? "bg-orange-500/10 text-orange-500 border border-orange-500/20" :
                                timing.dueStatus === "Due Soon" ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" :
                                timing.dueStatus === "Current" ? "bg-green-500/10 text-green-500 border border-green-500/20" :
                                "bg-white/5 text-white/40 border border-white/10"
                              )}>
                                {timing.dueStatus}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="strategy" className="mt-0 outline-none">
                  <ClientAIStrategy 
                    client={selectedClient}
                    appointments={clientHistory}
                    invoices={clientInvoices}
                    quotes={clientQuotes}
                    vehicles={clientVehicles}
                    services={services}
                  />
                </TabsContent>

                <TabsContent value="comms" className="mt-0 outline-none">
                  <ClientCommunication client={selectedClient} />
                </TabsContent>
              </div>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
