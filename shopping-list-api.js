import express from 'express';
import cors from 'cors';
import { scrapeGoogleShopping } from './scraper.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000'
}));

// Store search results cache
const searchCache = {
  results: {},
  timestamp: {}
};

// Cache expiration time (15 minutes)
const CACHE_EXPIRATION = 15 * 60 * 1000;

// Clear expired cache entries
setInterval(() => {
  const now = Date.now();
  Object.keys(searchCache.timestamp).forEach(key => {
    if (now - searchCache.timestamp[key] > CACHE_EXPIRATION) {
      delete searchCache.results[key];
      delete searchCache.timestamp[key];
    }
  });
}, 5 * 60 * 1000); // Check every 5 minutes

// Helper to generate cache key
const getCacheKey = (item, store) => `${item.toLowerCase()}_${(store || 'nearby').toLowerCase()}`;

// Main API endpoint for searching products
app.post('/api/search', async (req, res) => {
  try {
    const { items, stores, useCache = true } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'No items provided' });
    }
    
    // Validate items are strings
    if (items.some(item => typeof item !== 'string' || item.trim() === '')) {
      return res.status(400).json({ success: false, error: 'Invalid items' });
    }
    
    // Normalize stores array
    const storeList = Array.isArray(stores) && stores.length > 0 
      ? stores 
      : [null]; // null means "nearby"
    
    console.log(`Searching for ${items.length} items at ${storeList.length} locations`);
    
    // Track progress for long-running requests
    const progress = {
      total: items.length * storeList.length,
      completed: 0,
      failed: 0
    };
    
    // Start search in background and return initial response
    res.status(202).json({
      success: true,
      message: 'Search started',
      jobId: Date.now().toString(),
      progress
    });
    
    // Process searches with limited concurrency
    const results = {};
    const MAX_CONCURRENT = 2;
    
    // Group search tasks into batches
    const searchTasks = [];
    for (const item of items) {
      for (const store of storeList) {
        searchTasks.push({ item, store });
      }
    }
    
    // Process batches
    for (let i = 0; i < searchTasks.length; i += MAX_CONCURRENT) {
      const batch = searchTasks.slice(i, i + MAX_CONCURRENT);
      
      // Run batch in parallel
      const batchPromises = batch.map(async ({ item, store }) => {
        const cacheKey = getCacheKey(item, store);
        
        // Check cache first
        if (useCache && 
            searchCache.results[cacheKey] && 
            Date.now() - searchCache.timestamp[cacheKey] < CACHE_EXPIRATION) {
          console.log(`Using cached results for ${item} at ${store || 'nearby'}`);
          progress.completed++;
          
          if (!results[item]) {
            results[item] = {};
          }
          results[item][store || 'nearby'] = searchCache.results[cacheKey];
          return;
        }
        
        try {
          console.log(`Searching for ${item} at ${store || 'nearby'}`);
          const result = await scrapeGoogleShopping(item, store);
          
          // Cache successful results
          if (result.success) {
            searchCache.results[cacheKey] = result;
            searchCache.timestamp[cacheKey] = Date.now();
          }
          
          // Add to results
          if (!results[item]) {
            results[item] = {};
          }
          results[item][store || 'nearby'] = result;
          
          progress.completed++;
        } catch (error) {
          console.error(`Error searching for ${item} at ${store || 'nearby'}:`, error);
          progress.failed++;
          progress.completed++;
          
          if (!results[item]) {
            results[item] = {};
          }
          results[item][store || 'nearby'] = { 
            success: false, 
            error: error.message 
          };
        }
      });
      
      await Promise.all(batchPromises);
      
      // Small delay between batches to avoid overloading
      if (i + MAX_CONCURRENT < searchTasks.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Process results to find best stores
    const bestStores = findBestStores(items, results);
    
    // Store the final results for the status endpoint to retrieve
    const jobId = Date.now().toString();
    searchCache.results[jobId] = { results, bestStores, progress };
    searchCache.timestamp[jobId] = Date.now();
    
    console.log('Search completed');
  } catch (error) {
    console.error('Error in search API:', error);
  }
});

// Status endpoint to check progress and get results
app.get('/api/search/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  if (!searchCache.results[jobId]) {
    return res.status(404).json({ 
      success: false, 
      error: 'Job not found or expired' 
    });
  }
  
  const { results, bestStores, progress } = searchCache.results[jobId];
  
  res.json({
    success: true,
    progress,
    completed: progress.completed === progress.total,
    results,
    bestStores
  });
});

// Find best stores function
function findBestStores(items, results) {
  // Store data with item availability and prices
  const storeData = {};
  
  // Process each item's results
  for (const item of items) {
    const itemResults = results[item] || {};
    
    // For each search location
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
            totalPrice: 0
          };
        }
        
        // Get the cheapest item in this store
        const cheapestItem = store.items.reduce((cheapest, current) => {
          const currentPrice = parseFloat(current.price.replace(/[^\d.]/g, ''));
          const cheapestPrice = cheapest 
            ? parseFloat(cheapest.price.replace(/[^\d.]/g, '')) 
            : Infinity;
          
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
  }
  
  // Convert to array and sort by completeness and price
  return Object.values(storeData)
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
      hasMostItems: store.totalItems === items.length,
      coverage: (store.totalItems / items.length) * 100,
      formattedTotalPrice: `$${store.totalPrice.toFixed(2)}`
    }));
}

// Starting the server
app.listen(PORT, () => {
  console.log(`Shopping list API server running on port ${PORT}`);
  console.log(`CORS allowed from: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
}); 