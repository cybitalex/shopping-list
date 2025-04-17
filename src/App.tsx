import { useState, useEffect, useRef } from "react";
import { ThemeProvider, useTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { Box, Container, Alert, Snackbar, useMediaQuery, Button, TextField, Grid, Typography, Toolbar, Paper, CircularProgress } from "@mui/material";
import {
  Refresh as RefreshIcon,
  ViewList as ViewListIcon,
  Map as MapIcon
} from "@mui/icons-material";
import theme from "./theme";
import GroceryList from "./components/GroceryList";
import StoreComparison from "./components/StoreComparison";
import BestPricesFinder from "./components/BestPricesFinder";
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

interface BestPricesStore {
  name: string;
  distance: number | null;
  items: Record<string, {
    name: string;
    price: string;
    method: string;
  }>;
  totalItems: number;
  totalPrice: number;
  formattedTotalPrice: string;
  hasMostItems: boolean;
  coverage: number;
  id?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  priceLevel?: number;
  place_id?: string;
  vicinity?: string;
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
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [stores, setStores] = useState<ComparisonStore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [zipCode, setZipCode] = useState<string>("");
  const [selectedStore, setSelectedStore] = useState<ComparisonStore | null>(null);
  const [isLocatingStores, setIsLocatingStores] = useState(false);
  const [cheapestStore, setCheapestStore] = useState<ComparisonStore | null>(null);
  const [mapFirst, setMapFirst] = useState(true);
  const [locationRequested, setLocationRequested] = useState(false);

  // Reference to the BestPricesFinder component
  const bestPricesFinderRef = useRef<any>(null); 

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
            maximumAge: 0
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
      const sortedStores = [...nearbyStores].sort((a, b) => a.distance - b.distance);
      console.log("Store names received:", sortedStores.map(store => store.name).join(", "));
      setStores(sortedStores.map(store => ({
        ...store,
        store: store.name,
        place_id: store.place_id || store.id,
        items: items.map(item => ({
          name: item.name,
          price: null,
          lastUpdated: null
        }))
      })) as ComparisonStore[]);
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
      const result = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
        geocoder.geocode(
          { address: zipCode.trim() },
          (results, status) => {
            if (status === google.maps.GeocoderStatus.OK && results && results.length > 0) {
              resolve(results);
            } else {
              reject(new Error(`Geocoding failed with status: ${status}`));
            }
          }
        );
      });

      // ... rest of the function ...
    } catch (err) {
      console.error("Geocoding error:", err);
      setError(err instanceof Error ? err.message : "Failed to search by zip code");
    } finally {
      setIsLocatingStores(false);
    }
  };

  const handleStoreSelect = (store: ComparisonStore | null) => {
    console.log('handleStoreSelect called with store:', store);
    setSelectedStore(store);
    if (store) {
      setCheapestStore(store);
    }
  };

  const handleAddItem = (itemName: string) => {
    const newItem: GroceryItem = {
      id: Date.now().toString(),
      name: itemName
    };
    setItems(prevItems => [...prevItems, newItem]);
  };

  // Enhanced location search that also triggers price search
  const handleFindNearbyPrices = async () => {
    console.log('Searching for stores near current location');
    
    // Check if we have items in the grocery list
    const itemNames = items.map(item => item.name);
    if (itemNames.length === 0) {
      setError('Please add items to your shopping list first');
      return;
    }
    
    // Get location if we don't have it yet
    if (!currentLocation) {
      setIsLocatingStores(true);
      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0
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
  const searchStoresWithItems = async (location: {lat: number, lng: number}, searchItems: string[]) => {
    setIsLocatingStores(true);
    setError(null);
    
    try {
      const storeResponse = await fetch(
        `/api/stores?latitude=${location.lat}&longitude=${location.lng}&items=${encodeURIComponent(JSON.stringify(searchItems))}`
      );

      if (!storeResponse.ok) {
        const errorData = await storeResponse.json();
        throw new Error(errorData.error || 'Failed to fetch stores');
      }

      const data = await storeResponse.json();
      if (!data.stores || data.stores.length === 0) {
        throw new Error('No stores found in your area');
      }

      console.log(`Found ${data.stores.length} stores with items`);
      
      // Process and format stores for our app
      const processedStores = data.stores.map((store: any) => ({
        ...store,
        store: store.name,
        place_id: store.place_id || store.id || store.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        // Ensure items are in the right format
        items: store.items || []
      }));

      setStores(processedStores);
      setSelectedStore(null);
      
      // Trigger best prices search without scrolling
      if (bestPricesFinderRef.current?.handleSearch) {
        console.log('Triggering best prices search once');
        bestPricesFinderRef.current.handleSearch();
      }
      
    } catch (error) {
      console.error('Error finding nearby stores:', error);
      setError(error instanceof Error ? error.message : 'Failed to find stores');
      setStores([]);
    } finally {
      setIsLocatingStores(false);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header />
        
        <Container maxWidth="lg" sx={{ flex: 1, mt: 2, py: 4 }}>
          {/* Map at the top */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <StoreComparison
              items={items.map(item => ({ name: item.name }))}
              stores={stores as any}
              selectedStore={selectedStore as any}
              onStoreSelect={(store) => setSelectedStore(store as ComparisonStore)}
              isLocatingStores={isLocatingStores}
              onError={setError}
              onCheapestStore={(store) => setCheapestStore(store as ComparisonStore)}
              onRequestLocation={getCurrentLocation}
              currentLocation={currentLocation}
              setStores={(newStores) => setStores(newStores as ComparisonStore[])}
            />
          </Paper>

          <Grid container spacing={3}>
            {/* Left Column - Grocery List */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, mb: 3 }}>
                <GroceryList 
                  items={items} 
                  onAddItem={handleAddItem}
                  onRemoveItem={(idToRemove: string) => setItems(items.filter(item => item.id !== idToRemove))}
                />
              </Paper>
            </Grid>

            {/* Right Column - Location Input and Best Prices */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Find Best Prices for Each Item
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={handleFindNearbyPrices}
                      disabled={isLocatingStores}
                      startIcon={isLocatingStores ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
                    >
                      {isLocatingStores ? "Searching for Stores..." : stores.length > 0 ? "Refresh Prices" : "Use Current Location to Find Best Prices"}
                    </Button>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Or enter zip code"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && searchByZipCode()}
                    />
                  </Grid>
                </Grid>
              </Paper>
              
              <Paper sx={{ p: 3 }} id="best-prices-finder">
                <BestPricesFinder
                  ref={bestPricesFinderRef}
                  shoppingList={items.map(item => item.name)}
                  currentLocation={currentLocation}
                  onRequestLocation={getCurrentLocation}
                  preferredStores={stores.map(store => store.name)}
                  storeData={stores.map(store => {
                    // Convert store items from array to Record format
                    const itemsRecord: Record<string, {name: string; price: string; method: string}> = {};
                    
                    if (store.items && Array.isArray(store.items)) {
                      store.items.forEach(item => {
                        if (item && item.name && item.price !== null) {
                          itemsRecord[item.name] = {
                            name: item.name,
                            price: item.price.toString(),
                            method: 'api'
                          };
                        }
                      });
                    }
                    
                    // Properly structured store for BestPricesFinder
                    const transformedStore = {
                      name: store.name,
                      distance: store.distance || null,
                      items: itemsRecord,
                      id: store.id || store.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                      place_id: store.place_id || store.id,
                      latitude: store.latitude || 0,
                      longitude: store.longitude || 0,
                      vicinity: store.vicinity || ''
                    };
                    
                    console.log(`Transformed store ${store.name} with ${Object.keys(itemsRecord).length} items`);
                    
                    return transformedStore;
                  })}
                  onSelectStore={(store: any) => {
                    // Convert BestPricesFinder store to ComparisonStore
                    console.log('BestPricesFinder onSelectStore called with:', store);
                    
                    // First, process items from Record to Array format 
                    const storeItems = items.map(item => {
                      const recordItem = store.items[item.name];
                      return {
                        name: item.name,
                        price: recordItem ? parseFloat(recordItem.price) : null,
                        lastUpdated: new Date().toISOString(),
                        productName: recordItem ? `${item.name} (${recordItem.method})` : item.name
                      };
                    });
                    
                    const comparisonStore: ComparisonStore = {
                      store: store.name,
                      name: store.name,
                      id: store.id || store.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                      place_id: store.place_id || store.id || store.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                      distance: store.distance || 0,
                      latitude: store.latitude || 0,
                      longitude: store.longitude || 0,
                      items: storeItems
                    };
                    console.log('Converted to ComparisonStore:', comparisonStore);
                    handleStoreSelect(comparisonStore);
                  }}
                />
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