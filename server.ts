import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/clover/status", (req, res) => {
    const token = process.env.CLOVER_API_TOKEN;
    res.json({ configured: !!token });
  });

  app.get("/api/leads/external", async (req, res) => {
    const { type, location, radius } = req.query;
    const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ 
        error: "Google Maps API Key is missing. Please add it to your settings to enable real business search.",
        isMock: true 
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
      return res.status(500).json({ error: "Clover API token is missing." });
    }

    const { amount, invoiceId } = req.body;
    
    // TODO: Implement Clover REST API integration using the token
    console.log(`Processing Clover payment for invoice ${invoiceId} of $${amount}`);
    
    // Mock success
    res.json({ success: true, transactionId: `clover_${Date.now()}` });
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
