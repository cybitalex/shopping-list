import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Tooltip,
  Chip,
  Card,
  CardContent,
  Grid,
  Container,
  Button,
  Switch,
  FormControlLabel,
  LinearProgress,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  ButtonGroup,
  Alert
} from "@mui/material";
import type { Store } from "../types/store";
import { type Product } from "../services/products";
import StarIcon from "@mui/icons-material/Star";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import StorefrontIcon from "@mui/icons-material/Storefront";
import PlaceIcon from "@mui/icons-material/Place";
import ViewListIcon from "@mui/icons-material/ViewList";
import MapIcon from "@mui/icons-material/Map";
import RefreshIcon from "@mui/icons-material/Refresh";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { TableContainer, Table, TableHead, TableBody, TableRow, TableCell } from "@mui/material";

// Get the token from environment variables
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
// Set Mapbox token
mapboxgl.accessToken = MAPBOX_TOKEN || '';

interface StoreComparisonProps {
  items: string[];
  stores: Store[];
  onError: (message: string) => void;
  isLocatingStores: boolean;
  onCheapestStore: (store: Store | null) => void;
  onRequestLocation?: () => void;
  currentLocation?: { lat: number; lng: number } | null;
  selectedStore: Store | null;
  onStoreSelect: (store: Store) => void;
}

interface PriceResult {
  price: number;
  productName: string;
  source: string;
  store: string;
  fullStoreName?: string; // Full store name with additional details
  url: string;
  isEstimate?: boolean;
  returnPolicy?: string; // Return policy information (e.g., "Free 90-day returns")
  rating?: number; // Product rating (e.g., 4.1)
  reviewCount?: number; // Number of reviews (e.g., 1.3K)
  availability?: string; // Availability info (e.g., "Get it today ($17)")
  priceWas?: number; // Original price if on sale
  method?: string; // Added for Google Shopping Scraper
}

interface FetchPriceOnDemandProps {
  item: string;
  store: string;
  onPriceReceived: (result: PriceResult | null) => void;
}

// Global request queue to limit concurrent API calls
const priceRequestQueue: Array<{
  item: string;
  store: string;
  callback: (result: PriceResult | null) => void;
  endpoint?: string;
}> = [];
let isProcessingQueue = false;

