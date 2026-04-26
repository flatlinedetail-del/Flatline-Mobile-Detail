import cron from "node-cron";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, updateDoc, doc, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import twilio from "twilio";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let twilioClient: twilio.Twilio | null = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

export function startScheduler() {
  if (!twilioClient || !twilioPhone) {
    console.warn("Scheduler: Twilio is not configured. Reminders will not be sent.");
    return;
  }

  let config;
  try {
    const configPath = path.join(__dirname, "firebase-applet-config.json");
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (e) {
    console.error("Scheduler: Could not read firebase config", e);
    return;
  }

  const app = initializeApp(config, "schedulerApp");
  const db = getFirestore(app, config.firestoreDatabaseId);

  console.log("Scheduler started. Polling every 15 minutes.");
  cron.schedule("*/15 * * * *", async () => {
    try {
      await processReminders(db);
    } catch (e) {
      console.error("Scheduler runtime error:", e);
    }
  });

  // Run immediately once on startup to catch up
  setTimeout(() => {
    processReminders(db).catch(e => console.error("Initial scheduler run error", e));
  }, 5000);
}

async function processReminders(db: any) {
  const now = new Date();
  
  // We want to find upcoming appointments. 
  // We query all 'scheduled' appointments and filter in memory, as it's easier and typically small scale for a local CRM.
  const apptsRef = collection(db, "appointments");
  const fortyEightHoursFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const q = query(
    apptsRef, 
    where("status", "in", ["scheduled", "confirmed"]),
    where("scheduledAt", ">=", Timestamp.fromDate(now)),
    where("scheduledAt", "<=", Timestamp.fromDate(fortyEightHoursFromNow))
  );
  const snap = await getDocs(q);

  for (const docSnap of snap.docs) {
    const job = docSnap.data();
    if (!job.scheduledAt) continue;

    const scheduledDate = job.scheduledAt.toDate();
    const diffMs = scheduledDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // If it's already past or way too far in the future, skip
    if (diffHours < 0 || diffHours > 48) continue;

    const reminders = job.reminders || {};
    let updatedReminders = { ...reminders };
    let needsUpdate = false;

    // 24-Hour Reminder: Between 23.5 and 24.5 hours away, or if it's < 24 hours and we haven't sent it yet.
    // To be safe, if diffHours <= 24 and >= 2 and twentyFourHour is not set or failed, we send it.
    if (diffHours <= 24 && diffHours > 2 && !reminders.twentyFourHour) {
      const result = await sendSmsAndLog(
        db, 
        job, 
        docSnap.id, 
        "reminder_24h", 
        `Hi ${job.customerName}, reminder: your Flatline Mobile Detail appointment is tomorrow at ${formatTime(scheduledDate)}.`
      );
      updatedReminders.twentyFourHour = result.status;
      needsUpdate = true;
    }

    // 2-Hour Reminder: If diffHours <= 2 and > 0, and not sent
    if (diffHours <= 2 && diffHours > 0 && !reminders.twoHour) {
      const result = await sendSmsAndLog(
        db, 
        job, 
        docSnap.id, 
        "reminder_2h", 
        `Hi ${job.customerName}, Flatline Mobile Detail will see you in about 2 hours for your appointment at ${formatTime(scheduledDate)}.`
      );
      updatedReminders.twoHour = result.status;
      needsUpdate = true;
    }

    if (needsUpdate) {
      try {
        await updateDoc(doc(db, "appointments", docSnap.id), { reminders: updatedReminders });
      } catch (err) {
        console.error("Failed to update reminders state on appt", docSnap.id, err);
      }
    }
  }
}

async function sendSmsAndLog(db: any, job: any, appointmentId: string, type: string, message: string) {
  if (!twilioClient) return { status: 'failed', error: 'Twilio not configured' };
  
  if (!job.customerPhone) {
    await logCommunication(db, job.clientId || null, appointmentId, type, message, "failed", "No customer phone provided");
    return { status: "failed", error: "No customer phone" };
  }

  try {
    const twilioRes = await twilioClient.messages.create({
      body: message,
      from: twilioPhone,
      to: job.customerPhone,
    });
    await logCommunication(db, job.clientId || null, appointmentId, type, message, "sent", twilioRes.sid);
    return { status: "sent" };
    } catch (err: any) {
      let errMsg = err.message;
      if (err.code === 30034) {
         errMsg = "Twilio blocked this message because A2P 10DLC registration is incomplete. (" + err.message + ")";
      }
      console.error(`SMS Failed for appt ${appointmentId}:`, err.message);
      await logCommunication(db, job.clientId || null, appointmentId, type, message, "failed", errMsg);
      return { status: "failed", error: errMsg };
    }
  }

async function logCommunication(db: any, clientId: string | null, appointmentId: string, type: string, content: string, status: string, detail: string) {
  try {
    await addDoc(collection(db, "communication_logs"), {
      clientId: clientId || "walk-in",
      appointmentId,
      type,
      content,
      status,
      errorDetail: status === "failed" ? detail : "",
      messageId: status === "sent" ? detail : "",
      createdAt: serverTimestamp()
    });
  } catch(e) {
    console.error("Failed to write to communication_logs", e);
  }
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
}
