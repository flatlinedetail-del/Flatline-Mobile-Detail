import { useState, useEffect, createContext, useContext } from "react";
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../firebase";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isTechnician: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (authUser) {
        const userDocRef = doc(db, "users", authUser.uid);
        
        // Use getDoc for one-time profile fetch on auth change
        const fetchProfile = async () => {
          try {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
              let data = { ...docSnap.data() };
              // Ensure owner email always has admin role (maintain logic from before)
              if (authUser.email?.toLowerCase() === "flatlinedetail@gmail.com" && data.role !== "admin") {
                await updateDoc(userDocRef, { role: "admin" });
                data.role = "admin";
              }
              // Set default businessId if missing
              if (!data.businessId) {
                data.businessId = authUser.uid;
                try {
                  await updateDoc(userDocRef, { businessId: authUser.uid });
                } catch(e) {}
              }
              setProfile({ ...data, uid: authUser.uid, id: authUser.uid });
              setLoading(false);
            } else {
              // Create profile if it doesn't exist
              let initialRole = authUser.email?.toLowerCase() === "flatlinedetail@gmail.com" ? "admin" : "technician";
              
              const authDocs = await getDocs(query(collection(db, "staff_authorizations"), where("email", "==", authUser.email?.toLowerCase())));
              if (!authDocs.empty) {
                initialRole = authDocs.docs[0].data().role || initialRole;
              }
  
              const newProfile = {
                uid: authUser.uid,
                id: authUser.uid,
                businessId: authUser.uid,
                email: authUser.email || "",
                displayName: authUser.displayName || "",
                photoURL: authUser.photoURL || "",
                role: initialRole,
                createdAt: serverTimestamp(),
              };
              await setDoc(userDocRef, newProfile);
              setProfile(newProfile);
              setLoading(false);
            }
          } catch (error: any) {
            if (error?.message?.includes('Missing or insufficient permissions')) {
              // Silently swallow missing permissions on first load
            } else {
              console.error("Error fetching profile:", error);
            }
            if (error?.message?.includes('Quota limit exceeded')) {
              toast.error("Firestore quota exceeded.");
            }
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
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const isAdmin = profile?.role === "admin";
  const isTechnician = profile?.role === "technician" || isAdmin;

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, logout, isAdmin, isTechnician }}>
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
