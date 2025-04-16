import React, { useState, useEffect } from 'react';
import { 
  Button, 
  CircularProgress, 
  Typography, 
  Box, 
  Paper, 
  List, 
  ListItem, 
  ListItemText, 
  Divider,
  Alert,
  Chip,
  Grid,
  Card,
  CardContent,
  CardHeader,
  LinearProgress
} from '@mui/material';
import StoreIcon from '@mui/icons-material/Store';
import ShoppingBasketIcon from '@mui/icons-material/ShoppingBasket';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import { ScraperApi } from '../api/scraperApi';

// Types
interface Store {
  name: string;
  distance: number | null;
  items: Record<string, Item>;
  totalItems: number;
  totalPrice: number;
  formattedTotalPrice: string;
  hasMostItems: boolean;
  coverage: number;
}

interface Item {
  name: string;
  price: string;
  method: string;
}

interface SearchProgress {
  total: number;
  completed: number;
  failed: number;
}

interface BestPricesFinderProps {
  shoppingList: string[];
  onSelectStore?: (store: Store) => void;
  preferredStores?: string[];
}

const BestPricesFinder: React.FC<BestPricesFinderProps> = ({ 
  shoppingList,
  onSelectStore,
  preferredStores = []
}) => {
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [bestStores, setBestStores] = useState<Store[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scraperApi = ScraperApi.getInstance();

  // Start the search process
  const handleSearch = async () => {
    // Validate shopping list
    if (!shoppingList || shoppingList.length === 0) {
      setError('Your shopping list is empty. Add some items first!');
      return;
    }

    try {
      setIsSearching(true);
      setError(null);
      setBestStores([]);

      // Initialize progress
      const totalSearches = shoppingList.length * (preferredStores.length || 1);
      setProgress({
        total: totalSearches,
        completed: 0,
        failed: 0
      });

      // Start the search
      const results = await scraperApi.searchMultipleProducts(shoppingList, preferredStores.length > 0 ? preferredStores : null);

      // Process results to find best stores
      const storeData: Record<string, Store> = {};

      // Process each item's results
      Object.entries(results).forEach(([item, itemResults]) => {
        Object.entries(itemResults).forEach(([location, result]) => {
          if (!result.success || !result.stores) return;

          // For each store with this item
          result.stores.forEach(store => {
            const storeName = store.name;
            if (!storeName) return;

            // Initialize store data if needed
            if (!storeData[storeName]) {
              storeData[storeName] = {
                name: storeName,
                distance: store.distance,
                items: {},
                totalItems: 0,
                totalPrice: 0,
                formattedTotalPrice: '$0.00',
                hasMostItems: false,
                coverage: 0
              };
            }

            // Get the cheapest item in this store
            const cheapestItem = store.items.reduce<Item | null>((cheapest, current) => {
              if (!cheapest) return current;
              
              const currentPrice = parseFloat(current.price.replace(/[^\d.]/g, ''));
              const cheapestPrice = parseFloat(cheapest.price.replace(/[^\d.]/g, ''));
              
              return currentPrice < cheapestPrice ? current : cheapest;
            }, null);

            if (cheapestItem) {
              // Update store data with this item
              storeData[storeName].items[item] = cheapestItem;
              storeData[storeName].totalItems++;
              storeData[storeName].totalPrice += parseFloat(cheapestItem.price.replace(/[^\d.]/g, ''));
            }
          });
        });
      });

      // Convert to array and sort by completeness and price
      const sortedStores = Object.values(storeData)
        .sort((a, b) => {
          // First by number of items (most items first)
          if (b.totalItems !== a.totalItems) {
            return b.totalItems - a.totalItems;
          }
          
          // Then by total price (lowest first)
          return a.totalPrice - b.totalPrice;
        })
        .map(store => ({
          ...store,
          hasMostItems: store.totalItems === shoppingList.length,
          coverage: (store.totalItems / shoppingList.length) * 100,
          formattedTotalPrice: `$${store.totalPrice.toFixed(2)}`
        }));

      setBestStores(sortedStores);
      setIsSearching(false);
    } catch (err) {
      setError(`Error searching for prices: ${err instanceof Error ? err.message : String(err)}`);
      setIsSearching(false);
    }
  };

  // Calculate progress percentage
  const progressPercentage = progress 
    ? Math.round((progress.completed / progress.total) * 100) 
    : 0;

  return (
    <Box sx={{ mt: 2, mb: 4 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!isSearching && bestStores.length === 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={handleSearch}
            startIcon={<ShoppingBasketIcon />}
            disabled={shoppingList.length === 0}
          >
            Find Best Prices
          </Button>
        </Box>
      )}

      {isSearching && (
        <Paper 
          elevation={3} 
          sx={{ 
            p: 3, 
            mb: 3, 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center' 
          }}
        >
          <Typography variant="h6" gutterBottom>
            Searching for best prices...
          </Typography>
          
          <Box sx={{ width: '100%', mt: 1, mb: 2 }}>
            <LinearProgress variant="determinate" value={progressPercentage} />
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
              {`${progress?.completed || 0} of ${progress?.total || 0} searches completed`}
            </Typography>
          </Box>
          
          <CircularProgress size={40} thickness={4} />
        </Paper>
      )}

      {bestStores.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom>
            Best Stores For Your Shopping List
          </Typography>
          
          <Grid container spacing={2}>
            {bestStores.slice(0, 3).map((store, index) => (
              <Grid item xs={12} md={4} key={store.name}>
                <Card 
                  elevation={index === 0 ? 4 : 1}
                  sx={{
                    height: '100%',
                    position: 'relative',
                    ...(index === 0 && {
                      border: '2px solid',
                      borderColor: 'primary.main',
                    })
                  }}
                >
                  {index === 0 && (
                    <Chip 
                      label="BEST MATCH" 
                      color="primary" 
                      size="small" 
                      sx={{ 
                        position: 'absolute', 
                        top: 8, 
                        right: 8,
                        fontWeight: 'bold'
                      }} 
                    />
                  )}
                  
                  <CardHeader
                    title={store.name}
                    subheader={store.distance ? `${store.distance} miles away` : 'Distance unknown'}
                    titleTypographyProps={{ variant: 'h6' }}
                    avatar={<StoreIcon color={index === 0 ? 'primary' : 'action'} />}
                  />
                  
                  <CardContent>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="h5" color="primary" gutterBottom>
                        {store.formattedTotalPrice}
                      </Typography>
                      
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <CheckCircleIcon 
                          color={store.hasMostItems ? 'success' : 'action'} 
                          fontSize="small" 
                          sx={{ mr: 1 }} 
                        />
                        <Typography variant="body2">
                          {store.totalItems} of {shoppingList.length} items available
                          {store.hasMostItems && ' (Complete list)'}
                        </Typography>
                      </Box>
                      
                      <LinearProgress 
                        variant="determinate" 
                        value={store.coverage} 
                        color={store.coverage > 80 ? 'success' : 'primary'}
                        sx={{ height: 8, borderRadius: 1 }}
                      />
                    </Box>
                    
                    <Divider sx={{ my: 1 }} />
                    
                    <Typography variant="subtitle2" gutterBottom>
                      Available Items:
                    </Typography>
                    
                    <List dense disablePadding>
                      {Object.entries(store.items).slice(0, 3).map(([itemName, itemDetails]) => (
                        <ListItem key={itemName} disablePadding sx={{ py: 0.5 }}>
                          <LocalOfferIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
                          <ListItemText 
                            primary={`${itemName}`}
                            secondary={itemDetails.price}
                            primaryTypographyProps={{ variant: 'body2' }}
                            secondaryTypographyProps={{ color: 'primary' }}
                          />
                        </ListItem>
                      ))}
                      
                      {Object.keys(store.items).length > 3 && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          +{Object.keys(store.items).length - 3} more items
                        </Typography>
                      )}
                    </List>
                    
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                      <Button 
                        variant={index === 0 ? "contained" : "outlined"}
                        size="small" 
                        onClick={() => onSelectStore?.(store)}
                        fullWidth
                      >
                        {index === 0 ? 'Select This Store' : 'View Details'}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
          
          {bestStores.length > 3 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                +{bestStores.length - 3} more stores found
              </Typography>
            </Box>
          )}
          
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
            <Button 
              variant="outlined" 
              onClick={handleSearch}
              startIcon={<ShoppingBasketIcon />}
            >
              Search Again
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
};

export default BestPricesFinder; 