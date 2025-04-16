import { useState, useEffect } from "react";
import { ThemeProvider, useTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { Box, Container, Alert, Snackbar, useMediaQuery, Button, TextField, Grid, Typography, Toolbar, Paper } from "@mui/material";
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
import type { Store } from "./types/store";
import { findNearbyStores } from "./services/places";
import { loadGoogleMaps } from "./utils/googleMaps";

export interface GroceryItem {
  id: number;
  name: string;
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
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [zipCode, setZipCode] = useState<string>("");
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [isLocatingStores, setIsLocatingStores] = useState(false);
  const [cheapestStore, setCheapestStore] = useState<Store | null>(null);
  const [mapFirst, setMapFirst] = useState(true);

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
      setStores(sortedStores);
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

  const handleStoreSelect = (store: Store) => {
    setSelectedStore(store);
    setCheapestStore(store);
  };

  const handleAddItem = (itemName: string) => {
    const newItem: GroceryItem = {
      id: Date.now(),
      name: itemName
    };
    setItems(prevItems => [...prevItems, newItem]);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header />
        
        <Container maxWidth="lg" sx={{ flex: 1, py: 4 }}>
          <Grid container spacing={3}>
            {/* Left Column - Grocery List and Location Input */}
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, mb: 3 }}>
                <GroceryList 
                  items={items} 
                  onAddItem={handleAddItem}
                  onRemoveItem={(id) => setItems(items.filter(item => item.id !== id))}
                />
              </Paper>

              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Find Stores
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={getCurrentLocation}
                      disabled={isLocatingStores}
                      startIcon={<RefreshIcon />}
                    >
                      {isLocatingStores ? "Locating..." : "Use Current Location"}
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
            </Grid>

            {/* Middle Column - Best Prices Finder */}
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <BestPricesFinder
                  shoppingList={items.map(item => item.name)}
                  preferredStores={stores.map(store => store.name)}
                  onSelectStore={handleStoreSelect}
                />
              </Paper>
            </Grid>

            {/* Right Column - Store Comparison */}
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <StoreComparison
                  stores={stores}
                  selectedStore={selectedStore}
                  onSelectStore={setSelectedStore}
                  cheapestStore={cheapestStore}
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