import { 
  collection, 
  query, 
  where, 
  getDocs, 
  Timestamp, 
  addDoc, 
  serverTimestamp,
  limit} from "firebase/firestore";
import { db } from "../firebase";
import { createNotification } from "./notificationService";
import { Appointment, Invoice } from "../types";

export const checkAndGenerateNotifications = async (userId: string, businessId: string) => {
  try {
    if (!userId) return;

    // Global cooldown check within the current session to prevent redundant runs
    const lastCheck = sessionStorage.getItem(`last_auto_notif_run_${userId}`);
    const nowTime = Date.now();
    if (lastCheck && (nowTime - parseInt(lastCheck)) < 120 * 60 * 1000) { // 2 hour cooldown
      return;
    }

    const now = new Date();
    
    // 1. Check for Overdue Invoices
    const invoicesQ = query(
      collection(db, "invoices"),
      where("status", "==", "sent"),
      where("paymentStatus", "==", "unpaid"),
      limit(20)
    );
    
    const invoicesSnapshot = await getDocs(invoicesQ);
    for (const doc of invoicesSnapshot.docs) {
      const invoice = { id: doc.id, ...doc.data() } as Invoice;
      if (invoice.dueDate && (invoice.dueDate as Timestamp).toDate() < now) {
        await createIfNew(userId, businessId, {
          title: "Overdue Invoice",
          message: `Invoice #${invoice.invoiceNumber || invoice.id} for ${invoice.clientName} is overdue.`,
          type: "system",
          relatedId: invoice.id,
          relatedType: "invoice"
        });
      }
    }

    // 2. Check for Upcoming Appointments (next 24 hours)
    const tomorrow = new Date();
    tomorrow.setHours(tomorrow.getHours() + 24);
    
    const apptsQ = query(
      collection(db, "appointments"),
      where("status", "in", ["scheduled", "confirmed"]),
      where("scheduledAt", ">=", Timestamp.fromDate(now)),
      where("scheduledAt", "<=", Timestamp.fromDate(tomorrow)),
      limit(20)
    );
    
    const apptsSnapshot = await getDocs(apptsQ);
    for (const doc of apptsSnapshot.docs) {
      const appt = { id: doc.id, ...doc.data() } as Appointment;
      await createIfNew(userId, businessId, {
        title: "Upcoming Appointment",
        message: `${appt.customerName} scheduled for ${appt.scheduledAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
        type: "booking",
        relatedId: appt.id,
        relatedType: "appointment"
      });
    }

    sessionStorage.setItem(`last_auto_notif_run_${userId}`, nowTime.toString());

  } catch (error: any) {
    if (error?.message?.includes("Quota limit exceeded")) {
      console.warn("[AutomatedNotifications] Quota exceeded - skipping checks");
      return;
    }
    // Final defensive catch to prevent global app crash if scheduler fails
    console.warn("Scheduler runtime notice (non-fatal):", error.message || error);
  }
};

async function createIfNew(userId: string, businessId: string, notification: any) {
  try {
    // Check if a similar unread notification exists to avoid spam
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      where("relatedId", "==", notification.relatedId),
      where("title", "==", notification.title),
      where("read", "==", false),
      limit(1) // Only need to know if one exists
    );
    
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      await createNotification({
        ...notification,
        userId
      }, businessId);
    }
  } catch (error: any) {
    if (!error?.message?.includes("Quota limit exceeded")) {
      console.error("Error in createIfNew:", error);
    }
  }
}
