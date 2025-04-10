declare global {
  interface Window {
    google: typeof google;
    initGoogleMaps: () => void;
  }
}

declare namespace google.maps {
  export class LatLng {
    constructor(lat: number, lng: number);
    lat(): number;
    lng(): number;
  }

  export namespace places {
    export class PlacesService {
      constructor(attrContainer: Element);
      nearbySearch(
        request: PlacesSearchRequest,
        callback: (
          results: PlaceResult[] | null,
          status: PlacesServiceStatus,
          pagination: any
        ) => void
      ): void;
    }

    export interface PlacesSearchRequest {
      location: LatLng;
      radius: number;
      type: string;
      keyword?: string;
    }

    export interface PlaceResult {
      place_id: string;
      name: string;
      vicinity: string;
      geometry?: {
        location: LatLng;
      };
      rating?: number;
      price_level?: number;
      opening_hours?: {
        isOpen(): boolean;
      };
      user_ratings_total?: number;
    }

    export enum PlacesServiceStatus {
      OK = "OK",
      ZERO_RESULTS = "ZERO_RESULTS",
      ERROR = "ERROR",
    }
  }
}

export {};
