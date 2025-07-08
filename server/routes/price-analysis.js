/**
 * Price Analysis API - Hybrid approach using OpenStreetMap + SerpAPI
 * This route handles price analysis using local stores from OpenStreetMap
 * and price data from SerpAPI
 */
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

// SerpAPI configuration
const SERP_API_KEY = process.env.SERP_API_KEY;
const SERP_API_BASE_URL = "https://serpapi.com/search.json";

// OpenStreetMap Nominatim configuration
const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

// Calculate distance between two points using Haversine formula
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

// Find nearby stores using OpenStreetMap Nominatim
async function findNearbyStores(latitude, longitude, radius = 15) {
  try {
    console.log(
      `Searching for grocery stores near (${latitude}, ${longitude}) within ${radius} miles`
    );

    // List of major grocery store chains to search for
    const groceryChains = [
      "Walmart Supercenter",
      "Target",
      "Kroger",
      "Safeway",
      "Albertsons",
      "Publix",
      "Wegmans",
      "Whole Foods Market",
      "Trader Joe's",
      "Aldi",
      "Food Lion",
      "Giant",
      "Giant Eagle",
      "ShopRite",
      "Stop & Shop",
      "ACME",
      "Meijer",
      "HEB",
      "Sprouts",
      "Fresh Market",
      "Harris Teeter",
      "Sam's Club",
      "Costco",
      "BJ's Wholesale Club",
      "Lidl",
      "Save Mart",
      "Food 4 Less",
      "Market Basket",
      "Price Chopper",
    ];

    const stores = [];
    const seenStores = new Set();

    // Search for each grocery chain
    for (const chain of groceryChains) {
      try {
        // Use Nominatim to search for the store chain near the location
        const searchQuery = encodeURIComponent(`${chain}`); // Removed "grocery store" suffix to get more accurate results
        const url = `${NOMINATIM_BASE_URL}/search?q=${searchQuery}&format=json&lat=${latitude}&lon=${longitude}&radius=${
          radius * 1609.34
        }&limit=3&addressdetails=1`;

        const response = await fetch(url, {
          headers: {
            "User-Agent": "ShoppingListApp/1.0",
          },
        });

        if (!response.ok) {
          console.warn(`Failed to search for ${chain}: ${response.status}`);
          continue;
        }

        const results = await response.json();

        for (const result of results) {
          // More strict filtering for actual grocery stores and supermarkets
          const displayName = result.display_name.toLowerCase();
          const chainLower = chain.toLowerCase();

          // Skip if the store name doesn't match the chain we're looking for
          if (!displayName.includes(chainLower)) continue;

          // Skip stores that are clearly not grocery locations
          if (
            displayName.includes("distribution center") ||
            displayName.includes("warehouse") ||
            displayName.includes("corporate") ||
            displayName.includes("office") ||
            displayName.includes("parking") ||
            displayName.includes("former")
          )
            continue;

          // Calculate distance from user location
          const storeLat = parseFloat(result.lat);
          const storeLon = parseFloat(result.lon);
          const distance = calculateDistance(
            latitude,
            longitude,
            storeLat,
            storeLon
          );

          // Only include stores within the radius
          if (distance > radius) continue;

          // Create a unique store ID
          const storeId = `${chain}-${result.place_id}`;
          if (seenStores.has(storeId)) continue;
          seenStores.add(storeId);

          // Extract store name and address
          const addressParts = result.display_name.split(", ");
          let storeName = addressParts[0];

          // Clean up the store name
          if (storeName.toLowerCase().includes(chainLower)) {
            storeName = chain; // Use the official chain name
          }

          const cityState = addressParts.slice(-3, -1).join(", "); // Get city and state

          const store = {
            id: storeId,
            name: storeName,
            address: `${storeName} - ${cityState}`,
            latitude: storeLat,
            longitude: storeLon,
            distance: distance.toFixed(1), // Round to 1 decimal place
            place_id: result.place_id.toString(),
            items: [], // Empty items array for now
          };

          stores.push(store);
        }

        // Add a small delay to be respectful to the Nominatim API
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.warn(`Error searching for ${chain}:`, error);
        continue;
      }
    }

    // Sort by distance
    stores.sort(
      (a, b) =>
        (parseFloat(a.distance) || Infinity) -
        (parseFloat(b.distance) || Infinity)
    );

    console.log(`Found ${stores.length} nearby grocery stores`);
    return stores.slice(0, 10); // Limit to 10 closest stores to improve performance
  } catch (error) {
    console.error("Error finding nearby stores:", error);
    return [];
  }
}

