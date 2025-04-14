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
  Divider
} from "@mui/material";
import type { Store } from "../types/store";
import { type Product } from "../services/products";
import StarIcon from "@mui/icons-material/Star";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import StorefrontIcon from "@mui/icons-material/Storefront";
import PlaceIcon from "@mui/icons-material/Place";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

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
      
      // First try google-price endpoint (now using Google Shopping)
      const initialEndpoint = 'google-price';
      console.log(`Queueing price fetch for ${item} at ${store} using ${initialEndpoint} (Google Shopping)`);
      
      // Add to queue 
      priceRequestQueue.push({
        item,
        store,
        callback: (result) => {
          if (result) {
            // If we got a result from Google Shopping, use it
            onPriceReceived(result);
            setIsLoading(false);
          } else {
            // Try fallback endpoint if Google Shopping failed
            console.log(`Falling back to estimate price for ${item} at ${store}`);
            priceRequestQueue.push({
              item,
              store,
              callback: (fallbackResult) => {
                if (fallbackResult) {
                  onPriceReceived(fallbackResult);
                } else {
                  // Use our client-side fallback as a last resort
                  console.log(`Server fallbacks failed, using client-side estimation for ${item} at ${store}`);
                  const clientFallback = generateFallbackPrice(item, store);
                  onPriceReceived(clientFallback);
          }
          setIsLoading(false);
              },
              endpoint: 'fetch-price'
            });
            
            // Ensure queue processing continues
            if (!isProcessingQueue) {
              processQueue();
            }
          }
        },
        endpoint: initialEndpoint
      });
      
      // Start processing queue if not already running
      if (!isProcessingQueue) {
        processQueue();
      }
    };
    
    // Fetch once only, no retries
      fetchPrice();
    
    return () => {
      // No cleanup needed - the queue handles everything
    };
  }, [item, store, onPriceReceived]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          Fetching price...
        </Typography>
      </Box>
    );
  }

  // We shouldn't ever see this anymore since we always provide a fallback
  if (hasError) {
    return (
      <Box>
        <Typography variant="body2" color="text.disabled">
          Price data unavailable
        </Typography>
      </Box>
    );
  }

  return null;
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

