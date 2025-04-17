import axios from "axios";

// Backend API base URL
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;

// Options for commissary store detection
const COMMISSARY_KEYWORDS = [
  "commissary",
  "military",
  "exchange",
  "aafes",
  "px",
  "bx",
  "base",
  "fort",
  "post",
  "deca",
];

/**
 * Fetches prices from Google Shopping for a specific item
 */
export const fetchGoogleShoppingPrice = async (
  item: string,
  storeName?: string,
  latitude?: number,
  longitude?: number
) => {
  try {
    // Build query parameters
    const params = new URLSearchParams();
    params.append("item", item);

    if (storeName) {
      params.append("store", storeName);
    }

    if (latitude !== undefined && longitude !== undefined) {
      params.append("lat", latitude.toString());
      params.append("lng", longitude.toString());
    }

    // Add a cache buster
    params.append("_t", Date.now().toString());

    // Make the API request
    const response = await axios.get(
      `${API_BASE_URL}/api/google-price?${params.toString()}`
    );

    return response.data;
  } catch (error) {
    console.error("Error fetching Google Shopping price:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

/**
 * Fetches prices from military commissary for a specific item
 */
export const fetchCommissaryPrice = async (item: string) => {
  try {
    // First try the API endpoint
    const response = await axios.get(
      `${API_BASE_URL}/api/commissary-price?item=${encodeURIComponent(item)}`
    );

    if (response.data.success && response.data.price) {
      return response.data;
    }

    // If API fails, try scraping the website directly
    return await scrapeCommissaryWebsite(item);
  } catch (error) {
    console.error("Error fetching commissary price:", error);

    // Try scraping as fallback
    try {
      return await scrapeCommissaryWebsite(item);
    } catch (scrapeError) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
};

/**
 * Scrapes the commissary website directly
 */
const scrapeCommissaryWebsite = async (item: string) => {
  try {
    // Create a URL to the commissary website search
    const commissarySearchUrl = `https://shop.commissaries.com/shop#!/?q=${encodeURIComponent(
      item
    )}&search_option_id=product`;

    // Use a proxy API to scrape the commissary website
    const response = await axios.get(
      `${API_BASE_URL}/api/scrape-commissary?url=${encodeURIComponent(
        commissarySearchUrl
      )}`
    );

    return response.data;
  } catch (error) {
    console.error("Error scraping commissary website:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

/**
 * Determines if a store is a military commissary based on its name
 */
export const isMilitaryStore = (storeName: string): boolean => {
  const lowerName = storeName.toLowerCase();
  return COMMISSARY_KEYWORDS.some((keyword) => lowerName.includes(keyword));
};
