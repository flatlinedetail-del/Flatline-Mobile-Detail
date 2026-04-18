import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { BusinessSettings } from "../types";

export function useSettings() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "settings", "business"), (doc) => {
      if (doc.exists()) {
        setSettings(doc.data() as BusinessSettings);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching settings:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { settings, loading };
}
