declare module '../../scraper.js' {
  export interface ScraperStore {
    name: string;
    distance: number | null;
    items: Array<{
      name: string;
      price: string;
      method: string;
    }>;
  }

  export interface ScraperResult {
    success: boolean;
    stores: ScraperStore[];
    products: Array<{
      name: string;
      price: string;
      store: string | null;
      distance: number | null;
      method: string;
    }>;
    totalStores: number;
    totalProducts: number;
    error?: string;
  }

  export function scrapeGoogleShopping(item: string, locationHint?: string): Promise<ScraperResult>;
} 