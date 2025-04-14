import { Loader } from '@googlemaps/js-api-loader';

declare global {
  interface Window {
    google: typeof google;
    initGoogleMaps: () => void;
  }
}

let mapInstance: google.maps.Map | null = null;
let placesService: google.maps.places.PlacesService | null = null;
// For the new Place API (commented out for now since we don't have the correct type definitions)
// let placesClient: google.maps.places.Place | null = null;

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
    mapTypeId: google.maps.MapTypeId.ROADMAP
  });
};

export const loadGoogleMaps = (apiKey: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Clean up existing instances
    mapInstance = null;
    placesService = null;
    // placesClient = null;

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

    if (window.google?.maps) {
      try {
        mapInstance = createHiddenMap();
        
        // Initialize the legacy PlacesService
        placesService = new google.maps.places.PlacesService(mapInstance);
        
        // Attempt to initialize the new Place API if available
        // Commented out until we have proper type definitions
        /*
        if (google.maps.places.Place) {
          placesClient = new google.maps.places.Place();
        }
        */
        
        resolve();
      } catch (error) {
        console.error('Error initializing maps:', error);
        reject(error);
      }
      return;
    }

    const loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places', 'geometry']
    });

    loader.load()
      .then((google) => {
        try {
          mapInstance = createHiddenMap();
          
          // Initialize the legacy PlacesService
          placesService = new google.maps.places.PlacesService(mapInstance);
          
          // Attempt to initialize the new Place API if available
          // Commented out until we have proper type definitions
          /*
          if (google.maps.places.Place) {
            placesClient = new google.maps.places.Place();
          }
          */
          
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

export const searchNearbyStores = async (
  query: string,
  location: { lat: number; lng: number },
  radius: number = 2000,
  maxStores: number = 20
): Promise<google.maps.places.PlaceResult[]> => {
  if (!mapInstance || !placesService) {
    throw new Error('Maps not initialized. Call loadGoogleMaps first.');
  }

  const locationLatLng = new google.maps.LatLng(location.lat, location.lng);
  
  const searchWithRadius = async (searchRadius: number): Promise<google.maps.places.PlaceResult[]> => {
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
        // Use the Places Service for now (but prepare for future migration)
        placesService!.nearbySearch(
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
              console.warn(`Places search failed with status: ${status}`);
              // Instead of rejecting, return an empty array to prevent UI failures
              resolve([]);
            }
          }
        );
      } catch (error) {
        console.error('Error with Places API search:', error);
        // Return empty array instead of rejecting
        resolve([]);
      }
    });
  };

  return searchWithRadius(radius);
};
