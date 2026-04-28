import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { createNotification } from "./notificationService";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  fromName?: string;
}

export interface SendSmsOptions {
  to: string;
  body: string;
}

export interface SmsTemplateData {
  clientName: string;
  businessName: string;
  appointmentDate?: string;
  appointmentTime?: string;
  serviceName?: string;
  vehicle?: string;
  invoiceAmount?: string;
  invoiceLink?: string;
  paymentLink?: string;
  reviewLink?: string;
}

const DEFAULT_TEMPLATES: Record<string, string> = {
  booked: "Hi {clientName}, your Flatline Mobile Detail appointment for {appointmentDate} at {appointmentTime} is confirmed.",
  updated: "Hi {clientName}, your Flatline Mobile Detail appointment has been updated to {appointmentDate} at {appointmentTime}.",
  canceled: "Hi {clientName}, your Flatline Mobile Detail appointment for {appointmentDate} has been canceled. Contact us if you need to reschedule.",
  on_the_way: "Hi {clientName}, Flatline Mobile Detail is on the way to your location. See you soon.",
  arrived: "Hi {clientName}, Flatline Mobile Detail has arrived at your location and is preparing to begin your service.",
  started: "Hi {clientName}, your service with Flatline Mobile Detail has started.",
  completed: "Hi {clientName}, your service is complete. Thank you for choosing Flatline Mobile Detail.",
  invoice_sent: "Hi {clientName}, your Flatline Mobile Detail invoice for {invoiceAmount} is ready. You can view/pay it here: {invoiceLink}",
  payment_reminder: "Hi {clientName}, reminder: your Flatline Mobile Detail invoice for {invoiceAmount} is still pending. Pay here: {paymentLink}",
  review_request: "Hi {clientName}, thank you for choosing Flatline Mobile Detail. If you were happy with the service, please leave us a review: {reviewLink}"
};

export function parseTemplate(template: string, data: SmsTemplateData): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{${key}}`, "g"), value || "");
  }
  return result;
}

export const messagingService = {
  async sendEmail(options: SendEmailOptions) {
    try {
      const response = await fetch('/api/messages/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email');
      }

      return data;
    } catch (error) {
      console.error('Messaging Service - Email Error:', error);
      throw error;
    }
  },

  async sendSms(options: SendSmsOptions) {
    try {
      const response = await fetch('/api/messages/sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        const errorMsg = data.error || data.details || 'Failed to send SMS';
        throw new Error(errorMsg);
      }

      return data;
    } catch (error) {
      console.error('Messaging Service - SMS Error:', error);
      throw error;
    }
  },

  async sendTemplateSms(
    toPhone: string,
    type: string,
    templateData: SmsTemplateData,
    businessId: string,
    appointmentId?: string,
    clientId?: string
  ): Promise<{ success: boolean; status: string; detail: string }> {
    try {
      // 1. Fetch templates from settings
      const settingsDoc = await getDoc(doc(db, "settings", businessId));
      const settings = settingsDoc.exists() ? settingsDoc.data() : {};
      
      // Check if automation is paused for this appointment
      if (appointmentId) {
        const apptDoc = await getDoc(doc(db, "appointments", appointmentId));
        if (apptDoc.exists() && apptDoc.data().smsAutomationPaused) {
          return { success: false, status: "skipped", detail: "Automation paused for this appointment" };
        }
      }

      const templates = settings.smsTemplates || DEFAULT_TEMPLATES;
      const templatePath = templates[type] || DEFAULT_TEMPLATES[type] || "";
      if (!templatePath) return { success: false, status: "failed", detail: "Unknown SMS type" };

      const body = parseTemplate(templatePath, templateData);

      // 2. Call backend
      const res = await fetch("/api/messages/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: toPhone, body })
      });
      
      const data = await res.json();
      const isSuccess = data.success !== false && res.status === 200;
      const logStatus = isSuccess ? "sent" : "failed";
      let logDetail = isSuccess ? data.messageId : (data.error || "Unknown error");
      if (!isSuccess && data.code === 30034) {
        logDetail = "Twilio blocked this message because A2P 10DLC registration is incomplete. (" + logDetail + ")";
      }

      // 3. Log to Firestore
      await addDoc(collection(db, "communication_logs"), {
        clientId: clientId || "walk-in",
        appointmentId: appointmentId || "",
        type,
        content: body,
        status: logStatus,
        errorDetail: !isSuccess ? logDetail : "",
        messageId: isSuccess ? logDetail : "",
        createdAt: serverTimestamp(),
        recipient: toPhone
      });

      if (!isSuccess && auth.currentUser) {
        await createNotification({
          userId: auth.currentUser.uid,
          title: "Sms Delivery Failure",
          message: `Failed to send ${type} SMS to ${templateData.clientName || toPhone}: ${logDetail}`,
          type: "system",
          relatedId: appointmentId || clientId,
          relatedType: appointmentId ? "appointment" : "client"
        }, businessId);
      }

      return { 
        success: isSuccess, 
        status: logStatus, 
        detail: logDetail 
      };
    } catch (error: any) {
      console.error("sendTemplateSms error:", error);
      let errMsg = error.message || "Unknown client error";
      try {
        await addDoc(collection(db, "communication_logs"), {
          clientId: clientId || "walk-in",
          appointmentId: appointmentId || "",
          type,
          content: "Error during parsing/sending",
          status: "failed",
          errorDetail: errMsg,
          createdAt: serverTimestamp(),
          recipient: toPhone
        });
      } catch (e) {}

      if (auth.currentUser) {
        await createNotification({
          userId: auth.currentUser.uid,
          title: "Sms Service Error",
          message: `Critical error while sending ${type} SMS to ${toPhone}: ${errMsg}`,
          type: "system",
          relatedId: appointmentId || clientId,
          relatedType: appointmentId ? "appointment" : "client"
        }, businessId);
      }

      return { success: false, status: "failed", detail: errMsg };
    }
  }
};
