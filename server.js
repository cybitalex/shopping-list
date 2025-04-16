import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import OpenAI from "openai";
import * as cheerio from "cheerio";
import { chromium } from '@playwright/test';
import { scrapeGoogleShopping } from './scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://shopcheeply.duckdns.org']
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Add security headers
app.use((req, res, next) => {
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://shopcheeply.duckdns.org']
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'];
    
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

app.use(express.json());

// Add a new route for Google Shopping results using our scraper
app.get("/api/google-price", async (req, res) => {
  // Set content type explicitly to ensure client sees it as JSON
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const { item, store } = req.query;
    if (!item) {
      return res.status(400).json({ 
        success: false,
        error: "Missing item parameter" 
      });
    }

    console.log(`Using scraper to find price for ${item}${store ? ` at ${store}` : ''}`);
    
    // Use our custom scraper
    const scraperResult = await scrapeGoogleShopping(item, store || '');
    
    if (scraperResult.success) {
      let bestMatch = null;
      
      // If we have multiple items, find the best match
      if (scraperResult.items && scraperResult.items.length > 0) {
        // First try to find a match at the specified store
        if (store) {
          const storeMatches = scraperResult.items.filter(
            product => product.store && product.store.toLowerCase().includes(store.toLowerCase())
          );
          
          if (storeMatches.length > 0) {
            // Sort by distance if available, then by price
            bestMatch = storeMatches.sort((a, b) => {
              // Sort by distance first if available
              if (a.distance && b.distance) {
                const distA = parseFloat((a.distance || '').match(/\d+(\.\d+)?/)?.[0] || '999');
                const distB = parseFloat((b.distance || '').match(/\d+(\.\d+)?/)?.[0] || '999');
                if (distA !== distB) return distA - distB;
              }
              
              // Then by price if available
              if (a.price && b.price) {
                const priceA = parseFloat((a.price || '').replace('$', ''));
                const priceB = parseFloat((b.price || '').replace('$', ''));
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
        const priceStr = bestMatch.price?.replace('$', '') || '0';
        const price = parseFloat(priceStr);
        
        return res.status(200).json({
          success: true,
          price: isNaN(price) ? 0 : price,
          productName: bestMatch.name,
          source: 'google-shopping-scraper',
          store: bestMatch.store || store || '',
          fullStoreName: bestMatch.store,
          url: '', // We don't have a URL from the scraper
          isEstimate: false,
          confidence: 0.9,
          distance: bestMatch.distance,
          returnPolicy: bestMatch.returnsPolicy,
          rating: bestMatch.rating ? parseFloat(bestMatch.rating) : undefined,
          reviewCount: bestMatch.reviewCount,
          method: bestMatch.method
        });
      } else {
        // No best match found, but we had success
        return res.status(200).json({
          success: true,
          price: 0,
          productName: item,
          source: 'google-shopping-scraper',
          store: store || '',
          isEstimate: true,
          confidence: 0.5,
          message: 'No specific product match found'
        });
      }
    } else {
      // Scraper returned an error
      console.error(`Scraper error: ${scraperResult.error}`);
      return res.status(200).json({
        success: false,
        price: null,
        productName: item,
        source: 'google-shopping-scraper',
        store: store || '',
        error: scraperResult.error || 'Failed to scrape price',
        isEstimate: true
      });
    }
  } catch (error) {
    console.error("Error using scraper:", error);
    // In case of error, return fallback price
    const fallbackPrice = getDefaultPriceEstimate(item, store || '');
    return res.status(200).json({
      success: true,
      price: fallbackPrice.price,
      productName: fallbackPrice.productName || item,
      source: 'fallback',
      store: store || '',
      error: error.message,
      isEstimate: true,
      confidence: 0.5
    });
  }
});

// Serve static files from the dist directory in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')));
  console.log('Serving static files from:', join(__dirname, 'dist'));
}

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
// No longer need SERPAPI
// const SERPAPI_KEY = process.env.SERPAPI_KEY;

// Validate required API keys
if (!GOOGLE_MAPS_API_KEY) {
  console.error("Missing required API keys. Please check your .env file.");
  process.exit(1);
}

// Initialize OpenAI
const openai = new OpenAI.OpenAIApi(new OpenAI.Configuration({
  apiKey: process.env.OPENAI_API_KEY,
}));

// Price estimation database
const priceDatabase = {
  // Grocery staples
  milk: { base: 3.99, range: 1.5 },
  bread: { base: 2.99, range: 1.0 },
  eggs: { base: 3.49, range: 1.5 },
  cheese: { base: 4.99, range: 2.0 },
  chicken: { base: 7.99, range: 3.0 },
  "ground beef": { base: 5.99, range: 2.5 },
  rice: { base: 4.99, range: 2.0 },
  pasta: { base: 1.99, range: 1.0 },
  cereal: { base: 4.49, range: 2.0 },
  coffee: { base: 8.99, range: 4.0 },

  // Fruits and vegetables
  apples: { base: 2.99, range: 1.0 },
  bananas: { base: 0.59, range: 0.2 },
  oranges: { base: 3.99, range: 1.5 },
  potatoes: { base: 4.99, range: 2.0 },
  onions: { base: 2.99, range: 1.0 },
  tomatoes: { base: 2.99, range: 1.5 },
  lettuce: { base: 1.99, range: 1.0 },
  carrots: { base: 1.99, range: 0.8 },

  // Pantry items
  sugar: { base: 3.99, range: 1.5 },
  flour: { base: 4.49, range: 2.0 },
  "cooking oil": { base: 5.99, range: 2.5 },
  "canned soup": { base: 1.99, range: 1.0 },
  "peanut butter": { base: 4.99, range: 2.0 },
  jelly: { base: 3.99, range: 1.5 },

  // Beverages
  soda: { base: 5.99, range: 2.0 },
  juice: { base: 3.99, range: 1.5 },
  water: { base: 4.99, range: 2.0 },

  // Snacks
  chips: { base: 3.99, range: 1.5 },
  cookies: { base: 3.99, range: 1.5 },
  crackers: { base: 3.49, range: 1.5 },
};

// Store type price modifiers (percentage adjustment)
const storeModifiers = {
  Walmart: 0.8,
  Target: 0.9,
  "Whole Foods": 1.3,
  "Trader Joe's": 1.1,
  Kroger: 0.9,
  Publix: 1.0,
  "Food Lion": 0.85,
  "Harris Teeter": 1.1,
  default: 1.0,
};

async function estimateItemPrice(item, storeName) {
  try {
    // Normalize item name for lookup
    const normalizedItem = item.toLowerCase().trim();

    // Find closest matching item in database
    const itemMatch = findClosestMatch(
      normalizedItem,
      Object.keys(priceDatabase)
    );

    if (!itemMatch) {
      // If no match found, use a default reasonable range
      return {
        price: 4.99,
        confidence: 0.5,
      };
    }

    const basePrice = priceDatabase[itemMatch].base;
    const priceRange = priceDatabase[itemMatch].range;

    // Get store modifier
    const storeType = findStoreType(storeName);
    const modifier = storeModifiers[storeType] || storeModifiers.default;

    // Calculate final price with store modifier
    const modifiedPrice = basePrice * (1 + modifier / 100);

    // Add some realistic variation
    const variation = (Math.random() * 2 - 1) * (priceRange / 2);
    const finalPrice = Math.max(0.01, modifiedPrice + variation);

    return {
      price: Number(finalPrice.toFixed(2)),
      confidence: 0.8,
    };
  } catch (error) {
    console.error("Error estimating price:", error);
    return {
      price: 4.99,
      confidence: 0.5,
    };
  }
}

function findClosestMatch(input, items) {
  // Simple fuzzy matching
  const normalizedInput = input.toLowerCase();

  // First try exact match
  if (items.includes(normalizedInput)) {
    return normalizedInput;
  }

  // Then try contains
  for (const item of items) {
    if (normalizedInput.includes(item) || item.includes(normalizedInput)) {
      return item;
    }
  }

  // Finally try word matching
  const inputWords = normalizedInput.split(" ");
  for (const item of items) {
    const itemWords = item.split(" ");
    if (inputWords.some((word) => itemWords.includes(word))) {
      return item;
    }
  }

  return null;
}

function findStoreType(storeName) {
  const normalizedName = storeName.toLowerCase();

  for (const [storeType, _] of Object.entries(storeModifiers)) {
    if (normalizedName.includes(storeType.toLowerCase())) {
      return storeType;
    }
  }

  return "default";
}

// Endpoint to find nearby stores
app.get("/api/stores", async (req, res) => {
  try {
    const { latitude, longitude } = req.query;
    if (!latitude || !longitude) {
      return res.status(400).json({ error: "Missing latitude or longitude" });
    }

    console.log("Searching for stores at:", { latitude, longitude });
    const RADIUS_MILES = 40;
    const RADIUS_METERS = Math.round(RADIUS_MILES * 1609.34);

    console.log(
      `Searching within ${RADIUS_MILES} miles (${RADIUS_METERS} meters)`
    );

    // Define store chains to search for - explicitly grocery focused
    const storeChains = [
      "Walmart",
      "Target",
      "Kroger",
      "Publix",
      "Whole Foods",
      "Trader Joe's",
      "Aldi",
      "Food Lion",
      "Harris Teeter",
      "Safeway",
      "Giant",
      "Stop & Shop",
      "Costco",
      "Sam's Club",
      "Wegmans",
      "Dollar General",
      "Family Dollar",
      "Dollar Tree",
      "Save A Lot",
      "Piggly Wiggly",
      "Ingles",
      "Winn-Dixie", 
      "Lidl",
      "IGA",
      "Grocery Outlet",
      "Lowe's Foods",
      "Fresh Market",
      "Sprouts",
      "BJ's Wholesale Club",
      "H-E-B",
      "Meijer",
      "Albertsons",
      "Vons",
      "Ralphs",
      "Fry's",
      "Jewel-Osco",
      "Acme",
      "Market Basket",
      "Hannaford",
      "ShopRite",
      "Price Chopper"
    ];

    // Definitive grocery store keywords for extra validation
    const groceryKeywords = [
      "grocery", "supermarket", "market", "food", "fresh", "farm", 
      "produce", "pantry", "foods", "super", "hypermarket", "mart", 
      "shop", "store", "warehouse", "outlet", "supply", "farmers",
      "organic", "natural", "dollar", "discount", "general", "family"
    ];

    // Keywords to filter out non-grocery stores - be very strict with this
    const nonGroceryKeywords = [
      // Beauty & Personal Care - Strengthen filtering here
      "salon", "hair", "beauty", "barber", "stylist", "spa", "nails", 
      "locs", "braids", "weaves", "extensions", "cosmetics", "makeup",
      "tattoo", "piercing", "lashes", "brow", "facial", "botox", "skin",
      "luscious", "locks", "natural", "haircut", "beautician", "cosmetology",
      "hair studio", "beauty shop", "hair design", "tresses", "mane",
      
      // Health & Medical
      "clinic", "medical", "doctor", "dentist", "dental", "health", "pharmacy",
      "hospital", "urgent", "care", "therapy", "rehab", "wellness", "optical",
      "vision", "chiropractic", "massage", "physical", "physician",
      
      // Services
      "repair", "service", "insurance", "financial", "bank", "loans", "cash",
      "attorney", "lawyer", "legal", "accounting", "tax", "notary", "consulting",
      
      // Retail (non-grocery)
      "clothing", "apparel", "fashion", "shoes", "boutique", "jewelry", 
      "accessories", "electronics", "phone", "computer", "hardware", "toy",
      "game", "book", "music", "instrument", "sporting", "liquor", "beer", "wine",
      "tobacco", "smoke", "vape", "pet", "garden", "home", "furniture", "decor",
      
      // Education & Recreation
      "school", "academy", "training", "education", "university", "college",
      "gym", "fitness", "yoga", "dance", "arts", "crafts", "hobby",
      
      // Food Service (not grocery)
      "restaurant", "cafe", "bakery", "coffee", "bar", "grill", "bbq", "diner",
      "bistro", "pizzeria", "taco", "burger", "sandwich", "sushi", "chinese",
      "mexican", "italian", "asian", "thai", "indian", "seafood", "steakhouse",
      
      // Lodging
      "motel", "hotel", "inn", "suites", "lodge", "resort", "vacation", "rental",
      
      // Real Estate
      "apartment", "realty", "properties", "estate", "homes", "rental", "leasing",
      
      // Entertainment
      "theater", "cinema", "movie", "entertainment", "club", "lounge", "bar",
      
      // Auto & Transportation
      "auto", "car", "vehicle", "tire", "parts", "dealership", "gas", "station",
      "automotive", "motor", "transmission", "oil", "change", "body", "collision",
      
      // Religious & Community
      "church", "chapel", "temple", "mosque", "synagogue", "worship", "ministry",
      "community", "center", "association"
    ];

    let allStores = [];
    const seenPlaceIds = new Set();

    // Search for each store chain
    for (const chain of storeChains) {
      try {
        console.log(`Searching for ${chain}...`);
        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
          chain
        )}&location=${latitude},${longitude}&radius=${RADIUS_METERS}&key=${GOOGLE_MAPS_API_KEY}`;

        console.log(
          "Making request to:",
          url.replace(GOOGLE_MAPS_API_KEY, "REDACTED")
        );

        const response = await axios.get(url);

        console.log("Google API Response Status:", response.data.status);

        if (response.data.status === "ZERO_RESULTS") {
          console.log(`No ${chain} locations found in the area`);
          continue;
        }

        if (
          response.data.status === "OK" &&
          response.data && response.data.results && response.data.results.length > 0
        ) {
          console.log(
            `Found ${response.data.results.length} ${chain} locations`
          );
          for (const place of response.data.results) {
            if (!seenPlaceIds.has(place.place_id)) {
              // Strict filtering for stores by name
              const placeName = place.name.toLowerCase();
              
              // Check if the name is likely a non-grocery business
              const isLikelyNonGrocery = nonGroceryKeywords.some(keyword => 
                placeName.includes(keyword.toLowerCase())
              );
              
              // Skip if it matches any non-grocery keyword
              if (isLikelyNonGrocery) {
                console.log(`Filtering out non-grocery store: ${place.name}`);
                continue;
              }
              
              // Explicit check for "Luscious Locs" and similar
              if (placeName.includes("luscious") || 
                  placeName.includes("loc") ||
                  placeName.includes("hair") ||
                  placeName.includes("salon") ||
                  placeName.includes("beauty")) {
                console.log(`Explicitly filtering out: ${place.name}`);
                continue;
              }
              
              seenPlaceIds.add(place.place_id);
              allStores.push({
                id: place.place_id,
                name: place.name,
                address: place.formatted_address || place.vicinity,
                distance: calculateDistance(
                  parseFloat(latitude),
                  parseFloat(longitude),
                  place.geometry.location.lat,
                  place.geometry.location.lng
                ),
                rating: place.rating,
                latitude: place.geometry.location.lat,
                longitude: place.geometry.location.lng,
                isGroceryStore: true
              });
            }
          }
        } else {
          console.log(`Unexpected response for ${chain}:`, response.data);
          continue;
        }
      } catch (error) {
        console.error(
          `Error searching for ${chain}:`,
          (error.response && error.response.data) || error.message
        );
        continue;
      }

      // Add delay between requests
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Filter out any stores that don't match grocery keywords or match non-grocery keywords
    allStores = allStores.filter(store => {
      const storeName = store.name.toLowerCase();
      
      // Check against non-grocery keywords but with exceptions
      const isLikelyNonGrocery = nonGroceryKeywords.some(keyword => {
        // Skip certain keywords for common grocery stores that might get filtered incorrectly
        if (
          (storeName.includes("dollar") && keyword === "dollar") ||
          (storeName.includes("family dollar") && keyword === "family") ||
          (storeName.includes("food lion") && keyword === "food") ||
          (storeName.includes("walmart") && keyword === "mart") ||
          // Add other exceptions as needed
          (storeName.includes("market") && keyword === "market") ||
          (storeName.includes("grocery") && keyword === "grocery") ||
          (storeName.includes("super") && keyword === "super")
        ) {
          return false;
        }
        return storeName.includes(keyword.toLowerCase());
      });
      
      if (isLikelyNonGrocery) {
        console.log(`Filtering out non-grocery store: ${store.name}`);
        return false;
      }
      
      return true;
    });

    // Filter stores by distance and sort
    const nearbyStores = allStores
      .filter((store) => store.distance <= RADIUS_MILES)
      .sort((a, b) => a.distance - b.distance);
      
    // Log total available stores before slicing
    console.log(`Total available stores before limiting: ${nearbyStores.length}`);
    
    // After filtering with general rules, apply a final explicit filter to ensure test stores are removed
    const finalFilteredStores = nearbyStores.filter(store => {
      const storeName = store.name.toLowerCase();
      
      // Explicitly exclude test stores or non-grocery stores by name
      if (
        storeName.includes("luscious loc") || 
        storeName.includes("salon") ||
        storeName.includes("hair") ||
        storeName.includes("beauty shop") ||
        storeName.includes("spa")
      ) {
        console.log(`Final filter removing: ${store.name}`);
        return false;
      }
      
      return true;
    });

    // Get the top stores after applying all filters
    const topStores = finalFilteredStores.slice(0, 40);

    if (topStores.length === 0) {
      console.error("No stores found in the extended area");
      return res.status(404).json({
        error: `No grocery stores found within ${RADIUS_MILES} miles of your location. The area might be too remote or there might be an issue with the store data.`,
      });
    }

    // Process and filter the results
    const processedStores = topStores
      .filter(
        (store) =>
          store.business_status === "OPERATIONAL" || !store.business_status
      )
      .map((store) => {
        return {
          id: store.id,
          name: store.name,
          address: store.address,
          distance: store.distance,
          rating: store.rating,
          latitude: store.latitude,
          longitude: store.longitude,
        };
      });

    console.log("Found and processed stores:", processedStores.length);

    // Log all store names being returned to client
    console.log("Final stores being returned to client:");
    processedStores.forEach((store, index) => {
      console.log(`${index + 1}. ${store.name} (${store.distance.toFixed(1)} miles)`);
    });

    res.json(processedStores);
  } catch (error) {
    console.error(
      "Error finding stores:",
      (error.response && error.response.data) || error.message
    );
    res.status(500).json({
      error:
        "Failed to find stores. Please check your location settings and try again.",
      details: (error.response && error.response.data) || error.message,
    });
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
          const { price, confidence } = await estimateItemPrice(
            item,
            store.name
          );

          if (price) {
            storeResults.items.push({
              name: item,
              price: price,
              confidence: confidence,
            });
            storeResults.totalPrice += price;
          }
        } catch (error) {
          console.error(
            `Error estimating price for ${item} at ${store.name}:`,
            error
          );
          errors.push(
            `Failed to estimate price for ${item} at ${store.name}: ${error.message}`
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
        error: "Could not estimate prices for any stores",
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

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d * 0.621371; // Convert to miles
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// OpenAI-powered product price extraction
async function extractPriceWithOpenAI(item, store, html) {
  try {
    console.log(`Using OpenAI to extract price for ${item} at ${store}`);
    
    // Only proceed if OPENAI_API_KEY is configured
    if (!process.env.OPENAI_API_KEY) {
      console.log('OpenAI API key not configured, skipping AI extraction');
      return null;
    }
    
    // For OpenAI v3, we don't need dynamic import
    // Clean up HTML to focus on relevant parts and reduce token usage
    const cleanHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 15000); // Limit token usage
    
    const prompt = `You are a specialized AI that extracts product details from HTML. 
          Your task is to find pricing information for a grocery item called "${item}" at "${store}".
          If you can find the information, return a JSON object with these fields:
          - price: the numeric price (e.g., 3.99, not "$3.99")
          - productName: the full product name
          - source: "ai_extraction"
          - confidence: a number from 0-1 representing your confidence

          If multiple prices are found, select the most relevant one for "${item}".
      If no pricing information is found, return { "found": false }
      
      HTML Content:
      ${cleanHtml}`;
    
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: prompt,
      max_tokens: 300,
      temperature: 0.1
    });
    
    const resultText = response.choices[0].text.trim();
    let result;
    try {
      result = JSON.parse(resultText);
    } catch (error) {
      console.error("Failed to parse OpenAI response as JSON:", resultText);
      return null;
    }
    
    if (result.found === false) {
      console.log('OpenAI could not find price information');
      return null;
    }
    
    if (result.price) {
      console.log(`OpenAI extracted price: $${result.price} for ${result.productName || item}`);
      return {
        success: true,
        price: parseFloat(result.price),
        productName: result.productName || item,
        source: 'ai_extraction',
        store: store,
        isEstimate: result.confidence < 0.8,
        confidence: result.confidence
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error using OpenAI for price extraction:', error);
    return null;
  }
}

// Scrape a website for price information as a fallback
async function scrapePriceWithPlaywright(item, store) {
  try {
    console.log(`Attempting to scrape price for ${item} at ${store} with Playwright`);

    // Skip if Playwright isn't available
    let playwright;
    try {
      playwright = await import('playwright');
    } catch (err) {
      console.log('Playwright not available, skipping scraping');
      return null;
    }

    // Construct a search URL for the store's website or use Google
    const searchURL = `https://www.google.com/search?q=${encodeURIComponent(`${item} ${store} price`)}`;
    
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
    
    const page = await context.newPage();
    await page.goto(searchURL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // Add a small delay to ensure content loads
    await page.waitForTimeout(2000);
    
    // Get the HTML content for OpenAI processing
    const content = await page.content();
    
    await browser.close();
    
    // Use OpenAI to extract price information from the HTML
    return await extractPriceWithOpenAI(item, store, content);
  } catch (error) {
    console.error('Error in Playwright scraping:', error);
    return null;
  }
}

// Modified fetch-price route to better handle fallbacks
app.get('/api/fetch-price', async (req, res) => {
  // Set content type explicitly to ensure client sees it as JSON
  res.setHeader('Content-Type', 'application/json');
  
  const { item, store, fallback } = req.query;
  
  if (!item || !store) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: item and store'
    });
  }

  try {
    // If fallback=true is specified, or Playwright is disabled, use fallback prices
    if (fallback === 'true' || process.env.ENABLE_PLAYWRIGHT !== 'true') {
      console.log('Using fallback prices directly for:', item, 'at', store);
      const fallbackPrice = getDefaultPriceEstimate(item, store);
      return res.status(200).json({
        success: true,
        price: fallbackPrice.price,
        productName: fallbackPrice.productName || item,
        source: 'fallback',
        store: store,
        isEstimate: true,
        confidence: 0.5
      });
    }
    
    // Use Google search with Playwright
    const googleResult = await searchGoogleWithPlaywright(item, store);
    
    // Return result regardless of success status
    return res.status(200).json(googleResult);
  } catch (error) {
    console.error('Error fetching price:', error);
    // In case of error, return fallback price instead of error
    const fallbackPrice = getDefaultPriceEstimate(item, store);
    return res.status(200).json({
      success: true,
      price: fallbackPrice.price,
      productName: fallbackPrice.productName || item,
      source: 'fallback',
      store: store,
      error: error.message,
      isEstimate: true,
      confidence: 0.5
    });
  }
});

// Also modify POST requests for consistency
app.post("/api/fetch-price", async (req, res) => {
  // Set content type explicitly to ensure client sees it as JSON
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const { item, store, fallback } = req.body;
    if (!item || !store) {
      return res.status(400).json({ 
        success: false,
        error: "Missing item or store parameter" 
      });
    }

    // If fallback=true is specified, or Playwright is disabled, use fallback prices
    if (fallback === true || process.env.ENABLE_PLAYWRIGHT !== 'true') {
      console.log('Using fallback prices directly for:', item, 'at', store);
      const fallbackPrice = getDefaultPriceEstimate(item, store);
      return res.status(200).json({
        success: true,
        price: fallbackPrice.price,
        productName: fallbackPrice.productName || item,
        source: 'fallback',
        store: store,
        isEstimate: true,
        confidence: 0.5
      });
    }

    // Use Google search with Playwright
    const googleResult = await searchGoogleWithPlaywright(item, store);
    
    // Return result regardless of success status
    return res.status(200).json(googleResult);
  } catch (error) {
    console.error("Error fetching price:", error);
    // In case of error, return fallback price instead of error
    const fallbackPrice = getDefaultPriceEstimate(item, store);
    return res.status(200).json({
      success: true,
      price: fallbackPrice.price,
      productName: fallbackPrice.productName || item,
      source: 'fallback',
      store: store,
      error: error.message,
      isEstimate: true,
      confidence: 0.5
    });
  }
});

async function fetchPriceWithAIAndPlaywright(item, store) {
  console.log(`Attempting to fetch price with AI and Playwright for ${item} at ${store}`);
  try {
    // Configure browser options
    const browser = await chromium.launch({
      headless: true,
    });
    
    const storeConfigs = {
      "Walmart": "https://www.walmart.com/search?q=",
      "Target": "https://www.target.com/s?searchTerm=",
      "Kroger": "https://www.kroger.com/search?query=",
      "Publix": "https://www.publix.com/search?query=",
      "Food Lion": "https://shop.foodlion.com/search?search_term=",
      "Harris Teeter": "https://www.harristeeter.com/search?query=",
      "Dollar General": "https://www.dollargeneral.com/search?q=",
    };

    // Generate a search query using OpenAI
    const searchQuery = await generateSearchQuery(item, store);
    
    // Find the best matching store URL
    let storeUrl = null;
    let storeName = null;
    
    for (const [configStoreName, url] of Object.entries(storeConfigs)) {
      if (store.toLowerCase().includes(configStoreName.toLowerCase())) {
        storeUrl = url;
        storeName = configStoreName;
        break;
      }
    }

    if (!storeUrl) {
      console.log(`No configured URL for ${store}, using default search`);
      storeUrl = `https://www.google.com/search?q=${encodeURIComponent(item)}+${encodeURIComponent(store)}+price`;
      storeName = store;
    }

    const fullUrl = `${storeUrl}${encodeURIComponent(searchQuery)}`;
    console.log(`Navigating to: ${fullUrl}`);

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        geolocation: { latitude: 35.052664, longitude: -78.878358 }, // Default to Fayetteville, NC
        permissions: ['geolocation'],
        locale: 'en-US',
        timezoneId: 'America/New_York',
        httpCredentials: undefined,
        ignoreHTTPSErrors: true
      });
      
      const page = await context.newPage();
      
      // Navigate to the store website
      await page.goto(fullUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
      
      // Wait for page to stabilize
      await page.waitForTimeout(2000);
      
      // Extract product data
      const content = await page.content();
      const $ = cheerio.load(content);
      
      // Try to find price information with common selectors
      const productData = {
        title: $('h1, h2, .product-title, .product-name').first().text().trim() || 
               $('.product-title, .item-title, .product-name').first().text().trim(),
        price: $('.price, .product-price, .actual-price, .current-price').first().text().trim() ||
               $('[data-testid="price"]').first().text().trim(),
        url: page.url()
      };

      // If we couldn't find price information with selectors, grab a broader context
      if (!productData.price) {
        // Take screenshot for AI analysis
        await page.screenshot({ path: 'screenshot.png' });
        
        // Get page text
        const bodyText = await page.evaluate(() => document.body.innerText);
        productData.fullText = bodyText.substring(0, 2000); // Limit text to 2000 chars
      }

      await browser.close();
      
      // Analyze the product data with OpenAI
      const result = await analyzeProductData(productData, item, store);
      return {
        success: !!result.price,
        price: result.price,
        productName: result.productName || item,
        source: 'playwright',
        store: storeName,
        url: productData.url
      };
    } catch (error) {
      console.error(`Error during Playwright navigation: ${error.message}`);
      await browser.close();
      return {
        success: false,
        price: null,
        productName: null,
        source: 'playwright',
        error: `Error during web scraping: ${error.message}`
      };
    }
  } catch (error) {
    console.error(`Error in AI and Playwright price fetching: ${error.message}`);
    return {
      success: false,
      price: null,
      productName: null,
      source: 'playwright',
      error: `Failed to fetch price with AI and Playwright: ${error.message}`
    };
  }
}

async function fetchPriceUsingAI(item, store) {
  console.log(`Attempting to estimate price with AI for ${item} at ${store}`);
  try {
    const prompt = `You are a helpful assistant that provides estimated prices for grocery items at specific stores in the United States. Provide your best estimate based on current market data.
    
What is the current price of ${item} at ${store}? Please respond with a JSON object containing the price as a number and a product name that would typically be found at this store. Format: {"price": number, "productName": "string"}`;
    
    const completion = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: prompt,
      temperature: 0.7,
      max_tokens: 150
    });

    const responseText = completion.choices[0].text.trim();
    
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (error) {
      console.error(`Failed to parse AI response as JSON: ${error.message}`);
      const estimatedPrice = await estimateItemPrice(item, store);
      return {
        success: true,
        price: estimatedPrice.price,
        productName: item,
        source: 'ai',
        confidence: estimatedPrice.confidence
      };
    }

    if (!responseData.price || isNaN(parseFloat(responseData.price))) {
      const estimatedPrice = await estimateItemPrice(item, store);
      return {
        success: true,
        price: estimatedPrice.price,
        productName: responseData.productName || item,
        source: 'ai',
        confidence: estimatedPrice.confidence
      };
    }

    return {
      success: true,
      price: parseFloat(responseData.price),
      productName: responseData.productName || item,
      source: 'ai',
      confidence: 0.7
    };
  } catch (error) {
    console.error(`Error estimating price with AI: ${error.message}`);
    // Fallback to basic estimation if OpenAI fails
    const estimatedPrice = await estimateItemPrice(item, store);
    return {
      success: true,
      price: estimatedPrice.price,
      productName: item,
      source: 'ai',
      confidence: estimatedPrice.confidence
    };
  }
}

