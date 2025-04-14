// Add Zenserp API endpoint for product searches
app.get('/api/zenserp-search', async (req, res) => {
  try {
    const { item, store, latitude, longitude } = req.query;
    
    if (!item || !store) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters: item and store' 
      });
    }

    // Get API key from environment variables
    const ZENSERP_API_KEY = process.env.ZENSERP_API_KEY;
    
    if (!ZENSERP_API_KEY || ZENSERP_API_KEY === 'YOUR_ZENSERP_API_KEY_HERE') {
      return res.status(400).json({
        success: false,
        error: 'Zenserp API key not configured'
      });
    }
    
    console.log(`Searching with Zenserp for ${item} at ${store} ${latitude && longitude ? `near coordinates (${latitude}, ${longitude})` : ''}`);
    
    // Construct search query with location if available
    let searchQuery = `${item} price at ${store}`;
    
    // Add location context if available
    if (latitude && longitude) {
      // Try to get a location name from the coordinates
      try {
        const geocodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
        const geocodingResponse = await fetch(geocodingUrl);
        const geocodingData = await geocodingResponse.json();
        
        if (geocodingData.results && geocodingData.results.length > 0) {
          // Look for address components like city or zip code
          const addressComponents = geocodingData.results[0].address_components;
          const locality = addressComponents.find(comp => comp.types.includes('locality'));
          const zipCode = addressComponents.find(comp => comp.types.includes('postal_code'));
          
          if (locality) {
            searchQuery += ` in ${locality.long_name}`;
          } else if (zipCode) {
            searchQuery += ` in ${zipCode.long_name}`;
          }
        }
      } catch (error) {
        console.error('Error getting location name from coordinates:', error);
        // Fallback to just using "near me"
        searchQuery += ' near me';
      }
    }
    
    const encodedQuery = encodeURIComponent(searchQuery);
    
    // Add location and additional parameters to the Zenserp API request
    let zenserpUrl = `https://app.zenserp.com/api/v2/search?apikey=${ZENSERP_API_KEY}&q=${encodedQuery}&tbm=shop&device=desktop&num=10`;
    
    // Add location parameters if available
    if (latitude && longitude) {
      zenserpUrl += `&location=${encodeURIComponent(`${latitude},${longitude}`)}&gl=us&lr=lang_en`;
    }
    
    console.log(`Zenserp URL: ${zenserpUrl.replace(ZENSERP_API_KEY, "API_KEY_REDACTED")}`);
    
    const response = await fetch(zenserpUrl);
    
    if (!response.ok) {
      throw new Error(`Zenserp API returned ${response.status}: ${await response.text()}`);
    }
    
    const data = await response.json();
    
    // Process the shopping results
    if (data.shopping_results && data.shopping_results.length > 0) {
      // Find the most relevant result - prefer those that match the store name
      const results = data.shopping_results;
      console.log(`Found ${results.length} shopping results from Zenserp`);
      
      // Log the first few results for debugging
      results.slice(0, 3).forEach((result, index) => {
        console.log(`Result ${index + 1}: ${result.title || 'No title'} - ${result.price || 'No price'} from ${result.source || 'unknown source'}`);
      });
      
      // Try to find a result from the requested store
      let bestMatch = results.find(result => 
        result.source && result.source.toLowerCase().includes(store.toLowerCase())
      );
      
      // If no store match, just use the first result
      if (!bestMatch) {
        bestMatch = results[0];
        console.log(`No exact store match found, using first result from ${bestMatch.source || 'unknown source'}`);
      } else {
        console.log(`Found match from ${bestMatch.source}`);
      }
      
      // Extract price (remove currency symbol and convert to number)
      let price = null;
      if (bestMatch.price) {
        const priceMatch = bestMatch.price.replace(/[^0-9.]/g, '');
        price = parseFloat(priceMatch);
      }
      
      if (price === null || isNaN(price)) {
        return res.json({
          success: false,
          error: 'Could not extract price from search results'
        });
      }
      
      return res.json({
        success: true,
        price: price,
        productName: bestMatch.title || item,
        source: 'zenserp',
        store: bestMatch.source || store,
        url: bestMatch.link || '',
        isEstimate: false,
        confidence: 0.9
      });
    } else {
      console.log('No shopping results found from Zenserp');
      return res.json({
        success: false,
        error: 'No shopping results found'
      });
    }
  } catch (error) {
    console.error('Error in Zenserp search:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}); 