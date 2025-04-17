import { ScraperApi } from '../api/scraperApi';

interface PriceSearchResult {
  price: number;
  productName: string;
  source: string;
  store: string;
  url: string;
  isEstimate?: boolean;
  distance?: string;
}

export const searchPrices = async (item: string, store: string, location: string): Promise<PriceSearchResult | null> => {
  try {
    const scraperApi = ScraperApi.getInstance();
    const result = await scraperApi.searchProducts(item, store);
    
    if (!result.success) {
      console.error('Error searching prices:', 'success' in result && 'error' in result ? result.error : 'Unknown error');
      return null;
    }
    
    // Find the specific store in the results
    const storeData = result.stores.find(s => s.name.toLowerCase().includes(store.toLowerCase()));
    if (!storeData || !storeData.items || storeData.items.length === 0) {
      return null;
    }

    // Get the first item for this store
    const itemData = storeData.items[0];
    const priceText = itemData.price || "0";
    const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;

    return {
      price,
      productName: itemData.name || item,
      source: 'google_shopping_scraper',
      store: storeData.name,
      url: '',
      isEstimate: itemData.method?.includes('fallback') || false,
      distance: storeData.distance ? `${storeData.distance.toFixed(1)} miles` : undefined
    };
  } catch (error) {
    console.error('Error searching prices:', error);
    return null;
  }
};

export const cleanup = async () => {
  // No-op since we're not managing a browser directly
}; 