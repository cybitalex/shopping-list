declare module '../../scraper.js' {
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

  export function scrapeGoogleShopping(item: string, locationHint?: string): Promise<ScraperResult | ScraperError>;
} 