import { useState, useEffect, useRef } from "react";
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { 
  Building2, 
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
  Briefcase,
  ChevronRight,
  DollarSign,
  FileText,
  Plus,
  Trash2,
  Tag,
  ExternalLink,
  Car,
  Camera,
  Upload,
  Image as ImageIcon,
  X,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { Vendor, Service, Appointment, Vehicle } from "../types";
import AddressInput from "../components/AddressInput";
import { deleteDoc } from "firebase/firestore";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../firebase";

export default function Vendors() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [vendorHistory, setVendorHistory] = useState<Appointment[]>([]);
  const [vendorVehicles, setVendorVehicles] = useState<Vehicle[]>([]);
  const [signedForms, setSignedForms] = useState<any[]>([]);
  const [newVendorAddress, setNewVendorAddress] = useState({ address: "", lat: 0, lng: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const vehicleFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingVehicleId, setUploadingVehicleId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !profile) return;

    const q = query(collection(db, "vendors"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const vendorsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vendor));
      setVendors(vendorsData);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to vendors:", error);
    });

    const unsubServices = onSnapshot(query(collection(db, "services")), (snap) => {
      setServices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service)));
    }, (error) => {
      console.error("Error listening to services:", error);
    });

    return () => {
      unsubscribe();
      unsubServices();
    };
  }, [profile, authLoading]);

  useEffect(() => {
    if (!selectedVendor) {
      setVendorHistory([]);
      setVendorVehicles([]);
      setSignedForms([]);
      return;
    }

    const qHistory = query(
      collection(db, "appointments"), 
      where("vendorId", "==", selectedVendor.id),
      orderBy("scheduledAt", "desc")
    );
    const unsubHistory = onSnapshot(qHistory, (snap) => {
      setVendorHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
    }, (error) => {
      console.error("Error listening to vendor history:", error);
    });

    const qVehicles = query(
      collection(db, "vehicles"),
      where("ownerId", "==", selectedVendor.id),
      where("ownerType", "==", "vendor")
    );
    const unsubVehicles = onSnapshot(qVehicles, (snap) => {
      setVendorVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle)));
    }, (error) => {
      console.error("Error listening to vendor vehicles:", error);
    });

    const qForms = query(
      collection(db, "signed_forms"),
      where("vendorId", "==", selectedVendor.id)
    );
    const unsubForms = onSnapshot(qForms, (snap) => {
      setSignedForms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Error listening to vendor forms:", error);
    });

    return () => {
      unsubHistory();
      unsubVehicles();
      unsubForms();
    };
  }, [selectedVendor]);

  const handleAddVendor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newVendor = {
      name: formData.get("name"),
      contactPerson: formData.get("contactPerson"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      address: newVendorAddress.address,
      latitude: newVendorAddress.lat,
      longitude: newVendorAddress.lng,
      billingCycle: formData.get("billingCycle") || "monthly",
      vendorRates: {},
      notes: formData.get("notes"),
      createdAt: serverTimestamp(),
      createdBy: profile?.uid,
    };

    try {
      await addDoc(collection(db, "vendors"), newVendor);
      toast.success("Vendor added successfully");
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error("Error adding vendor:", error);
      toast.error("Failed to add vendor");
    }
  };

  const updateVendor = async (data: Partial<Vendor>) => {
    if (!selectedVendor) return;
    try {
      await updateDoc(doc(db, "vendors", selectedVendor.id), data);
      setSelectedVendor(prev => prev ? { ...prev, ...data } : null);
      toast.success("Vendor updated");
    } catch (error) {
      toast.error("Failed to update vendor");
    }
  };

  const handleAddVehicle = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedVendor) return;
    const formData = new FormData(e.currentTarget);
    const newVehicle = {
      ownerId: selectedVendor.id,
      ownerType: "vendor",
      year: formData.get("year"),
      make: formData.get("make"),
      model: formData.get("model"),
      color: formData.get("color"),
      size: formData.get("size"),
      vin: formData.get("vin"),
      roNumber: formData.get("roNumber"),
      notes: formData.get("notes"),
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "vehicles"), newVehicle);
      toast.success("Vehicle added");
      // Refresh vehicles
      const q = query(
        collection(db, "vehicles"), 
        where("ownerId", "==", selectedVendor.id),
        where("ownerType", "==", "vendor")
      );
      const snap = await getDocs(q);
      setVendorVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle)));
    } catch (error) {
      toast.error("Failed to add vehicle");
    }
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    if (!selectedVendor) return;
    try {
      await deleteDoc(doc(db, "vehicles", vehicleId));
      setVendorVehicles(prev => prev.filter(v => v.id !== vehicleId));
      toast.success("Vehicle deleted");
    } catch (error) {
      console.error("Error deleting vehicle:", error);
      toast.error("Failed to delete vehicle");
    }
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>, vehicleId?: string) => {
    const file = e.target.files?.[0];
    if (!file || !selectedVendor) return;

    setIsUploading(true);
    if (vehicleId) setUploadingVehicleId(vehicleId);

    try {
      const path = vehicleId 
        ? `vendors/${selectedVendor.id}/vehicles/${vehicleId}/${Date.now()}_${file.name}`
        : `vendors/${selectedVendor.id}/inspections/${Date.now()}_${file.name}`;
      
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      if (vehicleId) {
        const vehicle = vendorVehicles.find(v => v.id === vehicleId);
        const photos = [...(vehicle?.inspectionPhotos || []), url];
        await updateDoc(doc(db, "vehicles", vehicleId), { inspectionPhotos: photos });
        setVendorVehicles(prev => prev.map(v => v.id === vehicleId ? { ...v, inspectionPhotos: photos } : v));
      } else {
        const photos = [...(selectedVendor.inspectionPhotos || []), url];
        await updateVendor({ inspectionPhotos: photos });
      }

      toast.success("Photo uploaded successfully");
    } catch (error) {
      console.error("Error uploading photo:", error);
      toast.error("Failed to upload photo");
    } finally {
      setIsUploading(false);
      setUploadingVehicleId(null);
    }
  };

  const handleDeletePhoto = async (url: string, vehicleId?: string) => {
    if (!selectedVendor) return;
    try {
      const storageRef = ref(storage, url);
      await deleteObject(storageRef);

      if (vehicleId) {
        const vehicle = vendorVehicles.find(v => v.id === vehicleId);
        const photos = (vehicle?.inspectionPhotos || []).filter(p => p !== url);
        await updateDoc(doc(db, "vehicles", vehicleId), { inspectionPhotos: photos });
        setVendorVehicles(prev => prev.map(v => v.id === vehicleId ? { ...v, inspectionPhotos: photos } : v));
      } else {
        const photos = (selectedVendor.inspectionPhotos || []).filter(p => p !== url);
        await updateVendor({ inspectionPhotos: photos });
      }
      toast.success("Photo deleted");
    } catch (error) {
      console.error("Error deleting photo:", error);
      toast.error("Failed to delete photo");
    }
  };

  const handleDeleteVendor = async (id: string) => {
    try {
      // Check for linked records
      const qAppointments = query(collection(db, "appointments"), where("vendorId", "==", id));
      const qVehicles = query(collection(db, "vehicles"), where("ownerId", "==", id));
      
      const [appointmentsSnap, vehiclesSnap] = await Promise.all([
        getDocs(qAppointments),
        getDocs(qVehicles)
      ]);

      if (!appointmentsSnap.empty || !vehiclesSnap.empty) {
        toast.error("Cannot delete vendor with linked appointments or vehicles.");
        return;
      }

      await deleteDoc(doc(db, "vendors", id));
      toast.success("Vendor deleted successfully");
      setIsDetailOpen(false);
    } catch (error) {
      console.error("Error deleting vendor:", error);
      toast.error("Failed to delete vendor");
    }
  };

  const filteredVendors = vendors.filter(vendor => 
    (vendor.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (vendor.contactPerson?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (vendor.phone || "").includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter">VENDORS</h1>
          <p className="text-gray-500 font-medium">Manage business accounts, collision centers, and dealerships.</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger render={
            <Button className="bg-primary hover:bg-red-700 shadow-lg shadow-red-100 font-bold">
              <Building2 className="w-4 h-4 mr-2" />
              Add New Vendor
            </Button>
          } />
          <DialogContent className="sm:max-w-[500px] p-0">
            <DialogHeader className="px-6 pt-6 pb-2">
              <DialogTitle className="text-xl font-black">Add New Vendor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddVendor} className="flex-1 overflow-y-auto space-y-4 px-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Business Name</Label>
                <Input id="name" name="name" placeholder="Elite Collision Center" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactPerson">Contact Name</Label>
                  <Input id="contactPerson" name="contactPerson" placeholder="Jane Smith" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" name="phone" placeholder="(555) 000-0000" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Billing Email</Label>
                <Input id="email" name="email" type="email" placeholder="billing@elite.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <AddressInput 
                  onAddressSelect={(address, lat, lng) => setNewVendorAddress({ address, lat, lng })}
                  placeholder="123 Main St, City, ST"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingCycle">Billing Cycle</Label>
                <Select name="billingCycle" defaultValue="monthly">
                  <SelectTrigger>
                    <SelectValue placeholder="Select cycle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-red-700 font-bold">Create Vendor Account</Button>
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
                placeholder="Search vendors..." 
                className="pl-10 bg-white border-gray-200 rounded-full"
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
                <TableHead className="w-[300px]">Business</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Billing Cycle</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-gray-500">Loading vendors...</TableCell>
                </TableRow>
              ) : filteredVendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-gray-500">No vendors found.</TableCell>
                </TableRow>
              ) : (
                filteredVendors.map((vendor) => (
                  <TableRow 
                    key={vendor.id} 
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                    onClick={() => {
                      setSelectedVendor(vendor);
                      setIsDetailOpen(true);
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 group-hover:bg-red-50 group-hover:text-primary transition-colors">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900">{vendor.name}</span>
                          <span className="text-xs text-gray-500 truncate max-w-[200px]">{vendor.email || "No billing email"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-bold text-gray-700">{vendor.contactPerson}</span>
                        <a 
                          href={`tel:${vendor.phone}`} 
                          className="flex items-center gap-2 text-xs text-gray-500 hover:text-primary transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone className="w-3 h-3" />
                          {vendor.phone}
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest bg-red-50 text-primary border-red-100">
                        {vendor.billingCycle}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-gray-500">
                        {vendor.createdAt?.toDate ? format(vendor.createdAt.toDate(), "MMM d, yyyy") : "Just now"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 group-hover:text-primary">
                        <ChevronRight className="w-5 h-5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Vendor Details Dialog */}
      {selectedVendor && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden border-none shadow-2xl">
            <div className="bg-black p-8 text-white shrink-0">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-white font-black text-2xl backdrop-blur-sm">
                    <Building2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black tracking-tighter">{selectedVendor.name}</h2>
                    <div className="text-gray-400 flex items-center gap-4 mt-1 font-medium">
                      <a href={`tel:${selectedVendor.phone}`} className="flex items-center gap-2 hover:text-white transition-colors">
                        <Phone className="w-4 h-4" /> {selectedVendor.phone}
                      </a>
                      <span className="opacity-30">|</span>
                      <a href={`mailto:${selectedVendor.email}`} className="flex items-center gap-2 hover:text-white transition-colors">
                        <Mail className="w-4 h-4" /> {selectedVendor.email}
                      </a>
                    </div>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end">
                  <div className="flex items-center gap-2 mb-2">
                    <Button 
                      size="sm" 
                      className="bg-white text-primary hover:bg-red-50 font-bold shadow-lg"
                      onClick={() => {
                        navigate("/appointments", { 
                          state: { 
                            openAddDialog: true, 
                            vendorId: selectedVendor.id,
                            customerType: "vendor"
                          } 
                        });
                      }}
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      Book Appointment
                    </Button>
                    <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest">
                      {selectedVendor.billingCycle} BILLING
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Contact Person</p>
                  <p className="text-xl font-black">{selectedVendor.contactPerson}</p>
                </div>
              </div>
            </div>

            <Tabs defaultValue="profile" className="w-full flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-full justify-start rounded-none border-b bg-gray-50/50 px-8 h-12 shrink-0">
                <TabsTrigger value="profile" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Profile</TabsTrigger>
                <TabsTrigger value="vehicles" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Vehicles ({vendorVehicles.length})</TabsTrigger>
                <TabsTrigger value="photos" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Photos ({selectedVendor.inspectionPhotos?.length || 0})</TabsTrigger>
                <TabsTrigger value="rates" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Fixed Rates</TabsTrigger>
                <TabsTrigger value="history" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">RO History ({vendorHistory.length})</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto p-8 bg-white">
                <TabsContent value="profile" className="mt-0 space-y-6">
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Business Address</Label>
                        {selectedVendor.address && (
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedVendor.address)}`}
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
                        defaultValue={selectedVendor.address}
                        onAddressSelect={(address, lat, lng) => updateVendor({ address, latitude: lat, longitude: lng })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Billing Cycle</Label>
                      <Select 
                        defaultValue={selectedVendor.billingCycle}
                        onValueChange={(val: any) => updateVendor({ billingCycle: val })}
                      >
                        <SelectTrigger className="bg-gray-50 border-none font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Internal Notes</Label>
                    <Textarea 
                      defaultValue={selectedVendor.notes} 
                      className="bg-gray-50 border-none min-h-[100px] font-medium"
                      onBlur={(e) => updateVendor({ notes: e.target.value })}
                    />
                  </div>

                  <div className="pt-6 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-black text-gray-900">Inspection Photos</h3>
                      <div className="flex gap-2">
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          accept="image/*" 
                          onChange={(e) => handleUploadPhoto(e)} 
                        />
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="font-bold"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                        >
                          {isUploading && !uploadingVehicleId ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                          Upload Photo
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="font-bold"
                          onClick={() => {
                            fileInputRef.current?.setAttribute("capture", "environment");
                            fileInputRef.current?.click();
                          }}
                          disabled={isUploading}
                        >
                          <Camera className="w-4 h-4 mr-2" />
                          Take Photo
                        </Button>
                      </div>
                    </div>
                    {selectedVendor.inspectionPhotos && selectedVendor.inspectionPhotos.length > 0 ? (
                      <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                        {selectedVendor.inspectionPhotos.map((url, idx) => (
                          <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border group">
                            <img src={url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <a href={url} target="_blank" rel="noopener noreferrer" className="p-2 bg-white rounded-full text-gray-900 hover:bg-gray-100">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                              <Button 
                                size="icon" 
                                variant="destructive" 
                                className="rounded-full h-8 w-8"
                                onClick={() => handleDeletePhoto(url)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed text-gray-400">
                        <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-xs font-bold">No inspection photos yet.</p>
                      </div>
                    )}
                  </div>

                  <div className="pt-6 border-t border-gray-100">
                    <AlertDialog>
                      <AlertDialogTrigger render={
                        <Button variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 font-bold">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Vendor Profile
                        </Button>
                      } />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-black">Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the vendor profile
                            and all associated local data. We will check for linked appointments first.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="font-bold">Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDeleteVendor(selectedVendor.id)}
                            className="bg-red-600 hover:bg-red-700 font-bold"
                          >
                            Delete Vendor
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TabsContent>

                <TabsContent value="vehicles" className="mt-0 space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-black text-gray-900">Vendor Vehicles</h3>
                    <Dialog>
                      <DialogTrigger render={<Button size="sm" className="bg-primary font-bold"><Plus className="w-4 h-4 mr-2" /> Add Vehicle</Button>} />
                      <DialogContent>
                        <DialogHeader><DialogTitle className="font-black">Add New Vehicle</DialogTitle></DialogHeader>
                        <form onSubmit={handleAddVehicle} className="space-y-4 py-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Year</Label>
                              <Input name="year" placeholder="2022" required />
                            </div>
                            <div className="space-y-2">
                              <Label>Make</Label>
                              <Input name="make" placeholder="Tesla" required />
                            </div>
                            <div className="space-y-2">
                              <Label>Model</Label>
                              <Input name="model" placeholder="Model 3" required />
                            </div>
                            <div className="space-y-2">
                              <Label>Color</Label>
                              <Input name="color" placeholder="White" />
                            </div>
                            <div className="space-y-2">
                              <Label>RO Number</Label>
                              <Input name="roNumber" placeholder="RO-12345" />
                            </div>
                            <div className="space-y-2">
                              <Label>Size</Label>
                              <Select name="size" defaultValue="medium">
                                <SelectTrigger><SelectValue placeholder="Vehicle Size" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="small">Small (Coupe/Compact)</SelectItem>
                                  <SelectItem value="medium">Medium (Sedan/Small SUV)</SelectItem>
                                  <SelectItem value="large">Large (Full SUV/Truck)</SelectItem>
                                  <SelectItem value="extra_large">Extra Large (Van/Lifted)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>VIN (Optional)</Label>
                            <Input name="vin" placeholder="VIN Number" />
                          </div>
                          <div className="space-y-2">
                            <Label>Notes</Label>
                            <Textarea name="notes" placeholder="Vehicle specific notes..." />
                          </div>
                          <Button type="submit" className="w-full bg-primary font-bold">Save Vehicle</Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {vendorVehicles.map(v => (
                      <Card key={v.id} className="border border-gray-100 shadow-none overflow-hidden group">
                        <CardContent className="p-0">
                          <div className="p-4 flex items-center gap-4 bg-gray-50/50">
                            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm">
                              <Car className="w-6 h-6" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-gray-900">{v.year} {v.make} {v.model}</p>
                                {v.roNumber && <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest bg-white">RO: {v.roNumber}</Badge>}
                              </div>
                              <p className="text-xs text-gray-500 uppercase font-black tracking-widest">{v.size.replace("_", " ")} • {v.color || "No color"}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <AlertDialog>
                                <AlertDialogTrigger render={
                                  <Button variant="ghost" size="icon" className="text-gray-300 hover:text-red-600">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                } />
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="font-black">Delete Vehicle?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to remove this {v.year} {v.make} {v.model} from the vendor's profile?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="font-bold">Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => handleDeleteVehicle(v.id)}
                                      className="bg-red-600 hover:bg-red-700 font-bold"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                          
                          <div className="p-4 space-y-4">
                            {v.notes && (
                              <div className="space-y-1">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Vehicle Notes</Label>
                                <p className="text-sm text-gray-600">{v.notes}</p>
                              </div>
                            )}

                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Vehicle Photos</Label>
                                <div className="flex gap-2">
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    accept="image/*" 
                                    onChange={(e) => handleUploadPhoto(e, v.id)} 
                                    id={`photo-upload-${v.id}`}
                                  />
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className="h-7 px-2 text-[10px] font-black uppercase text-primary hover:bg-red-50"
                                    onClick={() => document.getElementById(`photo-upload-${v.id}`)?.click()}
                                    disabled={isUploading && uploadingVehicleId === v.id}
                                  >
                                    {isUploading && uploadingVehicleId === v.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
                                    Upload
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className="h-7 px-2 text-[10px] font-black uppercase text-primary hover:bg-red-50"
                                    onClick={() => {
                                      const input = document.getElementById(`photo-upload-${v.id}`) as HTMLInputElement;
                                      if (input) {
                                        input.setAttribute("capture", "environment");
                                        input.click();
                                      }
                                    }}
                                    disabled={isUploading && uploadingVehicleId === v.id}
                                  >
                                    <Camera className="w-3 h-3 mr-1" />
                                    Camera
                                  </Button>
                                </div>
                              </div>
                              
                              {v.inspectionPhotos && v.inspectionPhotos.length > 0 ? (
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                  {v.inspectionPhotos.map((url, idx) => (
                                    <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border shrink-0 group">
                                      <img src={url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                        <Button 
                                          size="icon" 
                                          variant="destructive" 
                                          className="h-6 w-6 rounded-full"
                                          onClick={() => handleDeletePhoto(url, v.id)}
                                        >
                                          <X className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] text-gray-400 italic">No vehicle photos uploaded.</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {vendorVehicles.length === 0 && (
                      <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed text-gray-400">
                        <Car className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p className="font-bold">No vehicles saved for this vendor.</p>
                        <p className="text-xs">Add vehicles to streamline the booking process.</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="photos" className="mt-0 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-black text-gray-900">Vendor Inspection Photos</h3>
                      <p className="text-sm text-gray-500 font-medium">General photos for this vendor account</p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="font-bold"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading && !uploadingVehicleId ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                        Upload Photo
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="font-bold"
                        onClick={() => {
                          fileInputRef.current?.setAttribute("capture", "environment");
                          fileInputRef.current?.click();
                        }}
                        disabled={isUploading}
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Take Photo
                      </Button>
                    </div>
                  </div>

                  {selectedVendor.inspectionPhotos && selectedVendor.inspectionPhotos.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {selectedVendor.inspectionPhotos.map((url, idx) => (
                        <div key={idx} className="relative aspect-video rounded-2xl overflow-hidden border group">
                          <img src={url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <a href={url} target="_blank" rel="noopener noreferrer" className="p-2 bg-white rounded-full text-gray-900 hover:bg-gray-100">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <Button 
                              size="icon" 
                              variant="destructive" 
                              className="rounded-full h-8 w-8"
                              onClick={() => handleDeletePhoto(url)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed text-gray-400">
                      <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-10" />
                      <p className="font-bold">No inspection photos yet.</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="rates" className="mt-0 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-black text-gray-900">Vendor Fixed Rates</h3>
                      <p className="text-sm text-gray-500 font-medium">Set pre-negotiated rates for this business</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {services.map(service => (
                      <div key={service.id} className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-3">
                          <Tag className="w-4 h-4 text-gray-400" />
                          <span className="font-bold text-gray-700">{service.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 font-bold">Base: ${service.basePrice}</span>
                          <div className="relative w-24">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">$</span>
                            <Input 
                              type="number"
                              placeholder="Rate"
                              className="pl-6 h-8 bg-white border-gray-200 font-bold text-sm"
                              defaultValue={selectedVendor.vendorRates?.[service.id]}
                              onBlur={async (e) => {
                                const val = parseFloat(e.target.value);
                                const newRates = { ...(selectedVendor.vendorRates || {}) };
                                if (isNaN(val)) delete newRates[service.id];
                                else newRates[service.id] = val;
                                await updateVendor({ vendorRates: newRates });
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-0 space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-black text-gray-900">Signed Forms & Waivers</h3>
                    {signedForms.length === 0 ? (
                      <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-2xl border border-dashed">
                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p className="font-bold">No signed forms found.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {signedForms.map(sf => (
                          <div key={sf.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="font-bold text-gray-900">{sf.formTitle}</p>
                                <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">
                                  Signed {format(new Date(sf.signedAt), "MMM d, yyyy")}
                                </p>
                              </div>
                            </div>
                            <Dialog>
                              <DialogTrigger render={<Button variant="ghost" size="sm" className="font-bold text-primary">View</Button>} />
                              <DialogContent className="max-w-2xl bg-white p-8 rounded-2xl border-none shadow-2xl overflow-y-auto max-h-[90vh]">
                                <div className="space-y-6">
                                  <div className="flex justify-between items-start border-b pb-4">
                                    <div>
                                      <h2 className="text-2xl font-black uppercase tracking-tighter">{sf.formTitle}</h2>
                                      <p className="text-xs text-gray-500">Version {sf.formVersion} • Signed At: {format(new Date(sf.signedAt), "MMM d, yyyy h:mm a")}</p>
                                    </div>
                                    <Badge className="bg-green-100 text-green-700 border-green-200">Verified</Badge>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-4">
                                    {sf.printedName && (
                                      <div>
                                        <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Printed Name</Label>
                                        <p className="font-bold text-gray-900">{sf.printedName}</p>
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
                                        <img src={sf.signature} alt="Signature" className="h-20" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 pt-6 border-t border-gray-100">
                    <h3 className="text-lg font-black text-gray-900">RO History</h3>
                    {vendorHistory.length === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p className="font-bold">No RO history found.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {vendorHistory.map(job => (
                          <div key={job.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 flex items-center justify-between group hover:border-red-200 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-gray-400 shadow-sm">
                                <Calendar className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="font-bold text-gray-900">{job.vehicleInfo}</p>
                                <p className="text-xs text-gray-500 font-medium">RO: {job.roNumber || "N/A"} • {format(job.scheduledAt.toDate(), "MMM d, yyyy")}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-black text-gray-900">${job.totalAmount}</p>
                              <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest">{job.status}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