async function generateSearchQuery(item, store) {
  try {
    const prompt = `You optimize search queries for finding products on store websites.
    
Create an optimized search query for finding ${item} on the ${store} website. Return only the search query text, nothing else.`;
    
    const completion = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: prompt,
      temperature: 0.3,
      max_tokens: 50
    });

    return completion.choices[0].text.trim();
  } catch (error) {
    console.error(`Error generating search query: ${error.message}`);
    return item; // Fallback to original item
  }
}

async function analyzeProductData(productData, item, store) {
  try {
    let prompt = `You are a helpful assistant that extracts precise product information from web data.\n\n`;
    prompt += `Extract the most relevant price for ${item} from this product data from ${store}:\n\n`;
    
    if (productData.title) prompt += `Title: ${productData.title}\n`;
    if (productData.price) prompt += `Price: ${productData.price}\n`;
    if (productData.fullText) prompt += `Context: ${productData.fullText}\n`;
    if (productData.url) prompt += `URL: ${productData.url}\n`;
    
    prompt += "\nPlease respond with a JSON object containing the price as a number and the product name. Format: {\"price\": number, \"productName\": \"string\"}";

    const completion = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: prompt,
      temperature: 0.3,
      max_tokens: 150
    });

    const responseText = completion.choices[0].text.trim();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch (error) {
      console.log('Failed to parse AI response as JSON:', responseText);
      return {
        price: null,
        productName: productData.title || item
      };
    }

    // Validate price format
    if (!responseData.price || isNaN(parseFloat(responseData.price))) {
      console.log('AI returned invalid price format', responseData);
      return {
        price: null,
        productName: responseData.productName || productData.title || item
      };
    }

    return {
      price: parseFloat(responseData.price),
      productName: responseData.productName || productData.title || item
    };
  } catch (error) {
    console.error(`Error analyzing product data: ${error.message}`);
    
    // Try to extract price with regex if AI fails
    if (productData.price) {
      const priceMatch = productData.price.match(/\$?(\d+(\.\d{1,2})?)/);
      if (priceMatch && priceMatch[1]) {
        return {
          price: parseFloat(priceMatch[1]),
          productName: productData.title || item
        };
      }
    }
    
    return {
      price: null,
      productName: productData.title || item
    };
  }
}

