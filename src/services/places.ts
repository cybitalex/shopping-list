import type { Store } from "../types/store";
import { searchNearbyStores } from "../utils/googleMaps";

// Helper function to calculate distance between two points using Haversine formula
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  // Convert to miles for consistency with the backend
  return R * c * 0.621371;
};

export { searchNearbyStores };

export async function findNearbyStores(
  latitude: number,
  longitude: number
): Promise<Store[]> {
  try {
    // First try the backend API
    const response = await fetch(
      `/api/stores?latitude=${latitude}&longitude=${longitude}`
    );
      
    if (response.ok) {
      const data = await response.json();
      if (data.stores && data.stores.length > 0) {
        console.log(`Found ${data.stores.length} stores from backend API`);
        return data.stores;
      }
    }
    
    console.log("Falling back to direct Google Places API call");
    
    // Fallback to Google Places API
    const stores = await searchNearbyStores("grocery store", { lat: latitude, lng: longitude });
    console.log(`Found ${stores.length} stores from Google Places API`);
    
    // Initialize items array for each store
    const processedStores = stores.map(store => ({
      ...store,
      items: [] // Initialize empty items array
      }));
      
    console.log(`Processed ${processedStores.length} valid stores`);
    return processedStores;
  } catch (error) {
    console.error("Error finding nearby stores:", error);
    return [];
  }
}