// Process the queue one at a time, with a higher limit
const processQueue = async () => {
  if (isProcessingQueue || priceRequestQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  // Create a counter for processed requests
  let processedRequests = 0;
  const MAX_REQUESTS = 30; // Increased from 10 to 30
  
  // Process up to MAX_REQUESTS items from the queue
  while (priceRequestQueue.length > 0 && processedRequests < MAX_REQUESTS) {
  // Take the first request from the queue
  const request = priceRequestQueue.shift();
  if (!request) {
      break;
    }
    
    processedRequests++;
    
    try {
      const endpoint = request.endpoint || 'fetch-price';
      console.log(`Processing queued request for ${request.item} at ${request.store} using ${endpoint}`);
      
      // Create a more robust fetch request with explicit headers
      const fetchOptions = {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        // Setting credentials to 'same-origin' helps with session/cookie issues
        credentials: 'same-origin' as RequestCredentials
      };
      
      // Add a cache buster to prevent browser caching
      const cacheBuster = `&_t=${Date.now()}`;
      const url = `/api/${endpoint}?item=${encodeURIComponent(request.item)}&store=${encodeURIComponent(request.store)}${endpoint === 'fetch-price' ? '&fallback=true' : ''}${cacheBuster}`;
      
      const response = await fetch(url, fetchOptions);
      
      // Even if we get a non-200 response, try to parse it as JSON first
      const text = await response.text();
      
      // First check if it's HTML, and if so, try to extract price directly
      if (text.includes('<!DOCTYPE html>') || text.includes('<html>') || text.includes('<!doctype html>')) {
        console.log(`Received HTML for ${request.item} at ${request.store}, attempting direct extraction`);
        
        // Try to extract price directly from the HTML
        const htmlExtractedPrice = extractPriceFromHTML(text, request.item, request.store);
        
        if (htmlExtractedPrice) {
          console.log(`Successfully extracted price $${htmlExtractedPrice.price} from HTML for ${request.item} at ${request.store}`);
          request.callback(htmlExtractedPrice);
          continue; // Skip to next request
        } else {
          console.log(`HTML extraction failed for ${request.item} at ${request.store}`);
        }
      }
      
      // If it wasn't HTML or extraction failed, try to parse as JSON
      try {
        // Try to parse the response as JSON
        const data = JSON.parse(text);
        
      if (data.success && data.price !== null) {
        request.callback(data);
          continue; // Skip to next request
      } else {
          console.log(`Received unsuccessful response for ${request.item} at ${request.store}:`, data);
        }
      } catch (parseError) {
        console.error(`JSON parse error for ${request.item} at ${request.store}:`, parseError);
        console.error('Response was:', text.substring(0, 150) + '...');
      }
      
      // If we've reached this point, both JSON parsing and HTML extraction failed
      // Try fallback endpoint if we're not already using it
      if (endpoint !== 'fetch-price') {
        try {
          console.log(`Trying fallback endpoint for ${request.item} at ${request.store}`);
          const fallbackUrl = `/api/fetch-price?item=${encodeURIComponent(request.item)}&store=${encodeURIComponent(request.store)}&fallback=true${cacheBuster}`;
          const fallbackResponse = await fetch(fallbackUrl, fetchOptions);
          const fallbackText = await fallbackResponse.text();
          
          // First check if fallback response is HTML and try extraction
          if (fallbackText.includes('<!DOCTYPE html>') || fallbackText.includes('<html>') || fallbackText.includes('<!doctype html>')) {
            const fallbackHtmlPrice = extractPriceFromHTML(fallbackText, request.item, request.store);
            if (fallbackHtmlPrice) {
              console.log(`Successfully extracted price from fallback HTML for ${request.item} at ${request.store}`);
              request.callback(fallbackHtmlPrice);
              continue; // Skip to next request
            }
          }
          
          // Try to parse fallback response as JSON
          try {
            const fallbackData = JSON.parse(fallbackText);
            if (fallbackData.success && fallbackData.price !== null) {
              request.callback(fallbackData);
              continue; // Skip to next request
            }
          } catch (fallbackError) {
            console.error(`Fallback JSON parsing failed for ${request.item} at ${request.store}`);
          }
        } catch (fallbackFetchError) {
          console.error(`Error fetching fallback for ${request.item} at ${request.store}:`, fallbackFetchError);
        }
      }
      
      // As a last resort, use client-side fallback
      console.log(`All extraction methods failed, using client-side fallback for ${request.item} at ${request.store}`);
      const clientFallback = generateFallbackPrice(request.item, request.store);
      request.callback(clientFallback);
  } catch (error) {
    console.error(`Error in queued fetch for ${request.item} at ${request.store}:`, error);
      // Use client-side fallback as last resort
      const clientFallback = generateFallbackPrice(request.item, request.store);
      request.callback(clientFallback);
  } finally {
      // If we've reached our limit, clear the queue to prevent more requests
      if (processedRequests >= MAX_REQUESTS && priceRequestQueue.length > 0) {
        console.log(`Reached maximum of ${MAX_REQUESTS} requests, clearing ${priceRequestQueue.length} remaining items`);
        priceRequestQueue.length = 0;
      }
    }
    
    // Add a delay between requests
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
    isProcessingQueue = false;
    
  // If there are more items in the queue, process them after a delay
  if (priceRequestQueue.length > 0) {
    setTimeout(() => {
      processQueue();
    }, 500);
  }
};

const FetchPriceOnDemand: React.FC<FetchPriceOnDemandProps> = ({ item, store, onPriceReceived }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const requestId = useRef(`${item}-${store}-${Math.random()}`);
  
  useEffect(() => {
    const fetchPrice = () => {
      setIsLoading(true);
      setHasError(false);
      
      // Use the Google Shopping scraper endpoint directly
      const endpoint = 'google-price';
      console.log(`Queueing price fetch for ${item} at ${store} using ${endpoint} (Google Shopping Scraper)`);
      
      // Add to queue 
      priceRequestQueue.push({
        item,
        store,
        callback: (result) => {
          if (result) {
            onPriceReceived(result);
            setIsLoading(false);
          } else {
            // Try fallback endpoint if scraper failed
            console.log(`Falling back to estimate price for ${item} at ${store}`);
            priceRequestQueue.push({
              item,
              store,
              endpoint: 'fetch-price',
              callback: (fallbackResult) => {
                if (fallbackResult) {
                  onPriceReceived(fallbackResult);
                } else {
                  onPriceReceived(null);
          }
          setIsLoading(false);
              }
            });
            // Process the fallback request
              processQueue();
          }
        },
        endpoint
      });
      
      // Start processing the queue
        processQueue();
    };
    
      fetchPrice();
    
    // Cleanup function
    return () => {
      // Remove any pending requests for this component
      const index = priceRequestQueue.findIndex(request => 
        request.item === item && request.store === store);
      if (index >= 0) {
        priceRequestQueue.splice(index, 1);
      }
    };
  }, [item, store]);

    return (
    <Box sx={{ minHeight: 30, display: 'flex', alignItems: 'center' }}>
      {isLoading ? (
        <CircularProgress size={16} sx={{ mr: 1 }} />
      ) : hasError ? (
        <Tooltip title="Error fetching price">
          <Chip
            size="small"
            label="Error"
            color="error"
            variant="outlined"
          />
        </Tooltip>
      ) : null}
      </Box>
    );
};

// Add a client-side fallback price generator
const generateFallbackPrice = (item: string, store: string): PriceResult => {
  // Basic price map for common items
  const baseItemPrices: Record<string, number> = {
    'apples': 1.99,
    'bananas': 0.59,
    'milk': 3.49,
    'eggs': 2.99,
    'bread': 2.49,
    'chicken': 5.99,
    'rice': 3.29,
    'pasta': 1.79,
    'potatoes': 3.99,
    'onions': 0.99,
    'tomatoes': 2.49,
    'lettuce': 1.99,
    'carrots': 1.49,
    'oranges': 3.99,
    'pears': 2.99,
    'grapes': 3.99,
    'strawberries': 4.99,
    'blueberries': 4.49,
    'broccoli': 1.99,
    'cereal': 3.99,
    'coffee': 7.99,
    'tea': 3.29,
    'flour': 2.99,
    'sugar': 2.79,
    'salt': 0.99,
  };
  
  // Store price modifiers (e.g., Walmart tends to be cheaper)
  const storeModifiers: Record<string, number> = {
    'Walmart': 0.9,
    'Target': 1.05,
    'Kroger': 0.95,
    'Publix': 1.15,
    'ALDI': 0.85,
    'Whole Foods': 1.35,
    'Trader Joe\'s': 1.1,
    'Dollar General': 0.95,
    'Dollar Tree': 0.8,
    'Food Lion': 1.0,
    'Harris Teeter': 1.1,
    'Giant': 1.05,
    'Safeway': 1.1,
    'Meijer': 0.95,
    'Save-A-Lot': 0.9,
    'H-E-B': 0.95
  };
  
  // Default values if not found in our maps
  const basePrice = baseItemPrices[item.toLowerCase()] || 2.99;
  const storeModifier = storeModifiers[store] || 1.0;
  
  // Apply some randomness to make it look realistic
  const randomFactor = 0.9 + (Math.random() * 0.2); // Between 0.9 and 1.1
  
  // Calculate final price
  const price = Math.round((basePrice * storeModifier * randomFactor) * 100) / 100;
  
  return {
    success: true,
    price,
    productName: item,
    source: 'client-fallback',
    store,
    isEstimate: true,
    confidence: 0.4
  } as unknown as PriceResult;
};

// Function to extract price data from HTML response - enhanced version
const extractPriceFromHTML = (html: string, item: string, store: string): PriceResult | null => {
  try {
    console.log(`Attempting to extract price for ${item} at ${store} from HTML`);
    
    // Convert to lowercase for easier matching
    const lowerHtml = html.toLowerCase();
    const lowerItem = item.toLowerCase();
    
    // Better price regex patterns
    const pricePatterns = [
      // Standard price format with dollar sign
      /\$\s*(\d+(?:\.\d{1,2})?)/g,
      // Price without dollar sign but with decimal
      /(\d+\.\d{2})\s*(?:usd|dollars|each|per|lb|pound|kg|price)/g,
      // Price with HTML formatting (common in structured data)
      /<(?:span|div)[^>]*?>\$?\s*(\d+\.\d{2})<\/(?:span|div)>/g
    ];
    
    const prices: number[] = [];
    const priceContexts: string[] = [];
    
    // Look for the item name in the HTML
    const itemMatches = [];
    let match;
    let regex = new RegExp(`(\\w*${lowerItem}\\w*)`, 'g');
    while ((match = regex.exec(lowerHtml)) !== null) {
      itemMatches.push({
        word: match[0],
        index: match.index
      });
    }
    
    // Extract prices using multiple patterns
    for (const pattern of pricePatterns) {
      while ((match = pattern.exec(lowerHtml)) !== null) {
        const price = parseFloat(match[1]);
        if (!isNaN(price) && price > 0 && price < 100) { 
          // Get context around price (to match with product)
          const contextStart = Math.max(0, match.index - 100);
          const contextEnd = Math.min(lowerHtml.length, match.index + match[0].length + 100);
          const context = lowerHtml.substring(contextStart, contextEnd);
          
          prices.push(price);
          priceContexts.push(context);
        }
      }
    }
    
    if (prices.length === 0) {
      console.log('No prices found in HTML');
      return null;
    }
    
    // Find the price most likely associated with our item
    const itemPrices: Array<{price: number, score: number, context: string}> = [];
    
    // Score each price by its proximity to item mentions
    for (let i = 0; i < prices.length; i++) {
      let bestScore = 0;
      
      // Check each item mention
      for (const {word, index} of itemMatches) {
        // Find position of this price in the HTML
        const priceIndex = lowerHtml.indexOf(priceContexts[i]);
        
        // Calculate distance between item mention and price
        const distance = Math.abs(index - priceIndex);
        
        // Score inversely proportional to distance (closer = higher score)
        // Also adjust score by how closely the word matches our item
        const wordMatchQuality = word.length / lowerItem.length; // 1.0 = perfect match
        const distanceScore = 1000 / (distance + 10); // Avoid division by zero
        
        const score = distanceScore * wordMatchQuality;
        bestScore = Math.max(bestScore, score);
      }
      
      // If we have no item matches, use a generic scoring approach
      if (itemMatches.length === 0) {
        // Use regular fallback estimate to score
        const fallbackEstimate = generateFallbackPrice(item, store);
        const priceDiff = Math.abs(prices[i] - fallbackEstimate.price);
        bestScore = 100 / (priceDiff + 1); // Higher score for prices closer to our estimate
      }
      
      itemPrices.push({
        price: prices[i],
        score: bestScore,
        context: priceContexts[i]
      });
    }
    
    // Sort by score (highest first)
    itemPrices.sort((a, b) => b.score - a.score);
    
    // Check if our best match has a good enough score
    if (itemPrices.length === 0 || itemPrices[0].score < 0.5) {
      console.log('No strong price matches found in HTML');
      return null;
    }
    
    const bestMatch = itemPrices[0];
    let productName = item;
    
    // Try to extract product name from the context of the best price
    const context = bestMatch.context;
    const lines = context.split(/[\n\r<>]/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > lowerItem.length && 
          trimmed.toLowerCase().includes(lowerItem) && 
          trimmed.length < 100) {
        productName = trimmed;
        break;
      }
    }
    
    // Set confidence based on score
    const confidence = Math.min(0.9, bestMatch.score / 10);
    
    console.log(`Found price $${bestMatch.price} for ${item} (confidence: ${confidence.toFixed(2)})`);
    
    return {
      success: true,
      price: bestMatch.price,
      productName: productName,
      source: 'html-extracted',
      store: store,
      isEstimate: false, // Changed from true to false since this is an actual extracted price
      confidence: confidence
    } as unknown as PriceResult;
  } catch (error) {
    console.error('Error extracting price from HTML:', error);
    return null;
  }
};

// Add a utility function to determine if a store is a grocery/retail store
const isGroceryOrRetailStore = (storeName: string): boolean => {
  // List of known restaurant/fast food chains to exclude
  const nonGroceryStores = [
    'McDonald\'s', 'mcdonalds', 'Burger King', 'Wendy\'s', 'KFC', 'Taco Bell',
    'Subway', 'Chipotle', 'Starbucks', 'Dunkin', 'Pizza Hut', 'Domino\'s',
    'Panera Bread', 'Arby\'s', 'Chick-fil-A', 'Popeyes', 'Five Guys',
    'In-N-Out', 'Jimmy John\'s', 'Panda Express', 'Applebee\'s', 'Olive Garden',
    'IHOP', 'Denny\'s', 'Red Lobster', 'TGI Friday\'s', 'Outback', 'Restaurant',
    'Coffee', 'Cafe', 'Diner', 'Bar & Grill', 'Steakhouse', 'Brewery', 'Tavern'
  ];
  
  // List of grocery stores, warehouse clubs, and retail stores with groceries
  const groceryStores = [
    // Warehouse clubs and superstores
    'Walmart', 'Wal-Mart', 'Walmart Supercenter', 'Walmart Neighborhood Market',
    'Sam\'s Club', 'Sam\'s', 'Sams', 'Sams Club', 'BJ\'s', 'BJs', 'BJ\'s Wholesale', 
    'Costco', 'Costco Wholesale',
    
    // Target and other general merchandise retailers with groceries
    'Target', 'SuperTarget', 'Target Express', 'Kmart', 'Big Lots', 'Meijer',
    
    // Military commissaries and exchanges
    'Commissary', 'Military Commissary', 'Army Commissary', 'Navy Commissary', 
    'Air Force Commissary', 'Marine Commissary', 'Coast Guard Commissary', 'AAFES',
    'NEX', 'MCX', 'CGX', 'Exchange', 'PX', 'BX',
    
    // Major grocery chains
    'Kroger', 'Safeway', 'Publix', 'ALDI', 'Whole Foods', 'Albertsons',
    'Trader Joe\'s', 'Food Lion', 'Harris Teeter', 'Giant', 'Wegmans',
    'Save-A-Lot', 'H-E-B', 'HEB', 'ShopRite', 'Shop Rite', 'Winn-Dixie', 'WinnDixie',
    'Vons', 'Piggly Wiggly', 'IGA', 'Hy-Vee', 'HyVee', 'Acme', 'Stop & Shop', 
    'Stop and Shop', 'Giant Eagle', 'Food 4 Less', 'Ralphs', 'Food Lion', 
    'Sprouts', 'Fresh Market', 'Hannaford', 'Market Basket', 'Weis', 
    'Food Town', 'Foodtown', 'King Soopers', 'Fry\'s', 'Dillons', 'QFC',
    'Smith\'s', 'Baker\'s', 'Fred Meyer', 'Jewel-Osco', 'Jewel', 'Osco',
    
    // Discount retailers with groceries
    'Dollar General', 'Dollar Tree', 'Family Dollar', 'Lidl', 'Aldi',
    '99 Cents Only', 'Five Below',
    
    // Pharmacy/convenience stores with groceries
    'CVS', 'Walgreens', 'Rite Aid', '7-Eleven', 'Circle K', 'Wawa',
    'Cumberland Farms', 'QuikTrip', 'Sheetz', 'Casey\'s', 'Royal Farms',
    
    // Regional and specialty grocers
    'Market', 'Supermarket', 'Grocery', 'Foods', 'Food', 'Grocer', 'Fresh',
    'Farmers Market', 'Co-op', 'Mercado', 'Supermercado', 'Carniceria',
    'Oriental', 'Asian', 'Italian', 'Mexican', 'International', 'Ethnic'
  ];
  
  // Convert store name to lowercase for matching
  const lowerStoreName = storeName.toLowerCase();
  
  // First check explicit grocery/retail store names
  for (const grocery of groceryStores) {
    // Full name match or contains the store name as a key part
    if (lowerStoreName.includes(grocery.toLowerCase())) {
      return true;
    }
  }
  
  // Check for general keywords that indicate grocery stores
  const groceryKeywords = ['grocery', 'supermarket', 'market', 'food', 'fresh', 'farm'];
  for (const keyword of groceryKeywords) {
    if (lowerStoreName.includes(keyword)) {
      return true;
    }
  }
  
  // Finally, check against the exclusion list
  for (const nonGrocery of nonGroceryStores) {
    if (lowerStoreName.includes(nonGrocery.toLowerCase())) {
      return false;
    }
  }
  
  // By default, include the store unless it's explicitly excluded
  return true;
};

// Group similar stores together to avoid duplicates but preserve complete store names for certain chains
const groupSimilarStores = (stores: Store[]): Store[] => {
  // Stores that should be grouped but have their full names preserved
  const preserveFullNamePrefixes = [
    'Walmart', 'Target', 'BJ\'s', 'Sam\'s', 'Costco', 'Kroger', 'Publix', 
    'Commissary', 'Military', 'AAFES', 'NEX', 'MCX', 'CGX', 'Exchange'
  ];
  
  const storeGroups: Record<string, Store[]> = {};
  
  // First pass: group stores by their base name
  for (const store of stores) {
    // Create normalized name for grouping
    let groupKey: string;
    
    // Check if this store should preserve its full name
    const shouldPreserveFullName = preserveFullNamePrefixes.some(prefix => 
      store.name.toLowerCase().startsWith(prefix.toLowerCase())
    );
    
    if (shouldPreserveFullName) {
      // Keep the full store name for certain chains (Walmart Supercenter, etc.)
      groupKey = store.name.toLowerCase();
    } else {
      // For other stores, use just the first word as the key for grouping
      const storeWords = store.name.split(/\s+/);
      groupKey = storeWords[0].trim().toLowerCase();
      
      // Special case for chains with multiple words in their primary name
      if (storeWords.length > 1) {
        const firstTwoWords = `${storeWords[0]} ${storeWords[1]}`.toLowerCase();
        // Check for common two-word store names
        if (firstTwoWords.includes('dollar general') || 
            firstTwoWords.includes('family dollar') || 
            firstTwoWords.includes('food lion') ||
            firstTwoWords.includes('whole foods')) {
          groupKey = firstTwoWords;
        }
      }
    }
    
    if (!storeGroups[groupKey]) {
      storeGroups[groupKey] = [];
    }
    storeGroups[groupKey].push(store);
  }
  
  // Second pass: sort each group by distance and return the closest one from each group
  const result: Store[] = [];
  
  for (const storeList of Object.values(storeGroups)) {
    // Sort by distance (closest first)
    storeList.sort((a, b) => a.distance - b.distance);
    
    // Add the closest store from each group with its full name preserved
    if (storeList.length > 0) {
      result.push(storeList[0]);
    }
  }
  
  return result;
};

// Function to check if a store is a military commissary
const isMilitaryCommissary = (storeName: string): boolean => {
  const commissaryKeywords = [
    'commissary', 'aafes', 'nex', 'mcx', 'cgx', 'exchange', 'military'
  ];
  
  return commissaryKeywords.some(keyword => 
    storeName.toLowerCase().includes(keyword)
  );
};

// Add this after the processQueue function
const batchProcessPrices = async (items: string[], stores: Store[]): Promise<Map<string, Map<string, PriceResult>>> => {
  console.log(`Starting batch price processing for ${items.length} items at ${stores.length} stores`);
  const results = new Map<string, Map<string, PriceResult>>();
  
  // Initialize the results map
  for (const item of items) {
    results.set(item, new Map<string, PriceResult>());
  }
  
  // First try to get prices for all items at once using currentLocation
  const currentLocationPrices = await Promise.all(
    items.map(async (item) => {
      try {
        const response = await fetch(`/api/google-price?item=${encodeURIComponent(item)}`);
        if (!response.ok) throw new Error(`Network error: ${response.status}`);
        
        const data = await response.json();
        if (data.success && data.stores) {
          console.log(`Found ${data.stores.length} stores for ${item} with Google Shopping Scraper`);
          
          // Process each store's results
          for (const storeData of data.stores) {
            const storeName = storeData.name;
            
            // Get the first (usually cheapest) item for this store
            if (storeData.items && storeData.items.length > 0) {
              const itemData = storeData.items[0];
              
              // Extract price as number
              const priceText = itemData.price || "0";
              const price = parseFloat(priceText.replace('$', '')) || 0;
              
              // Create result object
              const result: PriceResult = {
                price,
                productName: itemData.name || item,
                source: 'google-shopping-scraper',
                store: storeName,
                fullStoreName: storeName,
                url: '',
                isEstimate: false,
                returnPolicy: itemData.returnsPolicy,
                rating: itemData.rating ? parseFloat(itemData.rating) : undefined,
                reviewCount: itemData.reviewCount ? parseInt(itemData.reviewCount.replace(/[^0-9]/g, '')) : undefined,
                method: itemData.method
              };
              
              // Save to our results map
              const itemMap = results.get(item);
              if (itemMap) {
                itemMap.set(storeName, result);
              }
            }
          }
          
          return { item, success: true };
        }
        
        return { item, success: false };
      } catch (error) {
        console.error(`Error batch processing ${item}:`, error);
        return { item, success: false };
      }
    })
  );
  
  // For any items that didn't get results, try individual store queries
  const failedItems = currentLocationPrices
    .filter(result => !result.success)
    .map(result => result.item);
  
  if (failedItems.length > 0) {
    console.log(`Fetching individual store prices for ${failedItems.length} items that failed batch processing`);
    
    // Process 3 items at a time to avoid overloading
    const chunks = [];
    for (let i = 0; i < failedItems.length; i += 3) {
      chunks.push(failedItems.slice(i, i + 3));
    }
    
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (item) => {
          const itemPromises = stores.map(async (store) => {
            try {
              const response = await fetch(`/api/google-price?item=${encodeURIComponent(item)}&store=${encodeURIComponent(store.name)}`);
              if (!response.ok) return null;
              
              const data = await response.json();
              if (data.success && data.price) {
                const result: PriceResult = {
                  price: data.price,
                  productName: data.productName || item,
                  source: data.source,
                  store: store.name,
                  fullStoreName: data.fullStoreName || store.name,
                  url: data.url || '',
                  isEstimate: !!data.isEstimate,
                  returnPolicy: data.returnPolicy,
                  rating: data.rating,
                  reviewCount: data.reviewCount
                };
                
                const itemMap = results.get(item);
                if (itemMap) {
                  itemMap.set(store.name, result);
                }
              }
            } catch (error) {
              console.error(`Error fetching price for ${item} at ${store.name}:`, error);
              // Use fallback pricing as last resort
              const fallback = generateFallbackPrice(item, store.name);
              const itemMap = results.get(item);
              if (itemMap && !itemMap.has(store.name)) {
                itemMap.set(store.name, fallback);
              }
            }
          });
          
          await Promise.all(itemPromises);
        })
      );
      
      // Add a small delay between chunks
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
};

