import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import { Configuration, OpenAIApi } from "openai";
import * as cheerio from "cheerio";
import { chromium } from "playwright";
import { scrapeGoogleShopping } from "./scraper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// SerpAPI configuration
const SERP_API_KEY = process.env.SERPER_API_KEY;
const SERP_API_BASE_URL = "https://serpapi.com/search.json";

// Scale Serp API configuration
const SCALE_SERP_API_KEY = process.env.SCALE_SERP_API_KEY;
const SCALE_SERP_API_BASE_URL = "https://api.scaleserp.com/search";

// ScraperAPI configuration
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
const SCRAPER_API_BASE_URL = "http://api.scraperapi.com";

// Mock data configuration
const USE_MOCK_DATA = process.env.USE_MOCK_DATA === 'true';
let mockData = null;

// Load mock data if enabled
if (USE_MOCK_DATA) {
  try {
    const mockDataPath = join(__dirname, 'mock-data.json');
    mockData = JSON.parse(readFileSync(mockDataPath, 'utf8'));
    console.log('🎭 Mock data mode enabled - using real stores but mock prices for testing');
  } catch (error) {
    console.error('❌ Failed to load mock data:', error.message);
    console.log('📡 Falling back to real API calls');
  }
}

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

// Add a new route for Google Shopping results - tries API first, then scraper
app.get("/api/google-price", async (req, res) => {
  // Set content type explicitly to ensure client sees it as JSON
  res.setHeader("Content-Type", "application/json");

  // Set a timeout for the entire request
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Request timeout - price search took too long",
      });
    }
  }, 60000); // 60 second timeout

  try {
    const { item, store, lat, lng } = req.query;
    if (!item) {
      return res.status(400).json({
        success: false,
        error: "Missing item parameter",
      });
    }

    // Use unified price search function with full API priority chain
    const userLocation =
      lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;
    const priceResult = await searchPriceWithFallback(
      item,
      store,
      userLocation
    );

    if (priceResult.success) {
      clearTimeout(timeout);
      return res.json({
        success: true,
        price: priceResult.price,
        productName: priceResult.productName,
        store: priceResult.store,
        fullStoreName: priceResult.store,
        url: "",
        source: priceResult.source,
        isEstimate: false,
        rating: priceResult.rating,
        reviewCount: priceResult.reviews,
      });
    }

    // Step 3: Fall back to Playwright scraper only if both APIs failed/unavailable
    console.log(
      `🎭 Falling back to Playwright scraper for ${item}${
        store ? ` at ${store}` : ""
      }`
    );
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

        clearTimeout(timeout);
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
        clearTimeout(timeout);
        return res.status(404).json({
          success: false,
          error: "No matching products found",
          store: store || "",
        });
      }
    } else {
      // Scraper returned an error
      console.error(`Scraper error: ${scraperResult.error}`);
      clearTimeout(timeout);
      return res.status(500).json({
        success: false,
        error: scraperResult.error || "Failed to scrape price",
        store: store || "",
      });
    }
  } catch (error) {
    console.error("Error using scraper:", error);
    clearTimeout(timeout);
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
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

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

    // Check for SerpAPI errors (like quota exceeded)
    if (response.data.error) {
      console.error(`SerpAPI error: ${response.data.error}`);
      throw new Error(`SerpAPI error: ${response.data.error}`);
    }

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

// Scale Serp API function for price searching
async function searchProductsWithScaleSerp(
  itemName,
  storeName,
  userLocation,
  retryCount = 0
) {
  try {
    if (!SCALE_SERP_API_KEY) {
      console.warn("Scale Serp API key not configured, skipping price search");
      return null;
    }

    console.log(
      `Searching Scale Serp for: ${itemName} at ${storeName} (attempt ${
        retryCount + 1
      })`
    );

    const params = new URLSearchParams({
      api_key: SCALE_SERP_API_KEY,
      q: `${itemName} ${storeName}`,
      search_type: "shopping",
      gl: "us",
      hl: "en",
      num: 10,
    });

    // Add location if provided
    if (userLocation && userLocation.lat && userLocation.lng) {
      params.append("location", `${userLocation.lat},${userLocation.lng}`);
    }

    const response = await axios.get(`${SCALE_SERP_API_BASE_URL}?${params}`, {
      timeout: 15000, // 15 second timeout
      headers: {
        "User-Agent": "ShopCheaply/1.0",
      },
    });

    console.log(`Scale Serp response status: ${response.status}`);
    console.log(`Scale Serp response data keys: ${Object.keys(response.data)}`);

    // Check for Scale Serp errors
    if (response.data.error) {
      console.error(`Scale Serp error: ${response.data.error}`);
      throw new Error(`Scale Serp error: ${response.data.error}`);
    }

    if (
      !response.data.shopping_results ||
      response.data.shopping_results.length === 0
    ) {
      console.log(`No Scale Serp results for ${itemName} at ${storeName}`);
      return null;
    }

    // Find the best match (lowest price or first result)
    const bestResult = response.data.shopping_results.reduce(
      (best, current) => {
        // Scale Serp returns price as a number, not string
        const bestPrice =
          typeof best.price === "number"
            ? best.price
            : parseFloat(String(best.price || "999").replace(/[^0-9.]/g, ""));
        const currentPrice =
          typeof current.price === "number"
            ? current.price
            : parseFloat(
                String(current.price || "999").replace(/[^0-9.]/g, "")
              );
        return currentPrice < bestPrice ? current : best;
      }
    );

    return {
      name: bestResult.title || itemName,
      price: bestResult.price,
      rating: bestResult.rating,
      reviews: bestResult.reviews,
      source: "scaleserp",
      link: bestResult.link,
      store: bestResult.source || storeName,
    };
  } catch (error) {
    console.error(
      `Error searching Scale Serp for ${itemName} at ${storeName} (attempt ${
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
        `Retrying Scale Serp request for ${itemName} at ${storeName} in ${
          (retryCount + 1) * 2
        } seconds...`
      );
      await delay((retryCount + 1) * 2000); // Exponential backoff: 2s, 4s
      return searchProductsWithScaleSerp(
        itemName,
        storeName,
        userLocation,
        retryCount + 1
      );
    }

    return null;
  }
}

// ScraperAPI function for price searching via Google Shopping
async function searchProductsWithScraperAPI(
  itemName,
  storeName,
  userLocation,
  retryCount = 0
) {
  try {
    if (!SCRAPER_API_KEY) {
      console.warn("ScraperAPI key not configured, skipping price search");
      return null;
    }

    console.log(
      `Searching ScraperAPI for: ${itemName} at ${storeName} (attempt ${
        retryCount + 1
      })`
    );

    // Construct simpler Google search URL (faster than shopping page)
    const searchQuery = encodeURIComponent(`${itemName} price ${storeName}`);
    const googleSearchUrl = `https://www.google.com/search?q=${searchQuery}`;

    // ScraperAPI URL with optimized parameters for speed
    const scraperApiUrl = `${SCRAPER_API_BASE_URL}?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(
      googleSearchUrl
    )}&render=false&country_code=us&device_type=desktop`;

    const response = await axios.get(scraperApiUrl, {
      timeout: 20000, // Reduced to 20 seconds
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    console.log(`ScraperAPI response status: ${response.status}`);

    if (response.status !== 200) {
      throw new Error(`ScraperAPI returned status ${response.status}`);
    }

    // Parse the HTML response using Cheerio
    const $ = cheerio.load(response.data);

    // Extract price information from Google search results
    const products = [];

    // Look for price information in various parts of the page
    const pageText = $("body").text();

    // Try multiple regex patterns to find prices
    const pricePatterns = [
      /\$(\d+\.?\d*)/g, // Standard dollar prices
      /(\d+\.?\d*)\s*dollars?/gi, // "X dollars"
      /price:?\s*\$?(\d+\.?\d*)/gi, // "Price: $X"
      /(\d+\.?\d*)\s*USD/gi, // "X USD"
    ];

    const foundPrices = [];

    pricePatterns.forEach((pattern) => {
      let match;
      while (
        (match = pattern.exec(pageText)) !== null &&
        foundPrices.length < 10
      ) {
        const priceValue = parseFloat(match[1] || match[0].replace(/\$/, ""));
        if (priceValue > 0 && priceValue < 1000) {
          // Reasonable price range
          foundPrices.push(priceValue);
        }
      }
    });

    // Also look in specific elements that commonly contain prices
    $('.price, .cost, [class*="price"], [class*="cost"]').each(
      (index, element) => {
        const text = $(element).text().trim();
        const priceMatch = text.match(/\$?(\d+\.?\d*)/);
        if (priceMatch && foundPrices.length < 10) {
          const price = parseFloat(priceMatch[1]);
          if (price > 0 && price < 1000) {
            foundPrices.push(price);
          }
        }
      }
    );

    // If we found prices, use the most reasonable one (median price to avoid outliers)
    if (foundPrices.length > 0) {
      foundPrices.sort((a, b) => a - b);
      const medianPrice = foundPrices[Math.floor(foundPrices.length / 2)];

      products.push({
        name: `${itemName} at ${storeName}`,
        price: medianPrice,
        source: "scraperapi",
      });
    }

    console.log(
      `ScraperAPI found ${products.length} products for ${itemName} at ${storeName}`
    );

    if (products.length === 0) {
      console.log(`No ScraperAPI results for ${itemName} at ${storeName}`);
      return null;
    }

    // Find the best match (lowest price)
    const bestProduct = products.reduce((best, current) =>
      current.price < best.price ? current : best
    );

    console.log(
      `✅ ScraperAPI best match: ${bestProduct.name} - $${bestProduct.price}`
    );

    return {
      name: bestProduct.name,
      price: bestProduct.price,
      store: storeName,
      source: "scraperapi",
      rating: null,
      reviews: null,
    };
  } catch (error) {
    console.error(
      `ScraperAPI error for ${itemName} at ${storeName}:`,
      error.message
    );

    // Retry logic for network errors
    if (
      retryCount < 2 &&
      (error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ECONNREFUSED" ||
        error.message.includes("timeout"))
    ) {
      console.log(
        `Retrying ScraperAPI for ${itemName} at ${storeName} in ${
          (retryCount + 1) * 2
        } seconds...`
      );
      await delay((retryCount + 1) * 2000); // Exponential backoff: 2s, 4s
      return searchProductsWithScraperAPI(
        itemName,
        storeName,
        userLocation,
        retryCount + 1
      );
    }

    return null;
  }
}

// Unified price search function with full API priority chain
async function searchPriceWithFallback(itemName, storeName, userLocation) {
  console.log(
    `🔍 Price search for: ${itemName}${storeName ? ` at ${storeName}` : ""}`
  );

  // Step 0: Use mock data if enabled (for testing/development)
  if (USE_MOCK_DATA && mockData) {
    console.log(`🎭 Using mock data for pricing: ${itemName} at ${storeName}`);
    
    // Create simulated price based on item type and store characteristics
    const getSimulatedPrice = (item, store) => {
      // Base prices for common items
      const basePrices = {
        'apple': 1.50,
        'banana': 0.65,
        'ground turkey': 4.50,
        'chicken breast': 3.50,
        'milk': 3.00,
        'bread': 1.25,
        'eggs': 2.25,
        'rice': 2.75
      };
      
      let basePrice = basePrices[item.toLowerCase()] || 2.99; // default price
      
      // Add store-specific pricing variations
      if (store.toLowerCase().includes('whole foods') || store.toLowerCase().includes('fresh market')) {
        basePrice *= 1.4; // Premium stores 40% higher
      } else if (store.toLowerCase().includes('aldi') || store.toLowerCase().includes('walmart')) {
        basePrice *= 0.85; // Discount stores 15% lower
      } else if (store.toLowerCase().includes('target')) {
        basePrice *= 1.1; // Target slightly higher
      }
      
      // Add some randomization to make it realistic
      const variation = (Math.random() - 0.5) * 0.3; // ±15% variation
      basePrice *= (1 + variation);
      
      return Math.round(basePrice * 100) / 100; // Round to 2 decimal places
    };
    
    const simulatedPrice = getSimulatedPrice(itemName, storeName || 'generic');
    
    console.log(`✅ Mock data simulated: $${simulatedPrice} for ${itemName} at ${storeName}`);
    
    return {
      success: true,
      price: simulatedPrice,
      productName: `${itemName.charAt(0).toUpperCase() + itemName.slice(1)} (simulated)`,
      store: storeName,
      source: "mock-simulation",
      rating: null,
      reviews: null
    };
  }

  // Step 1: Try SerpAPI first (preferred method)
  if (SERP_API_KEY && storeName) {
    console.log(`📡 Trying SerpAPI for ${itemName} at ${storeName}`);
    try {
      const serpResult = await searchProductsWithSerpAPI(
        itemName,
        storeName,
        userLocation
      );

      if (serpResult && serpResult.price) {
        console.log(
          `✅ SerpAPI success: $${serpResult.price} for ${itemName} at ${storeName}`
        );
        return {
          success: true,
          price: serpResult.price,
          productName: serpResult.name || itemName,
          store: serpResult.store || storeName,
          source: "serpapi",
          rating: serpResult.rating,
          reviews: serpResult.reviews,
        };
      }
    } catch (error) {
      console.log(
        `⚠️ SerpAPI failed for ${itemName} at ${storeName}: ${error.message}`
      );

      // If SerpAPI quota is exceeded, disable it for this session
      if (
        error.message.includes("run out of searches") ||
        error.message.includes("quota exceeded")
      ) {
        console.log("🚫 SerpAPI quota exceeded - disabling for this session");
        SERP_API_KEY = null; // Disable SerpAPI for this session
      }
    }
  }

  // Step 2: Try Scale Serp API as second option
  if (SCALE_SERP_API_KEY && storeName) {
    console.log(`📡 Trying Scale Serp API for ${itemName} at ${storeName}`);
    try {
      const scaleSerpResult = await searchProductsWithScaleSerp(
        itemName,
        storeName,
        userLocation
      );

      if (scaleSerpResult && scaleSerpResult.price) {
        console.log(
          `✅ Scale Serp success: $${scaleSerpResult.price} for ${itemName} at ${storeName}`
        );
        return {
          success: true,
          price: scaleSerpResult.price,
          productName: scaleSerpResult.name || itemName,
          store: scaleSerpResult.store || storeName,
          source: "scaleserp",
          rating: scaleSerpResult.rating,
          reviews: scaleSerpResult.reviews,
        };
      }
    } catch (error) {
      console.log(
        `⚠️ Scale Serp failed for ${itemName} at ${storeName}: ${error.message}`
      );
    }
  }

  // Step 3: Try ScraperAPI as third option
  if (SCRAPER_API_KEY && storeName) {
    console.log(`📡 Trying ScraperAPI for ${itemName} at ${storeName}`);
    try {
      const scraperApiResult = await searchProductsWithScraperAPI(
        itemName,
        storeName,
        userLocation
      );

      if (scraperApiResult && scraperApiResult.price) {
        console.log(
          `✅ ScraperAPI success: $${scraperApiResult.price} for ${itemName} at ${storeName}`
        );
        return {
          success: true,
          price: scraperApiResult.price,
          productName: scraperApiResult.name || itemName,
          store: scraperApiResult.store || storeName,
          source: "scraperapi",
          rating: scraperApiResult.rating,
          reviews: scraperApiResult.reviews,
        };
      }
    } catch (error) {
      console.log(
        `⚠️ ScraperAPI failed for ${itemName} at ${storeName}: ${error.message}`
      );
    }
  }

  // Step 4: All APIs failed
  console.log(`❌ All APIs failed for ${itemName} at ${storeName}`);
  return {
    success: false,
    error: "No price data available",
    store: storeName || "",
  };
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

    // Note: Mock data will be used for PRICING only, not for store discovery
    // We still want to find real nearby stores using Google Maps API

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
          const priceResult = await searchPriceWithFallback(item, store.name, {
            lat: parseFloat(latitude),
            lng: parseFloat(longitude),
          });

          if (priceResult.success) {
            storeItems.push({
              name: item,
              productName: priceResult.productName || item,
              price:
                typeof priceResult.price === "number"
                  ? priceResult.price
                  : parseFloat(
                      String(priceResult.price || "0").replace(/[^0-9.]/g, "")
                    ),
              lastUpdated: new Date().toISOString(),
              isGenericName: priceResult.productName === item,
              productDetail: priceResult.source,
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
      metadata: {
        searchLocation: {
          lat: parseFloat(latitude),
          lng: parseFloat(longitude),
        },
        timestamp: new Date().toISOString(),
        cacheFor: 30 * 60 * 1000, // 30 minutes in milliseconds
        itemCount: searchItems.length,
        storeCount: storesWithPrices.length,
      },
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

    // Gas station keywords to filter out
    const gasStationKeywords = [
      "shell",
      "exxon",
      "mobil",
      "chevron",
      "bp",
      "conoco",
      "texaco",
      "citgo",
      "sunoco",
      "gulf",
      "marathon",
      "valero",
      "arco",
      "speedway",
      "wawa",
      "sheetz",
      "circle k",
      "pilot",
      "flying j",
      "truck stop",
      "gas station",
      "fuel",
      "petrol",
      "amoco",
      "phillips 66",
      "sinclair",
    ];

    for (const type of types) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&type=${type}&key=${GOOGLE_MAPS_API_KEY}`;

      const response = await axios.get(url);
      const data = response.data;

      if (data.status === "OK" && data.results) {
        data.results.forEach((place) => {
          // Filter out gas stations
          if (place.name) {
            const placeName = place.name.toLowerCase();
            const isGasStation = gasStationKeywords.some((keyword) =>
              placeName.includes(keyword)
            );

            // Also check place types for gas station indicators
            const hasGasStationType =
              place.types &&
              place.types.some(
                (type) =>
                  type.includes("gas_station") ||
                  type.includes("fuel") ||
                  type.includes("petrol")
              );

            if (isGasStation || hasGasStationType) {
              console.log(`🚫 Filtered out gas station: ${place.name}`);
              return; // Skip this place
            }
          }

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

// AI-powered price analysis and summarization endpoint
app.post("/api/ai-summary", async (req, res) => {
  try {
    const { stores, items, userPreferences } = req.body;

    if (!stores || !Array.isArray(stores) || stores.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Stores data is required",
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Items data is required",
      });
    }

    // Prepare data for AI analysis
    const storeData = stores.map(store => ({
      name: store.name || store.store,
      distance: store.distance,
      rating: store.rating,
      items: store.items.filter(item => item.price !== null).map(item => ({
        name: item.name,
        price: item.price,
        productName: item.productName || item.name,
      })),
      totalCost: store.items
        .filter(item => item.price !== null)
        .reduce((sum, item) => sum + (item.price || 0), 0),
    }));

    // Create analysis prompt
    const prompt = `As a grocery shopping expert, analyze this price comparison data and provide helpful insights.

Shopping List: ${items.join(', ')}

Store Price Comparison:
${storeData.map(store => `
${store.name} (${store.distance?.toFixed(1)} miles away, ${store.rating}/5 stars):
${store.items.map(item => `  • ${item.name}: $${item.price?.toFixed(2)} (${item.productName})`).join('\n')}
Total for available items: $${store.totalCost.toFixed(2)}
`).join('\n')}

Please provide:
1. **Best Overall Value**: Which store offers the best total savings
2. **Individual Item Winners**: Best price for each item
3. **Money-Saving Tips**: Specific recommendations for this shopping trip
4. **Store Insights**: Brief analysis of each store's pricing strategy
5. **Smart Shopping Strategy**: How to optimize this shopping trip

Keep the response concise, practical, and focused on actionable insights. Use bullet points and clear formatting.`;

    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      // Return basic analysis without AI if no API key
      const cheapestStore = storeData.reduce((best, current) => 
        current.totalCost < best.totalCost ? current : best
      );

      return res.json({
        success: true,
        summary: {
          bestOverallValue: `${cheapestStore.name} offers the best total value at $${cheapestStore.totalCost.toFixed(2)}`,
          individualWinners: items.map(item => {
            const bestPrice = Math.min(...storeData
              .map(store => store.items.find(i => i.name === item)?.price || Infinity)
              .filter(price => price !== Infinity)
            );
            const bestStore = storeData.find(store => 
              store.items.find(i => i.name === item && i.price === bestPrice)
            );
            return `${item}: $${bestPrice.toFixed(2)} at ${bestStore?.name}`;
          }),
          tips: [
            `Save $${(storeData.reduce((max, store) => Math.max(max, store.totalCost), 0) - cheapestStore.totalCost).toFixed(2)} by shopping at ${cheapestStore.name}`,
            "Compare prices item by item for maximum savings",
            "Consider store distance and gas costs in your total calculation"
          ],
          source: "basic-analysis"
        }
      });
    }

    // Generate AI analysis
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "user",
        content: prompt
      }],
      max_tokens: 800,
      temperature: 0.7,
    });

    const aiInsights = completion.data.choices[0].message.content;

    // Add mock insights if available
    let additionalInsights = {};
    if (USE_MOCK_DATA && mockData && mockData.ai_insights) {
      additionalInsights = {
        generalTips: mockData.ai_insights.general_tips,
        seasonalNotes: items.map(item => 
          mockData.ai_insights.seasonal_notes[item.toLowerCase()] || null
        ).filter(Boolean),
      };
    }

    res.json({
      success: true,
      summary: {
        aiAnalysis: aiInsights,
        insights: additionalInsights,
        timestamp: new Date().toISOString(),
        source: "openai-gpt35"
      }
    });

  } catch (error) {
    console.error("AI Summary error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate AI summary",
      details: error.message
    });
  }
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
