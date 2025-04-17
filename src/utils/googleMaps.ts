import { Loader } from '@googlemaps/js-api-loader';

declare global {
  interface Window {
    google: typeof google;
    initGoogleMaps: () => void;
  }
}

let mapInstance: google.maps.Map | null = null;
// For the new Place API
let placesClient: any = null; // Using any temporarily until type definitions are properly defined

const createHiddenMap = () => {
  // Remove any existing map elements
  const existingMap = document.getElementById('hidden-map');
  if (existingMap) {
    existingMap.remove();
  }

  const mapDiv = document.createElement('div');
  mapDiv.id = 'hidden-map';
  mapDiv.style.visibility = 'hidden';
  mapDiv.style.position = 'absolute';
  mapDiv.style.left = '-9999px';
  mapDiv.style.height = '100px';
  mapDiv.style.width = '100px';
  document.body.appendChild(mapDiv);

  return new google.maps.Map(mapDiv, {
    center: { lat: 0, lng: 0 },
    zoom: 2,
    disableDefaultUI: true,
    mapTypeId: 'roadmap' // Changed from google.maps.MapTypeId.ROADMAP
  });
};

export const loadGoogleMaps = (apiKey: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Clean up existing instances
    mapInstance = null;
    placesClient = null;

    // Remove any existing Google Maps scripts
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.remove();
    }

    // Clean up custom elements to prevent conflicts
    ['gmp-internal-google-attribution', 'gmp-internal-dialog'].forEach(elementName => {
      if (customElements.get(elementName)) {
        // Force clean up the registration
        // @ts-ignore - Using internal property for cleanup
        customElements.registry.delete(elementName);
      }
    });

    const loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places', 'geometry'],
      retries: 3,
      language: 'en',
      region: 'US'
    });

    loader.load()
      .then(() => {
        try {
          if (!window.google || !window.google.maps) {
            throw new Error('Google Maps failed to load properly');
          }
          
          mapInstance = createHiddenMap();
          
          // Initialize the new Place API if available
          if (window.google.maps.places?.Place) {
            placesClient = window.google.maps.places.Place;
          } else {
            console.warn('Google Maps Place API not available, will use legacy API');
          }
          
          resolve();
        } catch (error) {
          console.error('Error initializing maps:', error);
          reject(error);
        }
      })
      .catch((error) => {
        console.error('Error loading Google Maps API:', error);
        reject(error);
      });
  });
};

// Type definition for the new Place object from the API
interface PlaceSearchResponse {
  places: Array<{
    id?: string;
    displayName?: string;
    formattedAddress?: string;
    location?: {
      lat: number;
      lng: number;
    };
    rating?: number;
    businessStatus?: string;
  }>;
}

// Type definition for the searchNearby request based on current API
interface SearchNearbyRequest {
  textQuery: string;
  locationRestriction?: google.maps.Circle | google.maps.CircleLiteral;
  locationBias?: {
    circle: {
      center: { lat: number; lng: number };
      radius: number;
    }
  };
  includedType?: string;
  fields: string[];
}

export const searchNearbyStores = async (
  query: string,
  location: { lat: number; lng: number },
  radius: number = 32186.9, // 20 miles in meters
  maxStores: number = 20
): Promise<any[]> => {
  if (!mapInstance) {
    throw new Error('Maps not initialized. Call loadGoogleMaps first.');
  }

  if (!window.google?.maps?.places?.Place) {
    console.warn('Using fallback method: new Place API not available');
    return searchNearbyStoresLegacy(query, location, radius, maxStores);
  }

  try {
    // Use the new Place.searchNearby() method
    const request: any = {
      locationBias: {
        circle: {
          center: { lat: location.lat, lng: location.lng },
          radius: radius
        }
      },
      includedType: 'grocery_or_supermarket',
      textQuery: query || '',
      fields: ['displayName', 'location', 'businessStatus', 'formattedAddress', 'rating', 'id']
    };

    const response = await window.google.maps.places.Place.searchNearby(request) as PlaceSearchResponse;
    
    if (response && response.places) {
      // Convert new response format to match old format
      return response.places
        .filter(place => place.location !== undefined)
        .map(place => ({
          place_id: place.id || '',
          name: place.displayName || '',
          vicinity: place.formattedAddress || '',
          geometry: {
            location: place.location ? 
              new google.maps.LatLng(place.location.lat, place.location.lng) : 
              new google.maps.LatLng(location.lat, location.lng)
          },
          rating: place.rating || 0
        }))
        .slice(0, maxStores);
    }
    
    return [];
  } catch (error) {
    console.error('Error with new Places API search:', error);
    
    // Fallback to legacy method if the new one fails
    console.warn('Falling back to legacy method after new Place API failed');
    return searchNearbyStoresLegacy(query, location, radius, maxStores);
  }
};

// Legacy method kept for fallback purposes
const searchNearbyStoresLegacy = async (
  query: string,
  location: { lat: number; lng: number },
  radius: number = 32186.9, // 20 miles in meters
  maxStores: number = 20
): Promise<any[]> => {
  console.warn('Using deprecated PlacesService - please update code to use new Place API');
  
  // Create temporary service just for this search
  const tempMap = mapInstance;
  const tempService = new google.maps.places.PlacesService(tempMap!);
  
  const locationLatLng = new google.maps.LatLng(location.lat, location.lng);
  
  const searchWithRadius = async (searchRadius: number): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const request: google.maps.places.PlaceSearchRequest = {
        location: locationLatLng,
        type: 'grocery_or_supermarket',
        keyword: query
      };
      
      // Cannot use both radius and rankBy:DISTANCE
      if (searchRadius) {
        request.radius = searchRadius;
      } else {
        request.rankBy = google.maps.places.RankBy.DISTANCE;
      }

      try {
        tempService.nearbySearch(
          request,
          (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && results) {
              const limitedResults = results
                .filter(place => place.geometry?.location)
                .sort((a, b) => {
                  if (!a.geometry?.location || !b.geometry?.location) return 0;
                  const distA = google.maps.geometry.spherical.computeDistanceBetween(
                    locationLatLng,
                    a.geometry.location
                  );
                  const distB = google.maps.geometry.spherical.computeDistanceBetween(
                    locationLatLng,
                    b.geometry.location
                  );
                  return distA - distB;
                })
                .slice(0, maxStores);
              resolve(limitedResults);
            } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS && searchRadius < 5000) {
              resolve(searchWithRadius(searchRadius * 1.5));
            } else {
              console.warn(`Places legacy search failed with status: ${status}`);
              resolve([]);
            }
          }
        );
      } catch (error) {
        console.error('Error with legacy Places API search:', error);
        resolve([]);
      }
    });
  };

  return searchWithRadius(radius);
};
