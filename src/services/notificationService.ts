import { 
  collection, 
  addDoc,
  query, 
  where, 
  doc,
  updateDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { AppNotification } from "../types";
import { createDocMetadata, updateDocMetadata, getBaseQuery } from "../lib/firestoreUtils";

const NOTIFICATIONS_COL = "notifications";

export const createNotification = async (notification: Omit<AppNotification, "id" | "createdAt" | "read" | "updatedAt" | "createdBy" | "updatedBy" | "isDeleted">, businessId: string) => {
  try {
    const metadata = createDocMetadata(businessId);
    await addDoc(collection(db, NOTIFICATIONS_COL), {
      ...notification,
      read: false,
      ...metadata
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
};

export const markNotificationAsRead = async (notificationId: string) => {
  try {
    const metadata = updateDocMetadata();
    await updateDoc(doc(db, NOTIFICATIONS_COL, notificationId), {
      read: true,
      ...metadata
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    throw error;
  }
};

export const markAllAsRead = async (notifications: AppNotification[]) => {
  try {
    const metadata = updateDocMetadata();
    const promises = notifications.filter(n => !n.read).map(n => updateDoc(doc(db, NOTIFICATIONS_COL, n.id), { read: true, ...metadata }));
    await Promise.all(promises);
  } catch (error) {
    console.error("Error marking all as read:", error);
    throw error;
  }
};

export const deleteNotification = async (notificationId: string) => {
  try {
    const metadata = updateDocMetadata();
    await updateDoc(doc(db, NOTIFICATIONS_COL, notificationId), {
      isDeleted: true,
      ...metadata
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    throw error;
  }
};

export const clearCategoryRead = async (notifications: AppNotification[]) => {
  try {
    const metadata = updateDocMetadata();
    const read = notifications.filter(n => n.read);
    const promises = read.map(n => updateDoc(doc(db, NOTIFICATIONS_COL, n.id), { isDeleted: true, ...metadata }));
    await Promise.all(promises);
  } catch (error) {
    console.error("Error clearing category:", error);
    throw error;
  }
};

export const clearAllRead = async (notifications: AppNotification[]) => {
  try {
    const metadata = updateDocMetadata();
    const read = notifications.filter(n => n.read);
    const promises = read.map(n => updateDoc(doc(db, NOTIFICATIONS_COL, n.id), { isDeleted: true, ...metadata }));
    await Promise.all(promises);
  } catch (error) {
    console.error("Error clearing all read notifications:", error);
    throw error;
  }
};

