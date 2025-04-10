import { useState, useEffect } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { Box, Container, Alert, Snackbar } from "@mui/material";
import theme from "./theme";
import GroceryList from "./components/GroceryList";
import StoreComparison from "./components/StoreComparison";
import Header from "./components/Header";
import Map from "./components/Map";
import type { Store } from "./types/store";
import { searchNearbyStores } from "./services/places";
import { loadGoogleMaps } from "./utils/googleMaps";

export interface GroceryItem {
  id: number;
  name: string;
}

function App() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [isLocatingStores, setIsLocatingStores] = useState(true);
  const [cheapestStore, setCheapestStore] = useState<Store | null>(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await loadGoogleMaps(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
        await getCurrentLocation();
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
          navigator.geolocation.getCurrentPosition(resolve, reject);
        }
      );

      const { latitude, longitude } = position.coords;
      const location = { lat: latitude, lng: longitude };
      setCurrentLocation(location);

      await handleSearchStores("grocery store", location);
    } catch (err) {
      console.error("Location error:", err);
      setError(err instanceof Error ? err.message : "Failed to get location");
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
      const nearbyStores = await searchNearbyStores(location, query);
      setStores(nearbyStores);
    } catch (err) {
      console.error("Store search error:", err);
      setError(err instanceof Error ? err.message : "Failed to search stores");
    } finally {
      setIsLocatingStores(false);
    }
  };

  const handleAddItem = (name: string) => {
    setItems([...items, { id: Date.now(), name: name.trim() }]);
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
          backgroundColor: theme.palette.grey[100],
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Header />
        <Box
          component="main"
          sx={{
            flex: 1,
            pt: { xs: "56px", sm: "64px" },
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Container maxWidth="xl" sx={{ flex: 1, py: { xs: 2, sm: 3 } }}>
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                gap: { xs: 2, sm: 3 },
                height: "100%",
                maxWidth: 1400,
                mx: "auto",
              }}
            >
              <Box
                sx={{
                  width: { xs: "100%", md: "320px" },
                  height: { xs: "auto", md: "calc(100vh - 120px)" },
                  bgcolor: "background.paper",
                  overflow: "auto",
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: 2,
                  boxShadow: 1,
                }}
              >
                <GroceryList
                  items={items}
                  onAddItem={handleAddItem}
                  onDeleteItem={handleDeleteItem}
                />
                <StoreComparison
                  items={items.map((item) => item.name)}
                  stores={stores}
                  onError={handleError}
                  isLocatingStores={isLocatingStores}
                  onCheapestStore={handleCheapestStore}
                />
              </Box>

              <Box
                sx={{
                  flex: 1,
                  height: { xs: "500px", md: "calc(100vh - 120px)" },
                  borderRadius: 2,
                  overflow: "hidden",
                  boxShadow: 1,
                }}
              >
                <Map
                  currentLocation={currentLocation || undefined}
                  stores={stores}
                  selectedStore={selectedStore}
                  onStoreSelect={handleStoreSelect}
                  cheapestStore={cheapestStore}
                  onAddItem={handleAddItem}
                  onSearchStores={handleSearchStores}
                />
              </Box>
            </Box>
          </Container>
        </Box>
      </Box>

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setError(null)}
          severity="error"
          sx={{ width: "100%" }}
        >
          {error}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}

export default App;
