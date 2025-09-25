import { useState, useEffect, useRef } from "react";
import { ThemeProvider, useTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import {
  Box,
  Container,
  Alert,
  Snackbar,
  useMediaQuery,
  Button,
  TextField,
  Grid,
  Typography,
  Paper,
  CircularProgress,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  ViewList as ViewListIcon,
  Map as MapIcon,
} from "@mui/icons-material";
import theme from "./theme";
import GroceryList from "./components/GroceryList";
import StoreComparison from "./components/StoreComparison";
import Header from "./components/Header";
import type { Store as BaseStore } from "./types/store";
import { findNearbyStores } from "./services/places";
import { loadGoogleMaps } from "./utils/googleMaps";
import CheapestItemsSummary from "./components/CheapestItemsSummary";
import MLRecommendations from "./components/MLRecommendations";
import AIAssistant from "./components/AIAssistant";
import { storeCacheService } from "./services/storeCache";
import { mlRecommendationService } from "./services/mlRecommendations";

interface GooglePlacesStore {
  place_id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance: number;
  address: string;
  rating?: number;
  id: string;
}

interface StoreItem {
  name: string;
  price: number | null;
  lastUpdated: string | null;
}

interface StoreWithItems extends BaseStore {
  items: StoreItem[];
}

export interface GroceryItem {
  id: string;
  name: string;
}

interface ComparisonStore extends BaseStore {
  store: string;
  items: Array<{
    name: string;
    price: number | null;
    lastUpdated: string | null;
  }>;
  place_id: string;
}

// Set Mapbox token from environment
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
if (!MAPBOX_TOKEN) {
  console.error("Mapbox token not found. Maps functionality will be limited.");
}

function App() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [stores, setStores] = useState<ComparisonStore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [zipCode, setZipCode] = useState<string>("");
  const [selectedStore, setSelectedStore] = useState<ComparisonStore | null>(
    null
  );
  const [isLocatingStores, setIsLocatingStores] = useState(false);
  const [cheapestStore, setCheapestStore] = useState<ComparisonStore | null>(
    null
  );
  const [locationRequested, setLocationRequested] = useState(false);
  const [showCheapestSummary, setShowCheapestSummary] = useState(false);
  const [storeRecommendations, setStoreRecommendations] = useState<any[]>([]);
  const [useStoreCaching, setUseStoreCaching] = useState(true);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await loadGoogleMaps(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
        // No longer auto-requesting location
      } catch (error) {
        console.error("Initialization error:", error);
        setError("Failed to initialize the application");
      }
    };

    initializeApp();
  }, []);

  // Automatic price refresh disabled - only refresh on manual button click
  // useEffect(() => {
  //   if (items.length > 0 && stores.length > 0 && currentLocation) {
  //     console.log(
  //       `🔄 Items changed - triggering fresh price search for ${items.length} items`
  //     );
  //     const itemNames = items.map((item) => item.name);

  //     // Update stores to match current items with null prices
  //     const updatedStores = stores.map((store) => ({
  //       ...store,
  //       items: itemNames.map((itemName) => ({
  //         name: itemName,
  //         price: null,
  //         lastUpdated: null,
  //         productName: undefined,
  //         isGenericName: true,
  //         productDetail: null,
  //       })),
  //     }));

  //     setStores(updatedStores);
  //     setShowCheapestSummary(false); // Hide summary until new prices are fetched
  //   }
  // }, [items]); // Only depend on items, not stores to avoid infinite loops

  const getCurrentLocation = async () => {
    setIsLocatingStores(true);
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        }
      );

      const { latitude, longitude } = position.coords;
      const location = { lat: latitude, lng: longitude };
      setCurrentLocation(location);

      console.log("Searching for stores near current location");
      const nearbyStores = await findNearbyStores(latitude, longitude);
      console.log(`Found ${nearbyStores.length} stores near current location`);

      // Sort stores by distance and ensure we're keeping all stores
      const sortedStores = [...nearbyStores].sort(
        (a, b) => a.distance - b.distance
      );
      console.log(
        "Store names received:",
        sortedStores.map((store) => store.name).join(", ")
      );
      setStores(
        sortedStores.map((store) => ({
          ...store,
          store: store.name,
          place_id: store.place_id || store.id,
          items: items.map((item) => ({
            name: item.name,
            price: null,
            lastUpdated: null,
          })),
        })) as ComparisonStore[]
      );
      setShowCheapestSummary(false); // Hide summary when setting stores without prices
    } catch (err) {
      console.error("Location error:", err);
      setError(err instanceof Error ? err.message : "Failed to get location");
    } finally {
      setIsLocatingStores(false);
    }
  };

  const searchByZipCode = async () => {
    if (!zipCode.trim()) {
      setError("Please enter a valid zip code");
      return;
    }

    setIsLocatingStores(true);
    try {
      // Use Google Maps Geocoding API to convert zip code to lat/lng
      const geocoder = new google.maps.Geocoder();
      const result = await new Promise<google.maps.GeocoderResult[]>(
        (resolve, reject) => {
          geocoder.geocode({ address: zipCode.trim() }, (results, status) => {
            if (
              status === google.maps.GeocoderStatus.OK &&
              results &&
              results.length > 0
            ) {
              resolve(results);
            } else {
              reject(new Error(`Geocoding failed with status: ${status}`));
            }
          });
        }
      );

      // Get the first result's location
      if (result && result.length > 0) {
        const location = result[0].geometry.location;
        const lat = location.lat();
        const lng = location.lng();

        // Clear existing stores first to avoid displaying stores from the previous location
        setStores([]);
        setShowCheapestSummary(false); // Hide summary when clearing stores

        // Update the current location state with the new geocoded coordinates
        setCurrentLocation({ lat, lng });
        console.log(
          `Zip code ${zipCode} geocoded to coordinates: ${lat}, ${lng}`
        );

        // Check if we have items in the grocery list
        const itemNames = items.map((item) => item.name);
        if (itemNames.length === 0) {
          setError("Please add items to your shopping list first");
          return;
        }

        // Search for stores with these items at this location
        // Make sure to use the new lat/lng from the zip code, not currentLocation
        await searchStoresWithItems({ lat, lng }, itemNames);
      } else {
        throw new Error("Could not find location for the provided zip code");
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to search by zip code"
      );
    } finally {
      setIsLocatingStores(false);
    }
  };

  const handleStoreSelect = (store: ComparisonStore | null) => {
    console.log("handleStoreSelect called with store:", store);
    setSelectedStore(store);
    if (store) {
      setCheapestStore(store);

      // Track user behavior for ML if location is available
      if (currentLocation && items.length > 0) {
        // For each item, track if this store was the cheapest option
        items.forEach((item) => {
          const itemInStore = store.items?.find(
            (storeItem) =>
              storeItem.name.toLowerCase() === item.name.toLowerCase()
          );

          if (itemInStore && itemInStore.price !== null) {
            // Check if this was the cheapest option
            const wasCheapest = stores.every((otherStore) => {
              const itemInOtherStore = otherStore.items?.find(
                (otherItem) =>
                  otherItem.name.toLowerCase() === item.name.toLowerCase()
              );
              return (
                !itemInOtherStore ||
                itemInOtherStore.price === null ||
                itemInStore.price! <= itemInOtherStore.price!
              );
            });

            mlRecommendationService.trackUserChoice(
              item,
              store as any,
              itemInStore.price,
              currentLocation,
              wasCheapest
            );
          }
        });
      }
    }
  };

  const handleAddItem = (itemName: string) => {
    const newItem: GroceryItem = {
      id: Date.now().toString(),
      name: itemName,
    };
    setItems((prevItems) => [...prevItems, newItem]);
    setShowCheapestSummary(false); // Hide summary when items are added
  };

  // Enhanced location search that also triggers price search
  const handleFindNearbyPrices = async () => {
    console.log("Searching for stores near current location");

    // Check if we have items in the grocery list
    const itemNames = items.map((item) => item.name);
    if (itemNames.length === 0) {
      setError("Please add items to your shopping list first");
      return;
    }

    // Only clear stores if we won't be using cache, to prevent UI flicker
    if (
      !useStoreCaching ||
      !currentLocation ||
      !storeCacheService.getCachedStores(currentLocation)
    ) {
      setStores([]);
    }
    setSelectedStore(null);
    setCheapestStore(null);
    setShowCheapestSummary(false); // Hide summary when clearing results

    // Get location if we don't have it yet
    if (!currentLocation) {
      setIsLocatingStores(true);
      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0,
            });
          }
        );

        const { latitude, longitude } = position.coords;
        const location = { lat: latitude, lng: longitude };
        setCurrentLocation(location);

        // Continue with store search now that we have location
        await searchStoresWithItems(location, itemNames);
      } catch (err) {
        console.error("Location error:", err);
        setError(err instanceof Error ? err.message : "Failed to get location");
        setIsLocatingStores(false);
      }
      return;
    }

    // If we already have location, search stores directly
    await searchStoresWithItems(currentLocation, itemNames);
  };

  // Separated the store search logic for reusability
  const searchStoresWithItems = async (
    location: { lat: number; lng: number },
    searchItems: string[]
  ) => {
    setIsLocatingStores(true);
    setError(null);
    setShowCheapestSummary(false); // Hide summary while loading

    try {
      // Check cache first if caching is enabled
      if (useStoreCaching) {
        const cachedStores = storeCacheService.getCachedStores(location);
        if (cachedStores && cachedStores.length > 0) {
          console.log(
            `🚀 Using ${cachedStores.length} cached stores - searching for current items!`
          );

          // Process cached stores for our app, but reset items to current shopping list
          const processedStores = cachedStores.map((store: any) => ({
            ...store,
            store: store.name,
            place_id:
              store.place_id ||
              store.id ||
              store.name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
            // Reset items to current shopping list with null prices
            items: searchItems.map((itemName) => ({
              name: itemName,
              price: null,
              lastUpdated: null,
              productName: undefined,
              isGenericName: true,
              productDetail: null,
            })),
          }));

          setStores(processedStores);
          setSelectedStore(null);
          setShowCheapestSummary(false); // Don't show summary until prices are fetched

          // Generate ML recommendations
          if (items.length > 0) {
            const recommendations =
              mlRecommendationService.getStoreRecommendations(
                items,
                cachedStores,
                location
              );
            setStoreRecommendations(recommendations);
          }

          setIsLocatingStores(false);
          // Don't return here - continue to fetch fresh prices for current items
          console.log(
            `🔍 Now fetching fresh prices for ${searchItems.length} items at cached stores...`
          );

          // Now trigger manual price fetching for the cached stores using the /api/stores endpoint
          // This ensures we get fresh prices for the current shopping list items
          try {
            const timestamp = useStoreCaching ? "" : `&_t=${Date.now()}`;
            const storeResponse = await fetch(
              `/api/stores?latitude=${location.lat}&longitude=${
                location.lng
              }&items=${encodeURIComponent(
                JSON.stringify(searchItems)
              )}${timestamp}`
            );

            if (!storeResponse.ok) {
              throw new Error(`HTTP error! status: ${storeResponse.status}`);
            }

            const storeData = await storeResponse.json();
            const stores = storeData.stores || [];

            console.log(
              `🔄 Updated cached stores with fresh prices for ${searchItems.length} items`
            );

            // Update stores with fresh price data
            setStores(stores);
            setSelectedStore(null);
            setShowCheapestSummary(true); // Show summary when cached stores have fresh prices
          } catch (error) {
            console.error(
              "Error fetching fresh prices for cached stores:",
              error
            );
            setError("Failed to fetch prices for cached stores");
          }

          return;
        }
      }

      // Clear any existing stores first to ensure we only display freshly fetched ones
      setStores([]);

      // Add a timestamp to prevent browser caching (but we want our custom cache)
      const timestamp = useStoreCaching ? "" : `&_t=${Date.now()}`;

      const storeResponse = await fetch(
        `/api/stores?latitude=${location.lat}&longitude=${
          location.lng
        }&items=${encodeURIComponent(JSON.stringify(searchItems))}${timestamp}`
      );

      if (!storeResponse.ok) {
        const errorData = await storeResponse.json();
        throw new Error(errorData.error || "Failed to fetch stores");
      }

      const data = await storeResponse.json();
      if (!data.stores || data.stores.length === 0) {
        throw new Error("No stores found in your area");
      }

      console.log(
        `Found ${data.stores.length} stores at coordinates ${location.lat}, ${location.lng}`
      );

      // Cache the stores if caching is enabled
      if (useStoreCaching) {
        storeCacheService.cacheStores(data.stores, location);
      }

      // Process and format stores for our app
      const processedStores = data.stores.map((store: any) => ({
        ...store,
        store: store.name,
        place_id:
          store.place_id ||
          store.id ||
          store.name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        // Ensure items are in the right format
        items: store.items || [],
      }));

      setStores(processedStores);
      setSelectedStore(null);
      setShowCheapestSummary(true); // Show summary when we have final results

      // Generate ML recommendations
      if (items.length > 0) {
        const recommendations = mlRecommendationService.getStoreRecommendations(
          items,
          data.stores,
          location
        );
        setStoreRecommendations(recommendations);
      }
    } catch (error) {
      console.error("Error finding nearby stores:", error);
      setError(
        error instanceof Error ? error.message : "Failed to find stores"
      );
      setStores([]);
      setShowCheapestSummary(false);
    } finally {
      setIsLocatingStores(false);
    }
  };

  const handleRefreshCache = () => {
    if (currentLocation) {
      // Invalidate cache for current location and force refresh
      storeCacheService.invalidateLocation(currentLocation);
      // Get current items for search
      const itemNames = items.map((item) => item.name);
      if (itemNames.length > 0) {
        searchStoresWithItems(currentLocation, itemNames);
      }
    }
  };

  const handleToggleCaching = (enabled: boolean) => {
    setUseStoreCaching(enabled);
    if (!enabled) {
      // Clear cache when disabling
      storeCacheService.clearCache();
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        <Header />

        <Container
          maxWidth="lg"
          sx={{
            flex: 1,
            mt: { xs: 1, sm: 2 },
            py: { xs: 2, sm: 4 },
            px: { xs: 1, sm: 2 },
          }}
        >
          {/* AI Shopping Assistant */}
          <AIAssistant
            stores={stores as any}
            items={items}
            currentLocation={currentLocation}
          />

          {/* ML Recommendations */}
          <MLRecommendations
            recommendations={storeRecommendations}
            useStoreCaching={useStoreCaching}
            onToggleCaching={handleToggleCaching}
            onRefreshCache={handleRefreshCache}
          />

          {/* Cheapest Items Summary */}
          <CheapestItemsSummary
            items={items}
            stores={stores as any}
            showSummary={showCheapestSummary}
          />

          {/* Mobile-first responsive layout */}
          <Grid container spacing={{ xs: 2, sm: 3 }}>
            {/* Grocery List - Full width on mobile, left column on desktop */}
            <Grid item xs={12} lg={4}>
              <Paper
                sx={{
                  p: { xs: 2, sm: 3 },
                  mb: { xs: 2, sm: 3 },
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1)",
                }}
              >
                <GroceryList
                  items={items}
                  onAddItem={handleAddItem}
                  onRemoveItem={(idToRemove: string) =>
                    setItems(items.filter((item) => item.id !== idToRemove))
                  }
                  stores={stores as any}
                />
              </Paper>

              {/* Mobile: Location controls under grocery list */}
              <Paper
                sx={{
                  p: { xs: 2, sm: 3 },
                  mb: { xs: 2, sm: 3 },
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1)",
                  display: { lg: "none" },
                }}
              >
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                  Find Prices at Nearby Stores
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={handleFindNearbyPrices}
                      disabled={isLocatingStores}
                      startIcon={
                        isLocatingStores ? (
                          <CircularProgress size={20} color="inherit" />
                        ) : (
                          <RefreshIcon />
                        )
                      }
                      sx={{
                        py: 1.5,
                        fontSize: "0.875rem",
                        fontWeight: 500,
                      }}
                    >
                      {isLocatingStores
                        ? "Searching for Stores..."
                        : stores.length > 0
                        ? "Refresh Prices"
                        : "Use Current Location to Find Prices"}
                    </Button>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Or enter zip code"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && searchByZipCode()}
                      size="small"
                    />
                    <Button
                      fullWidth
                      variant="outlined"
                      onClick={searchByZipCode}
                      disabled={isLocatingStores || !zipCode.trim()}
                      sx={{ mt: 1, py: 1 }}
                    >
                      Search by Zip Code
                    </Button>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Store Comparison & Map - Full width on mobile, right column on desktop */}
            <Grid item xs={12} lg={8}>
              <Paper
                sx={{
                  p: { xs: 2, sm: 3 },
                  mb: { xs: 2, sm: 3 },
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1)",
                }}
              >
                <StoreComparison
                  items={items.map((item) => ({ name: item.name }))}
                  stores={stores as any}
                  selectedStore={selectedStore as any}
                  onStoreSelect={(store) =>
                    setSelectedStore(store as ComparisonStore)
                  }
                  isLocatingStores={isLocatingStores}
                  onError={setError}
                  onCheapestStore={(store) =>
                    setCheapestStore(store as ComparisonStore)
                  }
                  onRequestLocation={getCurrentLocation}
                  currentLocation={currentLocation}
                  setStores={(newStores) =>
                    setStores(newStores as ComparisonStore[])
                  }
                />
              </Paper>

              {/* Desktop: Location controls in sidebar */}
              <Paper
                sx={{
                  p: 3,
                  mb: 3,
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1)",
                  display: { xs: "none", lg: "block" },
                }}
              >
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                  Find Prices at Nearby Stores
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={handleFindNearbyPrices}
                      disabled={isLocatingStores}
                      startIcon={
                        isLocatingStores ? (
                          <CircularProgress size={20} color="inherit" />
                        ) : (
                          <RefreshIcon />
                        )
                      }
                      sx={{
                        py: 1.5,
                        fontSize: "0.875rem",
                        fontWeight: 500,
                      }}
                    >
                      {isLocatingStores
                        ? "Searching for Stores..."
                        : stores.length > 0
                        ? "Refresh Prices"
                        : "Use Current Location to Find Prices"}
                    </Button>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Or enter zip code"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && searchByZipCode()}
                      size="small"
                    />
                    <Button
                      fullWidth
                      variant="outlined"
                      onClick={searchByZipCode}
                      disabled={isLocatingStores || !zipCode.trim()}
                      sx={{ mt: 1, py: 1 }}
                    >
                      Search by Zip Code
                    </Button>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
          </Grid>
        </Container>

        {/* Error Snackbar */}
        <Snackbar
          open={!!error}
          autoHideDuration={6000}
          onClose={() => setError(null)}
        >
          <Alert onClose={() => setError(null)} severity="error">
            {error}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

export default App;
