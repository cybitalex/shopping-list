import React from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Alert,
  Button,
  Paper,
} from "@mui/material";
import {
  Store as StoreIcon,
  LocalOffer as PriceIcon,
  LocationOn as LocationIcon,
  ShoppingCart as CartIcon,
  TrendingDown as TrendingDownIcon,
} from "@mui/icons-material";

interface PriceAnalysisProps {
  analysis: {
    items: Array<{
      item: string;
      cheapestOption: {
        store: string;
        storeDistance: number;
        productName: string;
        price: string;
        priceValue: number;
        address?: string;
      };
      allOptions: Array<{
        store: string;
        storeDistance: number;
        productName: string;
        price: string;
        priceValue: number;
        address?: string;
      }>;
    }>;
    totalEstimatedCost: number;
    recommendedStores: Array<{
      store: string;
      distance: number;
      items: string[];
      totalCost: number;
      address?: string;
    }>;
  } | null;
  loading: boolean;
  error: string | null;
}

const PriceAnalysis: React.FC<PriceAnalysisProps> = ({
  analysis,
  loading,
  error,
}) => {
  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="200px"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!analysis) {
    return null;
  }

  return (
    <Box>
      {/* Total Cost Summary */}
      <Card
        sx={{ mb: 3, bgcolor: "primary.light", color: "primary.contrastText" }}
      >
        <CardContent>
          <Box display="flex" alignItems="center" mb={1}>
            <TrendingDownIcon sx={{ mr: 1 }} />
            <Typography variant="h5">Total Estimated Cost</Typography>
          </Box>
          <Typography variant="h4" fontWeight="bold">
            ${analysis.totalEstimatedCost.toFixed(2)}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Based on cheapest options across all stores
          </Typography>
        </CardContent>
      </Card>

      {/* Item-by-Item Analysis */}
      <Box display="flex" alignItems="center" mb={2}>
        <CartIcon sx={{ mr: 1 }} />
        <Typography variant="h6">Best Prices by Item</Typography>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {analysis.items.map((item, index) => (
          <Grid item xs={12} md={6} key={index}>
            <Card>
              <CardContent>
                <Typography variant="h6" color="primary" gutterBottom>
                  {item.item.toUpperCase()}
                </Typography>

                {/* Cheapest Option */}
                <Box
                  sx={{
                    mb: 2,
                    p: 2,
                    bgcolor: "success.light",
                    borderRadius: 1,
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    fontWeight="bold"
                    color="success.dark"
                  >
                    🏆 BEST DEAL
                  </Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {item.cheapestOption.productName}
                  </Typography>
                  <Typography
                    variant="h6"
                    color="success.dark"
                    fontWeight="bold"
                  >
                    {item.cheapestOption.price}
                  </Typography>
                  <Box
                    display="flex"
                    alignItems="center"
                    gap={1}
                    sx={{ mt: 1 }}
                  >
                    <StoreIcon fontSize="small" />
                    <Typography variant="body2">
                      {item.cheapestOption.store}
                    </Typography>
                    <LocationIcon fontSize="small" />
                    <Typography variant="body2">
                      {item.cheapestOption.storeDistance} mi
                    </Typography>
                  </Box>
                  {item.cheapestOption.address && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 1, display: "block" }}
                    >
                      📍 {item.cheapestOption.address}
                    </Typography>
                  )}
                </Box>

                {/* All Options */}
                <Typography variant="subtitle2" gutterBottom>
                  All Options ({item.allOptions.length})
                </Typography>
                <List dense>
                  {item.allOptions.map((option, optionIndex) => (
                    <ListItem key={optionIndex} sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        <PriceIcon fontSize="small" color="primary" />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box
                            display="flex"
                            justifyContent="space-between"
                            alignItems="center"
                          >
                            <Typography
                              variant="body2"
                              noWrap
                              sx={{ maxWidth: "60%" }}
                            >
                              {option.productName}
                            </Typography>
                            <Typography
                              variant="body2"
                              fontWeight="bold"
                              color="primary"
                            >
                              {option.price}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {option.store}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              ({option.storeDistance} mi)
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Store Recommendations */}
      <Box display="flex" alignItems="center" mb={2}>
        <StoreIcon sx={{ mr: 1 }} />
        <Typography variant="h6">Store Recommendations</Typography>
      </Box>

      <Grid container spacing={2}>
        {analysis.recommendedStores.map((store, index) => (
          <Grid item xs={12} md={6} lg={4} key={index}>
            <Paper sx={{ p: 2, height: "100%" }}>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="flex-start"
                mb={1}
              >
                <Typography
                  variant="subtitle1"
                  fontWeight="bold"
                  noWrap
                  sx={{ maxWidth: "60%" }}
                >
                  {store.store}
                </Typography>
                <Chip
                  label={`$${store.totalCost.toFixed(2)}`}
                  color="primary"
                  size="small"
                  variant="filled"
                />
              </Box>

              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <LocationIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  {store.distance} miles away
                </Typography>
              </Box>

              {store.address && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mb: 1, display: "block" }}
                >
                  📍 {store.address}
                </Typography>
              )}

              <Typography variant="body2" color="text.secondary" gutterBottom>
                Items available: {store.items.length}
              </Typography>

              <Box display="flex" flexWrap="wrap" gap={0.5}>
                {store.items.map((item, itemIndex) => (
                  <Chip
                    key={itemIndex}
                    label={item}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: "0.7rem" }}
                  />
                ))}
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default PriceAnalysis;
