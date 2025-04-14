import axios from "axios";
import type { Store } from "../types/store";
import type { ScrapingResult } from "../utils/scraper";

const API_BASE_URL = window.location.origin.includes('localhost') 
  ? 'http://localhost:3000' 
  : window.location.origin;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface ItemPrice {
  name: string;
  price: number;
  confidence: number;
}

export interface StoreResult {
  storeName: string;
  items: ItemPrice[];
  totalPrice: number;
}

export interface ComparisonResponse {
  results: StoreResult[];
  errors?: string[];
}

export const findNearbyStores = async (
  latitude: number,
  longitude: number
): Promise<Store[]> => {
  try {
    const response = await api.get(`/api/stores`, {
      params: { latitude, longitude },
    });
    return response.data;
  } catch (error) {
    console.error("Error finding stores:", error);
    throw new Error("Failed to find nearby stores");
  }
};

export const compareStores = async (
  stores: Store[],
  items: string[]
): Promise<ComparisonResponse> => {
  try {
    const response = await api.post('/api/compare', {
      stores,
      items,
    });
    return response.data;
  } catch (error) {
    console.error("Error comparing stores:", error);
    throw new Error("Failed to compare store prices");
  }
};

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d * 0.621371; // Convert to miles
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

export const searchProducts = async (query: string) => {
  try {
    const response = await api.get(`/api/search?q=${encodeURIComponent(query)}`);
    return response.data;
  } catch (error) {
    console.error('Error searching products:', error);
    throw error;
  }
};

export const fetchPrice = async (item: string, store: string) => {
  try {
    const response = await api.get(`/api/fetch-price?item=${encodeURIComponent(item)}&store=${encodeURIComponent(store)}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching price for ${item} at ${store}:`, error);
    throw error;
  }
};
