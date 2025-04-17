interface Store {
  name: string;
  place_id: string;
  latitude: number;
  longitude: number;
  distance: number;
  address: string;
  rating?: number;
  priceLevel?: number;
}

const API_BASE_URL = 'http://localhost:3000/api';

export async function findNearbyStores(latitude: number, longitude: number): Promise<Store[]> {
  console.log('Finding nearby stores at coordinates:', latitude, longitude);
  
  try {
    // First try the backend API
    console.log('Calling backend API to get stores');
    const response = await fetch(`${API_BASE_URL}/stores?latitude=${latitude}&longitude=${longitude}`);
    
    if (!response.ok) {
      throw new Error(`Backend API request failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data.stores;
  } catch (error) {
    console.error('Error with backend API:', error);
    console.log('Falling back to direct Google Places API call');
    
    // Fallback to Google Places API
    try {
      const request = {
        location: new google.maps.LatLng(latitude, longitude),
        radius: 40000, // 40km radius
        type: 'grocery_or_supermarket',
        rankBy: google.maps.places.RankBy.DISTANCE
      };

      const service = new google.maps.places.PlacesService(document.createElement('div'));
      
      return new Promise((resolve, reject) => {
        service.nearbySearch(request, (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            const stores: Store[] = results.map(place => ({
              name: place.name || '',
              place_id: place.place_id || '',
              latitude: place.geometry?.location?.lat() || 0,
              longitude: place.geometry?.location?.lng() || 0,
              distance: 0, // Will be calculated later
              address: place.vicinity || '',
              rating: place.rating,
              priceLevel: place.price_level
            }));
            resolve(stores);
          } else {
            reject(new Error(`Places API error: ${status}`));
          }
        });
      });
    } catch (error) {
      console.error('Error with Google Places API:', error);
      return [];
    }
  }
} 