// Add this function to find the cheapest store based on batch results
const findCheapestStoreFromBatch = (
  priceResults: Map<string, Map<string, PriceResult>>,
  stores: Store[]
): { store: Store | null; totalPrice: number; savings: Record<string, number> } => {
  // Track total prices for each store
  const storeTotals: Record<string, number> = {};
  const itemsFoundAtStore: Record<string, number> = {};
  
  // Initialize tracking for each store
  for (const store of stores) {
    storeTotals[store.name] = 0;
    itemsFoundAtStore[store.name] = 0;
  }
  
  // Calculate total price for each store
  const itemCount = priceResults.size;
  for (const [item, storeMap] of priceResults.entries()) {
    for (const [storeName, result] of storeMap.entries()) {
      if (storeTotals[storeName] !== undefined) {
        storeTotals[storeName] += result.price;
        itemsFoundAtStore[storeName]++;
      }
    }
  }
  
  // Find the store with the lowest total that has prices for all items
  let cheapestStore: Store | null = null;
  let lowestTotal = Infinity;
  
  for (const store of stores) {
    // Only consider stores that have prices for all items
    if (itemsFoundAtStore[store.name] === itemCount) {
      if (storeTotals[store.name] < lowestTotal) {
        lowestTotal = storeTotals[store.name];
        cheapestStore = store;
      }
    }
  }
  
  // Calculate potential savings at cheapest store vs. each other store
  const savings: Record<string, number> = {};
  if (cheapestStore) {
    for (const store of stores) {
      if (store.name !== cheapestStore.name && itemsFoundAtStore[store.name] === itemCount) {
        savings[store.name] = storeTotals[store.name] - lowestTotal;
      }
    }
  }
  
  return { 
    store: cheapestStore, 
    totalPrice: lowestTotal === Infinity ? 0 : lowestTotal,
    savings
  };
};