const StoreComparison: React.FC<StoreComparisonProps> = ({
  items,
  stores,
  onError,
  isLocatingStores,
  onCheapestStore,
  onRequestLocation,
  currentLocation
}) => {
  const [storeProducts, setStoreProducts] = useState<{ [key: string]: Product[] }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [prices, setPrices] = useState<Record<string, Record<string, PriceResult>>>({});
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(new Set());
  const [locationRequested, setLocationRequested] = useState(false);
  const [cheapestItemStores, setCheapestItemStores] = useState<Record<string, string[]>>({});
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [allPricesFetched, setAllPricesFetched] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  
  // Handle location request
  const handleRequestLocation = () => {
    setLocationRequested(true);
    if (onRequestLocation) {
      onRequestLocation();
    }
  };

  // Filter and group stores
  const processedStores = useMemo(() => {
    // Only keep grocery and retail stores
    const groceryStores = stores.filter(store => isGroceryOrRetailStore(store.name));
    
    // Sort by distance
    return groceryStores.sort((a, b) => a.distance - b.distance);
  }, [stores]);
  
  // Limit to 10 stores for better UI performance
  const limitedStores = useMemo(() => {
    return processedStores.slice(0, 10);
  }, [processedStores]);
  
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
      
      for (const item of items) {
        const price = prices[item]?.[store.name]?.price;
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
      }
    } else {
      onCheapestStore(null);
    }
    
    return { 
      storeTotals: totals, 
      cheapestStoreIds: lowestStoreNames 
    };
  }, [items, limitedStores, prices, onCheapestStore]);
  
  // Check if all prices are fetched
  useEffect(() => {
    if (items.length === 0 || limitedStores.length === 0) {
      setAllPricesFetched(false);
      return;
    }

    let allFetched = true;
    for (const item of items) {
      for (const store of limitedStores) {
        if (!prices[item]?.[store.name]) {
          allFetched = false;
          break;
        }
      }
      if (!allFetched) break;
    }

    setAllPricesFetched(allFetched);
  }, [items, limitedStores, prices]);
  
  // Initialize map only once and update markers when all data is available
  useEffect(() => {
    if (!mapRef.current || !stores.length || !processedStores.length) return;
    
    if (!MAPBOX_TOKEN) {
      console.error("Mapbox API key is missing. Map cannot be displayed.");
      return;
    }

    // Create the map instance if it doesn't exist
    if (!mapInstance.current) {
      console.log("Creating new map instance");
      
      // Find the first store to center the map initially, or use current location if available
      const centerPoint = currentLocation 
        ? [currentLocation.lng, currentLocation.lat] 
        : [processedStores[0].longitude, processedStores[0].latitude];
      
      try {
        // Create the map with a more reliable style
        mapInstance.current = new mapboxgl.Map({
          container: mapRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: centerPoint as [number, number],
          zoom: 11,
          attributionControl: true,
          trackResize: true,
          maxZoom: 18
        });
        
        // Force repainting for Webkit browsers
        mapInstance.current.getCanvas().style.willChange = 'transform';

        // Add navigation controls
        mapInstance.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
        
        // Add scale control
        mapInstance.current.addControl(new mapboxgl.ScaleControl(), 'bottom-left');
        
        // Wait for the map to load before adding markers
        mapInstance.current.on('load', () => {
          console.log('Map loaded successfully');
          updateMapMarkers();
        });

        // If there's a style load error, try a different style
        mapInstance.current.on('error', (e) => {
          console.error('Mapbox error:', e);
          // Check if we can determine it's a style error by checking message
          if (e.error && typeof e.error === 'object' && 'message' in e.error && 
              typeof e.error.message === 'string' && e.error.message.includes('style')) {
            console.log('Trying fallback style...');
            mapInstance.current?.setStyle('mapbox://styles/mapbox/light-v11');
          }
        });
      } catch (error) {
        console.error("Error creating map:", error);
      }
    }
    
    // Only update markers when all prices are loaded or when map is first created
    const map = mapInstance.current;
    if (allPricesFetched && map && typeof map.loaded === 'function' && map.loaded()) {
      updateMapMarkers();
    }
    
    function updateMapMarkers() {
      const mapRef = mapInstance.current;
      if (!mapRef) return;
      
      console.log("Updating map markers");
      
      // Clear previous markers
      markers.current.forEach(marker => marker.remove());
      markers.current = [];
      
      // Coordinates for bounding box calculation
      const coordinates: [number, number][] = [];
      
      // Add current location marker if available
      if (currentLocation) {
        // Create a DOM element for the current location marker
        const el = document.createElement('div');
        el.className = 'current-location-marker';
        el.style.backgroundColor = '#4285F4';
        el.style.width = '24px';
        el.style.height = '24px';
        el.style.borderRadius = '50%';
        el.style.border = '3px solid white';
        el.style.boxShadow = '0 0 5px rgba(0,0,0,0.3)';
        el.style.zIndex = '100';
        
        // Add the current location marker
        const userMarker = new mapboxgl.Marker(el)
          .setLngLat([currentLocation.lng, currentLocation.lat])
          .setPopup(new mapboxgl.Popup({ closeButton: false }).setHTML('<strong>Your Location</strong>'))
          .addTo(mapRef);
        
        markers.current.push(userMarker);
        
        // Add to coordinates for bounding box
        coordinates.push([currentLocation.lng, currentLocation.lat]);
      }
      
      // Add store markers
      processedStores.forEach(store => {
        const isCheapest = cheapestStoreIds.includes(store.name);
        const isSelected = selectedStore && store.name === selectedStore.name;
        
        // Create a DOM element for the marker
        const el = document.createElement('div');
        el.className = 'store-marker';
        el.style.width = isCheapest ? '22px' : '18px';
        el.style.height = isCheapest ? '22px' : '18px';
        el.style.backgroundColor = isCheapest ? '#0F9D58' : isSelected ? '#FFC107' : '#DB4437';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 0 5px rgba(0,0,0,0.3)';
        el.style.cursor = 'pointer';
        
        // Add pulsing animation for cheapest store
        if (isCheapest) {
          el.style.animation = 'pulse 1.5s infinite';
          
          // Add keyframes for pulse animation if not already added
          if (!document.getElementById('pulse-animation')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'pulse-animation';
            styleSheet.textContent = `
              @keyframes pulse {
                0% {
                  box-shadow: 0 0 0 0 rgba(15, 157, 88, 0.7);
                }
                70% {
                  box-shadow: 0 0 0 10px rgba(15, 157, 88, 0);
                }
                100% {
                  box-shadow: 0 0 0 0 rgba(15, 157, 88, 0);
                }
              }
            `;
            document.head.appendChild(styleSheet);
          }
        }
        
        // Create popup content
        const popupHtml = `
          <strong>${store.name}</strong><br>
          ${store.address || ''}<br>
          <em>${store.distance.toFixed(1)} miles away</em>
          ${storeTotals[store.name] ? `<br><strong>Total: $${storeTotals[store.name].toFixed(2)}</strong>` : ''}
          ${isCheapest ? '<br><strong style="color:#0F9D58">Best Value Store!</strong>' : ''}
          ${isMilitaryCommissary(store.name) ? '<br><strong style="color:#2196F3">Military Commissary</strong>' : ''}
        `;
        
        // Create the popup
        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupHtml);
        
        // Create the marker
        const marker = new mapboxgl.Marker(el)
          .setLngLat([store.longitude, store.latitude])
          .setPopup(popup)
          .addTo(mapRef);
        
        // Add click event to marker
        el.addEventListener('click', () => {
          setSelectedStore(store);
          const priceCardElement = document.getElementById(`price-card-${store.id}`);
          if (priceCardElement) {
            priceCardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
        
        // Save reference to marker
        markers.current.push(marker);
        
        // Add coordinates for bounding box
        coordinates.push([store.longitude, store.latitude]);
      });
      
      // Fit map to include all markers
      if (coordinates.length > 0) {
        try {
          const bounds = coordinates.reduce((bounds, coord) => {
            return bounds.extend(coord as mapboxgl.LngLatLike);
          }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
          
          mapRef.fitBounds(bounds, {
            padding: 50,
            maxZoom: 13
          });
        } catch (error) {
          console.error("Error fitting bounds:", error);
        }
      }
    }
  }, [processedStores, allPricesFetched, cheapestStoreIds, selectedStore, currentLocation, storeTotals]);
  
  // Separate effect to update markers only when prices/cheapest stores change
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || typeof map.loaded !== 'function' || !map.loaded() || !allPricesFetched) return;
    
    // Only update markers and popups when all prices are loaded
    markers.current.forEach(marker => marker.remove());
    markers.current = [];
    
    // Coordinates for bounding box calculation
    const coordinates: [number, number][] = [];
    
    // Add current location marker if available
    if (currentLocation) {
      // Create a DOM element for the current location marker
      const el = document.createElement('div');
      el.className = 'current-location-marker';
      el.style.backgroundColor = '#4285F4';
      el.style.width = '24px';
      el.style.height = '24px';
      el.style.borderRadius = '50%';
      el.style.border = '3px solid white';
      el.style.boxShadow = '0 0 5px rgba(0,0,0,0.3)';
      el.style.zIndex = '100';
      
      // Add the current location marker
      const userMarker = new mapboxgl.Marker(el)
        .setLngLat([currentLocation.lng, currentLocation.lat])
        .setPopup(new mapboxgl.Popup().setHTML('<strong>Your Location</strong>'))
        .addTo(map);
      
      markers.current.push(userMarker);
      
      // Add to coordinates for bounding box
      coordinates.push([currentLocation.lng, currentLocation.lat]);
    }
    
    // Add store markers
    processedStores.forEach(store => {
      const isCheapest = cheapestStoreIds.includes(store.name);
      const isSelected = selectedStore && store.name === selectedStore.name;
      
      // Create a DOM element for the marker
      const el = document.createElement('div');
      el.className = 'store-marker';
      el.style.width = isCheapest ? '22px' : '18px';
      el.style.height = isCheapest ? '22px' : '18px';
      el.style.backgroundColor = isCheapest ? '#0F9D58' : isSelected ? '#FFC107' : '#DB4437';
      el.style.borderRadius = '50%';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 0 5px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';
      
      // Add pulsing animation for cheapest store
      if (isCheapest) {
        el.style.animation = 'pulse 1.5s infinite';
        
        // Add keyframes for pulse animation if not already added
        if (!document.getElementById('pulse-animation')) {
          const styleSheet = document.createElement('style');
          styleSheet.id = 'pulse-animation';
          styleSheet.textContent = `
            @keyframes pulse {
              0% {
                box-shadow: 0 0 0 0 rgba(15, 157, 88, 0.7);
              }
              70% {
                box-shadow: 0 0 0 10px rgba(15, 157, 88, 0);
              }
              100% {
                box-shadow: 0 0 0 0 rgba(15, 157, 88, 0);
              }
            }
          `;
          document.head.appendChild(styleSheet);
        }
      }
      
      // Create popup content
      const popupHtml = `
        <strong>${store.name}</strong><br>
        ${store.address || ''}<br>
        <em>${store.distance.toFixed(1)} miles away</em>
        ${storeTotals[store.name] ? `<br><strong>Total: $${storeTotals[store.name].toFixed(2)}</strong>` : ''}
        ${isCheapest ? '<br><strong style="color:#0F9D58">Best Value Store!</strong>' : ''}
        ${isMilitaryCommissary(store.name) ? '<br><strong style="color:#2196F3">Military Commissary</strong>' : ''}
      `;
      
      // Create the popup
      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupHtml);
      
      // Create the marker
      const marker = new mapboxgl.Marker(el)
        .setLngLat([store.longitude, store.latitude])
        .setPopup(popup)
        .addTo(map);
      
      // Add click event to marker
      el.addEventListener('click', () => {
        setSelectedStore(store);
        const priceCardElement = document.getElementById(`price-card-${store.id}`);
        if (priceCardElement) {
          priceCardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      
      // Save reference to marker
      markers.current.push(marker);
      
      // Add coordinates for bounding box
      coordinates.push([store.longitude, store.latitude]);
    });
  }, [storeTotals, cheapestStoreIds, allPricesFetched, processedStores, currentLocation, selectedStore]);
  
  // Compute the cheapest stores for each individual item
  useEffect(() => {
    if (items.length === 0 || limitedStores.length === 0) {
      setCheapestItemStores({});
      return;
    }
    
    const itemCheapestStores: Record<string, string[]> = {};
    
    for (const item of items) {
      if (!prices[item]) continue;
      
      let lowestPrice = Infinity;
      let cheapestStores: string[] = [];
      
      for (const store of limitedStores) {
        const price = prices[item]?.[store.name]?.price;
        if (typeof price === 'number') {
          if (price < lowestPrice) {
            lowestPrice = price;
            cheapestStores = [store.name];
          } else if (price === lowestPrice) {
            cheapestStores.push(store.name);
          }
        }
      }
      
      if (cheapestStores.length > 0) {
        itemCheapestStores[item] = cheapestStores;
      }
    }
    
    setCheapestItemStores(itemCheapestStores);
  }, [prices, limitedStores, items]);

  // Function to get store total price
  const getTotalForStore = (storeName: string) => {
    let total = 0;
    for (const item of items) {
      const price = prices[item]?.[storeName]?.price;
      if (typeof price === 'number') {
        total += price;
      }
    }
    return total;
  };

  const handleSelectStore = (store: Store) => {
    setSelectedStore(store);
    
    if (mapInstance.current) {
      mapInstance.current.flyTo({
        center: [store.longitude, store.latitude],
        zoom: 14,
        duration: 1000
      });
      
      // Find and toggle the popup for this store
      const marker = markers.current.find(m => {
        const lngLat = m.getLngLat();
        return lngLat.lng === store.longitude && lngLat.lat === store.latitude;
      });
      
      if (marker) {
        marker.togglePopup();
      }
    }
  };

  if (stores.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        {isLocatingStores ? (
          <Paper 
            elevation={2} 
            sx={{ 
              p: 3, 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              gap: 2,
              maxWidth: 500,
              mx: 'auto'
            }}
          >
            <Typography variant="h6" align="center">
              Finding Stores Near You
            </Typography>
            <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 1 }}>
              Searching for grocery stores, warehouse clubs, and military commissaries in your area...
            </Typography>
            <LinearProgress 
              sx={{ width: '100%', height: 8, borderRadius: 4 }} 
              color="primary"
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Please wait a moment...
              </Typography>
            </Box>
          </Paper>
        ) : locationRequested ? (
        <Typography variant="body1" align="center" color="text.secondary">
            No stores found. Try entering a zip code to find stores near you.
        </Typography>
        ) : (
          <Paper 
            elevation={2} 
            sx={{ 
              p: 3, 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              gap: 2,
              maxWidth: 500,
              mx: 'auto'
            }}
          >
            <LocationOnIcon color="primary" sx={{ fontSize: 40 }} />
            <Typography variant="h6" align="center">
              Find Stores Near You
            </Typography>
            <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 1 }}>
              We need your location to show prices at stores near you.
            </Typography>
            <Button 
              variant="contained" 
              color="primary" 
              startIcon={<LocationOnIcon />}
              onClick={handleRequestLocation}
              fullWidth
            >
              Share My Location
            </Button>
            <Typography variant="caption" align="center" color="text.secondary">
              Or use the zip code search above to find stores manually
            </Typography>
          </Paper>
        )}
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="body1" align="center" color="text.secondary">
          Add items to your shopping list to compare prices across stores.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" component="h2">
          Price Comparison
        </Typography>
      </Box>
      
      {items.length === 0 ? (
        <Typography variant="body1">
          Add items to your list to see price comparisons
        </Typography>
      ) : limitedStores.length === 0 ? (
      <Box sx={{ mb: 3 }}>
          {isLocatingStores ? (
            <Paper 
              elevation={2} 
              sx={{ 
                p: 3, 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                gap: 2
              }}
            >
              <Typography variant="h6" align="center">
                Finding Stores Near You
              </Typography>
              <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 1 }}>
                Searching for grocery stores, warehouse clubs, and military commissaries in your area...
              </Typography>
              <LinearProgress 
                sx={{ width: '100%', height: 8, borderRadius: 4 }} 
                color="primary"
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">
                  Please wait a moment...
        </Typography>
              </Box>
            </Paper>
          ) : (
            <Typography variant="body1" sx={{ mb: 2 }}>
              No stores found nearby. Try entering your zip code or enabling location services.
            </Typography>
          )}
        </Box>
      ) : (
        <>
          {/* Map Section */}
          <Box sx={{ mb: 4 }}>
            <Paper elevation={2} sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Box
                ref={mapRef}
                sx={{
                  width: '100%',
                  height: '350px',
                }}
              />
            </Paper>
            {!allPricesFetched && (
              <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  Fetching all prices to update map...
                </Typography>
              </Box>
            )}
      </Box>
      
          {/* Price Comparison Section */}
          <Box>
            <Typography variant="h6" gutterBottom>
              Prices at {limitedStores.length} Nearby Stores
            </Typography>
            
            {limitedStores.map((store) => (
              <Card 
                key={store.name} 
                id={`price-card-${store.id}`}
                sx={{ 
                  mb: 2, 
                  borderLeft: cheapestStoreIds.includes(store.name) ? '4px solid' : '1px solid',
                  borderLeftColor: cheapestStoreIds.includes(store.name) ? 'success.main' : 
                    isMilitaryCommissary(store.name) ? 'info.main' : 'divider',
                  bgcolor: isMilitaryCommissary(store.name) ? 'info.50' : 'background.paper'
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography 
                      variant="h6" 
                      component="h3"
                      color={isMilitaryCommissary(store.name) ? 'info.dark' : 
                            cheapestStoreIds.includes(store.name) ? 'success.main' : 'text.primary'}
                    >
                      {store.name}
                      {isMilitaryCommissary(store.name) && (
                      <Chip
                          label="Military" 
                          size="small" 
                          color="info" 
                          sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                      {cheapestStoreIds.includes(store.name) && (
                        <Chip 
                          label="Best Value" 
                        size="small"
                        color="success"
                          sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                    </Typography>
                  <Typography 
                      variant="h6" 
                      color={cheapestStoreIds.includes(store.name) ? "success.main" : "primary.main"} 
                      fontWeight="bold"
                    >
                      ${(storeTotals[store.name] || 0).toFixed(2)}
                  </Typography>
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {store.distance < 1 
                      ? `${(store.distance * 5280).toFixed(0)} ft away` 
                      : `${store.distance.toFixed(1)} mi away`}
                    {store.address && ` • ${store.address}`}
                  </Typography>
                  
                  {/* Item prices */}
                  <Box>
                    {items.map((item) => {
                      const priceData = prices[item]?.[store.name];
                      const isItemCheapest = cheapestItemStores[item]?.includes(store.name);
                      
                      return (
                        <Box
                          key={`${store.name}-${item}`} 
                          sx={{
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            p: 1,
                            mb: 1,
                            borderRadius: 1,
                            bgcolor: isItemCheapest ? 'success.50' : 'background.paper',
                            border: '1px solid',
                            borderColor: isItemCheapest ? 'success.light' : 'divider',
                          }}
                        >
                          <Box sx={{ mr: 1, maxWidth: '70%' }}>
                            <Typography variant="body2" fontWeight="medium">
                            {item}
                          </Typography>
                            {priceData && priceData.productName && priceData.productName !== item && (
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 'medium' }}>
                                {priceData.productName}
                              </Typography>
                            )}
                            {priceData && priceData.fullStoreName && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                {priceData.fullStoreName}
                                {priceData.rating && priceData.reviewCount && (
                                  <span> • {priceData.rating}★ ({priceData.reviewCount})</span>
                                )}
                              </Typography>
                            )}
                            {priceData && priceData.returnPolicy && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                {priceData.returnPolicy}
                              </Typography>
                            )}
                            {priceData && priceData.availability && (
                              <Typography variant="caption" color="primary.main" display="block">
                                {priceData.availability}
                              </Typography>
                            )}
                          </Box>
                          
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          {priceData ? (
                              <Box sx={{ textAlign: 'right' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                  <Typography 
                                    variant="body1" 
                                    fontWeight="bold" 
                                    color={isItemCheapest ? 'success.main' : 'text.primary'}
                                  >
                                  ${priceData.price.toFixed(2)}
                                    {priceData.priceWas && (
                                      <Typography 
                                        component="span" 
                                        variant="caption" 
                                        color="text.secondary" 
                                        sx={{ textDecoration: 'line-through', ml: 0.5 }}
                                      >
                                        ${priceData.priceWas.toFixed(2)}
                                      </Typography>
                                    )}
                                </Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, ml: 0.5 }}>
                                    <Tooltip title={
                                      priceData.source === 'google-shopping' 
                                        ? "Price found on Google Shopping" 
                                        : priceData.source === 'google-ai' 
                                        ? "Price found via Google Search with AI" 
                                        : priceData.source === 'ai-fallback' 
                                        ? "AI estimated price based on market data" 
                                        : priceData.source === 'html-extracted'
                                        ? "Actual price extracted from store's website"
                                        : priceData.source === 'client-fallback'
                                        ? "Estimated price based on market averages"
                                        : "Fallback price estimate"
                                    }>
                                    <Chip 
                                        label={
                                          priceData.source === 'google-shopping' 
                                            ? "Shopping" 
                                            : priceData.source === 'google-ai' 
                                            ? "Google" 
                                            : priceData.source === 'ai-fallback' 
                                            ? "AI" 
                                            : priceData.source === 'html-extracted'
                                            ? "Store"
                                            : priceData.source === 'client-fallback'
                                            ? "Estimated"
                                            : "Fallback"
                                        } 
                                      size="small" 
                                        color={
                                          priceData.source === 'google-shopping'
                                            ? "secondary"
                                            : priceData.source === 'google-ai' || priceData.source === 'html-extracted'
                                            ? "success" 
                                            : priceData.source === 'ai-fallback' 
                                            ? "primary" 
                                            : "warning"
                                        }
                                        sx={{ 
                                          height: 20, 
                                          fontSize: '0.7rem',
                                          backgroundColor: priceData.source === 'google-shopping' 
                                            ? theme => theme.palette.secondary.main
                                            : priceData.source === 'html-extracted' 
                                            ? theme => theme.palette.success.light
                                            : undefined,
                                          color: priceData.source === 'google-shopping' ? 'white' : undefined
                                        }}
                                    />
                                  </Tooltip>
                                  {isItemCheapest && (
                                    <Tooltip title={`This store has the lowest price for ${item} among all stores`}>
                                      <Chip
                                        label="Best Price"
                                        size="small"
                                          color="success"
                                        icon={<StarIcon sx={{ fontSize: '0.8rem' }} />}
                                        sx={{ 
                                          height: 20, 
                                          fontSize: '0.7rem',
                                          fontWeight: 'bold',
                                            bgcolor: theme => theme.palette.success.main,
                                          color: 'white',
                                          '& .MuiChip-icon': { 
                                            color: 'inherit',
                                            marginLeft: '2px',
                                            marginRight: '-4px'
                                          }
                                        }}
                                      />
                                    </Tooltip>
                                  )}
                                </Box>
                              </Box>
                            </Box>
                          ) : (
                            <FetchPriceOnDemand 
                              item={item} 
                              store={store.name} 
                              onPriceReceived={(result) => {
                                if (result) {
                                  const newPrices = {...prices};
                                  if (!newPrices[item]) {
                                    newPrices[item] = {};
                                  }
                                  newPrices[item][store.name] = result;
                                  setPrices(newPrices);
                                }
                              }}
                            />
                          )}
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
};

export default StoreComparison;
