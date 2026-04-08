import { useState, useEffect } from "react";
import { doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { User, Settings as SettingsIcon, Shield, Bell, CreditCard, Database, Map, Globe, DatabaseZap, Loader2, Palette, Image as ImageIcon, Layout, Truck, MapPin, Plus, Trash2, Edit2, Check, X, Star, Percent, DollarSign as DollarIcon, ClipboardList } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { seedDemoData } from "../services/seedData";
import { toast } from "sonner";
import AddressInput from "../components/AddressInput";
import { BusinessSettings, Service, AddOn, VehicleSize } from "../types";
import { collection, query, onSnapshot, addDoc, deleteDoc } from "firebase/firestore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const VEHICLE_SIZES: { label: string; value: VehicleSize }[] = [
  { label: "Small", value: "small" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" },
  { label: "Extra Large", value: "extra_large" },
];

export default function Settings() {
  const { profile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);
  const [addons, setAddons] = useState<AddOn[]>([]);
  const [editingService, setEditingService] = useState<Partial<Service> | null>(null);
  const [editingAddon, setEditingAddon] = useState<Partial<AddOn> | null>(null);
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [isAddonDialogOpen, setIsAddonDialogOpen] = useState(false);
  const [travelPricingInputs, setTravelPricingInputs] = useState({
    pricePerMile: "",
    freeMilesThreshold: "",
    minTravelFee: "",
    maxTravelFee: ""
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "business");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as BusinessSettings;
          setSettings(data);
          if (data.travelPricing) {
            setTravelPricingInputs({
              pricePerMile: data.travelPricing.pricePerMile.toString(),
              freeMilesThreshold: data.travelPricing.freeMilesThreshold.toString(),
              minTravelFee: data.travelPricing.minTravelFee.toString(),
              maxTravelFee: data.travelPricing.maxTravelFee.toString()
            });
          }
        } else if (profile?.role === "admin") {
          // Initialize default settings ONLY if user is admin
          const defaultSettings: BusinessSettings = {
            businessName: "Flatline Mobile Detail",
            taxRate: 8.25,
            currency: "USD",
            timezone: "America/Chicago",
            commissionRate: 30,
            commissionType: "percentage",
            baseAddress: "",
            baseLatitude: 0,
            baseLongitude: 0,
            travelPricing: {
              pricePerMile: 1.5,
              freeMilesThreshold: 10,
              minTravelFee: 0,
              maxTravelFee: 100,
              roundTripToggle: true,
            },
            loyaltySettings: {
              pointsPerDollar: 1,
              pointsPerVisit: 10,
              redemptionRate: 0.01, // 100 points = $1
              minPointsToRedeem: 100,
              stackWithCoupons: false,
            }
          };
          await setDoc(docRef, defaultSettings);
          setSettings(defaultSettings);
        }
      } catch (error: any) {
        console.error("Error fetching settings:", error);
        if (error.code === 'permission-denied') {
          toast.error("You don't have permission to access business settings.");
        } else {
          toast.error("Failed to load business settings.");
        }
      } finally {
        setLoading(false);
      }
    };
    if (profile) {
      fetchSettings();
      
      // Listen for services
      const servicesQuery = query(collection(db, "services"));
      const unsubscribeServices = onSnapshot(servicesQuery, (snapshot) => {
        setServices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service)));
      });

      // Listen for addons
      const addonsQuery = query(collection(db, "addons"));
      const unsubscribeAddons = onSnapshot(addonsQuery, (snapshot) => {
        setAddons(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AddOn)));
      });

      return () => {
        unsubscribeServices();
        unsubscribeAddons();
      };
    }
  }, [profile]);

  const handleSaveSettings = async (newData: Partial<BusinessSettings>) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      // Parse travel pricing inputs
      const pricePerMile = parseFloat(travelPricingInputs.pricePerMile);
      const freeMilesThreshold = parseFloat(travelPricingInputs.freeMilesThreshold);
      const minTravelFee = parseFloat(travelPricingInputs.minTravelFee);
      const maxTravelFee = parseFloat(travelPricingInputs.maxTravelFee);

      if (isNaN(pricePerMile) || isNaN(freeMilesThreshold) || isNaN(minTravelFee) || isNaN(maxTravelFee)) {
        toast.error("Please enter valid numbers for travel pricing.");
        setIsSaving(false);
        return;
      }

      const updatedTravelPricing = {
        ...settings.travelPricing,
        pricePerMile,
        freeMilesThreshold,
        minTravelFee,
        maxTravelFee,
        ...(newData.travelPricing || {})
      };

      const updatedSettings = { 
        ...settings, 
        ...newData,
        travelPricing: updatedTravelPricing
      };

      await updateDoc(doc(db, "settings", "business"), updatedSettings);
      setSettings(updatedSettings);
      toast.success("Settings updated successfully");
    } catch (error) {
      console.error("Error updating settings:", error);
      toast.error("Failed to update settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSeedData = async () => {
    const success = await seedDemoData();
    if (success) {
      toast.success("Demo data seeded successfully!");
    } else {
      toast.error("Failed to seed demo data.");
    }
  };

  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profile?.uid) return;
    
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const displayName = formData.get("displayName") as string;

    try {
      await updateDoc(doc(db, "users", profile.uid), { displayName });
      toast.success("Profile updated successfully");
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService?.name) return;

    try {
      if (editingService.id) {
        await setDoc(doc(db, "services", editingService.id), editingService);
        toast.success("Service updated");
      } else {
        await addDoc(collection(db, "services"), {
          ...editingService,
          isActive: true,
          pricingBySize: editingService.pricingBySize || { small: 0, medium: 0, large: 0, extra_large: 0 }
        });
        toast.success("Service added");
      }
      setIsServiceDialogOpen(false);
      setEditingService(null);
    } catch (error) {
      console.error("Error saving service:", error);
      toast.error("Failed to save service");
    }
  };

  const handleSaveAddon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAddon?.name) return;

    try {
      if (editingAddon.id) {
        await setDoc(doc(db, "addons", editingAddon.id), editingAddon);
        toast.success("Add-on updated");
      } else {
        await addDoc(collection(db, "addons"), {
          ...editingAddon,
          isActive: true
        });
        toast.success("Add-on added");
      }
      setIsAddonDialogOpen(false);
      setEditingAddon(null);
    } catch (error) {
      console.error("Error saving add-on:", error);
      toast.error("Failed to save add-on");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Settings</h1>
          <p className="text-gray-500 font-medium">Manage your account, business preferences, and integrations.</p>
        </div>
        <Button variant="outline" onClick={handleSeedData} className="border-red-200 text-primary hover:bg-red-50 font-bold">
          <DatabaseZap className="w-4 h-4 mr-2" />
          Seed Demo Data
        </Button>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-white border border-gray-200 p-1 h-12 rounded-2xl shadow-sm">
          <TabsTrigger value="profile" className="data-[state=active]:bg-accent data-[state=active]:text-primary h-10 px-6 rounded-xl font-bold">
            <User className="w-4 h-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="business" className="data-[state=active]:bg-accent data-[state=active]:text-primary h-10 px-6 rounded-xl font-bold">
            <Globe className="w-4 h-4 mr-2" />
            Business
          </TabsTrigger>
          <TabsTrigger value="branding" className="data-[state=active]:bg-accent data-[state=active]:text-primary h-10 px-6 rounded-xl font-bold">
            <Palette className="w-4 h-4 mr-2" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="integrations" className="data-[state=active]:bg-accent data-[state=active]:text-primary h-10 px-6 rounded-xl font-bold">
            <Database className="w-4 h-4 mr-2" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="security" className="data-[state=active]:bg-accent data-[state=active]:text-primary h-10 px-6 rounded-xl font-bold">
            <Shield className="w-4 h-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="services" className="data-[state=active]:bg-accent data-[state=active]:text-primary h-10 px-6 rounded-xl font-bold">
            <ClipboardList className="w-4 h-4 mr-2" />
            Services
          </TabsTrigger>
          <TabsTrigger value="loyalty" className="data-[state=active]:bg-accent data-[state=active]:text-primary h-10 px-6 rounded-xl font-bold">
            <Star className="w-4 h-4 mr-2" />
            Loyalty
          </TabsTrigger>
          <TabsTrigger value="commission" className="data-[state=active]:bg-accent data-[state=active]:text-primary h-10 px-6 rounded-xl font-bold">
            <Percent className="w-4 h-4 mr-2" />
            Commission
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveProfile} className="space-y-6">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-gray-100 rounded-2xl overflow-hidden border-4 border-white shadow-sm">
                    {profile?.photoURL && <img src={profile.photoURL} alt="" referrerPolicy="no-referrer" />}
                  </div>
                  <Button variant="outline" type="button">Change Photo</Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input id="displayName" name="displayName" defaultValue={profile?.displayName} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" defaultValue={profile?.email} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Input id="role" defaultValue={profile?.role} disabled className="capitalize bg-gray-50 border-none font-bold" />
                  </div>
                </div>
                <Button type="submit" className="bg-primary hover:bg-red-700 font-bold" disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="business">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle>Business Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input 
                    id="businessName" 
                    value={settings?.businessName || ""} 
                    onChange={(e) => setSettings(prev => prev ? { ...prev, businessName: e.target.value } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxRate">Default Tax Rate (%)</Label>
                  <Input 
                    id="taxRate" 
                    type="number" 
                    value={settings?.taxRate || 0} 
                    onChange={(e) => setSettings(prev => prev ? { ...prev, taxRate: parseFloat(e.target.value) } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input id="currency" value={settings?.currency || "USD"} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input 
                    id="timezone" 
                    value={settings?.timezone || ""} 
                    onChange={(e) => setSettings(prev => prev ? { ...prev, timezone: e.target.value } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commissionRate">Default Technician Commission (%)</Label>
                  <Input 
                    id="commissionRate" 
                    type="number" 
                    value={settings?.commissionRate || 0} 
                    onChange={(e) => setSettings(prev => prev ? { ...prev, commissionRate: parseFloat(e.target.value) } : null)}
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100">
                <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-primary" />
                  Mileage & Travel Pricing
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 col-span-2">
                    <Label>Business Base Address (for distance calculation)</Label>
                    <AddressInput 
                      defaultValue={settings?.baseAddress}
                      onAddressSelect={(address, lat, lng) => setSettings(prev => prev ? { ...prev, baseAddress: address, baseLatitude: lat, baseLongitude: lng } : null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pricePerMile">Price Per Mile ($)</Label>
                    <Input 
                      id="pricePerMile" 
                      type="text" 
                      inputMode="decimal"
                      placeholder="e.g. 1.50"
                      value={travelPricingInputs.pricePerMile} 
                      onChange={(e) => setTravelPricingInputs(prev => ({ ...prev, pricePerMile: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="freeMilesThreshold">Free Miles Threshold (one way)</Label>
                    <Input 
                      id="freeMilesThreshold" 
                      type="text" 
                      inputMode="decimal"
                      placeholder="e.g. 10"
                      value={travelPricingInputs.freeMilesThreshold} 
                      onChange={(e) => setTravelPricingInputs(prev => ({ ...prev, freeMilesThreshold: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minTravelFee">Minimum Travel Fee ($)</Label>
                    <Input 
                      id="minTravelFee" 
                      type="text" 
                      inputMode="decimal"
                      placeholder="e.g. 0"
                      value={travelPricingInputs.minTravelFee} 
                      onChange={(e) => setTravelPricingInputs(prev => ({ ...prev, minTravelFee: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxTravelFee">Maximum Travel Fee ($)</Label>
                    <Input 
                      id="maxTravelFee" 
                      type="text" 
                      inputMode="decimal"
                      placeholder="e.g. 100"
                      value={travelPricingInputs.maxTravelFee} 
                      onChange={(e) => setTravelPricingInputs(prev => ({ ...prev, maxTravelFee: e.target.value }))}
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl col-span-2">
                    <div className="space-y-0.5">
                      <Label className="text-base font-bold">Round Trip Pricing</Label>
                      <p className="text-sm text-gray-500">Calculate fee based on total distance (to and from base).</p>
                    </div>
                    <Switch 
                      checked={settings?.travelPricing.roundTripToggle || false} 
                      onCheckedChange={(checked) => setSettings(prev => prev ? { 
                        ...prev, 
                        travelPricing: { ...prev.travelPricing, roundTripToggle: checked } 
                      } : null)}
                    />
                  </div>
                </div>
              </div>

              <Button 
                onClick={() => handleSaveSettings(settings || {})} 
                className="bg-primary hover:bg-red-700 font-bold"
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Business Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle className="text-xl font-black tracking-tighter">Branding & Document Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-bold">Show Logo on Documents</Label>
                    <p className="text-sm text-gray-500">Include your official logo on invoices, quotes, and reports.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-bold">Watermark Logo</Label>
                    <p className="text-sm text-gray-500">Add a subtle watermark to the background of PDF exports.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-base font-bold">Logo Size in Documents</Label>
                <div className="pt-2">
                  <Slider defaultValue={[50]} max={100} step={1} />
                </div>
                <div className="flex justify-between text-xs text-gray-400 font-bold uppercase tracking-widest">
                  <span>Small</span>
                  <span>Medium</span>
                  <span>Large</span>
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-base font-bold">Header Layout Style</Label>
                <div className="grid grid-cols-3 gap-4">
                  <Button variant="outline" className="h-20 flex flex-col gap-2 border-red-100 bg-red-50/50 text-primary">
                    <Layout className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase">Left Aligned</span>
                  </Button>
                  <Button variant="outline" className="h-20 flex flex-col gap-2 border-gray-100">
                    <Layout className="w-5 h-5 rotate-90" />
                    <span className="text-[10px] font-black uppercase">Centered</span>
                  </Button>
                  <Button variant="outline" className="h-20 flex flex-col gap-2 border-gray-100">
                    <Layout className="w-5 h-5 rotate-180" />
                    <span className="text-[10px] font-black uppercase">Right Aligned</span>
                  </Button>
                </div>
              </div>

              <Button className="w-full bg-primary hover:bg-red-700 font-black uppercase tracking-widest h-12">
                Update Branding Preferences
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-50 rounded-lg text-primary">
                    <Map className="w-5 h-5" />
                  </div>
                  <CardTitle className="text-lg font-black">Google Maps</CardTitle>
                </div>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-black uppercase text-[10px]">Connected</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-4 font-medium">Used for route optimization, geocoding, and travel fee calculations.</p>
                <Button variant="outline" className="w-full font-bold">Configure API Key</Button>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-black rounded-lg text-white">
                    <Database className="w-5 h-5" />
                  </div>
                  <CardTitle className="text-lg font-black">NHTSA VIN Lookup</CardTitle>
                </div>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-black uppercase text-[10px]">Active</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-4 font-medium">Automatically decode VINs to get vehicle year, make, model, and size class.</p>
                <Button variant="outline" className="w-full font-bold">Settings</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="services">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Services</CardTitle>
                  <CardDescription>Manage your primary detailing packages.</CardDescription>
                </div>
                <Button size="sm" className="bg-primary hover:bg-red-700 font-bold" onClick={() => {
                  setEditingService({
                    name: "",
                    description: "",
                    category: "interior",
                    basePrice: 0,
                    pricingBySize: { small: 0, medium: 0, large: 0, extra_large: 0 },
                    isTaxable: true,
                    estimatedDuration: 60,
                    requiresWaiver: false,
                    isActive: true
                  });
                  setIsServiceDialogOpen(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" /> Add Service
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {services.map(service => (
                  <div key={service.id} className="p-4 border border-gray-100 rounded-xl hover:border-red-100 transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-gray-900">{service.name}</h4>
                        {!service.isActive && <Badge variant="secondary" className="text-[10px] uppercase">Inactive</Badge>}
                        <Badge variant="outline" className="text-[10px] uppercase">{service.category}</Badge>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-gray-400 hover:text-primary"
                          onClick={() => {
                            setEditingService(service);
                            setIsServiceDialogOpen(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={() => {
                          if (confirm("Are you sure you want to delete this service?")) {
                            deleteDoc(doc(db, "services", service.id));
                          }
                        }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="text-gray-500">Base Price: <span className="font-bold text-gray-900">${service.basePrice}</span></div>
                      <div className="text-gray-500">Duration: <span className="font-bold text-gray-900">{service.estimatedDuration}m</span></div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Add-ons</CardTitle>
                  <CardDescription>Extra services that can be added to any package.</CardDescription>
                </div>
                <Button size="sm" className="bg-black hover:bg-gray-900 font-bold" onClick={() => {
                  setEditingAddon({
                    name: "",
                    description: "",
                    price: 0,
                    isTaxable: true,
                    estimatedDuration: 15,
                    isActive: true
                  });
                  setIsAddonDialogOpen(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" /> Add Add-on
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {addons.map(addon => (
                  <div key={addon.id} className="p-4 border border-gray-100 rounded-xl hover:border-red-100 transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-gray-900">{addon.name}</h4>
                        {!addon.isActive && <Badge variant="secondary" className="text-[10px] uppercase">Inactive</Badge>}
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-gray-400 hover:text-primary"
                          onClick={() => {
                            setEditingAddon(addon);
                            setIsAddonDialogOpen(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={() => {
                          if (confirm("Are you sure you want to delete this add-on?")) {
                            deleteDoc(doc(db, "addons", addon.id));
                          }
                        }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="text-gray-500">Price: <span className="font-bold text-gray-900">${addon.price}</span></div>
                      <div className="text-gray-500">Duration: <span className="font-bold text-gray-900">{addon.estimatedDuration}m</span></div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Service Dialog */}
          <Dialog open={isServiceDialogOpen} onOpenChange={setIsServiceDialogOpen}>
            <DialogContent className="max-w-2xl bg-white">
              <DialogHeader>
                <DialogTitle>{editingService?.id ? "Edit Service" : "Add New Service"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSaveService} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label>Service Name</Label>
                    <Input 
                      value={editingService?.name || ""} 
                      onChange={e => setEditingService(prev => ({ ...prev!, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>Description</Label>
                    <Textarea 
                      value={editingService?.description || ""} 
                      onChange={e => setEditingService(prev => ({ ...prev!, description: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select 
                      value={editingService?.category || "interior"} 
                      onValueChange={(v: any) => setEditingService(prev => ({ ...prev!, category: v }))}
                    >
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="interior">Interior</SelectItem>
                        <SelectItem value="exterior">Exterior</SelectItem>
                        <SelectItem value="protection">Protection</SelectItem>
                        <SelectItem value="correction">Correction</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Base Price ($)</Label>
                    <Input 
                      type="number"
                      value={editingService?.basePrice || 0} 
                      onChange={e => setEditingService(prev => ({ ...prev!, basePrice: parseFloat(e.target.value) }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (minutes)</Label>
                    <Input 
                      type="number"
                      value={editingService?.estimatedDuration || 0} 
                      onChange={e => setEditingService(prev => ({ ...prev!, estimatedDuration: parseInt(e.target.value) }))}
                      required
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <Label>Taxable</Label>
                    <Switch 
                      checked={editingService?.isTaxable ?? true} 
                      onCheckedChange={v => setEditingService(prev => ({ ...prev!, isTaxable: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <Label>Requires Waiver</Label>
                    <Switch 
                      checked={editingService?.requiresWaiver ?? false} 
                      onCheckedChange={v => setEditingService(prev => ({ ...prev!, requiresWaiver: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <Label>Active</Label>
                    <Switch 
                      checked={editingService?.isActive ?? true} 
                      onCheckedChange={v => setEditingService(prev => ({ ...prev!, isActive: v }))}
                    />
                  </div>

                  <div className="col-span-2 space-y-3 pt-4 border-t border-gray-100">
                    <Label className="font-bold">Pricing by Vehicle Size</Label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {VEHICLE_SIZES.map(size => (
                        <div key={size.value} className="space-y-1">
                          <Label className="text-[10px] uppercase text-gray-400">{size.label}</Label>
                          <Input 
                            type="number"
                            className="h-8 text-xs"
                            value={editingService?.pricingBySize?.[size.value] || 0}
                            onChange={e => setEditingService(prev => ({
                              ...prev!,
                              pricingBySize: {
                                ...(prev?.pricingBySize || { small: 0, medium: 0, large: 0, extra_large: 0 }),
                                [size.value]: parseFloat(e.target.value)
                              }
                            }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsServiceDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" className="bg-primary hover:bg-red-700 font-bold">Save Service</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Add-on Dialog */}
          <Dialog open={isAddonDialogOpen} onOpenChange={setIsAddonDialogOpen}>
            <DialogContent className="max-w-md bg-white">
              <DialogHeader>
                <DialogTitle>{editingAddon?.id ? "Edit Add-on" : "Add New Add-on"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSaveAddon} className="space-y-4">
                <div className="space-y-2">
                  <Label>Add-on Name</Label>
                  <Input 
                    value={editingAddon?.name || ""} 
                    onChange={e => setEditingAddon(prev => ({ ...prev!, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea 
                    value={editingAddon?.description || ""} 
                    onChange={e => setEditingAddon(prev => ({ ...prev!, description: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Price ($)</Label>
                    <Input 
                      type="number"
                      value={editingAddon?.price || 0} 
                      onChange={e => setEditingAddon(prev => ({ ...prev!, price: parseFloat(e.target.value) }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (min)</Label>
                    <Input 
                      type="number"
                      value={editingAddon?.estimatedDuration || 0} 
                      onChange={e => setEditingAddon(prev => ({ ...prev!, estimatedDuration: parseInt(e.target.value) }))}
                      required
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <Label>Taxable</Label>
                  <Switch 
                    checked={editingAddon?.isTaxable ?? true} 
                    onCheckedChange={v => setEditingAddon(prev => ({ ...prev!, isTaxable: v }))}
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <Label>Active</Label>
                  <Switch 
                    checked={editingAddon?.isActive ?? true} 
                    onCheckedChange={v => setEditingAddon(prev => ({ ...prev!, isActive: v }))}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddonDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" className="bg-primary hover:bg-red-700 font-bold">Save Add-on</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="loyalty">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle>Loyalty Program Settings</CardTitle>
              <CardDescription>Configure how customers earn and redeem points.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Points Per Dollar Spent</Label>
                  <Input 
                    type="number" 
                    value={settings?.loyaltySettings?.pointsPerDollar || 0} 
                    onChange={(e) => setSettings(prev => prev ? { 
                      ...prev, 
                      loyaltySettings: { ...prev.loyaltySettings, pointsPerDollar: parseFloat(e.target.value) } 
                    } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Points Per Visit</Label>
                  <Input 
                    type="number" 
                    value={settings?.loyaltySettings?.pointsPerVisit || 0} 
                    onChange={(e) => setSettings(prev => prev ? { 
                      ...prev, 
                      loyaltySettings: { ...prev.loyaltySettings, pointsPerVisit: parseFloat(e.target.value) } 
                    } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Redemption Rate ($ per point)</Label>
                  <Input 
                    type="number" 
                    step="0.001"
                    value={settings?.loyaltySettings?.redemptionRate || 0} 
                    onChange={(e) => setSettings(prev => prev ? { 
                      ...prev, 
                      loyaltySettings: { ...prev.loyaltySettings, redemptionRate: parseFloat(e.target.value) } 
                    } : null)}
                  />
                  <p className="text-[10px] text-gray-500 font-medium">Example: 0.01 means 100 points = $1.00</p>
                </div>
                <div className="space-y-2">
                  <Label>Minimum Points to Redeem</Label>
                  <Input 
                    type="number" 
                    value={settings?.loyaltySettings?.minPointsToRedeem || 0} 
                    onChange={(e) => setSettings(prev => prev ? { 
                      ...prev, 
                      loyaltySettings: { ...prev.loyaltySettings, minPointsToRedeem: parseFloat(e.target.value) } 
                    } : null)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="space-y-0.5">
                  <Label className="text-base font-bold">Stack with Coupons</Label>
                  <p className="text-sm text-gray-500">Allow customers to use points and coupons on the same order.</p>
                </div>
                <Switch 
                  checked={settings?.loyaltySettings?.stackWithCoupons || false} 
                  onCheckedChange={(checked) => setSettings(prev => prev ? { 
                    ...prev, 
                    loyaltySettings: { ...prev.loyaltySettings, stackWithCoupons: checked } 
                  } : null)}
                />
              </div>
              <Button onClick={() => handleSaveSettings(settings || {})} className="bg-primary hover:bg-red-700 font-bold">
                Save Loyalty Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commission">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle>Commission Settings</CardTitle>
              <CardDescription>Set default technician payouts for completed jobs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Default Commission Type</Label>
                  <Select 
                    value={settings?.commissionType || "percentage"} 
                    onValueChange={(val: "percentage" | "flat") => setSettings(prev => prev ? { ...prev, commissionType: val } : null)}
                  >
                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="flat">Flat Fee ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Default Commission Rate</Label>
                  <div className="relative">
                    <Input 
                      type="number" 
                      value={settings?.commissionRate || 0} 
                      onChange={(e) => setSettings(prev => prev ? { ...prev, commissionRate: parseFloat(e.target.value) } : null)}
                      className="pl-8"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {settings?.commissionType === "percentage" ? <Percent className="w-4 h-4" /> : <DollarIcon className="w-4 h-4" />}
                    </div>
                  </div>
                </div>
              </div>
              <Button onClick={() => handleSaveSettings(settings || {})} className="bg-primary hover:bg-red-700 font-bold">
                Save Commission Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
