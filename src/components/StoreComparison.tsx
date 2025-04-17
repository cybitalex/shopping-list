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
import type { Store as BaseStore } from "../types/store";
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

interface StoreItem {
  name: string;
  price: number | null;
  lastUpdated: string | null;
  productName?: string;
  isGenericName?: boolean;
  productDetail?: string | null;
}

interface StoreComparisonProps {
  items: Array<{name: string}>;
  stores: BaseStore[];
  onError: (message: string) => void;
  isLocatingStores: boolean;
  onCheapestStore: (store: BaseStore | null) => void;
  onRequestLocation?: () => void;
  currentLocation?: { lat: number; lng: number } | null;
  selectedStore: BaseStore | null;
  onStoreSelect: (store: BaseStore | null) => void;
  setStores: (stores: BaseStore[]) => void;
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
        credentials: 'same-origin' as RequestCredentials
      };
      
      // Add a cache buster to prevent browser caching
      const cacheBuster = `&_t=${Date.now()}`;
      const url = `/api/${endpoint}?item=${encodeURIComponent(request.item)}&store=${encodeURIComponent(request.store)}${endpoint === 'fetch-price' ? '&fallback=false' : ''}${cacheBuster}`;
      
      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.status}`);
      }
      
      const data = await response.json();
        
      if (data.success && data.price !== null) {
        request.callback(data);
      } else {
        throw new Error('Invalid data received from server');
      }
  } catch (error) {
    console.error(`Error in queued fetch for ${request.item} at ${request.store}:`, error);
      request.callback(null);
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
    const fetchPrice = async () => {
      setIsLoading(true);
      setHasError(false);
      
      try {
        console.log(`Fetching price for ${item} at ${store}`);
        
        // Use the API to get the price instead of fallback
        const response = await fetch(`/api/fetch-price?item=${encodeURIComponent(item)}&store=${encodeURIComponent(store === '' ? 'nearby' : store)}`);
        
        if (!response.ok) {
          throw new Error(`Network response was not ok: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.price !== null) {
          onPriceReceived(data);
          } else {
          throw new Error('Invalid data received from server');
        }
      } catch (error) {
        console.error(`Error fetching price for ${item} at ${store}:`, error);
        setHasError(true);
        onPriceReceived(null);
      } finally {
          setIsLoading(false);
              }
    };
    
      fetchPrice();
    
    return () => {
      // No pending requests to clean up
    };
  }, [item, store, onPriceReceived]);

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

