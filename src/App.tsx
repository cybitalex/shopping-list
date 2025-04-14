import { useState, useEffect } from "react";
import { ThemeProvider, useTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { Box, Container, Alert, Snackbar, useMediaQuery, Button, TextField, Grid, Typography, Toolbar } from "@mui/material";
import theme from "./theme";
import GroceryList from "./components/GroceryList";
import StoreComparison from "./components/StoreComparison";
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

      const location = {
        lat: result[0].geometry.location.lat(),
        lng: result[0].geometry.location.lng()
      };
      
      console.log("Zip code location:", location);
      setCurrentLocation(location);

      console.log("Searching for stores near zip code location");
      const nearbyStores = await findNearbyStores(location.lat, location.lng);
      console.log(`Found ${nearbyStores.length} stores near zip code location`);

      // Sort stores by distance and ensure we're keeping all stores
      const sortedStores = [...nearbyStores].sort((a, b) => a.distance - b.distance);
      console.log("Store names received:", sortedStores.map(store => store.name).join(", "));
      setStores(sortedStores);
    } catch (err) {
      console.error("Zip code search error:", err);
      setError(err instanceof Error ? err.message : "Failed to find location from zip code");
    } finally {
      setIsLocatingStores(false);
    }
  };

  const handleSearchStores = async (
    query: string,
    location: { lat: number; lng: number }
  ) => {
    setIsLocatingStores(true);
    try {
      console.log("Searching for stores at location:", location);
      const nearbyStores = await findNearbyStores(location.lat, location.lng);
      console.log(`Found ${nearbyStores.length} nearby stores`);
      
      // Sort stores by distance and make sure we keep all stores
      const sortedStores = [...nearbyStores].sort((a, b) => a.distance - b.distance);
      console.log("Store names received:", sortedStores.map(store => store.name).join(", "));
      setStores(sortedStores);
    } catch (err) {
      console.error("Store search error:", err);
      setError(err instanceof Error ? err.message : "Failed to search stores");
    } finally {
      setIsLocatingStores(false);
    }
  };

  const handleAddItem = (name: string) => {
    // Normalize item name (trim and lowercase for comparison)
    const normalizedName = name.trim();
    
    // Don't add empty items
    if (!normalizedName) return;
    
    // Check if item already exists (case insensitive)
    const alreadyExists = items.some(item => 
      item.name.toLowerCase() === normalizedName.toLowerCase()
    );
    
    // Only add if it doesn't exist
    if (!alreadyExists) {
      setItems([...items, { id: Date.now(), name: normalizedName }]);
    } else {
      // Optionally show an error message
      setError(`"${normalizedName}" is already in your list`);
    }
  };

  const handleDeleteItem = (id: number) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleStoreSelect = (store: Store) => {
    setSelectedStore(store);
  };

  const handleCheapestStore = (store: Store | null) => {
    setCheapestStore(store);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          display: "flex",
          flexDirection: "column"
        }}
      >
        <Header />
        <Toolbar />

        <Container maxWidth="lg" sx={{ flexGrow: 1, py: 2 }}>
          <Snackbar
            open={!!error}
            autoHideDuration={6000}
            onClose={() => setError(null)}
          >
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          </Snackbar>

          <Box>
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <GroceryList
                  items={items}
                  onAddItem={handleAddItem}
                  onDeleteItem={handleDeleteItem}
                />
              </Grid>
              <Grid item xs={12} md={8}>
                <StoreComparison
                  items={items.map(item => item.name)}
                  stores={stores}
                  onError={handleError}
                  isLocatingStores={isLocatingStores}
                  onCheapestStore={handleCheapestStore}
                  onRequestLocation={getCurrentLocation}
                  currentLocation={currentLocation}
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 3 }}>
              {currentLocation ? (
                <Button
                  variant="outlined"
                  onClick={() => getCurrentLocation()}
                  disabled={isLocatingStores}
                >
                  Refresh stores near me
                </Button>
              ) : (
                <Button
                  variant="contained"
                  onClick={() => getCurrentLocation()}
                  disabled={isLocatingStores}
                >
                  Find stores near me
                </Button>
              )}

              <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 1 }}>
                <TextField
                  label="Or search by zip code"
                  variant="outlined"
                  size="small"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") searchByZipCode();
                  }}
                />
                <Button
                  variant="outlined"
                  onClick={searchByZipCode}
                  disabled={isLocatingStores || !zipCode.trim()}
                >
                  Search
                </Button>
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
