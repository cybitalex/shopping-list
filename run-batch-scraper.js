import { scrapeGoogleShopping } from './scraper.js';
import fs from 'fs/promises';

// Products to search for
const DEFAULT_PRODUCTS = ['apples', 'bananas', 'milk', 'bread', 'eggs'];

// Stores to search at
const DEFAULT_STORES = ['Walmart', 'Target', 'Harris Teeter', 'Kroger', 'Publix'];

// Parse command line arguments
const specifiedProducts = process.argv[2] ? process.argv[2].split(',') : DEFAULT_PRODUCTS;
const specifiedStores = process.argv[3] ? process.argv[3].split(',') : DEFAULT_STORES;

// Configuration options
const options = {
  saveToFile: true,
  outputFile: 'shopping-results.json',
  includeNearby: true, // Also include a nearby search without store specification
  delayBetweenSearches: 2000, // Delay between searches in milliseconds
  maxConcurrentSearches: 2 // Maximum number of concurrent searches
};

// Function to wait for a specified time
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to perform a single search
async function performSearch(product, store) {
  console.log(`Searching for ${product}${store ? ` at ${store}` : ' nearby'}...`);
  
  try {
    const result = await scrapeGoogleShopping(product, store);
    
    // Print a summary
    if (result.success) {
      console.log(`Found ${result.totalProducts || 0} products from ${result.totalStores || 0} stores for ${product}${store ? ` at ${store}` : ' nearby'}`);
    } else {
      console.log(`No results found for ${product}${store ? ` at ${store}` : ' nearby'}: ${result.error || 'Unknown error'}`);
    }
    
    return {
      product,
      store: store || 'nearby',
      timestamp: new Date().toISOString(),
      result
    };
  } catch (error) {
    console.error(`Error searching for ${product}${store ? ` at ${store}` : ' nearby'}: ${error.message}`);
    return {
      product,
      store: store || 'nearby',
      timestamp: new Date().toISOString(),
      result: {
        success: false,
        error: error.message
      }
    };
  }
}

// Main function to run batch search
async function runBatchSearch() {
  console.log('Starting batch search...');
  console.log(`Products: ${specifiedProducts.join(', ')}`);
  console.log(`Stores: ${specifiedStores.join(', ')}`);
  
  const searchTasks = [];
  
  // Create search tasks
  for (const product of specifiedProducts) {
    // Add nearby search if configured
    if (options.includeNearby) {
      searchTasks.push({ product, store: null });
    }
    
    // Add store-specific searches
    for (const store of specifiedStores) {
      searchTasks.push({ product, store });
    }
  }
  
  console.log(`Total searches to perform: ${searchTasks.length}`);
  
  // Execute searches with concurrency control
  const results = [];
  for (let i = 0; i < searchTasks.length; i += options.maxConcurrentSearches) {
    const batch = searchTasks.slice(i, i + options.maxConcurrentSearches);
    const batchResults = await Promise.all(batch.map(task => performSearch(task.product, task.store)));
    results.push(...batchResults);
    
    // Delay between batches if not the last batch
    if (i + options.maxConcurrentSearches < searchTasks.length) {
      await delay(options.delayBetweenSearches);
    }
  }
  
  // Process and output results
  const summary = {};
  
  // Group results by product and store
  for (const result of results) {
    if (!summary[result.product]) {
      summary[result.product] = {};
    }
    
    summary[result.product][result.store] = {
      success: result.result.success,
      totalProducts: result.result.totalProducts || 0,
      totalStores: result.result.totalStores || 0,
      timestamp: result.timestamp
    };
  }
  
  // Print summary
  console.log('\n=== Batch Search Summary ===');
  for (const product in summary) {
    console.log(`\n${product.toUpperCase()}`);
    for (const store in summary[product]) {
      const info = summary[product][store];
      if (info.success) {
        console.log(`  ${store}: ${info.totalProducts} products from ${info.totalStores} stores`);
      } else {
        console.log(`  ${store}: No results found`);
      }
    }
  }
  
  // Save results to file if configured
  if (options.saveToFile) {
    try {
      const outputData = {
        searchParams: {
          products: specifiedProducts,
          stores: specifiedStores,
          includeNearby: options.includeNearby
        },
        timestamp: new Date().toISOString(),
        summary,
        detailedResults: results
      };
      
      await fs.writeFile(options.outputFile, JSON.stringify(outputData, null, 2));
      console.log(`\nResults saved to ${options.outputFile}`);
    } catch (error) {
      console.error(`Error saving results to file: ${error.message}`);
    }
  }
  
  console.log('\nBatch search completed!');
}

// Run the batch search
runBatchSearch().catch(error => {
  console.error('Error in batch search:', error);
}); 