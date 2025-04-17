import { http, HttpResponse } from "msw";

// Helper functions to identify store types
function isMilitaryStore(storeName: string): boolean {
  const militaryKeywords = [
    "commissary",
    "military",
    "exchange",
    "aafes",
    "px",
    "bx",
  ];
  const lowerName = storeName.toLowerCase();
  return militaryKeywords.some((keyword) => lowerName.includes(keyword));
}

function isWarehouseStore(storeName: string): boolean {
  const warehouseKeywords = ["costco", "sam's", "sams", "wholesale", "bj's"];
  const lowerName = storeName.toLowerCase();
  return warehouseKeywords.some((keyword) => lowerName.includes(keyword));
}

function isPremiumStore(storeName: string): boolean {
  const premiumKeywords = [
    "whole foods",
    "organic",
    "trader joe",
    "fresh market",
    "wegmans",
  ];
  const lowerName = storeName.toLowerCase();
  return premiumKeywords.some((keyword) => lowerName.includes(keyword));
}

// Function to generate a price for an item at a specific store
function generatePrice(item: string, store: any): number {
  // Base price is between $1-$10
  let basePrice = 1 + Math.random() * 9;

  // Military stores get a 20% discount
  if (isMilitaryStore(store.name)) {
    basePrice *= 0.8;
  }
  // Warehouse stores get a 15% discount
  else if (isWarehouseStore(store.name)) {
    basePrice *= 0.85;
  }
  // Expensive stores get a 20% markup
  else if (isPremiumStore(store.name)) {
    basePrice *= 1.2;
  }

  // Add slight random variation
  const price = basePrice * (0.95 + Math.random() * 0.1);

  return parseFloat(price.toFixed(2));
}

// Function to generate nearby store data based on location
function generateNearbyStores(lat: number, lng: number, filterStore?: string) {
  // Create a list of common grocery stores with realistic names
  const possibleStores = [
    { name: "Walmart Supercenter", type: "supermarket" },
    { name: "Target", type: "department_store" },
    { name: "Kroger", type: "supermarket" },
    { name: "Safeway", type: "supermarket" },
    { name: "Whole Foods Market", type: "supermarket" },
    { name: "Costco Wholesale", type: "warehouse" },
    { name: "Sam's Club", type: "warehouse" },
    { name: "Albertsons", type: "supermarket" },
    { name: "Publix Super Market", type: "supermarket" },
    { name: "Aldi", type: "supermarket" },
    { name: "Trader Joe's", type: "supermarket" },
    { name: "Meijer", type: "supermarket" },
    { name: "H-E-B", type: "supermarket" },
    { name: "Food Lion", type: "supermarket" },
    { name: "Stop & Shop", type: "supermarket" },
    { name: "Giant Food", type: "supermarket" },
    { name: "Wegmans", type: "supermarket" },
    { name: "ShopRite", type: "supermarket" },
    { name: "Winn-Dixie", type: "supermarket" },
    { name: "Market Basket", type: "supermarket" },
    { name: "Military Commissary", type: "military" },
    { name: "Fort Belvoir Commissary", type: "military" },
    { name: "Navy Exchange", type: "military" },
  ];

  // Randomly select 5-10 stores from the list
  const numStores = 5 + Math.floor(Math.random() * 6);
  const shuffled = [...possibleStores].sort(() => 0.5 - Math.random());
  let selectedStores = shuffled.slice(0, numStores);

  // If a specific store filter was provided, ensure it's included
  if (filterStore) {
    const filterMatch = possibleStores.find((s) =>
      s.name.toLowerCase().includes(filterStore.toLowerCase())
    );

    if (filterMatch && !selectedStores.includes(filterMatch)) {
      selectedStores = [filterMatch, ...selectedStores.slice(0, -1)];
    }
  }

  // Create store data with realistic locations and distances
  return selectedStores.map((storeInfo, index) => {
    // Generate a random distance between 0.5 and 15 miles
    const distance = parseFloat((0.5 + Math.random() * 14.5).toFixed(1));

    // Generate slight latitude and longitude variations based on distance
    // This simulates stores being at different locations around the user
    const angle = Math.random() * Math.PI * 2; // Random angle in radians
    const latOffset = Math.sin(angle) * distance * 0.014; // ~1 mile = 0.014 degrees lat
    const lngOffset = Math.cos(angle) * distance * 0.018; // ~1 mile = 0.018 degrees lng

    // Create a unique ID and place_id
    const id = `store-${storeInfo.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")}-${index}`;
    const place_id = `place-${id}`;

    return {
      name: storeInfo.name,
      distance,
      latitude: lat + latOffset,
      longitude: lng + lngOffset,
      id,
      place_id,
      address: `${Math.floor(1000 + Math.random() * 9000)} Main St`,
      storeType: storeInfo.type,
    };
  });
}

