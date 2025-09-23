import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import OpenAI from "openai";
import * as cheerio from "cheerio";
import { chromium } from "playwright";
import { scrapeGoogleShopping } from "./scraper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// SerpAPI configuration
const SERP_API_KEY = process.env.SERPER_API_KEY;
const SERP_API_BASE_URL = "https://serpapi.com/search.json";

const app = express();
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://cheeply.duckdns.org", "http://cheeply.duckdns.org"]
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
      ? ["https://cheeply.duckdns.org", "http://cheeply.duckdns.org"]
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

// Add a new route for Google Shopping results using our scraper
app.get("/api/google-price", async (req, res) => {
  // Set content type explicitly to ensure client sees it as JSON
  res.setHeader("Content-Type", "application/json");

  try {
    const { item, store } = req.query;
    if (!item) {
      return res.status(400).json({
        success: false,
        error: "Missing item parameter",
      });
    }

    console.log(
      `Using scraper to find price for ${item}${store ? ` at ${store}` : ""}`
    );

    // Use our custom scraper
    const scraperResult = await scrapeGoogleShopping(item, store || "");

    if (scraperResult.success) {
      let bestMatch = null;

      // If we have multiple items, find the best match
      if (scraperResult.items && scraperResult.items.length > 0) {
        // First try to find a match at the specified store
        if (store) {
          const storeMatches = scraperResult.items.filter(
            (product) =>
              product.store &&
              product.store.toLowerCase().includes(store.toLowerCase())
          );

          if (storeMatches.length > 0) {
            // Sort by distance if available, then by price
            bestMatch = storeMatches.sort((a, b) => {
              // Sort by distance first if available
              if (a.distance && b.distance) {
                const distA = parseFloat(
                  (a.distance || "").match(/\d+(\.\d+)?/)?.[0] || "999"
                );
                const distB = parseFloat(
                  (b.distance || "").match(/\d+(\.\d+)?/)?.[0] || "999"
                );
                if (distA !== distB) return distA - distB;
              }

              // Then by price if available
              if (a.price && b.price) {
                const priceA = parseFloat((a.price || "").replace("$", ""));
                const priceB = parseFloat((b.price || "").replace("$", ""));
                if (!isNaN(priceA) && !isNaN(priceB)) return priceA - priceB;
              }

              return 0;
            })[0];
          }
        }

        // If no store match found, just take the first item
        if (!bestMatch) {
          bestMatch = scraperResult.items[0];
        }
      }

      // Prepare the response
      if (bestMatch) {
        // Extract price as a number
        const priceStr = bestMatch.price?.replace("$", "") || "0";
        const price = parseFloat(priceStr);

        return res.status(200).json({
          success: true,
          price: isNaN(price) ? 0 : price,
          productName: bestMatch.name,
          source: "google-shopping-scraper",
          store: bestMatch.store || store || "",
          fullStoreName: bestMatch.store,
          url: "", // We don't have a URL from the scraper
          isEstimate: false,
          confidence: 0.9,
          distance: bestMatch.distance,
          returnPolicy: bestMatch.returnsPolicy,
          rating: bestMatch.rating ? parseFloat(bestMatch.rating) : undefined,
          reviewCount: bestMatch.reviewCount,
          method: bestMatch.method,
        });
      } else {
        // No best match found
        return res.status(404).json({
          success: false,
          error: "No matching products found",
          store: store || "",
        });
      }
    } else {
      // Scraper returned an error
      console.error(`Scraper error: ${scraperResult.error}`);
      return res.status(500).json({
        success: false,
        error: scraperResult.error || "Failed to scrape price",
        store: store || "",
      });
    }
  } catch (error) {
    console.error("Error using scraper:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch price",
      store: store || "",
    });
  }
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

// Add this list of store types to filter out
const EXCLUDED_STORE_TYPES = [
  "gas_station",
  "convenience_store",
  "car_dealer",
  "car_repair",
  "car_wash",
];

// Helper function to search products using SerpAPI
// Rate limiting for SerpAPI
let lastSerpAPICall = 0;
const SERPAPI_RATE_LIMIT_MS = 1000; // 1 second between calls

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchProductsWithSerpAPI(
  itemName,
  storeName,
  userLocation,
  retryCount = 0
) {
  try {
    if (!SERP_API_KEY) {
      console.warn("SerpAPI key not configured, skipping price search");
      return null;
    }

    // Rate limiting: ensure at least 1 second between API calls
    const now = Date.now();
    const timeSinceLastCall = now - lastSerpAPICall;
    if (timeSinceLastCall < SERPAPI_RATE_LIMIT_MS) {
      await delay(SERPAPI_RATE_LIMIT_MS - timeSinceLastCall);
    }
    lastSerpAPICall = Date.now();

    const params = new URLSearchParams({
      api_key: SERP_API_KEY,
      engine: "google_shopping",
      q: `${itemName} ${storeName}`,
      gl: "us",
      hl: "en",
      num: 10,
    });

    console.log(
      `Searching SerpAPI for: ${itemName} at ${storeName} (attempt ${
        retryCount + 1
      })`
    );

    const response = await axios.get(`${SERP_API_BASE_URL}?${params}`, {
      timeout: 15000, // 15 second timeout
      headers: {
        "User-Agent": "ShopCheaply/1.0",
      },
    });

    if (
      !response.data.shopping_results ||
      response.data.shopping_results.length === 0
    ) {
      console.log(`No SerpAPI results for ${itemName} at ${storeName}`);
      return null;
    }

    // Find the best match (lowest price or first result)
    const bestResult = response.data.shopping_results.reduce(
      (best, current) => {
        const bestPrice = parseFloat(
          best.price?.replace(/[^0-9.]/g, "") || "999"
        );
        const currentPrice = parseFloat(
          current.price?.replace(/[^0-9.]/g, "") || "999"
        );
        return currentPrice < bestPrice ? current : best;
      }
    );

    return {
      name: bestResult.title || itemName,
      price: bestResult.price,
      rating: bestResult.rating,
      reviews: bestResult.reviews,
      source: "serpapi",
    };
  } catch (error) {
    console.error(
      `Error searching SerpAPI for ${itemName} at ${storeName} (attempt ${
        retryCount + 1
      }):`,
      error.code || error.message
    );

    // Retry logic for connection issues
    if (
      (error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ECONNREFUSED") &&
      retryCount < 2
    ) {
      console.log(
        `Retrying SerpAPI request for ${itemName} at ${storeName} in ${
          (retryCount + 1) * 2
        } seconds...`
      );
      await delay((retryCount + 1) * 2000); // Exponential backoff: 2s, 4s
      return searchProductsWithSerpAPI(
        itemName,
        storeName,
        userLocation,
        retryCount + 1
      );
    }

    return null;
  }
}

// Add a new route for /api/stores to return real store data
app.get("/api/stores", async (req, res) => {
  try {
    const { latitude, longitude, items } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: "Latitude and longitude are required",
      });
    }

    // Parse items if provided as JSON string
    let searchItems = [];
    try {
      if (items) {
        searchItems = JSON.parse(items);
      }
    } catch (e) {
      console.error("Error parsing items:", e);
    }

    if (!searchItems || searchItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No items provided in shopping list",
      });
    }

    console.log(
      `Searching for stores near: ${latitude}, ${longitude} with items: ${searchItems.join(
        ", "
      )}`
    );

    // Step 1: Find nearby grocery stores using Google Maps Places API
    const nearbyStores = await findNearbyGroceryStores(
      parseFloat(latitude),
      parseFloat(longitude)
    );

    if (nearbyStores.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No grocery stores found nearby",
      });
    }

    console.log(`Found ${nearbyStores.length} nearby stores`);

    // Step 2: For each store, fetch real product prices using SerpAPI
    // Process stores sequentially to avoid overwhelming SerpAPI
    const storesWithPrices = [];

    for (const store of nearbyStores) {
      console.log(`Processing store: ${store.name}`);
      const storeItems = [];

      // Fetch prices for each requested item at this store
      for (const item of searchItems) {
        try {
          console.log(`Fetching price for ${item} at ${store.name}`);

          const serpResult = await searchProductsWithSerpAPI(item, store.name, {
            lat: parseFloat(latitude),
            lng: parseFloat(longitude),
          });

          if (serpResult) {
            storeItems.push({
              name: item,
              productName: serpResult.name || item,
              price: parseFloat(
                serpResult.price?.replace(/[^0-9.]/g, "") || "0"
              ),
              lastUpdated: new Date().toISOString(),
              isGenericName: serpResult.name === item,
              productDetail: null,
            });
          } else {
            // If no price found, add item with null price
            storeItems.push({
              name: item,
              productName: item,
              price: null,
              lastUpdated: new Date().toISOString(),
              isGenericName: true,
              productDetail: null,
            });
          }
        } catch (error) {
          console.error(
            `Error fetching price for ${item} at ${store.name}:`,
            error
          );
          // Add item with null price on error
          storeItems.push({
            name: item,
            productName: item,
            price: null,
            lastUpdated: new Date().toISOString(),
            isGenericName: true,
            productDetail: null,
          });
        }
      }

      storesWithPrices.push({
        ...store,
        items: storeItems,
      });
    }

    // Step 3: Return the real store data with prices
    res.json({
      success: true,
      stores: storesWithPrices,
    });
  } catch (error) {
    console.error("Error in /api/stores:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch stores",
    });
  }
});

