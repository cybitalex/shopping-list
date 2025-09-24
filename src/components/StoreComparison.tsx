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
  Alert,
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
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@mui/material";
import { isMilitaryStore } from "../api/priceApi";

// Get the token from environment variables
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
// Set Mapbox token
mapboxgl.accessToken = MAPBOX_TOKEN || "";

interface StoreItem {
  name: string;
  price: number | null;
  lastUpdated: string | null;
  productName?: string;
  isGenericName?: boolean;
  productDetail?: string | null;
}

interface StoreComparisonProps {
  items: Array<{ name: string }>;
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
      const endpoint = request.endpoint || "fetch-price";
      console.log(
        `Processing queued request for ${request.item} at ${request.store} using ${endpoint}`
      );

      // Create a more robust fetch request with explicit headers
      const fetchOptions = {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "same-origin" as RequestCredentials,
      };

      // Add a cache buster to prevent browser caching
      const cacheBuster = `&_t=${Date.now()}`;
      const url = `/api/${endpoint}?item=${encodeURIComponent(
        request.item
      )}&store=${encodeURIComponent(request.store)}${
        endpoint === "fetch-price" ? "&fallback=false" : ""
      }${cacheBuster}`;

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.price !== null) {
        request.callback(data);
      } else {
        throw new Error("Invalid data received from server");
      }
    } catch (error) {
      console.error(
        `Error in queued fetch for ${request.item} at ${request.store}:`,
        error
      );
      request.callback(null);
    } finally {
      // If we've reached our limit, clear the queue to prevent more requests
      if (processedRequests >= MAX_REQUESTS && priceRequestQueue.length > 0) {
        console.log(
          `Reached maximum of ${MAX_REQUESTS} requests, clearing ${priceRequestQueue.length} remaining items`
        );
        priceRequestQueue.length = 0;
      }
    }

    // Add a delay between requests
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  isProcessingQueue = false;

  // If there are more items in the queue, process them after a delay
  if (priceRequestQueue.length > 0) {
    setTimeout(() => {
      processQueue();
    }, 500);
  }
};

