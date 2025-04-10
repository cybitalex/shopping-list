import React, { useEffect, useCallback, useRef } from "react";
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

interface MapProps {
  currentLocation?: { lat: number; lng: number };
  stores: Store[];
  selectedStore?: Store | null;
  onStoreSelect?: (store: Store) => void;
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
  selectedStore,
  onStoreSelect,
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
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const [markers, setMarkers] = React.useState<MarkerInstance[]>([]);
  const searchTimeoutRef = useRef<number | null>(null);

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

  const onLoad = React.useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const onUnmount = React.useCallback(() => {
    mapRef.current = null;
  }, []);

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

    const currentLocationMarker = createMarker(currentLocation, {
      title: "Your Location",
      isCurrentLocation: true,
    }) as MarkerInstance;

    const storeMarkers = stores.map((store) => {
      const marker = createMarker(
        { lat: store.latitude, lng: store.longitude },
        {
          title: store.name,
          isSelected: selectedStore?.id === store.id,
          isCheapest: cheapestStore?.id === store.id,
        }
      ) as MarkerInstance;

      marker.addEventListener("gmp-click", () => {
        onStoreSelect?.(store);
      });

      return marker;
    });

    setMarkers([currentLocationMarker, ...storeMarkers]);

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
              bgcolor: alpha(theme.palette.background.paper, 0.8),
            }}
          >
            <MenuIcon />
          </IconButton>
        )}
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={currentLocation}
          zoom={13}
          onLoad={onLoad}
          onUnmount={onUnmount}
          options={{
            styles: [
              {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }],
              },
            ],
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
