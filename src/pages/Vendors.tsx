import { useState, useEffect } from "react";
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
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { Vendor, Service, Appointment } from "../types";
import AddressInput from "../components/AddressInput";
import { deleteDoc } from "firebase/firestore";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function Vendors() {
  const { profile } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [vendorHistory, setVendorHistory] = useState<Appointment[]>([]);
  const [newVendorAddress, setNewVendorAddress] = useState({ address: "", lat: 0, lng: 0 });

  useEffect(() => {
    const q = query(collection(db, "vendors"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const vendorsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vendor));
      setVendors(vendorsData);
      setLoading(false);
    });

    const qServices = query(collection(db, "services"));
    getDocs(qServices).then(snap => {
      setServices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service)));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedVendor) {
      const q = query(
        collection(db, "appointments"), 
        where("vendorId", "==", selectedVendor.id),
        orderBy("scheduledAt", "desc")
      );
      getDocs(q).then(snap => {
        setVendorHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
      });
    }
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
      toast.success("Vendor updated");
    } catch (error) {
      toast.error("Failed to update vendor");
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
    vendor.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vendor.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vendor.phone?.includes(searchTerm)
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
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-black">Add New Vendor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddVendor} className="space-y-4 py-4">
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
            <div className="bg-black p-8 text-white">
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
                <div className="text-right">
                  <Badge className="bg-primary text-white border-none mb-2 font-black uppercase tracking-widest">
                    {selectedVendor.billingCycle} BILLING
                  </Badge>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Contact Person</p>
                  <p className="text-xl font-black">{selectedVendor.contactPerson}</p>
                </div>
              </div>
            </div>

            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="w-full justify-start rounded-none border-b bg-gray-50/50 px-8 h-12">
                <TabsTrigger value="profile" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Profile</TabsTrigger>
                <TabsTrigger value="rates" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Fixed Rates</TabsTrigger>
                <TabsTrigger value="history" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">RO History ({vendorHistory.length})</TabsTrigger>
              </TabsList>

              <div className="p-8 max-h-[60vh] overflow-y-auto bg-white">
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

                <TabsContent value="history" className="mt-0 space-y-4">
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
                </TabsContent>
              </div>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