const StoreComparison: React.FC<StoreComparisonProps> = ({
  items,
  stores,
  onError,
  isLocatingStores,
  onCheapestStore,
  onRequestLocation,
  currentLocation,
  selectedStore,
  onStoreSelect
}) => {
  const [storeProducts, setStoreProducts] = useState<{ [key: string]: Product[] }>({});
  const [prices, setPrices] = useState<Record<string, Record<string, PriceResult>>>({});
  const [expandedStore, setExpandedStore] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [mapOpen, setMapOpen] = useState<boolean>(true);
  const [useWebScraper, setUseWebScraper] = useState<boolean>(true);
  const [useFastBatchProcessing, setUseFastBatchProcessing] = useState<boolean>(true);
  const [batchProcessingStatus, setBatchProcessingStatus] = useState<string>('');
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(new Set());
  const [locationRequested, setLocationRequested] = useState(false);
  const [cheapestItemStores, setCheapestItemStores] = useState<Record<string, string[]>>({});
  const [allPricesFetched, setAllPricesFetched] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [showMap, setShowMap] = useState(true);
  const [storesWithItems, setStoresWithItems] = useState<Store[]>([]);
  
  // Reference for the map
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  
  // Keep limited view of stores for display
  const limitedStores = useMemo(() => {
    return groupSimilarStores(stores).slice(0, 20);
  }, [stores]);
  
  // Compute store totals and cheapest store
  const { storeTotals, cheapestStoreIds } = useMemo(() => {
    if (items.length === 0 || limitedStores.length === 0) {
      return { 
        storeTotals: {} as Record<string, number>, 
        cheapestStoreIds: [] as string[] 
      };
    }
    
    // Calculate total for each store based on actual price data
    const totals: Record<string, number> = {};
    const storeHasAllItems: Record<string, boolean> = {};
    
    for (const store of limitedStores) {
      let total = 0;
      let hasAllItems = true;
      
      for (const itemObj of items) {
        const itemName = typeof itemObj === 'string' ? itemObj : itemObj.name;
        const price = prices[itemName]?.[store.name]?.price;
        if (typeof price === 'number') {
          total += price;
        } else {
          hasAllItems = false;
        }
      }
      
      if (hasAllItems || total > 0) {
        totals[store.name] = total;
        storeHasAllItems[store.name] = hasAllItems;
      }
    }
    
    // Find cheapest store
    let lowestTotal = Infinity;
    let lowestStoreNames: string[] = [];
    
    Object.entries(totals).forEach(([storeName, total]) => {
      if (storeHasAllItems[storeName] && total < lowestTotal) {
          lowestTotal = total;
        lowestStoreNames = [storeName];
      } else if (storeHasAllItems[storeName] && total === lowestTotal) {
        lowestStoreNames.push(storeName);
      }
    });
    
    // Call parent callback with the cheapest store info
    if (lowestStoreNames.length > 0) {
      const cheapestStore = limitedStores.find(s => s.name === lowestStoreNames[0]) || null;
      if (cheapestStore) {
        onCheapestStore(cheapestStore);
    } else {
      onCheapestStore(null);
      }
    }
    
    return { 
      storeTotals: totals, 
      cheapestStoreIds: lowestStoreNames 
    };
  }, [items, limitedStores, prices, onCheapestStore]);
  
  // Get the total price for a store (used in UI)
  const getTotalForStore = (storeName: string) => {
    let total = 0;
    
    for (const itemObj of items) {
      const itemName = typeof itemObj === 'string' ? itemObj : itemObj.name;
      const price = prices[itemName]?.[storeName]?.price;
      if (typeof price === 'number') {
        total += price;
      }
    }
    
    return total;
  };

  const handleRequestLocation = () => {
    if (onRequestLocation) {
      onRequestLocation();
      setLocationRequested(true);
    }
  };
  
  // ... rest of the component code ...

    return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5" component="h2">
            Compare Stores {loading && <CircularProgress size={20} sx={{ ml: 2 }} />}
            </Typography>
          <ButtonGroup variant="outlined" size="small">
            <Button 
              onClick={() => setMapOpen(!mapOpen)}
              startIcon={mapOpen ? <ViewListIcon /> : <MapIcon />}
            >
              {mapOpen ? 'Hide Map' : 'Show Map'}
            </Button>
            <Button onClick={handleRequestLocation} disabled={isLocatingStores}>
              <RefreshIcon fontSize="small" />
            </Button>
          </ButtonGroup>
      </Box>
        
        {/* Add batch processing controls here */}
        {batchProcessingControls}
        
        {/* Request location if needed */}
        {!currentLocation && (
          <Alert 
            severity="info" 
            action={
              <Button 
                color="inherit" 
                size="small" 
                onClick={onRequestLocation}
                disabled={isLocatingStores}
              >
                {isLocatingStores ? 'Finding...' : 'Enable Location'}
              </Button>
            }
          >
            Enable location services to find nearby stores
          </Alert>
        )}
        
          {/* Map Section */}
        {mapOpen && currentLocation && (
          <Box sx={{ height: 300, mb: 3, borderRadius: 1, overflow: 'hidden' }} ref={mapRef} />
        )}
        
        {/* Store List Section */}
        {stores.length > 0 && (
          <Grid container spacing={2}>
            {/* Store List */}
            <Grid item xs={12} md={5}>
              <List
                sx={{
                  maxHeight: 600,
                  overflow: 'auto',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                {limitedStores.map((store) => {
                  const storeTotal = getTotalForStore(store.name);
                  const isCheapest = cheapestStoreIds.includes(store.name);
                  
                  return (
                    <React.Fragment key={store.place_id || store.name}>
                      <ListItem
                        button
                        selected={expandedStore === store.name}
                        onClick={() => setExpandedStore(expandedStore === store.name ? null : store.name)}
                sx={{ 
                          backgroundColor: isCheapest ? 'success.light' : undefined,
                          '&.Mui-selected': {
                            backgroundColor: isCheapest ? 'success.light' : undefined,
                          }
                        }}
                      >
                        <ListItemIcon>
                          <StorefrontIcon color={isCheapest ? "success" : "primary"} />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Typography variant="body1" component="span">
                      {store.name}
                    </Typography>
                              {storeTotal > 0 && (
                  <Typography 
                                  variant="body2" 
                                  component="span" 
                                  sx={{ 
                                    fontWeight: 'bold',
                                    color: isCheapest ? 'success.dark' : 'text.primary' 
                                  }}
                                >
                                  ${storeTotal.toFixed(2)}
                  </Typography>
                              )}
                  </Box>
                          }
                          secondary={
                            <Typography variant="body2" component="span">
                              {store.distance.toFixed(1)} mi • {store.vicinity || store.address}
                  </Typography>
                          }
                        />
                      </ListItem>
                      
                      {/* Expanded Store View */}
                      {expandedStore === store.name && (
                        <Box sx={{ pl: 4, pr: 2, pb: 2, bgcolor: 'background.paper' }}>
                          <List dense disablePadding>
                    {items.map((item) => {
                              const itemName = typeof item === 'string' ? item : item.name;
                              const priceData = prices[itemName]?.[store.name];
                      
                      return (
                                <ListItem key={itemName} sx={{ py: 0.5 }}>
                                  <ListItemText
                                    primary={itemName}
                                    secondary={
                                      priceData ? (
                                        <Box component="span" sx={{ display: 'flex', flexDirection: 'column' }}>
                                          <Typography variant="body2" component="span" sx={{ fontWeight: 'bold' }}>
                                            ${priceData.price.toFixed(2)}
                          </Typography>
                                          {priceData.productName !== itemName && (
                                            <Typography variant="caption" component="span">
                                {priceData.productName}
                              </Typography>
                            )}
                                          {priceData.isEstimate && (
                                            <Chip size="small" label="Estimate" variant="outlined" sx={{ mt: 0.5 }} />
                            )}
                          </Box>
                                      ) : (
                                        <FetchPriceOnDemand
                                          item={itemName}
                                          store={store.name}
                                          onPriceReceived={(result) => {
                                            if (result) {
                                              const newPrices = {...prices};
                                              if (!newPrices[itemName]) {
                                                newPrices[itemName] = {};
                                              }
                                              newPrices[itemName][store.name] = result;
                                              setPrices(newPrices);
                                            }
                                          }}
                                        />
                                      )
                                    }
                                  />
                                </ListItem>
                              );
                            })}
                          </List>
                                </Box>
                      )}
                      <Divider />
                    </React.Fragment>
                  );
                })}
              </List>
            </Grid>
            
            {/* Price Comparison Matrix */}
            <Grid item xs={12} md={7}>
              <TableContainer component={Paper} sx={{ maxHeight: 600, overflow: 'auto' }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Item</TableCell>
                      {limitedStores.slice(0, 5).map(store => (
                        <TableCell key={store.place_id || store.name} align="right">
                          {store.name}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((item) => {
                      const itemName = typeof item === 'string' ? item : item.name;
                      
                      return (
                        <TableRow key={itemName}>
                          <TableCell component="th" scope="row">
                            {itemName}
                          </TableCell>
                          {limitedStores.slice(0, 5).map(store => {
                            const priceData = prices[itemName]?.[store.name];
                            
                            return (
                              <TableCell key={store.place_id || store.name} align="right">
                                {priceData ? (
                                  <Tooltip 
                                    title={priceData.isEstimate ? 'Estimated price' : priceData.productName}
                                    arrow
                                  >
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: priceData.isEstimate ? 'normal' : 'bold',
                                        fontStyle: priceData.isEstimate ? 'italic' : 'normal'
                                      }}
                                    >
                                      ${priceData.price.toFixed(2)}
                                    </Typography>
                                  </Tooltip>
                          ) : (
                            <FetchPriceOnDemand 
                                    item={itemName}
                              store={store.name} 
                              onPriceReceived={(result) => {
                                if (result) {
                                  const newPrices = {...prices};
                                        if (!newPrices[itemName]) {
                                          newPrices[itemName] = {};
                                  }
                                        newPrices[itemName][store.name] = result;
                                  setPrices(newPrices);
                                }
                              }}
                            />
                          )}
                              </TableCell>
                      );
                    })}
                        </TableRow>
                      );
                    })}
                    {/* Totals Row */}
                    <TableRow sx={{ '& th, & td': { fontWeight: 'bold', bgcolor: 'action.hover' } }}>
                      <TableCell>TOTAL</TableCell>
                      {limitedStores.slice(0, 5).map(store => (
                        <TableCell key={`total-${store.place_id || store.name}`} align="right">
                          ${getTotalForStore(store.name).toFixed(2)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        )}
      </Paper>
    </Container>
  );
};

export default StoreComparison;
