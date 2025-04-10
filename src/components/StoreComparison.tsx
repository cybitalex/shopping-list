import React, { useState } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Paper,
  LinearProgress,
} from "@mui/material";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import { compareStores } from "../services/api";

interface Store {
  id: string;
  name: string;
  address: string;
  distance: number;
  rating?: number;
  latitude: number;
  longitude: number;
}

interface ItemPrice {
  name: string;
  price: number;
  confidence: number;
}

interface StoreResult {
  storeName: string;
  items: ItemPrice[];
  totalPrice: number;
}

interface ComparisonResult {
  results: StoreResult[];
  errors?: string[];
}

interface Props {
  items: string[];
  stores: Store[];
  onError: (error: string) => void;
}

const StoreComparison: React.FC<Props> = ({ items, stores, onError }) => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<StoreResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const compareNearbyStores = async () => {
    if (!stores.length) {
      setError("No stores found nearby. Try expanding your search radius.");
      return;
    }

    if (!items.length) {
      setError("Please add items to your list before comparing prices.");
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      // Calculate progress steps
      const totalSteps = stores.length;
      const progressIncrement = 100 / totalSteps;

      const response = await compareStores(stores, items);
      setProgress(100);

      if (!response.results || !Array.isArray(response.results)) {
        throw new Error("Invalid response format from server");
      }

      // Sort results by total price
      const sortedResults = [...response.results].sort(
        (a, b) => a.totalPrice - b.totalPrice
      );
      setResults(sortedResults);

      if (response.errors?.length) {
        console.warn("Some price estimates failed:", response.errors);
      }
    } catch (error) {
      console.error("Error comparing stores:", error);
      setError("Failed to compare store prices. Please try again.");
      onError("Failed to compare store prices");
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(price);
  };

  const formatConfidence = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`;
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ mb: 2, display: "flex", justifyContent: "center" }}>
        <Button
          variant="contained"
          color="primary"
          onClick={compareNearbyStores}
          disabled={loading || !stores.length || !items.length}
          startIcon={<LocalOfferIcon />}
        >
          {loading ? "Comparing Prices..." : "Compare Prices"}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box sx={{ width: "100%", mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
              Comparing prices across {stores.length} stores...
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {Math.round(progress)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 8,
              borderRadius: 4,
            }}
          />
        </Box>
      )}

      {!loading && !error && results.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Price Comparison Results
          </Typography>

          {results.map((result, index) => (
            <Paper
              key={index}
              elevation={index === 0 ? 3 : 1}
              sx={{
                mb: 3,
                p: 2,
                borderRadius: 2,
                position: "relative",
                border: index === 0 ? "2px solid #4caf50" : "none",
                bgcolor: index === 0 ? "success.light" : "background.paper",
              }}
            >
              {index === 0 && (
                <Box
                  sx={{
                    position: "absolute",
                    top: -12,
                    right: 16,
                    bgcolor: "success.main",
                    color: "white",
                    px: 2,
                    py: 0.5,
                    borderRadius: 1,
                    fontSize: "0.875rem",
                    fontWeight: "bold",
                  }}
                >
                  Best Price!
                </Box>
              )}
              <Typography
                variant="h6"
                color={index === 0 ? "success.dark" : "primary"}
                sx={{ fontWeight: "bold" }}
              >
                {result.storeName} - Total: {formatPrice(result.totalPrice)}
              </Typography>

              <Box sx={{ mt: 2 }}>
                {result.items.map((item, itemIndex) => (
                  <Box
                    key={itemIndex}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 1,
                      p: 1,
                      bgcolor: "background.paper",
                      borderRadius: 1,
                    }}
                  >
                    <Typography>{item.name}</Typography>
                    <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                      <Typography sx={{ fontWeight: "medium" }}>
                        {formatPrice(item.price)}
                      </Typography>
                      <Typography
                        color="text.secondary"
                        fontSize="small"
                        sx={{ opacity: 0.8 }}
                      >
                        (Confidence: {formatConfidence(item.confidence)})
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {!loading && !error && results.length === 0 && (
        <Typography color="text.secondary" align="center">
          Click "Compare Prices" to see price estimates for your items at nearby
          stores.
        </Typography>
      )}
    </Box>
  );
};

export default StoreComparison;
