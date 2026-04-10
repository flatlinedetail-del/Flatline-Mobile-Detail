import { useState, useEffect, useRef } from "react";
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy, where, getDocs } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
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
  FileText
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { Customer, Vehicle, Service } from "../types";
import CustomerAddressInput, { CustomerAddressInputRef } from "../components/CustomerAddressInput";
import AddCustomerDialog from "../components/AddCustomerDialog";
import { deleteDoc } from "firebase/firestore";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function Customers() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [customerVehicles, setCustomerVehicles] = useState<Vehicle[]>([]);
  const [signedForms, setSignedForms] = useState<any[]>([]);
  const addressInputRef = useRef<CustomerAddressInputRef>(null);

  useEffect(() => {
    if (authLoading || !profile) return;

    const q = query(collection(db, "customers"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(customersData);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to customers:", error);
    });

    const qServices = query(collection(db, "services"));
    getDocs(qServices).then(snap => {
      setServices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service)));
    }).catch(error => console.error("Error fetching services in Customers:", error));

    return () => unsubscribe();
  }, [profile, authLoading]);

  useEffect(() => {
    if (selectedCustomer) {
      const qVehicles = query(
        collection(db, "vehicles"), 
        where("ownerId", "==", selectedCustomer.id),
        where("ownerType", "==", "customer")
      );
      getDocs(qVehicles).then(snap => {
        setCustomerVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle)));
      });

      const qForms = query(
        collection(db, "signed_forms"),
        where("customerId", "==", selectedCustomer.id)
      );
      getDocs(qForms).then(snap => {
        setSignedForms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
    }
  }, [selectedCustomer]);

  const updateCustomer = async (data: Partial<Customer>) => {
    if (!selectedCustomer) return;
    try {
      await updateDoc(doc(db, "customers", selectedCustomer.id), data);
      toast.success("Profile updated");
    } catch (error) {
      toast.error("Failed to update profile");
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    console.log("Attempting to delete customer:", id);
    if (!id) {
      toast.error("Invalid customer ID");
      return;
    }

    try {
      // Check for linked records
      const qVehicles = query(collection(db, "vehicles"), where("ownerId", "==", id));
      const qAppointments = query(collection(db, "appointments"), where("customerId", "==", id));
      const qInvoices = query(collection(db, "invoices"), where("clientId", "==", id));
      const qQuotes = query(collection(db, "quotes"), where("clientId", "==", id));
      
      const [vehiclesSnap, appointmentsSnap, invoicesSnap, quotesSnap] = await Promise.all([
        getDocs(qVehicles),
        getDocs(qAppointments),
        getDocs(qInvoices),
        getDocs(qQuotes)
      ]);

      if (!vehiclesSnap.empty || !appointmentsSnap.empty || !invoicesSnap.empty || !quotesSnap.empty) {
        toast.error("Cannot delete customer with linked records (vehicles, appointments, invoices, or quotes).");
        return;
      }

      await deleteDoc(doc(db, "customers", id));
      toast.success("Customer deleted successfully");
      setIsDetailOpen(false);
    } catch (error) {
      console.error("Error deleting customer:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `customers/${id}`);
      } catch (err: any) {
        toast.error(`Failed to delete customer: ${err.message}`);
      }
    }
  };

  const handleAddVehicle = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const formData = new FormData(e.currentTarget);
    const newVehicle = {
      ownerId: selectedCustomer.id,
      ownerType: "customer",
      year: formData.get("year"),
      make: formData.get("make"),
      model: formData.get("model"),
      color: formData.get("color"),
      size: formData.get("size"),
      vin: formData.get("vin"),
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "vehicles"), newVehicle);
      toast.success("Vehicle added");
      // Refresh vehicles
      const q = query(
        collection(db, "vehicles"), 
        where("ownerId", "==", selectedCustomer.id),
        where("ownerType", "==", "customer")
      );
      const snap = await getDocs(q);
      setCustomerVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle)));
    } catch (error) {
      toast.error("Failed to add vehicle");
    }
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    if (!selectedCustomer || !vehicleId) return;
    try {
      // Check for linked appointments
      const q = query(collection(db, "appointments"), where("vehicleId", "==", vehicleId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        toast.error("Cannot delete vehicle linked to existing appointments.");
        return;
      }

      await deleteDoc(doc(db, "vehicles", vehicleId));
      setCustomerVehicles(prev => prev.filter(v => v.id !== vehicleId));
      toast.success("Vehicle deleted");
    } catch (error) {
      console.error("Error deleting vehicle:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `vehicles/${vehicleId}`);
      } catch (err: any) {
        toast.error(`Failed to delete vehicle: ${err.message}`);
      }
    }
  };

  const filteredCustomers = customers.filter(customer => 
    (customer.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (customer.phone || "").includes(searchTerm) ||
    (customer.email?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter">CUSTOMERS</h1>
          <p className="text-gray-500 font-medium">Manage your retail client database and loyalty.</p>
        </div>
        <AddCustomerDialog />
      </div>

      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="border-b border-gray-50 bg-gray-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Search customers..." 
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
                <TableHead className="w-[250px]">Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Loyalty</TableHead>
                <TableHead>Membership</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-gray-500">Loading customers...</TableCell>
                </TableRow>
              ) : filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-gray-500">No customers found.</TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((customer) => (
                  <TableRow 
                    key={customer.id} 
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setIsDetailOpen(true);
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center text-primary font-black text-sm">
                          {customer.name?.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">{customer.name}</span>
                            {customer.isVIP && <Crown className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                          </div>
                          <span className="text-xs text-gray-500 truncate max-w-[150px]">{customer.address || "No address"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <a 
                          href={`tel:${customer.phone}`} 
                          className="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-primary transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone className="w-3 h-3 text-gray-400" />
                          {customer.phone}
                        </a>
                        {customer.email && (
                          <a 
                            href={`mailto:${customer.email}`} 
                            className="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-primary transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Mail className="w-3 h-3 text-gray-400" />
                            {customer.email}
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <span className="text-sm font-black text-gray-900">{customer.loyaltyPoints || 0}</span>
                        <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider">pts</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        "text-[10px] font-black uppercase tracking-widest",
                        customer.membershipLevel === "platinum" ? "bg-purple-100 text-purple-700 border-purple-200" :
                        customer.membershipLevel === "gold" ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
                        customer.membershipLevel === "silver" ? "bg-gray-100 text-gray-700 border-gray-200" :
                        "bg-white text-gray-400 border-gray-100"
                      )}>
                        {customer.membershipLevel || "NONE"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 group-hover:text-primary">
                          <ChevronRight className="w-5 h-5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm("Are you sure you want to delete this customer?")) {
                              handleDeleteCustomer(customer.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Customer Details Dialog */}
      {selectedCustomer && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden border-none shadow-2xl">
            <div className="bg-primary p-8 text-white shrink-0">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-white font-black text-2xl backdrop-blur-sm">
                    {selectedCustomer.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-3xl font-black tracking-tighter">{selectedCustomer.name}</h2>
                    <div className="text-red-100 flex items-center gap-4 mt-1 font-medium">
                      <a href={`tel:${selectedCustomer.phone}`} className="flex items-center gap-2 hover:text-white transition-colors">
                        <Phone className="w-4 h-4" /> {selectedCustomer.phone}
                      </a>
                      <span className="opacity-30">|</span>
                      <a href={`mailto:${selectedCustomer.email}`} className="flex items-center gap-2 hover:text-white transition-colors">
                        <Mail className="w-4 h-4" /> {selectedCustomer.email}
                      </a>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end mb-2">
                    {selectedCustomer.isVIP && (
                      <Badge className="bg-yellow-400 text-yellow-900 border-none font-black uppercase tracking-widest">
                        VIP
                      </Badge>
                    )}
                    <Badge className="bg-white/20 text-white border-none font-black uppercase tracking-widest">
                      {selectedCustomer.membershipLevel} MEMBER
                    </Badge>
                  </div>
                  <div className="flex flex-col items-end">
                    <p className="text-4xl font-black tracking-tighter">{selectedCustomer.loyaltyPoints} <span className="text-lg opacity-50">PTS</span></p>
                    <div className="flex items-center gap-2 mt-2">
                      <Button 
                        size="sm" 
                        className="bg-white text-primary hover:bg-red-50 font-bold shadow-lg"
                        onClick={() => {
                          navigate("/appointments", { 
                            state: { 
                              openAddDialog: true, 
                              customerId: selectedCustomer.id,
                              customerType: "retail"
                            } 
                          });
                        }}
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        Book Appointment
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-6 px-2 text-[10px] font-black uppercase bg-white/10 hover:bg-white/20 text-white"
                        onClick={() => {
                          const amount = prompt("Adjust points (use negative for deduction):");
                          if (amount) {
                            const val = parseInt(amount);
                            if (!isNaN(val)) updateCustomer({ loyaltyPoints: (selectedCustomer.loyaltyPoints || 0) + val });
                          }
                        }}
                      >
                        Adjust Points
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Tabs defaultValue="profile" className="w-full flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-full justify-start rounded-none border-b bg-gray-50/50 px-8 h-12 shrink-0">
                <TabsTrigger value="profile" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Profile</TabsTrigger>
                <TabsTrigger value="vehicles" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Vehicles ({customerVehicles.length})</TabsTrigger>
                <TabsTrigger value="pricing" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Special Pricing</TabsTrigger>
                <TabsTrigger value="history" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">History</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto p-8 bg-white">
                <TabsContent value="profile" className="mt-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Default Address</Label>
                          {selectedCustomer.address && (
                            <a 
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedCustomer.address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-black text-primary flex items-center gap-1 hover:underline uppercase tracking-widest"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Open in Maps
                            </a>
                          )}
                        </div>
                        <CustomerAddressInput 
                          defaultValue={selectedCustomer.address}
                          onAddressSelect={(address, lat, lng) => updateCustomer({ address, latitude: lat, longitude: lng })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Membership Level</Label>
                        <Select 
                          defaultValue={selectedCustomer.membershipLevel}
                          onValueChange={(val: any) => updateCustomer({ membershipLevel: val })}
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

                    <div className="space-y-4 p-6 bg-gray-50 rounded-2xl border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Crown className="w-5 h-5 text-yellow-500" />
                          <Label className="text-base font-black uppercase tracking-tighter">VIP Status</Label>
                        </div>
                        <Switch 
                          checked={selectedCustomer.isVIP || false}
                          onCheckedChange={(checked) => updateCustomer({ isVIP: checked })}
                        />
                      </div>
                      
                      {selectedCustomer.isVIP && (
                        <div className="space-y-4 pt-4 border-t border-gray-200 animate-in fade-in slide-in-from-top-2">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label className="text-xs font-bold">Waive Travel Fee</Label>
                              <p className="text-[10px] text-gray-500">Always $0 travel fee regardless of distance.</p>
                            </div>
                            <Switch 
                              checked={selectedCustomer.vipSettings?.waiveTravelFee || false}
                              onCheckedChange={(checked) => updateCustomer({ 
                                vipSettings: { ...(selectedCustomer.vipSettings || {}), waiveTravelFee: checked } 
                              })}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label className="text-xs font-bold">Exempt from Fees</Label>
                              <p className="text-[10px] text-gray-500">No deposits, cancellation, or late fees.</p>
                            </div>
                            <Switch 
                              checked={selectedCustomer.vipSettings?.exemptFromFees || false}
                              onCheckedChange={(checked) => updateCustomer({ 
                                vipSettings: { ...(selectedCustomer.vipSettings || {}), exemptFromFees: checked } 
                              })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold">Travel Fee Discount (%)</Label>
                            <Input 
                              type="number"
                              placeholder="0"
                              className="h-8 bg-white"
                              defaultValue={selectedCustomer.vipSettings?.travelFeeDiscount}
                              onBlur={(e) => {
                                const travelFeeDiscount = parseFloat(e.target.value);
                                updateCustomer({ 
                                  vipSettings: { 
                                    customServicePricing: selectedCustomer.vipSettings?.customServicePricing || {},
                                    travelFeeDiscount,
                                    waiveTravelFee: selectedCustomer.vipSettings?.waiveTravelFee || false,
                                    exemptFromFees: selectedCustomer.vipSettings?.exemptFromFees || false,
                                    specialDiscountRules: selectedCustomer.vipSettings?.specialDiscountRules || ""
                                  } 
                                });
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Internal Notes</Label>
                    <Textarea 
                      defaultValue={selectedCustomer.notes} 
                      className="bg-gray-50 border-none min-h-[100px] font-medium"
                      onBlur={(e) => updateCustomer({ notes: e.target.value })}
                    />
                  </div>

                  <div className="pt-6 border-t border-gray-100">
                    <AlertDialog>
                      <AlertDialogTrigger render={
                        <Button variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 font-bold">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Customer Profile
                        </Button>
                      } />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-black">Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the customer profile
                            and all associated local data. We will check for linked vehicles and appointments first.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="font-bold">Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDeleteCustomer(selectedCustomer.id)}
                            className="bg-red-600 hover:bg-red-700 font-bold"
                          >
                            Delete Customer
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
                      <DialogTrigger render={<Button size="sm" className="bg-primary font-bold"><Plus className="w-4 h-4 mr-2" /> Add Vehicle</Button>} />
                      <DialogContent>
                        <DialogHeader><DialogTitle className="font-black">Add New Vehicle</DialogTitle></DialogHeader>
                        <form onSubmit={handleAddVehicle} className="space-y-4 py-4">
                          <div className="grid grid-cols-2 gap-4">
                            <Input name="year" placeholder="Year (e.g. 2022)" required />
                            <Input name="make" placeholder="Make (e.g. Tesla)" required />
                            <Input name="model" placeholder="Model (e.g. Model 3)" required />
                            <Input name="color" placeholder="Color" />
                          </div>
                          <Select name="size" defaultValue="medium">
                            <SelectTrigger><SelectValue placeholder="Vehicle Size" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="small">Small (Coupe/Compact)</SelectItem>
                              <SelectItem value="medium">Medium (Sedan/Small SUV)</SelectItem>
                              <SelectItem value="large">Large (Full SUV/Truck)</SelectItem>
                              <SelectItem value="extra_large">Extra Large (Van/Lifted)</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input name="vin" placeholder="VIN (Optional)" />
                          <Button type="submit" className="w-full bg-primary font-bold">Save Vehicle</Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {customerVehicles.map(v => (
                      <div key={v.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 flex items-center gap-4 group">
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm">
                          <Car className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">{v.year} {v.make} {v.model}</p>
                          <p className="text-xs text-gray-500 uppercase font-black tracking-widest">{v.size.replace("_", " ")} • {v.color}</p>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger render={
                            <Button variant="ghost" size="icon" className="text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          } />
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-black">Delete Vehicle?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove this {v.year} {v.make} {v.model} from the customer's profile?
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
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="pricing" className="mt-0 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-black text-gray-900">Custom Service Rates</h3>
                      <p className="text-sm text-gray-500 font-medium">Override standard pricing for this customer</p>
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
                          <span className="text-xs text-gray-400 font-bold">Standard: ${service.basePrice}</span>
                          <div className="relative w-24">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">$</span>
                            <Input 
                              type="number"
                              placeholder="Rate"
                              className="pl-6 h-8 bg-white border-gray-200 font-bold text-sm"
                              defaultValue={selectedCustomer.vipSettings?.customServicePricing?.[service.id]}
                              onBlur={async (e) => {
                                const val = parseFloat(e.target.value);
                                const newPricing = { ...(selectedCustomer.vipSettings?.customServicePricing || {}) };
                                if (isNaN(val)) delete newPricing[service.id];
                                else newPricing[service.id] = val;
                                await updateCustomer({ 
                                  vipSettings: { 
                                    customServicePricing: newPricing,
                                    travelFeeDiscount: selectedCustomer.vipSettings?.travelFeeDiscount || 0,
                                    waiveTravelFee: selectedCustomer.vipSettings?.waiveTravelFee || false,
                                    exemptFromFees: selectedCustomer.vipSettings?.exemptFromFees || false,
                                    specialDiscountRules: selectedCustomer.vipSettings?.specialDiscountRules || ""
                                  } 
                                });
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
                        <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
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
                </TabsContent>
              </div>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