// Function to provide fallback price estimates for common grocery items
function getDefaultPriceEstimate(item, store) {
  // Normalize the item name and store name
  const normalizedItem = item.toLowerCase().trim();
  const normalizedStore = store.toLowerCase().trim();
  
  // Always return a fallback price even for unknown items/stores
  let fallbackPrice = null;
  
  // First, check for exact matches in our database
  // Price estimates for common grocery items
  const commonItems = {
    'apples': {
      default: { price: 2.99, productName: 'Fresh Apples (per lb)' },
      'walmart': { price: 2.67, productName: 'Fresh Gala Apples (per lb)' },
      'kroger': { price: 2.99, productName: 'Organic Honeycrisp Apples (per lb)' },
      'target': { price: 3.19, productName: 'Bag of Apples' },
      'publix': { price: 3.49, productName: 'Premium Apples (per lb)' },
      'food lion': { price: 2.89, productName: 'Red Delicious Apples (4-pack)' },
      'dollar general': { price: 1.95, productName: 'Apple Sauce (16oz)' },
      'trader joes': { price: 3.49, productName: 'Organic Apples (per lb)' },
      'aldi': { price: 2.49, productName: 'Gala Apples (3 lb bag)' },
      'lidl': { price: 2.59, productName: 'Pink Lady Apples (per lb)' },
      'whole foods': { price: 3.99, productName: 'Organic Honeycrisp Apples (per lb)' }
    },
    'bananas': {
      default: { price: 0.59, productName: 'Bananas (per lb)' },
      'walmart': { price: 0.58, productName: 'Fresh Bananas (per lb)' },
      'kroger': { price: 0.69, productName: 'Organic Bananas (per lb)' },
      'target': { price: 0.65, productName: 'Bananas (each)' },
      'publix': { price: 0.79, productName: 'Premium Bananas (per lb)' }
    },
    'milk': {
      default: { price: 3.99, productName: 'Milk (1 gallon)' },
      'walmart': { price: 3.68, productName: 'Great Value 2% Milk (1 gallon)' },
      'kroger': { price: 3.89, productName: 'Kroger 2% Milk (1 gallon)' },
      'target': { price: 4.19, productName: 'Good & Gather 2% Milk (1 gallon)' },
      'publix': { price: 4.29, productName: 'Publix 2% Milk (1 gallon)' },
      'food lion': { price: 3.85, productName: 'Food Lion 2% Milk (1 gallon)' },
      'dollar general': { price: 4.15, productName: 'DG 2% Milk (1 gallon)' }
    },
    'bread': {
      default: { price: 2.79, productName: 'White Bread (20oz loaf)' },
      'walmart': { price: 2.48, productName: 'Great Value White Bread (20oz)' },
      'kroger': { price: 2.29, productName: 'Kroger White Bread (20oz)' },
      'target': { price: 2.99, productName: 'Wonder Bread White (20oz)' }
    },
    'eggs': {
      default: { price: 3.49, productName: 'Eggs (dozen)' },
      'walmart': { price: 3.24, productName: 'Great Value Large White Eggs (dozen)' },
      'kroger': { price: 3.65, productName: 'Kroger Large AA Eggs (dozen)' },
      'target': { price: 3.79, productName: 'Good & Gather Large Eggs (dozen)' }
    },
    'chicken': {
      default: { price: 4.99, productName: 'Chicken Breast (per lb)' },
      'walmart': { price: 4.48, productName: 'Fresh Boneless Skinless Chicken Breast (per lb)' },
      'kroger': { price: 5.19, productName: 'Fresh Boneless Skinless Chicken Breast (per lb)' }
    },
    'ground beef': {
      default: { price: 5.49, productName: 'Ground Beef (per lb)' },
      'walmart': { price: 4.97, productName: 'Great Value 80/20 Ground Beef (per lb)' },
      'kroger': { price: 5.69, productName: 'Kroger 80/20 Ground Beef (per lb)' }
    },
    'rice': {
      default: { price: 3.99, productName: 'White Rice (5 lb bag)' },
      'walmart': { price: 3.68, productName: 'Great Value Long Grain White Rice (5 lb)' },
      'kroger': { price: 4.29, productName: 'Kroger Long Grain White Rice (5 lb)' }
    },
    'pasta': {
      default: { price: 1.49, productName: 'Pasta (16 oz)' },
      'walmart': { price: 1.24, productName: 'Great Value Spaghetti Pasta (16 oz)' },
      'kroger': { price: 1.69, productName: 'Kroger Spaghetti Pasta (16 oz)' }
    },
    'cereal': {
      default: { price: 4.29, productName: 'Breakfast Cereal (18 oz)' },
      'walmart': { price: 3.98, productName: 'Cheerios Cereal (18 oz)' },
      'kroger': { price: 4.19, productName: 'Honey Nut Cheerios (18 oz)' }
    },
    'potatoes': {
      default: { price: 3.99, productName: 'Russet Potatoes (5 lb bag)' },
      'walmart': { price: 3.87, productName: 'Russet Potatoes (5 lb bag)' },
      'kroger': { price: 4.29, productName: 'Russet Potatoes (5 lb bag)' }
    },
    'onions': {
      default: { price: 1.69, productName: 'Yellow Onions (per lb)' },
      'walmart': { price: 1.47, productName: 'Yellow Onions (per lb)' },
      'kroger': { price: 1.79, productName: 'Yellow Onions (per lb)' }
    },
    'carrots': {
      default: { price: 1.49, productName: 'Carrots (1 lb bag)' },
      'walmart': { price: 1.24, productName: 'Whole Carrots (1 lb bag)' },
      'kroger': { price: 1.69, productName: 'Organic Whole Carrots (1 lb bag)' }
    },
    'coffee': {
      default: { price: 8.99, productName: 'Ground Coffee (12 oz)' },
      'walmart': { price: 7.98, productName: 'Folgers Classic Roast Ground Coffee (12 oz)' },
      'kroger': { price: 9.29, productName: 'Folgers Classic Roast Ground Coffee (12 oz)' }
    },
    'sugar': {
      default: { price: 2.99, productName: 'Granulated Sugar (4 lb bag)' },
      'walmart': { price: 2.67, productName: 'Great Value Pure Granulated Sugar (4 lb)' },
      'kroger': { price: 3.19, productName: 'Kroger Granulated Sugar (4 lb)' }
    },
    'flour': {
      default: { price: 2.89, productName: 'All Purpose Flour (5 lb bag)' },
      'walmart': { price: 2.42, productName: 'Great Value All Purpose Flour (5 lb)' },
      'kroger': { price: 3.09, productName: 'Kroger All Purpose Flour (5 lb)' }
    },
    'salt': {
      default: { price: 0.99, productName: 'Table Salt (26 oz)' },
      'walmart': { price: 0.68, productName: 'Great Value Iodized Salt (26 oz)' },
      'kroger': { price: 1.19, productName: 'Kroger Iodized Salt (26 oz)' }
    },
    'pepper': {
      default: { price: 4.49, productName: 'Black Pepper (3 oz)' },
      'walmart': { price: 3.98, productName: 'Great Value Ground Black Pepper (3 oz)' },
      'kroger': { price: 4.69, productName: 'Kroger Ground Black Pepper (3 oz)' }
    },
    'butter': {
      default: { price: 4.99, productName: 'Butter (1 lb)' },
      'walmart': { price: 4.48, productName: 'Great Value Unsalted Butter (1 lb)' },
      'kroger': { price: 5.29, productName: 'Kroger Unsalted Butter (1 lb)' }
    },
    'cheese': {
      default: { price: 4.29, productName: 'Cheddar Cheese (8 oz)' },
      'walmart': { price: 3.97, productName: 'Great Value Mild Cheddar Cheese (8 oz)' },
      'kroger': { price: 4.59, productName: 'Kroger Mild Cheddar Cheese (8 oz)' }
    },
    'yogurt': {
      default: { price: 3.49, productName: 'Greek Yogurt (32 oz)' },
      'walmart': { price: 3.24, productName: 'Great Value Plain Greek Yogurt (32 oz)' },
      'kroger': { price: 3.69, productName: 'Kroger Plain Greek Yogurt (32 oz)' }
    },
    'orange juice': {
      default: { price: 3.99, productName: 'Orange Juice (59 oz)' },
      'walmart': { price: 3.67, productName: 'Great Value 100% Orange Juice (59 oz)' },
      'kroger': { price: 4.19, productName: 'Kroger 100% Orange Juice (59 oz)' }
    },
    'soda': {
      default: { price: 2.29, productName: 'Soda (2 Liter)' },
      'walmart': { price: 1.98, productName: 'Coca-Cola (2 Liter)' },
      'kroger': { price: 2.49, productName: 'Coca-Cola (2 Liter)' }
    },
    'water': {
      default: { price: 3.99, productName: 'Bottled Water (24-pack)' },
      'walmart': { price: 3.68, productName: 'Great Value Purified Water (24-pack)' },
      'kroger': { price: 4.29, productName: 'Kroger Purified Water (24-pack)' }
    },
    'chips': {
      default: { price: 3.49, productName: 'Potato Chips (8 oz)' },
      'walmart': { price: 3.27, productName: 'Lay\'s Classic Potato Chips (8 oz)' },
      'kroger': { price: 3.69, productName: 'Lay\'s Classic Potato Chips (8 oz)' }
    },
    'ice cream': {
      default: { price: 4.99, productName: 'Ice Cream (48 oz)' },
      'walmart': { price: 4.47, productName: 'Great Value Vanilla Ice Cream (48 oz)' },
      'kroger': { price: 5.29, productName: 'Kroger Vanilla Ice Cream (48 oz)' }
    },
    'ground turkey': {
      default: { price: 4.99, productName: 'Ground Turkey (1 lb)' },
      'walmart': { price: 4.74, productName: 'Butterball 85/15 Ground Turkey (1 lb)' },
      'kroger': { price: 5.19, productName: 'Kroger 85/15 Ground Turkey (1 lb)' },
      'target': { price: 5.29, productName: 'Good & Gather Ground Turkey (1 lb)' },
      'publix': { price: 5.49, productName: 'Publix Ground Turkey (1 lb)' },
      'food lion': { price: 5.09, productName: 'Food Lion 85/15 Ground Turkey (1 lb)' },
      'dollar general': { price: 5.15, productName: 'Ground Turkey Roll (1 lb)' },
      'trader joes': { price: 5.49, productName: 'Organic Ground Turkey (1 lb)' },
      'aldi': { price: 4.89, productName: 'Simply Nature Ground Turkey (1 lb)' },
      'lidl': { price: 4.95, productName: 'Lidl Ground Turkey (1 lb)' },
      'whole foods': { price: 7.99, productName: 'Organic Ground Turkey (1 lb)' }
    },
    'peaches': {
      default: { price: 2.99, productName: 'Fresh Peaches (per lb)' },
      'walmart': { price: 2.47, productName: 'Fresh Yellow Peaches (per lb)' },
      'kroger': { price: 3.19, productName: 'Fresh Peaches (per lb)' },
      'food lion': { price: 2.99, productName: 'Yellow Peaches (per lb)' },
      'dollar general': { price: 3.75, productName: 'Canned Peaches (15 oz)' },
    }
  };
  
  // Check if we have an estimate for this exact item
  const itemData = commonItems[normalizedItem];
  if (itemData) {
    // Check if we have a store-specific estimate
    for (const knownStore in itemData) {
      if (normalizedStore.includes(knownStore)) {
        return itemData[knownStore];
      }
    }
    
    // Return the default estimate if no store-specific estimate is found
    fallbackPrice = itemData.default;
  }
  
  // If we couldn't find an exact match, use the general price database
  if (!fallbackPrice) {
    // Try to find similar items
    for (const [itemName, data] of Object.entries(commonItems)) {
      if (normalizedItem.includes(itemName) || itemName.includes(normalizedItem)) {
        // Check if we have a store-specific estimate
        for (const knownStore in data) {
          if (normalizedStore.includes(knownStore)) {
            return data[knownStore];
          }
        }
        
        // Use default if no store-specific match
        fallbackPrice = data.default;
        break;
      }
    }
  }
  
  // If we still don't have a fallback, create a generic one
  if (!fallbackPrice) {
    fallbackPrice = {
      price: calculateGenericPrice(normalizedItem, normalizedStore),
      productName: `${capitalizeFirstLetter(normalizedItem)} (estimated)`
    };
  }
  
  return fallbackPrice;
}

