const express = require("express");
const cors = require("cors");
const axios = require("axios");
const dotenv = require("dotenv");
const path = require("path");
const OpenAI = require("openai");
const { SerpApiService } = require("./dist/backend/src/services/serpApi.js");
const {
  PriceAnalysisService,
} = require("./dist/backend/src/services/priceAnalysis.js");

dotenv.config();

const app = express();
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://cheeply.duckdns.org"]
        : [
            "http://localhost:5173",
            "http://localhost:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
          ],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "OPTIONS"],
    exposedHeaders: ["Content-Length", "X-Foo", "X-Bar"],
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

// Add security headers
app.use((req, res, next) => {
  const allowedOrigins =
    process.env.NODE_ENV === "production"
      ? ["https://cheeply.duckdns.org"]
      : [
          "http://localhost:5173",
          "http://localhost:3000",
          "http://127.0.0.1:5173",
          "http://127.0.0.1:3000",
        ];

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  next();
});

app.use(express.json());

// Initialize SerpAPI service
const serpApi = SerpApiService.getInstance(
  "c54c47bdbf6dbe1eef970a76495dee22009aafee9b2af718100155a7f14d4f59"
);

// Initialize Price Analysis service
const priceAnalysis = new PriceAnalysisService(
  "c54c47bdbf6dbe1eef970a76495dee22009aafee9b2af718100155a7f14d4f59"
);

// Add a new route for Google Shopping results using SerpAPI
app.get("/api/google-price", async (req, res) => {
  // Set content type explicitly to ensure client sees it as JSON
  res.setHeader("Content-Type", "application/json");

  try {
    const { item, lat, lng } = req.query;
    if (!item) {
      return res.status(400).json({
        success: false,
        error: "Missing item parameter",
      });
    }

    console.log(
      `Using SerpAPI to find price for ${item}${
        lat && lng ? ` at location (${lat}, ${lng})` : ""
      }`
    );

    const location =
      lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : undefined;
    const result = await serpApi.searchProducts(item, location);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || "Failed to fetch results from SerpAPI",
      });
    }

    return res.json(result);
  } catch (error) {
    console.error("Error in Google Shopping API:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch nearby store data",
    });
  }
});

// Add a new route for shopping list price analysis using SerpAPI
app.post("/api/analyze-shopping-list", async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  try {
    const { items, location } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Shopping list items are required",
      });
    }

    if (!location || !location.lat || !location.lng) {
      return res.status(400).json({
        success: false,
        error: "Location (lat, lng) is required",
      });
    }

    console.log(
      `Analyzing shopping list with ${items.length} items at location (${location.lat}, ${location.lng})`
    );

    const analysis = await priceAnalysis.analyzeShoppingList(items, location);

    return res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error("Error in shopping list analysis:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to analyze shopping list",
    });
  }
});

// Add Mapbox token endpoint
app.get("/api/mapbox-token", (req, res) => {
  res.json({ token: process.env.MAPBOX_TOKEN });
});

// Static files are served by Nginx in production, not by the backend

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Validate required API keys
if (!GOOGLE_MAPS_API_KEY) {
  console.error("Missing required API keys. Please check your .env file.");
  process.exit(1);
}

// Initialize OpenAI
const openai = new OpenAI.OpenAIApi(
  new OpenAI.Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

// Frontend routing is handled by Nginx in production

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api/`);
  if (process.env.NODE_ENV === "production") {
    console.log(`Frontend served at http://localhost:${PORT}/`);
  } else {
    console.log(
      `Frontend development server should be running at http://localhost:5173/`
    );
  }
});

// Global error handler to ensure JSON responses
app.use((err, req, res, next) => {
  console.error("Global error handler caught:", err);

  // Set content type explicitly
  res.setHeader("Content-Type", "application/json");

  // Always return JSON, even in case of server errors
  const statusCode = err.statusCode || 500;

  if (req.path.includes("/api/")) {
    // For API routes, return JSON with error details
    return res.status(statusCode).json({
      success: false,
      error: err.message || "Internal server error",
      path: req.path,
    });
  }

  // For non-API routes, just pass to next error handler
  next(err);
});

