import { useState, useEffect, createContext, useContext } from "react";
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../firebase";
import { UserProfile } from "../types";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  settings: any | null;
  services: any[];
  addons: any[];
  clientTypes: any[];
  clientCategories: any[];
  loading: boolean;
  systemStatus: 'normal' | 'offline' | 'quota-exhausted' | 'permission-denied';
  signIn: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isTechnician: boolean;
  isReadOnly: boolean;
  canAccessAdmin: boolean;
  canAccessManager: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  
  // Initialize from cache for fast startup
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const cached = localStorage.getItem('auth_profile');
    return cached ? JSON.parse(cached) as UserProfile : null;
  });
  const [settings, setSettings] = useState<any | null>(() => {
    const cached = localStorage.getItem('auth_settings');
    return cached ? JSON.parse(cached) : null;
  });
  const [services, setServices] = useState<any[]>(() => {
    const cached = localStorage.getItem('auth_services');
    return cached ? JSON.parse(cached) : [];
  });
  const [addons, setAddons] = useState<any[]>(() => {
    const cached = localStorage.getItem('auth_addons');
    return cached ? JSON.parse(cached) : [];
  });
  const [clientTypes, setClientTypes] = useState<any[]>(() => {
    const cached = localStorage.getItem('auth_clientTypes');
    return cached ? JSON.parse(cached) : [];
  });
  const [clientCategories, setClientCategories] = useState<any[]>(() => {
    const cached = localStorage.getItem('auth_clientCategories');
    return cached ? JSON.parse(cached) : [];
  });

  const [loading, setLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState<'normal' | 'offline' | 'quota-exhausted' | 'permission-denied'>('normal');

  const isOwnerEmail = user?.email?.toLowerCase() === "flatlinedetail@gmail.com";

  // Force overrides for the owner email
  const effectiveProfile = profile ? {
    ...profile,
    role: isOwnerEmail ? "owner" : profile.role,
    isOwner: isOwnerEmail ? true : profile.isOwner,
    isAdmin: isOwnerEmail ? true : profile.isAdmin,
    accessLevel: isOwnerEmail ? "admin" : profile.accessLevel
  } : null;

  const isAdmin = effectiveProfile?.role === "admin" || effectiveProfile?.role === "owner";
  const isManager = effectiveProfile?.role === "manager" || isAdmin;
  const isTechnician = effectiveProfile?.role === "technician" || isManager;
  const isReadOnly = effectiveProfile?.role === "read-only";
  
  const canAccessAdmin = effectiveProfile?.role === "owner" || effectiveProfile?.role === "admin";
  const canAccessManager = canAccessAdmin || effectiveProfile?.role === "manager";

  useEffect(() => {
    const handleOnline = () => setSystemStatus(prev => prev === 'offline' ? 'normal' : prev);
    const handleOffline = () => setSystemStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) setSystemStatus('offline');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Update caches when state changes
  useEffect(() => { if (profile) localStorage.setItem('auth_profile', JSON.stringify(profile)); }, [profile]);
  useEffect(() => { if (settings) localStorage.setItem('auth_settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { if (services.length) localStorage.setItem('auth_services', JSON.stringify(services)); }, [services]);
  useEffect(() => { if (addons.length) localStorage.setItem('auth_addons', JSON.stringify(addons)); }, [addons]);
  useEffect(() => { if (clientTypes.length) localStorage.setItem('auth_clientTypes', JSON.stringify(clientTypes)); }, [clientTypes]);
  useEffect(() => { if (clientCategories.length) localStorage.setItem('auth_clientCategories', JSON.stringify(clientCategories)); }, [clientCategories]);

  const handleFirebaseError = (err: any) => {
    console.error("Firebase Operation Error:", err);
    if (!err) return;

    const msg = err.message?.toLowerCase() || "";
    const code = err.code?.toLowerCase() || "";

    if (code === 'resource-exhausted' || msg.includes("quota limit exceeded") || msg.includes("resource exhausted")) {
      setSystemStatus('quota-exhausted');
    } else if (code === 'permission-denied' || msg.includes("insufficient permissions")) {
      setSystemStatus('permission-denied');
    }
  };

  useEffect(() => {
    let unsubscribeSettings: (() => void) | null = null;
    let unsubscribeServices: (() => void) | null = null;
    let unsubscribeAddons: (() => void) | null = null;
    let unsubscribeClientTypes: (() => void) | null = null;
    let unsubscribeClientCategories: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (authUser) {
        // If profile was cached, we can stop loading early for UI shell
        if (profile) setLoading(false);

        const isRestricted = systemStatus === 'offline' || systemStatus === 'quota-exhausted';
        
        // Always provide a fallback profile from Auth if Firestore is restricted or missing
        if (!profile || profile.uid !== authUser.uid) {
          const isOwnerEmail = authUser.email?.toLowerCase() === "flatlinedetail@gmail.com";
          const fallbackProfile: UserProfile = {
            uid: authUser.uid,
            id: authUser.uid,
            email: authUser.email || "",
            displayName: authUser.displayName || "",
            photoURL: authUser.photoURL || "",
            role: isOwnerEmail ? "owner" : "technician",
            isOwner: isOwnerEmail,
            isAdmin: isOwnerEmail,
            accessLevel: isOwnerEmail ? "admin" : "technician",
            provider: authUser.providerData[0]?.providerId || "unknown",
            lastLoginAt: new Date() as any,
            createdAt: new Date() as any, // Fallback
          };
          setProfile(fallbackProfile);
        }

        if (isRestricted) {
          console.warn(`⚠️ [Auth] Startup restricted mode: ${systemStatus}. Using local Auth metadata.`);
          setLoading(false);
          return;
        }

        const userDocRef = doc(db, "users", authUser.uid);
        
        // Listen to settings globally for efficiency
        if (!unsubscribeSettings) {
          unsubscribeSettings = onSnapshot(doc(db, "settings", "business"), (snap) => {
            if (snap.exists()) setSettings(snap.data());
          }, (err) => {
            handleFirebaseError(err);
          });
        }

        if (!unsubscribeServices) {
          unsubscribeServices = onSnapshot(collection(db, "services"), (snap) => {
            setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          }, (err) => {
            handleFirebaseError(err);
          });
        }

        if (!unsubscribeAddons) {
          unsubscribeAddons = onSnapshot(collection(db, "addons"), (snap) => {
            setAddons(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          }, (err) => {
            handleFirebaseError(err);
          });
        }

        if (!unsubscribeClientTypes) {
          unsubscribeClientTypes = onSnapshot(collection(db, "client_types"), (snap) => {
            setClientTypes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          }, (err) => {
            handleFirebaseError(err);
          });
        }

        if (!unsubscribeClientCategories) {
          unsubscribeClientCategories = onSnapshot(collection(db, "client_categories"), (snap) => {
            setClientCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          }, (err) => {
            handleFirebaseError(err);
          });
        }
        
        // Use getDoc for one-time profile fetch on auth change
        const fetchProfile = async () => {
          try {
            const docSnap = await getDoc(userDocRef);
            const providerInfo = authUser.providerData[0]?.providerId || "unknown";
            
            if (docSnap.exists()) {
              let data = docSnap.data();
              const updates: any = { 
                lastLoginAt: serverTimestamp(),
                provider: providerInfo
              };

              // Ensure owner email always has owner role
              if (authUser.email?.toLowerCase() === "flatlinedetail@gmail.com" && data.role !== "owner") {
                updates.role = "owner";
                updates.isOwner = true;
                updates.isAdmin = true;
                updates.accessLevel = "admin";
                
                data.role = "owner";
                data.isOwner = true;
                data.isAdmin = true;
                data.accessLevel = "admin";
              }
              
              // Only update if not restricted
              if (systemStatus === 'normal') {
                await updateDoc(userDocRef, updates);
              }
              
              setProfile({ ...data, ...updates, uid: authUser.uid, id: authUser.uid } as UserProfile);
              setLoading(false);
            } else {
              // Create profile if it doesn't exist
              let initialRole: "owner" | "admin" | "manager" | "technician" | "office" | "read-only" = "technician";
              let isOwner = false;
              let isAdmin = false;
              let accessLevel = "technician";

              if (authUser.email?.toLowerCase() === "flatlinedetail@gmail.com") {
                initialRole = "owner";
                isOwner = true;
                isAdmin = true;
                accessLevel = "admin";
              }
              
              const authDocs = await getDocs(query(collection(db, "staff_authorizations"), where("email", "==", authUser.email?.toLowerCase())));
              if (!authDocs.empty && authUser.email?.toLowerCase() !== "flatlinedetail@gmail.com") {
                initialRole = (authDocs.docs[0].data().role as any) || initialRole;
              }
  
              const newProfile: any = {
                uid: authUser.uid,
                id: authUser.uid,
                email: authUser.email || "",
                displayName: authUser.displayName || "",
                photoURL: authUser.photoURL || "",
                role: initialRole,
                isOwner,
                isAdmin,
                accessLevel,
                provider: providerInfo,
                lastLoginAt: serverTimestamp(),
                createdAt: serverTimestamp(),
              };

              if (systemStatus === 'normal') {
                await setDoc(userDocRef, newProfile);
              }
              
              setProfile(newProfile as UserProfile);
              setLoading(false);
            }
          } catch (error: any) {
            handleFirebaseError(error);
            setLoading(false);
          }
        };

        fetchProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSettings) (unsubscribeSettings as any)();
      if (unsubscribeServices) (unsubscribeServices as any)();
      if (unsubscribeAddons) (unsubscribeAddons as any)();
      if (unsubscribeClientTypes) (unsubscribeClientTypes as any)();
      if (unsubscribeClientCategories) (unsubscribeClientCategories as any)();
    };
  }, [systemStatus]);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.warn("Google Sign-In Popup failed/blocked:", error.code);
      
      // Handle blocked popups or other common errors
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
        const { signInWithRedirect } = await import("firebase/auth");
        await signInWithRedirect(auth, provider);
        return;
      }
      
      throw error;
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signUp = async (email: string, pass: string) => {
    const { createUserWithEmailAndPassword } = await import("firebase/auth");
    await createUserWithEmailAndPassword(auth, email, pass);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ 
      user, profile: effectiveProfile, settings, services, addons, clientTypes, clientCategories, 
      loading, systemStatus, signIn, signInWithEmail, signUp, logout, 
      isAdmin, isManager, isTechnician, isReadOnly, canAccessAdmin, canAccessManager
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