// Helper function to generate prices for unknown items
function calculateGenericPrice(item, store) {
  // Base price between $2-8
  const basePrice = 3 + (item.length % 6);
  
  // Store modifier
  let storeModifier = 1.0;
  
  if (store.includes('dollar') || store.includes('aldi') || store.includes('lidl')) {
    storeModifier = 0.85; // Discount stores
  } else if (store.includes('whole foods') || store.includes('fresh market')) {
    storeModifier = 1.4; // Premium stores
  } else if (store.includes('walmart') || store.includes('target')) {
    storeModifier = 0.9; // Big box stores
  }
  
  // Add small random variation
  const randomVariation = (Math.random() * 0.2) - 0.1;
  
  return parseFloat((basePrice * storeModifier * (1 + randomVariation)).toFixed(2));
}

function capitalizeFirstLetter(string) {
  return string.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

// Serve the frontend for any other routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api/`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`Frontend served at http://localhost:${PORT}/`);
  } else {
    console.log(`Frontend development server should be running at http://localhost:5173/`);
  }
});

// New function to search Google Shopping for prices using Playwright and AI
async function searchGoogleWithPlaywright(item, store) {
  console.log(`Searching Google Shopping for ${item} at ${store} using scraper`);
  
  try {
    // Use our custom scraper
    const scraperResult = await scrapeGoogleShopping(item, store || '');
    
    if (scraperResult.success) {
      let bestMatch = null;
      
      // If we have multiple items, find the best match
      if (scraperResult.items && scraperResult.items.length > 0) {
        // First try to find a match at the specified store
        if (store) {
          const storeMatches = scraperResult.items.filter(
            product => product.store && product.store.toLowerCase().includes(store.toLowerCase())
          );
          
          if (storeMatches.length > 0) {
            // Sort by distance if available, then by price
            bestMatch = storeMatches.sort((a, b) => {
              // Sort by distance first if available
              if (a.distance && b.distance) {
                const distA = parseFloat((a.distance || '').match(/\d+(\.\d+)?/)?.[0] || '999');
                const distB = parseFloat((b.distance || '').match(/\d+(\.\d+)?/)?.[0] || '999');
                if (distA !== distB) return distA - distB;
              }
              
              // Then by price if available
              if (a.price && b.price) {
                const priceA = parseFloat((a.price || '').replace('$', ''));
                const priceB = parseFloat((b.price || '').replace('$', ''));
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
        const priceStr = bestMatch.price?.replace('$', '') || '0';
        const price = parseFloat(priceStr);
        
        return {
          success: true,
          price: isNaN(price) ? 0 : price,
          productName: bestMatch.name,
          source: 'google-shopping-scraper',
          store: bestMatch.store || store || '',
          fullStoreName: bestMatch.store,
          url: '', // We don't have a URL from the scraper
          isEstimate: false,
          confidence: 0.9,
          distance: bestMatch.distance,
          returnPolicy: bestMatch.returnsPolicy,
          rating: bestMatch.rating ? parseFloat(bestMatch.rating) : undefined,
          reviewCount: bestMatch.reviewCount,
          method: bestMatch.method
        };
      } else {
        // No best match found, but we had success
        return {
          success: true,
          price: 0,
          productName: item,
          source: 'google-shopping-scraper',
          store: store || '',
          isEstimate: true,
          confidence: 0.5,
          message: 'No specific product match found'
        };
      }
    } else {
      // Scraper returned an error
      console.error(`Scraper error: ${scraperResult.error}`);
      return getFallbackPriceResponse(item, store || '', scraperResult.error || 'Failed to scrape price');
    }
  } catch (error) {
    console.error("Error using scraper:", error);
    return getFallbackPriceResponse(item, store || '', error.message);
  }
}

// Helper function to return fallback price response
function getFallbackPriceResponse(item, store, errorMessage) {
  console.log(`Using fallback price for ${item} at ${store}. Reason: ${errorMessage}`);
  const fallbackPrice = getDefaultPriceEstimate(item, store);
  
  return {
    success: true,
    price: fallbackPrice.price,
    productName: fallbackPrice.productName || item,
    source: 'fallback',
    store: store,
    error: errorMessage,
    isEstimate: true,
    confidence: 0.5
  };
}

// Add new endpoint for Google search prices
app.get('/api/google-price', async (req, res) => {
  // Set content type explicitly to ensure client sees it as JSON
  res.setHeader('Content-Type', 'application/json');
  
  const { item, store } = req.query;
  
  if (!item || !store) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: item and store'
    });
  }

  try {
    // If Playwright is disabled, return error instead of fallback
    if (process.env.ENABLE_PLAYWRIGHT !== 'true') {
      console.log('Playwright disabled - returning error instead of fallback');
      return res.status(200).json({
        success: false,
        error: 'Playwright is disabled, online price search unavailable',
        store: store
      });
    }
    
    // Only attempt Google search with Playwright once - no fallbacks
    const googleResult = await searchGoogleWithPlaywright(item, store);
    
    // Check if it's a fallback result and return error instead
    if (googleResult.source === 'fallback') {
      return res.status(200).json({
        success: false,
        error: 'Could not find online price',
        store: store
      });
    }
    
    // Return the result only if it's a real online price
    return res.status(200).json(googleResult);
  } catch (error) {
    console.error('Error fetching Google price:', error);
    return res.status(200).json({
      success: false,
      error: 'Failed to fetch price from Google',
      details: error.message
    });
  }
});

// Also add POST endpoint for consistency
app.post('/api/google-price', async (req, res) => {
  // Set content type explicitly to ensure client sees it as JSON
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const { item, store } = req.body;
    
    if (!item || !store) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: item and store'
      });
    }
    
    // If Playwright is disabled, return error instead of fallback
    if (process.env.ENABLE_PLAYWRIGHT !== 'true') {
      console.log('Playwright disabled - returning error instead of fallback');
      return res.status(200).json({
        success: false,
        error: 'Playwright is disabled, online price search unavailable',
        store: store
      });
    }
    
    // Only attempt Google search with Playwright once - no fallbacks
    const googleResult = await searchGoogleWithPlaywright(item, store);
    
    // Check if it's a fallback result and return error instead
    if (googleResult.source === 'fallback') {
      return res.status(200).json({
        success: false,
        error: 'Could not find online price',
        store: store
      });
    }
    
    // Return the result only if it's a real online price
    return res.status(200).json(googleResult);
  } catch (error) {
    console.error('Error fetching Google price:', error);
    return res.status(200).json({
      success: false,
      error: 'Failed to fetch price from Google',
      details: error.message
    });
  }
});

