import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { User, Settings as SettingsIcon, Shield, Bell, CreditCard, Database, Map, Globe, DatabaseZap, Loader2 } from "lucide-react";
import { seedDemoData } from "../services/seedData";
import { toast } from "sonner";

export default function Settings() {
  const { profile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

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
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Settings</h1>
          <p className="text-gray-500">Manage your account, business preferences, and integrations.</p>
        </div>
        <Button variant="outline" onClick={handleSeedData} className="border-blue-200 text-blue-700 hover:bg-blue-50">
          <DatabaseZap className="w-4 h-4 mr-2" />
          Seed Demo Data
        </Button>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-white border border-gray-200 p-1 h-12">
          <TabsTrigger value="profile" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 h-10 px-6">
            <User className="w-4 h-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="business" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 h-10 px-6">
            <Globe className="w-4 h-4 mr-2" />
            Business
          </TabsTrigger>
          <TabsTrigger value="integrations" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 h-10 px-6">
            <Database className="w-4 h-4 mr-2" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="security" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 h-10 px-6">
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
                    <Input id="role" defaultValue={profile?.role} disabled className="capitalize" />
                  </div>
                </div>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isSaving}>
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
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input id="businessName" defaultValue="Flatline Mobile Detail" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxRate">Default Tax Rate (%)</Label>
                  <Input id="taxRate" type="number" defaultValue="8.25" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input id="currency" defaultValue="USD ($)" disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input id="timezone" defaultValue="America/Chicago" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commissionRate">Default Technician Commission (%)</Label>
                  <Input id="commissionRate" type="number" defaultValue="30" />
                </div>
              </div>
              <Button className="bg-blue-600 hover:bg-blue-700">Update Business Info</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                    <Map className="w-5 h-5" />
                  </div>
                  <CardTitle className="text-lg">Google Maps</CardTitle>
                </div>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Connected</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-4">Used for route optimization, geocoding, and travel fee calculations.</p>
                <Button variant="outline" className="w-full">Configure API Key</Button>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-50 rounded-lg text-orange-600">
                    <Database className="w-5 h-5" />
                  </div>
                  <CardTitle className="text-lg">NHTSA VIN Lookup</CardTitle>
                </div>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-4">Automatically decode VINs to get vehicle year, make, model, and size class.</p>
                <Button variant="outline" className="w-full">Settings</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