// Helper function to find nearby grocery stores using Google Maps Places API
async function findNearbyGroceryStores(latitude, longitude) {
  try {
    const radius = 8046.7; // 5 miles in meters (reduced from 20 miles for faster searches)
    const maxDistance = 5; // 5 miles maximum distance
    const types = ["grocery_or_supermarket", "supermarket"];
    const stores = [];

    for (const type of types) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&type=${type}&key=${GOOGLE_MAPS_API_KEY}`;

      const response = await axios.get(url);
      const data = response.data;

      if (data.status === "OK" && data.results) {
        data.results.forEach((place) => {
          // Calculate distance from user location
          const distance = calculateDistance(
            latitude,
            longitude,
            place.geometry.location.lat,
            place.geometry.location.lng
          );

          // Only include stores within 5 miles (reduced from 20 miles)
          if (distance <= maxDistance) {
            stores.push({
              id: place.place_id,
              place_id: place.place_id,
              name: place.name,
              vicinity: place.vicinity,
              distance: distance,
              latitude: place.geometry.location.lat,
              longitude: place.geometry.location.lng,
              rating: place.rating || null,
              priceLevel: place.price_level || null,
            });
          }
        });
      }
    }

    // Remove duplicates and sort by distance
    const uniqueStores = stores.filter(
      (store, index, self) =>
        index === self.findIndex((s) => s.place_id === store.place_id)
    );

    return uniqueStores.sort((a, b) => a.distance - b.distance).slice(0, 15); // Reduced from 20 to 15 stores
  } catch (error) {
    console.error("Error finding nearby stores:", error);
    return [];
  }
}

// Helper function to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Endpoint to compare prices across stores
app.post("/api/compare", async (req, res) => {
  try {
    const { stores, items } = req.body;
    if (
      !Array.isArray(stores) ||
      !Array.isArray(items) ||
      stores.length === 0 ||
      items.length === 0
    ) {
      return res.status(400).json({ error: "Invalid stores or items data" });
    }

    const results = [];
    const errors = [];

    for (const store of stores) {
      const storeResults = {
        storeName: store.name,
        items: [],
        totalPrice: 0,
      };

      for (const item of items) {
        try {
          // Use Google Shopping scraper to get real prices
          const scraperResult = await scrapeGoogleShopping(item, store.name);

          if (
            scraperResult.success &&
            scraperResult.items &&
            scraperResult.items.length > 0
          ) {
            const bestMatch = scraperResult.items[0];
            const price = parseFloat(bestMatch.price.replace(/[^0-9.]/g, ""));

            if (!isNaN(price)) {
              storeResults.items.push({
                name: item,
                price: price,
                productName: bestMatch.name,
              });
              storeResults.totalPrice += price;
            }
          } else {
            errors.push(`No price found for ${item} at ${store.name}`);
          }
        } catch (error) {
          console.error(
            `Error getting price for ${item} at ${store.name}:`,
            error
          );
          errors.push(
            `Failed to get price for ${item} at ${store.name}: ${error.message}`
          );
          continue;
        }

        // Add delay to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (storeResults.items.length > 0) {
        results.push(storeResults);
      }
    }

    if (results.length === 0) {
      return res.status(404).json({
        error: "Could not find any real prices",
        details: errors,
      });
    }

    // Sort results by total price
    results.sort((a, b) => a.totalPrice - b.totalPrice);

    res.json({
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error comparing prices:", error);
    res.status(500).json({ error: "Failed to compare prices" });
  }
});

// Mapbox token endpoint
app.get("/api/mapbox-token", (req, res) => {
  res.json({ token: process.env.MAPBOX_TOKEN });
});

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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

// Simple endpoint to test JSON responses
app.get("/api/test", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({ success: true, message: "API is working correctly" });
});

// Add this at the very start of your server.js file, right after your imports
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Promise Rejection:", reason);
  // Don't exit the process, just log the error
});