// Global error handler to ensure JSON responses
app.use((err, req, res, next) => {
  console.error('Global error handler caught:', err);
  
  // Set content type explicitly
  res.setHeader('Content-Type', 'application/json');
  
  // Always return JSON, even in case of server errors
  const statusCode = err.statusCode || 500;
  
  if (req.path.includes('/api/')) {
    // For API routes, return JSON with error details
    return res.status(200).json({
      success: false,
      error: err.message || 'Internal server error',
      path: req.path
    });
  }
  
  // For non-API routes, just pass to next error handler
  next(err);
});

// Make sure CORS headers are set for all API responses
app.use('/api/*', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Simple endpoint to test JSON responses
app.get('/api/test', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ success: true, message: 'API is working correctly' });
});

// Add this at the very start of your server.js file, right after your imports
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
  // Don't exit the process, just log the error
});

// Add this function just before searchGoogleWithPlaywright function
// Extract structured data from Google Shopping results
async function extractStructuredData(page, item, store) {
  try {
    console.log('Attempting to extract structured data from Google Shopping results');
    
    // Attempt to extract JSON-LD structured data first (most reliable)
    const jsonLdData = await page.evaluate(() => {
      const jsonScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      const productData = jsonScripts
        .map(script => {
          try {
            return JSON.parse(script.textContent);
          } catch (e) {
            return null;
          }
        })
        .filter(data => data && (data['@type'] === 'Product' || (Array.isArray(data) && data.some(item => item['@type'] === 'Product'))));
      
      return productData.length ? productData[0] : null;
    });
    
    if (jsonLdData) {
      console.log('Found JSON-LD structured data');
      
      // Extract product from JSON-LD
      let product = jsonLdData;
      if (Array.isArray(jsonLdData)) {
        product = jsonLdData.find(item => item['@type'] === 'Product') || jsonLdData[0];
      }
      
      if (product.name && product.offers) {
        const price = typeof product.offers === 'object' ? 
          (product.offers.price || (Array.isArray(product.offers) && product.offers.length > 0 && product.offers[0] && product.offers[0].price)) : null;
          
        if (price) {
          return {
            price: parseFloat(price),
            productName: product.name,
            fullStoreName: product.offers.seller && product.offers.seller.name ? product.offers.seller.name : store,
            returnPolicy: null,
            rating: product.aggregateRating && product.aggregateRating.ratingValue ? product.aggregateRating.ratingValue : null,
            reviewCount: product.aggregateRating && product.aggregateRating.reviewCount ? product.aggregateRating.reviewCount : null,
            availability: product.offers.availability,
            priceWas: null,
            confidence: 0.9
          };
        }
      }
    }
    
    // If JSON-LD failed, try to extract data from common Google Shopping DOM patterns
    return await page.evaluate((searchedItem, searchedStore) => {
      // Helper function to extract price
      const extractPrice = text => {
        const match = text.match(/[\$\£\€]?(\d+(?:\.\d{1,2})?)/);
        return match ? parseFloat(match[1]) : null;
      };
      
      // Try to find Google Shopping product cards
      const productCards = Array.from(document.querySelectorAll('.sh-dgr__grid-result, [data-docid]'));
      
      // Find the most relevant product that matches our search
      const relevantProducts = productCards
        .map(card => {
          try {
            const titleElement = card.querySelector('h3, .BvQan, [role="heading"]');
            const priceElement = card.querySelector('.a8Pemb, [data-sh-or="price"]');
            const storeElement = card.querySelector('.aULzUe, [data-sh-or="seller_name"]');
            const ratingElement = card.querySelector('.QIrs8, [data-sh-or="rating"]');
            
            // Skip if we don't have essential elements
            if (!titleElement || !priceElement) return null;
            
            const title = titleElement.textContent.trim();
            const priceText = priceElement.textContent.trim();
            const storeName = storeElement ? storeElement.textContent.trim() : null;
            
            // Check if this product is likely to be from the store we're searching for
            const isFromStore = storeName && 
              (storeName.toLowerCase().includes(searchedStore.toLowerCase()) || 
               searchedStore.toLowerCase().includes(storeName.toLowerCase()));
            
            // Extract pricing information
            const price = extractPrice(priceText);
            
            // Extract previous price if available (for sale items)
            let priceWasElement = card.querySelector('.T14wmb');
            let priceWas = priceWasElement ? extractPrice(priceWasElement.textContent) : null;
            
            // Extract rating if available
            let rating = null;
            if (ratingElement) {
              const ratingMatch = ratingElement.textContent.match(/(\d+(\.\d+)?)/);
              rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
            }
            
            // Extract review count if available
            const reviewElement = card.querySelector('.QIrs8 + span, [data-sh-or="review_count"]');
            const reviewCount = reviewElement ? reviewElement.textContent.trim() : null;
            
            // Extract availability info if present
            const availabilityElement = card.querySelector('.Dklvde, [data-sh-or="availability"]');
            const availability = availabilityElement ? availabilityElement.textContent.trim() : null;
            
            return {
              productName: title,
              price: price,
              fullStoreName: storeName,
              returnPolicy: null, // Not usually available in card view
              rating: rating,
              reviewCount: reviewCount,
              availability: availability,
              priceWas: priceWas,
              isFromStore: isFromStore,
              relevanceScore: isFromStore ? 2 : 1, // Prefer items from the target store
              element: card
            };
          } catch (err) {
            return null;
          }
        })
        .filter(product => product && product.price);
      
      // Sort by relevance and return the best match
      if (relevantProducts.length > 0) {
        // Sort by whether it's from the store, then by having the item name in the title
        relevantProducts.sort((a, b) => {
          // First prioritize store matches
          if (a.isFromStore && !b.isFromStore) return -1;
          if (!a.isFromStore && b.isFromStore) return 1;
          
          // Then check if product name contains item we're searching for
          const aHasItem = a.productName.toLowerCase().includes(searchedItem.toLowerCase());
          const bHasItem = b.productName.toLowerCase().includes(searchedItem.toLowerCase());
          
          if (aHasItem && !bHasItem) return -1;
          if (!aHasItem && bHasItem) return 1;
          
          // If all else is equal, go with the cheaper option
          return a.price - b.price;
        });
        
        const bestMatch = relevantProducts[0];
        
        return {
          price: bestMatch.price,
          productName: bestMatch.productName,
          fullStoreName: bestMatch.fullStoreName,
          returnPolicy: bestMatch.returnPolicy,
          rating: bestMatch.rating,
          reviewCount: bestMatch.reviewCount,
          availability: bestMatch.availability,
          priceWas: bestMatch.priceWas,
          confidence: bestMatch.isFromStore ? 0.85 : 0.7
        };
      }
      
      return null;
    }, item, store);
    
  } catch (error) {
    console.error('Error extracting structured data:', error.message);
    return null;
  }
}
