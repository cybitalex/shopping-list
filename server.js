import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Validate required API keys
if (!GOOGLE_MAPS_API_KEY) {
  console.error("Missing required API keys. Please check your .env file.");
  process.exit(1);
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const RADIUS_MILES = 20;
    const RADIUS_METERS = Math.round(RADIUS_MILES * 1609.34);

    console.log(
      `Searching within ${RADIUS_MILES} miles (${RADIUS_METERS} meters)`
    );

    // Define store chains to search for
    const storeChains = [
      "Food Lion",
      "Harris Teeter",
      "Walmart",
      "Target",
      "Kroger",
      "Publix",
      "Whole Foods",
      "Trader Joe's",
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
          response.data?.results?.length > 0
        ) {
          console.log(
            `Found ${response.data.results.length} ${chain} locations`
          );
          for (const place of response.data.results) {
            if (!seenPlaceIds.has(place.place_id)) {
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
          error.response?.data || error.message
        );
        continue;
      }

      // Add delay between requests
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // If no specific stores found, try a general search
    if (allStores.length === 0) {
      console.log("No specific stores found, trying general search...");
      const searchQueries = [
        "grocery store",
        "supermarket",
        "food store",
        "convenience store",
        "general store",
        "market",
        "food mart",
      ];

      for (const query of searchQueries) {
        try {
          console.log(`Trying general search for: ${query}`);
          const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
            query
          )}&location=${latitude},${longitude}&radius=${RADIUS_METERS}&key=${GOOGLE_MAPS_API_KEY}`;

          console.log(
            "Making request to:",
            url.replace(GOOGLE_MAPS_API_KEY, "REDACTED")
          );

          const response = await axios.get(url);

          console.log("Google API Response Status:", response.data.status);

          if (
            response.data.status === "OK" &&
            response.data?.results?.length > 0
          ) {
            console.log(
              `Found ${response.data.results.length} results for "${query}"`
            );
            for (const place of response.data.results) {
              if (!seenPlaceIds.has(place.place_id)) {
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
                });
              }
            }
            break;
          } else {
            console.log(`No results found for "${query}"`);
            continue;
          }
        } catch (error) {
          console.error(
            `Error in general search for ${query}:`,
            error.response?.data || error.message
          );
          continue;
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    // Filter stores by distance and sort
    const nearbyStores = allStores
      .filter((store) => store.distance <= RADIUS_MILES)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 15);

    if (nearbyStores.length === 0) {
      console.error("No stores found in the extended area");
      return res.status(404).json({
        error: `No stores found within ${RADIUS_MILES} miles of your location. The area might be too remote or there might be an issue with the store data.`,
      });
    }

    // Process and filter the results
    const processedStores = nearbyStores
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
    console.log(
      "Store names and distances:",
      processedStores.map(
        (store) => `${store.name} (${store.distance.toFixed(1)} miles)`
      )
    );

    res.json(processedStores);
  } catch (error) {
    console.error(
      "Error finding stores:",
      error.response?.data || error.message
    );
    res.status(500).json({
      error:
        "Failed to find stores. Please check your location settings and try again.",
      details: error.response?.data || error.message,
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