// Group similar stores together to avoid duplicates but preserve complete store names for certain chains
const groupSimilarStores = (stores: BaseStore[]): BaseStore[] => {
  // Stores that should be grouped but have their full names preserved
  const preserveFullNamePrefixes = [
    'Walmart', 'Target', 'BJ\'s', 'Sam\'s', 'Costco', 'Kroger', 'Publix', 
    'Commissary', 'Military', 'AAFES', 'NEX', 'MCX', 'CGX', 'Exchange'
  ];
  
  const storeGroups: Record<string, BaseStore[]> = {};
  
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
  const result: BaseStore[] = [];
  
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

// Add this after the processQueue function
const batchProcessPrices = async (items: string[], stores: BaseStore[]): Promise<Map<string, Map<string, PriceResult>>> => {
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
              // Skip this item/store combination if there's an error
              // No fallback to use
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
  stores: BaseStore[]
): { store: BaseStore | null; totalPrice: number; savings: Record<string, number> } => {
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
  let cheapestStore: BaseStore | null = null;
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
  onStoreSelect,
  setStores
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
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [showMap, setShowMap] = useState(true);
  const [storesWithItems, setStoresWithItems] = useState<BaseStore[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Keep limited view of stores for display
  const limitedStores = stores.slice(0, 5);
  
  // Update stores with items when items change
  useEffect(() => {
    if (items.length > 0) {
      const updatedStores = stores.map(store => ({
        ...store,
        items: items.map(item => ({
          ...item,
          price: null,
          lastUpdated: null
        }))
      }));
      setStoresWithItems(updatedStores);
    } else {
      setStoresWithItems([]);
    }
  }, [items, stores]);

  // Fetch Mapbox token from backend
  useEffect(() => {
    const fetchMapboxToken = async () => {
      try {
        const response = await fetch('/api/mapbox-token');
        if (response.ok) {
          const data = await response.json();
          setMapboxToken(data.token);
        }
      } catch (error) {
        console.error('Error fetching Mapbox token:', error);
      }
    };

    fetchMapboxToken();
  }, []);

  // Initialize map when token and location are available
  useEffect(() => {
    if (mapRef.current && currentLocation && mapboxToken) {
      // Clear previous map and markers
      if (mapInstance.current) {
        mapInstance.current.remove();
        markers.current = [];
      }

      try {
        // Set the access token
        mapboxgl.accessToken = mapboxToken;

        // Create new map instance
        mapInstance.current = new mapboxgl.Map({
          container: mapRef.current,
          style: 'mapbox://styles/mapbox/streets-v11',
          center: [currentLocation.lng, currentLocation.lat],
          zoom: 11
        });

        // Add user location marker
        const userMarker = new mapboxgl.Marker({ color: '#4285F4' })
          .setLngLat([currentLocation.lng, currentLocation.lat])
          .addTo(mapInstance.current);

        markers.current.push(userMarker);

        // Add markers for each store
        limitedStores.forEach(store => {
          if (store.latitude && store.longitude) {
            const storeMarker = new mapboxgl.Marker({ color: '#0F9D58' })
              .setLngLat([store.longitude, store.latitude])
              .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(
                `<h3>${store.name}</h3><p>${typeof store.distance === 'number' ? `${store.distance.toFixed(1)} miles away` : 'Distance unknown'}</p>`
              ))
              .addTo(mapInstance.current!);

            markers.current.push(storeMarker);
          }
        });

        // Add navigation controls
        mapInstance.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      } catch (error) {
        console.error('Error initializing map:', error);
        onError(error instanceof Error ? error.message : 'Failed to initialize map');
      }
    }
  }, [currentLocation, limitedStores, mapboxToken, onError]);

  // Calculate store totals using the new data structure
  const storeTotals = useMemo(() => {
    return stores.reduce((acc: Record<string, number>, store) => {
      if (!store.place_id) return acc;
      
      const total = (store.items || []).reduce((sum: number, item) => {
        return sum + (typeof item.price === 'number' ? item.price : 0);
      }, 0);
      
      acc[store.place_id] = total;
      return acc;
    }, {});
  }, [stores]);
    
    // Find cheapest store
  const cheapestStore = useMemo(() => {
    if (stores.length === 0) return null;
    
    return stores.reduce((cheapest, current) => {
      if (!current.place_id || !cheapest.place_id) return cheapest;
      
      const currentTotal = storeTotals[current.place_id] || 0;
      const cheapestTotal = storeTotals[cheapest.place_id] || 0;
      return currentTotal < cheapestTotal ? current : cheapest;
    }, stores[0]);
  }, [stores, storeTotals]);

  // Update cheapest store callback
  useEffect(() => {
      if (cheapestStore) {
        onCheapestStore(cheapestStore);
    }
  }, [cheapestStore, onCheapestStore]);

  // Get the total price for a store (used in UI)
  const getTotalForStore = (storeName: string): number => {
    const store = stores.find(s => s.name === storeName);
    return store?.place_id ? (storeTotals[store.place_id] || 0) : 0;
  };

  const handleRequestLocation = () => {
    if (onRequestLocation) {
      onRequestLocation();
      setLocationRequested(true);
    }
  };
  
  // Initialize map when currentLocation changes
  useEffect(() => {
    if (mapRef.current && currentLocation) {
      // Clear previous map and markers
      if (mapInstance.current) {
        mapInstance.current.remove();
        markers.current = [];
      }
      
      try {
        // Create new map instance
        mapInstance.current = new mapboxgl.Map({
          container: mapRef.current,
          style: 'mapbox://styles/mapbox/streets-v11',
          center: [currentLocation.lng, currentLocation.lat],
          zoom: 11
        });
        
        // Add user location marker
        const userMarker = new mapboxgl.Marker({ color: '#4285F4' })
          .setLngLat([currentLocation.lng, currentLocation.lat])
          .addTo(mapInstance.current);
        
        markers.current.push(userMarker);
        
        // Add markers for each store
        limitedStores.forEach(store => {
          if (store.latitude && store.longitude) {
            const storeMarker = new mapboxgl.Marker({ color: '#0F9D58' })
              .setLngLat([store.longitude, store.latitude])
              .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(
                `<h3>${store.name}</h3><p>${typeof store.distance === 'number' ? `${store.distance.toFixed(1)} miles away` : 'Distance unknown'}</p>`
              ))
              .addTo(mapInstance.current!);
            
            markers.current.push(storeMarker);
          }
        });
        
        // Add navigation controls
        mapInstance.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      } catch (error) {
        console.error('Error initializing map:', error);
        onError(error instanceof Error ? error.message : 'Failed to initialize map');
      }
    }
  }, [currentLocation, limitedStores, onError]);

  const handleStoreSelect = (store: BaseStore) => {
    console.log('StoreComparison.handleStoreSelect called with:', store);
    onStoreSelect(store);
  };

  // Find the cheapest store for each item
  const findCheapestStoreForItem = (itemName: string): string | null => {
    let cheapestStore = null;
    let lowestPrice = Infinity;

    // First, check all stores to find the lowest price for this item
    limitedStores.forEach(store => {
      const item = store.items?.find(i => i.name === itemName);
      if (item && item.price !== null && item.price < lowestPrice) {
        lowestPrice = item.price;
        cheapestStore = store.name;
      }
    });

    // Only return the cheapest store if there's a valid lowest price
    // and ensure it's not comparing undefined or null values
    return lowestPrice < Infinity ? cheapestStore : null;
  };

  // Check if store has any cheapest items
  const storeHasCheapestItem = (store: BaseStore): boolean => {
    if (!store.items) return false;
    
    // Check each item in the store to see if any is the cheapest
    return store.items.some(item => 
      findCheapestStoreForItem(item.name) === store.name
    );
  };

  // Get cheapest store overall
  const cheapestOverallStore = useMemo(() => {
    const storeAvgPrices = limitedStores.map(store => {
      const validPrices = store.items
        ?.filter(item => item.price !== null)
        .map(item => item.price as number) || [];
      
      const totalPrice = validPrices.reduce((sum, price) => sum + price, 0);
      const avgPrice = validPrices.length > 0 ? totalPrice / validPrices.length : Infinity;
      
      return { name: store.name, avgPrice, totalPrice };
    });
    
    storeAvgPrices.sort((a, b) => a.totalPrice - b.totalPrice);
    return storeAvgPrices.length > 0 ? storeAvgPrices[0].name : null;
  }, [limitedStores]);

  // Updated renderSelectedStoreDetails function to handle selectedStore correctly
  const renderSelectedStoreDetails = () => {
    if (!selectedStore) return null;

    // Extract unit information and quantity from the product name
    const extractUnitInfo = (productName: string) => {
      const lowerName = productName.toLowerCase();
      
      // Weight-based units (pounds, ounces)
      const weightMatch = lowerName.match(/(\d+(\.\d+)?)\s*(lb|pound|oz|ounce|g|gram)/i);
      if (weightMatch) {
        const amount = parseFloat(weightMatch[1]);
        let unit = weightMatch[3].toLowerCase();
        
        // Normalize units
        if (unit === 'pound' || unit === 'lb') unit = 'lb';
        else if (unit === 'ounce' || unit === 'oz') unit = 'oz';
        else if (unit === 'gram' || unit === 'g') unit = 'g';
    
    return { 
          text: `${amount} ${unit}`,
          amount: amount,
          unit: unit
        };
      }
      
      // Count-based units (pack, count, etc.)
      const countMatch = lowerName.match(/(\d+)[\s-]*(ct|count|pack|pk)/i);
      if (countMatch) {
        const amount = parseInt(countMatch[1], 10);
        let unit = countMatch[2].toLowerCase();
        
        // Normalize units
        if (unit === 'count' || unit === 'ct') unit = 'ct';
        else if (unit === 'pack' || unit === 'pk') unit = 'pk';
        
        return {
          text: `${amount} ${unit}`,
          amount: amount,
          unit: unit
        };
      }
      
      // Volume-based units (fl oz, ml, l)
      const volumeMatch = lowerName.match(/(\d+(\.\d+)?)\s*(fl oz|ml|l|liter|gallon|gal)/i);
      if (volumeMatch) {
        const amount = parseFloat(volumeMatch[1]);
        let unit = volumeMatch[3].toLowerCase();
        
        // Normalize units
        if (unit === 'fl oz') unit = 'fl oz';
        else if (unit === 'ml') unit = 'ml';
        else if (unit === 'l' || unit === 'liter') unit = 'l';
        else if (unit === 'gallon' || unit === 'gal') unit = 'gal';
    
    return { 
          text: `${amount} ${unit}`,
          amount: amount,
          unit: unit
        };
      }
      
      // Items sold individually
      if (lowerName.includes(' each') || lowerName.includes('- each')) {
        return {
          text: 'Each',
          amount: 1,
          unit: 'each'
        };
      }
      
      // Bags
      if (lowerName.includes(' bag')) {
        const match = lowerName.match(/(\d+(\.\d+)?)\s*(lb|pound)?\s*bag/i);
        if (match && match[1] && match[3]) {
          return {
            text: `${match[1]} ${match[3]} bag`,
            amount: parseFloat(match[1]),
            unit: `${match[3]} bag`
          };
        }
        if (match && match[1]) {
          return {
            text: `${match[1]} bag`,
            amount: parseFloat(match[1]),
            unit: 'bag'
          };
        }
        return {
          text: 'Per bag',
          amount: 1,
          unit: 'bag'
        };
      }
      
      // Bunches (for items like bananas)
      if (lowerName.includes(' bunch')) {
        return {
          text: 'Per bunch',
          amount: 1,
          unit: 'bunch'
        };
      }
      
      // Common container types
      if (lowerName.includes(' jar') || lowerName.includes(' bottle') || 
          lowerName.includes(' can') || lowerName.includes(' box')) {
        return {
          text: 'Per container',
          amount: 1,
          unit: 'container'
        };
      }
      
      // If we couldn't detect a specific unit
      return {
        text: 'Unknown',
        amount: null,
        unit: 'unknown'
      };
    };
    
    // Calculate unit price if possible
    const calculateUnitPrice = (price: number | null, unitInfo: ReturnType<typeof extractUnitInfo>) => {
      if (price === null || unitInfo.amount === null) {
        return null;
      }
      
      // Return price per unit
      return price / unitInfo.amount;
    };
    
    // Find best item for each product type
    const bestItemsByName = new Map<string, string | undefined>();
    
    // Group items by name first
    const itemsByName = new Map<string, Array<{name: string; price: number | null; productName?: string}>>(); 
    
    if (selectedStore.items) {
      selectedStore.items.forEach(item => {
        if (!itemsByName.has(item.name)) {
          itemsByName.set(item.name, []);
        }
        itemsByName.get(item.name)?.push(item);
      });
      
      // For each name group, find the lowest price item and mark its productName
      itemsByName.forEach((items, name) => {
        let lowestPrice = Infinity;
        let bestProductName: string | undefined = undefined;
        
        items.forEach(item => {
          if (item.price !== null && item.price < lowestPrice) {
            lowestPrice = item.price;
            bestProductName = item.productName;
          }
        });
        
        bestItemsByName.set(name, bestProductName);
      });
    }

    return (
      <Box sx={{ mt: 3 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            {selectedStore.name} - Available Items
            </Typography>
          
          <Divider sx={{ mb: 2 }} />
          
          {selectedStore.items && selectedStore.items.length > 0 ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Item</TableCell>
                    <TableCell>Exact Product Name</TableCell>
                    <TableCell>Unit</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Unit Price</TableCell>
                    <TableCell align="right">Best Price?</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedStore.items.map((item, index) => {
                    // Only mark as best price if:
                    // 1. This store has the best price for this item across all stores
                    // 2. This specific product is the cheapest for this item within this store
                    const isGlobalBest = findCheapestStoreForItem(item.name) === selectedStore.name;
                    const isLocalBest = item.productName && bestItemsByName.get(item.name) === item.productName;
                    
                    // Find the lowest price for this item from this store
                    const itemsWithSameName = selectedStore.items?.filter(i => i.name === item.name) || [];
                    const lowestPriceItem = itemsWithSameName.reduce((lowest, current) => {
                      if (current.price === null) return lowest;
                      if (lowest.price === null) return current;
                      return current.price < lowest.price ? current : lowest;
                    }, { price: Infinity as any });
                    
                    // Only mark as best price if this is the actual lowest price item
                    const isLowestPrice = item.price !== null && 
                                         lowestPriceItem.price !== Infinity && 
                                         item.price === lowestPriceItem.price;
                    
                    // Combined check: must be both global best AND lowest price in this store
                    const isBestPrice = isGlobalBest && isLowestPrice;
                    
                    // Extract unit information from the product name
                    const unitInfo = extractUnitInfo(item.productName || item.name);
                    
                    // Calculate unit price if possible
                    const unitPrice = calculateUnitPrice(item.price, unitInfo);
                    
                    // Determine if the name is generic - check both the new flag and do our own check
                    const isGenericName = 
                      item.isGenericName || // Use the flag from the scraper if available
                      item.productName === item.name || 
                      !item.productName || 
                      item.productName.trim() === item.name.trim();
                    
                    // Use "Harris Teeter" product naming from Google Shopping for generic items
                    let displayName = item.productName || item.name;
                    
                    // If it's a generic name, mark it appropriately
                    if (isGenericName) {
                      // Check if we have specific product details from Google Shopping by price
                      if (item.price !== null) {
                        const price = item.price; // Create a non-null variable to use
                        // Use a mapping of known products from Google Shopping for this store/item/price combination
                        const storeProductMap: Record<string, Record<string, Record<number, string>>> = {
                          "Harris Teeter": {
                            "apples": {
                              1.94: "Large Gala Apple - Each",
                              5.99: "Cripps Pink Apples 3 lb",
                              1.59: "Small Red Delicious Apple – Each",
                              1.00: "McIntosh Apples 1 lb",
                              1.76: "Small Organic Fuji Apples",
                              6.99: "Cosmic Crisp Premium Apples"
                            },
                            "peaches": {
                              1.49: "Pampa Peaches in Light Syrup",
                              1.69: "Del Monte Sliced Peaches in Extra Light Syrup",
                              1.79: "Del Monte Yellow Cling Sliced Peaches",
                              2.00: "Fresh White Peach - Each",
                              2.79: "Del Monte Harvest Spice Sliced Peaches 15 oz",
                              3.39: "Del Monte Sliced Yellow Cling Peaches in Heavy Syrup",
                              4.49: "Dole Yellow Cling Sliced Peaches",
                              5.99: "Native Forest Organic Sliced Peaches 15 oz",
                              10.49: "Seal The Seasons Sliced Peaches"
                            }
                          },
                          "Walmart": {
                            "apples": {
                              0.62: "Fresh Gala Apple",
                              0.86: "Fresh Granny Smith Apples",
                              1.05: "Fresh Fuji Apple",
                              1.17: "Fresh Pink Lady Apple",
                              3.56: "Gala Apples 3 lb Bag",
                              3.97: "Fresh Pink Lady Apples, 3lb Bag",
                              4.96: "Granny Smith Apples 3 lb Bag"
                            }
                          },
                          "Target": {
                            "apples": {
                              1.59: "Honeycrisp Apple",
                              3.49: "Good & Gather Organic Gala Apples",
                              3.79: "Good & Gather Gala Apples",
                              4.39: "Good & Gather Fuji Apples",
                              4.59: "Good & Gather Red Delicious Apples",
                              4.99: "Good & Gather Granny Smith Apples",
                              6.99: "Good & Gather Organic Honeycrisp Apples",
                              8.29: "Good & Gather Honeycrisp Apples"
                            }
                          }
                        };
                        
                        // Try to find a specific product name for this store/item/price
                        const storeProducts = storeProductMap[selectedStore.name] || null;
                        if (storeProducts) {
                          const itemProducts = storeProducts[item.name.toLowerCase()] || null;
                          if (itemProducts && price in itemProducts) {
                            // Only use exact price matches from Google Shopping
                            displayName = itemProducts[price];
                          } else {
                            // Don't use approximations - mark as unknown if we don't have an exact match
                            displayName = `${item.name} (Unknown Variety)`;
                          }
                        } else {
                          displayName = `${item.name} (Unknown Variety)`;
                        }
                      } else {
                        displayName = `${item.name} (Unknown Variety)`;
                      }
                    }
                  
                  return (
                      <TableRow key={`${item.name}-${index}-${item.productName ? item.productName.substring(0, 10) : ''}`}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>
                          <Tooltip title={displayName}>
                            <Typography 
                sx={{ 
                                maxWidth: { xs: '120px', sm: '250px', md: '400px' },
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'normal',
                                display: 'block',
                                maxHeight: '2.6em',
                                lineHeight: '1.3em'
                              }}
                            >
                              {displayName}
                    </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {unitInfo.text}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {item.price !== null ? (
                  <Typography 
                                  variant="body2" 
                              color={isBestPrice ? 'success.main' : 'inherit'}
                              fontWeight={isBestPrice ? 'bold' : 'normal'}
                            >
                              ${item.price.toFixed(2)}
                            </Typography>
                          ) : '—'}
                        </TableCell>
                        <TableCell align="right">
                          {unitPrice !== null ? (
                            <Typography variant="caption" color="text.secondary">
                              ${unitPrice.toFixed(2)}/{unitInfo.unit}
                            </Typography>
                          ) : '—'}
                        </TableCell>
                        <TableCell align="right">
                          {isBestPrice ? (
                            <Chip size="small" color="success" label="Best Price" />
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No items found at this store.
                  </Typography>
                              )}
          
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button size="small" onClick={() => onStoreSelect(null)}>
              Close
            </Button>
                  </Box>
        </Paper>
      </Box>
    );
  };
                      
                      return (
    <Container maxWidth="lg">
      {/* Map Section - Always visible */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5" component="h2">
            Nearby Stores
                          </Typography>
                          </Box>
        
        <Box 
          sx={{ 
            height: 300, 
            mb: 3, 
            borderRadius: 1, 
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }} 
          ref={mapRef}
        >
          {!currentLocation && !isLocatingStores && (
            <Box sx={{ textAlign: 'center', p: 2 }}>
              <Typography variant="body1" color="text.secondary">
                Enable location services to see nearby stores
              </Typography>
            </Box>
          )}
          
          {isLocatingStores && (
            <Box 
              sx={{ 
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <CircularProgress size={50} thickness={4} color="primary" />
              <Typography variant="h6" sx={{ mt: 2 }}>
                Finding Nearby Stores...
              </Typography>
              <LinearProgress sx={{ width: '60%', mt: 2 }} />
            </Box>
          )}
        </Box>
      </Box>
      
      {/* Store List Section */}
      {stores.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Found {limitedStores.length} stores nearby
          </Typography>
          <TableContainer component={Paper}>
            <Table size="small">
                  <TableHead>
                    <TableRow>
                  <TableCell>Store</TableCell>
                  <TableCell>Distance</TableCell>
                  <TableCell align="right">Items Found</TableCell>
                  <TableCell align="right">Cheapest Item</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                {limitedStores.map((store) => {
                  // Ensure store has a distance value, default to null if undefined
                  const storeDistance = typeof store.distance === 'number' ? store.distance : null;
                  const cheapestItem = store.items && store.items.length > 0 ? 
                    store.items.reduce<{ name: string; price: number | null; lastUpdated: string | null; } | null>((cheapest, item) => {
                      if (!cheapest || (item.price !== null && (cheapest.price === null || item.price < cheapest.price))) {
                        return item;
                      }
                      return cheapest;
                    }, null) : null;
                  
                  // Check if this store has the cheapest item for any item
                  const hasCheapestItem = storeHasCheapestItem(store);
                            
                            return (
                    <TableRow 
                      key={store.id || store.name}
                      sx={{ 
                        cursor: 'pointer',
                        '&:hover': { backgroundColor: 'action.hover' },
                        ...(hasCheapestItem && { 
                          backgroundColor: 'rgba(76, 175, 80, 0.08)'
                        })
                      }}
                      onClick={() => handleStoreSelect(store)}
                    >
                      <TableCell>
                                    <Typography
                                      variant="body2"
                          component="span"
                                      sx={{
                            fontWeight: hasCheapestItem ? 'bold' : 'normal',
                            display: 'flex',
                            alignItems: 'center' 
                                      }}
                                    >
                          {hasCheapestItem && (
                            <Tooltip title="Has cheapest item">
                              <StarIcon color="primary" fontSize="small" sx={{ mr: 1 }} />
                                  </Tooltip>
                          )}
                          {store.name}
                        </Typography>
                              </TableCell>
                      <TableCell>
                        {storeDistance !== null ? `${storeDistance.toFixed(1)} mi` : 'Unknown distance'}
                      </TableCell>
                      <TableCell align="right">
                        {store.items ? `${store.items.length}/${items.length}` : '0/0'}
                      </TableCell>
                      <TableCell align="right">
                        {cheapestItem && cheapestItem.price !== null ? (
                          <Typography
                            variant="body2"
                            color={findCheapestStoreForItem(cheapestItem.name) === store.name ? 'success.main' : 'inherit'}
                            fontWeight={findCheapestStoreForItem(cheapestItem.name) === store.name ? 'bold' : 'normal'}
                          >
                            ${cheapestItem.price.toFixed(2)}
                            {findCheapestStoreForItem(cheapestItem.name) === store.name && (
                              <Typography variant="caption" sx={{ color: 'success.main', ml: 0.5 }}>
                                (Best)
                              </Typography>
                            )}
                          </Typography>
                        ) : '—'}
                      </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
        </Box>
        )}

      {selectedStore && renderSelectedStoreDetails()}
    </Container>
  );
};

export default StoreComparison;
