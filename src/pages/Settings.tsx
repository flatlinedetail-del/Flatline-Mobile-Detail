import { useState, useEffect, useRef } from "react";
import { doc, updateDoc, getDoc, setDoc, collection, query, onSnapshot, addDoc, deleteDoc, orderBy, Timestamp, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  User, Settings as SettingsIcon, Shield, Bell, CreditCard, Database, Map as MapIcon, Globe, 
  DatabaseZap, Loader2, Palette, Image as ImageIcon, Layout, Truck, MapPin, Plus, 
  Trash2, Edit2, Check, X, Star, Percent, DollarSign as DollarIcon, ClipboardList, 
  Tag, Ticket, Lock, Eye, EyeOff, Users, ShieldAlert, Upload, ChevronRight, Menu
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { seedDemoData } from "../services/seedData";
import { toast } from "sonner";
import { format } from "date-fns";
import { useSearchParams } from "react-router-dom";
import AddressInput from "../components/AddressInput";
import { StableInput } from "../components/StableInput";
import { StableTextarea } from "../components/StableTextarea";
import { formatPhoneNumber } from "../lib/utils";
import { BusinessSettings, Service, AddOn, VehicleSize, Category, CategoryType, Coupon } from "../types";
import { migrateDataToClients } from "../services/clientService";
import { processFollowUps } from "../services/automationService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { GripVertical, ArrowUp, ArrowDown } from "lucide-react";

const VEHICLE_SIZES: { label: string; value: VehicleSize }[] = [
  { label: "Small", value: "small" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" },
  { label: "Extra Large", value: "extra_large" },
];

export default function Settings() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "profile";
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);
  const [addons, setAddons] = useState<AddOn[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [clientTypes, setClientTypes] = useState<any[]>([]);
  const [clientCategories, setClientCategories] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [isStaffDialogOpen, setIsStaffDialogOpen] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("technician");
  const [editingService, setEditingService] = useState<Partial<Service> | null>(null);
  const [editingAddon, setEditingAddon] = useState<Partial<AddOn> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [editingCoupon, setEditingCoupon] = useState<Partial<Coupon> | null>(null);
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [isAddonDialogOpen, setIsAddonDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isCouponDialogOpen, setIsCouponDialogOpen] = useState(false);
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
            },
            automationSettings: {
              followUpEnabled: true,
              delayHours: 24,
              channels: "email",
              includeReviewLink: true,
              googleReviewUrl: "",
              emailSubject: "How was your service?",
              emailBody: "Hi {{firstName}}, thank you for choosing us! How was your service today?",
              smsBody: "Hi {{firstName}}, thanks for choosing us! How was your service? Reply STOP to opt out."
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

      // Listen for categories
      const categoriesQuery = query(collection(db, "categories"), orderBy("sortOrder", "asc"));
      const unsubscribeCategories = onSnapshot(categoriesQuery, (snapshot) => {
        const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
        setCategories(cats);
        
        // Seed default categories if none exist
        if (cats.length === 0 && profile?.role === "admin") {
          const defaultCategories: Partial<Category>[] = [
            { name: "Interior", type: "service", isActive: true, sortOrder: 0 },
            { name: "Exterior", type: "service", isActive: true, sortOrder: 1 },
            { name: "Protection", type: "service", isActive: true, sortOrder: 2 },
            { name: "Correction", type: "service", isActive: true, sortOrder: 3 },
            { name: "Add-ons", type: "addon", isActive: true, sortOrder: 0 },
            { name: "Fuel", type: "expense", isActive: true, sortOrder: 0 },
            { name: "Supplies", type: "expense", isActive: true, sortOrder: 1 },
            { name: "Marketing", type: "expense", isActive: true, sortOrder: 2 },
            { name: "Insurance", type: "expense", isActive: true, sortOrder: 3 },
          ];
          defaultCategories.forEach(cat => addDoc(collection(db, "categories"), cat));
        }
      });

      // Listen for coupons
      const couponsQuery = query(collection(db, "coupons"));
      const unsubscribeCoupons = onSnapshot(couponsQuery, (snapshot) => {
        setCoupons(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Coupon)));
      });

      const unsubClientTypes = onSnapshot(query(collection(db, "client_types"), orderBy("sortOrder", "asc")), (snapshot) => {
        const types = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        // Ensure unique types by slug in the listener
        const uniqueTypes = Array.from(new Map(types.map(t => [t.slug, t])).values());
        setClientTypes(uniqueTypes);
      });

      const unsubClientCategories = onSnapshot(query(collection(db, "client_categories"), orderBy("name", "asc")), (snapshot) => {
        const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        // Ensure unique categories by name
        const uniqueCats = Array.from(new Map(cats.map(c => [c.name, c])).values());
        setClientCategories(uniqueCats);
      });

      const unsubStaff = onSnapshot(query(collection(db, "users"), orderBy("displayName", "asc")), (snapshot) => {
        setStaff(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      return () => {
        unsubscribeServices();
        unsubscribeAddons();
        unsubscribeCategories();
        unsubscribeCoupons();
        unsubClientTypes();
        unsubClientCategories();
        unsubStaff();
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

  const handleAddStaff = async () => {
    if (!newStaffEmail) return;
    try {
      await addDoc(collection(db, "staff_authorizations"), {
        email: newStaffEmail.toLowerCase(),
        role: newStaffRole,
        createdAt: serverTimestamp()
      });
      toast.success("Staff member authorized. They can now sign in.");
      setIsStaffDialogOpen(false);
      setNewStaffEmail("");
    } catch (error) {
      console.error("Error adding staff:", error);
      toast.error("Failed to authorize staff");
    }
  };

  const handleUpdateStaffRole = async (staffId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, "users", staffId), { role: newRole });
      toast.success("Staff role updated");
    } catch (error) {
      console.error("Error updating staff role:", error);
      toast.error("Failed to update staff role");
    }
  };

  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profile?.uid) return;
    
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const displayName = formData.get("displayName") as string;
    const email = formData.get("email") as string;
    const role = formData.get("role") as string;

    try {
      const updates: any = { displayName, email };
      // Only admins can change roles
      if (profile.role === "admin") {
        updates.role = role;
      }
      
      await updateDoc(doc(db, "users", profile.uid), updates);
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

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory?.name || !editingCategory?.type) return;

    try {
      if (editingCategory.id) {
        await setDoc(doc(db, "categories", editingCategory.id), editingCategory);
        toast.success("Category updated");
      } else {
        await addDoc(collection(db, "categories"), {
          ...editingCategory,
          isActive: true,
          sortOrder: categories.filter(c => c.type === editingCategory.type).length
        });
        toast.success("Category added");
      }
      setIsCategoryDialogOpen(false);
      setEditingCategory(null);
    } catch (error) {
      console.error("Error saving category:", error);
      toast.error("Failed to save category");
    }
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoupon?.code || !editingCoupon?.discountType || editingCoupon?.discountValue === undefined) return;

    try {
      if (editingCoupon.id) {
        await setDoc(doc(db, "coupons", editingCoupon.id), editingCoupon);
        toast.success("Coupon updated");
      } else {
        await addDoc(collection(db, "coupons"), {
          ...editingCoupon,
          usageCount: 0,
          isActive: true
        });
        toast.success("Coupon added");
      }
      setIsCouponDialogOpen(false);
      setEditingCoupon(null);
    } catch (error) {
      console.error("Error saving coupon:", error);
      toast.error("Failed to save coupon");
    }
  };

  const handleReorderCategory = async (id: string, direction: "up" | "down") => {
    const category = categories.find(c => c.id === id);
    if (!category) return;

    const sameTypeCats = categories.filter(c => c.type === category.type);
    const index = sameTypeCats.findIndex(c => c.id === id);
    
    if (direction === "up" && index > 0) {
      const prev = sameTypeCats[index - 1];
      await updateDoc(doc(db, "categories", category.id), { sortOrder: prev.sortOrder });
      await updateDoc(doc(db, "categories", prev.id), { sortOrder: category.sortOrder });
    } else if (direction === "down" && index < sameTypeCats.length - 1) {
      const next = sameTypeCats[index + 1];
      await updateDoc(doc(db, "categories", category.id), { sortOrder: next.sortOrder });
      await updateDoc(doc(db, "categories", next.id), { sortOrder: category.sortOrder });
    }
  };

  const handleDeleteCategory = async (id: string) => {
    const category = categories.find(c => c.id === id);
    if (!category) return;

    // Check if in use
    const isServiceInUse = services.some(s => s.category === category.name);
    const isAddonInUse = addons.some(a => (a as any).category === category.name);
    
    if (isServiceInUse || isAddonInUse) {
      if (!confirm(`This category is currently being used by services or add-ons. Deleting it may cause issues. Are you sure you want to proceed?`)) {
        return;
      }
    } else {
      if (!confirm("Are you sure you want to delete this category?")) return;
    }

    try {
      await deleteDoc(doc(db, "categories", id));
      toast.success("Category deleted");
    } catch (error) {
      toast.error("Failed to delete category");
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file.");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be less than 2MB.");
      return;
    }

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `branding/logo_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      await handleSaveSettings({ logoUrl: downloadURL });
      toast.success("Logo uploaded successfully!");
    } catch (error) {
      console.error("Logo upload error:", error);
      toast.error("Failed to upload logo.");
    } finally {
      setIsUploading(false);
    }
  };

  const isAdminOrManager = profile?.role === "admin" || profile?.role === "manager";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Settings</h1>
          <p className="text-gray-500 font-medium">Manage your business profile, staff, and system preferences.</p>
        </div>
        <Button variant="outline" onClick={handleSeedData} className="border-red-200 text-primary hover:bg-red-50 font-bold">
          <DatabaseZap className="w-4 h-4 mr-2" />
          Seed Demo Data
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-64 shrink-0">
          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <TabsList className="flex flex-col h-auto bg-transparent p-2 space-y-1">
              <TabsTrigger 
                value="profile" 
                className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-red-50 data-[state=active]:text-primary rounded-xl transition-all"
              >
                <User className="w-4 h-4" />
                <span className="font-bold">Personal Info</span>
              </TabsTrigger>
              {isAdminOrManager && (
                <>
                  <TabsTrigger 
                    value="business" 
                    className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-red-50 data-[state=active]:text-primary rounded-xl transition-all"
                  >
                    <Globe className="w-4 h-4" />
                    <span className="font-bold">Business Profile</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="branding" 
                    className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-red-50 data-[state=active]:text-primary rounded-xl transition-all"
                  >
                    <Palette className="w-4 h-4" />
                    <span className="font-bold">Branding</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="staff" 
                    className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-red-50 data-[state=active]:text-primary rounded-xl transition-all"
                  >
                    <Users className="w-4 h-4" />
                    <span className="font-bold">Staff Management</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="client-management" 
                    className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-red-50 data-[state=active]:text-primary rounded-xl transition-all"
                  >
                    <DatabaseZap className="w-4 h-4" />
                    <span className="font-bold">Client Settings</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="services" 
                    className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-red-50 data-[state=active]:text-primary rounded-xl transition-all"
                  >
                    <ClipboardList className="w-4 h-4" />
                    <span className="font-bold">Services & Add-ons</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="coupons" 
                    className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-red-50 data-[state=active]:text-primary rounded-xl transition-all"
                  >
                    <Ticket className="w-4 h-4" />
                    <span className="font-bold">Coupons</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="automation" 
                    className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-red-50 data-[state=active]:text-primary rounded-xl transition-all"
                  >
                    <DatabaseZap className="w-4 h-4" />
                    <span className="font-bold">Automation</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="security" 
                    className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-red-50 data-[state=active]:text-primary rounded-xl transition-all"
                  >
                    <Shield className="w-4 h-4" />
                    <span className="font-bold">Security</span>
                  </TabsTrigger>
                </>
              )}
            </TabsList>
          </Card>
        </div>

        <div className="flex-1 min-w-0">

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
                    <StableInput 
                      id="displayName" 
                      value={profile?.displayName || ""} 
                      onValueChange={async (val) => {
                        if (profile?.uid) {
                          await updateDoc(doc(db, "users", profile.uid), { displayName: val });
                          toast.success("Name updated");
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" name="email" defaultValue={profile?.email} placeholder="email@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    {profile?.role === "admin" ? (
                      <Select name="role" defaultValue={profile?.role}>
                        <SelectTrigger className="bg-white border-gray-200 font-bold capitalize">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="technician">Technician</SelectItem>
                          <SelectItem value="office">Office</SelectItem>
                          <SelectItem value="read-only">Read-only</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                        <Shield className="w-4 h-4 text-gray-400" />
                        <span className="font-bold text-gray-600 capitalize">{profile?.role}</span>
                        <input type="hidden" name="role" value={profile?.role || ""} />
                        <Badge variant="outline" className="ml-auto text-[10px] uppercase">Contact Admin to Change</Badge>
                      </div>
                    )}
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

        <TabsContent value="staff">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Staff Management</CardTitle>
                <CardDescription>Manage your team members and their access levels.</CardDescription>
              </div>
              <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
                <DialogTrigger render={
                  <Button className="bg-primary hover:bg-red-700 font-bold">
                    <Plus className="w-4 h-4 mr-2" /> Add Staff
                  </Button>
                } />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-black">Authorize New Staff Member</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="staffEmail">Google Email Address</Label>
                      <Input 
                        id="staffEmail" 
                        placeholder="staff@gmail.com" 
                        value={newStaffEmail} 
                        onChange={(e) => setNewStaffEmail(e.target.value)} 
                      />
                      <p className="text-xs text-gray-400">The user must sign in with this Google account.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="staffRole">Initial Role</Label>
                      <Select value={newStaffRole} onValueChange={setNewStaffRole}>
                        <SelectTrigger className="font-bold capitalize">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="technician">Technician</SelectItem>
                          <SelectItem value="office">Office</SelectItem>
                          <SelectItem value="read-only">Read-only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsStaffDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddStaff} className="bg-primary font-bold">Authorize Staff</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {staff.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm flex items-center justify-center">
                        {member.photoURL ? (
                          <img src={member.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User className="w-6 h-6 text-gray-300" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{member.displayName || "New User"}</p>
                        <p className="text-xs text-gray-500 font-medium">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Select 
                        defaultValue={member.role} 
                        onValueChange={(val) => handleUpdateStaffRole(member.id, val)}
                        disabled={member.email === "flatlinedetail@gmail.com"}
                      >
                        <SelectTrigger className="w-[140px] bg-white border-gray-200 font-bold capitalize h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="technician">Technician</SelectItem>
                          <SelectItem value="office">Office</SelectItem>
                          <SelectItem value="read-only">Read-only</SelectItem>
                        </SelectContent>
                      </Select>
                      {member.email !== "flatlinedetail@gmail.com" && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={async () => {
                            if (confirm(`Remove ${member.displayName || member.email} from staff?`)) {
                              await deleteDoc(doc(db, "users", member.id));
                              toast.success("Staff member removed");
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="business">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle>Business Configuration</CardTitle>
              <CardDescription>Manage your business details and travel pricing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <StableInput 
                    id="businessName" 
                    value={settings?.businessName || ""} 
                    onValueChange={(val) => handleSaveSettings({ businessName: val })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessEmail">Business Email</Label>
                  <StableInput 
                    id="businessEmail" 
                    type="email"
                    value={settings?.businessEmail || ""} 
                    onValueChange={(val) => handleSaveSettings({ businessEmail: val })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessPhone">Business Phone</Label>
                  <StableInput 
                    id="businessPhone" 
                    value={settings?.businessPhone || ""} 
                    onValueChange={(val) => handleSaveSettings({ businessPhone: val })}
                    formatOnBlur={formatPhoneNumber}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxRate">Default Tax Rate (%)</Label>
                  <StableInput 
                    id="taxRate" 
                    type="text"
                    inputMode="decimal"
                    value={settings?.taxRate?.toString() || "0"} 
                    onValueChange={(val) => handleSaveSettings({ taxRate: parseFloat(val) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input id="currency" value={settings?.currency || "USD"} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <StableInput 
                    id="timezone" 
                    value={settings?.timezone || ""} 
                    onValueChange={(val) => handleSaveSettings({ timezone: val })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commissionRate">Default Technician Commission (%)</Label>
                  <StableInput 
                    id="commissionRate" 
                    type="text"
                    inputMode="decimal"
                    value={settings?.commissionRate?.toString() || ""} 
                    onValueChange={(val) => handleSaveSettings({ commissionRate: parseFloat(val) || 0 })}
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
                      onAddressSelect={(address, lat, lng) => handleSaveSettings({ baseAddress: address, baseLatitude: lat, baseLongitude: lng })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pricePerMile">Price Per Mile ($)</Label>
                    <StableInput 
                      id="pricePerMile" 
                      type="text" 
                      inputMode="decimal"
                      placeholder="e.g. 1.50"
                      value={travelPricingInputs.pricePerMile} 
                      onValueChange={(val) => {
                        setTravelPricingInputs(prev => ({ ...prev, pricePerMile: val }));
                        if (settings) {
                          handleSaveSettings({ travelPricing: { ...settings.travelPricing, pricePerMile: parseFloat(val) || 0 } });
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="freeMilesThreshold">Free Miles Threshold (one way)</Label>
                    <StableInput 
                      id="freeMilesThreshold" 
                      type="text" 
                      inputMode="decimal"
                      placeholder="e.g. 10"
                      value={travelPricingInputs.freeMilesThreshold} 
                      onValueChange={(val) => {
                        setTravelPricingInputs(prev => ({ ...prev, freeMilesThreshold: val }));
                        if (settings) {
                          handleSaveSettings({ travelPricing: { ...settings.travelPricing, freeMilesThreshold: parseFloat(val) || 0 } });
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minTravelFee">Minimum Travel Fee ($)</Label>
                    <StableInput 
                      id="minTravelFee" 
                      type="text" 
                      inputMode="decimal"
                      placeholder="e.g. 0"
                      value={travelPricingInputs.minTravelFee} 
                      onValueChange={(val) => {
                        setTravelPricingInputs(prev => ({ ...prev, minTravelFee: val }));
                        if (settings) {
                          handleSaveSettings({ travelPricing: { ...settings.travelPricing, minTravelFee: parseFloat(val) || 0 } });
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxTravelFee">Maximum Travel Fee ($)</Label>
                    <StableInput 
                      id="maxTravelFee" 
                      type="text" 
                      inputMode="decimal"
                      placeholder="e.g. 100"
                      value={travelPricingInputs.maxTravelFee} 
                      onValueChange={(val) => {
                        setTravelPricingInputs(prev => ({ ...prev, maxTravelFee: val }));
                        if (settings) {
                          handleSaveSettings({ travelPricing: { ...settings.travelPricing, maxTravelFee: parseFloat(val) || 0 } });
                        }
                      }}
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
                <Label className="text-base font-bold">Business Logo URL</Label>
                <div className="flex gap-4 items-start">
                  <div className="w-24 h-24 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                    {settings?.logoUrl ? (
                      <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-200" />
                    )}
                  </div>
                <div className="flex-1 space-y-3">
                  <div className="flex gap-2">
                    <StableInput 
                      placeholder="https://example.com/logo.png" 
                      value={settings?.logoUrl || ""} 
                      onValueChange={(val) => handleSaveSettings({ logoUrl: val })}
                      className="flex-1"
                    />
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleLogoUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="shrink-0"
                    >
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-[10px] text-gray-400 font-medium">Upload a logo from your device or provide a direct link (PNG or SVG recommended).</p>
                </div>
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-gray-100">
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
                    <MapIcon className="w-5 h-5" />
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
            <DialogContent className="max-w-2xl bg-white p-0 overflow-hidden">
              <DialogHeader className="p-6 border-b">
                <DialogTitle>{editingService?.id ? "Edit Service" : "Add New Service"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSaveService} className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label>Service Name</Label>
                    <StableInput 
                      value={editingService?.name || ""} 
                      onValueChange={val => setEditingService(prev => ({ ...prev!, name: val }))}
                      required
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>Description</Label>
                    <StableTextarea 
                      value={editingService?.description || ""} 
                      onValueChange={val => setEditingService(prev => ({ ...prev!, description: val }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select 
                      value={editingService?.category || ""} 
                      onValueChange={(v: any) => setEditingService(prev => ({ ...prev!, category: v }))}
                    >
                      <SelectTrigger className="bg-white"><SelectValue placeholder="Select Category" /></SelectTrigger>
                      <SelectContent className="bg-white">
                        {categories.filter(c => c.type === "service" && c.isActive).map(cat => (
                          <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Base Price ($)</Label>
                    <StableInput 
                      type="text"
                      inputMode="decimal"
                      value={editingService?.basePrice?.toString() || ""} 
                      onValueChange={val => setEditingService(prev => ({ ...prev!, basePrice: parseFloat(val) || 0 }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (minutes)</Label>
                    <StableInput 
                      type="text"
                      inputMode="numeric"
                      value={editingService?.estimatedDuration?.toString() || ""} 
                      onValueChange={val => setEditingService(prev => ({ ...prev!, estimatedDuration: parseInt(val) || 0 }))}
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
                          <StableInput 
                            type="text"
                            inputMode="decimal"
                            className="h-8 text-xs"
                            value={editingService?.pricingBySize?.[size.value]?.toString() || ""}
                            onValueChange={val => setEditingService(prev => ({
                              ...prev!,
                              pricingBySize: {
                                ...(prev?.pricingBySize || { small: 0, medium: 0, large: 0, extra_large: 0 }),
                                [size.value]: parseFloat(val) || 0
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
            <DialogContent className="max-w-md bg-white p-0 overflow-hidden">
              <DialogHeader className="p-6 border-b">
                <DialogTitle>{editingAddon?.id ? "Edit Add-on" : "Add New Add-on"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSaveAddon} className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="space-y-2">
                  <Label>Add-on Name</Label>
                  <StableInput 
                    value={editingAddon?.name || ""} 
                    onValueChange={val => setEditingAddon(prev => ({ ...prev!, name: val }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select 
                    value={(editingAddon as any)?.category || ""} 
                    onValueChange={(v: any) => setEditingAddon(prev => ({ ...prev!, category: v }))}
                  >
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Select Category" /></SelectTrigger>
                    <SelectContent className="bg-white">
                      {categories.filter(c => c.type === "addon" && c.isActive).map(cat => (
                        <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <StableTextarea 
                    value={editingAddon?.description || ""} 
                    onValueChange={val => setEditingAddon(prev => ({ ...prev!, description: val }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Price ($)</Label>
                    <StableInput 
                      type="text"
                      inputMode="decimal"
                      value={editingAddon?.price?.toString() || ""} 
                      onValueChange={val => setEditingAddon(prev => ({ ...prev!, price: parseFloat(val) || 0 }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (min)</Label>
                    <StableInput 
                      type="text"
                      inputMode="numeric"
                      value={editingAddon?.estimatedDuration?.toString() || ""} 
                      onValueChange={val => setEditingAddon(prev => ({ ...prev!, estimatedDuration: parseInt(val) || 0 }))}
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

        <TabsContent value="categories">
          <div className="grid grid-cols-1 gap-6">
            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Category Management</CardTitle>
                  <CardDescription>Create and organize categories for services, add-ons, and expenses.</CardDescription>
                </div>
                <Button size="sm" className="bg-primary hover:bg-red-700 font-bold" onClick={() => {
                  setEditingCategory({
                    name: "",
                    type: "service",
                    isActive: true,
                    sortOrder: 0
                  });
                  setIsCategoryDialogOpen(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" /> Add Category
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-8">
                  {["service", "addon", "expense", "inventory"].map((type) => {
                    const typeCats = categories.filter(c => c.type === type);
                    if (typeCats.length === 0 && type === "inventory") return null;
                    
                    return (
                      <div key={type} className="space-y-4">
                        <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                          <Tag className="w-4 h-4" />
                          {type} Categories
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {typeCats.map((cat, idx) => (
                            <div key={cat.id} className="p-4 border border-gray-100 rounded-xl hover:border-red-100 transition-colors group flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex flex-col gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-4 w-4 text-gray-300 hover:text-primary"
                                    onClick={() => handleReorderCategory(cat.id, "up")}
                                    disabled={idx === 0}
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-4 w-4 text-gray-300 hover:text-primary"
                                    onClick={() => handleReorderCategory(cat.id, "down")}
                                    disabled={idx === typeCats.length - 1}
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </Button>
                                </div>
                                <div>
                                  <p className="font-bold text-gray-900">{cat.name}</p>
                                  {!cat.isActive && <Badge variant="secondary" className="text-[10px] uppercase">Inactive</Badge>}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-gray-400 hover:text-primary"
                                  onClick={() => {
                                    setEditingCategory(cat);
                                    setIsCategoryDialogOpen(true);
                                  }}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-gray-400 hover:text-red-600"
                                  onClick={() => handleDeleteCategory(cat.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
            <DialogContent className="max-w-md bg-white p-0 overflow-hidden">
              <DialogHeader className="p-6 border-b">
                <DialogTitle>{editingCategory?.id ? "Edit Category" : "Add New Category"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSaveCategory} className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="space-y-2">
                  <Label>Category Name</Label>
                  <StableInput 
                    value={editingCategory?.name || ""} 
                    onValueChange={val => setEditingCategory(prev => ({ ...prev!, name: val }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select 
                    value={editingCategory?.type || "service"} 
                    onValueChange={(v: any) => setEditingCategory(prev => ({ ...prev!, type: v }))}
                  >
                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="service">Service</SelectItem>
                      <SelectItem value="addon">Add-on</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="inventory">Inventory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <Label>Active</Label>
                  <Switch 
                    checked={editingCategory?.isActive ?? true} 
                    onCheckedChange={v => setEditingCategory(prev => ({ ...prev!, isActive: v }))}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" className="bg-primary hover:bg-red-700 font-bold">Save Category</Button>
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
                  <StableInput 
                    type="text" 
                    inputMode="numeric"
                    value={settings?.loyaltySettings?.pointsPerDollar?.toString() || ""} 
                    onValueChange={(val) => handleSaveSettings({ 
                      loyaltySettings: { ...settings!.loyaltySettings, pointsPerDollar: parseFloat(val) || 0 } 
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Points Per Visit</Label>
                  <StableInput 
                    type="text" 
                    inputMode="numeric"
                    value={settings?.loyaltySettings?.pointsPerVisit?.toString() || ""} 
                    onValueChange={(val) => handleSaveSettings({ 
                      loyaltySettings: { ...settings!.loyaltySettings, pointsPerVisit: parseFloat(val) || 0 } 
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Redemption Rate ($ per point)</Label>
                  <StableInput 
                    type="text" 
                    inputMode="decimal"
                    value={settings?.loyaltySettings?.redemptionRate?.toString() || ""} 
                    onValueChange={(val) => handleSaveSettings({ 
                      loyaltySettings: { ...settings!.loyaltySettings, redemptionRate: parseFloat(val) || 0 } 
                    })}
                  />
                  <p className="text-[10px] text-gray-500 font-medium">Example: 0.01 means 100 points = $1.00</p>
                </div>
                <div className="space-y-2">
                  <Label>Minimum Points to Redeem</Label>
                  <StableInput 
                    type="text" 
                    inputMode="numeric"
                    value={settings?.loyaltySettings?.minPointsToRedeem?.toString() || ""} 
                    onValueChange={(val) => handleSaveSettings({ 
                      loyaltySettings: { ...settings!.loyaltySettings, minPointsToRedeem: parseFloat(val) || 0 } 
                    })}
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
                    <StableInput 
                      type="text" 
                      inputMode="decimal"
                      value={settings?.commissionRate?.toString() || ""} 
                      onValueChange={(val) => handleSaveSettings({ commissionRate: parseFloat(val) || 0 })}
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

        <TabsContent value="coupons">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Coupon Management</CardTitle>
                <CardDescription>Create discount codes for your customers.</CardDescription>
              </div>
              <Button size="sm" className="bg-primary hover:bg-red-700 font-bold" onClick={() => {
                setEditingCoupon({
                  code: "",
                  discountType: "percentage",
                  discountValue: 0,
                  usageLimit: 0,
                  isActive: true
                });
                setIsCouponDialogOpen(true);
              }}>
                <Plus className="w-4 h-4 mr-2" /> Add Coupon
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {coupons.map(coupon => (
                  <div key={coupon.id} className="p-4 border border-gray-100 rounded-xl hover:border-red-100 transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-red-50 text-primary border-red-100 font-black tracking-widest uppercase">
                          {coupon.code}
                        </Badge>
                        {!coupon.isActive && <Badge variant="secondary" className="text-[10px] uppercase">Inactive</Badge>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-gray-400 hover:text-primary"
                          onClick={() => {
                            setEditingCoupon(coupon);
                            setIsCouponDialogOpen(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-gray-400 hover:text-red-600"
                          onClick={async () => {
                            if (confirm("Delete this coupon?")) {
                              await deleteDoc(doc(db, "coupons", coupon.id));
                              toast.success("Coupon deleted");
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-gray-900">
                        {coupon.discountType === "percentage" ? `${coupon.discountValue}% Off` : `$${coupon.discountValue} Off`}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                        <span>Used: {coupon.usageCount} / {coupon.usageLimit || "∞"}</span>
                        {coupon.expiryDate && <span>Expires: {format(coupon.expiryDate.toDate(), "MM/dd/yy")}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Dialog open={isCouponDialogOpen} onOpenChange={setIsCouponDialogOpen}>
            <DialogContent className="max-w-md bg-white p-0 overflow-hidden">
              <DialogHeader className="p-6 border-b">
                <DialogTitle>{editingCoupon?.id ? "Edit Coupon" : "Add New Coupon"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSaveCoupon} className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="space-y-2">
                  <Label>Coupon Code</Label>
                  <StableInput 
                    placeholder="SUMMER24"
                    value={editingCoupon?.code || ""} 
                    onValueChange={val => setEditingCoupon(prev => ({ ...prev!, code: val.toUpperCase() }))}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Discount Type</Label>
                    <Select 
                      value={editingCoupon?.discountType || "percentage"} 
                      onValueChange={(v: any) => setEditingCoupon(prev => ({ ...prev!, discountType: v }))}
                    >
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                        <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Discount Value</Label>
                    <StableInput 
                      type="text"
                      inputMode="decimal"
                      value={editingCoupon?.discountValue?.toString() || ""} 
                      onValueChange={val => setEditingCoupon(prev => ({ ...prev!, discountValue: parseFloat(val) || 0 }))}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Usage Limit (0 for ∞)</Label>
                    <StableInput 
                      type="text"
                      inputMode="numeric"
                      value={editingCoupon?.usageLimit?.toString() || ""} 
                      onValueChange={val => setEditingCoupon(prev => ({ ...prev!, usageLimit: parseInt(val) || 0 }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expiry Date (Optional)</Label>
                    <Input 
                      type="date"
                      className="bg-white"
                      value={editingCoupon?.expiryDate ? format(editingCoupon.expiryDate.toDate(), "yyyy-MM-dd") : ""}
                      onChange={e => {
                        const date = e.target.value ? Timestamp.fromDate(new Date(e.target.value)) : undefined;
                        setEditingCoupon(prev => ({ ...prev!, expiryDate: date }));
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <Label>Active</Label>
                  <Switch 
                    checked={editingCoupon?.isActive ?? true} 
                    onCheckedChange={v => setEditingCoupon(prev => ({ ...prev!, isActive: v }))}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCouponDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" className="bg-primary hover:bg-red-700 font-bold">Save Coupon</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="automation">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Service Follow-up Automation</CardTitle>
                <CardDescription>Automatically follow up with clients after a completed service.</CardDescription>
              </div>
              <Button 
                variant="outline" 
                className="font-bold border-primary text-primary hover:bg-red-50"
                onClick={async () => {
                  const res = await processFollowUps();
                  toast.success(`Processed ${res.processed} follow-ups. ${res.errors} errors.`);
                }}
              >
                <DatabaseZap className="w-4 h-4 mr-2" />
                Run Now
              </Button>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="space-y-0.5">
                  <Label className="text-base font-bold">Enable Follow-up</Label>
                  <p className="text-sm text-gray-500">Automatically send follow-ups after service completion.</p>
                </div>
                <Switch 
                  checked={settings?.automationSettings?.followUpEnabled || false}
                  onCheckedChange={(val) => handleSaveSettings({ 
                    automationSettings: { ...settings?.automationSettings!, followUpEnabled: val } 
                  })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Follow-up Delay (Hours)</Label>
                    <div className="flex items-center gap-4">
                      <Slider 
                        value={[settings?.automationSettings?.delayHours || 24]} 
                        min={1} 
                        max={168} 
                        step={1}
                        onValueChange={([val]) => handleSaveSettings({ 
                          automationSettings: { ...settings?.automationSettings!, delayHours: val } 
                        })}
                        className="flex-1"
                      />
                      <span className="font-bold w-12 text-right">{settings?.automationSettings?.delayHours}h</span>
                    </div>
                    <p className="text-xs text-gray-400">Time to wait after appointment is marked "Completed".</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Communication Channel</Label>
                    <Select 
                      value={settings?.automationSettings?.channels || "email"}
                      onValueChange={(val: any) => handleSaveSettings({ 
                        automationSettings: { ...settings?.automationSettings!, channels: val } 
                      })}
                    >
                      <SelectTrigger className="font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email Only</SelectItem>
                        <SelectItem value="sms">SMS Only</SelectItem>
                        <SelectItem value="both">Email & SMS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="space-y-0.5">
                      <Label className="font-bold">Include Google Review Link</Label>
                      <p className="text-xs text-gray-500">Only sent to new or one-time clients.</p>
                    </div>
                    <Switch 
                      checked={settings?.automationSettings?.includeReviewLink || false}
                      onCheckedChange={(val) => handleSaveSettings({ 
                        automationSettings: { ...settings?.automationSettings!, includeReviewLink: val } 
                      })}
                    />
                  </div>

                  {settings?.automationSettings?.includeReviewLink && (
                    <div className="space-y-2">
                      <Label>Google Review URL</Label>
                      <StableInput 
                        value={settings?.automationSettings?.googleReviewUrl || ""}
                        onValueChange={(val) => handleSaveSettings({ 
                          automationSettings: { ...settings?.automationSettings!, googleReviewUrl: val } 
                        })}
                        placeholder="https://g.page/r/..."
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email Subject</Label>
                    <StableInput 
                      value={settings?.automationSettings?.emailSubject || ""}
                      onValueChange={(val) => handleSaveSettings({ 
                        automationSettings: { ...settings?.automationSettings!, emailSubject: val } 
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email Body</Label>
                    <StableTextarea 
                      value={settings?.automationSettings?.emailBody || ""}
                      onValueChange={(val) => handleSaveSettings({ 
                        automationSettings: { ...settings?.automationSettings!, emailBody: val } 
                      })}
                      rows={4}
                    />
                    <p className="text-[10px] text-gray-400 font-mono">Available variables: {"{{firstName}}, {{businessName}}"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>SMS Body</Label>
                    <StableTextarea 
                      value={settings?.automationSettings?.smsBody || ""}
                      onValueChange={(val) => handleSaveSettings({ 
                        automationSettings: { ...settings?.automationSettings!, smsBody: val } 
                      })}
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
          <Card className="border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle>Security & Access Control</CardTitle>
              <CardDescription>Manage administrative access and data protection settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 border border-gray-100 rounded-2xl">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-primary" />
                      <Label className="text-base font-bold">Admin-Only Access</Label>
                    </div>
                    <p className="text-sm text-gray-500">Restrict access to settings and financial reports to administrators only.</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-100 rounded-2xl">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      <Label className="text-base font-bold">Two-Factor Authentication</Label>
                    </div>
                    <p className="text-sm text-gray-500">Require a secondary verification code for all administrative logins.</p>
                  </div>
                  <Badge variant="secondary" className="uppercase text-[10px] font-black tracking-widest">Coming Soon</Badge>
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-100 rounded-2xl">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-primary" />
                      <Label className="text-base font-bold">Data Encryption</Label>
                    </div>
                    <p className="text-sm text-gray-500">All customer PII and financial data is encrypted at rest and in transit.</p>
                  </div>
                  <Badge className="bg-green-50 text-green-700 border-green-100 uppercase text-[10px] font-black tracking-widest">Active</Badge>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100">
                <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Privacy Policy</h3>
                <div className="p-4 bg-gray-50 rounded-2xl">
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Your business data is stored securely in our cloud infrastructure. We do not sell your data to third parties. 
                    Access is restricted to authorized personnel only. For more information, please contact support.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="client-management">
          <div className="grid grid-cols-1 gap-6">
            <Card className="border-none shadow-sm bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DatabaseZap className="w-5 h-5 text-primary" />
                  Data Migration
                </CardTitle>
                <CardDescription>
                  Merge existing Customers and Vendors into the new unified Clients system.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-red-50 rounded-2xl border border-red-100 mb-6">
                  <div className="flex gap-3">
                    <ShieldAlert className="w-5 h-5 text-primary shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-gray-900">Important Migration Notice</p>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        This will create new records in the 'clients' collection based on your current customers and vendors. 
                        It will also update existing appointments and vehicles to point to these new client records. 
                        Old records will be preserved but marked as migrated.
                      </p>
                    </div>
                  </div>
                </div>
                <Button 
                  onClick={async () => {
                    if (confirm("Are you sure you want to migrate all customer and vendor data to the new unified Clients system? This will update existing appointments and vehicles.")) {
                      setIsSaving(true);
                      try {
                        const result = await migrateDataToClients();
                        toast.success(`Successfully migrated ${result.migratedCount} clients!`);
                      } catch (error) {
                        console.error("Migration error:", error);
                        toast.error("Migration failed. Check console for details.");
                      } finally {
                        setIsSaving(false);
                      }
                    }
                  }}
                  className="bg-primary hover:bg-red-700 font-bold"
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DatabaseZap className="w-4 h-4 mr-2" />}
                  Run Migration Now
                </Button>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-none shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Client Types</CardTitle>
                    <CardDescription>Customizable types for your clients.</CardDescription>
                  </div>
                  <Dialog>
                    <DialogTrigger render={
                      <Button size="sm" variant="outline">
                        <Plus className="w-4 h-4 mr-2" /> Add Type
                      </Button>
                    } />
                    <DialogContent>
                      <DialogHeader><DialogTitle>Add Client Type</DialogTitle></DialogHeader>
                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget as HTMLFormElement);
                        const name = formData.get("name") as string;
                        if (name) {
                          const slug = name.toLowerCase().replace(/\s+/g, '_');
                          await addDoc(collection(db, "client_types"), {
                            name,
                            slug,
                            isActive: true,
                            sortOrder: clientTypes.length + 1
                          });
                          toast.success("Client type added");
                        }
                      }} className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Type Name</Label>
                          <Input name="name" placeholder="e.g. Fleet Account" required />
                        </div>
                        <Button type="submit" className="w-full bg-primary font-bold">Create Type</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {clientTypes.map(type => (
                      <div key={type.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl group">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-gray-100">
                            <Users className="w-4 h-4 text-gray-400" />
                          </div>
                          <span className="font-bold text-gray-900">{type.name}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-gray-400 hover:text-red-600" 
                            onClick={async () => {
                              // Using a simple toast confirmation pattern for now to avoid window.confirm
                              toast("Delete this client type?", {
                                action: {
                                  label: "Delete",
                                  onClick: async () => {
                                    await deleteDoc(doc(db, "client_types", type.id));
                                    toast.success("Client type deleted");
                                  }
                                }
                              });
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {clientTypes.length === 0 && <p className="text-xs text-gray-400 font-medium italic">No client types defined.</p>}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Client Categories</CardTitle>
                    <CardDescription>Tags for filtering and grouping clients.</CardDescription>
                  </div>
                  <Dialog>
                    <DialogTrigger render={
                      <Button size="sm" variant="outline">
                        <Plus className="w-4 h-4 mr-2" /> Add Category
                      </Button>
                    } />
                    <DialogContent>
                      <DialogHeader><DialogTitle>Add Client Category</DialogTitle></DialogHeader>
                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget as HTMLFormElement);
                        const name = formData.get("name") as string;
                        if (name) {
                          await addDoc(collection(db, "client_categories"), {
                            name,
                            isActive: true,
                            color: "#ef4444"
                          });
                          toast.success("Category added");
                        }
                      }} className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Category Name</Label>
                          <Input name="name" placeholder="e.g. High Value" required />
                        </div>
                        <Button type="submit" className="w-full bg-primary font-bold">Create Category</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {clientCategories.map(cat => (
                      <div key={cat.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl group">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color || "#ef4444" }} />
                          <span className="font-bold text-gray-900">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={async () => {
                            if (confirm("Delete this category?")) {
                              await deleteDoc(doc(db, "client_categories", cat.id));
                              toast.success("Category deleted");
                            }
                          }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {clientCategories.length === 0 && <p className="text-xs text-gray-400 font-medium italic">No categories defined.</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
