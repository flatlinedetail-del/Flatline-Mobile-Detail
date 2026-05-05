import { useState, useEffect, useRef } from "react";
import { doc, updateDoc, getDoc, setDoc, collection, query, addDoc, deleteDoc, orderBy, Timestamp, serverTimestamp, getDocs, limit } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  User, 
  Shield, 
  Bell, 
  CreditCard, 
  Database, 
  Globe, 
  DatabaseZap, 
  Loader2, 
  Palette, 
  Layout, 
  Truck, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  Star, 
  Percent, 
  ClipboardList, 
  Tag, 
  Ticket, 
  Lock, 
  Users, 
  ShieldAlert, 
  ShieldCheck, 
  Upload, 
  Calendar, 
  Link, 
  Building2, 
  Zap, 
  Save, 
  Clock, 
  MessageSquare, 
  Smartphone, 
  Send, 
  AlertCircle, 
  ArrowUp, 
  ArrowDown,
  Image as ImageIcon,
  DollarSign as DollarIcon
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { seedDemoData, seedServiceTimingDemo, importFullServiceSystem } from "../services/seedData";
import { toast } from "sonner";
import { format } from "date-fns";
import { useSearchParams } from "react-router-dom";
import AddressInput from "../components/AddressInput";
import { cn } from "../lib/utils";
import { StandardInput } from "../components/StandardInput";
import { StableInput } from "../components/StableInput";
import { StableTextarea } from "../components/StableTextarea";
import { NumberInput } from "../components/NumberInput";
import { BusinessSettings, Service, AddOn, VehicleSize, Category, CategoryType, Coupon } from "../types";
import { migrateDataToClients } from "../services/clientService";
import { processFollowUps } from "../services/automationService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { linkGoogleCalendar, getGoogleCalendarToken, unlinkGoogleCalendar } from "../services/googleCalendarService";
import MapZoneEditor from "../components/MapZoneEditor";

const VEHICLE_SIZES: { label: string; value: VehicleSize }[] = [
  { label: "Small", value: "small" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" },
  { label: "Extra Large", value: "extra_large" },
];

const removeUndefined = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  } else if (obj !== null && typeof obj === 'object' && !(obj instanceof Timestamp)) {
    return Object.entries(obj).reduce((acc: any, [key, value]) => {
      if (value !== undefined) {
        acc[key] = removeUndefined(value);
      }
      return acc;
    }, {});
  }
  return obj;
};

