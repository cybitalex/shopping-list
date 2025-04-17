import axios from "axios";

interface GoogleShoppingResult {
  price: number;
  productName: string;
  source: string;
  store: string;
  fullStoreName?: string;
  url: string;
  isEstimate?: boolean;
  returnPolicy?: string;
  rating?: number;
  reviewCount?: number;
  priceWas?: number;
  method?: string;
}

interface GoogleShoppingStoreResult {
  name: string;
  items: Array<{
    name: string;
    price: string;
    url?: string;
    returnsPolicy?: string;
    rating?: string;
    reviewCount?: string;
    method?: string;
  }>;
}

// Fetch prices from Google Shopping
export const fetchGoogleShoppingPrices = async (
  item: string,
  store?: string,
  latitude?: number,
  longitude?: number
): Promise<{
  success: boolean;
  price?: number;
  productName?: string;
  stores?: GoogleShoppingStoreResult[];
  error?: string;
}> => {
  try {
    // Build the API endpoint with location data if available
    let url = `/api/google-price?item=${encodeURIComponent(item)}`;

    if (store) {
      url += `&store=${encodeURIComponent(store)}`;
    }

    if (latitude && longitude) {
      url += `&lat=${latitude}&lng=${longitude}`;
    }

    const response = await axios.get(url);

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(`Request failed with status ${response.status}`);
    }
  } catch (error) {
    console.error(`Error fetching Google Shopping prices for ${item}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// Fetch prices from military commissary
export const fetchCommissaryPrices = async (
  item: string
): Promise<{
  success: boolean;
  price?: number;
  productName?: string;
  error?: string;
}> => {
  try {
    // Format the request to the commissary API
    const commissaryUrl = `/api/commissary-price?item=${encodeURIComponent(
      item
    )}`;

    const response = await axios.get(commissaryUrl);

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(`Request failed with status ${response.status}`);
    }
  } catch (error) {
    console.error(`Error fetching commissary prices for ${item}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// Scrape the commissary website directly as a fallback
export const scrapeCommissaryWebsite = async (
  item: string
): Promise<{
  success: boolean;
  price?: number;
  productName?: string;
  error?: string;
}> => {
  try {
    // Use a proxy to scrape the commissary website
    const scraperUrl = `/api/scrape-commissary?q=${encodeURIComponent(item)}`;

    const response = await axios.get(scraperUrl);

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(`Request failed with status ${response.status}`);
    }
  } catch (error) {
    console.error(`Error scraping commissary website for ${item}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
