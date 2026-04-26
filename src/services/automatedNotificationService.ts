import { 
  collection, 
  query, 
  where, 
  getDocs, 
  Timestamp, 
  addDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "../firebase";
import { createNotification } from "./notificationService";
import { Appointment, Invoice } from "../types";

export const checkAndGenerateNotifications = async (userId: string) => {
  if (!userId) return;

  try {
    const now = new Date();
    
    // 1. Check for Overdue Invoices
    const invoicesQ = query(
      collection(db, "invoices"),
      where("status", "==", "sent"),
      where("paymentStatus", "==", "unpaid"),
      limit(20) // Limit to most relevant ones
    );
    
    const invoicesSnapshot = await getDocs(invoicesQ);
    for (const doc of invoicesSnapshot.docs) {
      const invoice = { id: doc.id, ...doc.data() } as Invoice;
      if (invoice.dueDate && (invoice.dueDate as Timestamp).toDate() < now) {
        // Only notify if notification doesn't exist already or we want to re-notify?
        // For simplicity, let's create if not exists for this specific invoice as "overdue"
        // Better: use a unique identifier or check existing notifications
        await createIfNew(userId, {
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
      await createIfNew(userId, {
        title: "Upcoming Appointment",
        message: `${appt.customerName} scheduled for ${appt.scheduledAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
        type: "booking",
        relatedId: appt.id,
        relatedType: "appointment"
      });
    }

  } catch (error) {
    console.error("Error generating automated notifications:", error);
  }
};

async function createIfNew(userId: string, notification: any) {
  // Check if a similar unread notification exists to avoid spam
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    where("relatedId", "==", notification.relatedId),
    where("title", "==", notification.title),
    where("read", "==", false)
  );
  
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    await createNotification({
      ...notification,
      userId
    });
  }
}
