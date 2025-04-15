import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

interface Coordinates {
  latitude: number;
  longitude: number;
}

// MapBox and UI use lat/lng format
export interface MapLocation {
  lat: number;
  lng: number;
}

interface LocationContextType {
  currentLocation: Coordinates | null;
  mapLocation: MapLocation | null;
  locationError: string | null;
  isLocating: boolean;
  refreshLocation: () => Promise<Coordinates | null>;
  locationStatus: string;
  requestLocation: () => Promise<Coordinates | null>;
}

// Create the context with default values
export const LocationContext = createContext<LocationContextType>({
  currentLocation: null,
  mapLocation: null,
  locationError: null,
  isLocating: false,
  refreshLocation: async () => null,
  locationStatus: 'No location data',
  requestLocation: async () => null,
});

interface LocationProviderProps {
  children: ReactNode;
}

export const LocationProvider: React.FC<LocationProviderProps> = ({ children }) => {
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationStatus, setLocationStatus] = useState<string>('No location data');

  // Create the map location format needed by UI components
  const mapLocation = currentLocation 
    ? { lat: currentLocation.latitude, lng: currentLocation.longitude } 
    : null;

  const refreshLocation = async (): Promise<Coordinates | null> => {
    setIsLocating(true);
    setLocationError(null);
    setLocationStatus('Detecting your location...');

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const newLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      setCurrentLocation(newLocation);
      setLocationStatus('Using your current location');
      return newLocation;
    } catch (error) {
      console.error('Error getting location:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to get location';
      setLocationError(errorMessage);
      setLocationStatus('Location not available');
      return null;
    } finally {
      setIsLocating(false);
    }
  };

  const requestLocation = async (): Promise<Coordinates | null> => {
    if (!navigator.geolocation) {
      setLocationStatus('Geolocation not supported by your browser');
      setLocationError('Geolocation not supported by your browser');
      return null;
    }
    return refreshLocation();
  };

  return (
    <LocationContext.Provider
      value={{
        currentLocation,
        mapLocation,
        locationError,
        isLocating,
        refreshLocation,
        locationStatus,
        requestLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

// Custom hook to use the location context
export const useLocationContext = () => useContext(LocationContext); 