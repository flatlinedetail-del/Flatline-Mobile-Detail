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
import { User, Settings as SettingsIcon, Shield, Bell, CreditCard, Database, Map, Globe, DatabaseZap, Loader2, Palette, Image as ImageIcon, Layout, Truck, MapPin } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { seedDemoData } from "../services/seedData";
import { toast } from "sonner";
import AddressInput from "../components/AddressInput";
import { BusinessSettings } from "../types";

export default function Settings() {
  const { profile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
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
        } else {
          // Initialize default settings
          const defaultSettings: BusinessSettings = {
            businessName: "Flatline Mobile Detail",
            taxRate: 8.25,
            currency: "USD",
            timezone: "America/Chicago",
            commissionRate: 30,
            baseAddress: "",
            baseLatitude: 0,
            baseLongitude: 0,
            travelPricing: {
              pricePerMile: 1.5,
              freeMilesThreshold: 10,
              minTravelFee: 0,
              maxTravelFee: 100,
              roundTripToggle: true,
            }
          };
          await setDoc(docRef, defaultSettings);
          setSettings(defaultSettings);
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSaveSettings = async (newData: Partial<BusinessSettings>) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      // Merge travel pricing inputs if they exist
      const finalTravelPricing = {
        ...settings.travelPricing,
        pricePerMile: parseFloat(travelPricingInputs.pricePerMile) || 0,
        freeMilesThreshold: parseFloat(travelPricingInputs.freeMilesThreshold) || 0,
        minTravelFee: parseFloat(travelPricingInputs.minTravelFee) || 0,
        maxTravelFee: parseFloat(travelPricingInputs.maxTravelFee) || 0,
      };

      const updatedSettings = { 
        ...settings, 
        ...newData,
        travelPricing: {
          ...settings.travelPricing,
          ...(newData.travelPricing || {}),
          ...finalTravelPricing
        }
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
      </Tabs>
    </div>
  );
}
