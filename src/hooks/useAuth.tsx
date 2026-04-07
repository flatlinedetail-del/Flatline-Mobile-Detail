import { useState, useEffect, createContext, useContext } from "react";
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data());
          } else {
            // Create profile if it doesn't exist
            const newProfile = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              role: user.email === "FLATLINEDETAIL@gmail.com" ? "admin" : "technician",
              createdAt: serverTimestamp(),
            };
            await setDoc(doc(db, "users", user.uid), newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          console.error("Error fetching/creating user profile:", error);
          // If it's a permission error, we might still want to set loading to false
          // so the app doesn't hang, but the user will see permission errors elsewhere.
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
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
