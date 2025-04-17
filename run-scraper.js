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
    
    // Format and display the results by store
    result.stores.forEach(store => {
      console.log(`\n${store.name}${store.distance ? ` (${store.distance} mi away)` : ''}`);
      console.log('-'.repeat(40));
      
      store.items.forEach(item => {
        console.log(`${item.name} - ${item.price}`);
      });
    });
  })
  .catch(err => {
    console.error('Error running scraper:', err);
  }); 