export default function Settings() {
  const { 
    profile, 
    loading: authLoading, 
    systemStatus, 
    isAdmin, 
    isManager,
    canAccessAdmin,
    canAccessManager,
    settings: authSettings 
  } = useAuth();
  
  const isOwner = profile?.role === "owner";
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "profile";
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoAdjustments, setLogoAdjustments] = useState({
    scale: 1,
    x: 0,
    y: 0,
    rotation: 0,
    fit: 'contain' as 'contain' | 'cover',
    background: 'transparent' as 'transparent' | 'dark' | 'light'
  });
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [watermarkLogoPreview, setWatermarkLogoPreview] = useState<string | null>(null);
  const [watermarkLogoFile, setWatermarkLogoFile] = useState<File | null>(null);
  const watermarkFileInputRef = useRef<HTMLInputElement>(null);

  const adminOnly = authSettings?.adminOnlyAccess ?? true;
  // Sensitive settings check
  const hasAccessToSensitiveSettings = canAccessAdmin;

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
  const [editingClientType, setEditingClientType] = useState<any | null>(null);
  const [editingClientCategory, setEditingClientCategory] = useState<any | null>(null);
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [isAddonDialogOpen, setIsAddonDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isCouponDialogOpen, setIsCouponDialogOpen] = useState(false);
  const [isClientTypeDialogOpen, setIsClientTypeDialogOpen] = useState(false);
  const [isClientCategoryDialogOpen, setIsClientCategoryDialogOpen] = useState(false);
  const [googleCalendarLinked, setGoogleCalendarLinked] = useState(false);
  const [isLinkingCalendar, setIsLinkingCalendar] = useState(false);
  const [travelPricingInputs, setTravelPricingInputs] = useState({
    pricePerMile: "",
    freeMilesThreshold: "",
    minTravelFee: "",
    maxTravelFee: ""
  });

  useEffect(() => {
    getGoogleCalendarToken().then(token => setGoogleCalendarLinked(!!token)).catch(() => setGoogleCalendarLinked(false));
  }, []);

  useEffect(() => {
    if (authLoading || !profile) return;

    const fetchSettings = async () => {
      // Check cache first (10 min)
      const cached = sessionStorage.getItem('business_settings_cache');
      const cacheTime = sessionStorage.getItem('business_settings_cache_time');
      const now = Date.now();
      if (cached && cacheTime && now - Number(cacheTime) < 10 * 60 * 1000) {
        const parsed = JSON.parse(cached);
        setSettings(parsed);
        if (parsed) {
          setLogoAdjustments({
            scale: parsed.logoSettings?.scale || 1,
            x: parsed.logoSettings?.x || 0,
            y: parsed.logoSettings?.y || 0,
            rotation: parsed.logoSettings?.rotation || 0,
            fit: parsed.logoSettings?.fit || 'contain',
            background: 'transparent'
          });
        }
        setTravelPricingInputs({
          pricePerMile: (parsed.travelPricing?.pricePerMile || 0).toString(),
          freeMilesThreshold: (parsed.travelPricing?.freeMilesThreshold || 0).toString(),
          minTravelFee: (parsed.travelPricing?.minTravelFee || 0).toString(),
          maxTravelFee: (parsed.travelPricing?.maxTravelFee || 0).toString()
        });
        setLoading(false);
        return;
      }

      try {
        const docRef = doc(db, "settings", "business");
        const snap = await getDoc(docRef).catch(e => handleFirestoreError(e, OperationType.GET, "settings/business"));
        if (!snap) return;
        
        const intRef = doc(db, "settings", "integrations");
        const intSnap = await getDoc(intRef).catch(e => handleFirestoreError(e, OperationType.GET, "settings/integrations"));
        
        let data: BusinessSettings | null = null;
        
        if (snap.exists()) {
          data = snap.data() as BusinessSettings;
          if (intSnap && intSnap.exists()) {
            data = { ...data, ...intSnap.data() };
          }
          setSettings(data);
          
          if (data) {
            setLogoAdjustments({
              scale: data.logoSettings?.scale || 1,
              x: data.logoSettings?.x || 0,
              y: data.logoSettings?.y || 0,
              rotation: data.logoSettings?.rotation || 0,
              fit: data.logoSettings?.fit || 'contain',
              background: 'transparent'
            });
          }
          
          // Cache settings
          sessionStorage.setItem('business_settings_cache', JSON.stringify(data));
          sessionStorage.setItem('business_settings_cache_time', now.toString());

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
            businessName: "DetailFlow",
            taxRate: 8.25,
            currency: "USD",
            timezone: "America/Chicago",
            marginTargets: {
              floor: 20,
              recommended: 40,
              premium: 60
            },
            commissionRate: 30,
            commissionType: "percentage",
            baseAddress: "1 AMB Dr NW, Atlanta, GA 30313",
            baseLatitude: 33.7554,
            baseLongitude: -84.4011,
            invoiceAddress: "1 AMB Dr NW, Atlanta, GA 30313",
            travelPricing: {
              enabled: true,
              mode: "mileage",
              pricePerMile: 1.5,
              freeMilesThreshold: 10,
              minTravelFee: 0,
              maxTravelFee: 100,
              roundTripToggle: true,
              useZones: false,
              zones: [],
              mapZones: []
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
      
      const fetchMetaData = async () => {
        // Attempt metadata caching (10 min)
        const cachedMeta = sessionStorage.getItem('settings_metadata_cache');
        const cachedTime = sessionStorage.getItem('settings_metadata_cache_time');
        const now = Date.now();
        if (cachedMeta && cachedTime && now - Number(cachedTime) < 10 * 60 * 1000) {
          const parsed = JSON.parse(cachedMeta);
          setServices(parsed.services);
          setAddons(parsed.addons);
          setCategories(parsed.categories);
          setCoupons(parsed.coupons);
          setClientTypes(parsed.clientTypes);
          setClientCategories(parsed.clientCategories);
          setStaff(parsed.staff);
          return;
        }

        try {
          const [servicesSnap, addonsSnap, categoriesSnap, couponsSnap, clientTypesSnap, clientCategoriesSnap, staffSnap] = await Promise.all([
            getDocs(collection(db, "services")),
            getDocs(collection(db, "addons")),
            getDocs(query(collection(db, "categories"), orderBy("sortOrder", "asc"))),
            getDocs(collection(db, "coupons")),
            getDocs(query(collection(db, "client_types"), orderBy("sortOrder", "asc"))),
            getDocs(query(collection(db, "client_categories"), orderBy("name", "asc"))),
            getDocs(query(collection(db, "users"), orderBy("displayName", "asc"), limit(50)))
          ]);

          const servicesData = servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service));
          const addonsData = addonsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AddOn));
          const categoriesData = categoriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
          const couponsData = couponsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Coupon));
          const ctRaw = clientTypesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
          const clientTypesData = Array.from(new Map(ctRaw.map(t => [t.slug, t])).values());
          const ccRaw = clientCategoriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
          const clientCategoriesData = Array.from(new Map(ccRaw.map(c => [c.name, c])).values());
          const staffData = staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          setServices(servicesData);
          setAddons(addonsData);
          setCategories(categoriesData);
          
          // Seed default categories if none exist
          if (categoriesData.length === 0 && profile?.role === "admin") {
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
            // Only seed if needed, but we don't have to wait for it here
            Promise.all(defaultCategories.map(cat => addDoc(collection(db, "categories"), cat)));
          }

          setCoupons(couponsData);
          setClientTypes(clientTypesData);
          setClientCategories(clientCategoriesData);
          setStaff(staffData);

          sessionStorage.setItem('settings_metadata_cache', JSON.stringify({
            services: servicesData,
            addons: addonsData,
            categories: categoriesData,
            coupons: couponsData,
            clientTypes: clientTypesData,
            clientCategories: clientCategoriesData,
            staff: staffData
          }));
          sessionStorage.setItem('settings_metadata_cache_time', now.toString());

        } catch (error) {
          console.error("Error fetching settings metadata:", error);
        }
      };

      fetchMetaData();
      return () => {};
    }
  }, [profile, authLoading]);

  const updateTwilioSetting = (field: string, value: any) => {
    setSettings(prev => {
      if (!prev) return null;
      return {
        ...prev,
        twilioSettings: {
          ...(prev.twilioSettings || { enabled: false, accountSid: "", authToken: "", phoneNumber: "" }),
          [field]: value
        }
      };
    });
  };

  const handleSaveSettings = async (newData: Partial<BusinessSettings>) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      let updatedTravelPricing = settings.travelPricing;

      // Only validate travel pricing inputs if we are NOT just updating specific fields like logoUrl
      // or if we are explicitly on the business tab
      const isUpdatingLogoOnly = Object.keys(newData).length === 1 && 'logoUrl' in newData;
      
      if (!isUpdatingLogoOnly) {
        const pricePerMile = parseFloat(travelPricingInputs.pricePerMile);
        const freeMilesThreshold = parseFloat(travelPricingInputs.freeMilesThreshold);
        const minTravelFee = parseFloat(travelPricingInputs.minTravelFee);
        const maxTravelFee = parseFloat(travelPricingInputs.maxTravelFee);

        // If we are on the business tab, we require valid numbers
        if (activeTab === 'business') {
          if (isNaN(pricePerMile) || isNaN(freeMilesThreshold) || isNaN(minTravelFee) || isNaN(maxTravelFee)) {
            toast.error("Please enter valid numbers for travel pricing.");
            setIsSaving(false);
            return;
          }
          
          updatedTravelPricing = {
            ...settings.travelPricing,
            pricePerMile,
            freeMilesThreshold,
            minTravelFee,
            maxTravelFee,
            ...(newData.travelPricing || {})
          };
        } else {
          // If we are not on the business tab, only update if inputs are valid numbers
          if (!isNaN(pricePerMile) && !isNaN(freeMilesThreshold) && !isNaN(minTravelFee) && !isNaN(maxTravelFee)) {
            updatedTravelPricing = {
              ...settings.travelPricing,
              pricePerMile,
              freeMilesThreshold,
              minTravelFee,
              maxTravelFee,
              ...(newData.travelPricing || {})
            };
          }
        }
      }

      const updatedSettings = { 
        ...settings, 
        ...newData,
        travelPricing: updatedTravelPricing
      };

      // Separate sensitive data
      const { paymentIntegrations, twilioSettings, ...publicData } = updatedSettings;
      
      // Save public data
      await setDoc(doc(db, "settings", "business"), removeUndefined(publicData));
      
      // Save sensitive data if present
      if (paymentIntegrations || twilioSettings) {
        const integrationsData: any = {};
        if (paymentIntegrations) integrationsData.paymentIntegrations = paymentIntegrations;
        if (twilioSettings) integrationsData.twilioSettings = twilioSettings;
        await setDoc(doc(db, "settings", "integrations"), removeUndefined(integrationsData), { merge: true });
      }
      
      // Invalidate cache
      sessionStorage.removeItem('business_settings_cache');
      sessionStorage.removeItem('business_settings_cache_time');

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
    if (!isOwner) {
      toast.error("Security Protocol Violation: Only the system owner can modify user clearances.");
      return;
    }
    try {
      await updateDoc(doc(db, "users", staffId), { 
        role: newRole,
        // Update helper flags for consistency
        isAdmin: newRole === "admin" || newRole === "owner",
        accessLevel: newRole === "admin" || newRole === "owner" ? "admin" : newRole
      });
      toast.success("Staff role updated");
    } catch (error) {
      console.error("Error updating staff role:", error);
      toast.error("Failed to update staff role");
    }
  };

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isAvatarRemoved, setIsAvatarRemoved] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setAvatarError(null);
    
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setAvatarError("Invalid file type. Please use PNG, JPG, or WEBP.");
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("File is too large. Maximum size is 5MB.");
      return;
    }

    setAvatarFile(file);
    setIsAvatarRemoved(false);

    // Create local preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatarPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Reset input
    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setIsAvatarRemoved(true);
    setAvatarError(null);
    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
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
      // Only admins or owners can change roles
      if (profile.role === "admin" || profile.role === "owner") {
        updates.role = role;
      }

      // Handle avatar updates via Firebase Storage
      if (isAvatarRemoved) {
        updates.photoURL = null;
      } else if (avatarPreview && avatarFile) {
        const storageRef = ref(storage, `avatars/${profile?.uid}`);
        const uploadTask = await uploadBytes(storageRef, avatarFile);
        updates.photoURL = await getDownloadURL(uploadTask.ref);
      }
      
      const isRestricted = systemStatus === 'offline' || systemStatus === 'quota-exhausted';
      
      if (isRestricted) {
        // Simulated local save
        console.warn(`[Offline/Quota] Postponing profile update for ${profile.uid}`);
        toast.info("Setting saved locally — pending sync.", {
          description: "Firebase is currently unreachable or quota exhausted."
        });
      } else {
        await updateDoc(doc(db, "users", profile.uid), updates);
        toast.success("Profile updated successfully");
      }
      
      // Cleanup
      setAvatarFile(null);
      setIsAvatarRemoved(false);
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
        await setDoc(doc(db, "services", editingService.id), removeUndefined(editingService));
        toast.success("Service updated");
      } else {
        await addDoc(collection(db, "services"), removeUndefined({
          ...editingService,
          isActive: true,
          pricingBySize: editingService.pricingBySize || { small: 0, medium: 0, large: 0, extra_large: 0 }
        }));
        toast.success("Service added");
      }

      // Invalidate metadata cache
      sessionStorage.removeItem('settings_metadata_cache');
      sessionStorage.removeItem('settings_metadata_cache_time');
      sessionStorage.removeItem('services_list_cache');

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
        await setDoc(doc(db, "addons", editingAddon.id), removeUndefined(editingAddon));
        toast.success("Add-on updated");
      } else {
        await addDoc(collection(db, "addons"), removeUndefined({
          ...editingAddon,
          isActive: true
        }));
        toast.success("Add-on added");
      }
      
      // Invalidate metadata cache
      sessionStorage.removeItem('settings_metadata_cache');
      sessionStorage.removeItem('settings_metadata_cache_time');
      sessionStorage.removeItem('services_list_cache'); // Shared with Clients.tsx

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
        await setDoc(doc(db, "categories", editingCategory.id), removeUndefined(editingCategory));
        toast.success("Category updated");
      } else {
        await addDoc(collection(db, "categories"), removeUndefined({
          ...editingCategory,
          isActive: true,
          sortOrder: categories.filter(c => c.type === editingCategory.type).length
        }));
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
        await setDoc(doc(db, "coupons", editingCoupon.id), removeUndefined(editingCoupon));
        toast.success("Coupon updated");
      } else {
        await addDoc(collection(db, "coupons"), removeUndefined({
          ...editingCoupon,
          usageCount: 0,
          isActive: true
        }));
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
    const previous = [...categories];
    setCategories(prev => prev.filter(item => item.id !== id));
    try {
      await deleteDoc(doc(db, "categories", id));
      toast.success("Category deleted");
    } catch (error) {
      setCategories(previous);
      console.error("Error deleting category:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `categories/${id}`);
      } catch (err: any) {
        toast.error(`Failed to delete category: ${err.message}`);
      }
    }
  };

  const handleDeleteService = async (id: string) => {
    const previous = [...services];
    setServices(prev => prev.filter(item => item.id !== id));
    try {
      await deleteDoc(doc(db, "services", id));
      toast.success("Service deleted");
      
      // Invalidate metadata cache
      sessionStorage.removeItem('settings_metadata_cache');
      sessionStorage.removeItem('settings_metadata_cache_time');
      sessionStorage.removeItem('services_list_cache');
    } catch (error) {
      setServices(previous);
      console.error("Error deleting service:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `services/${id}`);
      } catch (err: any) {
        toast.error(`Failed to delete service: ${err.message}`);
      }
    }
  };

  const handleDeleteAddon = async (id: string) => {
    const previous = [...addons];
    setAddons(prev => prev.filter(item => item.id !== id));
    try {
      await deleteDoc(doc(db, "addons", id));
      toast.success("Add-on deleted");

      // Invalidate metadata cache
      sessionStorage.removeItem('settings_metadata_cache');
      sessionStorage.removeItem('settings_metadata_cache_time');
      sessionStorage.removeItem('services_list_cache');
    } catch (error) {
      setAddons(previous);
      console.error("Error deleting add-on:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `addons/${id}`);
      } catch (err: any) {
        toast.error(`Failed to delete add-on: ${err.message}`);
      }
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    const previous = [...coupons];
    setCoupons(prev => prev.filter(item => item.id !== id));
    try {
      await deleteDoc(doc(db, "coupons", id));
      toast.success("Coupon deleted");
    } catch (error) {
      setCoupons(previous);
      console.error("Error deleting coupon:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `coupons/${id}`);
      } catch (err: any) {
        toast.error(`Failed to delete coupon: ${err.message}`);
      }
    }
  };

  const handleDeleteStaff = async (id: string) => {
    const previous = [...staff];
    setStaff(prev => prev.filter(item => item.id !== id));
    try {
      await deleteDoc(doc(db, "users", id));
      toast.success("Staff member removed");
    } catch (error) {
      setStaff(previous);
      console.error("Error deleting staff:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `users/${id}`);
      } catch (err: any) {
        toast.error(`Failed to remove staff: ${err.message}`);
      }
    }
  };

  const handleAddTravelZone = () => {
    if (!settings) return;
    const newZone = {
      id: Math.random().toString(36).substr(2, 9),
      name: "New Zone",
      minDistance: 0,
      maxDistance: 20,
      fee: 0
    };
    handleSaveSettings({
      travelPricing: {
        ...settings.travelPricing,
        zones: [...(settings.travelPricing.zones || []), newZone]
      }
    });
  };

  const handleUpdateTravelZone = (index: number, updates: any) => {
    if (!settings) return;
    const newZones = [...(settings.travelPricing.zones || [])];
    newZones[index] = { ...newZones[index], ...updates };
    handleSaveSettings({
      travelPricing: {
        ...settings.travelPricing,
        zones: newZones
      }
    });
  };

  const handleRemoveTravelZone = (index: number) => {
    if (!settings) return;
    const newZones = [...(settings.travelPricing.zones || [])];
    newZones.splice(index, 1);
    handleSaveSettings({
      travelPricing: {
        ...settings.travelPricing,
        zones: newZones
      }
    });
  };

  const getSystemStatusLabel = () => {
    switch (systemStatus) {
      case 'offline': return "Offline Mode";
      case 'quota-exhausted': return "Quota Exhausted";
      case 'permission-denied': return "Permission Error";
      default: return "Active";
    }
  };

  const handleDeleteClientType = async (id: string) => {
    try {
      await deleteDoc(doc(db, "client_types", id));
      toast.success("Client type deleted");
    } catch (error) {
      console.error("Error deleting client type:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `client_types/${id}`);
      } catch (err: any) {
        toast.error(`Failed to delete client type: ${err.message}`);
      }
    }
  };

  const handleDeleteClientCategory = async (id: string) => {
    try {
      await deleteDoc(doc(db, "client_categories", id));
      toast.success("Client category deleted");
    } catch (error) {
      console.error("Error deleting client category:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `client_categories/${id}`);
      } catch (err: any) {
        toast.error(`Failed to delete client category: ${err.message}`);
      }
    }
  };

  const handleSaveClientType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClientType?.name) return;

    try {
      const slug = editingClientType.name.toLowerCase().replace(/\s+/g, '_');
      const data = {
        name: editingClientType.name,
        slug: slug,
        isActive: editingClientType.isActive ?? true,
        sortOrder: editingClientType.sortOrder ?? (clientTypes.length + 1)
      };

      if (editingClientType.id) {
        await updateDoc(doc(db, "client_types", editingClientType.id), data);
        toast.success("Archetype updated");
      } else {
        await addDoc(collection(db, "client_types"), data);
        toast.success("Archetype synthesized");
      }
      setIsClientTypeDialogOpen(false);
      setEditingClientType(null);
    } catch (error) {
      console.error("Error saving client type:", error);
      toast.error("Failed to save archetype");
    }
  };

  const handleSaveClientCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClientCategory?.name) return;

    try {
      const data = {
        name: editingClientCategory.name,
        color: editingClientCategory.color || "#ef4444",
        isActive: editingClientCategory.isActive ?? true
      };

      if (editingClientCategory.id) {
        await updateDoc(doc(db, "client_categories", editingClientCategory.id), data);
        toast.success("Category updated");
      } else {
        await addDoc(collection(db, "client_categories"), data);
        toast.success("Category synthesized");
      }
      setIsClientCategoryDialogOpen(false);
      setEditingClientCategory(null);
    } catch (error) {
      console.error("Error saving client category:", error);
      toast.error("Failed to save category");
    }
  };

  const handleSaveBranding = async () => {
    if (!settings) return;
    setIsSaving(true);
    const toastId = toast.loading("Authorizing branding updates...");

    try {
      let finalLogoUrl = settings.logoUrl;
      let finalWatermarkLogoUrl = settings.watermarkSettings?.logoUrl;

      // Real Firebase Storage Uploads
      if (logoPreview && logoFile) {
        const storageRef = ref(storage, `branding/logos/${profile?.uid}_${Date.now()}`);
        const uploadTask = await uploadBytes(storageRef, logoFile);
        finalLogoUrl = await getDownloadURL(uploadTask.ref);
      }

      if (watermarkLogoPreview && watermarkLogoFile) {
        const storageRef = ref(storage, `branding/watermarks/${profile?.uid}_${Date.now()}`);
        const uploadTask = await uploadBytes(storageRef, watermarkLogoFile);
        finalWatermarkLogoUrl = await getDownloadURL(uploadTask.ref);
      }

      await handleSaveSettings({ 
        logoUrl: finalLogoUrl,
        logoSettings: {
          scale: logoAdjustments.scale,
          x: logoAdjustments.x,
          y: logoAdjustments.y,
          rotation: logoAdjustments.rotation,
          fit: logoAdjustments.fit
        },
        watermarkSettings: {
          ...settings.watermarkSettings,
          logoUrl: finalWatermarkLogoUrl,
          opacity: settings.watermarkSettings?.opacity ?? 0.10,
          position: settings.watermarkSettings?.position ?? "center",
          size: settings.watermarkSettings?.size ?? "medium"
        }
      });

      toast.success("Business branding authorized and deployed.", { id: toastId });
      setLogoFile(null); // Clear pending file
      setWatermarkLogoFile(null);
    } catch (error) {
      console.error("Branding save failed:", error);
      toast.error("Logo preview updated locally. Permanent cloud save requires storage connection.", { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setLogoError(null);
    if (!file) return;

    // Check permissions
    if (!isManager) {
      toast.error("Only admins or managers can update branding.");
      return;
    }

    // Validate type
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setLogoError("Please upload a valid PNG, JPG, or WEBP file.");
      return;
    }

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setLogoError("File is too large. Maximum size is 5MB.");
      return;
    }

    setLogoFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setLogoPreview(dataUrl);
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setLogoFile(null);
    setLogoError(null);
    setLogoAdjustments({
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      fit: 'contain',
      background: 'transparent'
    });
    setSettings(prev => prev ? { ...prev, logoUrl: "" } : null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleWatermarkLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isManager) {
      toast.error("Only admins or managers can update branding.");
      return;
    }

    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a valid PNG, JPG, SVG, or WEBP file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 5MB.");
      return;
    }

    setWatermarkLogoFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setWatermarkLogoPreview(dataUrl);
    };
    reader.readAsDataURL(file);

    if (watermarkFileInputRef.current) {
      watermarkFileInputRef.current.value = "";
    }
  };

  const handleRemoveWatermarkLogo = () => {
    setWatermarkLogoPreview(null);
    setWatermarkLogoFile(null);
    setSettings(prev => {
      if (!prev) return null;
      return {
        ...prev,
        watermarkSettings: {
          ...prev.watermarkSettings,
          logoUrl: ""
        }
      };
    });
    if (watermarkFileInputRef.current) watermarkFileInputRef.current.value = "";
  };

  const handleTabChange = (value: string) => {
    const sensitiveTabs = ["business", "branding", "staff", "automation", "communications", "integrations", "security"];
    if (sensitiveTabs.includes(value) && !hasAccessToSensitiveSettings) {
      toast.error("Access Restricted. This sector is protected by Admin-Only Protocol.");
      return;
    }
    setSearchParams({ tab: value });
  };

  useEffect(() => {
    const sensitiveTabs = ["business", "branding", "staff", "automation", "communications", "integrations", "security"];
    if (sensitiveTabs.includes(activeTab) && !hasAccessToSensitiveSettings && !authLoading) {
      setSearchParams({ tab: "profile" });
    }
  }, [activeTab, hasAccessToSensitiveSettings, authLoading]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-2 font-heading uppercase header-glow">
            SYSTEM <span className="text-primary italic">PREFERENCES</span>
          </h1>
          <p className="text-white/60 font-medium tracking-wide uppercase text-xs">
            Configuration Engine: <span className="text-primary font-black">{getSystemStatusLabel()}</span> • {profile?.role?.toUpperCase()} Access
          </p>
        </div>
        <Button variant="outline" onClick={handleSeedData} className="border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl px-6 h-12 font-bold uppercase tracking-widest text-[10px]">
          <DatabaseZap className="w-4 h-4 mr-2 text-primary" />
          Seed Intelligence
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} orientation="vertical" className="flex flex-col md:flex-row gap-10">
        <div className="w-full md:w-72 shrink-0 space-y-8 h-fit sticky top-28">
          <TabsList className="flex flex-col h-auto bg-transparent border-none p-0 gap-1.5">
            <h3 className="px-4 text-[10px] font-black text-[#A0A0A0] uppercase tracking-widest mb-2">Identity & Profile</h3>
            <TabsTrigger 
              value="profile" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-glow-blue text-[#A0A0A0] hover:text-white hover:bg-white/5 transition-all"
            >
              <User className="w-4 h-4" /> Personal Protocol
            </TabsTrigger>
            {hasAccessToSensitiveSettings && (
              <TabsTrigger 
                value="business" 
                className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-glow-blue text-[#A0A0A0] hover:text-white hover:bg-white/5 transition-all"
              >
                <Building2 className="w-4 h-4" /> Business Core
              </TabsTrigger>
            )}
            {hasAccessToSensitiveSettings && (
              <TabsTrigger 
                value="branding" 
                className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-glow-blue text-[#A0A0A0] hover:text-white hover:bg-white/5 transition-all"
              >
                <Palette className="w-4 h-4" /> Visual Identity
              </TabsTrigger>
            )}

            <h3 className="px-4 text-[10px] font-black text-[#A0A0A0] uppercase tracking-widest mt-6 mb-2">Fleet & Service</h3>
            {hasAccessToSensitiveSettings && (
              <TabsTrigger 
                value="staff" 
                className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-glow-blue text-[#A0A0A0] hover:text-white hover:bg-white/5 transition-all"
              >
                <Users className="w-4 h-4" /> Staff Management
              </TabsTrigger>
            )}
            <TabsTrigger 
              value="client-types" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-glow-blue text-[#A0A0A0] hover:text-white hover:bg-white/5 transition-all"
            >
              <DatabaseZap className="w-4 h-4" /> Client Archetypes
            </TabsTrigger>
            <TabsTrigger 
              value="services" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-glow-blue text-[#A0A0A0] hover:text-white hover:bg-white/5 transition-all"
            >
              <ClipboardList className="w-4 h-4" /> Service Protocols
            </TabsTrigger>

            <h3 className="px-4 text-[10px] font-black text-[#A0A0A0] uppercase tracking-widest mt-6 mb-2">Revenue & Growth</h3>
            <TabsTrigger 
              value="coupons" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-glow-blue text-[#A0A0A0] hover:text-white hover:bg-white/5 transition-all"
            >
              <Ticket className="w-4 h-4" /> Growth Incentives
            </TabsTrigger>
            <TabsTrigger 
              value="loyalty" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-glow-blue text-[#A0A0A0] hover:text-white hover:bg-white/5 transition-all"
            >
              <Star className="w-4 h-4" /> Loyalty Engine
            </TabsTrigger>
            {hasAccessToSensitiveSettings && (
              <TabsTrigger 
                value="automation" 
                className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-glow-blue text-[#A0A0A0] hover:text-white hover:bg-white/5 transition-all"
              >
                <Zap className="w-4 h-4" /> Operational Automations
              </TabsTrigger>
            )}
            <TabsTrigger 
              value="calendar" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-glow-blue text-[#A0A0A0] hover:text-white hover:bg-white/5 transition-all"
            >
              <Calendar className="w-4 h-4" /> Calendar Service Colors
            </TabsTrigger>
            {hasAccessToSensitiveSettings && (
              <TabsTrigger 
                value="communications" 
                className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-glow-blue text-[#A0A0A0] hover:text-white hover:bg-white/5 transition-all"
              >
                <MessageSquare className="w-4 h-4" /> Communications
              </TabsTrigger>
            )}
            {hasAccessToSensitiveSettings && (
              <TabsTrigger 
                value="integrations" 
                className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-glow-blue text-[#A0A0A0] hover:text-white hover:bg-white/5 transition-all"
              >
                <Plus className="w-4 h-4" /> Neural Links
              </TabsTrigger>
            )}
            {hasAccessToSensitiveSettings && (
              <TabsTrigger 
                value="security" 
                className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-glow-blue text-[#A0A0A0] hover:text-white hover:bg-white/5 transition-all"
              >
                <Shield className="w-4 h-4" /> Security Layers
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <div className="flex-1 min-w-0">

        <TabsContent value="profile" className="mt-0">
          <Card className="border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/40">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Personal <span className="text-primary italic">Identity</span></CardTitle>
              <CardDescription className="text-[#A0A0A0] font-medium uppercase tracking-widest text-[10px] mt-1">Manage your individual system credentials</CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <form onSubmit={handleSaveProfile} className="space-y-8">
                <div className="flex flex-col md:flex-row items-center md:items-start gap-10 mb-12">
                  <div className="relative group">
                    <div className={cn(
                      "w-32 h-32 rounded-full overflow-hidden border-4 relative z-10 bg-black/60 shadow-2xl transition-all duration-500",
                      avatarError ? "border-red-500/50 shadow-red-500/20" : "border-white/5 hover:border-primary/50 shadow-black"
                    )}>
                      {avatarPreview || (profile?.photoURL && !isAvatarRemoved) ? (
                        <img 
                          src={avatarPreview || profile?.photoURL || ""} 
                          alt="" 
                          referrerPolicy="no-referrer" 
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-primary/10 transition-colors group-hover:bg-primary/20">
                          {profile?.displayName ? (
                            <span className="text-4xl font-black text-primary uppercase tracking-tighter">
                              {profile.displayName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </span>
                          ) : (
                            <>
                              <User className="w-12 h-12 mb-1 text-primary/40" />
                              <span className="text-[7px] font-black uppercase tracking-[0.2em] text-primary/40">No Profile Data</span>
                            </>
                          )}
                        </div>
                      )}
                      
                      {/* Interactive Overlay */}
                      <div 
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-all duration-300 backdrop-blur-[2px]"
                        onClick={() => avatarInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const file = e.dataTransfer.files?.[0];
                          if (file) {
                            const mockEvent = { target: { files: [file] } } as any;
                            handleAvatarUpload(mockEvent);
                          }
                        }}
                      >
                        <div className="text-center transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                          <Upload className="w-6 h-6 text-white mx-auto mb-2" />
                          <p className="text-[8px] font-black text-white uppercase tracking-[0.2em]">Deploy Asset</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Premium Glow Ring */}
                    <div className="absolute inset-[-8px] rounded-full border border-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                    <div className="absolute inset-[-12px] rounded-full border border-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 delay-100 pointer-events-none" />
                  </div>

                  <div className="flex-1 space-y-5 text-center md:text-left">
                    <div className="space-y-1">
                      <h4 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">
                        {profile?.displayName || "System Operator"}
                      </h4>
                      <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1 rounded-full">
                          <ShieldCheck className="w-3 h-3 text-primary" />
                          <span className="text-primary font-black uppercase tracking-[0.2em] text-[8px]">{profile?.role} Clearance</span>
                        </div>
                        <span className="text-white/30 font-bold uppercase tracking-[0.3em] text-[8px] bg-white/5 px-3 py-1 rounded-full">ID: {profile?.uid?.slice(0, 8)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                      <input 
                        type="file" 
                        ref={avatarInputRef} 
                        className="hidden" 
                        accept="image/png,image/jpeg,image/jpg,image/webp" 
                        onChange={handleAvatarUpload} 
                      />
                      <Button 
                        variant="outline" 
                        type="button" 
                        onClick={() => avatarInputRef.current?.click()}
                        className="bg-white/5 hover:bg-primary/20 text-white hover:text-primary border-white/10 hover:border-primary/50 rounded-xl h-10 px-6 font-black uppercase tracking-widest text-[10px] transition-all"
                      >
                        Upload New Avatar
                      </Button>
                      {(avatarPreview || profile?.photoURL) && !isAvatarRemoved && (
                        <Button 
                          variant="ghost" 
                          type="button" 
                          onClick={handleRemoveAvatar}
                          className="text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded-xl h-10 px-6 font-black uppercase tracking-widest text-[10px] transition-all"
                        >
                          <Trash2 className="w-3 h-3 mr-2" />
                          Remove
                        </Button>
                      )}
                    </div>

                    {avatarError && (
                      <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl inline-block animate-in fade-in slide-in-from-top-2">
                        <p className="text-red-400 text-[9px] font-black uppercase tracking-widest flex items-center">
                          <ShieldAlert className="w-3 h-3 mr-2" />
                          {avatarError}
                        </p>
                      </div>
                    )}
                    
                    <div className="space-y-1">
                      <p className="text-[9px] text-[#A0A0A0] font-medium uppercase tracking-[0.2em] leading-relaxed">
                        Required Parameters: PNG | WEBP | JPG (Max 5MB)
                      </p>
                      <p className="text-[8px] text-white/20 font-black uppercase tracking-[0.2em] leading-relaxed italic">
                        * Avatar preview updated locally. Permanent cloud save occurs upon profile authorization.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Public Display Name</Label>
                    <StableInput 
                      id="displayName" 
                      className="bg-[#1A1A1A] border-white/20 text-white rounded-xl h-14 font-black uppercase tracking-widest text-[11px] focus:ring-primary/40 shadow-inner px-6"
                      value={profile?.displayName || ""} 
                      onValueChange={async (val) => {
                        if (profile?.uid) {
                          await updateDoc(doc(db, "users", profile.uid), { displayName: val });
                          toast.success("Identity updated");
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">System Email</Label>
                    <Input 
                      key={profile?.uid ? 'loaded' : 'loading'}
                      id="email" 
                      name="email" 
                      defaultValue={profile?.email || ""} 
                      placeholder="email@example.com" 
                      className="bg-[#1A1A1A] border-white/20 text-white rounded-xl h-14 font-black uppercase tracking-widest text-[11px] focus:ring-primary/40 shadow-inner px-6" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Access Level</Label>
                    {profile?.role === "admin" ? (
                      <Select 
                        key={profile?.uid ? 'loaded' : 'loading'}
                        name="role" 
                        defaultValue={profile?.role || "technician"}
                      >
                        <SelectTrigger className="bg-[#1A1A1A] border-white/20 text-white rounded-xl h-14 font-black uppercase tracking-widest text-[10px] focus:ring-primary/40 shadow-inner">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#151515] border-white/10 text-white">
                          <SelectItem value="admin" className="focus:bg-primary/20 focus:text-primary">Admin</SelectItem>
                          <SelectItem value="manager" className="focus:bg-primary/20 focus:text-primary">Manager</SelectItem>
                          <SelectItem value="technician" className="focus:bg-primary/20 focus:text-primary">Technician</SelectItem>
                          <SelectItem value="office" className="focus:bg-primary/20 focus:text-primary">Office</SelectItem>
                          <SelectItem value="read-only" className="focus:bg-primary/20 focus:text-primary">Read-only</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-4 p-5 bg-[#1A1A1A] rounded-2xl border border-white/20 shadow-inner group transition-all">
                          <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                            <Lock className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-black text-white uppercase tracking-widest text-[11px] leading-tight">
                              {profile?.role === "owner" ? "Owner / Admin Access" : (profile?.role || "Incomplete Profile")}
                            </span>
                            <span className="text-[8px] text-primary/60 font-bold uppercase tracking-widest">
                              {profile?.role === "owner" ? "Full Permissions Master" : "Active Security Protocol"}
                            </span>
                          </div>
                          <input type="hidden" name="role" value={profile?.role || ""} />
                          <Badge variant="outline" className="ml-auto text-[8px] uppercase font-black border-primary/30 bg-primary/5 text-primary tracking-tighter">
                            {profile?.role === "owner" ? "Absolute Access" : "Identity Locked"}
                          </Badge>
                        </div>
                        <p className="text-[9px] text-[#A0A0A0] font-medium uppercase tracking-widest ml-1 flex items-center gap-1.5 italic">
                          <AlertCircle className="w-3 h-3" />
                          Role synchronization is restricted. Contact a system administrator to request clearance level modification.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <Button type="submit" className="bg-primary hover:opacity-90 text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-[1.02]" disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Authorize Profile Update
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="mt-0">
          <Card className="border border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/40 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Staff <span className="text-primary italic">Management</span></CardTitle>
                <CardDescription className="text-[#A0A0A0] font-medium uppercase tracking-widest text-[10px] mt-1">Manage your team members and their access levels</CardDescription>
              </div>
              <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
                <DialogTrigger render={
                  <Button className="bg-primary hover:opacity-90 text-white font-black rounded-xl h-12 px-6 uppercase tracking-widest text-[10px] shadow-glow-blue transition-all hover:scale-[1.02]">
                    <Plus className="w-4 h-4 mr-2" /> Add Staff Intelligence
                  </Button>
                } />
                <DialogContent className="bg-[#0B0B0B] border border-white/10 p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black sm:max-w-[500px]">
                  <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                        <Users className="w-6 h-6" />
                      </div>
                      <div>
                        <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">Authorize Staff Intelligence</DialogTitle>
                        <p className="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.2em] mt-1">Personnel Access Protocol</p>
                      </div>
                    </div>
                  </DialogHeader>
                  <div className="p-8 space-y-8">
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Google Identity (Email)</Label>
                        <Input 
                          id="staffEmail" 
                          placeholder="staff@gmail.com" 
                          value={newStaffEmail} 
                          onChange={(e) => setNewStaffEmail(e.target.value)} 
                          className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/20"
                        />
                        <p className="text-[9px] text-[#A0A0A0]/60 font-black uppercase tracking-widest leading-relaxed">The operative must authenticate using this specific Google account.</p>
                      </div>
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Clearance Level (Role)</Label>
                        <Select value={newStaffRole} onValueChange={setNewStaffRole}>
                          <SelectTrigger className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-black uppercase tracking-widest text-[10px] focus:ring-primary/20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0B0B0B] border border-white/10 text-white">
                            <SelectItem value="admin" className="font-black focus:bg-white/5 focus:text-white">ADMINISTRATOR</SelectItem>
                            <SelectItem value="manager" className="font-black focus:bg-white/5 focus:text-white">MANAGER</SelectItem>
                            <SelectItem value="technician" className="font-black focus:bg-white/5 focus:text-white">TECHNICIAN</SelectItem>
                            <SelectItem value="office" className="font-black focus:bg-white/5 focus:text-white">OFFICE OPS</SelectItem>
                            <SelectItem value="read-only" className="font-black focus:bg-white/5 focus:text-white">READ-ONLY</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 pt-6 border-t border-white/5">
                      <Button 
                        variant="ghost" 
                        onClick={() => setIsStaffDialogOpen(false)} 
                        className="flex-1 text-[#A0A0A0] hover:text-white font-black uppercase tracking-widest text-[10px] h-14"
                      >
                        Abort
                      </Button>
                      <Button 
                        onClick={handleAddStaff} 
                        className="flex-[2] bg-primary hover:opacity-90 text-white font-black rounded-2xl h-14 px-8 uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-105"
                      >
                        Authorize Operative
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-8">
              <div className="space-y-4">
                {staff.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all duration-300">
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 bg-black/60 rounded-2xl overflow-hidden border border-white/10 shadow-xl flex items-center justify-center">
                        {member.photoURL ? (
                          <img src={member.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User className="w-6 h-6 text-white/20" />
                        )}
                      </div>
                      <div>
                        <p className="font-black text-white uppercase tracking-tight text-lg">{member.displayName || "New User"}</p>
                        <p className="text-[10px] text-[#A0A0A0] font-black uppercase tracking-widest">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Select 
                        key={member.id}
                        defaultValue={member.role} 
                        onValueChange={(val) => handleUpdateStaffRole(member.id, val)}
                        disabled={member.email === "flatlinedetail@gmail.com"}
                      >
                        <SelectTrigger className="w-[160px] bg-black/60 border-white/10 text-white font-black uppercase tracking-widest text-[10px] h-10 rounded-xl focus:ring-primary/20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0B0B0B] border border-white/10 text-white">
                          <SelectItem value="admin" className="focus:bg-white/5 focus:text-white">Admin</SelectItem>
                          <SelectItem value="manager" className="focus:bg-white/5 focus:text-white">Manager</SelectItem>
                          <SelectItem value="technician" className="focus:bg-white/5 focus:text-white">Technician</SelectItem>
                          <SelectItem value="office" className="focus:bg-white/5 focus:text-white">Office</SelectItem>
                          <SelectItem value="read-only" className="focus:bg-white/5 focus:text-white">Read-only</SelectItem>
                        </SelectContent>
                      </Select>
                      {member.email !== "flatlinedetail@gmail.com" && (
                        <DeleteConfirmationDialog
                          trigger={
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-10 w-10 text-white hover:text-white hover:bg-red-500 bg-red-500/10 rounded-xl transition-all duration-300"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Terminate Access?"
                          itemName={member.email}
                          onConfirm={() => handleDeleteStaff(member.id)}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl mt-8">
            <CardHeader className="p-8 border-b border-white/5 bg-black/40">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Commission <span className="text-primary italic">Architecture</span></CardTitle>
              <CardDescription className="text-[#A0A0A0] font-medium uppercase tracking-widest text-[10px] mt-1">Set default technician payout protocols for completed operations</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Default Commission Type</Label>
                  <Select 
                    value={settings?.commissionType || "percentage"} 
                    onValueChange={(val: "percentage" | "flat") => setSettings(prev => prev ? { ...prev, commissionType: val } : null)}
                  >
                    <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-black uppercase tracking-widest text-[10px] focus:ring-primary/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0B0B0B] border border-white/10 text-white">
                      <SelectItem value="percentage" className="focus:bg-white/5 focus:text-white">Percentage (%)</SelectItem>
                      <SelectItem value="flat" className="focus:bg-white/5 focus:text-white">Flat Fee ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Default Commission Rate</Label>
                  <div className="relative">
                    <StableInput 
                      type="text" 
                      inputMode="decimal"
                      value={settings?.commissionRate?.toString() || ""} 
                      onValueChange={(val) => setSettings(prev => prev ? { ...prev, commissionRate: parseFloat(val) || 0 } : null)}
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold pl-10 focus:ring-primary/20"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary">
                      {settings?.commissionType === "percentage" ? <Percent className="w-4 h-4" /> : <DollarIcon className="w-4 h-4" />}
                    </div>
                  </div>
                </div>
              </div>
              <Button 
                onClick={() => handleSaveSettings(settings || {})} 
                className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-[1.02]"
              >
                Save Commission Protocol
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communications" className="mt-0">
          <Card className="border border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/40 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Communication <span className="text-primary italic">Intelligence</span></CardTitle>
                <CardDescription className="text-[10px] text-[#A0A0A0] font-black uppercase tracking-widest mt-1">Configure Smart SMS and Client Messaging Protocols</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5 px-4 h-10 rounded-xl font-black uppercase tracking-widest text-[10px]">
                  Twilio Integrated
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-12">
              {/* Twilio Configuration Section */}
              <div className="space-y-8">
                <div className="flex items-center justify-between p-6 bg-primary/5 rounded-2xl border border-primary/10">
                  <div className="space-y-1">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading flex items-center gap-3">
                      <Smartphone className="w-6 h-6 text-primary" />
                      Twilio Core Configuration
                    </h3>
                    <p className="text-xs text-[#A0A0A0] font-medium leading-relaxed">Secure credentials for your SMS transmission gateway.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Messaging Engine</Label>
                    <Switch 
                      checked={settings?.twilioSettings?.enabled ?? false} 
                      onCheckedChange={(val) => setSettings(prev => prev ? { 
                        ...prev,
                        twilioSettings: { ...(prev.twilioSettings || { enabled: false, accountSid: "", authToken: "", phoneNumber: "" }), enabled: val } 
                      } : null)}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </div>

                <div className={cn(
                  "grid grid-cols-1 md:grid-cols-2 gap-8 transition-all duration-500",
                  !(settings?.twilioSettings?.enabled) && "opacity-50 grayscale"
                )}>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Account SID</Label>
                    <Input 
                      type="password"
                      value={settings?.twilioSettings?.accountSid || ""}
                      onChange={(e) => updateTwilioSetting("accountSid", e.target.value)}
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Auth Token</Label>
                    <Input 
                      type="password"
                      value={settings?.twilioSettings?.authToken || ""}
                      onChange={(e) => updateTwilioSetting("authToken", e.target.value)}
                      placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Twilio Phone Number</Label>
                    <Input 
                      value={settings?.twilioSettings?.phoneNumber || ""}
                      onChange={(e) => updateTwilioSetting("phoneNumber", e.target.value)}
                      placeholder="+15550000000"
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Default Business Number (Fallback)</Label>
                    <Input 
                      value={settings?.businessPhone || ""}
                      onChange={(e) => setSettings(prev => prev ? { ...prev, businessPhone: e.target.value } : null)}
                      placeholder="+15551112222"
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-6 pt-6 border-t border-white/5">
                  <div className="flex-1 space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Transmission Test Protocol</Label>
                    <div className="flex gap-4">
                      <Input 
                        value={settings?.twilioSettings?.testPhone || ""}
                        onChange={(e) => updateTwilioSetting("testPhone", e.target.value)}
                        placeholder="Test Mobile Number"
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold flex-1"
                      />
                      <Button 
                        variant="outline"
                        onClick={async () => {
                          if (!settings?.twilioSettings?.testPhone) {
                            toast.error("Please provide a test mobile number.");
                            return;
                          }
                          const toastId = toast.loading("Deploying test transmission...");
                          try {
                            const response = await fetch('/api/messages/sms', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                to: settings.twilioSettings.testPhone,
                                body: `[DetailFlow Control] Transmission test successful. Communication system online.`
                              })
                            });
                            if (response.ok) {
                              toast.success("Test transmission successful.", { id: toastId });
                            } else {
                              const err = await response.json();
                              toast.error(`Transmission failed: ${err.error?.message || response.statusText}`, { id: toastId });
                            }
                          } catch (error: any) {
                            toast.error(`Critical system failure: ${error.message}`, { id: toastId });
                          }
                        }}
                        className="bg-primary/10 border-primary/20 text-primary hover:bg-primary/20 h-12 px-6 rounded-xl font-black uppercase tracking-widest text-[10px]"
                      >
                        <Send className="w-4 h-4 mr-2" /> Send Test SMS
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SMS Templates Section */}
              <div className="space-y-8 pt-12 border-t border-white/5">
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading flex items-center gap-3">
                    <Bell className="w-6 h-6 text-primary" />
                    Transaction Templates
                  </h3>
                  <p className="text-xs text-[#A0A0A0] font-medium leading-relaxed">Dynamic message payloads for automated business events.</p>
                </div>

                <div className="grid grid-cols-1 gap-12">
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Booking Confirmation Payload</Label>
                        <StableTextarea 
                          value={settings?.smsTemplates?.bookingConfirmation || ""}
                          onValueChange={(val) => setSettings(prev => prev ? { 
                            ...prev,
                            smsTemplates: { ...(prev.smsTemplates || {}), bookingConfirmation: val } 
                          } : null)}
                          rows={4}
                          className="bg-black/40 border-white/10 text-white rounded-2xl font-medium p-4 focus:ring-primary/20"
                        />
                         <p className="text-[9px] text-[#A0A0A0]/40 font-mono uppercase tracking-widest">Vars: {"{{clientName}}, {{service}}, {{date}}, {{time}}"}</p>
                      </div>
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Appointment Reminder (24h/2h)</Label>
                        <StableTextarea 
                          value={settings?.smsTemplates?.appointmentReminder || ""}
                          onValueChange={(val) => setSettings(prev => prev ? { 
                            ...prev,
                            smsTemplates: { ...(prev.smsTemplates || {}), appointmentReminder: val } 
                          } : null)}
                          rows={4}
                          className="bg-black/40 border-white/10 text-white rounded-2xl font-medium p-4 focus:ring-primary/20"
                        />
                         <p className="text-[9px] text-[#A0A0A0]/40 font-mono uppercase tracking-widest">Vars: {"{{clientName}}, {{time}}, {{date}}, {{businessName}}"}</p>
                      </div>
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Technician On The Way</Label>
                        <StableTextarea 
                          value={settings?.smsTemplates?.technicianOnWay || ""}
                          onValueChange={(val) => setSettings(prev => prev ? { 
                            ...prev,
                            smsTemplates: { ...(prev.smsTemplates || {}), technicianOnWay: val } 
                          } : null)}
                          rows={4}
                          className="bg-black/40 border-white/10 text-white rounded-2xl font-medium p-4 focus:ring-primary/20"
                        />
                         <p className="text-[9px] text-[#A0A0A0]/40 font-mono uppercase tracking-widest">Vars: {"{{clientName}}, {{techName}}, {{eta}}"}</p>
                      </div>
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Job Completed / Thank You</Label>
                        <StableTextarea 
                          value={settings?.smsTemplates?.jobCompleted || ""}
                          onValueChange={(val) => setSettings(prev => prev ? { 
                            ...prev,
                            smsTemplates: { ...(prev.smsTemplates || {}), jobCompleted: val } 
                          } : null)}
                          rows={4}
                          className="bg-black/40 border-white/10 text-white rounded-2xl font-medium p-4 focus:ring-primary/20"
                        />
                         <p className="text-[9px] text-[#A0A0A0]/40 font-mono uppercase tracking-widest">Vars: {"{{clientName}}, {{businessName}}, {{invoiceLink}}"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Button 
                onClick={() => handleSaveSettings(settings)}
                disabled={isSaving}
                className="w-full bg-primary hover:opacity-90 text-white font-black uppercase tracking-[0.2em] h-14 rounded-xl text-xs shadow-glow-blue transition-all hover:scale-[1.01] mt-12"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Synchronize Communication Protocol
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="business" className="mt-0">
          <Card className="border border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/40">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading header-glow">Business <span className="text-primary italic">Intelligence</span></CardTitle>
              <CardDescription className="text-[#A0A0A0] font-medium uppercase tracking-widest text-[10px] mt-1">Configure asset logistics and document identities</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2 col-span-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Customer-Facing Invoice Address</Label>
                  <AddressInput 
                    defaultValue={settings?.invoiceAddress}
                    onAddressSelect={(address) => handleSaveSettings({ invoiceAddress: address })}
                    placeholder="Address shown on invoices and client communications"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Business Name</Label>
                  <StandardInput 
                    id="businessName" 
                    className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/20"
                    placeholder="e.g. Apex Auto Spa"
                    value={settings?.businessName || ""} 
                    onValueChange={(val) => setSettings(prev => prev ? { ...prev, businessName: val } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Business Email</Label>
                  <StandardInput 
                    id="businessEmail" 
                    variant="email"
                    className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/20"
                    placeholder="contact@business.com"
                    value={settings?.businessEmail || ""} 
                    onValueChange={(val) => setSettings(prev => prev ? { ...prev, businessEmail: val } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Business Phone</Label>
                  <StandardInput 
                    id="businessPhone" 
                    variant="phone"
                    className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/20"
                    placeholder="(555) 000-0000"
                    value={settings?.businessPhone || ""} 
                    onValueChange={(val) => setSettings(prev => prev ? { ...prev, businessPhone: val } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Default Tax Rate (%)</Label>
                  <StandardInput 
                    id="taxRate" 
                    variant="percentage"
                    className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/20"
                    value={settings?.taxRate || 0} 
                    onValueChange={(num) => setSettings(prev => prev ? { ...prev, taxRate: num } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Service Fee Naming (Global)</Label>
                  <StandardInput 
                    id="serviceFeeLabel" 
                    className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/20"
                    placeholder="e.g. Mobile Service Fee, Distance Fee"
                    value={settings?.serviceFeeLabel || "Travel Fee"} 
                    onValueChange={(val) => setSettings(prev => prev ? { ...prev, serviceFeeLabel: val } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Currency</Label>
                  <Input id="currency" value={settings?.currency || "USD"} disabled className="bg-black/20 border-white/5 text-[#A0A0A0]/60 rounded-xl h-12 font-bold cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Timezone</Label>
                  <StableInput 
                    id="timezone" 
                    className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/20"
                    value={settings?.timezone || ""} 
                    onValueChange={(val) => setSettings(prev => prev ? { ...prev, timezone: val } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Default Technician Commission (%)</Label>
                  <NumberInput 
                    id="commissionRate" 
                    className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/20"
                    value={settings?.commissionRate || 0} 
                    onValueChange={(num) => setSettings(prev => prev ? { ...prev, commissionRate: num } : null)}
                  />
                </div>
                
                <div className="space-y-4 col-span-2 pt-8 border-t border-white/5">
                  <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Cancellation Protocol</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Cancellation Fee Amount</Label>
                      <NumberInput 
                        id="cancellationFeeAmount" 
                        className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/20"
                        value={settings?.cancellationFeeAmount || 0} 
                        onValueChange={(num) => setSettings(prev => prev ? { ...prev, cancellationFeeAmount: num } : null)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Fee Calculus (Type)</Label>
                      <Select 
                        value={settings?.cancellationFeeType || "flat"} 
                        onValueChange={(val: any) => setSettings(prev => prev ? { ...prev, cancellationFeeType: val } : null)}
                      >
                        <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20">
                          <SelectValue placeholder="Select Fee Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0B0B0B] border border-white/10 text-white">
                          <SelectItem value="flat" className="font-bold focus:bg-white/5 focus:text-white">Flat Amount ($)</SelectItem>
                          <SelectItem value="percentage" className="font-bold focus:bg-white/5 focus:text-white">Percentage of Total (%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 pt-8">
                <Button 
                  onClick={() => handleSaveSettings(settings || {})} 
                  className="bg-primary hover:opacity-90 text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-[1.02] w-full"
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Authorize Business Update
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Business Hours */}
          <div className="mt-8"></div>
          <Card className="border border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/40">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading header-glow">Business <span className="text-primary italic">Hours</span></CardTitle>
              <CardDescription className="text-[#A0A0A0] font-medium uppercase tracking-widest text-[10px] mt-1">Configure normal operating hours and after-hours protocol</CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <div className="space-y-6">
                {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((dayName) => {
                  const dayData = settings?.businessHours ? (settings.businessHours as any)[dayName] : { isOpen: true, openTime: "08:00", closeTime: "18:00" };
                  return (
                    <div key={dayName} className="flex items-center gap-6 p-4 rounded-xl border border-white/5 bg-black/20">
                      <div className="w-32 flex items-center gap-3">
                        <Switch 
                          checked={dayData?.isOpen ?? true}
                          onCheckedChange={(v) => {
                            setSettings(prev => prev ? {
                              ...prev,
                              businessHours: {
                                ...(prev.businessHours as any),
                                [dayName]: { ...(prev.businessHours as any)?.[dayName], isOpen: v }
                              }
                            } : null)
                          }}
                          className="data-[state=checked]:bg-primary"
                        />
                        <Label className="font-bold uppercase tracking-widest text-white">{dayName}</Label>
                      </div>
                      
                      <div className={`flex flex-1 items-center gap-4 transition-opacity ${!dayData?.isOpen ? 'opacity-20 pointer-events-none' : ''}`}>
                        <div className="flex-1 space-y-1">
                          <Label className="text-[10px] uppercase font-black tracking-widest text-[#A0A0A0]">Open</Label>
                          <Input 
                            type="time" 
                            className="bg-black/60 border-white/10 rounded-lg text-white font-bold h-11 focus:ring-2 focus:ring-primary/20"
                            value={dayData?.openTime || "08:00"}
                            onChange={(e) => {
                              setSettings(prev => prev ? {
                                ...prev,
                                businessHours: {
                                  ...(prev.businessHours as any),
                                  [dayName]: { ...(prev.businessHours as any)?.[dayName], openTime: e.target.value }
                                }
                              } : null)
                            }}
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <Label className="text-[10px] uppercase font-black tracking-widest text-[#A0A0A0]">Close</Label>
                          <Input 
                            type="time" 
                            className="bg-black/60 border-white/10 rounded-lg text-white font-bold h-11 focus:ring-2 focus:ring-primary/20"
                            value={dayData?.closeTime || "18:00"}
                            onChange={(e) => {
                              setSettings(prev => prev ? {
                                ...prev,
                                businessHours: {
                                  ...(prev.businessHours as any),
                                  [dayName]: { ...(prev.businessHours as any)?.[dayName], closeTime: e.target.value }
                                }
                              } : null)
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-6 mt-6 border-t border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="space-y-1">
                      <Label className="text-white font-black uppercase tracking-widest">After-Hours Protocol</Label>
                      <p className="text-xs text-white font-medium tracking-tight">Allow booking outside normal business hours with a conditional fee.</p>
                    </div>
                    <Switch 
                      checked={settings?.businessHours?.allowAfterHours || false}
                      onCheckedChange={(val) => setSettings(prev => prev ? { 
                        ...prev, 
                        businessHours: { ...(prev.businessHours as any), allowAfterHours: val } 
                       } : null)}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                  
                  {settings?.businessHours?.allowAfterHours && (
                    <div className="pt-4 grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-2">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white">After-Hours Fee Amount ($)</Label>
                        <NumberInput 
                          id="afterHoursFeeAmount" 
                          className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/20"
                          value={settings?.businessHours?.afterHoursFeeAmount || 0} 
                          onValueChange={(num) => setSettings(prev => prev ? { 
                            ...prev, 
                            businessHours: { ...(prev.businessHours as any), afterHoursFeeAmount: num } 
                          } : null)}
                        />
                      </div>
                      <Button 
                         onClick={() => handleSaveSettings(settings || {})} 
                         className="bg-primary hover:opacity-90 text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-[1.02] w-full"
                         disabled={isSaving}
                      >
                         {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                         Authorize Business Update
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 pt-8 border-t border-white/5 mt-8">
                <Button 
                  onClick={() => handleSaveSettings(settings || {})} 
                  className="bg-primary hover:opacity-90 text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-[1.02] w-full"
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Authorize Business Update
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Travel Pricing Merged */}
          <div className="mt-8"></div>
          <Card className="border border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/40">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Mileage & <span className="text-primary italic">Travel Logistics</span></CardTitle>
              <CardDescription className="text-white font-medium uppercase tracking-widest text-[10px] mt-1">Configure asset logistics and travel premiums</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-12">
              <div className="flex items-center justify-between p-6 bg-primary/5 rounded-2xl border border-primary/10">
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading flex items-center gap-3">
                    <Truck className="w-6 h-6 text-primary" />
                    Protocol Status
                  </h3>
                  <p className="text-xs text-white font-medium leading-relaxed">Toggle the entire travel premium architecture on or off.</p>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white">Status Toggle</Label>
                  <Switch 
                    checked={settings?.travelPricing?.enabled ?? true} 
                    onCheckedChange={(checked) => {
                      if (!settings) return;
                      handleSaveSettings({ 
                        travelPricing: { 
                          ...settings.travelPricing,
                          enabled: checked 
                        } 
                      });
                    }}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
              </div>
              
              {settings?.travelPricing.enabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="col-span-2 p-6 bg-primary/5 rounded-2xl border border-primary/10 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-white font-black uppercase tracking-widest text-[10px]">Calculation Strategy</Label>
                        <p className="text-xs text-white font-medium">Select the protocol for determining travel premiums.</p>
                      </div>
                      <Select 
                        value={settings?.travelPricing?.mode || "mileage"} 
                        onValueChange={(val: "mileage" | "zones" | "map_zones") => {
                          if (!settings) return;
                          handleSaveSettings({ 
                            travelPricing: { 
                              ...settings.travelPricing,
                              mode: val 
                            } 
                          });
                        }}
                      >
                        <SelectTrigger className="w-[200px] bg-black/40 border-white/10 text-white font-bold h-12 rounded-xl focus:ring-primary/20">
                          <SelectValue placeholder="Select Mode" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0B0B0B] border border-white/10 text-white font-bold">
                          <SelectItem value="mileage" className="focus:bg-white/5 focus:text-white">Mileage Based</SelectItem>
                          <SelectItem value="zones" className="focus:bg-white/5 focus:text-white">Radius Zones</SelectItem>
                          <SelectItem value="map_zones" className="focus:bg-white/5 focus:text-white">Map Boundaries</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2 col-span-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Internal Tactical Base (Private location for distance logic)</Label>
                    <AddressInput 
                      defaultValue={settings?.baseAddress}
                      onAddressSelect={(address, lat, lng) => handleSaveSettings({ baseAddress: address, baseLatitude: lat, baseLongitude: lng })}
                      placeholder="Coordinates home base (Internal use only)"
                    />
                  </div>

                  {settings?.travelPricing.mode === "mileage" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 col-span-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="space-y-2">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Rate Per Mile ($)</Label>
                        <NumberInput 
                          id="pricePerMile" 
                          placeholder="e.g. 1.50"
                          className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/20"
                          value={travelPricingInputs.pricePerMile} 
                          onValueChange={(num) => {
                            const val = num.toString();
                            setTravelPricingInputs(prev => ({ ...prev, pricePerMile: val }));
                            if (settings) {
                              handleSaveSettings({ travelPricing: { ...settings.travelPricing, pricePerMile: num } });
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Free Range Threshold (One Way Miles)</Label>
                        <NumberInput 
                          id="freeMilesThreshold" 
                          placeholder="e.g. 10"
                          className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/20"
                          value={travelPricingInputs.freeMilesThreshold} 
                          onValueChange={(num) => {
                            const val = num.toString();
                            setTravelPricingInputs(prev => ({ ...prev, freeMilesThreshold: val }));
                            if (settings) {
                              handleSaveSettings({ travelPricing: { ...settings.travelPricing, freeMilesThreshold: num } });
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Floor Travel Fee ($)</Label>
                        <NumberInput 
                          id="minTravelFee" 
                          placeholder="e.g. 0"
                          className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/20"
                          value={travelPricingInputs.minTravelFee} 
                          onValueChange={(num) => {
                            const val = num.toString();
                            setTravelPricingInputs(prev => ({ ...prev, minTravelFee: val }));
                            if (settings) {
                              handleSaveSettings({ travelPricing: { ...settings.travelPricing, minTravelFee: num } });
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Ceiling Travel Fee ($)</Label>
                        <NumberInput 
                          id="maxTravelFee" 
                          placeholder="e.g. 100"
                          className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/20"
                          value={travelPricingInputs.maxTravelFee} 
                          onValueChange={(num) => {
                            const val = num.toString();
                            setTravelPricingInputs(prev => ({ ...prev, maxTravelFee: val }));
                            if (settings) {
                              handleSaveSettings({ travelPricing: { ...settings.travelPricing, maxTravelFee: num } });
                            }
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 col-span-2">
                        <div className="space-y-1">
                          <Label className="text-white font-black uppercase tracking-widest text-[10px]">Route Optimization (Round Trip)</Label>
                          <p className="text-xs text-[#A0A0A0] font-medium tracking-tight">Calculate fee based on cumulative distance (departure and return).</p>
                        </div>
                        <Switch 
                          checked={settings?.travelPricing.roundTripToggle || false} 
                          onCheckedChange={(checked) => handleSaveSettings({ 
                            travelPricing: { ...settings!.travelPricing, roundTripToggle: checked } 
                          })}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                    </div>
                  )}

                  {settings?.travelPricing.mode === "zones" && (
                    <div className="col-span-2 pt-8 border-t border-white/5 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <Label className="text-white font-black uppercase tracking-widest text-[10px]">Service Radius Protocols</Label>
                          <p className="text-xs text-[#A0A0A0] font-medium tracking-tight">Set discrete flat fees based on incremental distance from base.</p>
                        </div>
                        <Button 
                          onClick={handleAddTravelZone}
                          className="bg-primary hover:opacity-90 text-white font-bold h-10 px-6 rounded-xl text-[10px] uppercase tracking-widest"
                        >
                          <Plus className="w-4 h-4 mr-2" /> Register Zone
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        {settings?.travelPricing.zones?.map((zone, idx) => (
                          <div key={zone.id} className="grid grid-cols-4 gap-4 p-4 bg-black/40 rounded-2xl border border-white/5 items-end group">
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Zone Alias</Label>
                              <Input 
                                value={zone.name}
                                onChange={(e) => handleUpdateTravelZone(idx, { name: e.target.value })}
                                className="bg-white/5 border-white/10 text-white font-bold h-12 rounded-xl focus:ring-primary/20"
                                placeholder="Local Area"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Min Miles</Label>
                              <Input 
                                type="number"
                                value={zone.minDistance}
                                onChange={(e) => handleUpdateTravelZone(idx, { minDistance: Number(e.target.value) })}
                                className="bg-white/5 border-white/10 text-white font-bold h-12 rounded-xl"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Max Miles</Label>
                              <Input 
                                type="number"
                                value={zone.maxDistance}
                                onChange={(e) => handleUpdateTravelZone(idx, { maxDistance: Number(e.target.value) })}
                                className="bg-white/5 border-white/10 text-white font-bold h-12 rounded-xl"
                              />
                            </div>
                            <div className="flex gap-2">
                              <div className="space-y-2 flex-1">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Flat Premium ($)</Label>
                                <Input 
                                  type="number"
                                  value={zone.fee}
                                  onChange={(e) => handleUpdateTravelZone(idx, { fee: Number(e.target.value) })}
                                  className="bg-white/5 border-white/10 text-white font-bold h-12 rounded-xl"
                                />
                              </div>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-12 w-12 text-white bg-red-500/10 hover:text-white hover:bg-red-500 rounded-xl transition-all"
                                onClick={() => handleRemoveTravelZone(idx)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {settings?.travelPricing.mode === "map_zones" && (
                    <div className="col-span-2 pt-8 border-t border-white/5 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <Label className="text-white font-black uppercase tracking-widest text-[10px]">Visual Boundary Interface</Label>
                          <p className="text-xs text-white/60 font-medium tracking-tight">Draw custom service perimeters on the map to define distinct travel premiums.</p>
                        </div>
                        <Dialog>
                          <DialogTrigger className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-10 px-6 rounded-xl text-[10px] uppercase tracking-widest flex items-center justify-center shadow-glow-blue transition-all hover:scale-105">
                            <Plus className="w-4 h-4 mr-2" /> Launch Tactical Editor
                          </DialogTrigger>
                          <DialogContent className="max-w-7xl p-0 h-[85vh] bg-black border-white/10 outline-none">
                            <MapZoneEditor 
                              baseLat={settings.baseLatitude}
                              baseLng={settings.baseLongitude}
                              zones={settings.travelPricing.mapZones || []}
                              onSave={(newZones) => handleSaveSettings({ 
                                travelPricing: { ...settings.travelPricing, mapZones: newZones } 
                              })}
                            />
                          </DialogContent>
                        </Dialog>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {settings?.travelPricing.mapZones?.map((zone) => (
                          <Card key={zone.id} className="bg-white/5 border-white/10 rounded-2xl overflow-hidden group border-b-2" style={{ borderBottomColor: zone.color }}>
                            <CardHeader className="p-4 bg-white/5 flex flex-row items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: zone.color }} />
                                <CardTitle className="text-[11px] font-black uppercase tracking-widest text-white">{zone.name}</CardTitle>
                              </div>
                              <Badge className="bg-primary/20 text-primary border-none text-[10px] font-black">${zone.fee}</Badge>
                            </CardHeader>
                            <CardContent className="p-4 text-[9px] text-white/30 font-black uppercase tracking-[0.2em]">
                              {zone.type === 'circle' 
                                ? `${(zone.radius != null ? (zone.radius / 1609.34).toFixed(2) : 0)} Mile Radius Captured`
                                : `${(zone.paths?.length || 0)} Tactical Vertices Registered`}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-8 border-t border-white/5 space-y-8 col-span-2">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading flex items-center gap-3">
                      <Link className="w-6 h-6 text-primary" />
                      Public <span className="text-primary italic">Booking Link</span>
                    </h3>
                    <div className="p-8 bg-black/40 rounded-3xl border border-white/5 space-y-6">
                      <p className="text-xs text-white/60 font-medium leading-relaxed">
                        Share this link with your clients to allow them to book appointments directly. 
                        Smart recommendations will be shown based on your current schedule.
                      </p>
                      <div className="flex gap-3">
                        <Input 
                          readOnly 
                          value={`${window.location.origin}/book`} 
                          className="bg-black/60 border-white/10 text-primary font-mono text-xs h-12 rounded-xl"
                        />
                        <Button 
                          variant="outline" 
                          className="border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl h-12 px-6 font-bold uppercase tracking-widest text-[10px]"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/book`);
                            toast.success("Booking link copied to clipboard!");
                          }}
                        >
                          Copy Link
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Button 
                    onClick={() => handleSaveSettings(settings || {})} 
                    className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-[1.02] col-span-2"
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Authorize Logistics Update
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="mt-0">
          <Card className="border border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/40">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Visual <span className="text-primary italic">Branding</span></CardTitle>
              <CardDescription className="text-[#A0A0A0] font-medium uppercase tracking-widest text-[10px] mt-1">Manage customer-facing business branding for invoices, quotes, booking, and documents</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-10">
              <div className="p-5 bg-primary/10 border border-primary/20 rounded-2xl">
                <p className="text-white font-black uppercase tracking-widest text-[10px]">DetailFlow Platform Logo</p>
                <p className="text-[#A0A0A0] text-xs font-medium mt-1">
                  DetailFlow remains the permanent app shell and login identity. Uploads here update the customer-facing business logo only.
                </p>
              </div>
              {/* Premium Logo Manager */}
              <div className="space-y-8">
                <div className="flex flex-col lg:flex-row gap-10">
                  {/* Logo Preview Canvas */}
                  <div className="flex-1 space-y-4">
                    <Label className="text-white font-black uppercase tracking-widest text-[10px] opacity-40">Customer-Facing Business Logo Preview</Label>
                    <div className={cn(
                      "relative w-full aspect-square md:aspect-video rounded-[2.5rem] border-2 border-dashed border-white/5 overflow-hidden shadow-2xl transition-all duration-500 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]",
                      logoAdjustments.background === 'dark' ? "bg-black" : 
                      logoAdjustments.background === 'light' ? "bg-white" : "bg-black/60"
                    )}>
                      {logoPreview || settings?.logoUrl ? (
                        <div className="absolute inset-0 flex items-center justify-center p-12">
                          <img 
                            src={logoPreview || settings?.logoUrl || ""} 
                            alt="Business Logo" 
                            className={cn(
                              "transition-all duration-300",
                              logoAdjustments.fit === 'cover' ? "w-full h-full object-cover" : "max-w-full max-h-full object-contain"
                            )}
                            style={{
                              transform: `translate(${logoAdjustments.x}px, ${logoAdjustments.y}px) scale(${logoAdjustments.scale}) rotate(${logoAdjustments.rotation}deg)`
                            }}
                          />
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/5 space-y-4">
                          <ImageIcon className="w-16 h-16" />
                          <span className="text-[8px] font-black uppercase tracking-[0.3em]">No Branding Data Found</span>
                        </div>
                      )}

                      {/* Translucency Overlays */}
                      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                      
                      {/* Interaction Status */}
                      <div className="absolute bottom-6 left-6 flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                          <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", (logoPreview || settings?.logoUrl) ? "bg-primary" : "bg-white/20")} />
                          <span className="text-[8px] font-black text-white uppercase tracking-widest">
                            {(logoPreview || settings?.logoUrl) ? "Asset Loaded" : "Awaiting Asset"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                          <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">BG:</span>
                          <span className="text-[8px] font-black text-primary uppercase tracking-widest leading-none">{logoAdjustments.background}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Adjustment Suite */}
                  <div className="w-full lg:w-96 space-y-8 p-8 bg-white/5 rounded-[2.5rem] border border-white/5 backdrop-blur-sm">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h4 className="text-white font-black uppercase tracking-widest text-[11px]">Business Logo Adjustment Suite</h4>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setLogoAdjustments(prev => ({
                              ...prev,
                              scale: 1,
                              x: 0,
                              y: 0,
                              rotation: 0
                            }));
                          }}
                          className="h-7 text-[8px] font-black text-white/40 hover:text-white uppercase tracking-widest"
                        >
                          <Clock className="w-3 h-3 mr-1" /> Reset
                        </Button>
                      </div>

                      {/* Zoom Logic */}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-white/40 italic">Optical Scale</Label>
                          <span className="text-[9px] font-black text-primary">{(logoAdjustments.scale ?? 1).toFixed(2)}x</span>
                        </div>
                        <Slider 
                          value={[logoAdjustments.scale]} 
                          min={0.1} 
                          max={3} 
                          step={0.01} 
                          onValueChange={(vals) => setLogoAdjustments(prev => ({ ...prev, scale: vals[0] }))}
                          className="[&_[role=slider]]:bg-primary"
                        />
                      </div>

                      {/* X Displacement */}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-white/40 italic">X-Axis Offset</Label>
                          <span className="text-[9px] font-black text-primary">{logoAdjustments.x}px</span>
                        </div>
                        <Slider 
                          value={[logoAdjustments.x]} 
                          min={-200} 
                          max={200} 
                          step={1} 
                          onValueChange={(vals) => setLogoAdjustments(prev => ({ ...prev, x: vals[0] }))}
                          className="[&_[role=slider]]:bg-primary"
                        />
                      </div>

                      {/* Y Displacement */}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-white/40 italic">Y-Axis Offset</Label>
                          <span className="text-[9px] font-black text-primary">{logoAdjustments.y}px</span>
                        </div>
                        <Slider 
                          value={[logoAdjustments.y]} 
                          min={-200} 
                          max={200} 
                          step={1} 
                          onValueChange={(vals) => setLogoAdjustments(prev => ({ ...prev, y: vals[0] }))}
                          className="[&_[role=slider]]:bg-primary"
                        />
                      </div>

                      {/* Rotation Suite */}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-white/40 italic">Rotational Angle</Label>
                          <span className="text-[9px] font-black text-primary">{logoAdjustments.rotation}°</span>
                        </div>
                        <Slider 
                          value={[logoAdjustments.rotation]} 
                          min={-180} 
                          max={180} 
                          step={1} 
                          onValueChange={(vals) => setLogoAdjustments(prev => ({ ...prev, rotation: vals[0] }))}
                          className="[&_[role=slider]]:bg-primary"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-white/40 italic">Mapping Mode</Label>
                          <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
                            <button 
                              onClick={() => setLogoAdjustments(prev => ({ ...prev, fit: 'contain' }))}
                              className={cn("flex-1 py-1 rounded text-[8px] font-black uppercase transition-all", logoAdjustments.fit === 'contain' ? "bg-primary text-white" : "text-white/40 hover:text-white")}
                            >Fit</button>
                            <button 
                              onClick={() => setLogoAdjustments(prev => ({ ...prev, fit: 'cover' }))}
                              className={cn("flex-1 py-1 rounded text-[8px] font-black uppercase transition-all", logoAdjustments.fit === 'cover' ? "bg-primary text-white" : "text-white/40 hover:text-white")}
                            >Fill</button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-white/40 italic">Canvas Env</Label>
                          <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
                            <button 
                              onClick={() => setLogoAdjustments(prev => ({ ...prev, background: 'transparent' }))}
                              className={cn("flex-1 py-1 rounded flex items-center justify-center transition-all", logoAdjustments.background === 'transparent' ? "bg-primary text-white" : "text-white/40")}
                            ><Globe className="w-3 h-3" /></button>
                            <button 
                              onClick={() => setLogoAdjustments(prev => ({ ...prev, background: 'dark' }))}
                              className={cn("flex-1 py-1 rounded flex items-center justify-center transition-all", logoAdjustments.background === 'dark' ? "bg-primary text-white" : "text-white/40")}
                            ><Lock className="w-3 h-3" /></button>
                            <button 
                              onClick={() => setLogoAdjustments(prev => ({ ...prev, background: 'light' }))}
                              className={cn("flex-1 py-1 rounded flex items-center justify-center transition-all", logoAdjustments.background === 'light' ? "bg-primary text-white" : "text-white/40")}
                            ><Check className="w-3 h-3" /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-6">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleLogoUpload}
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                  />
                  <Button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="bg-primary hover:opacity-90 text-white font-black h-12 px-8 rounded-xl uppercase tracking-widest text-[10px] shadow-glow-blue transition-all hover:scale-[1.02] min-w-[200px]"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Business Logo
                  </Button>
                  {(logoPreview || settings?.logoUrl) && (
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={handleRemoveLogo}
                      className="border-white/10 bg-white/5 text-white hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 rounded-xl h-12 px-8 font-black uppercase tracking-widest text-[10px] transition-all"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove Asset
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button 
                    type="button" 
                    onClick={handleSaveBranding}
                    disabled={isSaving || isUploading}
                    className="bg-white text-black hover:bg-gray-200 font-black h-12 px-10 rounded-xl uppercase tracking-widest text-[10px] shadow-xl transition-all hover:scale-[1.02]"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Authorize & Deploy Business Branding
                  </Button>
                </div>

                {logoError && (
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl animate-in fade-in slide-in-from-top-2">
                    <p className="text-red-400 text-[10px] font-black uppercase tracking-widest flex items-center">
                      <ShieldAlert className="w-4 h-4 mr-3" />
                      {logoError}
                    </p>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-[#A0A0A0] text-[9px] font-medium uppercase tracking-[0.2em] leading-relaxed">
                    Requirement Parameters: PNG | WEBP | JPG (MAX 5MB)
                  </p>
                  <p className="text-white/20 text-[8px] font-black uppercase tracking-[0.2em] leading-relaxed italic">
                    * Business logo adjustments are calculated locally. Permanent synchronization with cloud infrastructure requires primary authorization.
                  </p>
                </div>
              </div>

              {/* Advanced Branding Options */}
              <div className="space-y-10 pt-12 border-t border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20">
                    <Layout className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white uppercase tracking-widest">Client Profile Watermark</h4>
                    <p className="text-[10px] text-[#A0A0A0] font-medium uppercase tracking-widest">Configure the large business watermark for client headers</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Customer Watermark Asset</Label>
                      <div className="flex items-center gap-6 p-6 bg-black/40 rounded-[2rem] border border-white/5">
                        <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                          {watermarkLogoPreview || settings?.watermarkSettings?.logoUrl ? (
                            <img 
                              src={watermarkLogoPreview || settings?.watermarkSettings?.logoUrl} 
                              alt="Watermark" 
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-white/10" />
                          )}
                        </div>
                        <div className="space-y-3">
                          <input
                            type="file"
                            ref={watermarkFileInputRef}
                            onChange={handleWatermarkLogoUpload}
                            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                            className="hidden"
                          />
                          <Button 
                            type="button" 
                            size="sm"
                            onClick={() => watermarkFileInputRef.current?.click()}
                            className="bg-primary hover:bg-primary/90 text-white font-black rounded-xl h-10 px-6 uppercase tracking-widest text-[9px] shadow-glow-blue"
                          >
                            <Upload className="w-3.5 h-3.5 mr-2" /> Upload Watermark
                          </Button>
                          {(watermarkLogoPreview || settings?.watermarkSettings?.logoUrl) && (
                            <Button 
                              type="button" 
                              variant="ghost"
                              size="sm"
                              onClick={handleRemoveWatermarkLogo}
                              className="text-red-500 hover:text-red-400 font-black h-10 px-4 uppercase tracking-widest text-[9px]"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Watermark Opacity</Label>
                          <span className="text-[10px] font-black text-primary">{(settings?.watermarkSettings?.opacity || 0.10).toFixed(2)}</span>
                        </div>
                        <Slider 
                          value={[settings?.watermarkSettings?.opacity || 0.10]} 
                          min={0.05} 
                          max={0.25} 
                          step={0.01} 
                          onValueChange={(vals) => setSettings(prev => prev ? ({
                            ...prev,
                            watermarkSettings: {
                              ...(prev.watermarkSettings || { logoUrl: "", position: "center", size: "medium" }),
                              opacity: vals[0]
                            }
                          }) : null)}
                          className="[&_[role=slider]]:bg-primary"
                        />
                      </div>

                      <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Watermark Position</Label>
                        <div className="grid grid-cols-3 gap-3">
                          {["left", "center", "right"].map((pos) => (
                            <button
                              key={pos}
                              type="button"
                              onClick={() => setSettings(prev => prev ? ({
                                ...prev,
                                watermarkSettings: {
                                  ...(prev.watermarkSettings || { logoUrl: "", opacity: 0.10, size: "medium" }),
                                  position: pos as any
                                }
                              }) : null)}
                              className={cn(
                                "py-3 rounded-xl border font-black uppercase tracking-widest text-[9px] transition-all",
                                (settings?.watermarkSettings?.position || "center") === pos 
                                  ? "bg-primary border-primary text-white shadow-glow-blue" 
                                  : "bg-white/5 border-white/10 text-white/40 hover:text-white"
                              )}
                            >
                              {pos}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Watermark Size</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {["small", "medium", "large", "full"].map((sz) => (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => setSettings(prev => prev ? ({
                                ...prev,
                                watermarkSettings: {
                                  ...(prev.watermarkSettings || { logoUrl: "", opacity: 0.10, position: "center" }),
                                  size: sz as any
                                }
                              }) : null)}
                              className={cn(
                                "py-3 rounded-xl border font-black uppercase tracking-widest text-[9px] transition-all",
                                (settings?.watermarkSettings?.size || "medium") === sz 
                                  ? "bg-primary border-primary text-white shadow-glow-blue" 
                                  : "bg-white/5 border-white/10 text-white/40 hover:text-white"
                              )}
                            >
                              {sz}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Watermark Preview Simulation */}
                  <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Real-Time Header Simulation</Label>
                    <div className="relative h-64 rounded-[2rem] bg-gradient-to-r from-primary via-primary/80 to-white/40 border border-white/10 overflow-hidden">
                      {/* Watermark Logo */}
                      <div 
                        className={cn(
                          "absolute inset-0 flex items-center pointer-events-none transition-all duration-500",
                          settings?.watermarkSettings?.size === "full" ? "p-0" : "p-8",
                          (settings?.watermarkSettings?.position || "center") === "left" ? "justify-start text-left" :
                          (settings?.watermarkSettings?.position || "center") === "right" ? "justify-end text-right" : "justify-center text-center"
                        )}
                        style={{ opacity: settings?.watermarkSettings?.opacity || 0.10 }}
                      >
                        {watermarkLogoPreview || settings?.watermarkSettings?.logoUrl ? (
                          <img 
                            src={watermarkLogoPreview || settings?.watermarkSettings?.logoUrl} 
                            alt="Watermark Preview" 
                            className={cn(
                              "object-contain grayscale brightness-200 transition-all duration-500",
                              (settings?.watermarkSettings?.position || "center") === "left" ? "object-left" :
                              (settings?.watermarkSettings?.position || "center") === "right" ? "object-right" : "object-center",
                              settings?.watermarkSettings?.size === "small" ? "max-h-[25%] max-w-[25%]" :
                              settings?.watermarkSettings?.size === "large" ? "max-h-[90%] max-w-[90%]" :
                              settings?.watermarkSettings?.size === "full" ? "w-full h-full" :
                              "max-h-[60%] max-w-[60%]" // Default Medium
                            )}
                          />
                        ) : (
                          <h1 
                            className={cn(
                              "font-black text-white italic tracking-tighter uppercase select-none transition-all duration-500 w-full",
                              settings?.watermarkSettings?.size === "small" ? "text-[2vw]" :
                              settings?.watermarkSettings?.size === "large" ? "text-[6vw]" :
                              settings?.watermarkSettings?.size === "full" ? "text-[12vw] leading-none" :
                              "text-[4vw]"
                            )}
                          >
                            DETAILFLOW
                          </h1>
                        )}
                      </div>
                      
                      <div className="relative z-10 p-8 flex justify-between items-start h-full">
                        <div className="space-y-4">
                          <div className="w-16 h-16 bg-primary/20 rounded-2xl border border-white/20" />
                          <div className="space-y-2">
                            <div className="h-6 w-48 bg-white/40 rounded-lg" />
                            <div className="h-3 w-32 bg-white/20 rounded-md" />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-3">
                          <div className="h-10 w-32 bg-primary/40 rounded-xl" />
                          <div className="h-6 w-24 bg-white/20 rounded-lg" />
                        </div>
                      </div>
                    </div>
                    <p className="text-[8px] font-medium text-white/20 uppercase tracking-[0.2em] italic">
                      * This simulation roughly demonstrates how the watermark will interact with the Client Profile header layout.
                    </p>
                  </div>
                </div>
              </div>

              {/* Advanced UI Elements */}
              <div className="space-y-10">
                <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5">
                  <div className="space-y-1">
                    <Label className="text-white font-black uppercase tracking-widest text-[10px]">Document Business Logo Visibility</Label>
                    <p className="text-xs text-[#A0A0A0] font-medium">Include your business logo on invoices, quotes, reports, and customer documents.</p>
                  </div>
                  <Switch 
                    checked={settings?.showLogoOnDocuments || false}
                    onCheckedChange={(checked) => setSettings(prev => prev ? ({ ...prev, showLogoOnDocuments: checked }) : null)}
                  />
                </div>
                <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5">
                  <div className="space-y-1">
                    <Label className="text-white font-black uppercase tracking-widest text-[10px]">Watermark Protocol</Label>
                    <p className="text-xs text-[#A0A0A0] font-medium">Add a subtle watermark to the background of PDF exports.</p>
                  </div>
                  <Switch 
                    checked={!!settings?.watermarkSettings?.logoUrl}
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        setSettings(prev => prev ? ({ ...prev, watermarkSettings: { ...prev.watermarkSettings, logoUrl: "" } as any }) : null);
                        setWatermarkLogoPreview(null);
                        setWatermarkLogoFile(null);
                      } else if (watermarkFileInputRef.current) {
                        watermarkFileInputRef.current.click();
                      }
                    }}
                  />
                </div>
              </div>

              <div className="space-y-6">
                <Label className="text-white font-black uppercase tracking-widest text-[10px]">Customer-Facing Logo Scale</Label>
                <div className="pt-4 px-2">
                  <Slider 
                    value={[logoAdjustments.scale]} 
                    min={0.1}
                    max={3}
                    step={0.01}
                    onValueChange={(vals) => setLogoAdjustments(prev => ({ ...prev, scale: vals[0] }))}
                    className="[&_[role=slider]]:bg-primary" 
                  />
                </div>
                <div className="flex justify-between text-[8px] text-[#A0A0A0]/20 font-black uppercase tracking-[0.2em]">
                  <span>Minimal</span>
                  <span>Standard</span>
                  <span>Prominent</span>
                </div>
              </div>

              <div className="space-y-6">
                <Label className="text-white font-black uppercase tracking-widest text-[10px]">Header Architecture Style</Label>
                <div className="grid grid-cols-3 gap-6">
                  <Button variant="outline" className="h-28 flex flex-col gap-3 border-primary/30 bg-primary/10 text-primary rounded-2xl shadow-lg shadow-primary/5">
                    <Layout className="w-6 h-6" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Left Aligned</span>
                  </Button>
                  <Button variant="outline" className="h-28 flex flex-col gap-3 border-white/5 bg-black/40 text-white/20 hover:text-white hover:border-white/10 rounded-2xl transition-all">
                    <Layout className="w-6 h-6 rotate-90" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Centered</span>
                  </Button>
                  <Button variant="outline" className="h-28 flex flex-col gap-3 border-white/5 bg-black/40 text-white/20 hover:text-white hover:border-white/10 rounded-2xl transition-all">
                    <Layout className="w-6 h-6 rotate-180" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Right Aligned</span>
                  </Button>
                </div>
              </div>

              <Button 
                onClick={handleSaveBranding}
                disabled={isSaving}
                className="w-full bg-primary hover:opacity-90 text-white font-black uppercase tracking-[0.2em] h-14 rounded-xl text-xs shadow-glow-blue transition-all hover:scale-[1.01] mt-12"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Authorize Final Business Branding Protocol
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="mt-0">
          <div className="grid grid-cols-1 gap-8">
            <Card className="border border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
              <CardHeader className="p-8 border-b border-white/5 bg-black/40 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Service <span className="text-primary italic">Protocols</span></CardTitle>
                  <CardDescription className="text-[10px] text-[#A0A0A0] font-black uppercase tracking-widest mt-1">Manage your primary detailing packages</CardDescription>
                </div>
                <Button size="sm" className="bg-primary hover:opacity-90 text-white font-black rounded-xl h-10 px-4 uppercase tracking-widest text-[10px] shadow-glow-blue transition-all hover:scale-[1.02]" onClick={() => {
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
                  <Plus className="w-4 h-4 mr-2" /> Add Protocol
                </Button>
              </CardHeader>
              <CardContent className="p-8 space-y-4">
                {services.map(service => (
                  <div key={service.id} className="p-6 bg-black/40 rounded-2xl border border-white/5 hover:border-primary/30 transition-all duration-300 group">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <h4 className="font-black text-white uppercase tracking-tight text-lg">{service.name}</h4>
                        {!service.isActive && <Badge variant="secondary" className="bg-white/10 text-white/40 border-none text-[8px] uppercase font-black tracking-widest">Inactive</Badge>}
                        <Badge variant="outline" className="border-white/10 text-primary text-[8px] uppercase font-black tracking-widest">{service.category}</Badge>
                      </div>
                      <div className="flex items-center gap-2 transition-all duration-300">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-white/70 hover:text-primary hover:bg-primary/10 rounded-xl"
                          onClick={() => {
                            setEditingService(service);
                            setIsServiceDialogOpen(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <DeleteConfirmationDialog
                          trigger={
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:text-white hover:bg-red-600 bg-red-600/10 rounded-xl">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Delete Protocol?"
                          itemName={service.name}
                          onConfirm={() => handleDeleteService(service.id)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <p className="text-[8px] text-white/20 font-black uppercase tracking-[0.2em]">Base Valuation</p>
                        <p className="text-white font-black text-lg tracking-tighter">${service.basePrice}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[8px] text-white/20 font-black uppercase tracking-[0.2em]">Est. Duration</p>
                        <p className="text-white font-black text-lg tracking-tighter">{service.estimatedDuration}m</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Dialog open={isServiceDialogOpen} onOpenChange={setIsServiceDialogOpen}>
            <DialogContent className="max-w-2xl bg-[#0B0B0B] border border-white/10 p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black">
              <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">{editingService?.id ? "Modify Service Protocol" : "Initialize New Service"}</DialogTitle>
                    <p className="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.2em] mt-1">Operational Service Definition</p>
                  </div>
                </div>
              </DialogHeader>
              <form onSubmit={handleSaveService} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Protocol Designation (Name)</Label>
                    <StableInput 
                      value={editingService?.name || ""} 
                      onValueChange={val => setEditingService(prev => ({ ...prev!, name: val }))}
                      required
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Operational Brief (Description)</Label>
                    <StableTextarea 
                      value={editingService?.description || ""} 
                      onValueChange={val => setEditingService(prev => ({ ...prev!, description: val }))}
                      className="bg-black/40 border-white/10 text-white rounded-xl font-bold min-h-[100px] focus:ring-primary/20"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Mission Category</Label>
                      <Select 
                        value={editingService?.category || ""} 
                        onValueChange={(v: any) => setEditingService(prev => ({ ...prev!, category: v }))}
                      >
                        <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20">
                          <SelectValue placeholder="Select Category" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0B0B0B] border border-white/10 text-white">
                          {categories.filter(c => c.type === "service" && c.isActive).map(cat => (
                            <SelectItem key={cat.id} value={cat.name} className="font-bold focus:bg-white/5 focus:text-white">{cat.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Base Financial Value ($)</Label>
                      <NumberInput 
                        value={editingService?.basePrice || 0}
                        onValueChange={val => setEditingService(prev => ({ ...prev!, basePrice: val }))}
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Duration (Minutes)</Label>
                      <StableInput 
                        type="text"
                        inputMode="numeric"
                        value={editingService?.estimatedDuration?.toString() || ""} 
                        onValueChange={val => setEditingService(prev => ({ ...prev!, estimatedDuration: parseInt(val) || 0 }))}
                        required
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Buffer Time (Minutes)</Label>
                      <StableInput 
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 15"
                        value={editingService?.bufferTimeMinutes?.toString() || ""} 
                        onValueChange={val => setEditingService(prev => ({ ...prev!, bufferTimeMinutes: parseInt(val) || 0 }))}
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Taxable</Label>
                      <Switch 
                        checked={editingService?.isTaxable ?? true} 
                        onCheckedChange={v => setEditingService(prev => ({ ...prev!, isTaxable: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Requires Waiver</Label>
                      <Switch 
                        checked={editingService?.requiresWaiver ?? false} 
                        onCheckedChange={v => setEditingService(prev => ({ ...prev!, requiresWaiver: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Active Status</Label>
                      <Switch 
                        checked={editingService?.isActive ?? true} 
                        onCheckedChange={v => setEditingService(prev => ({ ...prev!, isActive: v }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-6 pt-6 border-t border-white/5">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Require Deposit</Label>
                      <p className="text-[10px] text-[#A0A0A0]/60">Require a deposit when booking this service</p>
                    </div>
                    <Switch 
                      checked={editingService?.depositRequired ?? false} 
                      onCheckedChange={v => setEditingService(prev => ({ ...prev!, depositRequired: v }))}
                    />
                  </div>
                  
                  {editingService?.depositRequired && (
                    <div className="grid grid-cols-2 gap-6 p-6 bg-black/20 rounded-2xl border border-white/5">
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Deposit Type</Label>
                        <Select 
                          value={editingService?.depositType || "fixed"} 
                          onValueChange={(v: "fixed" | "percentage") => setEditingService(prev => ({ ...prev!, depositType: v }))}
                        >
                          <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0B0B0B] border border-white/10">
                            <SelectItem value="fixed" className="focus:bg-white/5 focus:text-white">Fixed Amount ($)</SelectItem>
                            <SelectItem value="percentage" className="focus:bg-white/5 focus:text-white">Percentage (%)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Deposit Amount</Label>
                        <NumberInput 
                          value={editingService?.depositAmount || 0}
                          onValueChange={val => setEditingService(prev => ({ ...prev!, depositAmount: val }))}
                          className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-6 pt-6 border-t border-white/5">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Warranty Automation</Label>
                      <p className="text-[10px] text-[#A0A0A0]/60">Automatically issue warranties and track maintenance compliance for this service</p>
                    </div>
                    <Switch 
                      checked={editingService?.hasWarranty ?? false} 
                      onCheckedChange={v => setEditingService(prev => ({ ...prev!, hasWarranty: v }))}
                    />
                  </div>

                  {editingService?.hasWarranty && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-black/20 rounded-2xl border border-white/5">
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Warranty Duration (Months)</Label>
                        <StableInput 
                          type="text"
                          inputMode="numeric"
                          value={editingService?.warrantyLengthMonths?.toString() || ""} 
                          onValueChange={val => setEditingService(prev => ({ ...prev!, warrantyLengthMonths: parseInt(val) || 0 }))}
                          className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                          placeholder="e.g. 60 for 5 years"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Warranty Type</Label>
                        <StableInput 
                          type="text"
                          value={editingService?.warrantyType || ""} 
                          onValueChange={val => setEditingService(prev => ({ ...prev!, warrantyType: val }))}
                          className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                          placeholder="e.g. Ceramic Coating, PPF"
                        />
                      </div>
                      <div className="col-span-1 md:col-span-2 space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Coverage & Exclusions Details</Label>
                        <textarea 
                          value={editingService?.warrantyCoverageDetails || ""} 
                          onChange={e => setEditingService(prev => ({ ...prev!, warrantyCoverageDetails: e.target.value }))}
                          className="w-full bg-black/40 border border-white/10 text-white rounded-xl font-medium p-3 focus:ring-1 focus:ring-primary/50 outline-none resize-none min-h-[80px] text-sm"
                          placeholder="Standard coverage details and exclusions..."
                        />
                      </div>
                      <div className="flex items-center justify-between col-span-1 md:col-span-2 p-3 bg-white/5 rounded-xl border border-white/10">
                        <div className="space-y-1 mt-1">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Requires Periodic Maintenance</Label>
                          <p className="text-[10px] text-[#A0A0A0]/60 mt-1">Links directly to Maintenance Return Automation configured below</p>
                        </div>
                        <Switch 
                          checked={editingService?.warrantyMaintenanceRequired ?? false} 
                          onCheckedChange={v => setEditingService(prev => ({ ...prev!, warrantyMaintenanceRequired: v }))}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Maintenance Return Automation</Label>
                      <p className="text-[10px] text-[#A0A0A0]/60">Enable autonomous return scheduling protocols</p>
                    </div>
                    <Switch 
                      checked={editingService?.maintenanceReturnEnabled ?? false} 
                      onCheckedChange={v => setEditingService(prev => ({ ...prev!, maintenanceReturnEnabled: v }))}
                    />
                  </div>
                  
                  {editingService?.maintenanceReturnEnabled && (
                    <div className="grid grid-cols-2 gap-6 p-6 bg-black/20 rounded-2xl border border-white/5">
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Interval (Days)</Label>
                        <StableInput 
                          type="text"
                          inputMode="numeric"
                          value={editingService?.maintenanceIntervalDays?.toString() || ""} 
                          onValueChange={val => setEditingService(prev => ({ ...prev!, maintenanceIntervalDays: parseInt(val) || 0 }))}
                          className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Interval (Months)</Label>
                        <StableInput 
                          type="text"
                          inputMode="numeric"
                          value={editingService?.maintenanceIntervalMonths?.toString() || ""} 
                          onValueChange={val => setEditingService(prev => ({ ...prev!, maintenanceIntervalMonths: parseInt(val) || 0 }))}
                          className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                        />
                      </div>
                      <div className="flex items-center justify-between col-span-2 p-3 bg-white/5 rounded-xl">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Auto-create Calendar Return</Label>
                        <Switch 
                          checked={editingService?.autoCreateCalendarReturn ?? false} 
                          onCheckedChange={v => setEditingService(prev => ({ ...prev!, autoCreateCalendarReturn: v }))}
                        />
                      </div>
                      <div className="flex items-center justify-between col-span-2 p-3 bg-white/5 rounded-xl">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Auto-create Lead Follow-up</Label>
                        <Switch 
                          checked={editingService?.autoCreateLeadFollowUp ?? false} 
                          onCheckedChange={v => setEditingService(prev => ({ ...prev!, autoCreateLeadFollowUp: v }))}
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Pricing by Vehicle Size Matrix</Label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {VEHICLE_SIZES.map(size => (
                        <div key={size.value} className="space-y-2">
                          <Label className="text-[9px] font-black uppercase tracking-tighter text-[#A0A0A0]">{size.label}</Label>
                          <StableInput 
                            type="text"
                            inputMode="decimal"
                            className="bg-black/40 border-white/10 text-white h-10 rounded-lg font-bold text-xs focus:ring-primary/20"
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

                <div className="flex items-center gap-4 pt-6 border-t border-white/5">
                  <Button 
                    variant="ghost" 
                    type="button" 
                    onClick={() => setIsServiceDialogOpen(false)} 
                    className="flex-1 text-[#A0A0A0] hover:text-white font-black uppercase tracking-widest text-[10px] h-14"
                  >
                    Abort
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-[2] bg-primary hover:bg-[#2A6CFF] text-white font-black rounded-2xl h-14 px-8 uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-105"
                  >
                    Authorize Protocol
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Enhancement Add-ons */}
          <div className="grid grid-cols-1 gap-8 mt-8">
            <Card className="border border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
              <CardHeader className="p-8 border-b border-white/5 bg-black/40 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Enhancement <span className="text-primary italic">Add-ons</span></CardTitle>
                  <CardDescription className="text-[10px] text-[#A0A0A0] font-black uppercase tracking-widest mt-1">Extra services that can be added to any package</CardDescription>
                </div>
                <Button size="sm" className="bg-white/10 hover:bg-white/20 text-white font-black rounded-xl h-10 px-4 uppercase tracking-widest text-[10px] transition-all" onClick={() => {
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
                  <Plus className="w-4 h-4 mr-2" /> Add Enhancement
                </Button>
              </CardHeader>
              <CardContent className="p-8 space-y-4">
                {addons.map(addon => (
                  <div key={addon.id} className="p-6 bg-black/40 rounded-2xl border border-white/5 hover:border-primary/30 transition-all duration-300 group">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <h4 className="font-black text-white uppercase tracking-tight text-lg">{addon.name}</h4>
                        {!addon.isActive && <Badge variant="secondary" className="bg-white/10 text-white/40 border-none text-[8px] uppercase font-black tracking-widest">Inactive</Badge>}
                      </div>
                      <div className="flex items-center gap-2 transition-all duration-300">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-white/70 hover:text-primary hover:bg-primary/10 rounded-xl"
                          onClick={() => {
                            setEditingAddon(addon);
                            setIsAddonDialogOpen(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <DeleteConfirmationDialog
                          trigger={
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-white bg-red-600/10 hover:text-white hover:bg-red-600 rounded-xl">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Delete Enhancement?"
                          itemName={addon.name}
                          onConfirm={() => handleDeleteAddon(addon.id)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <p className="text-[8px] text-white/20 font-black uppercase tracking-[0.2em]">Add-on Price</p>
                        <p className="text-white font-black text-lg tracking-tighter">${addon.price}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[8px] text-white/20 font-black uppercase tracking-[0.2em]">Est. Duration</p>
                        <p className="text-white font-black text-lg tracking-tighter">+{addon.estimatedDuration}m</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Dialog open={isAddonDialogOpen} onOpenChange={setIsAddonDialogOpen}>
            <DialogContent className="max-w-xl bg-[#0B0B0B] border border-white/10 p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black">
              <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                    <Tag className="w-6 h-6" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">{editingAddon?.id ? "Modify Enhancement" : "Initialize Enhancement"}</DialogTitle>
                    <p className="text-[10px] text-white font-black uppercase tracking-[0.2em] mt-1">Operational Add-on Definition</p>
                  </div>
                </div>
              </DialogHeader>
              <form onSubmit={handleSaveAddon} className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Enhancement Designation (Name)</Label>
                    <StableInput 
                      value={editingAddon?.name || ""} 
                      onValueChange={val => setEditingAddon(prev => ({ ...prev!, name: val }))}
                      required
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Enhancement Brief (Description)</Label>
                    <StableTextarea 
                      value={editingAddon?.description || ""} 
                      onValueChange={val => setEditingAddon(prev => ({ ...prev!, description: val }))}
                      className="bg-black/40 border-white/10 text-white rounded-xl font-bold min-h-[100px] focus:ring-primary/20"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Mission Category</Label>
                      <Select 
                        value={(editingAddon as any)?.category || ""} 
                        onValueChange={(v: any) => setEditingAddon(prev => ({ ...prev!, category: v }))}
                      >
                        <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20">
                          <SelectValue placeholder="Select Category" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0B0B0B] border border-white/10 text-white">
                          {categories.filter(c => c.type === "addon" && c.isActive).map(cat => (
                            <SelectItem key={cat.id} value={cat.name} className="font-bold focus:bg-white/5 focus:text-white">{cat.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">Pricing Model</Label>
                      <Select 
                        value={editingAddon?.pricingType || "flat"} 
                        onValueChange={(val: any) => setEditingAddon(prev => ({ ...prev!, pricingType: val }))}
                      >
                        <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20">
                          <SelectValue placeholder="Select Model" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0B0B0B] border border-white/10 text-white">
                          <SelectItem value="flat" className="font-bold focus:bg-white/5 focus:text-white">Flat Fee</SelectItem>
                          <SelectItem value="hourly" className="font-bold focus:bg-white/5 focus:text-white">Hourly Rate</SelectItem>
                          <SelectItem value="block30" className="font-bold focus:bg-white/5 focus:text-white">Per 30 Minutes</SelectItem>
                          <SelectItem value="blockCustom" className="font-bold focus:bg-white/5 focus:text-white">Custom Time Block</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">
                        {editingAddon?.pricingType === "flat" || !editingAddon?.pricingType ? "Flat Price ($)" : "Rate ($)"}
                      </Label>
                      <NumberInput 
                        value={editingAddon?.pricingType === "flat" || !editingAddon?.pricingType ? (editingAddon?.price || 0) : (editingAddon?.rate || 0)}
                        onValueChange={val => {
                          if (editingAddon?.pricingType === "flat" || !editingAddon?.pricingType) {
                            setEditingAddon(prev => ({ ...prev!, price: val }));
                          } else {
                            setEditingAddon(prev => ({ ...prev!, rate: val }));
                          }
                        }}
                        required
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Est. Duration (Minutes)</Label>
                      <NumberInput 
                        value={editingAddon?.estimatedDuration || 0}
                        onValueChange={val => setEditingAddon(prev => ({ ...prev!, estimatedDuration: val }))}
                        required
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                      />
                    </div>
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Buffer Time (Minutes)</Label>
                      <StableInput 
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 5"
                        value={editingAddon?.bufferTimeMinutes?.toString() || ""} 
                        onValueChange={val => setEditingAddon(prev => ({ ...prev!, bufferTimeMinutes: parseInt(val) || 0 }))}
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Taxable</Label>
                      <Switch 
                        checked={editingAddon?.isTaxable ?? true} 
                        onCheckedChange={v => setEditingAddon(prev => ({ ...prev!, isTaxable: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Active Status</Label>
                      <Switch 
                        checked={editingAddon?.isActive ?? true} 
                        onCheckedChange={v => setEditingAddon(prev => ({ ...prev!, isActive: v }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-6 border-t border-white/5">
                  <Button 
                    variant="ghost" 
                    type="button" 
                    onClick={() => setIsAddonDialogOpen(false)} 
                    className="flex-1 text-[#A0A0A0] hover:text-white font-black uppercase tracking-widest text-[10px] h-14"
                  >
                    Abort
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-[2] bg-primary hover:bg-[#2A6CFF] text-white font-black rounded-2xl h-14 px-8 uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-105"
                  >
                    Authorize Add-on
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        
          {/* Categories Merged */}
          <div className="mt-8"></div>

          <div className="grid grid-cols-1 gap-8">
            <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
              <CardHeader className="p-8 border-b border-white/5 bg-black/20 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Category <span className="text-primary italic">Architecture</span></CardTitle>
                  <CardDescription className="text-white/40 font-medium uppercase tracking-widest text-[10px] mt-1">Define and organize structural taxonomies for services and operations</CardDescription>
                </div>
                <Button size="sm" className="bg-white/10 hover:bg-white/20 text-white font-black rounded-xl h-10 px-4 uppercase tracking-widest text-[10px] transition-all" onClick={() => {
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
              <CardContent className="p-8">
                <div className="space-y-12">
                  {["service", "addon", "expense", "inventory"].map((type) => {
                    const typeCats = categories.filter(c => c.type === type);
                    if (typeCats.length === 0 && type === "inventory") return null;
                    
                    return (
                      <div key={type} className="space-y-6">
                        <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em] flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                            <Tag className="w-4 h-4" />
                          </div>
                          {type} Protocols
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {typeCats.map((cat, idx) => (
                            <div key={cat.id} className="p-6 bg-black/40 border border-white/5 rounded-2xl hover:border-primary/30 transition-all group flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="flex flex-col gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 text-white/20 hover:text-primary hover:bg-primary/10 rounded-lg"
                                    onClick={() => handleReorderCategory(cat.id, "up")}
                                    disabled={idx === 0}
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 text-white/20 hover:text-primary hover:bg-primary/10 rounded-lg"
                                    onClick={() => handleReorderCategory(cat.id, "down")}
                                    disabled={idx === typeCats.length - 1}
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </Button>
                                </div>
                                <div>
                                  <p className="font-black text-white uppercase tracking-tight">{cat.name}</p>
                                  {!cat.isActive && <Badge className="bg-red-500/10 text-red-500 border-red-500/20 uppercase text-[8px] font-black tracking-widest px-2 py-0.5 mt-1">Inactive</Badge>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 transition-all">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-9 w-9 text-white/70 hover:text-primary hover:bg-primary/10 rounded-xl"
                                  onClick={() => {
                                    setEditingCategory(cat);
                                    setIsCategoryDialogOpen(true);
                                  }}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <DeleteConfirmationDialog
                                  trigger={
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-9 w-9 bg-red-600/10 text-white hover:text-white hover:bg-red-600 rounded-xl"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  }
                                  title="Delete Category?"
                                  itemName={cat.name}
                                  onConfirm={() => handleDeleteCategory(cat.id)}
                                />
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
            <DialogContent className="max-w-md bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black">
              <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                    <Layout className="w-6 h-6" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">{editingCategory?.id ? "Modify Taxonomy" : "Initialize Taxonomy"}</DialogTitle>
                    <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mt-1">Structural Classification Protocol</p>
                  </div>
                </div>
              </DialogHeader>
              <form onSubmit={handleSaveCategory} className="p-8 space-y-8">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Taxonomy Designation (Name)</Label>
                    <StableInput 
                      value={editingCategory?.name || ""} 
                      onValueChange={val => setEditingCategory(prev => ({ ...prev!, name: val }))}
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                      required
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Classification Type</Label>
                    <Select 
                      value={editingCategory?.type || "service"} 
                      onValueChange={(v: any) => setEditingCategory(prev => ({ ...prev!, type: v }))}
                    >
                      <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-black uppercase tracking-widest text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-border text-black">
                        <SelectItem value="service" className="font-black">SERVICE</SelectItem>
                        <SelectItem value="addon" className="font-black">ADD-ON</SelectItem>
                        <SelectItem value="expense" className="font-black">EXPENSE</SelectItem>
                        <SelectItem value="inventory" className="font-black">INVENTORY</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Operational Status</Label>
                    <Switch 
                      checked={editingCategory?.isActive ?? true} 
                      onCheckedChange={v => setEditingCategory(prev => ({ ...prev!, isActive: v }))}
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-4 pt-6 border-t border-white/5">
                  <Button 
                    variant="ghost" 
                    type="button" 
                    onClick={() => setIsCategoryDialogOpen(false)} 
                    className="flex-1 text-white/40 hover:text-white font-black uppercase tracking-widest text-[10px] h-14"
                  >
                    Abort
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-[2] bg-primary hover:bg-[#2A6CFF] text-white font-black rounded-2xl h-14 px-8 uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-105"
                  >
                    Authorize Taxonomy
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="integrations" className="mt-0">
          <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/40">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">System <span className="text-primary italic">Integrations</span></CardTitle>
              <CardDescription className="text-[#A0A0A0] font-medium uppercase tracking-widest text-[10px] mt-1">Connect and synchronize external payment architectures</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              
              <div className="p-6 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 group-hover:border-primary/30 transition-all">
                      <Calendar className="w-6 h-6 text-white/20 group-hover:text-primary transition-all" />
                    </div>
                    <div>
                      <h4 className="font-black text-white uppercase tracking-tight text-lg">Google Calendar</h4>
                      <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Two-Way Synchronization Protocol</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{googleCalendarLinked ? "Active" : "Disabled"}</span>
                    <Button
                      variant={googleCalendarLinked ? "outline" : "default"}
                      size="sm"
                      disabled={isLinkingCalendar}
                      className={googleCalendarLinked ? "border-green-500/50 text-green-500 bg-green-500/10 hover:bg-green-500/20 rounded-xl" : "bg-primary text-white hover:bg-primary/90 rounded-xl"}
                      onClick={async () => {
                        setIsLinkingCalendar(true);
                        try {
                          if (googleCalendarLinked) {
                            await unlinkGoogleCalendar();
                            setGoogleCalendarLinked(false);
                            toast.success("Google Calendar unlinked successfully.");
                          } else {
                            await linkGoogleCalendar();
                            setGoogleCalendarLinked(true);
                            toast.success("Google Calendar linked successfully!");
                          }
                        } catch (error) {
                          console.error(error);
                          toast.error(googleCalendarLinked ? "Failed to unlink Google Calendar." : "Failed to link Google Calendar.");
                        } finally {
                          setIsLinkingCalendar(false);
                        }
                      }}
                    >
                      {googleCalendarLinked ? "Unlink" : "Link Calendar"}
                    </Button>
                  </div>
                </div>
              </div>

              {["Stripe", "Square", "PayPal"].map(provider => (
                <div key={provider} className="p-6 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 group-hover:border-primary/30 transition-all">
                        <CreditCard className="w-6 h-6 text-white/20 group-hover:text-primary transition-all" />
                      </div>
                      <div>
                        <h4 className="font-black text-white uppercase tracking-tight text-lg">{provider}</h4>
                        <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Payment Gateway Protocol</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{settings?.paymentIntegrations?.[provider.toLowerCase() as keyof typeof settings.paymentIntegrations]?.enabled ? "Active" : "Disabled"}</span>
                      <Switch 
                        checked={settings?.paymentIntegrations?.[provider.toLowerCase() as keyof typeof settings.paymentIntegrations]?.enabled || false}
                        onCheckedChange={(val) => setSettings(prev => prev ? { 
                          ...prev,
                          paymentIntegrations: { 
                            ...prev.paymentIntegrations, 
                            [provider.toLowerCase()]: { 
                              ...prev.paymentIntegrations?.[provider.toLowerCase() as keyof typeof prev.paymentIntegrations],
                              enabled: val 
                            } 
                          } 
                        } : null)}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                  </div>
                  {settings?.paymentIntegrations?.[provider.toLowerCase() as keyof typeof settings.paymentIntegrations]?.enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-white/5">
                      {provider === "Stripe" && (
                        <>
                          <div className="space-y-2">
                            <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Publishable Key</Label>
                            <StableInput 
                              value={settings?.paymentIntegrations?.stripe?.publishableKey || ""}
                              onValueChange={(val) => setSettings(prev => prev ? { 
                                ...prev,
                                paymentIntegrations: { 
                                  ...prev.paymentIntegrations, 
                                  stripe: { ...prev.paymentIntegrations?.stripe!, publishableKey: val } 
                                } 
                              } : null)}
                              className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Secret Key</Label>
                            <StableInput 
                              type="password"
                              value={settings?.paymentIntegrations?.stripe?.secretKey || ""}
                              onValueChange={(val) => setSettings(prev => prev ? { 
                                ...prev,
                                paymentIntegrations: { 
                                  ...prev.paymentIntegrations, 
                                  stripe: { ...prev.paymentIntegrations?.stripe!, secretKey: val } 
                                } 
                              } : null)}
                              className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-mono text-xs"
                            />
                          </div>
                        </>
                      )}
                      {provider === "Square" && (
                        <>
                          <div className="space-y-2">
                            <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Application ID</Label>
                            <StableInput 
                              value={settings?.paymentIntegrations?.square?.applicationId || ""}
                              onValueChange={(val) => setSettings(prev => prev ? { 
                                ...prev,
                                paymentIntegrations: { 
                                  ...prev.paymentIntegrations, 
                                  square: { ...prev.paymentIntegrations?.square!, applicationId: val } 
                                } 
                              } : null)}
                              className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Access Token</Label>
                            <StableInput 
                              type="password"
                              value={settings?.paymentIntegrations?.square?.accessToken || ""}
                              onValueChange={(val) => setSettings(prev => prev ? { 
                                ...prev,
                                paymentIntegrations: { 
                                  ...prev.paymentIntegrations, 
                                  square: { ...prev.paymentIntegrations?.square!, accessToken: val } 
                                } 
                              } : null)}
                              className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Location ID</Label>
                            <StableInput 
                              value={settings?.paymentIntegrations?.square?.locationId || ""}
                              onValueChange={(val) => setSettings(prev => prev ? { 
                                ...prev,
                                paymentIntegrations: { 
                                  ...prev.paymentIntegrations, 
                                  square: { ...prev.paymentIntegrations?.square!, locationId: val } 
                                } 
                              } : null)}
                              className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-mono text-xs"
                            />
                          </div>
                        </>
                      )}
                      {provider === "PayPal" && (
                        <>
                          <div className="space-y-2">
                            <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Client ID</Label>
                            <StableInput 
                              value={settings?.paymentIntegrations?.paypal?.clientId || ""}
                              onValueChange={(val) => setSettings(prev => prev ? { 
                                ...prev,
                                paymentIntegrations: { 
                                  ...prev.paymentIntegrations, 
                                  paypal: { ...prev.paymentIntegrations?.paypal!, clientId: val } 
                                } 
                              } : null)}
                              className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Client Secret</Label>
                            <StableInput 
                              type="password"
                              value={settings?.paymentIntegrations?.paypal?.clientSecret || ""}
                              onValueChange={(val) => setSettings(prev => prev ? { 
                                ...prev,
                                paymentIntegrations: { 
                                  ...prev.paymentIntegrations, 
                                  paypal: { ...prev.paymentIntegrations?.paypal!, clientSecret: val } 
                                } 
                              } : null)}
                              className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-mono text-xs"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <Button 
                onClick={() => handleSaveSettings(settings || {})} 
                className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-[1.02]"
              >
                Save Integration Protocol
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loyalty" className="mt-0">
          <div className="space-y-8 max-w-4xl">
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter text-glow">Loyalty <span className="text-primary italic">Architecture</span></h2>
              <p className="text-[#A0A0A0] text-sm font-medium">Configure customer retention algorithms and reward synthesis protocols.</p>
            </div>

            <Card className="border border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
              <CardHeader className="p-8 border-b border-white/5 bg-black/40">
                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Loyalty <span className="text-primary italic">Engine</span></CardTitle>
                <CardDescription className="text-[#A0A0A0] font-medium uppercase tracking-widest text-[10px] mt-1">Configure customer retention algorithms and reward synthesis</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Points Per Dollar Spent</Label>
                    <StableInput 
                      type="text" 
                      inputMode="numeric"
                      value={settings?.loyaltySettings?.pointsPerDollar?.toString() || ""} 
                      onValueChange={(val) => setSettings(prev => prev ? { 
                        ...prev, 
                        loyaltySettings: { ...prev.loyaltySettings, pointsPerDollar: parseFloat(val) || 0 } 
                      } : null)}
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Points Per Visit</Label>
                    <StableInput 
                      type="text" 
                      inputMode="numeric"
                      value={settings?.loyaltySettings?.pointsPerVisit?.toString() || ""} 
                      onValueChange={(val) => setSettings(prev => prev ? { 
                        ...prev, 
                        loyaltySettings: { ...prev.loyaltySettings, pointsPerVisit: parseFloat(val) || 0 } 
                      } : null)}
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Redemption Rate ($ per point)</Label>
                    <StableInput 
                      type="text" 
                      inputMode="decimal"
                      value={settings?.loyaltySettings?.redemptionRate?.toString() || ""} 
                      onValueChange={(val) => setSettings(prev => prev ? { 
                        ...prev, 
                        loyaltySettings: { ...prev.loyaltySettings, redemptionRate: parseFloat(val) || 0 } 
                      } : null)}
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                    />
                    <p className="text-[10px] text-[#A0A0A0]/40 font-black uppercase tracking-widest mt-1">Example: 0.01 means 100 points = $1.00</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Minimum Points to Redeem</Label>
                    <StableInput 
                      type="text" 
                      inputMode="numeric"
                      value={settings?.loyaltySettings?.minPointsToRedeem?.toString() || ""} 
                      onValueChange={(val) => setSettings(prev => prev ? { 
                        ...prev, 
                        loyaltySettings: { ...prev.loyaltySettings, minPointsToRedeem: parseFloat(val) || 0 } 
                      } : null)}
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all">
                  <div className="space-y-1">
                    <Label className="text-sm font-black text-white uppercase tracking-tight">Stack with Coupons</Label>
                    <p className="text-[10px] text-[#A0A0A0] font-medium">Allow customers to use points and coupons on the same order.</p>
                  </div>
                  <Switch 
                    checked={settings?.loyaltySettings?.stackWithCoupons || false} 
                    onCheckedChange={(checked) => setSettings(prev => prev ? { 
                      ...prev, 
                      loyaltySettings: { ...prev.loyaltySettings, stackWithCoupons: checked } 
                    } : null)}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
                <Button 
                  onClick={() => handleSaveSettings(settings || {})} 
                  className="w-full bg-primary hover:bg-[#2A6CFF] text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-[1.02]"
                >
                  <Save className="w-4 h-4 mr-2" /> Save Loyalty Protocol
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="coupons" className="mt-0">
          <Card className="border border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/40 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Promotional <span className="text-primary italic">Incentives</span></CardTitle>
                <CardDescription className="text-[10px] text-[#A0A0A0] font-black uppercase tracking-widest mt-1">Create and manage discount codes for your elite clientele</CardDescription>
              </div>
              <Button size="sm" className="bg-primary hover:opacity-90 text-white font-black rounded-xl h-10 px-4 uppercase tracking-widest text-[10px] shadow-glow-blue transition-all hover:scale-[1.02]" onClick={() => {
                setEditingCoupon({
                  code: "",
                  discountType: "percentage",
                  discountValue: 0,
                  usageLimit: 0,
                  isActive: true
                });
                setIsCouponDialogOpen(true);
              }}>
                <Plus className="w-4 h-4 mr-2" /> Add Incentive
              </Button>
            </CardHeader>
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {coupons.map(coupon => (
                  <div key={coupon.id} className="p-6 bg-black/40 rounded-2xl border border-white/5 hover:border-primary/30 transition-all duration-300 group">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-primary/10 text-primary border-primary/20 font-black tracking-[0.2em] uppercase text-[10px] px-3 py-1">
                          {coupon.code}
                        </Badge>
                        {!coupon.isActive && <Badge variant="secondary" className="bg-white/10 text-[#A0A0A0] border-none text-[8px] uppercase font-black tracking-widest">Inactive</Badge>}
                      </div>
                      <div className="flex items-center gap-1 transition-all duration-300">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-white/70 hover:text-primary hover:bg-primary/10 rounded-xl"
                          onClick={() => {
                            setEditingCoupon(coupon);
                            setIsCouponDialogOpen(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <DeleteConfirmationDialog
                          trigger={
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 text-white hover:text-white bg-red-600/10 hover:bg-red-600 rounded-xl"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Delete Incentive?"
                          itemName={coupon.code}
                          onConfirm={() => handleDeleteCoupon(coupon.id)}
                        />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <p className="text-[8px] text-[#A0A0A0]/40 font-black uppercase tracking-[0.2em]">Discount Value</p>
                        <p className="text-white font-black text-xl tracking-tighter">
                          {coupon.discountType === "percentage" ? `${coupon.discountValue}% OFF` : `$${coupon.discountValue} OFF`}
                        </p>
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t border-white/5">
                        <div className="space-y-1">
                          <p className="text-[7px] text-[#A0A0A0]/40 font-black uppercase tracking-widest">Usage</p>
                          <p className="text-[10px] text-[#A0A0A0] font-bold">{coupon.usageCount} / {coupon.usageLimit || "∞"}</p>
                        </div>
                        {coupon.expiryDate && coupon.expiryDate instanceof Timestamp && (
                          <div className="text-right space-y-1">
                            <p className="text-[7px] text-[#A0A0A0]/40 font-black uppercase tracking-widest">Expires</p>
                            <p className="text-[10px] text-[#A0A0A0] font-bold">{format(coupon.expiryDate.toDate(), "MM/dd/yy")}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Dialog open={isCouponDialogOpen} onOpenChange={setIsCouponDialogOpen}>
            <DialogContent className="max-w-xl bg-[#0B0B0B] border border-white/10 p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black">
              <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                    <Ticket className="w-6 h-6" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">{editingCoupon?.id ? "Modify Incentive" : "Initialize Incentive"}</DialogTitle>
                    <p className="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.2em] mt-1">Operational Discount Protocol</p>
                  </div>
                </div>
              </DialogHeader>
              <form onSubmit={handleSaveCoupon} className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Incentive Code (Designation)</Label>
                    <StableInput 
                      placeholder="SUMMER24"
                      value={editingCoupon?.code || ""} 
                      onValueChange={val => setEditingCoupon(prev => ({ ...prev!, code: val.toUpperCase() }))}
                      required
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-black uppercase tracking-widest text-lg focus:ring-primary/20"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Discount Type</Label>
                      <Select 
                        value={editingCoupon?.discountType || "percentage"} 
                        onValueChange={(v: any) => setEditingCoupon(prev => ({ ...prev!, discountType: v }))}
                      >
                        <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-black uppercase tracking-widest text-[10px] focus:ring-primary/20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0B0B0B] border border-white/10 text-white">
                          <SelectItem value="percentage" className="font-black focus:bg-white/5 focus:text-white">PERCENTAGE (%)</SelectItem>
                          <SelectItem value="fixed" className="font-black focus:bg-white/5 focus:text-white">FIXED AMOUNT ($)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Discount Value</Label>
                      <StableInput 
                        type="text"
                        inputMode="decimal"
                        value={editingCoupon?.discountValue?.toString() || ""} 
                        onValueChange={val => setEditingCoupon(prev => ({ ...prev!, discountValue: parseFloat(val) || 0 }))}
                        required
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Usage Limit (0 for ∞)</Label>
                      <StableInput 
                        type="text"
                        inputMode="numeric"
                        value={editingCoupon?.usageLimit?.toString() || ""} 
                        onValueChange={val => setEditingCoupon(prev => ({ ...prev!, usageLimit: parseInt(val) || 0 }))}
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Expiry Protocol (Optional)</Label>
                      <Input 
                        type="date"
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                        value={editingCoupon?.expiryDate ? format(editingCoupon.expiryDate.toDate(), "yyyy-MM-dd") : ""}
                        onChange={e => {
                          const date = e.target.value ? Timestamp.fromDate(new Date(e.target.value)) : undefined;
                          setEditingCoupon(prev => ({ ...prev!, expiryDate: date }));
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Operational Status</Label>
                    <Switch 
                      checked={editingCoupon?.isActive ?? true} 
                      onCheckedChange={v => setEditingCoupon(prev => ({ ...prev!, isActive: v }))}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-6 border-t border-white/5">
                  <Button 
                    variant="ghost" 
                    type="button" 
                    onClick={() => setIsCouponDialogOpen(false)} 
                    className="flex-1 text-[#A0A0A0] hover:text-white font-black uppercase tracking-widest text-[10px] h-14"
                  >
                    Abort
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-[2] bg-primary hover:bg-[#2A6CFF] text-white font-black rounded-2xl h-14 px-8 uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-105"
                  >
                    Authorize Incentive
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

        </TabsContent>

        <TabsContent value="automation" className="mt-0">
          <Card className="border border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/40 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Operational <span className="text-primary italic">Automations</span></CardTitle>
                <CardDescription className="text-[10px] text-[#A0A0A0] font-black uppercase tracking-widest mt-1">Configure autonomous client engagement protocols</CardDescription>
              </div>
              <Button 
                variant="outline" 
                className="bg-white/5 border-white/10 text-white hover:bg-white/10 font-black rounded-xl h-10 px-6 uppercase tracking-widest text-[10px] transition-all"
                onClick={async () => {
                  const res = await processFollowUps();
                  toast.success(`Processed ${res.processed} follow-ups. ${res.errors} errors.`);
                }}
              >
                <DatabaseZap className="w-4 h-4 mr-2 text-primary" />
                Trigger Protocol
              </Button>
            </CardHeader>
            <CardContent className="p-8 space-y-10">
              <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5">
                <div className="space-y-1">
                  <Label className="text-base font-black text-white uppercase tracking-tight">Post-Service Engagement</Label>
                  <p className="text-xs text-[#A0A0A0] font-medium">Automatically initiate follow-up sequences after service completion.</p>
                </div>
                <Switch 
                  checked={settings?.automationSettings?.followUpEnabled || false}
                  onCheckedChange={(val) => setSettings(prev => prev ? { 
                    ...prev,
                    automationSettings: { ...prev.automationSettings!, followUpEnabled: val } 
                  } : null)}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Deployment Delay</Label>
                      <span className="font-black text-primary text-xs tracking-widest">{settings?.automationSettings?.delayHours} HOURS</span>
                    </div>
                    <Slider 
                      value={[settings?.automationSettings?.delayHours || 24]} 
                      min={1} 
                      max={168} 
                      step={1}
                      onValueChange={(val: any) => setSettings(prev => prev ? { 
                        ...prev,
                        automationSettings: { ...prev.automationSettings!, delayHours: Array.isArray(val) ? val[0] : val } 
                      } : null)}
                      className="[&_[role=slider]]:bg-primary [&_[role=slider]]:border-primary"
                    />
                    <p className="text-[9px] text-[#A0A0A0]/40 font-bold uppercase tracking-widest italic">Wait time after "Completed" status trigger.</p>
                  </div>

                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Transmission Channel</Label>
                    <Select 
                      value={settings?.automationSettings?.channels || "email"}
                      onValueChange={(val: any) => setSettings(prev => prev ? { 
                        ...prev,
                        automationSettings: { ...prev.automationSettings!, channels: val } 
                      } : null)}
                    >
                      <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0B0B0B] border border-white/10 text-white">
                        <SelectItem value="email" className="focus:bg-white/5 focus:text-white">Email Protocol</SelectItem>
                        <SelectItem value="sms" className="focus:bg-white/5 focus:text-white">SMS Protocol</SelectItem>
                        <SelectItem value="both" className="focus:bg-white/5 focus:text-white">Dual-Channel (Email & SMS)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5">
                    <div className="space-y-1">
                      <Label className="font-black text-white uppercase tracking-tight text-sm">Review Acquisition</Label>
                      <p className="text-[10px] text-[#A0A0A0] font-medium">Include Google Review link for first-time clients.</p>
                    </div>
                    <Switch 
                      checked={settings?.automationSettings?.includeReviewLink || false}
                      onCheckedChange={(val) => setSettings(prev => prev ? { 
                        ...prev,
                        automationSettings: { ...prev.automationSettings!, includeReviewLink: val } 
                      } : null)}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>

                  {settings?.automationSettings?.includeReviewLink && (
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Google Review Endpoint</Label>
                      <StableInput 
                        value={settings?.automationSettings?.googleReviewUrl || ""}
                        onValueChange={(val) => setSettings(prev => prev ? { 
                          ...prev,
                          automationSettings: { ...prev.automationSettings!, googleReviewUrl: val } 
                        } : null)}
                        placeholder="https://g.page/r/..."
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-8">
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Email Subject Header</Label>
                    <StableInput 
                      value={settings?.automationSettings?.emailSubject || ""}
                      onValueChange={(val) => setSettings(prev => prev ? { 
                        ...prev,
                        automationSettings: { ...prev.automationSettings!, emailSubject: val } 
                      } : null)}
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Email Payload Content</Label>
                    <StableTextarea 
                      value={settings?.automationSettings?.emailBody || ""}
                      onValueChange={(val) => setSettings(prev => prev ? { 
                        ...prev,
                        automationSettings: { ...prev.automationSettings!, emailBody: val } 
                      } : null)}
                      rows={6}
                      className="bg-black/40 border-white/10 text-white rounded-2xl font-medium p-4 focus:ring-primary/20"
                    />
                    <p className="text-[9px] text-[#A0A0A0]/40 font-mono uppercase tracking-widest">Variables: {"{{firstName}}, {{businessName}}"}</p>
                  </div>
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">SMS Payload Content</Label>
                    <StableTextarea 
                      value={settings?.automationSettings?.smsBody || ""}
                      onValueChange={(val) => setSettings(prev => prev ? { 
                        ...prev,
                        automationSettings: { ...prev.automationSettings!, smsBody: val } 
                      } : null)}
                      rows={4}
                      className="bg-black/40 border-white/10 text-white rounded-2xl font-medium p-4 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>
              
              {/* Automated Client Communication Section */}
              <div className="pt-10 border-t border-white/5 space-y-10">
                <div className="flex items-center justify-between p-6 bg-primary/5 rounded-2xl border border-primary/10">
                  <div className="space-y-1">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading flex items-center gap-3">
                      <Bell className="w-6 h-6 text-primary" />
                      Automated Client Communication
                    </h3>
                    <p className="text-xs text-[#A0A0A0] font-medium leading-relaxed">System-wide control for scheduled transactional messaging.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Master Trigger</Label>
                    <Switch 
                      checked={settings?.communicationAutomation?.enabled ?? false} 
                      onCheckedChange={(val) => setSettings(prev => prev ? { 
                        ...prev,
                        communicationAutomation: { ...(prev.communicationAutomation || { enabled: false, bookingConfirmation: true, reminder24h: true, reminder2h: true }), enabled: val } 
                      } : null)}
                    />
                  </div>
                </div>

                <div className={cn(
                  "grid grid-cols-1 md:grid-cols-3 gap-6 transition-all duration-500",
                  !(settings?.communicationAutomation?.enabled) && "opacity-50 pointer-events-none grayscale"
                )}>
                  <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 transition-all hover:border-primary/20">
                    <div className="space-y-1">
                      <Label className="text-xs font-black text-white uppercase tracking-tight">Booking Confirmation</Label>
                      <p className="text-[9px] text-[#A0A0A0] font-black uppercase tracking-widest">
                        {settings?.communicationAutomation?.bookingConfirmation ? "Automated" : "Manual Only"}
                      </p>
                    </div>
                    <Switch 
                      checked={settings?.communicationAutomation?.bookingConfirmation ?? true}
                      onCheckedChange={(val) => setSettings(prev => prev ? { 
                        ...prev,
                        communicationAutomation: { ...prev.communicationAutomation!, bookingConfirmation: val } 
                      } : null)}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 transition-all hover:border-primary/20">
                    <div className="space-y-1">
                      <Label className="text-xs font-black text-white uppercase tracking-tight">24-Hour Reminder</Label>
                      <p className="text-[9px] text-[#A0A0A0] font-black uppercase tracking-widest">
                        {settings?.communicationAutomation?.reminder24h ? "Automated" : "Manual Only"}
                      </p>
                    </div>
                    <Switch 
                      checked={settings?.communicationAutomation?.reminder24h ?? true}
                      onCheckedChange={(val) => setSettings(prev => prev ? { 
                        ...prev,
                        communicationAutomation: { ...prev.communicationAutomation!, reminder24h: val } 
                      } : null)}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 transition-all hover:border-primary/20">
                    <div className="space-y-1">
                      <Label className="text-xs font-black text-white uppercase tracking-tight">2-Hour Reminder</Label>
                      <p className="text-[9px] text-[#A0A0A0] font-black uppercase tracking-widest">
                        {settings?.communicationAutomation?.reminder2h ? "Automated" : "Manual Only"}
                      </p>
                    </div>
                    <Switch 
                      checked={settings?.communicationAutomation?.reminder2h ?? true}
                      onCheckedChange={(val) => setSettings(prev => prev ? { 
                        ...prev,
                        communicationAutomation: { ...prev.communicationAutomation!, reminder2h: val } 
                      } : null)}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Weather Intelligence Section */}
              <div className="pt-10 border-t border-white/5 space-y-10">
                <div className="flex items-center justify-between p-6 bg-primary/5 rounded-2xl border border-primary/10">
                  <div className="space-y-1">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading flex items-center gap-3">
                      <Globe className="w-6 h-6 text-primary" />
                      Weather Intelligence System
                    </h3>
                    <p className="text-xs text-[#A0A0A0] font-medium leading-relaxed">Autonomous weather monitoring and risk mitigation protocols.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Status Toggle</Label>
                    <Switch 
                      checked={settings?.weatherAutomation?.enabled ?? false} 
                      onCheckedChange={(val) => setSettings(prev => prev ? { 
                        ...prev,
                        weatherAutomation: { ...(prev.weatherAutomation || { enabled: false, checkTimingHours: 24, rainProbabilityThreshold: 40, autoNotifyClient: false }), enabled: val } 
                      } : null)}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </div>

                {settings?.weatherAutomation?.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Surveillance Lead Time</Label>
                          <span className="font-black text-primary text-xs tracking-widest">{settings?.weatherAutomation?.checkTimingHours} HOURS</span>
                        </div>
                        <Slider 
                          value={[settings?.weatherAutomation?.checkTimingHours || 24]} 
                          min={6} 
                          max={72} 
                          step={6}
                          onValueChange={(val: any) => setSettings(prev => prev ? { 
                            ...prev,
                            weatherAutomation: { ...prev.weatherAutomation!, checkTimingHours: Array.isArray(val) ? val[0] : val } 
                          } : null)}
                          className="[&_[role=slider]]:bg-primary [&_[role=slider]]:border-primary"
                        />
                        <p className="text-[9px] text-[#A0A0A0]/40 font-bold uppercase tracking-widest italic">Hours before deployment to initiate final weather telemetry check.</p>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label className="font-black uppercase tracking-widest text-[10px] text-[#A0A0A0]">Precipitation Threshold</Label>
                          <span className="font-black text-primary text-xs tracking-widest">{settings?.weatherAutomation?.rainProbabilityThreshold}% RISK</span>
                        </div>
                        <Slider 
                          value={[settings?.weatherAutomation?.rainProbabilityThreshold || 40]} 
                          min={10} 
                          max={90} 
                          step={5}
                          onValueChange={(val: any) => setSettings(prev => prev ? { 
                            ...prev,
                            weatherAutomation: { ...prev.weatherAutomation!, rainProbabilityThreshold: Array.isArray(val) ? val[0] : val } 
                          } : null)}
                          className="[&_[role=slider]]:bg-primary [&_[role=slider]]:border-primary"
                        />
                        <p className="text-[9px] text-[#A0A0A0]/40 font-bold uppercase tracking-widest italic">Minimum rain probability percentage to trigger an operational warning.</p>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5">
                        <div className="space-y-1">
                          <Label className="font-black text-white uppercase tracking-tight text-sm">Autonomous Client Alerts</Label>
                          <p className="text-[10px] text-[#A0A0A0] font-medium">Auto-dispatch weather warnings to clients when high-risk conditions are detected.</p>
                        </div>
                        <Switch 
                          checked={settings?.weatherAutomation?.autoNotifyClient ?? false}
                          onCheckedChange={(val) => setSettings(prev => prev ? { 
                            ...prev,
                            weatherAutomation: { ...prev.weatherAutomation!, autoNotifyClient: val } 
                          } : null)}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                      
                      <div className="p-6 bg-black/20 rounded-2xl border border-white/5 italic">
                        <p className="text-[10px] text-[#A0A0A0]/60 font-medium leading-relaxed">
                          Note: Weather Intelligence relies on real-time meteorological telemetry. Alerts will be generated based on the latest available forecast at the configured surveillance lead time.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-6">
                <Button 
                  onClick={() => handleSaveSettings(settings || {})} 
                  className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-[1.02]"
                >
                  Save Automation Protocol
                </Button>
                <Button 
                  variant="outline"
                  onClick={async () => {
                    const loadingToast = toast.loading("Executing follow-up protocol...");
                    try {
                      const result = await processFollowUps();
                      toast.dismiss(loadingToast);
                      toast.success(`Protocol complete: ${result.processed} sent, ${result.errors} errors.`);
                    } catch (err) {
                      toast.dismiss(loadingToast);
                      toast.error("Protocol execution failed.");
                    }
                  }}
                  className="border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs transition-all"
                >
                  Run Protocol Manually
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="security" className="mt-0">
          <Card className="border border-white/10 bg-[#0B0B0B] backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/40">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Security & <span className="text-primary italic">Access Control</span></CardTitle>
              <CardDescription className="text-[10px] text-[#A0A0A0] font-black uppercase tracking-widest mt-1">Manage administrative access and data protection protocols</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary border border-primary/20">
                        <Lock className="w-4 h-4" />
                      </div>
                      <Label className="text-sm font-black text-white uppercase tracking-tight">Admin-Only Access</Label>
                    </div>
                    <p className="text-[10px] text-[#A0A0A0] font-medium ml-10">Restrict financial reports and settings to administrators.</p>
                  </div>
                  <Switch 
                    checked={settings?.adminOnlyAccess ?? true}
                    onCheckedChange={(checked) => {
                      setSettings(prev => prev ? ({ ...prev, adminOnlyAccess: checked }) : null);
                      handleSaveSettings({ adminOnlyAccess: checked });
                    }}
                  />
                </div>

                <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/5 rounded-lg text-white border border-white/10">
                        <Shield className="w-4 h-4" />
                      </div>
                      <Label className="text-sm font-black text-white uppercase tracking-tight">Multi-Factor Auth</Label>
                    </div>
                    <p className="text-[10px] text-[#A0A0A0] font-medium ml-10">Secondary verification for administrative logins.</p>
                  </div>
                  <Badge variant="secondary" className="bg-white/5 text-[#A0A0A0] border-none text-[8px] uppercase font-black tracking-widest px-2 py-1">Coming Soon</Badge>
                </div>

                <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-500/10 rounded-lg text-green-500 border border-green-500/20">
                        <Database className="w-4 h-4" />
                      </div>
                      <Label className="text-sm font-black text-white uppercase tracking-tight">Data Encryption</Label>
                    </div>
                    <p className="text-[10px] text-[#A0A0A0] font-medium ml-10">PII and financial data encrypted at rest and in transit.</p>
                  </div>
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20 uppercase text-[8px] font-black tracking-widest px-2 py-1">Active</Badge>
                </div>

                <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#0A4DFF]/10 rounded-lg text-[#0A4DFF] border border-[#0A4DFF]/20">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <Label className="text-sm font-black text-white uppercase tracking-tight">Audit Logging</Label>
                    </div>
                    <p className="text-[10px] text-[#A0A0A0] font-medium ml-10">Track all administrative actions and data modifications.</p>
                  </div>
                  <Badge className="bg-[#0A4DFF]/10 text-[#0A4DFF] border border-[#0A4DFF]/20 uppercase text-[8px] font-black tracking-widest px-2 py-1">Active</Badge>
                </div>
              </div>

              <div className="pt-8 border-t border-white/5">
                <h3 className="text-[10px] font-black text-[#A0A0A0]/40 uppercase tracking-[0.2em] mb-6">Data Architecture Tools</h3>
                <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10 mb-8 flex items-center justify-between">
                  <div className="flex gap-4">
                    <div className="p-3 bg-primary/10 rounded-2xl text-primary shrink-0 border border-primary/20">
                      <DatabaseZap className="w-5 h-5" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-black text-white uppercase tracking-tight">Legacy Data Synthesis</p>
                      <p className="text-[10px] text-[#A0A0A0] leading-relaxed font-medium">
                        Synthesize elite client records from legacy database architectures.
                      </p>
                    </div>
                  </div>
                  <Button 
                    size="sm"
                    className="bg-primary hover:opacity-90 text-white font-black"
                    onClick={async () => {
                      if (confirm("Execute data synthesis protocol? This will re-map all legacy records to the unified client system.")) {
                        setIsSaving(true);
                        try {
                          const result = await migrateDataToClients();
                          toast.success(`Successfully synthesized ${result.migratedCount} elite clients!`);
                        } catch (error) {
                          toast.error("Protocol failed.");
                        } finally {
                          setIsSaving(false);
                        }
                      }
                    }}
                  >
                    Run Synthesis
                  </Button>
                </div>
              </div>

              <div className="pt-8 border-t border-white/5">
                <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-6">Service Architecture Control</h3>
                <div className="p-6 bg-primary/5 rounded-2xl border border-primary/20 mb-8 flex items-center justify-between">
                  <div className="flex gap-4">
                    <div className="p-3 bg-primary/10 rounded-2xl text-primary shrink-0 border border-primary/30 shadow-lg shadow-primary/10">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-black text-white uppercase tracking-tight">Full Service System Import</p>
                      <p className="text-[10px] text-[#A0A0A0] leading-relaxed font-medium max-w-md">
                        Import the Official Master Service Catalog. <span className="text-primary font-black uppercase tracking-widest text-[9px]">Caution:</span> This protocol will <span className="text-red-500 font-bold underline">DELETE</span> all existing services, add-ons, and categories before seeding the new architecture.
                      </p>
                    </div>
                  </div>
                  <Button 
                    size="sm"
                    onClick={async () => {
                      if (isSaving) return;
                      
                      const confirmed = window.confirm("WARNING: All current services, add-ons, and categories will be PERMANENTLY DELETED. Proceed with Master Catalog Import?");
                      if (!confirmed) return;

                      setIsSaving(true);
                      
                      toast.promise(importFullServiceSystem(), {
                        loading: "Overwriting Service Architecture with Master Catalog...",
                        success: (data) => {
                          setIsSaving(true); // Keep it true while we refresh
                          setTimeout(() => window.location.reload(), 1500);
                          return "Master System Online. Reloading for Protocol Sync...";
                        },
                        error: (err) => {
                          setIsSaving(false);
                          console.error("Master Sync failure:", err);
                          return "Protocol failure during master import.";
                        },
                      });
                    }}
                    className="bg-primary hover:bg-primary/90 text-white font-black h-10 px-6 rounded-xl uppercase tracking-widest text-[10px] shadow-glow-blue transition-all hover:scale-[1.02]"
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DatabaseZap className="w-4 h-4 mr-2" />}
                    Import Master System
                  </Button>
                </div>
              </div>

              <div className="pt-8 border-t border-white/5">
                <h3 className="text-[10px] font-black text-[#A0A0A0]/40 uppercase tracking-[0.2em] mb-6">Discovery & Performance Demo</h3>
                <div className="p-6 bg-purple-500/5 rounded-2xl border border-purple-500/10 mb-8 flex items-center justify-between">
                  <div className="flex gap-4">
                    <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-500 shrink-0 border border-purple-500/20">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-black text-white uppercase tracking-tight">Service Timing Intelligence Demo</p>
                      <p className="text-[10px] text-[#A0A0A0] leading-relaxed font-medium">
                        Initialize high-fidelity historical data to verify predictive timing logic and maintenance return status.
                      </p>
                    </div>
                  </div>
                  <Button 
                    size="sm"
                    onClick={async () => {
                      if (isSaving) return;
                      
                      setIsSaving(true);
                      
                      toast.promise(seedServiceTimingDemo(), {
                        loading: "Initializing high-fidelity service intelligence architecture...",
                        success: (data) => {
                          setIsSaving(false);
                          if (data) return "Service Intelligence Demo Ready. Open \"Timothy Timing (Demo)\" profile to verify.";
                          return "Data synthesis finished with anomalies.";
                        },
                        error: (err) => {
                          setIsSaving(false);
                          console.error("Seeding failure:", err);
                          return "Protocol failure. Check system logs.";
                        },
                      });
                    }}
                    className="bg-purple-600 hover:opacity-90 text-white font-black h-10 px-6 rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-purple-500/20 transition-all hover:scale-[1.02]"
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                    Initialize
                  </Button>
                </div>
              </div>

              <div className="pt-8 border-t border-white/5">
                <h3 className="text-[10px] font-black text-[#A0A0A0]/40 uppercase tracking-[0.2em] mb-6">Privacy & Data Governance</h3>
                <div className="p-6 bg-black/40 rounded-2xl border border-white/5 border-l-4 border-l-primary">
                  <p className="text-xs text-[#A0A0A0] leading-relaxed font-medium">
                    Your business data is stored securely in our proprietary cloud infrastructure. We maintain a strict zero-trust architecture. 
                    We do not sell your data to third parties. Access is restricted to authorized personnel only via encrypted channels. 
                    For detailed compliance reports, please contact our security operations center.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="client-types" className="mt-0">
          <div className="grid grid-cols-1 gap-8">
            <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
              <CardHeader className="p-8 border-b border-white/5 bg-black/20 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-black text-white uppercase tracking-tighter font-heading">Client <span className="text-primary italic">Classifications</span></CardTitle>
                  <CardDescription className="text-[10px] text-white/40 font-black uppercase tracking-widest mt-1">Define structural client archetypes</CardDescription>
                </div>
                <Dialog open={isClientTypeDialogOpen} onOpenChange={setIsClientTypeDialogOpen}>
                  <DialogTrigger render={
                    <Button size="sm" className="bg-white/10 hover:bg-white/20 text-white font-black rounded-xl h-10 px-4 uppercase tracking-widest text-[10px] transition-all" onClick={() => {
                      setEditingClientType({ name: "", isActive: true });
                      setIsClientTypeDialogOpen(true);
                    }}>
                      <Plus className="w-4 h-4 mr-2" /> Add Archetype
                    </Button>
                  } />
                  <DialogContent className="bg-black border-white/10 text-white">
                    <DialogHeader><DialogTitle className="text-xl font-black uppercase tracking-tighter">{editingClientType?.id ? "Edit Archetype" : "Add Client Archetype"}</DialogTitle></DialogHeader>
                    <form onSubmit={handleSaveClientType} className="space-y-6 py-6">
                      <div className="space-y-2">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Archetype Name</Label>
                        <StableInput 
                          value={editingClientType?.name || ""} 
                          onValueChange={val => setEditingClientType(prev => ({ ...prev!, name: val }))}
                          placeholder="e.g. Corporate Fleet" 
                          className="bg-black/40 border-white/10 text-white h-12 rounded-xl" 
                          required 
                        />
                      </div>
                      <Button type="submit" className="w-full bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 rounded-xl uppercase tracking-widest text-xs shadow-glow-blue transition-all hover:scale-105">
                        {editingClientType?.id ? "Update Archetype" : "Create Archetype"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-8">
                <div className="space-y-3">
                  {clientTypes.map(type => (
                    <div key={type.id} className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 group-hover:border-primary/30 transition-all">
                          <Users className="w-5 h-5 text-white group-hover:text-primary transition-all" />
                        </div>
                        <span className="font-black text-white uppercase tracking-tight">{type.name}</span>
                      </div>
                      <div className="flex items-center gap-2 transition-all">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-white/70 hover:text-primary hover:bg-primary/10 rounded-xl"
                          onClick={() => {
                            setEditingClientType(type);
                            setIsClientTypeDialogOpen(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <DeleteConfirmationDialog
                          trigger={
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 bg-red-600/10 text-white hover:text-white hover:bg-red-600 rounded-xl" 
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Delete Archetype?"
                          itemName={type.name}
                          onConfirm={() => handleDeleteClientType(type.id)}
                        />
                      </div>
                    </div>
                  ))}
                  {clientTypes.length === 0 && <p className="text-[10px] text-white font-black uppercase tracking-widest italic text-center py-4">No archetypes defined.</p>}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Client Categories Merged */}
          <div className="grid grid-cols-1 gap-8 mt-8">
            <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
              <CardHeader className="p-8 border-b border-white/5 bg-black/20 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-black text-white uppercase tracking-tighter font-heading">Client <span className="text-primary italic">Categories</span></CardTitle>
                  <CardDescription className="text-[10px] text-white/40 font-black uppercase tracking-widest mt-1">Strategic tags for client segmentation</CardDescription>
                </div>
                <Dialog open={isClientCategoryDialogOpen} onOpenChange={setIsClientCategoryDialogOpen}>
                  <DialogTrigger render={
                    <Button size="sm" className="bg-white/10 hover:bg-white/20 text-white font-black rounded-xl h-10 px-4 uppercase tracking-widest text-[10px] transition-all" onClick={() => {
                      setEditingClientCategory({ name: "", color: "#ef4444", isActive: true });
                      setIsClientCategoryDialogOpen(true);
                    }}>
                      <Plus className="w-4 h-4 mr-2" /> Add Category
                    </Button>
                  } />
                  <DialogContent className="bg-black border-white/10 text-white">
                    <DialogHeader><DialogTitle className="text-xl font-black uppercase tracking-tighter">{editingClientCategory?.id ? "Edit Category" : "Add Client Category"}</DialogTitle></DialogHeader>
                    <form onSubmit={handleSaveClientCategory} className="space-y-6 py-6">
                      <div className="space-y-2">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Category Name</Label>
                        <StableInput 
                          value={editingClientCategory?.name || ""} 
                          onValueChange={val => setEditingClientCategory(prev => ({ ...prev!, name: val }))}
                          placeholder="e.g. VIP High Value" 
                          className="bg-black/40 border-white/10 text-white h-12 rounded-xl" 
                          required 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Category Color</Label>
                        <div className="flex items-center gap-4">
                          <Input 
                            type="color" 
                            value={editingClientCategory?.color || "#ef4444"} 
                            onChange={e => setEditingClientCategory(prev => ({ ...prev!, color: e.target.value }))}
                            className="w-12 h-12 p-1 bg-black/40 border-white/10 rounded-xl cursor-pointer" 
                          />
                          <StableInput 
                            value={editingClientCategory?.color || "#ef4444"} 
                            onValueChange={val => setEditingClientCategory(prev => ({ ...prev!, color: val }))}
                            className="bg-black/40 border-white/10 text-white h-12 rounded-xl flex-1 font-mono" 
                          />
                        </div>
                      </div>
                      <Button type="submit" className="w-full bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 rounded-xl uppercase tracking-widest text-xs shadow-glow-blue transition-all hover:scale-105">
                        {editingClientCategory?.id ? "Update Category" : "Create Category"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-8">
                <div className="space-y-3">
                  {clientCategories.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="w-3 h-3 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                          style={{ backgroundColor: cat.color || "#ef4444", boxShadow: `0 0 10px ${cat.color || "#ef4444"}80` }}
                        />
                        <span className="font-black text-white uppercase tracking-tight">{cat.name}</span>
                      </div>

                      <div className="flex items-center gap-2 transition-all">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-white/70 hover:text-primary hover:bg-primary/10 rounded-xl"
                          onClick={() => {
                            setEditingClientCategory(cat);
                            setIsClientCategoryDialogOpen(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <DeleteConfirmationDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 bg-red-600/10 text-white hover:text-white hover:bg-red-600 rounded-xl"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Delete Client Category?"
                          itemName={cat.name}
                          onConfirm={() => handleDeleteClientCategory(cat.id)}
                        />
                      </div>
                    </div>
                  ))}

                  {clientCategories.length === 0 && (
                    <p className="text-[10px] text-white/20 font-black uppercase tracking-widest italic text-center py-4">No categories defined.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="mt-0">
          <div className="space-y-6 max-w-4xl">
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Calendar Matrix Protocol</h2>
            <p className="text-white/60 mb-8">Configure your visual status indicators and system deployment colors.</p>

            <Card className="border-none bg-black/40 shadow-2xl overflow-hidden rounded-3xl">
              <CardHeader className="bg-primary/5 border-b border-primary/20 p-8">
                <CardTitle className="font-black text-xl text-primary tracking-tighter uppercase flex items-center gap-3">
                  <Palette className="w-5 h-5" /> Color Mapping Protocol
                </CardTitle>
                <CardDescription className="text-white/60">Define the visual status indicators for deployment tracking.</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                {[
                  { key: 'scheduled', label: 'Scheduled', default: 'bg-gray-100 text-gray-700 border-gray-200' },
                  { key: 'confirmed', label: 'Confirmed', default: 'bg-black text-white border-black' },
                  { key: 'en_route', label: 'En Route', default: 'bg-red-50 text-primary border-red-200' },
                  { key: 'in_progress', label: 'In Progress / Arrived', default: 'bg-primary text-white border-primary' },
                  { key: 'completed', label: 'Completed', default: 'bg-green-100 text-green-700 border-green-200' },
                  { key: 'canceled', label: 'Canceled / No Show', default: 'bg-red-100 text-red-700 border-red-200' },
                  { key: 'vip', label: 'VIP Status Highlight', default: 'ring-2 ring-yellow-500 shadow-yellow-500/50' }
                ].map(({ key, label, default: def }) => (
                  <div key={key} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase">{label}</h4>
                      <p className="text-xs text-white/50 font-mono mt-1">{settings?.calendarColors?.[key] || def}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg border ${settings?.calendarColors?.[key] || def}`}>
                        Preview
                      </div>
                      <Input 
                        value={settings?.calendarColors?.[key] || def}
                        onChange={(e) => handleSaveSettings({ calendarColors: { ...(settings?.calendarColors || {}), [key]: e.target.value } })}
                        placeholder="CSS Classes (e.g., bg-red-500 text-white)"
                        className="w-[300px] bg-black/40 border-white/10 text-white font-mono text-xs rounded-xl"
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-none bg-black/40 shadow-2xl overflow-hidden rounded-3xl">
              <CardHeader className="bg-primary/5 border-b border-primary/20 p-8">
                <CardTitle className="font-black text-xl text-primary tracking-tighter uppercase flex items-center gap-3">
                  <Zap className="w-5 h-5" /> Calendar Service Colors
                </CardTitle>
                <CardDescription className="text-white/60">Configure outer rings and shadows based on service type keywords.</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-1 gap-4">
                  {[
                    { key: 'Exterior', label: 'Basic / Exterior', default: 'shadow-[0_0_12px_rgba(59,130,246,0.3)] border-blue-500/40' },
                    { key: 'Interior', label: 'Interior', default: 'shadow-[0_0_12px_rgba(168,85,247,0.3)] border-purple-500/40' },
                    { key: 'Ceramic', label: 'Ceramic / Protection / Coating', default: 'shadow-[0_0_12px_rgba(234,179,8,0.3)] border-yellow-500/40' },
                    { key: 'Mold', label: 'Mold / Biohazard', default: 'shadow-[0_0_12px_rgba(239,68,68,0.3)] border-red-500/40' },
                    { key: 'Fleet', label: 'Fleet / Commercial / Vendor', default: 'shadow-[0_0_12px_rgba(34,197,94,0.3)] border-green-500/40' },
                  ].map(({ key, label, default: def }) => (
                    <div key={key} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
                      <div>
                        <h4 className="text-sm font-bold text-white uppercase">{label}</h4>
                        <p className="text-[10px] text-white/50 font-mono mt-1">{settings?.serviceColors?.[key] || def}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className={cn("px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg border", settings?.serviceColors?.[key] || def)}>
                          Preview
                        </div>
                        <Input 
                          value={settings?.serviceColors?.[key] || ""}
                          onChange={(e) => handleSaveSettings({ serviceColors: { ...(settings?.serviceColors || {}), [key]: e.target.value } })}
                          placeholder="CSS Classes (e.g., shadow-... border-...)"
                          className="w-[300px] bg-black/40 border-white/10 text-white font-mono text-xs rounded-xl"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-6 border-t border-white/5">
                  <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em]">Deployment Protocol Tip</p>
                  <p className="text-xs text-white/50 mt-1 leading-relaxed">
                    Keyword overrides will match against appointment service names. 
                    If multiple services are present, the first detected color will be applied. 
                    Empty inputs will fall back to system defaults.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>


</div>
</Tabs>
</div>
);
}