// Make sure CORS headers are set for all API responses
app.use("/api/*", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// Add hybrid price analysis endpoint using OpenStreetMap + SerpAPI
app.post("/api/hybrid-price-analysis", async (req, res) => {
  try {
    const { items, latitude, longitude } = req.body;

    // Validate request
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Items must be a non-empty array",
      });
    }

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: "Latitude and longitude are required",
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        success: false,
        error: "Invalid coordinates",
      });
    }

    console.log(`Analyzing ${items.length} items at location (${lat}, ${lng})`);

    // Use the hybrid approach from the frontend service
    const analysis = await priceAnalysis.analyzeShoppingList(items, {
      lat,
      lng,
    });

    return res.json({
      success: true,
      ...analysis,
    });
  } catch (error) {
    console.error("Error in hybrid price analysis:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// Add endpoint for price analysis with store coordinates for map
app.post("/api/analyze-shopping-list-with-map", async (req, res) => {
  try {
    const { items, location } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items array is required" });
    }

    if (
      !location ||
      typeof location.lat !== "number" ||
      typeof location.lng !== "number"
    ) {
      return res
        .status(400)
        .json({ error: "Valid location with lat and lng is required" });
    }

    console.log(
      `Analyzing shopping list with ${items.length} items at location (${location.lat}, ${location.lng})`
    );

    const analysis = await priceAnalysis.analyzeShoppingList(items, location);

    // Generate store coordinates using improved distance and address generation
    const storesWithCoordinates = [];
    const allStores = new Set();
    analysis.items.forEach((item) => {
      allStores.add(item.cheapestOption.store);
      item.allOptions.forEach((option) => allStores.add(option.store));
    });
    analysis.recommendedStores.forEach((store) => allStores.add(store.store));

    // Generate coordinates for each unique store
    for (const storeName of allStores) {
      let distance = 0;
      let address = storeName;

      // Find distance from analysis
      for (const item of analysis.items) {
        const option = item.allOptions.find((opt) => opt.store === storeName);
        if (option) {
          distance = option.storeDistance;
          address = option.address || storeName;
          break;
        }
      }

      // Generate realistic address if not found
      if (address === storeName) {
        const nearbyCities = [
          "Fayetteville, North Carolina",
          "Spring Lake, North Carolina",
          "Hope Mills, North Carolina",
          "Lumberton, North Carolina",
          "Southern Pines, North Carolina",
          "Pinehurst, North Carolina",
          "Aberdeen, North Carolina",
          "Carthage, North Carolina",
        ];

        const storeHash = storeName.split("").reduce((a, b) => {
          a = (a << 5) - a + b.charCodeAt(0);
          return a & a;
        }, 0);

        const cityIndex = Math.abs(storeHash) % nearbyCities.length;
        const city = nearbyCities[cityIndex];
        address = `${storeName} - ${city}`;
      }

      // Generate realistic coordinates based on distance
      const storeHash = storeName.split("").reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
      }, 0);

      const latOffset = distance * 0.014483;
      const lngOffset =
        (distance * 0.014483) / Math.cos((location.lat * Math.PI) / 180);
      const angle = Math.abs(storeHash % 360) * (Math.PI / 180);

      const latitude = location.lat + latOffset * Math.sin(angle);
      const longitude = location.lng + lngOffset * Math.cos(angle);

      storesWithCoordinates.push({
        id: storeName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        name: storeName,
        address: address,
        distance: distance,
        latitude: latitude,
        longitude: longitude,
      });
    }

    res.json({
      success: true,
      analysis,
      stores: storesWithCoordinates,
    });
  } catch (error) {
    console.error("Error in price analysis with map:", error);
    res.status(500).json({
      success: false,
      error: "Failed to analyze shopping list",
      details: error.message,
    });
  }
});