const FetchPriceOnDemand: React.FC<FetchPriceOnDemandProps> = ({
  item,
  store,
  onPriceReceived,
}) => {
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
        const response = await fetch(
          `/api/fetch-price?item=${encodeURIComponent(
            item
          )}&store=${encodeURIComponent(store === "" ? "nearby" : store)}`
        );

        if (!response.ok) {
          throw new Error(`Network response was not ok: ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.price !== null) {
          onPriceReceived(data);
        } else {
          throw new Error("Invalid data received from server");
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
    <Box sx={{ minHeight: 30, display: "flex", alignItems: "center" }}>
      {isLoading ? (
        <CircularProgress size={16} sx={{ mr: 1 }} />
      ) : hasError ? (
        <Tooltip title="Error fetching price">
          <Chip size="small" label="Error" color="error" variant="outlined" />
        </Tooltip>
      ) : null}
    </Box>
  );
};

// Group similar stores together to avoid duplicates but preserve complete store names for certain chains
const groupSimilarStores = (stores: BaseStore[]): BaseStore[] => {
  // We'll use place_id as the unique identifier to avoid grouping
  // This ensures all stores from API are maintained individually
  const uniqueStores = new Map<string, BaseStore>();

  for (const store of stores) {
    const storeId = store.place_id || store.id || store.name;
    if (!uniqueStores.has(storeId)) {
      uniqueStores.set(storeId, store);
    } else {
      // If we have a duplicate, keep the one with the shorter distance
      const existingStore = uniqueStores.get(storeId)!;
      if (store.distance < existingStore.distance) {
        uniqueStores.set(storeId, store);
      }
    }
  }

  // Sort by distance
  return Array.from(uniqueStores.values()).sort(
    (a, b) => a.distance - b.distance
  );
};

// Add this after the processQueue function
const batchProcessPrices = async (
  items: string[],
  stores: BaseStore[]
): Promise<Map<string, Map<string, PriceResult>>> => {
  console.log(
    `Starting batch price processing for ${items.length} items at ${stores.length} stores`
  );
  const results = new Map<string, Map<string, PriceResult>>();

  // Initialize the results map
  for (const item of items) {
    results.set(item, new Map<string, PriceResult>());
  }

  // First try to get prices for all items at once using currentLocation
  const currentLocationPrices = await Promise.all(
    items.map(async (item) => {
      try {
        const response = await fetch(
          `/api/google-price?item=${encodeURIComponent(item)}`
        );
        if (!response.ok) throw new Error(`Network error: ${response.status}`);

        const data = await response.json();
        if (data.success && data.stores) {
          console.log(
            `Found ${data.stores.length} stores for ${item} with Google Shopping Scraper`
          );

          // Process each store's results
          for (const storeData of data.stores) {
            const storeName = storeData.name;

            // Get the first (usually cheapest) item for this store
            if (storeData.items && storeData.items.length > 0) {
              const itemData = storeData.items[0];

              // Extract price as number
              const priceText = itemData.price || "0";
              const price = parseFloat(priceText.replace("$", "")) || 0;

              // Create result object
              const result: PriceResult = {
                price,
                productName: itemData.name || item,
                source: "google-shopping-scraper",
                store: storeName,
                fullStoreName: storeName,
                url: "",
                isEstimate: false,
                returnPolicy: itemData.returnsPolicy,
                rating: itemData.rating
                  ? parseFloat(itemData.rating)
                  : undefined,
                reviewCount: itemData.reviewCount
                  ? parseInt(itemData.reviewCount.replace(/[^0-9]/g, ""))
                  : undefined,
                method: itemData.method,
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
    .filter((result) => !result.success)
    .map((result) => result.item);

  if (failedItems.length > 0) {
    console.log(
      `Fetching individual store prices for ${failedItems.length} items that failed batch processing`
    );

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
              const response = await fetch(
                `/api/google-price?item=${encodeURIComponent(
                  item
                )}&store=${encodeURIComponent(store.name)}&lat=${
                  store.latitude || ""
                }&lng=${store.longitude || ""}`
              );
              if (!response.ok) return null;

              const data = await response.json();
              if (data.success && data.price) {
                const result: PriceResult = {
                  price: data.price,
                  productName: data.productName || item,
                  source: data.source,
                  store: store.name,
                  fullStoreName: data.fullStoreName || store.name,
                  url: data.url || "",
                  isEstimate: !!data.isEstimate,
                  returnPolicy: data.returnPolicy,
                  rating: data.rating,
                  reviewCount: data.reviewCount,
                };

                const itemMap = results.get(item);
                if (itemMap) {
                  itemMap.set(store.name, result);
                }
              }
            } catch (error) {
              console.error(
                `Error fetching price for ${item} at ${store.name}:`,
                error
              );
              // Skip this item/store combination if there's an error
            }
          });

          await Promise.all(itemPromises);
        })
      );

      // Add a small delay between chunks
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
};

// Add this function to find the cheapest store based on batch results
const findCheapestStoreFromBatch = (
  priceResults: Map<string, Map<string, PriceResult>>,
  stores: BaseStore[]
): {
  store: BaseStore | null;
  totalPrice: number;
  savings: Record<string, number>;
} => {
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
  let cheapestStoreFound: BaseStore | null = null;
  let lowestTotal = Infinity;

  for (const store of stores) {
    // Only consider stores that have prices for all items
    if (itemsFoundAtStore[store.name] === itemCount) {
      if (storeTotals[store.name] < lowestTotal) {
        lowestTotal = storeTotals[store.name];
        cheapestStoreFound = store;
      }
    }
  }

  // Calculate potential savings at cheapest store vs. each other store
  const savings: Record<string, number> = {};
  if (cheapestStoreFound) {
    for (const store of stores) {
      if (
        store.name !== cheapestStoreFound.name &&
        itemsFoundAtStore[store.name] === itemCount
      ) {
        savings[store.name] = storeTotals[store.name] - lowestTotal;
      }
    }
  }

  return {
    store: cheapestStoreFound,
    totalPrice: lowestTotal === Infinity ? 0 : lowestTotal,
    savings,
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
  setStores,
}) => {
  const [storeProducts, setStoreProducts] = useState<{
    [key: string]: Product[];
  }>({});
  const [prices, setPrices] = useState<
    Record<string, Record<string, PriceResult>>
  >({});
  const [expandedStore, setExpandedStore] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [mapOpen, setMapOpen] = useState<boolean>(true);
  const [useWebScraper, setUseWebScraper] = useState<boolean>(true);
  const [useFastBatchProcessing, setUseFastBatchProcessing] =
    useState<boolean>(true);
  const [batchProcessingStatus, setBatchProcessingStatus] =
    useState<string>("");
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(
    new Set()
  );
  const [locationRequested, setLocationRequested] = useState(false);
  const [cheapestItemStores, setCheapestItemStores] = useState<
    Record<string, string[]>
  >({});
  const [allPricesFetched, setAllPricesFetched] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [showMap, setShowMap] = useState(true);
  const [storesWithItems, setStoresWithItems] = useState<BaseStore[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Use all stores directly instead of limiting to a fixed number
  const availableStores = stores;

  // Update stores with items when items change
  useEffect(() => {
    if (items.length > 0) {
      const updatedStores = stores.map((store) => ({
        ...store,
        items: items.map((item) => ({
          ...item,
          price: null,
          lastUpdated: null,
        })),
      }));
      setStoresWithItems(updatedStores);
    } else {
      setStoresWithItems([]);
    }
  }, [items, stores]);

  // Automatic batch processing disabled - only process on manual refresh button click
  // useEffect(() => {
  //   const shouldTriggerBatchProcessing =
  //     items.length > 0 &&
  //     stores.length > 0 &&
  //     useFastBatchProcessing &&
  //     !loading;

  //   if (shouldTriggerBatchProcessing) {
  //     console.log(
  //       `🚀 Triggering batch price processing for ${items.length} items at ${stores.length} stores`
  //     );

  //     const handleBatchProcessing = async () => {
  //       setLoading(true);
  //       setBatchProcessingStatus(
  //         `Processing ${items.length} items at ${stores.length} stores...`
  //       );

  //       try {
  //         const itemNames = items.map((item) => item.name);
  //         const batchResults = await batchProcessPrices(itemNames, stores);

  //         // Convert batch results to the format expected by the component
  //         const newPrices: Record<string, Record<string, PriceResult>> = {};

  //         batchResults.forEach((storeMap, itemName) => {
  //           if (!newPrices[itemName]) {
  //             newPrices[itemName] = {};
  //           }
  //           storeMap.forEach((result, storeName) => {
  //             newPrices[itemName][storeName] = result;
  //           });
  //         });

  //         setPrices(newPrices);

  //         // Update stores with the fetched prices
  //         const updatedStores = stores.map((store) => ({
  //           ...store,
  //           items: itemNames.map((itemName) => {
  //             const storePrice = newPrices[itemName]?.[store.name];
  //             return {
  //               name: itemName,
  //               price: storePrice?.price || null,
  //               lastUpdated: storePrice ? new Date().toISOString() : null,
  //               productName: storePrice?.productName,
  //               isGenericName: !storePrice?.productName,
  //               productDetail: storePrice?.source || null,
  //             };
  //           }),
  //         }));

  //         setStores(updatedStores);
  //         setBatchProcessingStatus("");

  //         console.log(
  //           `✅ Batch processing completed for ${items.length} items`
  //         );
  //       } catch (error) {
  //         console.error("Batch processing failed:", error);
  //         setBatchProcessingStatus("Error processing prices");
  //         onError("Failed to fetch prices");
  //       } finally {
  //         setLoading(false);
  //       }
  //     };

  //     // Debounce the batch processing to avoid rapid-fire requests
  //     const timeoutId = setTimeout(handleBatchProcessing, 1000);
  //     return () => clearTimeout(timeoutId);
  //   }
  // }, [items, stores, useFastBatchProcessing, loading]);

  // Fetch Mapbox token from backend
  useEffect(() => {
    const fetchMapboxToken = async () => {
      try {
        const response = await fetch("/api/mapbox-token");
        if (response.ok) {
          const data = await response.json();
          setMapboxToken(data.token);
        }
      } catch (error) {
        console.error("Error fetching Mapbox token:", error);
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
          style: "mapbox://styles/mapbox/streets-v11",
          center: [currentLocation.lng, currentLocation.lat],
          zoom: 11,
        });

        // Add user location marker
        const userMarker = new mapboxgl.Marker({ color: "#4285F4" })
          .setLngLat([currentLocation.lng, currentLocation.lat])
          .addTo(mapInstance.current);

        markers.current.push(userMarker);

        // Add markers for each store - use all available stores
        availableStores.forEach((store) => {
          if (store.latitude && store.longitude) {
            const storeMarker = new mapboxgl.Marker({ color: "#0F9D58" })
              .setLngLat([store.longitude, store.latitude])
              .setPopup(
                new mapboxgl.Popup({ offset: 25 }).setHTML(
                  `<h3>${store.name}</h3><p>${
                    typeof store.distance === "number"
                      ? `${store.distance.toFixed(1)} miles away`
                      : "Distance unknown"
                  }</p>`
                )
              )
              .addTo(mapInstance.current!);

            markers.current.push(storeMarker);
          }
        });

        // Add navigation controls
        mapInstance.current.addControl(
          new mapboxgl.NavigationControl(),
          "top-right"
        );
      } catch (error) {
        console.error("Error initializing map:", error);
        onError(
          error instanceof Error ? error.message : "Failed to initialize map"
        );
      }
    }

    // Cleanup on component unmount
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      markers.current = [];
    };
  }, [currentLocation, availableStores, mapboxToken, onError]);

  // Calculate store totals using the new data structure
  const storeTotals = useMemo(() => {
    return stores.reduce((acc: Record<string, number>, store) => {
      if (!store.place_id) return acc;

      const total = (store.items || []).reduce((sum: number, item) => {
        return sum + (typeof item.price === "number" ? item.price : 0);
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
    const store = stores.find((s) => s.name === storeName);
    return store?.place_id ? storeTotals[store.place_id] || 0 : 0;
  };

  const handleRequestLocation = () => {
    if (onRequestLocation) {
      onRequestLocation();
      setLocationRequested(true);
    }
  };

  const handleStoreSelect = (store: BaseStore) => {
    console.log("StoreComparison.handleStoreSelect called with:", store);
    onStoreSelect(store);
  };

  // Find the cheapest store for each item
  const findCheapestStoreForItem = (itemName: string): string | null => {
    let cheapestStoreName = null;
    let lowestPrice = Infinity;

    // First, check all stores to find the lowest price for this item
    availableStores.forEach((store) => {
      const item = store.items?.find((i) => i.name === itemName);
      if (item && item.price !== null && item.price < lowestPrice) {
        lowestPrice = item.price;
        cheapestStoreName = store.name;
      }
    });

    // Only return the cheapest store if there's a valid lowest price
    // and ensure it's not comparing undefined or null values
    return lowestPrice < Infinity ? cheapestStoreName : null;
  };

  // Check if store has any cheapest items
  const storeHasCheapestItem = (store: BaseStore): boolean => {
    if (!store.items) return false;

    // Check each item in the store to see if any is the cheapest
    return store.items.some(
      (item) => findCheapestStoreForItem(item.name) === store.name
    );
  };

  // Get cheapest store overall
  const cheapestOverallStore = useMemo(() => {
    const storeAvgPrices = availableStores.map((store) => {
      const validPrices =
        store.items
          ?.filter((item) => item.price !== null)
          .map((item) => item.price as number) || [];

      const totalPrice = validPrices.reduce((sum, price) => sum + price, 0);
      const avgPrice =
        validPrices.length > 0 ? totalPrice / validPrices.length : Infinity;

      return { name: store.name, avgPrice, totalPrice };
    });

    storeAvgPrices.sort((a, b) => a.totalPrice - b.totalPrice);
    return storeAvgPrices.length > 0 ? storeAvgPrices[0].name : null;
  }, [availableStores]);

  // Updated renderSelectedStoreDetails function to handle selectedStore correctly
  const renderSelectedStoreDetails = () => {
    if (!selectedStore) return null;

    // Extract unit information and quantity from the product name
    const extractUnitInfo = (productName: string) => {
      const lowerName = productName.toLowerCase();

      // Special case for fruits - check for specific fruit pricing patterns
      const fruitNames = [
        "apple",
        "banana",
        "orange",
        "grape",
        "strawberry",
        "blueberry",
        "cherry",
        "peach",
        "pear",
        "mango",
        "pineapple",
        "watermelon",
        "cantaloupe",
        "honeydew",
      ];
      const isFruit = fruitNames.some((fruit) => lowerName.includes(fruit));

      // Per pound indicators (highest priority for fruits)
      if (
        lowerName.includes(" per lb") ||
        lowerName.includes(" per pound") ||
        lowerName.includes("/lb") ||
        (isFruit && (lowerName.includes(" lb") || lowerName.includes(" pound")))
      ) {
        return {
          text: "Per Pound",
          amount: 1,
          unit: "lb",
          pricingType: "per pound",
          description: "Price per pound",
        };
      }

      // Individual fruit pricing
      if (
        isFruit &&
        (lowerName.includes(" each") ||
          lowerName.includes("- each") ||
          lowerName.includes(" per item") ||
          lowerName.includes("individual") ||
          lowerName.includes("single"))
      ) {
        return {
          text: "Each",
          amount: 1,
          unit: "each",
          pricingType: "individually",
          description: "Price per individual fruit",
        };
      }

      // Bunch pricing (especially for bananas, grapes)
      if (
        lowerName.includes(" bunch") ||
        (isFruit && lowerName.includes("bunch"))
      ) {
        return {
          text: "Per Bunch",
          amount: 1,
          unit: "bunch",
          pricingType: "per bunch",
          description: "Price per bunch",
        };
      }

      // Bag pricing with weight specification
      if (lowerName.includes(" bag")) {
        const bagMatch = lowerName.match(
          /(\d+(\.\d+)?)\s*(lb|pound|oz|ounce)?\s*bag/i
        );
        if (bagMatch && bagMatch[1] && bagMatch[3]) {
          const amount = parseFloat(bagMatch[1]);
          const unit = bagMatch[3].toLowerCase();
          const normalizedUnit =
            unit === "pound" || unit === "lb"
              ? "lb"
              : unit === "ounce" || unit === "oz"
              ? "oz"
              : unit;
          return {
            text: `${amount} ${normalizedUnit} bag`,
            amount: amount,
            unit: `${normalizedUnit}`,
            pricingType: "per bag",
            description: `${amount} ${normalizedUnit} bag`,
          };
        }
        if (bagMatch && bagMatch[1]) {
          const amount = parseFloat(bagMatch[1]);
          return {
            text: `${amount} item bag`,
            amount: amount,
            unit: "bag",
            pricingType: "per bag",
            description: `${amount} item bag`,
          };
        }
        return {
          text: "Per Bag",
          amount: 1,
          unit: "bag",
          pricingType: "per bag",
          description: "Price per bag",
        };
      }

      // Weight-based units (pounds, ounces, grams)
      const weightMatch = lowerName.match(
        /(\d+(\.\d+)?)\s*(lb|pound|oz|ounce|g|gram|kg|kilogram)/i
      );
      if (weightMatch) {
        const amount = parseFloat(weightMatch[1]);
        let unit = weightMatch[3].toLowerCase();

        // Normalize units
        if (unit === "pound" || unit === "lb") unit = "lb";
        else if (unit === "ounce" || unit === "oz") unit = "oz";
        else if (unit === "gram" || unit === "g") unit = "g";
        else if (unit === "kilogram" || unit === "kg") unit = "kg";

        return {
          text: `${amount} ${unit} package`,
          amount: amount,
          unit: unit,
          pricingType: "per package",
          description: `${amount} ${unit} package`,
        };
      }

      // Count-based units (pack, count, etc.)
      const countMatch = lowerName.match(
        /(\d+)[\s-]*(ct|count|pack|pk|piece|pc)/i
      );
      if (countMatch) {
        const amount = parseInt(countMatch[1], 10);
        let unit = countMatch[2].toLowerCase();

        // Normalize units
        if (unit === "count" || unit === "ct") unit = "count";
        else if (unit === "pack" || unit === "pk") unit = "pack";
        else if (unit === "piece" || unit === "pc") unit = "piece";

        return {
          text: `${amount} ${unit}`,
          amount: amount,
          unit: unit,
          pricingType: "per package",
          description: `${amount} ${unit} package`,
        };
      }

      // Volume-based units (fl oz, ml, l, gallons)
      const volumeMatch = lowerName.match(
        /(\d+(\.\d+)?)\s*(fl oz|ml|l|liter|gallon|gal|qt|quart)/i
      );
      if (volumeMatch) {
        const amount = parseFloat(volumeMatch[1]);
        let unit = volumeMatch[3].toLowerCase();

        // Normalize units
        if (unit === "fl oz") unit = "fl oz";
        else if (unit === "ml") unit = "ml";
        else if (unit === "l" || unit === "liter") unit = "liter";
        else if (unit === "gallon" || unit === "gal") unit = "gallon";
        else if (unit === "quart" || unit === "qt") unit = "quart";

        return {
          text: `${amount} ${unit}`,
          amount: amount,
          unit: unit,
          pricingType: "per container",
          description: `${amount} ${unit} container`,
        };
      }

      // Items sold individually (general)
      if (
        lowerName.includes(" each") ||
        lowerName.includes("- each") ||
        lowerName.includes(" per item")
      ) {
        return {
          text: "Each",
          amount: 1,
          unit: "each",
          pricingType: "individually",
          description: "Price per individual item",
        };
      }

      // Common container types
      if (
        lowerName.includes(" jar") ||
        lowerName.includes(" bottle") ||
        lowerName.includes(" can") ||
        lowerName.includes(" box") ||
        lowerName.includes(" container")
      ) {
        return {
          text: "Per Container",
          amount: 1,
          unit: "container",
          pricingType: "per container",
          description: "Price per container",
        };
      }

      // Per ounce indicators
      if (
        lowerName.includes(" per oz") ||
        lowerName.includes(" per ounce") ||
        lowerName.includes("/oz")
      ) {
        return {
          text: "Per Ounce",
          amount: 1,
          unit: "oz",
          pricingType: "per ounce",
          description: "Price per ounce",
        };
      }

      // Bulk pricing indicators
      if (
        lowerName.includes(" bulk") ||
        lowerName.includes(" family pack") ||
        lowerName.includes(" value pack")
      ) {
        return {
          text: "Bulk Package",
          amount: 1,
          unit: "bulk",
          pricingType: "per bulk package",
          description: "Bulk package pricing",
        };
      }

      // If we couldn't detect a specific unit but it's a fruit, assume per pound (common for loose fruits)
      if (isFruit) {
        return {
          text: "Per Pound (estimated)",
          amount: 1,
          unit: "lb",
          pricingType: "per pound",
          description: "Likely priced per pound (common for loose fruits)",
        };
      }

      // If we couldn't detect a specific unit
      return {
        text: "Unit not specified",
        amount: null,
        unit: "unknown",
        pricingType: "unknown",
        description: "Pricing unit not clearly specified",
      };
    };

    // Calculate unit price if possible
    const calculateUnitPrice = (
      price: number | null,
      unitInfo: ReturnType<typeof extractUnitInfo>
    ) => {
      if (price === null || unitInfo.amount === null) {
        return null;
      }

      // Return price per unit
      return price / unitInfo.amount;
    };

    // Find best item for each product type
    const bestItemsByName = new Map<string, string | undefined>();

    // Group items by name first
    const itemsByName = new Map<
      string,
      Array<{ name: string; price: number | null; productName?: string }>
    >();

    if (selectedStore.items) {
      selectedStore.items.forEach((item) => {
        if (!itemsByName.has(item.name)) {
          itemsByName.set(item.name, []);
        }
        itemsByName.get(item.name)?.push(item);
      });

      // For each name group, find the lowest price item and mark its productName
      itemsByName.forEach((items, name) => {
        let lowestPrice = Infinity;
        let bestProductName: string | undefined = undefined;

        items.forEach((item) => {
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
          <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
            <StorefrontIcon sx={{ mr: 1, color: "primary.main" }} />
            <Typography variant="h6" gutterBottom sx={{ mb: 0 }}>
              {selectedStore.name}
            </Typography>
          </Box>

          {/* Store Address and Details */}
          <Box sx={{ mb: 2, p: 2, bgcolor: "grey.50", borderRadius: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
              <LocationOnIcon
                sx={{ mr: 1, color: "text.secondary", fontSize: 20 }}
              />
              <Typography variant="body2" color="text.secondary">
                📍 {selectedStore.vicinity || "Address not available"}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
              <PlaceIcon
                sx={{ mr: 1, color: "text.secondary", fontSize: 20 }}
              />
              <Typography variant="body2" color="text.secondary">
                📏{" "}
                {typeof selectedStore.distance === "number"
                  ? selectedStore.distance.toFixed(1)
                  : "Unknown"}{" "}
                miles away
              </Typography>
            </Box>
            {selectedStore.rating && (
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <StarIcon sx={{ mr: 1, color: "warning.main", fontSize: 20 }} />
                <Typography variant="body2" color="text.secondary">
                  ⭐ {selectedStore.rating}/5 rating
                </Typography>
              </Box>
            )}
          </Box>

          <Divider sx={{ mb: 2 }} />

          {selectedStore.items && selectedStore.items.length > 0 ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Item</TableCell>
                    <TableCell>Exact Product Name</TableCell>
                    <TableCell>Pricing Type</TableCell>
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
                    const isGlobalBest =
                      findCheapestStoreForItem(item.name) ===
                      selectedStore.name;
                    const isLocalBest =
                      item.productName &&
                      bestItemsByName.get(item.name) === item.productName;

                    // Find the lowest price for this item from this store
                    const itemsWithSameName =
                      selectedStore.items?.filter(
                        (i) => i.name === item.name
                      ) || [];
                    const lowestPriceItem = itemsWithSameName.reduce(
                      (lowest, current) => {
                        if (current.price === null) return lowest;
                        if (lowest.price === null) return current;
                        return current.price < lowest.price ? current : lowest;
                      },
                      { price: Infinity as any }
                    );

                    // Only mark as best price if this is the actual lowest price item
                    const isLowestPrice =
                      item.price !== null &&
                      lowestPriceItem.price !== Infinity &&
                      item.price === lowestPriceItem.price;

                    // Combined check: must be both global best AND lowest price in this store
                    const isBestPrice = isGlobalBest && isLowestPrice;

                    // Extract unit information from the product name
                    const unitInfo = extractUnitInfo(
                      item.productName || item.name
                    );

                    // Calculate unit price if possible
                    const unitPrice = calculateUnitPrice(item.price, unitInfo);

                    // Determine if the name is generic - check both the new flag and do our own check
                    const isGenericName =
                      item.isGenericName || // Use the flag from the scraper if available
                      item.productName === item.name ||
                      !item.productName ||
                      item.productName.trim() === item.name.trim();

                    // Use product name from API or fall back to item name
                    let displayName = item.productName || item.name;

                    // If it's a generic name and we don't have specific details, mark it appropriately
                    if (isGenericName && !item.productDetail) {
                      displayName = `${item.name} (Generic)`;
                    }

                    return (
                      <TableRow
                        key={`${item.name}-${index}-${
                          item.productName
                            ? item.productName.substring(0, 10)
                            : ""
                        }`}
                      >
                        <TableCell>{item.name}</TableCell>
                        <TableCell>
                          <Tooltip title={displayName}>
                            <Typography
                              sx={{
                                maxWidth: {
                                  xs: "120px",
                                  sm: "250px",
                                  md: "400px",
                                },
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "normal",
                                display: "block",
                                maxHeight: "2.6em",
                                lineHeight: "1.3em",
                              }}
                            >
                              {displayName}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={unitInfo.description}>
                            <Box>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ fontWeight: "bold" }}
                              >
                                {unitInfo.pricingType === "per pound"
                                  ? "Per Pound"
                                  : unitInfo.pricingType === "per bag"
                                  ? "Per Bag"
                                  : unitInfo.pricingType === "individually"
                                  ? "Each"
                                  : unitInfo.pricingType === "per package"
                                  ? "Per Package"
                                  : unitInfo.pricingType === "per container"
                                  ? "Per Container"
                                  : unitInfo.pricingType === "per bunch"
                                  ? "Per Bunch"
                                  : unitInfo.pricingType === "per ounce"
                                  ? "Per Ounce"
                                  : unitInfo.pricingType === "per bulk package"
                                  ? "Bulk"
                                  : "Unknown"}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ fontStyle: "italic" }}
                              >
                                {unitInfo.text}
                              </Typography>
                            </Box>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right">
                          {item.price !== null ? (
                            <Typography
                              variant="body2"
                              color={isBestPrice ? "success.main" : "inherit"}
                              fontWeight={isBestPrice ? "bold" : "normal"}
                            >
                              $
                              {typeof item.price === "number"
                                ? item.price.toFixed(2)
                                : "N/A"}
                            </Typography>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {unitPrice !== null ? (
                            <Tooltip
                              title={`${unitInfo.description} - ${unitInfo.text}`}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ fontWeight: "medium" }}
                              >
                                $
                                {typeof unitPrice === "number"
                                  ? unitPrice.toFixed(2)
                                  : "N/A"}
                                /{unitInfo.unit}
                              </Typography>
                            </Tooltip>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {isBestPrice ? (
                            <Tooltip
                              title={`This store has the cheapest ${item.name} available!`}
                            >
                              <Chip
                                size="small"
                                color="success"
                                label="🏆 Best Deal"
                                sx={{ fontWeight: "bold" }}
                              />
                            </Tooltip>
                          ) : (
                            "—"
                          )}
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

          <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
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
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Typography variant="h5" component="h2">
            Nearby Stores
          </Typography>
        </Box>

        <Box
          sx={{
            height: 300,
            mb: 3,
            borderRadius: 1,
            overflow: "hidden",
            border: "1px solid",
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
          ref={mapRef}
        >
          {!currentLocation && !isLocatingStores && (
            <Box sx={{ textAlign: "center", p: 2 }}>
              <Typography variant="body1" color="text.secondary">
                Enable location services to see nearby stores
              </Typography>
            </Box>
          )}

          {isLocatingStores && (
            <Box
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                zIndex: 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CircularProgress size={50} thickness={4} color="primary" />
              <Typography variant="h6" sx={{ mt: 2 }}>
                Finding Nearby Stores...
              </Typography>
              <LinearProgress sx={{ width: "60%", mt: 2 }} />
            </Box>
          )}
        </Box>
      </Box>

      {/* Store List Section */}
      {stores.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Found {availableStores.length} stores nearby
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
                {availableStores.map((store) => {
                  // Ensure store has a distance value, default to null if undefined
                  const storeDistance =
                    typeof store.distance === "number" ? store.distance : null;
                  const cheapestItem =
                    store.items && store.items.length > 0
                      ? store.items.reduce<{
                          name: string;
                          price: number | null;
                          lastUpdated: string | null;
                        } | null>((cheapest, item) => {
                          if (
                            !cheapest ||
                            (item.price !== null &&
                              (cheapest.price === null ||
                                item.price < cheapest.price))
                          ) {
                            return item;
                          }
                          return cheapest;
                        }, null)
                      : null;

                  // Check if this store has the cheapest item for any item
                  const hasCheapestItem = storeHasCheapestItem(store);

                  return (
                    <TableRow
                      key={store.id || store.name}
                      sx={{
                        cursor: "pointer",
                        "&:hover": { backgroundColor: "action.hover" },
                        ...(hasCheapestItem && {
                          backgroundColor: "rgba(76, 175, 80, 0.08)",
                        }),
                      }}
                      onClick={() => handleStoreSelect(store)}
                    >
                      <TableCell>
                        <Tooltip
                          title={
                            <Box>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: "bold" }}
                              >
                                {store.name}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                📍 {store.vicinity || "Address not available"}
                              </Typography>
                              {store.rating && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  display="block"
                                >
                                  ⭐ {store.rating}/5 rating
                                </Typography>
                              )}
                            </Box>
                          }
                          arrow
                          placement="top"
                        >
                          <Typography
                            variant="body2"
                            component="span"
                            sx={{
                              fontWeight: hasCheapestItem ? "bold" : "normal",
                              display: "flex",
                              alignItems: "center",
                              cursor: "pointer",
                            }}
                          >
                            {hasCheapestItem && (
                              <Tooltip title="Has cheapest item">
                                <StarIcon
                                  color="primary"
                                  fontSize="small"
                                  sx={{ mr: 1 }}
                                />
                              </Tooltip>
                            )}
                            {store.name}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Tooltip
                          title={`${
                            storeDistance !== null &&
                            typeof storeDistance === "number"
                              ? storeDistance.toFixed(1)
                              : "Unknown"
                          } miles from your location`}
                          arrow
                          placement="top"
                        >
                          <Typography
                            variant="body2"
                            sx={{ cursor: "pointer" }}
                          >
                            {storeDistance !== null &&
                            typeof storeDistance === "number"
                              ? `${storeDistance.toFixed(1)} mi`
                              : "Unknown distance"}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">
                        {store.items
                          ? `${store.items.length}/${items.length}`
                          : "0/0"}
                      </TableCell>
                      <TableCell align="right">
                        {cheapestItem && cheapestItem.price !== null ? (
                          <Typography
                            variant="body2"
                            color={
                              findCheapestStoreForItem(cheapestItem.name) ===
                              store.name
                                ? "success.main"
                                : "inherit"
                            }
                            fontWeight={
                              findCheapestStoreForItem(cheapestItem.name) ===
                              store.name
                                ? "bold"
                                : "normal"
                            }
                          >
                            $
                            {typeof cheapestItem.price === "number"
                              ? cheapestItem.price.toFixed(2)
                              : "N/A"}
                            {findCheapestStoreForItem(cheapestItem.name) ===
                              store.name && (
                              <Typography
                                variant="caption"
                                sx={{ color: "success.main", ml: 0.5 }}
                              >
                                (Best)
                              </Typography>
                            )}
                          </Typography>
                        ) : (
                          "—"
                        )}
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
