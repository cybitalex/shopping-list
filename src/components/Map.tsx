import React, { useEffect, useCallback, useRef, useState } from "react";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import {
  Box,
  CircularProgress,
  Paper,
  IconButton,
  useMediaQuery,
  useTheme,
  TextField,
  InputAdornment,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import type { Store } from "../types/store";
import { alpha } from "@mui/material/styles";
import { getGoogleMapsService, getPlacesService } from "../utils/googleMaps";

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

interface MarkerInstance extends google.maps.marker.AdvancedMarkerElement {
  setMap(map: google.maps.Map | null): void;
}

const containerStyle = {
  width: "100%",
  height: "100%",
  borderRadius: "8px",
};

const libraries: ("marker" | "places")[] = ["marker", "places"];

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
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  const [newItem, setNewItem] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const mapRef = React.useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);
  const searchTimeoutRef = useRef<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleSearch = useCallback(() => {
    if (!currentLocation || !searchQuery.trim()) return;

    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      onSearchStores?.(searchQuery.trim(), currentLocation);
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [currentLocation, searchQuery, onSearchStores]);

  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  const handleAddItem = () => {
    if (newItem.trim()) {
      onAddItem?.(newItem.trim());
      setNewItem("");
    }
  };

  useEffect(() => {
    if (!mapRef.current || !currentLocation) return;

    const initMap = async () => {
      try {
        const googleMaps = getGoogleMapsService();
        const newMap = new googleMaps.Map(mapRef.current!, {
          center: currentLocation,
          zoom: 13,
          mapId: "YOUR_MAP_ID", // Replace with your actual Map ID
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });

        setMap(newMap);
        setIsLoading(false);
      } catch (error) {
        console.error("Error initializing map:", error);
        setIsLoading(false);
      }
    };

    initMap();
  }, [currentLocation]);

  useEffect(() => {
    if (!map || !currentLocation) return;

    // Clear existing markers
    markers.forEach((marker) => marker.setMap(null));
    setMarkers([]);

    const googleMaps = getGoogleMapsService();

    // Add current location marker
    const currentLocationMarker = new googleMaps.Marker({
      position: currentLocation,
      map,
      title: "Your Location",
      icon: {
        path: googleMaps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#4285F4",
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: "#FFFFFF",
      },
    });

    // Add store markers
    const storeMarkers = stores.map((store) => {
      const marker = new googleMaps.Marker({
        position: { lat: store.latitude, lng: store.longitude },
        map,
        title: store.name,
        icon: {
          path: googleMaps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: store.id === selectedStore?.id ? "#0F9D58" : "#DB4437",
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: "#FFFFFF",
        },
      });

      marker.addListener("click", () => {
        onStoreSelect(store);
      });

      return marker;
    });

    setMarkers([currentLocationMarker, ...storeMarkers]);

    // Cleanup function
    return () => {
      markers.forEach((marker) => marker.setMap(null));
    };
  }, [map, currentLocation, stores, selectedStore, onStoreSelect]);

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "400px",
          borderRadius: 2,
          bgcolor: "background.paper",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", position: "relative" }}>
      <Paper
        elevation={0}
        sx={{
          height: "100%",
          overflow: "hidden",
          borderRadius: 2,
        }}
      >
        {isMobile && (
          <IconButton
            onClick={() => setIsDrawerOpen(true)}
            sx={{
              position: "absolute",
              top: 8,
              left: 8,
              zIndex: 1,
              bgcolor: alpha(theme.palette.background.paper, 0.8),
            }}
          >
            <MenuIcon />
          </IconButton>
        )}
        <Box
          ref={mapRef}
          sx={{
            width: "100%",
            height: "400px",
            borderRadius: 2,
            overflow: "hidden",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 1,
            display: "flex",
            gap: 1,
          }}
        >
          <TextField
            size="small"
            placeholder="Search stores..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{
              bgcolor: alpha(theme.palette.background.paper, 0.8),
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
              },
            }}
          />
        </Box>
      </Paper>
    </Box>
  );
};

export default Map;
