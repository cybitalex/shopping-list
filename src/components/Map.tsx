import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  useMediaQuery,
  useTheme,
  keyframes,
  Typography,
  Alert,
  Chip,
} from "@mui/material";
import type { Store } from "../types/store";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

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

// Define bounce animation for cheapest stores
const bounceAnimation = keyframes`
  0%, 20%, 50%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-10px);
  }
  60% {
    transform: translateY(-5px);
  }
`;

// Get the token from environment variables
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
// Set Mapbox token
mapboxgl.accessToken = MAPBOX_TOKEN || "";

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
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const cheapestMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const popups = useRef<{ [id: string]: mapboxgl.Popup }>({});
  const [clickedStore, setClickedStore] = useState<Store | null>(null);

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
        style: "mapbox://styles/mapbox/streets-v11",
        center: [currentLocation.lng, currentLocation.lat],
        zoom: 11,
      });

      // Save map instance to ref
      mapInstance.current = map;

      // Add navigation controls
      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      // Add current location marker when map loads
      map.on("load", () => {
        console.log("Map loaded successfully");

        // Create a DOM element for the current location marker
        const el = document.createElement("div");
        el.className = "current-location-marker";
        el.style.backgroundColor = "#4285F4";
        el.style.width = "20px";
        el.style.height = "20px";
        el.style.borderRadius = "50%";
        el.style.border = "3px solid white";
        el.style.boxShadow = "0 0 5px rgba(0,0,0,0.3)";

        // Add the current location marker
        new mapboxgl.Marker(el)
          .setLngLat([currentLocation.lng, currentLocation.lat])
          .setPopup(
            new mapboxgl.Popup().setHTML("<strong>Your Location</strong>")
          )
          .addTo(map);

        setIsLoading(false);
      });

      // Handle any map errors
      map.on("error", (e: any) => {
        console.error("Mapbox error:", e);
        setError(
          "An error occurred while loading the map. Please try again later."
        );
        setIsLoading(false);
      });
    } catch (err) {
      console.error("Error initializing map:", err);
      setError(
        `Failed to initialize map: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
      setIsLoading(false);
    }

    // Cleanup on component unmount
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      markers.current = [];
    };
  }, [currentLocation]);

  // Update store markers when stores or cheapest store changes
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !stores.length) return;

    // Clear previous markers
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    // Clear previous popups
    Object.values(popups.current).forEach((popup) => popup.remove());
    popups.current = {};

    // Add CSS animations to document head
    const styleSheet = document.createElement("style");
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
      
      @keyframes bounce {
        0%, 20%, 50%, 80%, 100% {
          transform: translateY(0);
        }
        40% {
          transform: translateY(-10px);
        }
        60% {
          transform: translateY(-5px);
        }
      }
      
      @keyframes glow {
        0%, 100% {
          box-shadow: 0 0 5px rgba(15, 157, 88, 0.5);
        }
        50% {
          box-shadow: 0 0 20px rgba(15, 157, 88, 0.8), 0 0 30px rgba(15, 157, 88, 0.6);
        }
      }
    `;
    document.head.appendChild(styleSheet);

    // Coordinates for bounding box calculation
    const coordinates: [number, number][] = [];

    // Add current location to coordinates if available
    if (currentLocation) {
      coordinates.push([currentLocation.lng, currentLocation.lat]);
    }

    // Add store markers
    stores.forEach((store) => {
      // Skip stores without required coordinates
      if (store.latitude === undefined || store.longitude === undefined) {
        console.warn(`Store ${store.name} missing coordinates, skipping`);
        return;
      }

      const isCheapest = cheapestStore?.id === store.id;
      const isSelected = selectedStore?.id === store.id;

      // Create a DOM element for the marker
      const el = document.createElement("div");
      el.className = "store-marker";
      el.style.width = isCheapest ? "24px" : "18px";
      el.style.height = isCheapest ? "24px" : "18px";
      el.style.backgroundColor = isCheapest
        ? "#0F9D58"
        : isSelected
        ? "#FFC107"
        : "#DB4437";
      el.style.borderRadius = "50%";
      el.style.border = isCheapest ? "3px solid white" : "2px solid white";
      el.style.boxShadow = "0 0 5px rgba(0,0,0,0.3)";
      el.style.cursor = "pointer";
      el.style.transition = "all 0.3s ease";

      // Add enhanced animations for cheapest store
      if (isCheapest) {
        el.style.animation =
          "pulse 1.5s infinite, bounce 2s infinite, glow 3s infinite";
        el.style.zIndex = "1000";
      }

      // Enhanced hover effects
      el.addEventListener("mouseenter", () => {
        el.style.transform = "scale(1.2)";
        el.style.zIndex = "1001";
      });

      el.addEventListener("mouseleave", () => {
        el.style.transform = "scale(1)";
        el.style.zIndex = isCheapest ? "1000" : "1";
      });

      // Create enhanced popup content with better formatting
      const getAddressDisplay = (store: Store) => {
        if (store.vicinity) {
          return store.vicinity;
        }
        // If no vicinity, try to construct from other available data
        return "Address not available";
      };

      const popupHtml = `
        <div style="min-width: 200px; font-family: Arial, sans-serif;">
          <div style="margin-bottom: 8px;">
            <strong style="color: #333; font-size: 14px;">${store.name}</strong>
          </div>
          <div style="margin-bottom: 6px; color: #666; font-size: 12px;">
            📍 ${getAddressDisplay(store)}
          </div>
          <div style="margin-bottom: 8px; color: #888; font-size: 11px;">
            📏 ${store.distance.toFixed(1)} miles away
          </div>
          ${
            isCheapest
              ? '<div style="background: #0F9D58; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">🏆 CHEAPEST STORE!</div>'
              : ""
          }
          ${
            store.rating
              ? `<div style="margin-top: 6px; color: #666; font-size: 11px;">⭐ ${store.rating}/5 rating</div>`
              : ""
          }
        </div>
      `;

      // Create the popup with better styling
      const popup = new mapboxgl.Popup({
        offset: 25,
        closeButton: true,
        closeOnClick: false,
        maxWidth: "250px",
      }).setHTML(popupHtml);

      // Use store.id or fallback to store.name for popup key
      const popupKey = store.id || store.name;
      popups.current[popupKey] = popup;

      // Create the marker
      const marker = new mapboxgl.Marker(el)
        .setLngLat([store.longitude, store.latitude])
        .setPopup(popup)
        .addTo(map);

      // Enhanced click event to marker
      el.addEventListener("click", () => {
        setClickedStore(store);
        onStoreSelect(store);

        // Auto-open popup for cheapest store
        if (isCheapest) {
          setTimeout(() => {
            marker.togglePopup();
          }, 100);
        }
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
        maxZoom: 14,
      });

      // Enhanced animation for cheapest store
      if (
        cheapestStore &&
        cheapestMarkerRef.current &&
        cheapestStore.latitude &&
        cheapestStore.longitude
      ) {
        setTimeout(() => {
          map.flyTo({
            center: [cheapestStore.longitude!, cheapestStore.latitude!],
            zoom: 15,
            duration: 1500,
            curve: 1.42,
            speed: 0.8,
          });

          // Auto-open popup for cheapest store
          setTimeout(() => {
            cheapestMarkerRef.current?.togglePopup();
          }, 1600);
        }, 1000);
      }
    }
  }, [stores, cheapestStore, selectedStore, currentLocation, onStoreSelect]);

  // Clear clicked store after a delay
  useEffect(() => {
    if (clickedStore) {
      const timer = setTimeout(() => {
        setClickedStore(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [clickedStore]);

  if (error) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "400px",
          bgcolor: "background.paper",
          borderRadius: "8px",
          p: 3,
        }}
      >
        <Alert severity="error" sx={{ mb: 2, width: "100%" }}>
          {error}
        </Alert>
        <Typography variant="body2" color="text.secondary">
          Please check your API key in the .env file and make sure it's
          correctly configured.
        </Typography>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "400px",
          bgcolor: "background.paper",
          borderRadius: "8px",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ position: "relative" }}>
      {/* Clicked store info overlay */}
      {clickedStore && (
        <Box
          sx={{
            position: "absolute",
            top: 10,
            left: 10,
            right: 10,
            zIndex: 1000,
            bgcolor: "background.paper",
            borderRadius: "8px",
            p: 2,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            border: "1px solid",
            borderColor: "primary.main",
          }}
        >
          <Typography variant="h6" gutterBottom>
            {clickedStore.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            📍 {clickedStore.vicinity || "Address not available"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            📏 {clickedStore.distance.toFixed(1)} miles away
          </Typography>
          {clickedStore.rating && (
            <Typography variant="body2" color="text.secondary">
              ⭐ {clickedStore.rating}/5 rating
            </Typography>
          )}
          {cheapestStore?.id === clickedStore.id && (
            <Chip
              label="🏆 CHEAPEST STORE"
              color="success"
              size="small"
              sx={{ mt: 1 }}
            />
          )}
        </Box>
      )}

      <Box
        ref={mapRef}
        sx={{
          width: "100%",
          height: "400px",
          borderRadius: "8px",
          overflow: "hidden",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}
      />
    </Box>
  );
};

export default Map;
