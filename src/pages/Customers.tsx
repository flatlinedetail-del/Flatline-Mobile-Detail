import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
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
  ChevronRight
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { Customer, Vehicle, Service } from "../types";

export default function Customers() {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [customerVehicles, setCustomerVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    const q = query(collection(db, "customers"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(customersData);
      setLoading(false);
    });

    const qServices = query(collection(db, "services"));
    getDocs(qServices).then(snap => {
      setServices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service)));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedCustomer) {
      const q = query(
        collection(db, "vehicles"), 
        where("ownerId", "==", selectedCustomer.id),
        where("ownerType", "==", "customer")
      );
      getDocs(q).then(snap => {
        setCustomerVehicles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle)));
      });
    }
  }, [selectedCustomer]);

  const handleAddCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newCustomer = {
      name: formData.get("name"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      address: formData.get("address"),
      loyaltyPoints: 0,
      membershipLevel: "none",
      notes: formData.get("notes"),
      createdAt: serverTimestamp(),
      createdBy: profile?.uid,
    };

    try {
      await addDoc(collection(db, "customers"), newCustomer);
      toast.success("Customer added successfully");
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error("Error adding customer:", error);
      toast.error("Failed to add customer");
    }
  };

  const updateCustomer = async (data: Partial<Customer>) => {
    if (!selectedCustomer) return;
    try {
      await updateDoc(doc(db, "customers", selectedCustomer.id), data);
      toast.success("Profile updated");
    } catch (error) {
      toast.error("Failed to update profile");
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

  const filteredCustomers = customers.filter(customer => 
    customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone?.includes(searchTerm) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter">CUSTOMERS</h1>
          <p className="text-gray-500 font-medium">Manage your retail client database and loyalty.</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger render={
            <Button className="bg-primary hover:bg-red-700 shadow-lg shadow-red-100 font-bold">
              <UserPlus className="w-4 h-4 mr-2" />
              Add New Customer
            </Button>
          } />
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-black">Add New Customer</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddCustomer} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" name="name" placeholder="John Doe" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" name="phone" placeholder="(555) 000-0000" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" name="email" type="email" placeholder="john@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Default Address</Label>
                <Input id="address" name="address" placeholder="123 Main St, City, ST" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" placeholder="Special requests, gate codes, etc." />
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-red-700 font-bold">Create Customer</Button>
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
                          <span className="font-bold text-gray-900">{customer.name}</span>
                          <span className="text-xs text-gray-500 truncate max-w-[150px]">{customer.address || "No address"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
                          <Phone className="w-3 h-3 text-gray-400" />
                          {customer.phone}
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
                          <Mail className="w-3 h-3 text-gray-400" />
                          {customer.email || "N/A"}
                        </div>
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

      {/* Customer Details Dialog */}
      {selectedCustomer && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden border-none shadow-2xl">
            <div className="bg-primary p-8 text-white">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-white font-black text-2xl backdrop-blur-sm">
                    {selectedCustomer.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-3xl font-black tracking-tighter">{selectedCustomer.name}</h2>
                    <p className="text-red-100 flex items-center gap-2 mt-1 font-medium">
                      <Phone className="w-4 h-4" /> {selectedCustomer.phone}
                      <span className="opacity-30">|</span>
                      <Mail className="w-4 h-4" /> {selectedCustomer.email}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge className="bg-yellow-400 text-yellow-900 border-none mb-2 font-black uppercase tracking-widest">
                    {selectedCustomer.membershipLevel} MEMBER
                  </Badge>
                  <p className="text-4xl font-black tracking-tighter">{selectedCustomer.loyaltyPoints} <span className="text-lg opacity-50">PTS</span></p>
                </div>
              </div>
            </div>

            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="w-full justify-start rounded-none border-b bg-gray-50/50 px-8 h-12">
                <TabsTrigger value="profile" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Profile</TabsTrigger>
                <TabsTrigger value="vehicles" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Vehicles ({customerVehicles.length})</TabsTrigger>
                <TabsTrigger value="pricing" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">Special Pricing</TabsTrigger>
                <TabsTrigger value="history" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-bold">History</TabsTrigger>
              </TabsList>

              <div className="p-8 max-h-[60vh] overflow-y-auto bg-white">
                <TabsContent value="profile" className="mt-0 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Default Address</Label>
                      <Input 
                        defaultValue={selectedCustomer.address} 
                        className="bg-gray-50 border-none font-medium"
                        onBlur={(e) => updateCustomer({ address: e.target.value })}
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
                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest text-gray-400">Internal Notes</Label>
                    <Textarea 
                      defaultValue={selectedCustomer.notes} 
                      className="bg-gray-50 border-none min-h-[100px] font-medium"
                      onBlur={(e) => updateCustomer({ notes: e.target.value })}
                    />
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
                        <Button variant="ghost" size="icon" className="text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
                              defaultValue={selectedCustomer.specialPricing?.[service.id]}
                              onBlur={async (e) => {
                                const val = parseFloat(e.target.value);
                                const newPricing = { ...(selectedCustomer.specialPricing || {}) };
                                if (isNaN(val)) delete newPricing[service.id];
                                else newPricing[service.id] = val;
                                await updateCustomer({ specialPricing: newPricing });
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-0">
                  <div className="text-center py-12 text-gray-400">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-bold">No service history found.</p>
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
