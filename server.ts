import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import "dotenv/config";
import sgMail from "@sendgrid/mail";
import twilio from "twilio";
import {
  initializeApp as initAdminApp,
  cert as adminCert,
  getApps as getAdminApps,
  type App as AdminApp,
} from "firebase-admin/app";
import {
  getFirestore as getAdminFirestore,
  type Firestore as AdminFirestore,
} from "firebase-admin/firestore";
import { startScheduler } from "./scheduler.ts";
import type { Service } from "./src/types";
import {
  decideBookingGate,
  sanitizeGateResultForPublic,
  normalizeEmail as gateNormalizeEmail,
} from "./src/services/onlineBookingGateCore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Firebase Admin (for /api/booking/gate) ──────────────────────────────────
// Lazy-initialized on first request so the rest of the server starts even when
// FIREBASE_SERVICE_ACCOUNT_KEY is not configured. When unset, the booking-gate
// endpoint returns 503 — the public booking page then fails safe.

let adminInitAttempted = false;
let adminDb: AdminFirestore | null = null;

function getBookingGateAdminDb(): AdminFirestore | null {
  if (adminInitAttempted) return adminDb;
  adminInitAttempted = true;

  const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    console.warn(
      "[booking-gate] FIREBASE_SERVICE_ACCOUNT_KEY not set — /api/booking/gate disabled. " +
      "Public booking will fail safe (no instant-confirm) until a service account is provided.",
    );
    return null;
  }

  try {
    const serviceAccount = JSON.parse(keyJson);
    const existing: AdminApp[] = getAdminApps();
    const app: AdminApp = existing.length === 0
      ? initAdminApp({ credential: adminCert(serviceAccount) }, "bookingGateApp")
      : (existing.find((a) => a.name === "bookingGateApp") ?? existing[0]);

    // Read the firestoreDatabaseId from the same applet config the scheduler
    // uses, so the admin SDK targets the same named database as the client.
    let databaseId: string | undefined;
    try {
      const configPath = path.join(__dirname, "firebase-applet-config.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      databaseId = typeof config.firestoreDatabaseId === "string"
        ? config.firestoreDatabaseId
        : undefined;
    } catch (cfgErr) {
      console.warn("[booking-gate] Could not read firebase-applet-config.json for databaseId; using default.", cfgErr);
    }

    adminDb = databaseId ? getAdminFirestore(app, databaseId) : getAdminFirestore(app);
    console.log("[booking-gate] firebase-admin initialized — /api/booking/gate ready.");
    return adminDb;
  } catch (e) {
    console.error("[booking-gate] Failed to initialize firebase-admin:", e);
    return null;
  }
}

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

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // Start background jobs
  startScheduler();

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
    if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
      return res.status(400).json({ error: "Twilio not configured" });
    }

    const { to, body } = req.body;
    
    if (!to || !body) {
      return res.status(400).json({ error: "Missing required fields (to, body)" });
    }

    try {
      const message = await twilioClient.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER,
        to
      });
      res.json({ success: true, messageId: message.sid, status: message.status });
    } catch (error: any) {
      console.error("Twilio error:", error);
      let errMsg = error.message;
      if (error.code === 30034) {
        errMsg = "Twilio blocked this message because A2P 10DLC registration is incomplete. (" + error.message + ")";
      }
      // Return 200 with failed status to avoid unhandled rejection issues in frontend
      res.json({ success: false, status: "failed", error: errMsg, code: error.code });
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

  // ── Public Booking Gate ─────────────────────────────────────────────────────
  //
  // POST /api/booking/gate
  // Loads protected_clients + matching client + services with ADMIN credentials,
  // runs the pure decision core, and returns a sanitized result.
  //
  // The public /book page calls this endpoint instead of reading
  // protected_clients directly (which is admin-only per firestore.rules and
  // must remain so). Sensitive text fields (riskReason, protectionLevel,
  // clientRiskLevelAtBooking) are NEVER returned to the public client.
  app.post("/api/booking/gate", async (req, res) => {
    const db = getBookingGateAdminDb();
    if (!db) {
      return res.status(503).json({
        error: "Booking gate not configured",
        code: "GATE_NOT_CONFIGURED",
        message:
          "Booking review is temporarily unavailable. Please try again shortly or contact us directly.",
      });
    }

    // ── Validate body ────────────────────────────────────────────────────────
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email : "";
    const phone = typeof body.phone === "string" ? body.phone : "";
    const licensePlate = typeof body.licensePlate === "string" ? body.licensePlate : undefined;
    const grandTotalRaw = body.grandTotal;
    const grandTotal = typeof grandTotalRaw === "number" && isFinite(grandTotalRaw) && grandTotalRaw >= 0
      ? grandTotalRaw
      : NaN;
    const selectedServiceIdsRaw = body.selectedServiceIds;
    const selectedServiceIds = Array.isArray(selectedServiceIdsRaw)
      ? selectedServiceIdsRaw.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 40)
      : [];

    if (!email && !phone) {
      return res.status(400).json({ error: "email or phone is required" });
    }
    if (!isFinite(grandTotal)) {
      return res.status(400).json({ error: "grandTotal must be a non-negative number" });
    }
    if (selectedServiceIds.length === 0) {
      return res.status(400).json({ error: "selectedServiceIds must be a non-empty array" });
    }

    try {
      // ── Load data with admin privileges ────────────────────────────────────
      // protected_clients: list is small; full collection load is fine.
      // clients: lookup by normalized email (one-document expected).
      // services: load each by ID so deposit rules use authoritative server data
      //           (the public client can't tamper with depositRequired/amount).
      const normEmail = gateNormalizeEmail(email);

      const pcPromise = db.collection("protected_clients").get();
      const clientPromise = normEmail.length > 3
        ? db.collection("clients").where("email", "==", normEmail).limit(1).get()
        : Promise.resolve(null);
      const servicesPromise = Promise.all(
        selectedServiceIds.map((id) => db.collection("services").doc(id).get()),
      );

      const [pcSnap, clientSnap, serviceSnaps] = await Promise.all([
        pcPromise,
        clientPromise,
        servicesPromise,
      ]);

      const protectedClients = pcSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Record<string, unknown>),
      }));

      const matchedClient = clientSnap && !clientSnap.empty
        ? { id: clientSnap.docs[0].id, ...(clientSnap.docs[0].data() as Record<string, unknown>) }
        : null;

      const selectedServices: Service[] = serviceSnaps
        .filter((s) => s.exists)
        .map((s) => ({ id: s.id, ...(s.data() as Omit<Service, "id">) }));

      if (selectedServices.length === 0) {
        return res.status(400).json({ error: "No matching services found for selectedServiceIds" });
      }

      // ── Run pure decision core ──────────────────────────────────────────────
      const result = decideBookingGate({
        email,
        phone,
        licensePlate,
        selectedServices,
        grandTotal,
        protectedClients,
        matchedClient,
      });

      // ── Sanitize and return ─────────────────────────────────────────────────
      // riskReason / protectionLevel / clientRiskLevelAtBooking are stripped
      // by sanitizeGateResultForPublic — they never cross the wire.
      const safeResult = sanitizeGateResultForPublic(result);
      return res.json(safeResult);
    } catch (err) {
      console.error("[booking-gate] error:", err);
      return res.status(500).json({
        error: "Booking gate failed",
        code: "GATE_INTERNAL_ERROR",
        message:
          "We could not complete booking review right now. Please try again or contact us directly.",
      });
    }
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
    const env = process.env.NODE_ENV || "development";
    const keys = {
      GEMINI: !!process.env.GEMINI_API_KEY,
      SENDGRID: !!process.env.SENDGRID_API_KEY,
      STRIPE: !!process.env.STRIPE_SECRET_KEY,
      TWILIO: !!process.env.TWILIO_ACCOUNT_SID,
    };
    console.log(`[DetailFlow] Server listening on port ${PORT} (${env})`);
    console.log(`[DetailFlow] API keys present: ${JSON.stringify(keys)}`);
  });
}

startServer();
