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
  increment,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";
import { Appointment, Client, BusinessSettings, Service, Invoice } from "../types";

import { messagingService } from "./messagingService";
import { updateClientRiskStats } from "./clientService";

export async function checkOverdueInvoices(businessId: string) {
  const q = query(
    collection(db, "invoices"),
    where("businessId", "==", businessId),
    where("status", "==", "unpaid")
  );
  const snap = await getDocs(q);
  const unpaid = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  
  for (const inv of unpaid) {
    // Overdue if past due date (or arbitrary threshold if dueDate missing)
    const dueDateDate = (inv.dueDate instanceof Timestamp) ? inv.dueDate.toDate() : 
                        (inv.createdAt instanceof Timestamp ? new Date(inv.createdAt.toDate().getTime() + 7 * ONE_DAY) : new Date(0));
    const dueDate = dueDateDate.getTime();
    
    if (now > dueDate) {
       // Late payment logic
       if (!inv.latePaymentProcessedAt) {
         await updateClientRiskStats(inv.clientId, "latePayment");
         await updateDoc(doc(db, "invoices", inv.id), { latePaymentProcessedAt: serverTimestamp() });
       }
       
       // Trigger reminder if needed
       await triggerInvoiceReminder(inv.id, businessId);
    }
  }
}

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

        // 4.5 Actually send
        if (automation.channels === 'email' || automation.channels === 'both') {
          if (client.email) {
            await messagingService.sendEmail({
              to: client.email,
              subject: `${settings.businessName} - Following Up`,
              text: emailBody, // using text to preserve newlines naturally since it's just a raw template
            }).catch(e => console.error("Follow-up email failed", e));
          }
        }

        if (automation.channels === 'sms' || automation.channels === 'both') {
          if (client.phone) {
            await messagingService.sendSms({
              to: client.phone,
              body: emailBody
            }).catch(e => console.error("Follow-up SMS failed", e));
          }
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

export async function processMaintenanceAutomation(appointment: Appointment) {
  try {
    // 1. Get services for this appointment
    const servicesSnap = await getDocs(query(collection(db, "services"), where("id", "in", appointment.serviceIds)));
    const services = servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service));

    for (const service of services) {
      if (service.maintenanceReturnEnabled) {
        // 2. Calculate next maintenance date
        const nextMaintenanceDate = new Date(appointment.scheduledAt.toDate());
        if (service.maintenanceIntervalDays) {
          nextMaintenanceDate.setDate(nextMaintenanceDate.getDate() + service.maintenanceIntervalDays);
        } else if (service.maintenanceIntervalMonths) {
          nextMaintenanceDate.setMonth(nextMaintenanceDate.getMonth() + service.maintenanceIntervalMonths);
        }

        // 3. Create future calendar return
        if (service.autoCreateCalendarReturn) {
          await addDoc(collection(db, "appointments"), {
            customerId: appointment.customerId,
            clientId: appointment.clientId,
            customerName: appointment.customerName,
            customerType: appointment.customerType,
            vehicleId: appointment.vehicleId,
            vehicleInfo: appointment.vehicleInfo,
            address: appointment.address,
            scheduledAt: Timestamp.fromDate(nextMaintenanceDate),
            status: "scheduled",
            technicianId: appointment.technicianId,
            technicianName: appointment.technicianName,
            serviceIds: [service.id],
            serviceNames: [service.name],
            baseAmount: 0, // Should be calculated or set to 0
            totalAmount: 0,
            isDepositPaid: false,
            paymentStatus: "unpaid",
            waiverAccepted: false,
            photos: { before: [], after: [], damage: [] },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            internalNotes: `Automatic maintenance return for ${service.name}`
          });
        }

        // 4. Create maintenance follow-up lead
        if (service.autoCreateLeadFollowUp) {
          await addDoc(collection(db, "leads"), {
            name: appointment.customerName,
            email: "", // Need to fetch from client
            phone: "", // Need to fetch from client
            vehicleInfo: appointment.vehicleInfo,
            requestedService: service.name,
            source: "maintenance_automation",
            status: "new",
            priority: "medium",
            nextFollowUpAt: Timestamp.fromDate(nextMaintenanceDate),
            notes: `Maintenance follow-up for ${service.name}`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }
    }
  } catch (error) {
    console.error("Error in processMaintenanceAutomation:", error);
  }
}

export async function triggerPostJobFollowUp(clientId: string, businessId: string) {
  try {
    const clientSnap = await getDoc(doc(db, "clients", clientId));
    if (!clientSnap.exists()) return;
    const client = { id: clientSnap.id, ...clientSnap.data() } as Client;

    // Send Thanks/Review
    const body = `Thank you for choosing Flatline Mobile Detail! We hope you enjoyed your service. Please let us know if you have any questions or would like to schedule your next appointment!`;
    
    if (client.phone) {
        await messagingService.sendSms({
            to: client.phone,
            body: body
        }).catch(e => console.error("Post-job SMS failed", e));
    }
    
    // Log
    await addDoc(collection(db, "automation_logs"), {
        clientId: client.id,
        type: "post_job_followup",
        sentAt: serverTimestamp(),
        status: "sent"
    });

  } catch (error) {
    console.error("Error in triggerPostJobFollowUp:", error);
  }
}

export async function triggerInvoiceReminder(invoiceId: string, businessId: string) {
  const invRef = doc(db, "invoices", invoiceId);
  const snap = await getDoc(invRef);
  if (!snap.exists()) return;
  const invoice = { id: snap.id, ...snap.data() } as Invoice;

  if (invoice.status === 'paid' || (invoice.reminderCount || 0) >= 3) return;

  const now = Date.now();
  if (invoice.lastReminderSentAt && (now - invoice.lastReminderSentAt.toMillis() < 24 * 60 * 60 * 1000)) return; // 24h cooldown

  await updateDoc(invRef, {
    reminderCount: (invoice.reminderCount || 0) + 1,
    lastReminderSentAt: serverTimestamp()
  });

  if (invoice.clientPhone) {
    await messagingService.sendSms({
        to: invoice.clientPhone,
        body: `Friendly reminder from Flatline Mobile Detail: Invoice #${invoice.invoiceNumber || invoice.id.slice(-6)} is still outstanding. Please reach out if you have any questions!`
    }).catch(e => console.error("Invoice reminder SMS failed", e));
  }
}

export async function handleMissedAppointment(appointmentId: string, businessId: string) {
  const appSnap = await getDoc(doc(db, "appointments", appointmentId));
  if (!appSnap.exists()) return;
  const appointment = { id: appSnap.id, ...appSnap.data() } as Appointment;

  // 1. Update client risk
  if (appointment.clientId) {
      await updateClientRiskStats(appointment.clientId, "cancellation");
      
      // 2. Notify
      const clientSnap = await getDoc(doc(db, "clients", appointment.clientId));
      if (clientSnap.exists()) {
        const client = clientSnap.data() as Client;
        if (client.phone) {
            await messagingService.sendSms({
                to: client.phone,
                body: `We missed you for your appointment with Flatline Mobile Detail. Please let us know if you'd like to reschedule!`
            }).catch(e => console.error("Missed appointment SMS failed", e));
        }
      }
  }
}


