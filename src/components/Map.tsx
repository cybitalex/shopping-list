import React, { useEffect, useRef, useState } from "react";
import { Box, CircularProgress, useMediaQuery, useTheme, keyframes, Typography, Alert } from "@mui/material";
import type { Store } from "../types/store";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Define the pulse animation for CSS
const pulseAnimation = keyframes`
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(15, 157, 88, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 10px rgba(15, 157, 88, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(15, 157, 88, 0);
  }
`;

// Get the token from environment variables
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
// Set Mapbox token
mapboxgl.accessToken = MAPBOX_TOKEN || '';

console.log("Mapbox token available:", !!MAPBOX_TOKEN);

interface MapProps {
  currentLocation: { lat: number; lng: number } | null;
  stores: Store[];
  onStoreSelect: (store: Store) => void;
  selectedStore: Store | null;
  cheapestStore?: Store | null;
  onAddItem?: (item: string) => void;
  onSearchStores?: (
    query: string,
    location: { lat: number; lng: number }
  ) => void;
}

const Map: React.FC<MapProps> = ({
  currentLocation,
  stores,
  onStoreSelect,
  selectedStore,
  cheapestStore,
  onAddItem,
  onSearchStores,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const cheapestMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const popups = useRef<{[id: string]: mapboxgl.Popup}>({});

  // Initialize map when component mounts and currentLocation is available
  useEffect(() => {
    if (!mapRef.current || !currentLocation) {
      if (!currentLocation) {
        console.log("No current location available yet");
      }
      return;
    }
    
    if (!MAPBOX_TOKEN) {
      setError("Mapbox API key is missing. Map cannot be displayed.");
      setIsLoading(false);
      return;
    }
    
    console.log("Initializing map with location:", currentLocation);
    
    try {
      // Create the map instance
      const map = new mapboxgl.Map({
        container: mapRef.current,
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [currentLocation.lng, currentLocation.lat],
        zoom: 11
      });
      
      // Save map instance to ref
      mapInstance.current = map;
      
      // Add navigation controls
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      
      // Add current location marker when map loads
      map.on('load', () => {
        console.log("Map loaded successfully");
        
        // Create a DOM element for the current location marker
        const el = document.createElement('div');
        el.className = 'current-location-marker';
        el.style.backgroundColor = '#4285F4';
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.borderRadius = '50%';
        el.style.border = '3px solid white';
        el.style.boxShadow = '0 0 5px rgba(0,0,0,0.3)';
        
        // Add the current location marker
        new mapboxgl.Marker(el)
          .setLngLat([currentLocation.lng, currentLocation.lat])
          .setPopup(new mapboxgl.Popup().setHTML('<strong>Your Location</strong>'))
          .addTo(map);
        
        setIsLoading(false);
      });
      
      // Handle any map errors
      map.on('error', (e) => {
        console.error("Mapbox error:", e);
        setError("An error occurred while loading the map. Please try again later.");
        setIsLoading(false);
      });
    } catch (err) {
      console.error("Error initializing map:", err);
      setError(`Failed to initialize map: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsLoading(false);
    }
    
    // Cleanup on component unmount
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [currentLocation]);
  
  // Update store markers when stores or cheapest store changes
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !stores.length) return;
    
    // Clear previous markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];
    
    // Clear previous popups
    Object.values(popups.current).forEach(popup => popup.remove());
    popups.current = {};
    
    // Coordinates for bounding box calculation
    const coordinates: [number, number][] = [];
    
    // Add current location to coordinates if available
    if (currentLocation) {
      coordinates.push([currentLocation.lng, currentLocation.lat]);
    }
    
    // Add store markers
    stores.forEach(store => {
      const isCheapest = cheapestStore?.id === store.id;
      const isSelected = selectedStore?.id === store.id;
      
      // Create a DOM element for the marker
      const el = document.createElement('div');
      el.className = 'store-marker';
      el.style.width = isCheapest ? '22px' : '18px';
      el.style.height = isCheapest ? '22px' : '18px';
      el.style.backgroundColor = isCheapest ? '#0F9D58' : isSelected ? '#FFC107' : '#DB4437';
      el.style.borderRadius = '50%';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 0 5px rgba(0,0,0,0.3)';
      
      // Add pulsing animation for cheapest store
      if (isCheapest) {
        el.style.animation = 'pulse 1.5s infinite';
        
        // Add keyframes for pulse animation
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
          @keyframes pulse {
            0% {
              box-shadow: 0 0 0 0 rgba(15, 157, 88, 0.7);
            }
            70% {
              box-shadow: 0 0 0 10px rgba(15, 157, 88, 0);
            }
            100% {
              box-shadow: 0 0 0 0 rgba(15, 157, 88, 0);
            }
          }
        `;
        document.head.appendChild(styleSheet);
      }
      
      // Create popup content
      const popupHtml = `
        <strong>${store.name}</strong><br>
        ${store.address}<br>
        <em>${store.distance.toFixed(1)} miles away</em>
        ${isCheapest ? '<br><strong style="color:#0F9D58">Cheapest Store!</strong>' : ''}
      `;
      
      // Create the popup
      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupHtml);
      popups.current[store.id] = popup;
      
      // Create the marker
      const marker = new mapboxgl.Marker(el)
        .setLngLat([store.longitude, store.latitude])
        .setPopup(popup)
        .addTo(map);
      
      // Add click event to marker
      el.addEventListener('click', () => {
        onStoreSelect(store);
      });
      
      // Save reference to marker
      markers.current.push(marker);
      
      // Save reference to cheapest marker
      if (isCheapest) {
        cheapestMarkerRef.current = marker;
      }
      
      // Add coordinates for bounding box
      coordinates.push([store.longitude, store.latitude]);
    });
    
    // Fit map to include all markers
    if (coordinates.length > 0) {
      const bounds = coordinates.reduce((bounds, coord) => {
        return bounds.extend(coord);
      }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
      
      map.fitBounds(bounds, {
        padding: 50,
        maxZoom: 14
      });
      
      // If there's a cheapest store, zoom to it after a delay
      if (cheapestStore && cheapestMarkerRef.current) {
        setTimeout(() => {
          map.flyTo({
            center: [cheapestStore.longitude, cheapestStore.latitude],
            zoom: 15,
            duration: 1000
          });
          cheapestMarkerRef.current?.togglePopup();
        }, 1000);
      }
    }
  }, [stores, cheapestStore, selectedStore, currentLocation, onStoreSelect]);

  if (error) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'center', 
          alignItems: 'center',
          height: '400px',
          bgcolor: 'background.paper',
          borderRadius: '8px',
          p: 3
        }}
      >
        <Alert severity="error" sx={{ mb: 2, width: '100%' }}>
          {error}
        </Alert>
        <Typography variant="body2" color="text.secondary">
          Please check your API key in the .env file and make sure it's correctly configured.
        </Typography>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          height: '400px',
          bgcolor: 'background.paper',
          borderRadius: '8px'
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box 
      ref={mapRef} 
      sx={{ 
        width: '100%', 
        height: '400px',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}
    />
  );
};

export default Map;
