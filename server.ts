import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import "dotenv/config";
import sgMail from "@sendgrid/mail";
import twilio from "twilio";
import Stripe from "stripe";
import admin from "firebase-admin";
import { startScheduler } from "./scheduler.ts";
import fs from "fs";

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
} catch (e) {
  console.warn("Could not read firebase-applet-config.json");
}

let appAdmin: admin.app.App | undefined;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    appAdmin = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch(e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT", e);
  }
}

if (!appAdmin) {
  if (firebaseConfig.projectId) {
    appAdmin = admin.initializeApp({
      projectId: firebaseConfig.projectId
    });
  } else {
    console.error("CRITICAL: No Firebase project ID found. Firebase Admin will not be initialized.");
  }
}

const dbAdmin = appAdmin ? appAdmin.firestore() : null;
if (appAdmin && dbAdmin && firebaseConfig.firestoreDatabaseId) {
  dbAdmin.settings({ databaseId: firebaseConfig.firestoreDatabaseId });
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

let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  const key = process.env.STRIPE_SECRET_KEY.trim();
  if (!key.startsWith('sk_')) {
    console.error("CRITICAL: Invalid STRIPE_SECRET_KEY. Backend keys must start with 'sk_'. Found prefix: " + key.substring(0, 3));
  } else {
    stripe = new Stripe(key);
  }
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.TEST_PORT || "3000", 10);

  // Start background jobs safely
  try {
    startScheduler();
  } catch (err) {
    console.error("Failed to start scheduler, but continuing server startup:", err);
  }

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      distExists: fs.existsSync(path.join(process.cwd(), 'dist')),
      indexExists: fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'))
    });
  });

  let vite: any = null;
  const isProd = process.env.NODE_ENV === "production";

  // Start listening IMMEDIATELY to satisfy platform health check
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`CRITICAL_LOG: Server successfully reached app.listen on port ${PORT}`);
  });

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

  app.post("/api/payments/create-intent", async (req, res) => {
    if (!stripe) {
      return res.status(502).json({ error: "Stripe not configured" });
    }
    const { amount, currency = "usd", metadata } = req.body;
    
    console.log(`Backend: Received payment request for amount: ${amount}, type: ${typeof amount}`);

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Invalid payment amount. Must be a positive number." });
    }

    try {
      const amountInCents = Math.round(Number(amount) * 100);
      console.log(`Backend: Creating payment intent for ${amountInCents} cents`);

      const sanitizedMetadata: Record<string, string> = {};
      if (metadata && typeof metadata === 'object') {
        Object.entries(metadata).forEach(([key, value]) => {
          sanitizedMetadata[key.substring(0, 40)] = String(value).substring(0, 500);
        });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents, 
        currency: "usd",
        metadata: sanitizedMetadata,
      });
      
      if (!paymentIntent.client_secret) {
        throw new Error("Stripe failed to generate a client secret");
      }

      console.log(`Backend: Payment intent created successfully: ${paymentIntent.id}, secret: ${paymentIntent.client_secret.substring(0, 10)}...`);
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e: any) {
      console.error("Backend: Stripe intent creation error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/payments/confirm-invoice", async (req, res) => {
    if (!stripe) {
      return res.status(502).json({ error: "Stripe not configured" });
    }
    const { paymentIntentId, invoiceId, businessId } = req.body;
    
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status === 'succeeded') {
         if (!dbAdmin) {
           return res.status(500).json({ error: "Database not initialized" });
         }
         await dbAdmin.collection('invoices').doc(invoiceId).update({
            paymentStatus: 'paid',
            status: 'paid',
            transactionId: paymentIntent.id,
            paidAt: admin.firestore.Timestamp.now()
         });
         res.json({ success: true });
      } else {
        res.status(400).json({ error: "Payment not successful" });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/stripe/webhook", express.raw({type: 'application/json'}), async (req, res) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(502).json({ error: "Stripe not configured" });
    }
    const sig = req.headers['stripe-signature'];
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig!, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const { invoiceId, businessId, type } = paymentIntent.metadata;
      
      try {
        if (type === 'invoice' && invoiceId) {
             if (!dbAdmin) {
               throw new Error("Database not initialized");
             }
             await dbAdmin.collection('invoices').doc(invoiceId).update({
                paymentStatus: 'paid',
                status: 'paid',
                transactionId: paymentIntent.id,
                paidAt: admin.firestore.Timestamp.now()
             });
        }
      } catch (e) {
        console.error("Webhook processing error", e);
        return res.status(500).send("Processing failed");
      }
    }
    
    res.json({ received: true });
  });

  if (!isProd) {
    console.log("CRITICAL_LOG: Starting Vite initialization...");
    try {
      vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("CRITICAL_LOG: Vite middleware attached.");
    } catch (err) {
      console.error("CRITICAL_LOG: Vite failed to start:", err);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        const indexPath = path.join(distPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send("Production build not found. Please run build script.");
        }
      });
      console.log("CRITICAL_LOG: Static serving configured for /dist.");
    } else {
      console.error("CRITICAL_LOG: /dist directory not found in production mode.");
      app.get('*', (req, res) => {
        res.status(500).send("Application not built. Please run build script.");
      });
    }
  }
}

startServer().catch(err => {
  console.error("CRITICAL: Failed to start server:", err);
  process.exit(1);
});