// Search for products using SerpAPI
async function searchProducts(itemName, userLocation) {
  try {
    if (!SERP_API_KEY) {
      throw new Error("SerpAPI key not configured");
    }

    const params = new URLSearchParams({
      api_key: SERP_API_KEY,
      engine: "google_shopping",
      q: itemName,
      location: `${userLocation.lat}, ${userLocation.lng}`,
      ll: `${userLocation.lat}, ${userLocation.lng}`,
      gl: "us",
      hl: "en",
      num: 20,
    });

    const response = await fetch(`${SERP_API_BASE_URL}?${params}`);

    if (!response.ok) {
      throw new Error(`SerpAPI request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.shopping_results) {
      return { success: false, stores: [] };
    }

    // Group results by store
    const storeMap = new Map();

    for (const result of data.shopping_results) {
      const storeName = result.source || "Unknown Store";

      if (!storeMap.has(storeName)) {
        storeMap.set(storeName, {
          name: storeName,
          items: [],
        });
      }

      storeMap.get(storeName).items.push({
        name: result.title,
        price: result.price,
        rating: result.rating,
        reviews: result.reviews,
      });
    }

    return {
      success: true,
      stores: Array.from(storeMap.values()),
    };
  } catch (error) {
    console.error("Error searching products:", error);
    return { success: false, stores: [] };
  }
}

// Main price analysis endpoint
router.post("/analyze", async (req, res) => {
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

    // Step 1: Get real nearby stores from OpenStreetMap
    const nearbyStores = await findNearbyStores(lat, lng, 15);
    console.log(
      `Found ${nearbyStores.length} nearby stores from OpenStreetMap`
    );

    if (nearbyStores.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No nearby stores found. Please try a different location.",
      });
    }

    // Step 2: Create a map of store names for quick lookup
    const storeMap = new Map();
    nearbyStores.forEach((store) => {
      // Store both the full name and common variations
      storeMap.set(store.name.toLowerCase(), store);
      storeMap.set(store.name.toLowerCase().replace(/[^a-z0-9]/g, ""), store);

      // Also store common chain names
      const chainNames = [
        "walmart",
        "target",
        "costco",
        "sams club",
        "kroger",
        "safeway",
        "albertsons",
        "publix",
        "wegmans",
        "whole foods",
        "trader joes",
        "aldi",
        "food lion",
        "giant",
        "giant eagle",
        "shoprite",
        "stop & shop",
        "acme",
        "meijer",
        "heb",
        "sprouts",
        "fresh market",
        "smart & final",
        "winco",
        "save a lot",
      ];
      for (const chain of chainNames) {
        if (store.name.toLowerCase().includes(chain)) {
          storeMap.set(chain, store);
          break;
        }
      }
    });

    // Step 3: Analyze each item
    const analysisItems = [];
    const storeResults = new Map();

    for (const item of items) {
      console.log(`Searching for ${item.name}...`);

      const result = await searchProducts(item.name, { lat, lng });

      if (!result.success || result.stores.length === 0) {
        console.warn(`No results found for ${item.name}`);
        continue;
      }

      const allOptions = [];

      // Process each store result - ONLY if it matches a local store
      for (const storeResult of result.stores) {
        if (storeResult.items.length === 0) continue;

        // Check if this store matches any of our local stores
        let localStore = null;
        const storeNameLower = storeResult.name.toLowerCase();

        // Try exact match first
        if (storeMap.has(storeNameLower)) {
          localStore = storeMap.get(storeNameLower);
        } else {
          // Try partial matches
          for (const [key, store] of storeMap) {
            if (storeNameLower.includes(key) || key.includes(storeNameLower)) {
              localStore = store;
              break;
            }
          }
        }

        // Skip if this store is not local
        if (!localStore) {
          console.log(`Skipping non-local store: ${storeResult.name}`);
          continue;
        }

        // Find the cheapest item at this store
        const cheapestItem = storeResult.items.reduce((min, current) => {
          const currentPrice = parseFloat(current.price.replace(/[^\d.]/g, ""));
          const minPrice = parseFloat(min.price.replace(/[^\d.]/g, ""));
          return currentPrice < minPrice ? current : min;
        });

        allOptions.push({
          store: localStore.name,
          storeDistance: localStore.distance || 0,
          productName: cheapestItem.name,
          price: cheapestItem.price,
          priceValue: parseFloat(cheapestItem.price.replace(/[^\d.]/g, "")),
          address: localStore.address || undefined,
        });

        // Track store results for recommendations
        if (!storeResults.has(localStore.name)) {
          storeResults.set(localStore.name, { items: [], totalCost: 0 });
        }
        const storeData = storeResults.get(localStore.name);
        storeData.items.push(item.name);
        storeData.totalCost += parseFloat(
          cheapestItem.price.replace(/[^\d.]/g, "")
        );
      }

      if (allOptions.length === 0) {
        console.warn(`No local store results found for ${item.name}`);
        continue;
      }

      // Sort by price to find cheapest option
      allOptions.sort((a, b) => a.priceValue - b.priceValue);
      const cheapestOption = allOptions[0];

      analysisItems.push({
        item: item.name,
        cheapestOption,
        allOptions,
      });
    }

    // Step 4: Generate store recommendations from local stores only
    const recommendedStores = [];
    for (const [storeName, storeData] of storeResults) {
      // Get distance from any item that has this store
      let storeDistance = 0;
      for (const item of analysisItems) {
        const option = item.allOptions.find((opt) => opt.store === storeName);
        if (option) {
          storeDistance = option.storeDistance;
          break;
        }
      }

      // Find the local store data
      const localStore = nearbyStores.find((s) => s.name === storeName);

      recommendedStores.push({
        store: storeName,
        distance: storeDistance,
        items: storeData.items,
        totalCost: storeData.totalCost,
        address: localStore?.address || storeName,
      });
    }

    // Sort recommendations by total cost and number of items
    recommendedStores.sort((a, b) => {
      if (a.items.length !== b.items.length) {
        return b.items.length - a.items.length; // More items first
      }
      return a.totalCost - b.totalCost; // Then by cost
    });

    // Calculate total estimated cost from cheapest options
    const totalEstimatedCost = analysisItems.reduce((total, item) => {
      return total + item.cheapestOption.priceValue;
    }, 0);

    return res.json({
      success: true,
      items: analysisItems,
      totalEstimatedCost,
      recommendedStores: recommendedStores.slice(0, 10), // Top 10 recommendations
      nearbyStores: nearbyStores.map((store) => ({
        name: store.name,
        address: store.address,
        distance: store.distance,
        latitude: store.latitude,
        longitude: store.longitude,
      })),
    });
  } catch (error) {
    console.error("Error in price analysis:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

export default router;
