import type { Store } from "../types/store";
import { searchNearbyStores } from "../utils/googleMaps";
import axios from "axios";

// Add TypeScript declaration for the window property
declare global {
  interface Window {
    __apiFailureCount: number;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export interface ProductUnit {
  type: 'pound' | 'bag' | 'each' | 'ounce' | 'package';
  value: number;
}

export interface Product {
  name: string;
  displayName: string; // Full product name as shown in store
  price: number;
  unit?: ProductUnit;
  storeId: string;
  storeName: string;
  isEstimate: boolean; // Whether the price is estimated or actual
  lastUpdated: Date; // When the price was last verified
  url?: string; // URL to the product page if available
  priceSource?: 'serpapi' | 'playwright' | 'ai'; // Source of the price data
}

// Common units for produce and groceries
const defaultUnits: { [key: string]: ProductUnit } = {
  apples: { type: 'pound', value: 1 },
  bananas: { type: 'pound', value: 1 },
  oranges: { type: 'pound', value: 1 },
  potatoes: { type: 'pound', value: 5 }, // Usually sold in 5lb bags
  onions: { type: 'pound', value: 3 }, // Usually sold in 3lb bags
  tomatoes: { type: 'pound', value: 1 },
  lettuce: { type: 'each', value: 1 },
  carrots: { type: 'pound', value: 1 },
  milk: { type: 'each', value: 1 }, // Gallon
  bread: { type: 'each', value: 1 }, // Loaf
  eggs: { type: 'each', value: 1 }, // Dozen
};

// Store-specific product name patterns
const storeProductPatterns: { [key: string]: { [key: string]: string } } = {
  'Walmart': {
    apples: 'Fresh Gala Apples',
    bananas: 'Fresh Bananas',
    milk: 'Great Value Whole Milk',
    bread: 'Great Value White Bread',
    eggs: 'Great Value Large White Eggs, 12 Count',
    chicken: 'Tyson All Natural Boneless Skinless Chicken Breasts',
    rice: 'Great Value Long Grain Enriched Rice',
    pasta: 'Great Value Spaghetti Pasta',
  },
  'Kroger': {
    apples: 'Gala Apples',
    bananas: 'Bananas',
    milk: 'Kroger Whole Milk',
    bread: 'Kroger White Bread',
    eggs: 'Kroger Grade A Large Eggs',
    chicken: 'Kroger Fresh Boneless Skinless Chicken Breasts',
    rice: 'Kroger Long Grain Rice',
    pasta: 'Kroger Spaghetti',
  },
  'Whole Foods': {
    apples: 'Organic Gala Apples',
    bananas: 'Organic Bananas',
    milk: '365 Organic Whole Milk',
    bread: '365 Organic White Bread',
    eggs: '365 Organic Large Brown Eggs',
    chicken: 'Organic Boneless Skinless Chicken Breasts',
    rice: '365 Organic Long Grain White Rice',
    pasta: '365 Organic Spaghetti',
  },
  'Target': {
    apples: 'Good & Gather Gala Apples',
    bananas: 'Good & Gather Bananas',
    milk: 'Good & Gather Whole Milk',
    bread: 'Good & Gather White Bread',
    eggs: 'Good & Gather Grade A Large Eggs',
    chicken: 'Good & Gather Boneless Skinless Chicken Breasts',
    rice: 'Good & Gather Long Grain Rice',
    pasta: 'Good & Gather Spaghetti',
  },
  'Publix': {
    apples: 'Publix Gala Apples',
    bananas: 'Publix Bananas',
    milk: 'Publix Whole Milk',
    bread: 'Publix White Bread',
    eggs: 'Publix GreenWise Large Eggs',
    chicken: 'Publix GreenWise Boneless Skinless Chicken Breasts',
    rice: 'Publix Long Grain Rice',
    pasta: 'Publix Spaghetti',
  },
  'Safeway': {
    apples: 'Signature SELECT Gala Apples',
    bananas: 'Signature SELECT Bananas',
    milk: 'Lucerne Whole Milk',
    bread: 'Signature SELECT White Bread',
    eggs: 'Lucerne Large Eggs',
    chicken: 'Signature Farms Boneless Skinless Chicken Breasts',
    rice: 'Signature SELECT Long Grain Rice',
    pasta: 'Signature SELECT Spaghetti',
  },
};

// Cache for price fetches to reduce API calls
const priceCache: Record<string, { price: number, timestamp: number, __isEstimate?: boolean }> = {};
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

async function fetchRealPrice(itemName: string, storeName: string): Promise<number | null> {
  const cacheKey = `${itemName}-${storeName}`;
  const now = Date.now();
  
  // Return cached price if still valid
  if (priceCache[cacheKey] && (now - priceCache[cacheKey].timestamp < CACHE_EXPIRY)) {
    return priceCache[cacheKey].price;
  }
  
  // Add a flag to track API failures for this run
  if (!window.__apiFailureCount) {
    window.__apiFailureCount = 0;
  }
  
  // If we've had more than 3 API failures, just use estimates for all products
  if (window.__apiFailureCount > 3) {
    console.warn("Too many API failures, using estimates for all products");
    const price = await estimatePrice(itemName, storeName);
    priceCache[cacheKey] = {
      price,
      timestamp: now,
      __isEstimate: true
    };
    return price;
  }

  try {
    // Use backend service to fetch prices from various sources
    const response = await axios.get(`${API_BASE_URL}/api/fetch-price`, {
      params: {
        item: itemName,
        store: storeName
      },
      timeout: 5000, // 5 second timeout to avoid long waits
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data.success && response.data.price) {
      // Cache the result
      priceCache[cacheKey] = {
        price: response.data.price,
        timestamp: now,
        __isEstimate: false // This is a real price from the API
      };
      // Reset API failure count on success
      window.__apiFailureCount = 0;
      return response.data.price;
    }
    
    // Fall back to estimating price if API failed
    window.__apiFailureCount++;
    const price = await estimatePrice(itemName, storeName);
    priceCache[cacheKey] = {
      price,
      timestamp: now,
      __isEstimate: true
    };
    return price;
  } catch (error) {
    window.__apiFailureCount++;
    console.error(`Error fetching real price for ${itemName} at ${storeName}:`, error);
    const price = await estimatePrice(itemName, storeName);
    priceCache[cacheKey] = {
      price,
      timestamp: now,
      __isEstimate: true
    };
    return price;
  }
}

// More accurate price data based on current national averages
async function estimatePrice(itemName: string, storeName: string): Promise<number> {
  // Use more accurate price data from Google searches
  const priceData: { [key: string]: number } = {
    'apples': 1.99, // per pound
    'bananas': 0.59, // per pound
    'oranges': 1.29, // per pound
    'milk': 3.99, // gallon
    'bread': 2.99, // loaf
    'eggs': 3.29, // dozen
    'chicken': 4.99, // per pound
    'ground beef': 5.99, // per pound
    'rice': 2.29, // per pound
    'pasta': 1.99, // 16 oz
    'cereal': 4.99, // 18 oz
    'potatoes': 0.99, // per pound
    'onions': 1.29, // per pound
    'tomatoes': 2.49, // per pound
    'lettuce': 1.99, // head
    'carrots': 1.49, // per pound
    'cheese': 5.99, // 8 oz
    'yogurt': 1.29, // 6 oz
    'coffee': 9.99, // 12 oz
    'tea': 3.99, // 20 bags
    'sugar': 2.99, // 4 lb
    'flour': 3.49, // 5 lb
    'oil': 4.99, // 48 oz
    'butter': 4.99, // 16 oz
    'peanut butter': 3.99, // 16 oz
    'jelly': 2.99, // 18 oz
    'chips': 4.29, // 8 oz
    'soda': 1.99, // 2 liter
    'juice': 3.49, // 64 oz
    'water': 3.99, // 24 pack
  };
  
  // Store pricing adjustments based on real-world pricing strategies
  const storeModifiers: { [key: string]: number } = {
    'Walmart': 0.85,
    'Target': 0.92,
    'Kroger': 0.95,
    'Publix': 1.02,
    'Safeway': 1.05,
    'Whole Foods': 1.35,
    'Trader Joe\'s': 1.10,
    'Aldi': 0.80,
    'Costco': 0.75,
    'Sam\'s Club': 0.78,
    'Food Lion': 0.90,
    'Harris Teeter': 1.08,
    'Wegmans': 1.00,
    'Giant': 0.98,
    'Albertsons': 1.03,
  };

  // Get the base price or use a default if not found
  const basePrice = priceData[itemName.toLowerCase()] || 2.99;
  
  // Apply store modifier or use default
  const storeModifier = storeModifiers[storeName] || 1.0;
  
  // Add a small random variation to make prices more realistic
  const randomFactor = 0.95 + Math.random() * 0.1; // Random factor between 0.95 and 1.05
  
  // Calculate final price
  const finalPrice = basePrice * storeModifier * randomFactor;
  
  return parseFloat(finalPrice.toFixed(2));
}

export const searchProducts = async (
  itemName: string,
  store: Store
): Promise<Product | null> => {
  try {
    // Get store-specific product name
    const storePatterns = storeProductPatterns[store.name] || {};
    const displayName = storePatterns[itemName.toLowerCase()] || 
      `${store.name} ${itemName.charAt(0).toUpperCase() + itemName.slice(1)}`;

    // Get unit information
    const unit = defaultUnits[itemName.toLowerCase()];

    // First try to fetch actual price from real sources
    let price = null;
    let isEstimate = true;
    let priceSource: 'serpapi' | 'playwright' | 'ai' | undefined;
    
    try {
      // Try to get real price data
      const realPrice = await fetchRealPrice(itemName, store.name);
      if (realPrice !== null) {
        price = realPrice;
        // Check if this is from the API (real data) or our fallback estimate
        const cacheKey = `${itemName}-${store.name}`;
        isEstimate = !priceCache[cacheKey] || priceCache[cacheKey].__isEstimate === true;
        priceSource = isEstimate ? 'ai' : 'serpapi';
      }
    } catch (error) {
      console.error("Error fetching real price:", error);
    }
    
    // If real price failed, use our estimate
    if (price === null) {
      price = await estimatePrice(itemName, store.name);
      isEstimate = true;
      priceSource = 'ai';
    }

    return {
      name: itemName,
      displayName,
      price,
      unit,
      storeId: store.id,
      storeName: store.name,
      isEstimate,
      lastUpdated: new Date(),
      priceSource
    };
  } catch (error) {
    console.error(`Error searching for ${itemName} at ${store.name}:`, error);
    return null;
  }
};

// Batch process products for all stores
export const searchProductsAtStores = async (
  itemName: string,
  stores: Store[]
): Promise<Product[]> => {
  const productPromises = stores.map((store) =>
    searchProducts(itemName, store)
  );
  const products = await Promise.all(productPromises);
  return products.filter((product): product is Product => product !== null);
};
