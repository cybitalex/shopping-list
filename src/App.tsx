import { useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { Box, Container, Alert, Snackbar, Button } from "@mui/material";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import theme from "./theme";
import GroceryList from "./components/GroceryList";
import StoreComparison from "./components/StoreComparison";
import Header from "./components/Header";
import type { Store } from "./types/store";
import { findNearbyStores } from "./services/api";

export interface GroceryItem {
  id: number;
  name: string;
}

function App() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  const handleAddItem = (name: string) => {
    setItems([...items, { id: Date.now(), name: name.trim() }]);
  };

  const handleDeleteItem = (id: number) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleShareLocation = async () => {
    setIsLoadingLocation(true);
    setError(null);
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        }
      );

      const { latitude, longitude } = position.coords;
      console.log("Location found:", { latitude, longitude });

      const nearbyStores = await findNearbyStores(latitude, longitude);
      console.log("Found stores:", nearbyStores);
      setStores(nearbyStores);
    } catch (err) {
      console.error("Location error:", err);
      setError(err instanceof Error ? err.message : "Failed to get location");
    } finally {
      setIsLoadingLocation(false);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          backgroundColor: "background.default",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Header />
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4, flex: 1 }}>
          <Box
            sx={{
              display: "flex",
              gap: 4,
              flexDirection: { xs: "column", md: "row" },
            }}
          >
            <Box sx={{ flex: 1 }}>
              <GroceryList
                items={items}
                onAddItem={handleAddItem}
                onDeleteItem={handleDeleteItem}
              />
              <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleShareLocation}
                  disabled={isLoadingLocation}
                  startIcon={<LocationOnIcon />}
                >
                  {isLoadingLocation ? "Finding Stores..." : "Share Location"}
                </Button>
              </Box>
            </Box>
            <Box sx={{ flex: 2 }}>
              <StoreComparison
                items={items.map((item) => item.name)}
                stores={stores}
                onError={handleError}
              />
            </Box>
          </Box>
        </Container>
      </Box>
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
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