// Function to generate price results for items at different stores
function generateStoreResults(item: string, stores: any[]) {
  return stores.map((store) => ({
    name: store.name,
    distance: store.distance,
    items: [
      {
        name: `${item}`,
        price: `$${generatePrice(item, store)}`,
        url: "#",
        method: "google-shopping",
      },
    ],
  }));
}

// Mock API handlers
export const handlers = [
  // Handler for Google Shopping price API
  http.get("/api/google-price", async ({ request }) => {
    const url = new URL(request.url);
    const item = url.searchParams.get("item");
    const store = url.searchParams.get("store");
    const lat = parseFloat(url.searchParams.get("lat") || "0");
    const lng = parseFloat(url.searchParams.get("lng") || "0");

    // If no location is provided, we can't find nearby stores
    if (!lat || !lng) {
      return HttpResponse.json(
        {
          success: false,
          error: "Location data is required to find nearby stores",
        },
        { status: 400 }
      );
    }

    // If no item is provided, we can't get prices
    if (!item) {
      return HttpResponse.json(
        { success: false, error: "Item name is required" },
        { status: 400 }
      );
    }

    try {
      // Make a real API call to Google Maps Places API to get nearby stores
      // This is mocked here but would be a real API call in production
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=10000&type=store&key=${
          import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        }`
      );

      // Return simulated stores based on the current location
      // In reality, this would be parsed from the Google API response
      const stores = generateNearbyStores(lat, lng, store || undefined);
      const results = generateStoreResults(item, stores);

      // If a specific store was requested, return just the price for that store
      if (store && results.length > 0) {
        const storeData =
          results.find((s) =>
            s.name.toLowerCase().includes(store.toLowerCase())
          ) || results[0];

        const itemData = storeData.items[0];

        return HttpResponse.json({
          success: true,
          price: parseFloat(itemData.price.replace("$", "")),
          productName: itemData.name,
          source: "google-shopping",
          store: storeData.name,
          fullStoreName: storeData.name,
          url: itemData.url,
          method: "google-shopping",
        });
      }

      // Otherwise return all store results
      return HttpResponse.json({
        success: true,
        stores: results,
      });
    } catch (error) {
      console.error("Error in Google Shopping API:", error);
      return HttpResponse.json(
        {
          success: false,
          error: "Failed to fetch nearby store data",
        },
        { status: 500 }
      );
    }
  }),

  // Handler for stores API
  http.get("/api/stores", async ({ request }) => {
    const url = new URL(request.url);
    const latitude = parseFloat(url.searchParams.get("latitude") || "0");
    const longitude = parseFloat(url.searchParams.get("longitude") || "0");
    const itemsParam = url.searchParams.get("items");

    if (!latitude || !longitude) {
      return HttpResponse.json(
        {
          success: false,
          error: "Location data is required to find nearby stores",
        },
        { status: 400 }
      );
    }

    let items: string[] = [];
    try {
      if (itemsParam) {
        items = JSON.parse(itemsParam);
      }
    } catch (error) {
      console.error("Error parsing items:", error);
    }

    try {
      // Generate simulated nearby stores based on the location
      const stores = generateNearbyStores(latitude, longitude);

      // Add item data to each store
      const storesWithItems = stores.map((store) => {
        return {
          ...store,
          items: items.map((item) => {
            // Calculate price using the helper function
            const price = generatePrice(item, store);

            return {
              name: item,
              price: price,
              lastUpdated: new Date().toISOString(),
              method: "google-shopping",
            };
          }),
        };
      });

      return HttpResponse.json({
        success: true,
        stores: storesWithItems,
      });
    } catch (error) {
      console.error("Error in stores API:", error);
      return HttpResponse.json(
        {
          success: false,
          error: "Failed to fetch nearby stores",
        },
        { status: 500 }
      );
    }
  }),

  // Handler for mapbox token
  http.get("/api/mapbox-token", () => {
    return HttpResponse.json({
      token: import.meta.env.VITE_MAPBOX_TOKEN || "pk.sample-token",
    });
  }),
];
