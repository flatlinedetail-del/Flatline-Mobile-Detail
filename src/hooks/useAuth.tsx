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
        
        // Use onSnapshot for real-time profile updates
        if (unsubscribeProfile) unsubscribeProfile();
        
        unsubscribeProfile = onSnapshot(userDocRef, async (docSnap) => {
          if (docSnap.exists()) {
            let data = docSnap.data();
            // Ensure owner email always has admin role (maintain logic from before)
            if (authUser.email?.toLowerCase() === "flatlinedetail@gmail.com" && data.role !== "admin") {
              await updateDoc(userDocRef, { role: "admin" });
            }
            setProfile({ ...data, uid: authUser.uid, id: authUser.uid });
            setLoading(false);
          } else {
            // Create profile if it doesn't exist
            let initialRole = authUser.email?.toLowerCase() === "flatlinedetail@gmail.com" ? "admin" : "technician";
            
            try {
              const authDocs = await getDocs(query(collection(db, "staff_authorizations"), where("email", "==", authUser.email?.toLowerCase())));
              if (!authDocs.empty) {
                initialRole = authDocs.docs[0].data().role || initialRole;
              }
  
              const newProfile = {
                uid: authUser.uid,
                id: authUser.uid,
                email: authUser.email || "",
                displayName: authUser.displayName || "",
                photoURL: authUser.photoURL || "",
                role: initialRole,
                createdAt: serverTimestamp(),
              };
              await setDoc(userDocRef, newProfile);
            } catch (err) {
              console.error("Error creating new profile:", err);
              setLoading(false);
            }
          }
        }, (error: any) => {
          console.error("Error watching profile:", error);
          if (error?.message?.includes('Quota limit exceeded')) {
            toast.error("Firestore quota exceeded. Real-time updates paused.");
          }
          setLoading(false);
        });
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
