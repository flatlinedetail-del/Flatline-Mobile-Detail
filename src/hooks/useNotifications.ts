import { useState, useEffect, useCallback } from "react";
import { collection, query, where, onSnapshot, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./useAuth";
import { AppNotification } from "../types";
import { checkAndGenerateNotifications } from "../services/automatedNotificationService";

export function useNotifications(realtime = false) {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const q = query(
        collection(db, "notifications"),
        where("userId", "==", profile.id),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AppNotification[];
      setNotifications(data);
      setLoading(false);
      setError(null);
    } catch (err: any) {
      console.error("[Notifications Fetch Error]:", err.message || err);
      setError(err.message || String(err));
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.id) {
      checkAndGenerateNotifications(profile.id);
      
      // Also check every hour (reduced from 15m to save quota)
      const interval = setInterval(() => {
        checkAndGenerateNotifications(profile.id);
      }, 60 * 60 * 1000);
      
      return () => clearInterval(interval);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    if (!realtime) {
      fetchNotifications();
      return;
    }

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", profile.id),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AppNotification[];
      setNotifications(data);
      setLoading(false);
      setError(null);
      
      // Diagnostic Logging
      console.log("[Notifications Realtime Update]", {
        count: data.length,
        unread: data.filter(n => !n.read).length
      });
    }, (err) => {
      console.error("[Notifications Audit Error]:", err.message || err);
      setError(err.message || String(err));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile?.id, realtime, fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refresh: fetchNotifications
  };
}
