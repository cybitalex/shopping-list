import { getGoogleMapsService } from "../utils/googleMaps";
import type { Store } from "../types/store";

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
  return R * c;
};

export const searchNearbyStores = async (
  location: { lat: number; lng: number },
  query: string
): Promise<Store[]> => {
  const maps = getGoogleMapsService();

  const service = new maps.places.PlacesService(document.createElement("div"));

  return new Promise((resolve, reject) => {
    service.nearbySearch(
      {
        location: new maps.LatLng(location.lat, location.lng),
        radius: 5000,
        type: "grocery_or_supermarket",
        keyword: query,
      },
      (
        results: google.maps.places.PlaceResult[] | null,
        status: google.maps.places.PlacesServiceStatus
      ) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          const stores: Store[] = results.map(
            (place: google.maps.places.PlaceResult) => ({
              id: place.place_id || "",
              name: place.name || "",
              address: place.vicinity || "",
              latitude: place.geometry?.location?.lat() || 0,
              longitude: place.geometry?.location?.lng() || 0,
              rating: place.rating || 0,
              priceLevel: place.price_level || 0,
              isOpen: place.opening_hours?.isOpen() || false,
              distance: 0, // This will be calculated later
              userRatingsTotal: place.user_ratings_total || 0,
            })
          );
          resolve(stores);
        } else {
          reject(new Error(`Places search failed: ${status}`));
        }
      }
    );
  });
};
