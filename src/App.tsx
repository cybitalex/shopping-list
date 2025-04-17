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
    }
  };

  const handleAddItem = (itemName: string) => {
    const newItem: GroceryItem = {
      id: Date.now().toString(),
      name: itemName,
    };
    setItems((prevItems) => [...prevItems, newItem]);
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

    // Clear previous results
    setStores([]);
    setSelectedStore(null);
    setCheapestStore(null);

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

    try {
      // Clear any existing stores first to ensure we only display freshly fetched ones
      setStores([]);

      // Add a timestamp to prevent caching
      const timestamp = Date.now();

      const storeResponse = await fetch(
        `/api/stores?latitude=${location.lat}&longitude=${
          location.lng
        }&items=${encodeURIComponent(
          JSON.stringify(searchItems)
        )}&_t=${timestamp}`
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
    } catch (error) {
      console.error("Error finding nearby stores:", error);
      setError(
        error instanceof Error ? error.message : "Failed to find stores"
      );
      setStores([]);
    } finally {
      setIsLocatingStores(false);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        <Header />

        <Container maxWidth="lg" sx={{ flex: 1, mt: 2, py: 4 }}>
          {/* Map at the top */}
          <Paper sx={{ p: 3, mb: 3 }}>
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

          <Grid container spacing={3}>
            {/* Left Column - Grocery List */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, mb: 3 }}>
                <GroceryList
                  items={items}
                  onAddItem={handleAddItem}
                  onRemoveItem={(idToRemove: string) =>
                    setItems(items.filter((item) => item.id !== idToRemove))
                  }
                />
              </Paper>
            </Grid>

            {/* Right Column - Location Input */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
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
                      InputProps={{
                        endAdornment: (
                          <Button
                            variant="contained"
                            color="primary"
                            onClick={searchByZipCode}
                            disabled={isLocatingStores || !zipCode.trim()}
                            sx={{ ml: 1 }}
                          >
                            Search
                          </Button>
                        ),
                      }}
                    />
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
