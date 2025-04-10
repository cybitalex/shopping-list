import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Paper,
  CircularProgress,
  Tooltip,
  Chip,
  Divider,
} from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import type { Store } from "../types/store";
import { searchProductsAtStores, Product } from "../services/products";

interface StoreComparisonProps {
  items: string[];
  stores: Store[];
  onError: (error: string) => void;
  isLocatingStores: boolean;
  onCheapestStore: (store: Store | null) => void;
}

interface StorePrices {
  [storeId: string]: {
    store: Store;
    total: number;
    products: Product[];
  };
}

const StoreComparison: React.FC<StoreComparisonProps> = ({
  items,
  stores,
  onError,
  isLocatingStores,
  onCheapestStore,
}) => {
  const [storePrices, setStorePrices] = useState<StorePrices>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const searchProductsForAllItems = async () => {
      if (items.length === 0 || stores.length === 0) return;

      setIsLoading(true);
      const newStorePrices: StorePrices = {};

      // Initialize store prices
      stores.forEach((store) => {
        newStorePrices[store.id] = {
          store,
          total: 0,
          products: [],
        };
      });

      // Search for each item at all stores
      for (const item of items) {
        try {
          const products = await searchProductsAtStores(item, stores);

          // Add products to store totals
          products.forEach((product) => {
            if (newStorePrices[product.storeId]) {
              newStorePrices[product.storeId].total += product.price;
              newStorePrices[product.storeId].products.push(product);
            }
          });
        } catch (error) {
          console.error(`Error searching for ${item}:`, error);
          onError(`Failed to search for ${item}`);
        }
      }

      setStorePrices(newStorePrices);

      // Find and notify about the cheapest store
      const cheapestStore =
        Object.values(newStorePrices)
          .filter((storeData) => storeData.products.length > 0)
          .sort((a, b) => a.total - b.total)[0]?.store || null;

      onCheapestStore(cheapestStore);
      setIsLoading(false);
    };

    searchProductsForAllItems();
  }, [items, stores, onError, onCheapestStore]);

  if (isLocatingStores || isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (Object.keys(storePrices).length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body1" color="text.secondary">
          No stores found. Try searching for stores in your area.
        </Typography>
      </Box>
    );
  }

  const sortedStores = Object.values(storePrices)
    .filter((storeData) => storeData.products.length > 0)
    .sort((a, b) => a.total - b.total);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Store Comparison
      </Typography>
      <List>
        {sortedStores.map((storeData, index) => (
          <Box key={storeData.store.id}>
            <ListItem>
              <ListItemText
                primary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography variant="subtitle1">
                      {storeData.store.name}
                    </Typography>
                    {index === 0 && (
                      <Chip label="Cheapest" color="success" size="small" />
                    )}
                  </Box>
                }
                secondary={
                  <>
                    <Typography variant="body2" color="text.secondary">
                      {storeData.store.address}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total: ${storeData.total.toFixed(2)}
                    </Typography>
                    <List dense>
                      {storeData.products.map((product) => (
                        <ListItem key={`${product.storeId}-${product.name}`}>
                          <ListItemText
                            primary={product.name}
                            secondary={`$${product.price.toFixed(2)}`}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </>
                }
              />
            </ListItem>
            {index < sortedStores.length - 1 && <Divider />}
          </Box>
        ))}
      </List>
    </Box>
  );
};

export default StoreComparison;
