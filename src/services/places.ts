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
    console.log(`Finding nearby stores at coordinates: ${latitude}, ${longitude}`);
    
    if (!latitude || !longitude) {
      console.error("Invalid coordinates provided to findNearbyStores");
      throw new Error("Invalid coordinates provided");
    }
    
    // First, try using the backend API to get stores (this should return more stores)
    try {
      console.log("Calling backend API to get stores");
      const backendResponse = await fetch(`/api/stores?latitude=${latitude}&longitude=${longitude}`);
      
      if (backendResponse.ok) {
        const backendStores = await backendResponse.json();
        console.log(`Got ${backendStores.length} stores from backend API`);
        
        // If we got at least some stores, use those
        if (Array.isArray(backendStores) && backendStores.length > 0) {
          // Clone and sort by distance
          const sortedStores = [...backendStores].sort((a, b) => a.distance - b.distance);
          return sortedStores;
        }
      } else {
        console.error("Backend API request failed:", backendResponse.status);
      }
    } catch (err) {
      console.error("Error using backend API:", err);
      // Fall back to Google Places API if backend fails
    }
    
    // Fallback to Google Places API
    console.log("Falling back to direct Google Places API call");
    const results = await searchNearbyStores(
      "", // empty query to get all grocery stores
      { lat: latitude, lng: longitude },
      5000  // Increase radius to find more stores (5km)
    );
    
    console.log(`Found ${results.length} stores from Google Places API`);
    
    const stores = results
      .filter((place): place is google.maps.places.PlaceResult & {
        geometry: { location: google.maps.LatLng }
      } => Boolean(place.geometry?.location))
      .map((place): Store => ({
        id: place.place_id || "",
        name: place.name || "Unknown Store",
        address: place.vicinity || "",
        latitude: place.geometry.location.lat(),
        longitude: place.geometry.location.lng(),
        rating: place.rating || 0,
        priceLevel: place.price_level || 0,
        distance: calculateDistance(
          latitude,
          longitude,
          place.geometry.location.lat(),
          place.geometry.location.lng()
        )
      }));
      
    console.log(`Processed ${stores.length} valid stores`);
    
    // Sort by distance
    const sortedStores = stores.sort((a, b) => a.distance - b.distance);
    
    return sortedStores;
  } catch (error) {
    console.error("Error finding stores:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      if (error.stack) console.error(error.stack);
    }
    return [];
  }
}
