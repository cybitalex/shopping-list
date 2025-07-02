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

const app = express();
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://shopcheeply.duckdns.org"]
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
      ? ["https://shopcheeply.duckdns.org"]
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

// Serve static files from the dist directory in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(join(__dirname, "dist")));
  console.log("Serving static files from:", join(__dirname, "dist"));
}

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

app.get("/api/stores", async (req, res) => {
  try {
    const { latitude, longitude, items } = req.query;

    if (!latitude || !longitude) {
      return res
        .status(400)
        .json({ error: "Latitude and longitude are required" });
    }

    // Log with timestamp to identify different requests
    console.log(
      `[${new Date().toISOString()}] Searching for stores near: ${latitude}, ${longitude}`
    );

    // Parse items if provided as JSON string
    let searchItems = [];
    try {
      if (items) {
        searchItems = JSON.parse(items);
      }
    } catch (e) {
      console.error("Error parsing items:", e);
    }

    // If no items provided, return error
    if (!searchItems || searchItems.length === 0) {
      return res
        .status(400)
        .json({ error: "No items provided in shopping list" });
    }

    console.log(`Searching for items: ${searchItems.join(", ")}`);

    // Search for all items in parallel with playwright using browser geolocation
    const searchPromises = searchItems.map((item) =>
      scrapeGoogleShopping(item, {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      })
        .then((result) => ({ item, result }))
        .catch((error) => {
          console.error(`Error scraping for ${item}:`, error);
          return { item, error };
        })
    );

    const searchResults = await Promise.all(searchPromises);

    // Log the results for debugging
    searchResults.forEach(({ item, result, error }) => {
      if (error) {
        console.error(`Error for ${item}:`, error);
      } else if (result) {
        console.log(
          `Results for ${item}: ${
            result.success ? "Success" : "Failed"
          }, Stores: ${result.stores?.length || 0}`
        );
      }
    });

    // Combine all store results - only use stores that have distance information
    // which means they are physically located near the provided coordinates
    const storeMap = new Map();

    searchResults.forEach(({ item, result, error }) => {
      if (error || !result?.success || !result?.stores) {
        console.error(`Error searching for ${item}:`, error || "No results");
        return;
      }

      result.stores.forEach((store) => {
        // Skip stores without distance information as they might not be near the requested location
        if (
          !store.name ||
          !store.items ||
          store.items.length === 0 ||
          store.distance === null
        ) {
          console.log(
            `Skipping store ${
              store.name || "unknown"
            } - missing required data or distance`
          );
          return;
        }

        // Skip stores with unrealistic distances (too far or too small)
        if (store.distance > 50 || store.distance < 0.01) {
          console.log(
            `Skipping store ${store.name} - unrealistic distance ${store.distance} miles`
          );
          return;
        }

        // Skip non-grocery establishments
        const nonGroceryKeywords = [
          "gas station",
          "restaurant",
          "cafe",
          "cinema",
          "theater",
          "hotel",
          "motel",
          "auto parts",
        ];
        const isNonGrocery = nonGroceryKeywords.some((keyword) =>
          store.name.toLowerCase().includes(keyword)
        );

        if (isNonGrocery) {
          console.log(`Skipping non-grocery store: ${store.name}`);
          return;
        }

        // Generate a unique ID for this store based on name and location
        const storeId = `${store.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")}-${(store.distance || 0).toFixed(1)}`;

        if (!storeMap.has(storeId)) {
          storeMap.set(storeId, {
            place_id: storeId,
            name: store.name,
            address: store.name,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            distance: store.distance || null,
            items: [],
            id: storeId,
          });
        }

        // Add items to the store with their exact Google Shopping names
        const existingStore = storeMap.get(storeId);
        store.items.forEach((storeItem) => {
          existingStore.items.push({
            name: item, // Original search query item name
            productName: storeItem.name || item, // Actual product name from Google Shopping
            price: parseFloat(storeItem.price.replace(/[^0-9.]/g, "")),
            lastUpdated: new Date().toISOString(),
          });
        });
      });
    });

    // Convert to array and sort
    const finalStores = Array.from(storeMap.values())
      .sort((a, b) => {
        // First by number of items found (descending)
        const itemsDiff = b.items.length - a.items.length;
        if (itemsDiff !== 0) return itemsDiff;

        // Then by distance if available
        if (a.distance !== null && b.distance !== null) {
          return a.distance - b.distance;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, 20); // Limit to 20 stores

    if (finalStores.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No stores found with real prices for the requested items",
      });
    }

    res.json({ stores: finalStores });
  } catch (error) {
    console.error("Error finding stores:", error);
    res.status(500).json({ error: error.message });
  }
});

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

// Serve the frontend for any other routes in production
if (process.env.NODE_ENV === "production") {
  app.get("*", (req, res) => {
    res.sendFile(join(__dirname, "dist", "index.html"));
  });
}

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

app.get("/api/mapbox-token", (req, res) => {
  res.json({ token: process.env.MAPBOX_TOKEN });
});
