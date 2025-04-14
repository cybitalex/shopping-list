import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  CircularProgress,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Divider,
  Alert,
  Snackbar
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import StorefrontIcon from '@mui/icons-material/Storefront';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';

interface PriceResult {
  success: boolean;
  price: number;
  productName: string;
  source: string;
  store: string;
  confidence?: number;
  error?: string;
  isEstimate?: boolean;
}

const PriceSearch: React.FC = () => {
  const [item, setItem] = useState('');
  const [store, setStore] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PriceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!item.trim() || !store.trim()) {
      setError('Please enter both item and store');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `/api/google-price?item=${encodeURIComponent(item.trim())}&store=${encodeURIComponent(store.trim())}`
      );

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const data = await response.json();
      
      // Only set the result if the search was successful
      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || 'Could not find price information from Google search');
      }
    } catch (err) {
      console.error('Price search error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'google-ai':
        return 'Google Search with AI';
      case 'ai-fallback':
        return 'AI Estimate';
      case 'fallback':
        return 'Estimated';
      default:
        return source;
    }
  };

  const getConfidenceLabel = (confidence?: number, isEstimate?: boolean) => {
    if (isEstimate) return 'Estimated price';
    if (!confidence) return '';
    
    if (confidence >= 0.8) return 'High confidence';
    if (confidence >= 0.5) return 'Medium confidence';
    return 'Low confidence';
  };

  return (
    <Box sx={{ mb: 4 }}>
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Google Price Search
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Search for product prices at specific stores using Google and AI
        </Typography>
        
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={5}>
            <TextField
              fullWidth
              label="Product"
              variant="outlined"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Organic Milk"
              disabled={isLoading}
            />
          </Grid>
          <Grid item xs={12} sm={5}>
            <TextField
              fullWidth
              label="Store"
              variant="outlined"
              value={store}
              onChange={(e) => setStore(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Walmart"
              disabled={isLoading}
            />
          </Grid>
          <Grid item xs={12} sm={2}>
            <Button
              fullWidth
              variant="contained"
              color="primary"
              onClick={handleSearch}
              disabled={isLoading}
              startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
              sx={{ height: '100%' }}
            >
              {isLoading ? 'Searching...' : 'Search'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {result && result.success && (
        <Card elevation={3}>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="h6" component="h3">
                  {result.productName}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <StorefrontIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
                  <Typography variant="body1" color="text.secondary">
                    {result.store}
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12}>
                <Divider sx={{ my: 1 }} />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <LocalOfferIcon fontSize="large" sx={{ mr: 2, color: 'success.main' }} />
                  <Typography variant="h4" component="p" color="success.main" fontWeight="bold">
                    ${result.price.toFixed(2)}
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Source:</strong> {getSourceLabel(result.source)}
                  </Typography>
                  {(result.confidence !== undefined || result.isEstimate) && (
                    <Typography variant="body2" color="text.secondary">
                      <strong>Confidence:</strong> {getConfidenceLabel(result.confidence, result.isEstimate)}
                    </Typography>
                  )}
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        message={error}
      />
    </Box>
  );
};

export default PriceSearch; 