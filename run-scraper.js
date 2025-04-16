import { scrapeGoogleShopping } from './scraper.js';

const item = process.argv[2] || 'apples';
const locationHint = process.argv[3] || '';

console.log(`Starting search for ${item}${locationHint ? ` near ${locationHint}` : ' nearby'}...`);

scrapeGoogleShopping(item, locationHint)
  .then(result => {
    console.log('Search completed!');
    
    if (!result.success) {
      console.error(`Error: ${result.error}`);
      return;
    }
    
    // Print a summary of the results
    console.log(`Found ${result.totalProducts} products from ${result.totalStores} stores.`);
    
    // Format and display the results by store
    console.log('\n--- Products by Store ---');
    Object.keys(result.stores).forEach(storeIndex => {
      const store = result.stores[storeIndex];
      console.log(`\n${store.name}${store.distance ? ` (${store.distance} mi away)` : ''}`);
      console.log('-'.repeat(40));
      
      store.items.forEach(item => {
        console.log(`${item.name} - ${item.price}${item.method.includes('fallback') ? ' *' : ''}`);
      });
    });
    
    // Output the complete result object as JSON if needed for debugging or integration
    console.log('\nFull JSON result:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(err => {
    console.error('Error running scraper:', err);
  }); 