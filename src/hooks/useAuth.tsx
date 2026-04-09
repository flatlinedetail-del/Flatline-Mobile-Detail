import { useState, useEffect, createContext, useContext } from "react";
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../firebase";

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

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        
        // Use onSnapshot for real-time profile updates
        unsubscribeProfile = onSnapshot(userDocRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Ensure owner email always has admin role
            if (user.email?.toLowerCase() === "flatlinedetail@gmail.com" && data.role !== "admin") {
              await updateDoc(userDocRef, { role: "admin" });
              // The next snapshot will trigger with the updated role
            } else {
              setProfile({ ...data, uid: user.uid });
            }
          } else {
            // Create profile if it doesn't exist
            // Check if this email was pre-authorized with a role
            let initialRole = user.email?.toLowerCase() === "flatlinedetail@gmail.com" ? "admin" : "technician";
            
            try {
              const authDocs = await getDocs(query(collection(db, "staff_authorizations"), where("email", "==", user.email?.toLowerCase())));
              if (!authDocs.empty) {
                initialRole = authDocs.docs[0].data().role || initialRole;
              }
            } catch (e) {
              console.error("Error checking staff authorizations:", e);
            }

            const newProfile = {
              uid: user.uid,
              email: user.email || "",
              displayName: user.displayName || "",
              photoURL: user.photoURL || "",
              role: initialRole,
              createdAt: serverTimestamp(),
            };
            await setDoc(userDocRef, newProfile);
            // setProfile will be called by the next snapshot
          }
          setLoading(false);
        }, (error: any) => {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          setLoading(false);
        });
      } else {
        if (unsubscribeProfile) unsubscribeProfile();
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
