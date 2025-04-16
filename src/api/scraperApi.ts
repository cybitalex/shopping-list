import { scrapeGoogleShopping } from '../../scraper.js';

interface ScraperResult {
  success: boolean;
  stores: Array<{
    name: string;
    distance: number | null;
    items: Array<{
      name: string;
      price: string;
      method: string;
    }>;
  }>;
  products: Array<{
    name: string;
    price: string;
    store: string | null;
    distance: number | null;
    method: string;
  }>;
  totalStores: number;
  totalProducts: number;
}

interface ScraperError {
  success: false;
  error: string;
}

export class ScraperApi {
  private static instance: ScraperApi;
  private cache: Map<string, { result: ScraperResult | ScraperError; timestamp: number }>;
  private CACHE_EXPIRATION = 15 * 60 * 1000; // 15 minutes

  private constructor() {
    this.cache = new Map();
    // Clean up expired cache entries periodically
    setInterval(() => this.cleanupCache(), 5 * 60 * 1000); // Every 5 minutes
  }

  public static getInstance(): ScraperApi {
    if (!ScraperApi.instance) {
      ScraperApi.instance = new ScraperApi();
    }
    return ScraperApi.instance;
  }

  private getCacheKey(item: string, store: string | null): string {
    return `${item.toLowerCase()}_${(store || 'nearby').toLowerCase()}`;
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_EXPIRATION) {
        this.cache.delete(key);
      }
    }
  }

  public async searchProducts(item: string, store: string | null = null): Promise<ScraperResult | ScraperError> {
    const cacheKey = this.getCacheKey(item, store);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_EXPIRATION) {
      return cached.result;
    }

    try {
      const result = await scrapeGoogleShopping(item, store || '');
      this.cache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    } catch (error) {
      const errorResult: ScraperError = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      return errorResult;
    }
  }

  public async searchMultipleProducts(items: string[], stores: string[] | null = null): Promise<{
    [key: string]: {
      [key: string]: ScraperResult | ScraperError;
    };
  }> {
    const results: {
      [key: string]: {
        [key: string]: ScraperResult | ScraperError;
      };
    } = {};

    const storeList = stores && stores.length > 0 ? stores : [null];

    for (const item of items) {
      results[item] = {};
      for (const store of storeList) {
        results[item][store || 'nearby'] = await this.searchProducts(item, store);
      }
    }

    return results;
  }
} 