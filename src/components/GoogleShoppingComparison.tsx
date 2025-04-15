import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  TextField,
  Typography,
  Alert,
  Stack,
  Switch,
  FormControlLabel,
  Collapse,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import StorefrontIcon from '@mui/icons-material/Storefront';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import BugReportIcon from '@mui/icons-material/BugReport';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

interface Store {
  id: string;
  name: string;
  address: string;
  distance: number;
  latitude: number;
  longitude: number;
}

interface PriceItem {
  name: string;
  price: number;
  productName: string;
  confidence: number;
  priceWas?: number;
  availability?: string;
  distance?: string;
}

interface StoreResult {
  storeName: string;
  items: PriceItem[];
  totalPrice: number;
  source: string;
}

interface ComparisonResult {
  results: StoreResult[];
  errors?: string[];
}

const GoogleShoppingComparison: React.FC = () => {
  const [selectedStores, setSelectedStores] = useState<Store[]>([]);
  const [shoppingList, setShoppingList] = useState<string[]>(['']);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResults, setComparisonResults] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  // Add logging function to capture debug information
  const addDebugInfo = (message: string) => {
    if (debugMode) {
      setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    }
  };

  // Get user location on component mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          addDebugInfo(`Location received: ${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
        },
        (error) => {
          console.error('Error getting location:', error);
          addDebugInfo(`Location error: ${error.message}`);
        }
      );
    }
  }, [debugMode]);

  // Fetch nearby stores when user location is available
  useEffect(() => {
    const fetchStores = async () => {
      if (!userLocation) return;

      try {
        addDebugInfo(`Fetching stores at: ${userLocation.latitude.toFixed(6)}, ${userLocation.longitude.toFixed(6)}`);
        
        const response = await fetch(
          `/api/stores?latitude=${userLocation.latitude}&longitude=${userLocation.longitude}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch nearby stores');
        }

        const data = await response.json();
        addDebugInfo(`Found ${data.length} stores nearby`);
        
        // Select first 3 stores by default
        setSelectedStores(data.slice(0, 3));
      } catch (err) {
        console.error('Error fetching stores:', err);
        addDebugInfo(`Store fetch error: ${err instanceof Error ? err.message : String(err)}`);
        setError('Could not find nearby stores. Please try again later.');
      }
    };

    fetchStores();
  }, [userLocation]);

  const handleCompare = async () => {
    // Filter out empty items
    const itemsToCompare = shoppingList.filter(item => item.trim() !== '');
    
    if (itemsToCompare.length === 0) {
      setError('Please add at least one item to compare');
      return;
    }

    if (selectedStores.length === 0) {
      setError('Please select at least one store to compare');
      return;
    }

    setIsComparing(true);
    setError(null);
    setComparisonResults(null);
    
    // Clear debug info before starting new comparison
    if (debugMode) {
      setDebugInfo([`Starting comparison for ${itemsToCompare.length} items at ${selectedStores.length} stores`]);
    }

    try {
      // Use a timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for the entire comparison
      
      addDebugInfo(`Sending compare-shopping request`);
      
      const response = await fetch('/api/compare-shopping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          stores: selectedStores,
          items: itemsToCompare,
          location: userLocation
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json();
        addDebugInfo(`API error: ${errorData.error || 'Unknown error'}`);
        throw new Error(errorData.error || 'Failed to compare prices');
      }

      const data = await response.json();
      addDebugInfo(`Received response with ${data.results?.length || 0} store results`);
      
      setComparisonResults(data);
      
      // Log success message
      console.log(`Successfully compared prices for ${itemsToCompare.length} items at ${selectedStores.length} stores`);
      
      // If no results were found, show a helpful error
      if (data.results?.length === 0) {
        addDebugInfo('No results found in response');
        setError('No price information could be found. Try with different items or stores.');
      }
    } catch (err) {
      console.error('Error comparing prices:', err);
      addDebugInfo(`Comparison error: ${err instanceof Error ? err.message : String(err)}`);
      setError(err instanceof Error ? err.message : 'An error occurred while comparing prices');
    } finally {
      setIsComparing(false);
      addDebugInfo('Comparison request completed');
    }
  };

  const addItemToList = () => {
    setShoppingList([...shoppingList, '']);
  };

  const updateItem = (index: number, value: string) => {
    const updatedList = [...shoppingList];
    updatedList[index] = value;
    setShoppingList(updatedList);
  };

  const removeItem = (index: number) => {
    if (shoppingList.length <= 1) {
      setShoppingList(['']);
    } else {
      const updatedList = shoppingList.filter((_, i) => i !== index);
      setShoppingList(updatedList);
    }
  };

  // Format currency for display
  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  return (
    <Container maxWidth="lg" sx={{ my: 4 }}>
      <Paper sx={{ p: 3, mb: 4 }} elevation={2}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ShoppingCartIcon sx={{ mr: 2, color: 'primary.main' }} />
            <Typography variant="h5" component="h1" gutterBottom sx={{ mb: 0 }}>
              Google Shopping Price Comparison
            </Typography>
          </Box>
          <Box>
            <IconButton 
              color="info" 
              onClick={() => setShowHelp(!showHelp)}
              aria-label="Show help"
            >
              <HelpOutlineIcon />
            </IconButton>
            <FormControlLabel
              control={
                <Switch
                  checked={debugMode}
                  onChange={(e) => setDebugMode(e.target.checked)}
                  color="warning"
                  size="small"
                />
              }
              label={<Box sx={{ display: 'flex', alignItems: 'center' }}><BugReportIcon fontSize="small" sx={{ mr: 0.5 }} /> Debug</Box>}
              sx={{ ml: 1 }}
            />
          </Box>
        </Box>

        <Collapse in={showHelp}>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="subtitle2">How it works:</Typography>
            <Typography variant="body2">
              This tool uses Google Shopping to find real-time prices for your grocery items at selected stores.
              For best results:
            </Typography>
            <List dense>
              <ListItem sx={{ py: 0 }}>
                <ListItemIcon sx={{ minWidth: 24 }}><TaskAltIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Be specific with item descriptions (e.g., 'Organic Milk 1 Gallon' instead of just 'Milk')" primaryTypographyProps={{ variant: 'body2' }} />
              </ListItem>
              <ListItem sx={{ py: 0 }}>
                <ListItemIcon sx={{ minWidth: 24 }}><TaskAltIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Allow location access to find nearby stores" primaryTypographyProps={{ variant: 'body2' }} />
              </ListItem>
              <ListItem sx={{ py: 0 }}>
                <ListItemIcon sx={{ minWidth: 24 }}><TaskAltIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="If results are unavailable, try a more common item description" primaryTypographyProps={{ variant: 'body2' }} />
              </ListItem>
            </List>
          </Alert>
        </Collapse>

        <Typography variant="body1" color="text.secondary" paragraph>
          Compare real-time prices for your shopping list across different stores using Google Shopping data.
        </Typography>

        {/* Shopping List Section */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" component="h2" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <ShoppingCartIcon fontSize="small" sx={{ mr: 1 }} />
            Your Shopping List
          </Typography>
          
          <List>
            {shoppingList.map((item, index) => (
              <ListItem key={index} disableGutters sx={{ pb: 1 }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={10} sm={11}>
                    <TextField
                      fullWidth
                      size="small"
                      variant="outlined"
                      value={item}
                      onChange={(e) => updateItem(index, e.target.value)}
                      placeholder="Enter item name (e.g., Organic Milk 1 gallon)"
                      disabled={isComparing}
                    />
                  </Grid>
                  <Grid item xs={2} sm={1}>
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => removeItem(index)}
                      disabled={isComparing}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Grid>
                </Grid>
              </ListItem>
            ))}
          </List>
          
          <Button
            startIcon={<AddIcon />}
            onClick={addItemToList}
            variant="outlined"
            size="small"
            sx={{ mt: 1 }}
            disabled={isComparing}
          >
            Add Item
          </Button>
        </Box>

        {/* Selected Stores Section */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <StorefrontIcon fontSize="small" sx={{ mr: 1 }} />
            Selected Stores
          </Typography>
          
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            {selectedStores.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Waiting for nearby stores...
              </Typography>
            ) : (
              selectedStores.map((store) => (
                <Chip 
                  key={store.id}
                  label={`${store.name} (${store.distance.toFixed(1)} mi)`} 
                  color="primary"
                  icon={<StorefrontIcon />}
                  onDelete={() => setSelectedStores(selectedStores.filter(s => s.id !== store.id))}
                  disabled={isComparing}
                />
              ))
            )}
          </Box>
        </Box>

        {/* Compare Button */}
        <Button
          fullWidth
          variant="contained"
          color="primary"
          startIcon={isComparing ? <CircularProgress size={20} color="inherit" /> : <CompareArrowsIcon />}
          onClick={handleCompare}
          disabled={isComparing || selectedStores.length === 0 || shoppingList.every(item => item.trim() === '')}
          sx={{ py: 1.5 }}
        >
          {isComparing ? 'Comparing Prices...' : 'Compare Prices with Google Shopping'}
        </Button>
      </Paper>

      {/* Debug Information */}
      {debugMode && (
        <Paper sx={{ p: 2, mb: 3, bgcolor: 'grey.900' }} elevation={2}>
          <Typography variant="subtitle2" color="warning.main" gutterBottom>
            Debug Information
          </Typography>
          <Box sx={{ maxHeight: 200, overflow: 'auto', px: 1 }}>
            {debugInfo.length === 0 ? (
              <Typography variant="caption" color="grey.500">No debug information available</Typography>
            ) : (
              debugInfo.map((info, i) => (
                <Typography key={i} variant="caption" component="div" color="grey.300" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                  {info}
                </Typography>
              ))
            )}
          </Box>
        </Paper>
      )}

      {/* Error Message */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Comparison Results */}
      {comparisonResults && (
        <Box>
          <Typography variant="h5" component="h2" gutterBottom sx={{ mb: 3 }}>
            Price Comparison Results
          </Typography>

          {comparisonResults.results.length === 0 ? (
            <Alert severity="info">
              Could not find any price information for your items at the selected stores.
            </Alert>
          ) : (
            <Grid container spacing={3}>
              {comparisonResults.results.map((result, index) => (
                <Grid item xs={12} md={6} lg={4} key={index}>
                  <Card elevation={3} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <StorefrontIcon fontSize="large" color="primary" sx={{ mr: 1 }} />
                        <Typography variant="h6" component="h3">
                          {result.storeName}
                        </Typography>
                      </Box>

                      <Divider sx={{ mb: 2 }} />

                      <Box sx={{ mb: 3 }}>
                        <Typography variant="h5" color="primary" fontWeight="bold" align="center">
                          Total: {formatCurrency(result.totalPrice)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" align="center">
                          {result.source === 'google-shopping' ? 'Prices from Google Shopping' : 'Source: ' + result.source}
                        </Typography>
                      </Box>

                      <List dense>
                        {result.items.map((item, itemIndex) => (
                          <ListItem 
                            key={itemIndex} 
                            alignItems="flex-start"
                            sx={{ 
                              mb: 1, 
                              bgcolor: 'background.paper', 
                              borderRadius: 1,
                              boxShadow: 1
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 32 }}>
                              <LocalOfferIcon color="success" fontSize="small" />
                            </ListItemIcon>
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Typography variant="body2" fontWeight="bold">
                                    {item.name}
                                  </Typography>
                                  <Typography variant="body2" fontWeight="bold" color="success.main">
                                    {formatCurrency(item.price)}
                                  </Typography>
                                </Box>
                              }
                              secondary={
                                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                                  <Typography variant="caption" color="text.secondary" noWrap>
                                    {item.productName}
                                  </Typography>
                                  {item.priceWas && (
                                    <Typography variant="caption" color="text.secondary">
                                      Was: {formatCurrency(item.priceWas)}
                                    </Typography>
                                  )}
                                  {item.availability && (
                                    <Typography variant="caption" color="info.main">
                                      {item.availability}
                                    </Typography>
                                  )}
                                </Stack>
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
          )}

          {/* Display any errors that occurred during comparison */}
          {comparisonResults.errors && comparisonResults.errors.length > 0 && (
            <Alert severity="warning" sx={{ mt: 3 }}>
              <Typography variant="subtitle2">Some items could not be found:</Typography>
              <List dense>
                {comparisonResults.errors.map((err, index) => (
                  <ListItem key={index} sx={{ py: 0 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <ErrorOutlineIcon fontSize="small" color="warning" />
                    </ListItemIcon>
                    <ListItemText primary={err} primaryTypographyProps={{ variant: 'body2' }} />
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}
        </Box>
      )}
    </Container>
  );
};

export default GoogleShoppingComparison; 