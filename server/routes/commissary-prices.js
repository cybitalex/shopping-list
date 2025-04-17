/**
 * Commissary-specific price lookup API
 * This route handles price lookups for military commissaries
 */
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

// Commissary price database (sample data)
// In a real implementation, this would be connected to an actual database or external API
const commissaryPrices = {
  // Basic groceries with commissary pricing
  "commissary milk": { price: "3.29", source: "commissary" },
  "commissary bread": { price: "1.99", source: "commissary" },
  "commissary eggs": { price: "2.49", source: "commissary" },
  "commissary cheese": { price: "3.99", source: "commissary" },
  "commissary butter": { price: "3.49", source: "commissary" },
  "commissary chicken": { price: "2.99", source: "commissary" },
  "commissary ground beef": { price: "3.79", source: "commissary" },
  "commissary apples": { price: "1.29", source: "commissary" },
  "commissary bananas": { price: "0.59", source: "commissary" },
  "commissary potatoes": { price: "2.99", source: "commissary" },
  "commissary onions": { price: "1.19", source: "commissary" },
  "commissary carrots": { price: "1.49", source: "commissary" },
  "commissary lettuce": { price: "1.79", source: "commissary" },
  "commissary tomatoes": { price: "2.29", source: "commissary" },
  "commissary rice": { price: "2.49", source: "commissary" },
  "commissary pasta": { price: "1.29", source: "commissary" },
  "commissary cereal": { price: "3.49", source: "commissary" },
  "commissary coffee": { price: "6.99", source: "commissary" },
  "commissary sugar": { price: "2.39", source: "commissary" },
  "commissary flour": { price: "2.19", source: "commissary" },
  "commissary toilet paper": { price: "4.99", source: "commissary" },
  "commissary paper towels": { price: "3.99", source: "commissary" },
  "commissary laundry detergent": { price: "8.99", source: "commissary" },
  "commissary dish soap": { price: "2.99", source: "commissary" },
  "commissary shampoo": { price: "3.49", source: "commissary" },
  "commissary toothpaste": { price: "2.29", source: "commissary" },
  "commissary deodorant": { price: "3.29", source: "commissary" },
  "commissary baby food": { price: "1.49", source: "commissary" },
  "commissary diapers": { price: "17.99", source: "commissary" },
  "commissary dog food": { price: "15.99", source: "commissary" },
  "commissary cat food": { price: "12.99", source: "commissary" },
};

// Add a sample store data function to help with getting store information
// This simulates what would normally come from a database or API
const getPopularStores = (latitude, longitude) => {
  // Array of popular stores with realistic locations and prices
  return [
    {
      name: "Walmart Supercenter",
      distance: 2.4,
      latitude: latitude + 0.01,
      longitude: longitude + 0.01,
      items: {
        apples: { price: "3.97", source: "store-database" },
        milk: { price: "3.78", source: "store-database" },
        bread: { price: "2.24", source: "store-database" },
        eggs: { price: "4.16", source: "store-database" },
        chicken: { price: "3.92", source: "store-database" },
      },
    },
    {
      name: "Target",
      distance: 3.1,
      latitude: latitude - 0.01,
      longitude: longitude - 0.005,
      items: {
        apples: { price: "4.49", source: "store-database" },
        milk: { price: "3.99", source: "store-database" },
        bread: { price: "3.19", source: "store-database" },
        eggs: { price: "4.29", source: "store-database" },
        chicken: { price: "4.99", source: "store-database" },
      },
    },
    {
      name: "Safeway",
      distance: 1.9,
      latitude: latitude - 0.005,
      longitude: longitude + 0.008,
      items: {
        apples: { price: "3.49", source: "store-database" },
        milk: { price: "4.29", source: "store-database" },
        bread: { price: "3.49", source: "store-database" },
        eggs: { price: "4.79", source: "store-database" },
        chicken: { price: "5.49", source: "store-database" },
      },
    },
    {
      name: "Costco Wholesale",
      distance: 5.2,
      latitude: latitude + 0.03,
      longitude: longitude - 0.02,
      items: {
        apples: { price: "9.99", source: "store-database" }, // Bulk price for 5lb bag
        milk: { price: "4.99", source: "store-database" }, // Gallon
        bread: { price: "6.99", source: "store-database" }, // 2-pack
        eggs: { price: "9.99", source: "store-database" }, // 5 dozen
        chicken: { price: "24.99", source: "store-database" }, // Family pack
      },
    },
    {
      name: "Whole Foods Market",
      distance: 4.5,
      latitude: latitude - 0.02,
      longitude: longitude + 0.015,
      items: {
        apples: { price: "5.99", source: "store-database" }, // Organic
        milk: { price: "5.49", source: "store-database" }, // Organic
        bread: { price: "4.99", source: "store-database" }, // Organic
        eggs: { price: "6.49", source: "store-database" }, // Cage-free organic
        chicken: { price: "8.99", source: "store-database" }, // Organic free-range
      },
    },
  ];
};

// Handler for commissary price lookup
router.get("/commissary-prices", async (req, res) => {
  try {
    const { storeName, items } = req.query;

    // Validate request
    if (!storeName || !items) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: storeName and items",
      });
    }

    // Parse items if they're in JSON format
    let itemList;
    try {
      itemList = typeof items === "string" ? JSON.parse(items) : items;
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid items format. Expected JSON array.",
      });
    }

    if (!Array.isArray(itemList)) {
      return res.status(400).json({
        success: false,
        error: "Items must be an array",
      });
    }

    console.log(
      `Looking up prices for ${itemList.length} items at ${storeName}`
    );

    // Look up prices for each item in our commissary database
    const prices = {};

    for (const item of itemList) {
      // Check if we have this item in our database
      if (commissaryPrices[item.toLowerCase()]) {
        prices[item] = commissaryPrices[item.toLowerCase()].price;
      } else {
        // Generate a reasonable fallback price if not in database
        // This would be replaced with actual API calls in production
        const basePrice = (Math.random() * 5 + 1).toFixed(2);
        prices[item] = basePrice;
      }
    }

    // Return the price data
    return res.json({
      success: true,
      storeName,
      prices,
      source: "commissary-database",
    });
  } catch (error) {
    console.error("Error in commissary prices API:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// New endpoint to get nearby popular stores
router.get("/nearby-stores", async (req, res) => {
  try {
    const { latitude, longitude, items } = req.query;

    // Validate request
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: latitude and longitude",
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        success: false,
        error: "Invalid coordinates: latitude and longitude must be numbers",
      });
    }

    // Get popular stores from our database
    const stores = getPopularStores(lat, lng);

    // Filter by items if provided
    let filteredStores = stores;
    if (items) {
      let itemList;
      try {
        itemList = typeof items === "string" ? JSON.parse(items) : items;
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: "Invalid items format. Expected JSON array.",
        });
      }

      if (Array.isArray(itemList) && itemList.length > 0) {
        // Only include stores that have all requested items
        filteredStores = stores.filter((store) => {
          return itemList.every(
            (item) => store.items[item.toLowerCase()] !== undefined
          );
        });
      }
    }

    return res.json({
      success: true,
      stores: filteredStores,
    });
  } catch (error) {
    console.error("Error in nearby stores API:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

export default router;
