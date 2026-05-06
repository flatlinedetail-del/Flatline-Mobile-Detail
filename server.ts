import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import Stripe from "stripe";
import sgMail from "@sendgrid/mail";
import twilio from "twilio";
import { startScheduler } from "./scheduler.ts";
import { applicationDefault, cert, getApps, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let firebaseAdminDb: Firestore | null = null;

// Initialize providers if available
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

let twilioClient: twilio.Twilio | null = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch(e) {
    console.error("Failed to initialize Twilio client", e);
  }
}

function normalizeSmsPhoneNumber(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    const normalized = `+${digits}`;
    return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
  }

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return null;
}

function maskPhoneNumber(value: string): string {
  return value.replace(/\d(?=\d{4})/g, "*");
}

function getFirebaseAdminDb(): Firestore {
  if (firebaseAdminDb) return firebaseAdminDb;

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  const databaseId = process.env.FIRESTORE_DATABASE_ID;

  if (!projectId || !databaseId) {
    throw new Error("Firebase Admin project/database configuration is missing.");
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  const credential = serviceAccountJson
    ? cert(JSON.parse(serviceAccountJson))
    : clientEmail && privateKey
      ? cert({ projectId, clientEmail, privateKey })
      : applicationDefault();

  const adminApp = getApps()[0] || initializeAdminApp({ credential, projectId });
  firebaseAdminDb = getFirestore(adminApp, databaseId);
  return firebaseAdminDb;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Start background jobs
  startScheduler();

  app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers["stripe-signature"];

    if (!secretKey || !webhookSecret) {
      return res.status(503).json({ error: "Stripe webhook is not configured." });
    }

    if (!signature || Array.isArray(signature)) {
      return res.status(400).json({ error: "Missing Stripe signature." });
    }

    const stripe = new Stripe(secretKey);
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (error: any) {
      console.error("Stripe webhook signature verification failed:", error.message);
      return res.status(400).json({ error: "Invalid Stripe signature." });
    }

    if (event.type !== "checkout.session.completed") {
      return res.json({ received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") {
      return res.json({ received: true, skipped: "checkout_session_not_paid" });
    }

    const metadata = session.metadata || {};
    const paymentType = metadata.paymentType;
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || null;

    if (paymentType === "invoice_balance") {
      const invoiceId = metadata.invoiceId;
      if (!invoiceId) {
        return res.status(400).json({ error: "Stripe invoice session is missing invoice metadata." });
      }

      try {
        const db = getFirebaseAdminDb();
        const amountPaidCents = session.amount_total || 0;
        const amountPaid = amountPaidCents / 100;

        await db.runTransaction(async transaction => {
          const invoiceRef = db.collection("invoices").doc(invoiceId);
          const snapshot = await transaction.get(invoiceRef);

          if (!snapshot.exists) {
            throw new Error(`Invoice ${invoiceId} was not found for Stripe invoice webhook.`);
          }

          const invoice = snapshot.data() || {};
          const invoiceTotal = Number(invoice.total || 0);
          const invoiceAmountPaid = Number(invoice.amountPaid || 0);
          const expectedBalanceCents = Math.round(Math.max(invoiceTotal - invoiceAmountPaid, 0) * 100);

          if (invoice.paymentStatus === "paid" || invoice.status === "paid") {
            return;
          }

          if (expectedBalanceCents > 0 && amountPaidCents !== expectedBalanceCents) {
            throw new Error(`Stripe invoice amount mismatch for invoice ${invoiceId}.`);
          }

          transaction.update(invoiceRef, {
            status: "paid",
            paidAt: FieldValue.serverTimestamp(),
            paymentStatus: "paid",
            amountPaid: invoiceTotal || amountPaid,
            paymentProvider: "stripe",
            transactionReference: paymentIntentId || session.id,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: paymentIntentId,
            paymentHistory: FieldValue.arrayUnion({
              action: "paid",
              timestamp: new Date(),
              method: "integrated",
              provider: "stripe",
              amount: amountPaid
            })
          });

          const appointmentId = metadata.appointmentId || invoice.appointmentId;
          if (appointmentId) {
            transaction.update(db.collection("appointments").doc(String(appointmentId)), {
              paymentStatus: "paid",
              updatedAt: FieldValue.serverTimestamp()
            });
          }

          transaction.set(db.collection("payments").doc(session.id), {
            clientId: invoice.clientId || "",
            appointmentId: appointmentId || "",
            invoiceId,
            amount: amountPaid,
            provider: "stripe",
            transactionId: paymentIntentId || session.id,
            paymentType: "invoice_balance",
            status: "paid",
            timestamp: FieldValue.serverTimestamp(),
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: paymentIntentId
          }, { merge: true });
        });

        return res.json({ received: true });
      } catch (error: any) {
        console.error("Stripe invoice webhook update failed:", error.message);
        const status = error.message?.includes("Firebase Admin project/database") ? 503 : 500;
        return res.status(status).json({ error: "Unable to confirm Stripe invoice payment." });
      }
    }

    if (paymentType !== "deposit") {
      return res.json({ received: true, skipped: "unsupported_payment_type" });
    }

    const appointmentId = metadata.appointmentId || metadata.bookingId;
    if (!appointmentId) {
      return res.status(400).json({ error: "Stripe deposit session is missing appointment metadata." });
    }

    try {
      const db = getFirebaseAdminDb();
      const amountPaidCents = session.amount_total || 0;
      const metadataDepositCents = Number(metadata.depositAmountCents || 0);

      await db.runTransaction(async transaction => {
        const appointmentRef = db.collection("appointments").doc(appointmentId);
        const snapshot = await transaction.get(appointmentRef);

        if (!snapshot.exists) {
          throw new Error(`Appointment ${appointmentId} was not found for Stripe deposit webhook.`);
        }

        const appointment = snapshot.data() || {};
        const expectedDepositCents = Math.round(Number(appointment.depositAmount || 0) * 100);
        const expectedCents = expectedDepositCents || metadataDepositCents;

        if (!appointment.depositRequired) {
          throw new Error(`Appointment ${appointmentId} does not require a deposit.`);
        }

        if (expectedCents > 0 && amountPaidCents !== expectedCents) {
          throw new Error(`Stripe deposit amount mismatch for appointment ${appointmentId}.`);
        }

        if (appointment.depositPaid === true) {
          return;
        }

        const nextStatus =
          typeof appointment.pendingAppointmentStatus === "string" && appointment.pendingAppointmentStatus
            ? appointment.pendingAppointmentStatus
            : metadata.nextAppointmentStatus || "requested";

        const amountPaid = amountPaidCents / 100;

        const update: Record<string, unknown> = {
          depositPaid: true,
          depositPaidAt: FieldValue.serverTimestamp(),
          depositPaymentProvider: "stripe",
          depositPaymentStatus: "paid",
          paymentStatus: "partial",
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
          updatedAt: FieldValue.serverTimestamp()
        };

        if (appointment.status === "pending_payment" || appointment.status === "pending_deposit") {
          update.status = nextStatus;
        }

        transaction.update(appointmentRef, update);

        const paymentRef = db.collection("payments").doc(session.id);
        transaction.set(paymentRef, {
          clientId: appointment.clientId || appointment.customerId || "",
          appointmentId,
          amount: amountPaid,
          provider: "stripe",
          transactionId: paymentIntentId || session.id,
          paymentType: "deposit",
          status: "paid",
          timestamp: FieldValue.serverTimestamp(),
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId
        }, { merge: true });
      });

      return res.json({ received: true });
    } catch (error: any) {
      console.error("Stripe deposit webhook update failed:", error.message);
      const status = error.message?.includes("Firebase Admin project/database") ? 503 : 500;
      return res.status(status).json({ error: "Unable to confirm Stripe deposit payment." });
    }
  });

  app.use(express.json());

  // API routes
  
  // Messaging API Routes
  app.post("/api/messages/email", async (req, res) => {
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(400).json({ error: "SendGrid not configured" });
    }
    
    const { to, subject, html, text, fromName } = req.body;
    
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ error: "Missing required fields (to, subject, html/text)" });
    }

    try {
      const msg = {
        to,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL || "no-reply@yourbusiness.com",
          name: fromName || process.env.SENDGRID_FROM_NAME || "Booking Team"
        },
        subject,
        text: text || html.replace(/<[^>]+>/g, ''),
        html: html || text
      };
      
      await sgMail.send(msg);
      res.json({ success: true, message: "Email sent successfully" });
    } catch (error: any) {
      console.error("SendGrid error:", error.response?.body || error);
      res.status(500).json({ error: "Failed to send email", details: error.message });
    }
  });

  app.post("/api/messages/sms", async (req, res) => {
    const fromNumber = normalizeSmsPhoneNumber(process.env.TWILIO_PHONE_NUMBER);
    if (!twilioClient || !fromNumber) {
      console.error("SMS send blocked: Twilio credentials or from number are not configured correctly.");
      return res.status(500).json({ error: "Twilio not configured" });
    }

    const { to, body } = req.body;
    
    if (!to || !body) {
      return res.status(400).json({ error: "Missing required fields (to, body)" });
    }

    const toNumber = normalizeSmsPhoneNumber(to);
    if (!toNumber) {
      console.error("SMS send blocked: invalid recipient phone number", { to });
      return res.status(400).json({ error: "Invalid recipient phone number. Use E.164 format or a 10-digit US number." });
    }

    try {
      console.info("Sending SMS via Twilio", {
        to: maskPhoneNumber(toNumber),
        bodyLength: String(body).length
      });
      const message = await twilioClient.messages.create({
        body,
        from: fromNumber,
        to: toNumber
      });
      console.info("SMS sent via Twilio", {
        to: maskPhoneNumber(toNumber),
        messageId: message.sid,
        status: message.status
      });
      res.json({ success: true, messageId: message.sid, status: message.status });
    } catch (error: any) {
      console.error("Twilio SMS send failed:", {
        to: maskPhoneNumber(toNumber),
        code: error.code,
        status: error.status,
        message: error.message
      });
      let errMsg = error.message;
      if (error.code === 30034) {
        errMsg = "Twilio blocked this message because A2P 10DLC registration is incomplete. (" + error.message + ")";
      }
      res.status(502).json({ success: false, status: "failed", error: errMsg, code: error.code });
    }
  });

  app.get("/api/weather", async (req, res) => {
    const { lat, lon } = req.query;
    const apiKey = process.env.VITE_OPENWEATHER_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: "OpenWeather API Key is missing." });
    }

    try {
      const [currentRes, forecastRes] = await Promise.all([
        fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`),
        fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`)
      ]);

      if (!currentRes.ok || !forecastRes.ok) {
        throw new Error("Failed to fetch weather data from OpenWeather");
      }

      const currentData = await currentRes.json() as any;
      const forecastData = await forecastRes.json() as any;

      const dailyForecasts: any[] = [];
      const seenDates = new Set();
      forecastData.list.forEach((item: any) => {
        const date = new Date(item.dt * 1000).toLocaleDateString();
        if (!seenDates.has(date) && dailyForecasts.length < 7) {
          seenDates.add(date);
          dailyForecasts.push({
            date,
            temp: { min: item.main.temp_min, max: item.main.temp_max },
            condition: item.weather[0].main,
            description: item.weather[0].description,
            rainProbability: Math.round((item.pop || 0) * 100)
          });
        }
      });

      const condition = currentData.weather[0].main.toLowerCase();
      const temp = currentData.main.temp;
      let businessGuidance = "";
      if (condition.includes("rain") || condition.includes("drizzle")) {
        businessGuidance = "Rain detected. Pivot to interior detailing, odor removal, and mold prevention services. Push maintenance reminders for existing clients.";
      } else if (condition.includes("clear") || condition.includes("sun")) {
        businessGuidance = "Clear skies. Perfect for exterior washes, ceramic coatings, and high-gloss wax packages. Promote premium shine services.";
      } else if (temp < 40) {
        businessGuidance = "Cold snap. Focus on interior protection and winter prep packages. Great time for salt removal and undercarriage protection.";
      } else if (temp > 85) {
        businessGuidance = "High heat. Promote UV protection for interiors and ceramic coatings to protect paint from sun damage. Cabin comfort refresh is a must.";
      } else {
        businessGuidance = "Moderate weather. Ideal for full details and multi-stage paint correction. Push your most popular all-in-one packages.";
      }

      res.json({
        current: {
          temp: Math.round(temp),
          condition: currentData.weather[0].main,
          icon: currentData.weather[0].icon,
          description: currentData.weather[0].description
        },
        forecast: dailyForecasts,
        businessGuidance
      });
    } catch (error) {
      // Check if it's a connection timeout or general fetch error to avoid noise
      if (error instanceof TypeError && error.message === "fetch failed") {
        // Silently swallow OpenWeather timeout trace output for clean logs
      } else {
        console.error("Weather fetch error:", error);
      }
      res.status(500).json({ error: "Failed to fetch weather data" });
    }
  });

  app.get("/api/weather/appointment", async (req, res) => {
    const { lat, lon, timestamp } = req.query;
    const apiKey = process.env.VITE_OPENWEATHER_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: "OpenWeather API Key is missing." });
    }

    try {
      const response = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`);
      if (!response.ok) throw new Error("Failed to fetch forecast");
      
      const data = await response.json() as any;
      let closestItem = data.list[0];
      let minDiff = Math.abs(data.list[0].dt - Number(timestamp) / 1000);

      for (const item of data.list) {
        const diff = Math.abs(item.dt - Number(timestamp) / 1000);
        if (diff < minDiff) {
          minDiff = diff;
          closestItem = item;
        }
      }

      if (minDiff > 6 * 3600) return res.json(null);

      res.json({
        temp: Math.round(closestItem.main.temp),
        condition: closestItem.weather[0].main,
        rainProbability: Math.round((closestItem.pop || 0) * 100),
        description: closestItem.weather[0].description
      });
    } catch (error) {
      if (error instanceof TypeError && error.message === "fetch failed") {
        // Silently swallow OpenWeather timeout trace output for clean logs
      } else {
        console.error("Appointment weather fetch error:", error);
      }
      res.status(500).json({ error: "Failed to fetch appointment weather" });
    }
  });

  app.post("/api/payments/stripe/deposit-checkout", async (req, res) => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return res.status(503).json({
        error: "Deposit payment is required, but online payment is not fully configured yet. Please contact us to complete booking."
      });
    }

    const amount = Number(req.body?.amount);
    const amountInCents = Math.round(amount * 100);

    if (!Number.isFinite(amount) || amount <= 0 || amountInCents <= 0) {
      return res.status(400).json({ error: "A valid deposit amount is required." });
    }

    let appUrl: URL;
    try {
      appUrl = new URL(process.env.PUBLIC_APP_URL || req.get("origin") || `http://localhost:${PORT}`);
    } catch {
      return res.status(500).json({ error: "Public app URL is not configured correctly." });
    }

    const cleanMetadata = (value: unknown) =>
      String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);

    try {
      const stripe = new Stripe(secretKey);
      const appointmentId = cleanMetadata(req.body?.appointmentId || req.body?.bookingId);
      if (!appointmentId) {
        return res.status(400).json({ error: "A pending booking is required before starting deposit checkout." });
      }

      const customerEmail = cleanMetadata(req.body?.customerEmail);
      const successUrl = new URL("/book?deposit_checkout=success", appUrl).toString() + "&session_id={CHECKOUT_SESSION_ID}";
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amountInCents,
              product_data: {
                name: "Booking deposit",
                description: "Deposit required to secure your booking."
              }
            },
            quantity: 1
          }
        ],
        customer_email: customerEmail.includes("@") ? customerEmail : undefined,
        success_url: successUrl,
        cancel_url: new URL("/book?deposit_checkout=cancelled", appUrl).toString(),
        metadata: {
          appointmentId,
          bookingId: appointmentId,
          bookingReference: cleanMetadata(req.body?.bookingReference),
          customerName: cleanMetadata(req.body?.customerName),
          customerPhone: cleanMetadata(req.body?.customerPhone),
          vehicleInfo: cleanMetadata(req.body?.vehicleInfo),
          serviceNames: cleanMetadata(Array.isArray(req.body?.serviceNames) ? req.body.serviceNames.join(", ") : req.body?.serviceNames),
          scheduledAt: cleanMetadata(req.body?.scheduledAt),
          depositAmount: amount.toFixed(2),
          depositAmountCents: String(amountInCents),
          depositSource: cleanMetadata(req.body?.depositSource),
          nextAppointmentStatus: cleanMetadata(req.body?.nextAppointmentStatus),
          paymentType: "deposit"
        }
      });

      if (!session.url) {
        return res.status(500).json({ error: "Stripe checkout URL was not returned." });
      }

      return res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error("Stripe deposit checkout error:", error);
      return res.status(500).json({ error: "Unable to start deposit checkout." });
    }
  });

  app.post("/api/payments/stripe/invoice-checkout", async (req, res) => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return res.status(503).json({ error: "Stripe payment is not configured on the server." });
    }

    const amount = Number(req.body?.amount);
    const amountInCents = Math.round(amount * 100);

    if (!Number.isFinite(amount) || amount <= 0 || amountInCents <= 0) {
      return res.status(400).json({ error: "A valid invoice balance is required." });
    }

    let appUrl: URL;
    try {
      appUrl = new URL(process.env.PUBLIC_APP_URL || req.get("origin") || `http://localhost:${PORT}`);
    } catch {
      return res.status(500).json({ error: "Public app URL is not configured correctly." });
    }

    const cleanMetadata = (value: unknown) =>
      String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);

    try {
      const stripe = new Stripe(secretKey);
      const invoiceId = cleanMetadata(req.body?.invoiceId);
      if (!invoiceId) {
        return res.status(400).json({ error: "An invoice is required before starting Stripe checkout." });
      }

      const appointmentId = cleanMetadata(req.body?.appointmentId);
      const clientEmail = cleanMetadata(req.body?.clientEmail);
      const returnPath = appointmentId ? `/calendar/${appointmentId}` : "/invoices";
      const successUrl = new URL(`${returnPath}?payment_checkout=success`, appUrl).toString() + "&session_id={CHECKOUT_SESSION_ID}";
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amountInCents,
              product_data: {
                name: cleanMetadata(req.body?.invoiceNumber) || "Invoice balance",
                description: "Final invoice balance payment."
              }
            },
            quantity: 1
          }
        ],
        customer_email: clientEmail.includes("@") ? clientEmail : undefined,
        success_url: successUrl,
        cancel_url: new URL(`${returnPath}?payment_checkout=cancelled`, appUrl).toString(),
        metadata: {
          paymentType: "invoice_balance",
          invoiceId,
          appointmentId,
          invoiceNumber: cleanMetadata(req.body?.invoiceNumber),
          clientName: cleanMetadata(req.body?.clientName),
          clientEmail,
          vehicleInfo: cleanMetadata(req.body?.vehicleInfo),
          amount: amount.toFixed(2),
          amountCents: String(amountInCents)
        }
      });

      if (!session.url) {
        return res.status(500).json({ error: "Stripe checkout URL was not returned." });
      }

      console.info("Stripe invoice checkout session created", {
        invoiceId,
        appointmentId: appointmentId || null,
        amountCents: amountInCents,
        hasSecretKey: Boolean(secretKey)
      });

      return res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error("Stripe invoice checkout error:", error.message);
      return res.status(500).json({ error: "Unable to start Stripe checkout." });
    }
  });

  app.get("/pay/invoice/:invoiceId", async (req, res) => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return res.status(503).send("Stripe payment is not configured on the server.");
    }

    let appUrl: URL;
    try {
      appUrl = new URL(process.env.PUBLIC_APP_URL || req.get("origin") || `http://localhost:${PORT}`);
    } catch {
      return res.status(500).send("Public app URL is not configured correctly.");
    }

    const cleanMetadata = (value: unknown) =>
      String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);

    const invoiceId = cleanMetadata(req.params.invoiceId);
    if (!invoiceId) {
      return res.status(400).send("Invoice is required before starting payment.");
    }

    try {
      const db = getFirebaseAdminDb();
      const snapshot = await db.collection("invoices").doc(invoiceId).get();

      if (!snapshot.exists) {
        return res.status(404).send("Invoice was not found.");
      }

      const invoice = snapshot.data() || {};
      const invoiceTotal = Number(invoice.total || 0);
      const invoiceAmountPaid = Number(invoice.amountPaid || 0);
      const balanceDue = Math.max(invoiceTotal - invoiceAmountPaid, 0);
      const amountInCents = Math.round(balanceDue * 100);

      if (!Number.isFinite(balanceDue) || amountInCents <= 0) {
        return res
          .status(200)
          .send("<!doctype html><title>Invoice Paid</title><body style=\"font-family:Arial,sans-serif;padding:32px;\"><h1>Invoice is already paid</h1><p>There is no remaining balance due for this invoice.</p></body>");
      }

      const stripe = new Stripe(secretKey);
      const appointmentId = cleanMetadata(invoice.appointmentId || invoice.jobId);
      const invoiceNumber = cleanMetadata(invoice.invoiceNumber) || `Invoice ${invoiceId.slice(-6).toUpperCase()}`;
      const clientEmail = cleanMetadata(invoice.clientEmail);
      const completeUrl = new URL(`/pay/invoice/${encodeURIComponent(invoiceId)}/complete?payment_checkout=success`, appUrl).toString() + "&session_id={CHECKOUT_SESSION_ID}";
      const cancelUrl = new URL(`/pay/invoice/${encodeURIComponent(invoiceId)}/cancelled`, appUrl).toString();

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amountInCents,
              product_data: {
                name: invoiceNumber,
                description: "Final invoice balance payment."
              }
            },
            quantity: 1
          }
        ],
        customer_email: clientEmail.includes("@") ? clientEmail : undefined,
        success_url: completeUrl,
        cancel_url: cancelUrl,
        metadata: {
          paymentType: "invoice_balance",
          invoiceId,
          appointmentId,
          invoiceNumber,
          clientName: cleanMetadata(invoice.clientName),
          clientEmail,
          vehicleInfo: cleanMetadata(invoice.vehicleInfo),
          amount: balanceDue.toFixed(2),
          amountCents: String(amountInCents)
        }
      });

      if (!session.url) {
        return res.status(500).send("Stripe checkout URL was not returned.");
      }

      return res.redirect(303, session.url);
    } catch (error: any) {
      console.error("Stripe invoice payment link error:", error.message);
      return res.status(500).send("Unable to start Stripe checkout.");
    }
  });

  app.get("/pay/invoice/:invoiceId/complete", (_req, res) => {
    res.send("<!doctype html><title>Payment Submitted</title><body style=\"font-family:Arial,sans-serif;padding:32px;\"><h1>Payment submitted</h1><p>Thanks. Your invoice payment is being confirmed securely through Stripe.</p></body>");
  });

  app.get("/pay/invoice/:invoiceId/cancelled", (_req, res) => {
    res.send("<!doctype html><title>Payment Cancelled</title><body style=\"font-family:Arial,sans-serif;padding:32px;\"><h1>Payment cancelled</h1><p>No payment was completed. You can use the invoice email link again when you are ready.</p></body>");
  });

  app.get("/api/clover/status", (req, res) => {
    const token = process.env.CLOVER_API_TOKEN;
    res.json({ configured: !!token });
  });

  app.get("/api/leads/external", async (req, res) => {
    const { type, location, radius } = req.query;
    const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ 
        error: "Google Maps API Key is missing. Please configure it to enable lead generation."
      });
    }

    try {
      // Map internal types to descriptive search terms
      const typeMap: Record<string, string> = {
        collision_center: "collision center body shop",
        dealership: "car dealership",
        fleet: "fleet management company",
        rental: "car rental agency",
        commercial: "commercial business park",
        retail: "luxury car owners"
      };

      const searchTerm = typeMap[type as string] || type;
      
      // Use Google Places Text Search API
      // Format: https://maps.googleapis.com/maps/api/place/textsearch/json?query=type+in+location&key=apiKey
      const query = encodeURIComponent(`${searchTerm} within ${radius} miles of ${location}`);
      const response = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}`);
      const data = await response.json();

      if (data.status === "ZERO_RESULTS") {
        return res.json({ results: [], message: "No businesses found matching your criteria." });
      }

      if (data.status !== "OK") {
        return res.status(500).json({ error: `Google Places API Error: ${data.status}`, message: data.error_message });
      }

      // Map Google results to our Lead format
      const results = data.results.map((place: any) => ({
        name: place.name,
        address: place.formatted_address,
        phone: place.formatted_phone_number || "N/A", // Text search doesn't always return phone, might need Place Details
        businessWebsite: place.website || "",
        businessType: type,
        source: `Google Maps: ${location}`,
        latitude: place.geometry?.location?.lat,
        longitude: place.geometry?.location?.lng,
        placeId: place.place_id,
        rating: place.rating,
        userRatingsTotal: place.user_ratings_total
      }));

      res.json({ results });
    } catch (error) {
      console.error("External leads fetch error:", error);
      res.status(500).json({ error: "Failed to fetch external leads from Google" });
    }
  });

  app.post("/api/payments/clover", async (req, res) => {
    const token = process.env.CLOVER_API_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "Payment system not configured" });
    }

    const { amount, invoiceId } = req.body;
    
    // TODO: Implement Clover REST API integration using the token
    console.log(`Processing Clover payment for invoice ${invoiceId} of $${amount}`);
    
    return res.status(501).json({ error: "Payment system not configured" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
