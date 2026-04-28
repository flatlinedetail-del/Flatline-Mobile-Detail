import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { createNotification } from "./notificationService";
import { format } from "date-fns";

export const handleWaitlistRouting = async (clearedAppointment: any, businessId: string) => {
  try {
    const clearedDate = clearedAppointment.scheduledAt?.toDate ? clearedAppointment.scheduledAt.toDate() : new Date(clearedAppointment.scheduledAt);
    if (!clearedDate || isNaN(clearedDate.getTime())) return;

    // Only look ahead or today
    if (clearedDate < new Date()) return;

    // Query waitlisted appointments
    const waitlistQuery = query(
      collection(db, "appointments"),
      where("status", "in", ["waitlisted", "pending_waitlist"])
    );

    const snapshot = await getDocs(waitlistQuery);
    
    // Check if any waitlist request matches our cleared slot
    const matches = snapshot.docs.filter(doc => {
      const waitlistApt = doc.data();
      const requestedDate = waitlistApt.scheduledAt?.toDate ? waitlistApt.scheduledAt.toDate() : new Date(waitlistApt.scheduledAt);
      
      const backupDate = waitlistApt.waitlistInfo?.backupScheduledAt?.toDate 
        ? waitlistApt.waitlistInfo.backupScheduledAt.toDate() 
        : (waitlistApt.waitlistInfo?.backupScheduledAt ? new Date(waitlistApt.waitlistInfo.backupScheduledAt) : null);

      const sameRequestedDay = requestedDate.toDateString() === clearedDate.toDateString();
      const sameBackupDay = backupDate && backupDate.toDateString() === clearedDate.toDateString();
      
      return sameRequestedDay || sameBackupDay || waitlistApt.waitlistInfo?.flexibleSameDay;
    });

    if (matches.length > 0) {
      // Create notification for admins
      const adminsQuery = query(collection(db, "users"), where("role", "==", "admin"));
      const adminsSnap = await getDocs(adminsQuery);
      
      for (const match of matches) {
        const clientName = match.data().customerName || "A client";
        const serviceNames = (match.data().serviceNames || []).join(", ");
        
        for (const admin of adminsSnap.docs) {
           // check duplicate
           const dupeQuery = query(
             collection(db, "notifications"),
             where("userId", "==", admin.id),
             where("type", "==", "slot_opened"),
             where("relatedId", "==", match.id),
             where("appointmentId", "==", clearedAppointment.id)
           );
           const dupeSnap = await getDocs(dupeQuery);
           if (!dupeSnap.empty) continue; 

           await createNotification({
             userId: admin.id,
             title: "Slot Opened",
             message: `A slot opened that may fit ${clientName}.\nOpen time: ${format(clearedDate, "MMM d, h:mm a")}\nRequested service: ${serviceNames}`,
             type: "slot_opened",
             category: "Schedule Changes",
             relatedId: match.id,
             relatedType: "waitlist",
             waitlistId: match.id,
             appointmentId: clearedAppointment.id,
             clientName: clientName,
             priority: "medium",
           }, businessId);
        }
      }
    }
  } catch (error) {
    console.error("Failed to route waitlist matches:", error);
  }
};
