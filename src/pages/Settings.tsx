import { useState, useEffect, useRef } from "react";
import { doc, updateDoc, getDoc, setDoc, collection, query, onSnapshot, addDoc, deleteDoc, orderBy, Timestamp, serverTimestamp, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { db, auth, storage, handleFirestoreError, OperationType } from "../firebase";
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
  Tag, Ticket, Lock, Eye, EyeOff, Users, ShieldAlert, ShieldCheck, Upload, ChevronRight, Menu, Plug, Calendar, Link, Building2, Zap, Save, Clock
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { seedDemoData, seedServiceTimingDemo } from "../services/seedData";
import { toast } from "sonner";
import { format } from "date-fns";
import { useSearchParams } from "react-router-dom";
import AddressInput from "../components/AddressInput";
import { resizeImage, cn } from "../lib/utils";
import { StableInput } from "../components/StableInput";
import { StableTextarea } from "../components/StableTextarea";
import { formatPhoneNumber } from "../lib/utils";
import { NumberInput } from "../components/NumberInput";
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

import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { linkGoogleCalendar, getGoogleCalendarToken, unlinkGoogleCalendar } from "../services/googleCalendarService";
import MapZoneEditor from "../components/MapZoneEditor";

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
  const { profile, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "profile";
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdminOrManager = profile?.role === "admin" || profile?.role === "manager";

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
  const [cloverConfigured, setCloverConfigured] = useState(false);
  const [googleCalendarLinked, setGoogleCalendarLinked] = useState(false);
  const [isLinkingCalendar, setIsLinkingCalendar] = useState(false);
  const [travelPricingInputs, setTravelPricingInputs] = useState({
    pricePerMile: "",
    freeMilesThreshold: "",
    minTravelFee: "",
    maxTravelFee: ""
  });

  useEffect(() => {
    fetch("/api/clover/status")
      .then(res => res.json())
      .then(data => setCloverConfigured(data.configured))
      .catch(err => console.error("Error checking Clover status:", err));

    getGoogleCalendarToken().then(token => setGoogleCalendarLinked(!!token)).catch(() => setGoogleCalendarLinked(false));
  }, []);

  useEffect(() => {
    if (authLoading || !profile) return;

    const fetchSettings = async () => {
      // Check cache first (5 min)
      const cached = sessionStorage.getItem('business_settings_cache');
      const cacheTime = sessionStorage.getItem('business_settings_cache_time');
      const now = Date.now();
      if (cached && cacheTime && now - Number(cacheTime) < 5 * 60 * 1000) {
        const parsed = JSON.parse(cached);
        setSettings(parsed);
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
            businessName: "Flatline Mobile Detail",
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
            getDocs(query(collection(db, "users"), orderBy("displayName", "asc")))
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
      const { paymentIntegrations, ...publicData } = updatedSettings;
      
      // Save public data
      await setDoc(doc(db, "settings", "business"), removeUndefined(publicData));
      
      // Save sensitive data if present
      if (paymentIntegrations) {
        await setDoc(doc(db, "settings", "integrations"), removeUndefined({ paymentIntegrations }));
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
    try {
      await updateDoc(doc(db, "users", staffId), { role: newRole });
      toast.success("Staff role updated");
    } catch (error) {
      console.error("Error updating staff role:", error);
      toast.error("Failed to update staff role");
    }
  };

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.uid) return;

    // Reset input so the same file could be selected again if needed
    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
    }

    // Local preview and upload
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      setAvatarPreview(dataUrl);

      setIsAvatarUploading(true);
      const toastId = toast.loading("Uploading signature identity asset...");
      
      try {
        // Resize image and store directly in Firestore since base64 avatars are small enough 
        // and it avoids Storage configuration/limits errors.
        const compressedDataUrl = await resizeImage(dataUrl, 200);
        // Use setDoc with merge to ensure it doesn't fail if the document was missing
        await setDoc(doc(db, "users", profile.uid), { photoURL: compressedDataUrl }, { merge: true });
        
        toast.success("Identity asset updated successfully", { id: toastId });
      } catch (error) {
        console.error("Avatar upload failed:", error);
        toast.error("Failed to update identity asset", { id: toastId });
        setAvatarPreview(null);
      } finally {
        setIsAvatarUploading(false);
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read the image file");
      setIsAvatarUploading(false);
    };
    reader.readAsDataURL(file);
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings) return;

    // Check authentication
    if (!auth.currentUser) {
      toast.error("You must be logged in to upload a logo.");
      return;
    }

    // Check permissions
    if (!isAdminOrManager) {
      toast.error("Only admins or managers can update branding.");
      return;
    }

    // Validate type
    const validTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a valid PNG, JPG, or JPEG file.");
      return;
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      setLogoPreview(dataUrl);
      setIsUploading(true);
      const toastId = toast.loading("Processing business branding asset...");
      
      try {
        // Use the same resize strategy as avatar for consistency + better performance/reliability
        const compressedDataUrl = await resizeImage(dataUrl, 500); // Logo slightly larger but still small base64
        
        await handleSaveSettings({ logoUrl: compressedDataUrl });
        toast.success("Business branding updated successfully", { id: toastId });
      } catch (error) {
        console.error("Logo upload failed:", error);
        toast.error("Failed to update branding asset", { id: toastId });
        setLogoPreview(null);
      } finally {
        setIsUploading(false);
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read the branding asset");
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-2 font-heading uppercase">
            SYSTEM <span className="text-primary italic">PREFERENCES</span>
          </h1>
          <p className="text-white/60 font-medium tracking-wide uppercase text-xs">
            Configuration Engine: <span className="text-primary font-black">Active</span> • {profile?.role?.toUpperCase()} Access
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
            <h3 className="px-4 text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Identity & Profile</h3>
            <TabsTrigger 
              value="profile" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >
              <User className="w-4 h-4" /> Personal Protocol
            </TabsTrigger>
            <TabsTrigger 
              value="business" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >
              <Building2 className="w-4 h-4" /> Business Core
            </TabsTrigger>
            <TabsTrigger 
              value="branding" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >
              <Palette className="w-4 h-4" /> Visual Identity
            </TabsTrigger>

            <h3 className="px-4 text-[10px] font-black text-white/40 uppercase tracking-widest mt-6 mb-2">Fleet & Service</h3>
            <TabsTrigger 
              value="staff" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >
              <Users className="w-4 h-4" /> Staff Management
            </TabsTrigger>
            <TabsTrigger 
              value="client-types" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >
              <DatabaseZap className="w-4 h-4" /> Client Archetypes
            </TabsTrigger>
            <TabsTrigger 
              value="services" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >
              <ClipboardList className="w-4 h-4" /> Service Protocols
            </TabsTrigger>

            <h3 className="px-4 text-[10px] font-black text-white/40 uppercase tracking-widest mt-6 mb-2">Revenue & Growth</h3>
            <TabsTrigger 
              value="coupons" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >
              <Ticket className="w-4 h-4" /> Growth Incentives
            </TabsTrigger>
            <TabsTrigger 
              value="automation" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >
              <Zap className="w-4 h-4" /> Operational Automations
            </TabsTrigger>
            <TabsTrigger 
              value="calendar" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >
              <Calendar className="w-4 h-4" /> Calendar Service Colors
            </TabsTrigger>
            <TabsTrigger 
              value="integrations" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >
              <Plug className="w-4 h-4" /> Neural Links
            </TabsTrigger>
            <TabsTrigger 
              value="security" 
              className="w-full justify-start gap-3 h-12 px-4 rounded-xl font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/20 text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >
              <Shield className="w-4 h-4" /> Security Layers
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 min-w-0">

        <TabsContent value="profile" className="mt-0">
          <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/20">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Personal <span className="text-primary italic">Identity</span></CardTitle>
              <CardDescription className="text-white/60 font-medium uppercase tracking-widest text-[10px] mt-1">Manage your individual system credentials</CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <form onSubmit={handleSaveProfile} className="space-y-8">
                <div className="flex items-center gap-8">
                  <div className="w-24 h-24 bg-black/40 rounded-3xl overflow-hidden border-2 border-white/10 shadow-xl group relative">
                    {avatarPreview || profile?.photoURL ? (
                      <img src={avatarPreview || profile?.photoURL || ""} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20">
                        <User className="w-10 h-10" />
                      </div>
                    )}
                    <div 
                      className="absolute inset-0 bg-black/60 opacity-100 flex items-center justify-center cursor-pointer transition-opacity backdrop-blur-[2px]"
                      onClick={() => !isAvatarUploading && avatarInputRef.current?.click()}
                    >
                      <Upload className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-white font-black uppercase tracking-tight text-lg">{profile?.displayName || "System User"}</h4>
                    <p className="text-white font-bold uppercase tracking-widest text-[10px] bg-primary/20 text-primary px-3 py-1 rounded-full w-fit">
                      {profile?.role} • Authorized Access
                    </p>
                    <input 
                      type="file" 
                      ref={avatarInputRef} 
                      className="hidden" 
                      accept="image/*" 
                      onChange={handleAvatarUpload} 
                    />
                    <Button 
                      variant="outline" 
                      type="button" 
                      disabled={isAvatarUploading}
                      onClick={() => avatarInputRef.current?.click()}
                      className="border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl h-9 px-4 font-bold uppercase tracking-widest text-[10px] mt-2"
                    >
                      {isAvatarUploading ? "Processing..." : "Update Avatar"}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Public Display Name</Label>
                    <StableInput 
                      id="displayName" 
                      className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold"
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
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">System Email</Label>
                    <Input 
                      key={profile?.uid ? 'loaded' : 'loading'}
                      id="email" 
                      name="email" 
                      defaultValue={profile?.email || ""} 
                      placeholder="email@example.com" 
                      className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Access Level</Label>
                    {profile?.role === "admin" ? (
                      <Select 
                        key={profile?.uid ? 'loaded' : 'loading'}
                        name="role" 
                        defaultValue={profile?.role || "technician"}
                      >
                        <SelectTrigger className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-black uppercase tracking-widest text-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border text-white">
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="technician">Technician</SelectItem>
                          <SelectItem value="office">Office</SelectItem>
                          <SelectItem value="read-only">Read-only</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-3 p-4 bg-black/40 rounded-xl border border-white/10">
                        <Shield className="w-4 h-4 text-primary" />
                        <span className="font-black text-white uppercase tracking-widest text-[10px]">{profile?.role}</span>
                        <input type="hidden" name="role" value={profile?.role || ""} />
                        <Badge variant="outline" className="ml-auto text-[8px] uppercase font-black border-white/10 text-white/40">Locked</Badge>
                      </div>
                    )}
                  </div>
                </div>
                <Button type="submit" className="bg-primary hover:bg-red-700 text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]" disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Authorize Profile Update
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="mt-0">
          <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/20 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Staff <span className="text-primary italic">Management</span></CardTitle>
                <CardDescription className="text-white/60 font-medium uppercase tracking-widest text-[10px] mt-1">Manage your team members and their access levels</CardDescription>
              </div>
              <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
                <DialogTrigger render={
                  <Button className="bg-primary hover:bg-red-700 text-white font-black rounded-xl h-12 px-6 uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]">
                    <Plus className="w-4 h-4 mr-2" /> Add Staff Intelligence
                  </Button>
                } />
                <DialogContent className="bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black sm:max-w-[500px]">
                  <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                        <Users className="w-6 h-6" />
                      </div>
                      <div>
                        <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">Authorize Staff Intelligence</DialogTitle>
                        <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mt-1">Personnel Access Protocol</p>
                      </div>
                    </div>
                  </DialogHeader>
                  <div className="p-8 space-y-8">
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Google Identity (Email)</Label>
                        <Input 
                          id="staffEmail" 
                          placeholder="staff@gmail.com" 
                          value={newStaffEmail} 
                          onChange={(e) => setNewStaffEmail(e.target.value)} 
                          className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold"
                        />
                        <p className="text-[9px] text-white/60 font-black uppercase tracking-widest leading-relaxed">The operative must authenticate using this specific Google account.</p>
                      </div>
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Clearance Level (Role)</Label>
                        <Select value={newStaffRole} onValueChange={setNewStaffRole}>
                          <SelectTrigger className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-black uppercase tracking-widest text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-border text-black">
                            <SelectItem value="admin" className="font-black">ADMINISTRATOR</SelectItem>
                            <SelectItem value="manager" className="font-black">MANAGER</SelectItem>
                            <SelectItem value="technician" className="font-black">TECHNICIAN</SelectItem>
                            <SelectItem value="office" className="font-black">OFFICE OPS</SelectItem>
                            <SelectItem value="read-only" className="font-black">READ-ONLY</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 pt-6 border-t border-white/5">
                      <Button 
                        variant="ghost" 
                        onClick={() => setIsStaffDialogOpen(false)} 
                        className="flex-1 text-white/40 hover:text-white font-black uppercase tracking-widest text-[10px] h-14"
                      >
                        Abort
                      </Button>
                      <Button 
                        onClick={handleAddStaff} 
                        className="flex-[2] bg-primary hover:bg-red-700 text-white font-black rounded-2xl h-14 px-8 uppercase tracking-[0.2em] text-xs shadow-xl shadow-primary/20 transition-all hover:scale-105"
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
                        <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Select 
                        key={member.id}
                        defaultValue={member.role} 
                        onValueChange={(val) => handleUpdateStaffRole(member.id, val)}
                        disabled={member.email === "flatlinedetail@gmail.com"}
                      >
                        <SelectTrigger className="w-[160px] bg-black/60 border-white/10 text-white font-black uppercase tracking-widest text-[10px] h-10 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-border text-black">
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="technician">Technician</SelectItem>
                          <SelectItem value="office">Office</SelectItem>
                          <SelectItem value="read-only">Read-only</SelectItem>
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
        </TabsContent>

        <TabsContent value="business" className="mt-0">
          <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/20">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Business <span className="text-primary italic">Intelligence</span></CardTitle>
              <CardDescription className="text-white/60 font-medium uppercase tracking-widest text-[10px] mt-1">Configure asset logistics and document identities</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2 col-span-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Customer-Facing Invoice Address</Label>
                  <AddressInput 
                    defaultValue={settings?.invoiceAddress}
                    onAddressSelect={(address) => handleSaveSettings({ invoiceAddress: address })}
                    placeholder="Address shown on invoices and client communications"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Business Name</Label>
                  <StableInput 
                    id="businessName" 
                    className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold"
                    value={settings?.businessName || ""} 
                    onValueChange={(val) => setSettings(prev => prev ? { ...prev, businessName: val } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Business Email</Label>
                  <StableInput 
                    id="businessEmail" 
                    type="email"
                    className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold"
                    value={settings?.businessEmail || ""} 
                    onValueChange={(val) => setSettings(prev => prev ? { ...prev, businessEmail: val } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Business Phone</Label>
                  <StableInput 
                    id="businessPhone" 
                    className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold"
                    value={settings?.businessPhone || ""} 
                    onValueChange={(val) => setSettings(prev => prev ? { ...prev, businessPhone: val } : null)}
                    formatOnBlur={formatPhoneNumber}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Default Tax Rate (%)</Label>
                  <NumberInput 
                    id="taxRate" 
                    className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold"
                    value={settings?.taxRate || 0} 
                    onValueChange={(num) => setSettings(prev => prev ? { ...prev, taxRate: num } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Currency</Label>
                  <Input id="currency" value={settings?.currency || "USD"} disabled className="bg-black/20 border-white/5 text-white/40 rounded-xl h-12 font-bold" />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Timezone</Label>
                  <StableInput 
                    id="timezone" 
                    className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold"
                    value={settings?.timezone || ""} 
                    onValueChange={(val) => setSettings(prev => prev ? { ...prev, timezone: val } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Default Technician Commission (%)</Label>
                  <NumberInput 
                    id="commissionRate" 
                    className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold"
                    value={settings?.commissionRate || 0} 
                    onValueChange={(num) => setSettings(prev => prev ? { ...prev, commissionRate: num } : null)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 pt-8">
                <Button 
                  onClick={() => handleSaveSettings(settings || {})} 
                  className="bg-primary hover:bg-red-700 text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] w-full"
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Authorize Business Update
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Business Hours */}
          <div className="mt-8"></div>
          <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/20">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Business <span className="text-primary italic">Hours</span></CardTitle>
              <CardDescription className="text-white/40 font-black uppercase tracking-widest text-[10px] mt-1">Configure normal operating hours and after-hours protocol</CardDescription>
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
                        <Label className="font-bold uppercase tracking-widest text-white/80">{dayName}</Label>
                      </div>
                      
                      <div className={`flex flex-1 items-center gap-4 transition-opacity ${!dayData?.isOpen ? 'opacity-20 pointer-events-none' : ''}`}>
                        <div className="flex-1 space-y-1">
                          <Label className="text-[10px] uppercase font-black tracking-widest text-white/40">Open</Label>
                          <Input 
                            type="time" 
                            className="bg-black/60 border-white/10 rounded-lg text-white font-bold h-11 focus:ring-2 focus:ring-primary/50"
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
                          <Label className="text-[10px] uppercase font-black tracking-widest text-white/40">Close</Label>
                          <Input 
                            type="time" 
                            className="bg-black/60 border-white/10 rounded-lg text-white font-bold h-11 focus:ring-2 focus:ring-primary/50"
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
                      <p className="text-xs text-white/60 font-medium tracking-tight">Allow booking outside normal business hours with a conditional fee.</p>
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
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">After-Hours Fee Amount ($)</Label>
                        <NumberInput 
                          id="afterHoursFeeAmount" 
                          className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold"
                          value={settings?.businessHours?.afterHoursFeeAmount || 0} 
                          onValueChange={(num) => setSettings(prev => prev ? { 
                            ...prev, 
                            businessHours: { ...(prev.businessHours as any), afterHoursFeeAmount: num } 
                          } : null)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 pt-8 border-t border-white/5 mt-8">
                <Button 
                  onClick={() => handleSaveSettings(settings || {})} 
                  className="bg-primary hover:bg-red-700 text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] w-full"
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Authorize Business Update
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Travel Pricing Merged */}
          <div className="mt-8"></div>
          <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/20">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Mileage & <span className="text-primary italic">Travel Logistics</span></CardTitle>
              <CardDescription className="text-white/40 font-black uppercase tracking-widest text-[10px] mt-1">Configure asset logistics and travel premiums</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-12">
              <div className="flex items-center justify-between p-6 bg-primary/5 rounded-2xl border border-primary/10">
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading flex items-center gap-3">
                    <Truck className="w-6 h-6 text-primary" />
                    Protocol Status
                  </h3>
                  <p className="text-xs text-white/60 font-medium leading-relaxed">Toggle the entire travel premium architecture on or off.</p>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Status Toggle</Label>
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
                        <p className="text-xs text-white/60 font-medium">Select the protocol for determining travel premiums.</p>
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
                        <SelectTrigger className="w-[200px] bg-black/40 border-white/10 text-white font-bold h-12 rounded-xl">
                          <SelectValue placeholder="Select Mode" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-white/10 text-white font-bold">
                          <SelectItem value="mileage">Mileage Based</SelectItem>
                          <SelectItem value="zones">Radius Zones</SelectItem>
                          <SelectItem value="map_zones">Map Boundaries</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2 col-span-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Internal Tactical Base (Private location for distance logic)</Label>
                    <AddressInput 
                      defaultValue={settings?.baseAddress}
                      onAddressSelect={(address, lat, lng) => handleSaveSettings({ baseAddress: address, baseLatitude: lat, baseLongitude: lng })}
                      placeholder="Coordinates home base (Internal use only)"
                    />
                  </div>

                  {settings?.travelPricing.mode === "mileage" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 col-span-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="space-y-2">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Rate Per Mile ($)</Label>
                        <NumberInput 
                          id="pricePerMile" 
                          placeholder="e.g. 1.50"
                          className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold"
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
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Free Range Threshold (One Way Miles)</Label>
                        <NumberInput 
                          id="freeMilesThreshold" 
                          placeholder="e.g. 10"
                          className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold"
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
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Floor Travel Fee ($)</Label>
                        <NumberInput 
                          id="minTravelFee" 
                          placeholder="e.g. 0"
                          className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold"
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
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Ceiling Travel Fee ($)</Label>
                        <NumberInput 
                          id="maxTravelFee" 
                          placeholder="e.g. 100"
                          className="bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold"
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
                          <p className="text-xs text-white/60 font-medium tracking-tight">Calculate fee based on cumulative distance (departure and return).</p>
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
                          <p className="text-xs text-white/60 font-medium tracking-tight">Set discrete flat fees based on incremental distance from base.</p>
                        </div>
                        <Button 
                          onClick={handleAddTravelZone}
                          className="bg-primary hover:bg-red-700 text-white font-bold h-10 px-6 rounded-xl text-[10px] uppercase tracking-widest"
                        >
                          <Plus className="w-4 h-4 mr-2" /> Register Zone
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        {settings?.travelPricing.zones?.map((zone, idx) => (
                          <div key={zone.id} className="grid grid-cols-4 gap-4 p-4 bg-black/40 rounded-2xl border border-white/5 items-end group">
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Zone Alias</Label>
                              <Input 
                                value={zone.name}
                                onChange={(e) => handleUpdateTravelZone(idx, { name: e.target.value })}
                                className="bg-white/5 border-white/10 text-white font-bold h-12 rounded-xl"
                                placeholder="Local Area"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Min Miles</Label>
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
                          <DialogTrigger className="bg-primary hover:bg-red-700 text-white font-black h-10 px-6 rounded-xl text-[10px] uppercase tracking-widest flex items-center justify-center">
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
                                ? `${(zone.radius ? (zone.radius / 1609.34).toFixed(2) : 0)} Mile Radius Captured`
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
                    className="bg-primary hover:bg-red-700 text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] col-span-2"
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
          <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/20">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Visual <span className="text-primary italic">Branding</span></CardTitle>
              <CardDescription className="text-white/60 font-medium uppercase tracking-widest text-[10px] mt-1">Manage your business logo and document identity</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-12">
              <div className="space-y-6">
                <Label className="text-white font-black uppercase tracking-widest text-[10px]">Business Logo Asset</Label>
                <div className="flex gap-8 items-center">
                  <div className="w-48 h-48 bg-black/40 rounded-[2.5rem] border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-2xl group relative transition-all duration-500 hover:border-primary/50 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
                    {logoPreview || settings?.logoUrl ? (
                      <div className="relative w-full h-full flex items-center justify-center p-6">
                        <img 
                          src={logoPreview || settings?.logoUrl || ""} 
                          alt="Logo" 
                          className="w-full h-full object-contain transition-all duration-300" 
                          style={{
                            transform: `scale(${settings?.logoSettings?.scale || 1}) translate(${settings?.logoSettings?.x || 0}px, ${settings?.logoSettings?.y || 0}px)`
                          }}
                        />
                      </div>
                    ) : (
                      <ImageIcon className="w-12 h-12 text-white/10" />
                    )}
                    <div 
                      className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-sm" 
                      onClick={() => !isUploading && fileInputRef.current?.click()}
                    >
                      <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
                        <Upload className="w-6 h-6 text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-8">
                    <div className="space-y-2">
                      <h4 className="text-lg font-black text-white uppercase tracking-tight">Business Logo <span className="text-primary italic">Asset</span></h4>
                      <p className="text-xs text-white/40 font-medium leading-relaxed max-w-md">
                        This asset will be used across all official documents, invoices, and the public booking interface. 
                        Adjust the scale and positioning to ensure it fits perfectly in all contexts.
                      </p>
                    </div>
                    
                    {settings?.logoUrl && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-left-4 duration-500">
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">Scale Factor</Label>
                            <span className="text-[10px] font-black text-primary">{(settings?.logoSettings?.scale || 1).toFixed(2)}x</span>
                          </div>
                          <Slider 
                            value={[settings?.logoSettings?.scale || 1]} 
                            min={0.1} 
                            max={3} 
                            step={0.01} 
                            onValueChange={(vals) => {
                              const val = vals[0];
                              setSettings(prev => prev ? { 
                                ...prev, 
                                logoSettings: { ...(prev.logoSettings || { scale: 1, x: 0, y: 0 }), scale: val } 
                              } : null);
                            }}
                            className="[&_[role=slider]]:bg-primary"
                          />
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">X-Position</Label>
                            <span className="text-[10px] font-black text-primary">{settings?.logoSettings?.x || 0}px</span>
                          </div>
                          <Slider 
                            value={[settings?.logoSettings?.x || 0]} 
                            min={-100} 
                            max={100} 
                            step={1} 
                            onValueChange={(vals) => {
                              const val = vals[0];
                              setSettings(prev => prev ? { 
                                ...prev, 
                                logoSettings: { ...(prev.logoSettings || { scale: 1, x: 0, y: 0 }), x: val } 
                              } : null);
                            }}
                            className="[&_[role=slider]]:bg-primary"
                          />
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">Y-Position</Label>
                            <span className="text-[10px] font-black text-primary">{settings?.logoSettings?.y || 0}px</span>
                          </div>
                          <Slider 
                            value={[settings?.logoSettings?.y || 0]} 
                            min={-100} 
                            max={100} 
                            step={1} 
                            onValueChange={(vals) => {
                              const val = vals[0];
                              setSettings(prev => prev ? { 
                                ...prev, 
                                logoSettings: { ...(prev.logoSettings || { scale: 1, x: 0, y: 0 }), y: val } 
                              } : null);
                            }}
                            className="[&_[role=slider]]:bg-primary"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleLogoUpload}
                        accept=".png,.jpg,.jpeg"
                        className="hidden"
                      />
                      <Button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="bg-primary hover:bg-red-700 text-white font-black h-12 px-8 rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Uploading {uploadProgress}%
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Upload New Asset
                          </>
                        )}
                      </Button>
                      {settings?.logoUrl && (
                        <Button 
                          type="button" 
                          variant="outline"
                          onClick={() => handleSaveSettings({ logoUrl: "" })}
                          className="border-white/10 bg-white/5 text-white hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 rounded-xl h-12 px-6 font-black uppercase tracking-widest text-[10px] transition-all"
                        >
                          Remove
                        </Button>
                      )}
                      {settings?.logoUrl && (
                        <Button 
                          type="button" 
                          onClick={() => handleSaveSettings(settings)}
                          disabled={isSaving}
                          className="bg-white text-black hover:bg-gray-200 font-black h-12 px-8 rounded-xl uppercase tracking-widest text-[10px] shadow-lg transition-all hover:scale-[1.02]"
                        >
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                          Save Branding
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-[0.2em] text-white/20">
                      <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-green-500" /> PNG/JPG/JPEG</span>
                      <span className="w-1 h-1 bg-white/10 rounded-full"></span>
                      <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-green-500" /> Max 2MB</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6 pt-12 border-t border-white/5">
                <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5">
                  <div className="space-y-1">
                    <Label className="text-white font-black uppercase tracking-widest text-[10px]">Document Logo Visibility</Label>
                    <p className="text-xs text-white/60 font-medium">Include your official logo on invoices, quotes, and reports.</p>
                  </div>
                  <Switch defaultChecked className="data-[state=checked]:bg-primary" />
                </div>
                <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5">
                  <div className="space-y-1">
                    <Label className="text-white font-black uppercase tracking-widest text-[10px]">Watermark Protocol</Label>
                    <p className="text-xs text-white/60 font-medium">Add a subtle watermark to the background of PDF exports.</p>
                  </div>
                  <Switch defaultChecked className="data-[state=checked]:bg-primary" />
                </div>
              </div>

              <div className="space-y-6">
                <Label className="text-white font-black uppercase tracking-widest text-[10px]">Asset Scale in Documents</Label>
                <div className="pt-4 px-2">
                  <Slider defaultValue={[50]} max={100} step={1} className="[&_[role=slider]]:bg-primary" />
                </div>
                <div className="flex justify-between text-[8px] text-white/20 font-black uppercase tracking-[0.2em]">
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

              <Button className="w-full bg-primary hover:bg-red-700 text-white font-black uppercase tracking-[0.2em] h-14 rounded-xl text-xs shadow-lg shadow-primary/20 transition-all hover:scale-[1.01]">
                Authorize Branding Update
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="mt-0">
          <div className="grid grid-cols-1 gap-8">
            <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
              <CardHeader className="p-8 border-b border-white/5 bg-black/20 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Service <span className="text-primary italic">Protocols</span></CardTitle>
                  <CardDescription className="text-[10px] text-white/40 font-black uppercase tracking-widest mt-1">Manage your primary detailing packages</CardDescription>
                </div>
                <Button size="sm" className="bg-primary hover:bg-red-700 text-white font-black rounded-xl h-10 px-4 uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]" onClick={() => {
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
            <DialogContent className="max-w-2xl bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black">
              <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">{editingService?.id ? "Modify Service Protocol" : "Initialize New Service"}</DialogTitle>
                    <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mt-1">Operational Service Definition</p>
                  </div>
                </div>
              </DialogHeader>
              <form onSubmit={handleSaveService} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Protocol Designation (Name)</Label>
                    <StableInput 
                      value={editingService?.name || ""} 
                      onValueChange={val => setEditingService(prev => ({ ...prev!, name: val }))}
                      required
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Operational Brief (Description)</Label>
                    <StableTextarea 
                      value={editingService?.description || ""} 
                      onValueChange={val => setEditingService(prev => ({ ...prev!, description: val }))}
                      className="bg-black/40 border-white/10 text-white rounded-xl font-bold min-h-[100px]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Mission Category</Label>
                      <Select 
                        value={editingService?.category || ""} 
                        onValueChange={(v: any) => setEditingService(prev => ({ ...prev!, category: v }))}
                      >
                        <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold">
                          <SelectValue placeholder="Select Category" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-border text-black">
                          {categories.filter(c => c.type === "service" && c.isActive).map(cat => (
                            <SelectItem key={cat.id} value={cat.name} className="font-bold">{cat.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Base Financial Value ($)</Label>
                      <NumberInput 
                        value={editingService?.basePrice || 0}
                        onValueChange={val => setEditingService(prev => ({ ...prev!, basePrice: val }))}
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Duration (Minutes)</Label>
                      <StableInput 
                        type="text"
                        inputMode="numeric"
                        value={editingService?.estimatedDuration?.toString() || ""} 
                        onValueChange={val => setEditingService(prev => ({ ...prev!, estimatedDuration: parseInt(val) || 0 }))}
                        required
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Buffer Time (Minutes)</Label>
                      <StableInput 
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 15"
                        value={editingService?.bufferTimeMinutes?.toString() || ""} 
                        onValueChange={val => setEditingService(prev => ({ ...prev!, bufferTimeMinutes: parseInt(val) || 0 }))}
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Taxable</Label>
                      <Switch 
                        checked={editingService?.isTaxable ?? true} 
                        onCheckedChange={v => setEditingService(prev => ({ ...prev!, isTaxable: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Requires Waiver</Label>
                      <Switch 
                        checked={editingService?.requiresWaiver ?? false} 
                        onCheckedChange={v => setEditingService(prev => ({ ...prev!, requiresWaiver: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Active Status</Label>
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
                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Require Deposit</Label>
                      <p className="text-[10px] text-white/40">Require a deposit when booking this service</p>
                    </div>
                    <Switch 
                      checked={editingService?.depositRequired ?? false} 
                      onCheckedChange={v => setEditingService(prev => ({ ...prev!, depositRequired: v }))}
                    />
                  </div>
                  
                  {editingService?.depositRequired && (
                    <div className="grid grid-cols-2 gap-6 p-6 bg-black/20 rounded-2xl border border-white/5">
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Deposit Type</Label>
                        <Select 
                          value={editingService?.depositType || "fixed"} 
                          onValueChange={(v: "fixed" | "percentage") => setEditingService(prev => ({ ...prev!, depositType: v }))}
                        >
                          <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-white/10">
                            <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                            <SelectItem value="percentage">Percentage (%)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Deposit Amount</Label>
                        <NumberInput 
                          value={editingService?.depositAmount || 0}
                          onValueChange={val => setEditingService(prev => ({ ...prev!, depositAmount: val }))}
                          className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-6 pt-6 border-t border-white/5">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Maintenance Return Automation</Label>
                      <p className="text-[10px] text-white/40">Enable autonomous return scheduling protocols</p>
                    </div>
                    <Switch 
                      checked={editingService?.maintenanceReturnEnabled ?? false} 
                      onCheckedChange={v => setEditingService(prev => ({ ...prev!, maintenanceReturnEnabled: v }))}
                    />
                  </div>
                  
                  {editingService?.maintenanceReturnEnabled && (
                    <div className="grid grid-cols-2 gap-6 p-6 bg-black/20 rounded-2xl border border-white/5">
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Interval (Days)</Label>
                        <StableInput 
                          type="text"
                          inputMode="numeric"
                          value={editingService?.maintenanceIntervalDays?.toString() || ""} 
                          onValueChange={val => setEditingService(prev => ({ ...prev!, maintenanceIntervalDays: parseInt(val) || 0 }))}
                          className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Interval (Months)</Label>
                        <StableInput 
                          type="text"
                          inputMode="numeric"
                          value={editingService?.maintenanceIntervalMonths?.toString() || ""} 
                          onValueChange={val => setEditingService(prev => ({ ...prev!, maintenanceIntervalMonths: parseInt(val) || 0 }))}
                          className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                        />
                      </div>
                      <div className="flex items-center justify-between col-span-2 p-3 bg-white/5 rounded-xl">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Auto-create Calendar Return</Label>
                        <Switch 
                          checked={editingService?.autoCreateCalendarReturn ?? false} 
                          onCheckedChange={v => setEditingService(prev => ({ ...prev!, autoCreateCalendarReturn: v }))}
                        />
                      </div>
                      <div className="flex items-center justify-between col-span-2 p-3 bg-white/5 rounded-xl">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Auto-create Lead Follow-up</Label>
                        <Switch 
                          checked={editingService?.autoCreateLeadFollowUp ?? false} 
                          onCheckedChange={v => setEditingService(prev => ({ ...prev!, autoCreateLeadFollowUp: v }))}
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Pricing by Vehicle Size Matrix</Label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {VEHICLE_SIZES.map(size => (
                        <div key={size.value} className="space-y-2">
                          <Label className="text-[9px] font-black uppercase tracking-tighter text-white/40">{size.label}</Label>
                          <StableInput 
                            type="text"
                            inputMode="decimal"
                            className="bg-black/40 border-white/10 text-white h-10 rounded-lg font-bold text-xs"
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
                    className="flex-1 text-white/40 hover:text-white font-black uppercase tracking-widest text-[10px] h-14"
                  >
                    Abort
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-[2] bg-primary hover:bg-red-700 text-white font-black rounded-2xl h-14 px-8 uppercase tracking-[0.2em] text-xs shadow-xl shadow-primary/20 transition-all hover:scale-105"
                  >
                    Authorize Protocol
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Enhancement Add-ons */}
          <div className="grid grid-cols-1 gap-8 mt-8">
            <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
              <CardHeader className="p-8 border-b border-white/5 bg-black/20 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Enhancement <span className="text-primary italic">Add-ons</span></CardTitle>
                  <CardDescription className="text-[10px] text-white/40 font-black uppercase tracking-widest mt-1">Extra services that can be added to any package</CardDescription>
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
            <DialogContent className="max-w-xl bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black">
              <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                    <Tag className="w-6 h-6" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">{editingAddon?.id ? "Modify Enhancement" : "Initialize Enhancement"}</DialogTitle>
                    <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mt-1">Operational Add-on Definition</p>
                  </div>
                </div>
              </DialogHeader>
              <form onSubmit={handleSaveAddon} className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Enhancement Designation (Name)</Label>
                    <StableInput 
                      value={editingAddon?.name || ""} 
                      onValueChange={val => setEditingAddon(prev => ({ ...prev!, name: val }))}
                      required
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Enhancement Brief (Description)</Label>
                    <StableTextarea 
                      value={editingAddon?.description || ""} 
                      onValueChange={val => setEditingAddon(prev => ({ ...prev!, description: val }))}
                      className="bg-black/40 border-white/10 text-white rounded-xl font-bold min-h-[100px]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Mission Category</Label>
                      <Select 
                        value={(editingAddon as any)?.category || ""} 
                        onValueChange={(v: any) => setEditingAddon(prev => ({ ...prev!, category: v }))}
                      >
                        <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold">
                          <SelectValue placeholder="Select Category" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-border text-black">
                          {categories.filter(c => c.type === "addon" && c.isActive).map(cat => (
                            <SelectItem key={cat.id} value={cat.name} className="font-bold">{cat.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Financial Value ($)</Label>
                      <NumberInput 
                        value={editingAddon.price || 0}
                        onValueChange={val => setEditingAddon(prev => ({ ...prev!, price: val }))}
                        required
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Duration (Minutes)</Label>
                      <NumberInput 
                        value={editingAddon.estimatedDuration || 0}
                        onValueChange={val => setEditingAddon(prev => ({ ...prev!, estimatedDuration: val }))}
                        required
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Buffer Time (Minutes)</Label>
                      <StableInput 
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 5"
                        value={editingAddon?.bufferTimeMinutes?.toString() || ""} 
                        onValueChange={val => setEditingAddon(prev => ({ ...prev!, bufferTimeMinutes: parseInt(val) || 0 }))}
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Taxable</Label>
                      <Switch 
                        checked={editingAddon?.isTaxable ?? true} 
                        onCheckedChange={v => setEditingAddon(prev => ({ ...prev!, isTaxable: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Active Status</Label>
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
                    className="flex-1 text-white/40 hover:text-white font-black uppercase tracking-widest text-[10px] h-14"
                  >
                    Abort
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-[2] bg-primary hover:bg-red-700 text-white font-black rounded-2xl h-14 px-8 uppercase tracking-[0.2em] text-xs shadow-xl shadow-primary/20 transition-all hover:scale-105"
                  >
                    Authorize Protocol
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
                        <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-3">
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
                    className="flex-[2] bg-primary hover:bg-red-700 text-white font-black rounded-2xl h-14 px-8 uppercase tracking-[0.2em] text-xs shadow-xl shadow-primary/20 transition-all hover:scale-105"
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
            <CardHeader className="p-8 border-b border-white/5 bg-black/20">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">System <span className="text-primary italic">Integrations</span></CardTitle>
              <CardDescription className="text-white/40 font-medium uppercase tracking-widest text-[10px] mt-1">Connect and synchronize external payment architectures</CardDescription>
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

              {["Stripe", "Square", "PayPal", "Clover"].map(provider => (
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
                    {provider === "Clover" ? (
                      <Badge className={cloverConfigured ? "bg-green-500/10 text-green-500 border-green-500/20 uppercase text-[10px] font-black tracking-widest px-3 py-1" : "bg-red-500/10 text-red-500 border-red-500/20 uppercase text-[10px] font-black tracking-widest px-3 py-1"}>
                        {cloverConfigured ? "Authenticated" : "Unauthorized"}
                      </Badge>
                    ) : (
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
                    )}
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
                      {provider === "Clover" && (
                        <>
                          <div className="space-y-2">
                            <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Merchant ID</Label>
                            <StableInput 
                              value={settings?.paymentIntegrations?.clover?.merchantId || ""}
                              onValueChange={(val) => setSettings(prev => prev ? { 
                                ...prev,
                                paymentIntegrations: { 
                                  ...prev.paymentIntegrations, 
                                  clover: { ...prev.paymentIntegrations?.clover!, merchantId: val } 
                                } 
                              } : null)}
                              className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Access Token</Label>
                            <StableInput 
                              type="password"
                              value={settings?.paymentIntegrations?.clover?.accessToken || ""}
                              onValueChange={(val) => setSettings(prev => prev ? { 
                                ...prev,
                                paymentIntegrations: { 
                                  ...prev.paymentIntegrations, 
                                  clover: { ...prev.paymentIntegrations?.clover!, accessToken: val } 
                                } 
                              } : null)}
                              className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-mono text-xs"
                            />
                          </div>
                          <div className="col-span-full pt-4">
                            <Button 
                              variant="outline" 
                              className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10 font-black rounded-xl h-12 uppercase tracking-widest text-[10px]"
                              onClick={() => window.open("/api/clover/auth", "_blank")}
                            >
                              <Plug className="w-4 h-4 mr-2 text-primary" />
                              Re-Authenticate Clover Protocol
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <Button 
                onClick={() => handleSaveSettings(settings || {})} 
                className="bg-primary hover:bg-red-700 text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
              >
                Save Integration Protocol
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

                <TabsContent value="client-types" className="mt-0">
          <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/20">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Loyalty <span className="text-primary italic">Engine</span></CardTitle>
              <CardDescription className="text-white/40 font-medium uppercase tracking-widest text-[10px] mt-1">Configure customer retention algorithms and reward synthesis</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Points Per Dollar Spent</Label>
                  <StableInput 
                    type="text" 
                    inputMode="numeric"
                    value={settings?.loyaltySettings?.pointsPerDollar?.toString() || ""} 
                    onValueChange={(val) => setSettings(prev => prev ? { 
                      ...prev, 
                      loyaltySettings: { ...prev.loyaltySettings, pointsPerDollar: parseFloat(val) || 0 } 
                    } : null)}
                    className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Points Per Visit</Label>
                  <StableInput 
                    type="text" 
                    inputMode="numeric"
                    value={settings?.loyaltySettings?.pointsPerVisit?.toString() || ""} 
                    onValueChange={(val) => setSettings(prev => prev ? { 
                      ...prev, 
                      loyaltySettings: { ...prev.loyaltySettings, pointsPerVisit: parseFloat(val) || 0 } 
                    } : null)}
                    className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Redemption Rate ($ per point)</Label>
                  <StableInput 
                    type="text" 
                    inputMode="decimal"
                    value={settings?.loyaltySettings?.redemptionRate?.toString() || ""} 
                    onValueChange={(val) => setSettings(prev => prev ? { 
                      ...prev, 
                      loyaltySettings: { ...prev.loyaltySettings, redemptionRate: parseFloat(val) || 0 } 
                    } : null)}
                    className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                  />
                  <p className="text-[10px] text-white/20 font-black uppercase tracking-widest mt-1">Example: 0.01 means 100 points = $1.00</p>
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Minimum Points to Redeem</Label>
                  <StableInput 
                    type="text" 
                    inputMode="numeric"
                    value={settings?.loyaltySettings?.minPointsToRedeem?.toString() || ""} 
                    onValueChange={(val) => setSettings(prev => prev ? { 
                      ...prev, 
                      loyaltySettings: { ...prev.loyaltySettings, minPointsToRedeem: parseFloat(val) || 0 } 
                    } : null)}
                    className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all">
                <div className="space-y-1">
                  <Label className="text-sm font-black text-white uppercase tracking-tight">Stack with Coupons</Label>
                  <p className="text-[10px] text-white/40 font-medium">Allow customers to use points and coupons on the same order.</p>
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
                className="bg-primary hover:bg-red-700 text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
              >
                Save Loyalty Engine
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="mt-0">
          <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/20">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Commission <span className="text-primary italic">Architecture</span></CardTitle>
              <CardDescription className="text-white/40 font-medium uppercase tracking-widest text-[10px] mt-1">Set default technician payout protocols for completed operations</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Default Commission Type</Label>
                  <Select 
                    value={settings?.commissionType || "percentage"} 
                    onValueChange={(val: "percentage" | "flat") => setSettings(prev => prev ? { ...prev, commissionType: val } : null)}
                  >
                    <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-black uppercase tracking-widest text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-border text-black">
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="flat">Flat Fee ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Default Commission Rate</Label>
                  <div className="relative">
                    <StableInput 
                      type="text" 
                      inputMode="decimal"
                      value={settings?.commissionRate?.toString() || ""} 
                      onValueChange={(val) => setSettings(prev => prev ? { ...prev, commissionRate: parseFloat(val) || 0 } : null)}
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold pl-10"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary">
                      {settings?.commissionType === "percentage" ? <Percent className="w-4 h-4" /> : <DollarIcon className="w-4 h-4" />}
                    </div>
                  </div>
                </div>
              </div>
              <Button 
                onClick={() => handleSaveSettings(settings || {})} 
                className="bg-primary hover:bg-red-700 text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
              >
                Save Commission Protocol
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coupons" className="mt-0">
          <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/20 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Promotional <span className="text-primary italic">Incentives</span></CardTitle>
                <CardDescription className="text-[10px] text-white/40 font-black uppercase tracking-widest mt-1">Create and manage discount codes for your elite clientele</CardDescription>
              </div>
              <Button size="sm" className="bg-primary hover:bg-red-700 text-white font-black rounded-xl h-10 px-4 uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]" onClick={() => {
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
                        {!coupon.isActive && <Badge variant="secondary" className="bg-gray-800 text-gray-400 border-none text-[8px] uppercase font-black tracking-widest">Inactive</Badge>}
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
                        <p className="text-[8px] text-white/20 font-black uppercase tracking-[0.2em]">Discount Value</p>
                        <p className="text-white font-black text-xl tracking-tighter">
                          {coupon.discountType === "percentage" ? `${coupon.discountValue}% OFF` : `$${coupon.discountValue} OFF`}
                        </p>
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t border-white/5">
                        <div className="space-y-1">
                          <p className="text-[7px] text-white/20 font-black uppercase tracking-widest">Usage</p>
                          <p className="text-[10px] text-white/40 font-bold">{coupon.usageCount} / {coupon.usageLimit || "∞"}</p>
                        </div>
                        {coupon.expiryDate && coupon.expiryDate instanceof Timestamp && (
                          <div className="text-right space-y-1">
                            <p className="text-[7px] text-white/20 font-black uppercase tracking-widest">Expires</p>
                            <p className="text-[10px] text-white/40 font-bold">{format(coupon.expiryDate.toDate(), "MM/dd/yy")}</p>
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
            <DialogContent className="max-w-xl bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black">
              <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                    <Ticket className="w-6 h-6" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">{editingCoupon?.id ? "Modify Incentive" : "Initialize Incentive"}</DialogTitle>
                    <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mt-1">Operational Discount Protocol</p>
                  </div>
                </div>
              </DialogHeader>
              <form onSubmit={handleSaveCoupon} className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Incentive Code (Designation)</Label>
                    <StableInput 
                      placeholder="SUMMER24"
                      value={editingCoupon?.code || ""} 
                      onValueChange={val => setEditingCoupon(prev => ({ ...prev!, code: val.toUpperCase() }))}
                      required
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-black uppercase tracking-widest text-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Discount Type</Label>
                      <Select 
                        value={editingCoupon?.discountType || "percentage"} 
                        onValueChange={(v: any) => setEditingCoupon(prev => ({ ...prev!, discountType: v }))}
                      >
                        <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-black uppercase tracking-widest text-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-border text-black">
                          <SelectItem value="percentage" className="font-black">PERCENTAGE (%)</SelectItem>
                          <SelectItem value="fixed" className="font-black">FIXED AMOUNT ($)</SelectItem>
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
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Usage Limit (0 for ∞)</Label>
                      <StableInput 
                        type="text"
                        inputMode="numeric"
                        value={editingCoupon?.usageLimit?.toString() || ""} 
                        onValueChange={val => setEditingCoupon(prev => ({ ...prev!, usageLimit: parseInt(val) || 0 }))}
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Expiry Protocol (Optional)</Label>
                      <Input 
                        type="date"
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                        value={editingCoupon?.expiryDate ? format(editingCoupon.expiryDate.toDate(), "yyyy-MM-dd") : ""}
                        onChange={e => {
                          const date = e.target.value ? Timestamp.fromDate(new Date(e.target.value)) : undefined;
                          setEditingCoupon(prev => ({ ...prev!, expiryDate: date }));
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Operational Status</Label>
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
                    className="flex-1 text-white/40 hover:text-white font-black uppercase tracking-widest text-[10px] h-14"
                  >
                    Abort
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-[2] bg-primary hover:bg-red-700 text-white font-black rounded-2xl h-14 px-8 uppercase tracking-[0.2em] text-xs shadow-xl shadow-primary/20 transition-all hover:scale-105"
                  >
                    Authorize Incentive
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="automation" className="mt-0">
          <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/20 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Operational <span className="text-primary italic">Automations</span></CardTitle>
                <CardDescription className="text-[10px] text-white/40 font-black uppercase tracking-widest mt-1">Configure autonomous client engagement protocols</CardDescription>
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
                  <p className="text-xs text-white/40 font-medium">Automatically initiate follow-up sequences after service completion.</p>
                </div>
                <Switch 
                  checked={settings?.automationSettings?.followUpEnabled || false}
                  onCheckedChange={(val) => setSettings(prev => prev ? { 
                    ...prev,
                    automationSettings: { ...prev.automationSettings!, followUpEnabled: val } 
                  } : null)}
                  className="data-[state=checked]:bg-primary"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Deployment Delay</Label>
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
                    <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest italic">Wait time after "Completed" status trigger.</p>
                  </div>

                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Transmission Channel</Label>
                    <Select 
                      value={settings?.automationSettings?.channels || "email"}
                      onValueChange={(val: any) => setSettings(prev => prev ? { 
                        ...prev,
                        automationSettings: { ...prev.automationSettings!, channels: val } 
                      } : null)}
                    >
                      <SelectTrigger className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-border text-black">
                        <SelectItem value="email">Email Protocol</SelectItem>
                        <SelectItem value="sms">SMS Protocol</SelectItem>
                        <SelectItem value="both">Dual-Channel (Email & SMS)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5">
                    <div className="space-y-1">
                      <Label className="font-black text-white uppercase tracking-tight text-sm">Review Acquisition</Label>
                      <p className="text-[10px] text-white/40 font-medium">Include Google Review link for first-time clients.</p>
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
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Google Review Endpoint</Label>
                      <StableInput 
                        value={settings?.automationSettings?.googleReviewUrl || ""}
                        onValueChange={(val) => setSettings(prev => prev ? { 
                          ...prev,
                          automationSettings: { ...prev.automationSettings!, googleReviewUrl: val } 
                        } : null)}
                        placeholder="https://g.page/r/..."
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-8">
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Email Subject Header</Label>
                    <StableInput 
                      value={settings?.automationSettings?.emailSubject || ""}
                      onValueChange={(val) => setSettings(prev => prev ? { 
                        ...prev,
                        automationSettings: { ...prev.automationSettings!, emailSubject: val } 
                      } : null)}
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-bold"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Email Payload Content</Label>
                    <StableTextarea 
                      value={settings?.automationSettings?.emailBody || ""}
                      onValueChange={(val) => setSettings(prev => prev ? { 
                        ...prev,
                        automationSettings: { ...prev.automationSettings!, emailBody: val } 
                      } : null)}
                      rows={6}
                      className="bg-black/40 border-white/10 text-white rounded-2xl font-medium p-4"
                    />
                    <p className="text-[9px] text-white/20 font-mono uppercase tracking-widest">Variables: {"{{firstName}}, {{businessName}}"}</p>
                  </div>
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">SMS Payload Content</Label>
                    <StableTextarea 
                      value={settings?.automationSettings?.smsBody || ""}
                      onValueChange={(val) => setSettings(prev => prev ? { 
                        ...prev,
                        automationSettings: { ...prev.automationSettings!, smsBody: val } 
                      } : null)}
                      rows={4}
                      className="bg-black/40 border-white/10 text-white rounded-2xl font-medium p-4"
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
                    <p className="text-xs text-white/60 font-medium leading-relaxed">System-wide control for scheduled transactional messaging.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Master Trigger</Label>
                    <Switch 
                      checked={settings?.communicationAutomation?.enabled ?? false} 
                      onCheckedChange={(val) => setSettings(prev => prev ? { 
                        ...prev,
                        communicationAutomation: { ...(prev.communicationAutomation || { enabled: false, bookingConfirmation: true, reminder24h: true, reminder2h: true }), enabled: val } 
                      } : null)}
                      className="data-[state=checked]:bg-primary"
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
                      <p className="text-[9px] text-white/40 font-black uppercase tracking-widest">
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
                      <p className="text-[9px] text-white/40 font-black uppercase tracking-widest">
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
                      <p className="text-[9px] text-white/40 font-black uppercase tracking-widest">
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
                    <p className="text-xs text-white/60 font-medium leading-relaxed">Autonomous weather monitoring and risk mitigation protocols.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Status Toggle</Label>
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
                          <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Surveillance Lead Time</Label>
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
                        <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest italic">Hours before deployment to initiate final weather telemetry check.</p>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Precipitation Threshold</Label>
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
                        <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest italic">Minimum rain probability percentage to trigger an operational warning.</p>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5">
                        <div className="space-y-1">
                          <Label className="font-black text-white uppercase tracking-tight text-sm">Autonomous Client Alerts</Label>
                          <p className="text-[10px] text-white/40 font-medium">Auto-dispatch weather warnings to clients when high-risk conditions are detected.</p>
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
                        <p className="text-[10px] text-white/40 font-medium leading-relaxed">
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
                  className="bg-primary hover:bg-red-700 text-white font-black h-14 px-10 rounded-xl uppercase tracking-[0.2em] text-xs shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
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
          <Card className="border-white/5 bg-card/50 backdrop-blur-sm rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-8 border-b border-white/5 bg-black/20">
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Security & <span className="text-primary italic">Access Control</span></CardTitle>
              <CardDescription className="text-[10px] text-white/40 font-black uppercase tracking-widest mt-1">Manage administrative access and data protection protocols</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Lock className="w-4 h-4" />
                      </div>
                      <Label className="text-sm font-black text-white uppercase tracking-tight">Admin-Only Access</Label>
                    </div>
                    <p className="text-[10px] text-white/40 font-medium ml-10">Restrict financial reports and settings to administrators.</p>
                  </div>
                  <Switch defaultChecked className="data-[state=checked]:bg-primary" />
                </div>

                <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/10 rounded-lg text-white">
                        <Shield className="w-4 h-4" />
                      </div>
                      <Label className="text-sm font-black text-white uppercase tracking-tight">Multi-Factor Auth</Label>
                    </div>
                    <p className="text-[10px] text-white/40 font-medium ml-10">Secondary verification for administrative logins.</p>
                  </div>
                  <Badge variant="secondary" className="bg-gray-800 text-white/40 border-none text-[8px] uppercase font-black tracking-widest px-2 py-1">Coming Soon</Badge>
                </div>

                <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                        <Database className="w-4 h-4" />
                      </div>
                      <Label className="text-sm font-black text-white uppercase tracking-tight">Data Encryption</Label>
                    </div>
                    <p className="text-[10px] text-white/40 font-medium ml-10">PII and financial data encrypted at rest and in transit.</p>
                  </div>
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20 uppercase text-[8px] font-black tracking-widest px-2 py-1">Active</Badge>
                </div>

                <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5 group hover:border-primary/30 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <Label className="text-sm font-black text-white uppercase tracking-tight">Audit Logging</Label>
                    </div>
                    <p className="text-[10px] text-white/40 font-medium ml-10">Track all administrative actions and data modifications.</p>
                  </div>
                  <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 uppercase text-[8px] font-black tracking-widest px-2 py-1">Active</Badge>
                </div>
              </div>

              <div className="pt-8 border-t border-white/5">
                <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-6">Data Architecture Tools</h3>
                <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10 mb-8 flex items-center justify-between">
                  <div className="flex gap-4">
                    <div className="p-3 bg-primary/10 rounded-2xl text-primary shrink-0">
                      <DatabaseZap className="w-5 h-5" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-black text-white uppercase tracking-tight">Legacy Data Synthesis</p>
                      <p className="text-[10px] text-white/40 leading-relaxed font-medium">
                        Synthesize elite client records from legacy database architectures.
                      </p>
                    </div>
                  </div>
                  <Button 
                    size="sm"
                    onClick={async () => {
                      if (confirm("Execute data synthesis protocol? This will re-map all legacy records to the unified client system.")) {
                        setIsSaving(true);
                        try {
                          const result = await migrateDataToClients();
                          toast.success(`Successfully synthesized ${result.migratedCount} elite clients!`);
                        } catch (error) {
                          console.error("Migration error:", error);
                          toast.error("Protocol failure. Check console for diagnostics.");
                        } finally {
                          setIsSaving(false);
                        }
                      }
                    }}
                    className="bg-primary hover:bg-red-700 text-white font-black h-10 px-6 rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DatabaseZap className="w-4 h-4 mr-2" />}
                    Execute
                  </Button>
                </div>
              </div>

              <div className="pt-8 border-t border-white/5">
                <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-6">Discovery & Performance Demo</h3>
                <div className="p-6 bg-purple-500/5 rounded-2xl border border-purple-500/10 mb-8 flex items-center justify-between">
                  <div className="flex gap-4">
                    <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-500 shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-black text-white uppercase tracking-tight">Service Timing Intelligence Demo</p>
                      <p className="text-[10px] text-white/40 leading-relaxed font-medium">
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
                        loading: 'Initializing high-fidelity service intelligence architecture...',
                        success: (data) => {
                          setIsSaving(false);
                          if (data) return 'Service Intelligence Demo Ready. Open "Timothy Timing (Demo)" profile to verify.';
                          return 'Data synthesis finished with anomalies.';
                        },
                        error: (err) => {
                          setIsSaving(false);
                          console.error("Seeding failure:", err);
                          return 'Protocol failure. Check system logs.';
                        },
                      });
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-black h-10 px-6 rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-purple-500/20 transition-all hover:scale-[1.02]"
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                    Initialize
                  </Button>
                </div>
              </div>

              <div className="pt-8 border-t border-white/5">
                <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-6">Privacy & Data Governance</h3>
                <div className="p-6 bg-black/40 rounded-2xl border border-white/5 border-l-4 border-l-primary">
                  <p className="text-xs text-white/40 leading-relaxed font-medium">
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
                      <Button type="submit" className="w-full bg-primary hover:bg-red-700 text-white font-black h-12 rounded-xl uppercase tracking-widest text-xs">
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
                          <Users className="w-5 h-5 text-gray-400 group-hover:text-primary transition-all" />
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
                  {clientTypes.length === 0 && <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest italic text-center py-4">No archetypes defined.</p>}
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
                      <Button type="submit" className="w-full bg-primary hover:bg-red-700 text-white font-black h-12 rounded-xl uppercase tracking-widest text-xs">
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