import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  limit,
  doc,
  updateDoc,
  Timestamp,
  FieldValue
} from "firebase/firestore";
import { db } from "../firebase";
import { AppNotification } from "../types";

export const createNotification = async (notification: Omit<AppNotification, "id" | "createdAt" | "read">) => {
  try {
    await addDoc(collection(db, "notifications"), {
      ...notification,
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

export const markNotificationAsRead = async (notificationId: string) => {
  try {
    await updateDoc(doc(db, "notifications", notificationId), {
      read: true
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
  }
};

export const markAllAsRead = async (userId: string, notifications: AppNotification[]) => {
  try {
    const unread = notifications.filter(n => !n.read);
    const promises = unread.map(n => updateDoc(doc(db, "notifications", n.id), { read: true }));
    await Promise.all(promises);
  } catch (error) {
    console.error("Error marking all as read:", error);
  }
};
