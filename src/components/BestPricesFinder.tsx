import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
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
  id?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  priceLevel?: number;
  place_id?: string;
  vicinity?: string;
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

interface BestPricesStore {
  name: string;
  address: string;
  distance: number;
  items: Record<string, Item>;
}

interface BestPricesFinderProps {
  shoppingList: string[];
  currentLocation: { lat: number; lng: number } | null;
  onRequestLocation: () => Promise<void>;
  preferredStores: string[];
  storeData?: any[];
  onSelectStore?: (store: BestPricesStore) => void;
}

const BestPricesFinder = forwardRef<{ handleSearch: () => Promise<void> }, BestPricesFinderProps>(({ 
  shoppingList,
  currentLocation,
  onRequestLocation,
  preferredStores = [],
  storeData,
  onSelectStore
}, ref) => {
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [bestStores, setBestStores] = useState<Store[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [locationRequested, setLocationRequested] = useState(false);
  const [searchInProgress, setSearchInProgress] = useState(false);
  const scraperApi = ScraperApi.getInstance();

  // Expose the handleSearch method to the parent component
  useImperativeHandle(ref, () => ({
    handleSearch: handleSearch
  }));

  // Auto-trigger search when store data changes
  useEffect(() => {
    if (storeData && storeData.length > 0 && shoppingList.length > 0 && !isSearching && !searchInProgress) {
      console.log('Auto-triggering search because storeData changed');
      handleSearch();
    }
  }, [storeData, shoppingList, isSearching, searchInProgress, currentLocation]);

  // Start the search process
  const handleSearch = async () => {
    // Prevent duplicate searches
    if (searchInProgress) {
      console.log('Search already in progress, skipping duplicate request');
      return;
    }

    // Validate shopping list
    if (!shoppingList || shoppingList.length === 0) {
      setError('Your shopping list is empty. Add some items first!');
      return;
    }

    // Check if location is available
    if (!currentLocation) {
      if (onRequestLocation) {
        setError('Location services required for nearby store search');
        onRequestLocation();
        setLocationRequested(true);
      } else {
        setError('Location services are required to search for nearby stores');
      }
      return;
    }

      setIsSearching(true);
      setError(null);
      setBestStores([]);
    setSearchInProgress(true);

    try {
      // Use store data from props if available
      if (storeData && storeData.length > 0) {
        console.log(`Using ${storeData.length} stores from props`);
        
        // Process the store data into the required format
        const processedStores = storeData.map(store => ({
          name: store.name,
          distance: store.distance || null,
          items: store.items || {},
          totalItems: Object.keys(store.items || {}).length,
          totalPrice: Object.values(store.items || {}).reduce((sum: number, item: any) => 
            sum + (parseFloat(item.price?.toString().replace(/[^\d.]/g, '') || '0')), 0),
          formattedTotalPrice: `$${Object.values(store.items || {}).reduce((sum: number, item: any) => 
            sum + (parseFloat(item.price?.toString().replace(/[^\d.]/g, '') || '0')), 0).toFixed(2)}`,
          hasMostItems: Object.keys(store.items || {}).length === shoppingList.length,
          coverage: (Object.keys(store.items || {}).length / shoppingList.length) * 100,
          id: store.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          itemsWithBestPrice: 0
        }));

        // Find the cheapest price for each item across all stores
        const cheapestPricesByItem: Record<string, {price: number, store: string}> = {};
        
        shoppingList.forEach(item => {
          let cheapestPrice = Infinity;
          let cheapestStore = '';
          
          for (const store of processedStores) {
            const itemData = store.items[item];
            if (itemData) {
              const price = parseFloat(itemData.price);
              if (price < cheapestPrice) {
                cheapestPrice = price;
                cheapestStore = store.name;
              }
            }
          }
          
          if (cheapestPrice !== Infinity) {
            cheapestPricesByItem[item] = { price: cheapestPrice, store: cheapestStore };
          }
        });
        
        // Update the store data with best price indicators
        const enhancedStores = processedStores.map(store => {
          const storeWithBestPrices = { ...store, itemsWithBestPrice: 0 };
          
          Object.entries(store.items).forEach(([itemName, itemData]) => {
            const cheapestInfo = cheapestPricesByItem[itemName];
            if (cheapestInfo && cheapestInfo.store === store.name) {
              storeWithBestPrices.itemsWithBestPrice++;
            }
          });
          
          return storeWithBestPrices;
        });
        
        // Sort by number of items, then best prices, then total price
        enhancedStores.sort((a, b) => {
          if (a.totalItems !== b.totalItems) {
            return b.totalItems - a.totalItems;
          }
          if (a.itemsWithBestPrice !== b.itemsWithBestPrice) {
            return b.itemsWithBestPrice - a.itemsWithBestPrice;
          }
          return a.totalPrice - b.totalPrice;
        });
        
        setBestStores(enhancedStores);
      } else {
        setError('No store data available');
      }
      
      setIsSearching(false);
      setSearchInProgress(false);
    } catch (err) {
      setError(`Error processing store data: ${err instanceof Error ? err.message : String(err)}`);
      setIsSearching(false);
      setSearchInProgress(false);
    }
  };

  // Find the cheapest price for each item across all stores
  const getCheapestPrice = (item: string) => {
    let cheapestPrice = Infinity;
    let cheapestStore = '';

    bestStores.forEach(store => {
      const itemData = store.items[item];
      if (itemData) {
        const price = parseFloat(itemData.price);
        if (price < cheapestPrice) {
          cheapestPrice = price;
          cheapestStore = store.name;
        }
      }
    });

    return { price: cheapestPrice, store: cheapestStore };
  };

  // Find the second-best price for each item across all stores
  const getSecondBestPrice = (item: string) => {
    let cheapestPrice = Infinity;
    let secondCheapestPrice = Infinity;
    let cheapestStore = '';
    let secondCheapestStore = '';

    bestStores.forEach(store => {
      const itemData = store.items[item];
      if (itemData) {
        const price = parseFloat(itemData.price);
        if (price < cheapestPrice) {
          // Current cheapest becomes second cheapest
          secondCheapestPrice = cheapestPrice;
          secondCheapestStore = cheapestStore;
          // New cheapest
          cheapestPrice = price;
          cheapestStore = store.name;
        } else if (price < secondCheapestPrice && price > cheapestPrice) {
          // New second cheapest
          secondCheapestPrice = price;
          secondCheapestStore = store.name;
        }
      }
    });

    return { price: secondCheapestPrice === Infinity ? null : secondCheapestPrice, store: secondCheapestStore };
  };

  // Combined function to handle location request and search
  const handleFindNearbyPrices = () => {
    if (!currentLocation && onRequestLocation) {
      onRequestLocation();
      setLocationRequested(true);
      // The search will be triggered after location is received
    } else if (currentLocation) {
      // If we already have location, start the search
      handleSearch();
    }
  };

  // Check if location changed and automatically search
  useEffect(() => {
    if (currentLocation && locationRequested && !isSearching && bestStores.length === 0) {
      // Location was just received, start the search
      handleSearch();
    }
  }, [currentLocation, locationRequested]);

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
            {locationRequested && !currentLocation 
              ? 'Finding your location...' 
              : 'Searching for best prices...'}
          </Typography>
          
          <Box sx={{ width: '100%', mt: 1, mb: 2 }}>
            <LinearProgress variant="determinate" 
              value={locationRequested && !currentLocation ? 10 : progressPercentage} />
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
              {locationRequested && !currentLocation 
                ? 'Please allow location access when prompted'
                : `${progress?.completed || 0} of ${progress?.total || 0} searches completed`}
            </Typography>
          </Box>
          
          <CircularProgress size={40} thickness={4} />
        </Paper>
      )}

      {!isSearching && bestStores.length === 0 && (
        <Box sx={{ textAlign: 'center', p: 3 }}>
          <Typography variant="body1" color="text.secondary">
            {shoppingList.length === 0 
              ? "Add items to your shopping list and click 'Find Stores & Compare Prices'" 
              : "Click the 'Refresh Prices' button to find the best prices for your shopping list"}
          </Typography>
        </Box>
      )}

      {bestStores.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom>
            Best Prices By Item
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
                      label="MOST COMPLETE" 
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
                    
                    {/* Add best price count */}
                    <Box sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <LocalOfferIcon 
                          color="success" 
                          fontSize="small" 
                          sx={{ mr: 1 }} 
                        />
                        <Typography variant="body2">
                          {Object.keys(store.items).filter(itemName => {
                            const cheapest = getCheapestPrice(itemName);
                            return cheapest.store === store.name;
                          }).length} items with best price
                        </Typography>
                      </Box>
                      
                      {/* Add second-best price count */}
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <LocalOfferIcon 
                          sx={{ mr: 1, color: '#ed6c02' }} 
                          fontSize="small" 
                        />
                        <Typography variant="body2" sx={{ color: '#ed6c02' }}>
                          {Object.keys(store.items).filter(itemName => {
                            const secondBest = getSecondBestPrice(itemName);
                            return secondBest.store === store.name;
                          }).length} items with 2nd best price
                        </Typography>
                      </Box>
                    </Box>
                    
                    <Divider sx={{ my: 1 }} />
                    
                    <Typography variant="subtitle2" gutterBottom>
                      Available Items:
                    </Typography>
                    
                    <List dense disablePadding>
                      {Object.entries(store.items)
                        .map(([itemName, itemDetails]) => {
                          const cheapest = getCheapestPrice(itemName);
                          const secondBest = getSecondBestPrice(itemName);
                          const isBestPrice = cheapest.store === store.name;
                          const isSecondBestPrice = secondBest.store === store.name;
                          return { 
                            itemName, 
                            itemDetails, 
                            isBestPrice,
                            isSecondBestPrice,
                            price: parseFloat(itemDetails.price) 
                          };
                        })
                        // First sort by best price, then second best, then by price
                        .sort((a, b) => {
                          if (a.isBestPrice !== b.isBestPrice) {
                            return a.isBestPrice ? -1 : 1;
                          }
                          if (a.isSecondBestPrice !== b.isSecondBestPrice) {
                            return a.isSecondBestPrice ? -1 : 1;
                          }
                          return a.price - b.price;
                        })
                        .slice(0, 3)
                        .map(({ itemName, itemDetails, isBestPrice, isSecondBestPrice }) => (
                        <ListItem key={itemName} disablePadding sx={{ py: 0.5 }}>
                            <LocalOfferIcon 
                              fontSize="small" 
                              sx={{ 
                                mr: 1, 
                                color: isBestPrice ? 'success.main' : isSecondBestPrice ? '#ed6c02' : 'text.secondary' 
                              }} 
                            />
                          <ListItemText 
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                  <Typography 
                                    variant="body2" 
                                    sx={{ 
                                      fontWeight: (isBestPrice || isSecondBestPrice) ? 'bold' : 'normal',
                                      color: isBestPrice ? 'success.main' : isSecondBestPrice ? '#ed6c02' : 'inherit'
                                    }}
                                  >
                                    {itemName}
                                    {isBestPrice && (
                                      <Typography 
                                        component="span" 
                                        variant="caption" 
                                        sx={{ ml: 0.5, color: 'success.main' }}
                                      >
                                        (Best)
                                      </Typography>
                                    )}
                                    {isSecondBestPrice && (
                                      <Typography 
                                        component="span" 
                                        variant="caption" 
                                        sx={{ ml: 0.5, color: '#ed6c02' }}
                                      >
                                        (2nd Best)
                                      </Typography>
                                    )}
                                  </Typography>
                                </Box>
                              }
                            secondary={itemDetails.price}
                              primaryTypographyProps={{ 
                                variant: 'body2',
                                sx: { color: isBestPrice ? 'success.main' : isSecondBestPrice ? '#ed6c02' : 'inherit' }
                              }}
                              secondaryTypographyProps={{ 
                                color: isBestPrice ? 'success' : isSecondBestPrice ? 'warning' : 'primary' 
                              }}
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
                        onClick={() => {
                          console.log(`Selecting store: ${store.name}`, store);
                          if (onSelectStore) {
                            console.log('onSelectStore is defined, calling it');
                            onSelectStore(store as BestPricesStore);
                          } else {
                            console.error('onSelectStore is not defined');
                          }
                        }}
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
              onClick={handleFindNearbyPrices}
              startIcon={<ShoppingBasketIcon />}
            >
              Search Again
            </Button>
          </Box>
        </>
      )}

      {!isSearching && bestStores.length > 0 && (
        <Paper elevation={3} sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            Price Comparison
          </Typography>
          
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Item</th>
                  {bestStores.map((store, index) => (
                    <th key={`store-header-${store.name}-${index}`} style={{ textAlign: 'right', padding: '8px' }}>
                      {store.name}
                      {store.distance !== null && (
                        <Typography variant="caption" display="block">
                          {store.distance.toFixed(1)} mi away
                        </Typography>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shoppingList.map((item, index) => {
                  const cheapest = getCheapestPrice(item);
                  const secondBest = getSecondBestPrice(item);
                  return (
                    <tr key={`item-${item}-${index}`}>
                      <td style={{ padding: '8px' }}>{item}</td>
                      {bestStores.map((store, storeIndex) => {
                        const itemData = store.items[item];
                        const isCheapest = store.name === cheapest.store;
                        const isSecondBest = store.name === secondBest.store;
                        const price = itemData ? parseFloat(itemData.price) : null;
                        
                        let backgroundColor = 'transparent';
                        let fontWeight = 'normal';
                        let textColor = 'inherit';
                        
                        if (isCheapest) {
                          backgroundColor = 'rgba(76, 175, 80, 0.1)';
                          fontWeight = 'bold';
                          textColor = '#2e7d32'; // green
                        } else if (isSecondBest) {
                          backgroundColor = 'rgba(255, 152, 0, 0.1)';
                          fontWeight = 'bold';
                          textColor = '#ed6c02'; // amber/orange
                        }
                        
                        return (
                          <td 
                            key={`${item}-${store.name}-${storeIndex}`}
                            style={{ 
                              textAlign: 'right',
                              padding: '8px',
                              backgroundColor,
                              fontWeight,
                              color: textColor
                            }}
                          >
                            {price !== null ? (
                              <>
                                ${price.toFixed(2)}
                                {isCheapest && (
                                  <span style={{ marginLeft: '5px', color: '#2e7d32', fontSize: '0.75rem' }}>
                                    (Best)
                                  </span>
                                )}
                                {isSecondBest && (
                                  <span style={{ marginLeft: '5px', color: '#ed6c02', fontSize: '0.75rem' }}>
                                    (2nd Best)
                                  </span>
                                )}
                              </>
                            ) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr>
                  <td style={{ padding: '8px', fontWeight: 'bold' }}>Total</td>
                  {bestStores.map((store, storeIndex) => {
                    const isCheapest = bestStores.indexOf(store) === 0; // First store is cheapest
                    const isSecondCheapest = bestStores.indexOf(store) === 1; // Second store is second cheapest
                    
                    let backgroundColor = 'transparent';
                    let textColor = 'inherit';
                    
                    if (isCheapest) {
                      backgroundColor = 'rgba(76, 175, 80, 0.1)';
                      textColor = '#2e7d32'; // Green
                    } else if (isSecondCheapest) {
                      backgroundColor = 'rgba(255, 152, 0, 0.1)';
                      textColor = '#ed6c02'; // Amber/orange
                    }
                    
                    return (
                      <td 
                        key={`total-${store.name}-${storeIndex}`}
                        style={{ 
                          textAlign: 'right',
                          padding: '8px',
                          fontWeight: 'bold',
                          backgroundColor,
                          color: textColor
                        }}
                      >
                        {store.formattedTotalPrice}
                        {isCheapest && (
                          <span style={{ display: 'block', color: '#2e7d32', fontSize: '0.75rem' }}>
                            Best Total
                          </span>
                        )}
                        {isSecondCheapest && (
                          <span style={{ display: 'block', color: '#ed6c02', fontSize: '0.75rem' }}>
                            2nd Best Total
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </Box>
        </Paper>
      )}
    </Box>
  );
});

export default BestPricesFinder;