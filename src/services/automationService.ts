import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  getDoc,
  Timestamp,
  addDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";
import { Appointment, Client, BusinessSettings } from "../types";

export async function processFollowUps() {
  try {
    // 1. Get Automation Settings
    const settingsSnap = await getDoc(doc(db, "settings", "business"));
    if (!settingsSnap.exists()) return { processed: 0, errors: 0 };
    
    const settings = settingsSnap.data() as BusinessSettings;
    const automation = settings.automationSettings;
    
    if (!automation || !automation.followUpEnabled) return { processed: 0, errors: 0 };

    // 2. Find completed appointments that haven't been followed up
    const now = new Date();
    const delayMs = automation.delayHours * 60 * 60 * 1000;
    const cutoffDate = new Date(now.getTime() - delayMs);

    const q = query(
      collection(db, "appointments"),
      where("status", "==", "completed"),
      where("followUpSent", "==", false)
    );

    const snap = await getDocs(q);
    let processed = 0;
    let errors = 0;

    for (const appDoc of snap.docs) {
      const appointment = { id: appDoc.id, ...appDoc.data() } as Appointment;
      
      // Check if enough time has passed
      const completedAt = appointment.updatedAt?.toDate() || appointment.scheduledAt.toDate();
      if (completedAt > cutoffDate) continue;

      try {
        // 3. Get Client info
        if (!appointment.clientId) continue;
        const clientSnap = await getDoc(doc(db, "clients", appointment.clientId));
        if (!clientSnap.exists()) continue;
        
        const client = { id: clientSnap.id, ...clientSnap.data() } as Client;

        // 4. Determine content
        let emailBody = automation.emailBody || "";
        emailBody = emailBody.replace("{{firstName}}", client.firstName || client.name);
        emailBody = emailBody.replace("{{businessName}}", settings.businessName);

        // Add review link if applicable
        if (automation.includeReviewLink && (client.isOneTime || !client.legacyId)) {
          emailBody += `\n\nWe'd love to hear your feedback! Please leave us a review here: ${automation.googleReviewUrl}`;
        }

        // 5. "Send" follow-up (log it)
        await addDoc(collection(db, "automation_logs"), {
          appointmentId: appointment.id,
          clientId: client.id,
          type: "follow_up",
          channel: automation.channels,
          content: emailBody,
          sentAt: serverTimestamp(),
          status: "sent"
        });

        // 6. Update appointment and client
        await updateDoc(doc(db, "appointments", appointment.id), {
          followUpSent: true,
          followUpSentAt: serverTimestamp()
        });

        await updateDoc(doc(db, "clients", client.id), {
          "followUpStatus.lastSentAt": serverTimestamp(),
          "followUpStatus.status": "sent",
          "followUpStatus.channel": automation.channels
        });

        processed++;
      } catch (err) {
        console.error("Error processing follow-up for appointment:", appointment.id, err);
        errors++;
      }
    }

    return { processed, errors };
  } catch (error) {
    console.error("Error in processFollowUps:", error);
    return { processed: 0, errors: 1 };
  }
}
