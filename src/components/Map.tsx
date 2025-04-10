import React, { useEffect, useCallback, useRef, useState } from "react";
import { GoogleMap, useJsApiLoader, OverlayView } from "@react-google-maps/api";
import {
  Box,
  CircularProgress,
  Paper,
  List,
  ListItem,
  ListItemText,
  Typography,
  IconButton,
  useMediaQuery,
  useTheme,
  Button,
  Stack,
  TextField,
  InputAdornment,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import type { Store } from "../types/store";
import { alpha } from "@mui/material/styles";

interface MapProps {
  currentLocation?: { lat: number; lng: number };
  stores: Store[];
  selectedStore?: Store | null;
  onStoreSelect?: (store: Store) => void;
  cheapestStore?: Store | null;
  onCompareClick?: () => void;
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

// Move libraries array outside component
const libraries: ("marker" | "places")[] = ["marker", "places"];

const Map: React.FC<MapProps> = ({
  currentLocation,
  stores,
  selectedStore,
  onStoreSelect,
  cheapestStore,
  onCompareClick,
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
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const [markers, setMarkers] = React.useState<MarkerInstance[]>([]);
  const searchTimeoutRef = useRef<number | null>(null);

  const handleSearch = useCallback(() => {
    if (!currentLocation || !searchQuery.trim()) return;

    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }

    // Set a new timeout for debouncing
    searchTimeoutRef.current = window.setTimeout(() => {
      onSearchStores?.(searchQuery.trim(), currentLocation);
    }, 500); // 500ms debounce

    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [currentLocation, searchQuery, onSearchStores]);

  // Trigger search when query changes
  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  const handleAddItem = () => {
    if (newItem.trim()) {
      onAddItem?.(newItem.trim());
      setNewItem("");
    }
  };

  const onLoad = React.useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const onUnmount = React.useCallback(() => {
    mapRef.current = null;
  }, []);

  // Memoize the marker creation function
  const createMarker = useCallback(
    (
      position: google.maps.LatLngLiteral,
      options: {
        title?: string;
        isSelected?: boolean;
        isCheapest?: boolean;
        isCurrentLocation?: boolean;
      }
    ) => {
      const { title, isSelected, isCheapest, isCurrentLocation } = options;

      const markerDiv = document.createElement("div");
      markerDiv.className = "custom-marker";

      let color = theme.palette.error.main;
      if (isCurrentLocation) {
        color = theme.palette.primary.main;
      } else if (isCheapest) {
        color = theme.palette.success.main;
      } else if (isSelected) {
        color = theme.palette.primary.main;
      }

      const size = isCurrentLocation ? 16 : 24;

      markerDiv.style.width = `${size}px`;
      markerDiv.style.height = `${size}px`;
      markerDiv.style.borderRadius = isCurrentLocation
        ? "50%"
        : "0 50% 50% 50%";
      markerDiv.style.backgroundColor = color;
      markerDiv.style.border = "2px solid white";
      markerDiv.style.transform = isCurrentLocation ? "none" : "rotate(45deg)";
      markerDiv.style.transition = "all 0.3s ease";

      if (isSelected) {
        markerDiv.style.animation = "bounce 1s infinite";
      }

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position,
        title,
        content: markerDiv,
      });

      return marker;
    },
    [theme]
  );

  useEffect(() => {
    if (!mapRef.current || !currentLocation) return;

    // Create current location marker
    const currentLocationMarker = createMarker(currentLocation, {
      title: "Your Location",
      isCurrentLocation: true,
    }) as MarkerInstance;

    // Create store markers
    const storeMarkers = stores.map((store) => {
      const marker = createMarker(
        { lat: store.latitude, lng: store.longitude },
        {
          title: store.name,
          isSelected: selectedStore?.id === store.id,
          isCheapest: cheapestStore?.id === store.id,
        }
      ) as MarkerInstance;

      // Use gmp-click instead of click
      marker.addEventListener("gmp-click", () => {
        onStoreSelect?.(store);
      });

      return marker;
    });

    // Set markers state
    setMarkers([currentLocationMarker, ...storeMarkers]);

    // Cleanup function
    return () => {
      currentLocationMarker.setMap(null);
      storeMarkers.forEach((marker) => {
        marker.setMap(null);
      });
    };
  }, [
    currentLocation,
    stores,
    selectedStore,
    cheapestStore,
    mapRef.current,
    createMarker,
    onStoreSelect,
  ]);

  if (!isLoaded) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
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
              backgroundColor: "white",
              "&:hover": {
                backgroundColor: "rgba(255, 255, 255, 0.9)",
              },
            }}
          >
            <MenuIcon />
          </IconButton>
        )}

        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 1,
            width: isMobile ? "calc(100% - 48px)" : 300,
            ml: isMobile ? 6 : 0,
          }}
        >
          <TextField
            fullWidth
            size="small"
            placeholder="Search for stores..."
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
              backgroundColor: "white",
              borderRadius: 1,
              "& .MuiOutlinedInput-root": {
                "& fieldset": {
                  borderColor: "transparent",
                },
                "&:hover fieldset": {
                  borderColor: "transparent",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "transparent",
                },
              },
            }}
          />
        </Box>

        <style>
          {`
            @keyframes bounce {
              0%, 100% { transform: rotate(45deg) translateY(0); }
              50% { transform: rotate(45deg) translateY(-10px); }
            }
          `}
        </style>

        <GoogleMap
          mapContainerStyle={containerStyle}
          center={currentLocation || { lat: 0, lng: 0 }}
          zoom={12}
          onLoad={onLoad}
          onUnmount={onUnmount}
          options={{
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            mapId: import.meta.env.VITE_GOOGLE_MAPS_ID,
          }}
        >
          {stores.map(
            (store) =>
              cheapestStore?.id === store.id && (
                <OverlayView
                  key={store.id}
                  position={{ lat: store.latitude, lng: store.longitude }}
                  mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                >
                  <Box
                    sx={{
                      position: "absolute",
                      transform: "translate(-50%, -50%)",
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      backgroundColor: alpha(theme.palette.success.main, 0.3),
                      animation: "pulse 2s infinite",
                      "@keyframes pulse": {
                        "0%": {
                          transform: "translate(-50%, -50%) scale(1)",
                          opacity: 0.3,
                        },
                        "50%": {
                          transform: "translate(-50%, -50%) scale(1.5)",
                          opacity: 0.1,
                        },
                        "100%": {
                          transform: "translate(-50%, -50%) scale(1)",
                          opacity: 0.3,
                        },
                      },
                    }}
                  />
                </OverlayView>
              )
          )}
        </GoogleMap>
      </Paper>
    </Box>
  );
};

export default Map;
