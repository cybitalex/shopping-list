import axios from "axios";
import type { Store } from "../types/store";

export interface ScrapingResult {
  storeName: string;
  items: {
    name: string;
    price: number;
    url?: string;
    store?: string;
  }[];
}

interface SearchResult {
  itemName: string;
  price: number;
  url: string;
  store: string;
  confidence: number;
}

// This would be in an environment variable in production
const BROWSERBASE_API_KEY = "YOUR_BROWSERBASE_API_KEY";
const OPENAI_API_KEY = "YOUR_OPENAI_API_KEY";

async function searchItemWithAI(item: string): Promise<SearchResult[]> {
  try {
    // Use OpenAI to generate optimal search queries for the item
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a shopping assistant that helps find the best prices for grocery items.",
          },
          {
            role: "user",
            content: `Find the best search query to find prices for: ${item}`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const searchQuery = response.data.choices[0].message.content;

    // Use Browserbase to perform the search
    const browserbaseResponse = await axios.post(
      "https://cloud.browserbase.io/v1/scrape",
      {
        url: `https://www.google.com/search?q=${encodeURIComponent(
          searchQuery
        )}+price`,
        // Browserbase specific configuration
        config: {
          // Wait for network requests to finish
          waitForNetworkIdle: true,
          // Wait for page to be fully loaded
          waitUntil: "networkidle0",
          // Set viewport size
          viewport: {
            width: 1920,
            height: 1080,
          },
        },
        // Extract specific elements
        extract: {
          searchResults: {
            selector: ".g",
            type: "list",
            properties: {
              link: {
                selector: "a",
                type: "attribute",
                attribute: "href",
              },
              title: {
                selector: ".VuuXrf",
                type: "text",
              },
              description: {
                selector: ".r8YQR",
                type: "text",
              },
              price: {
                // Look for price patterns in the text
                selector: "*",
                type: "text",
                regex: "\\$\\d+\\.?\\d*",
              },
            },
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${BROWSERBASE_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Process and validate results
    const results: SearchResult[] = [];
    const searchResults = browserbaseResponse.data.searchResults || [];

    for (const result of searchResults) {
      if (result.price) {
        results.push({
          itemName: item,
          price: parseFloat(result.price.replace("$", "")),
          url: result.link,
          store: result.title || "",
          confidence: 0.8, // This could be calculated based on various factors
        });
      }
    }

    return results;
  } catch (error) {
    console.error("Error searching with AI:", error);
    return [];
  }
}

export async function findNearbyStores(
  latitude: number,
  longitude: number
): Promise<Store[]> {
  try {
    // Use Google Places API to find nearby grocery stores
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=5000&type=grocery_or_supermarket&key=YOUR_GOOGLE_API_KEY`
    );

    return response.data.results.map((place: any) => ({
      id: place.place_id,
      name: place.name,
      distance: calculateDistance(
        latitude,
        longitude,
        place.geometry.location.lat,
        place.geometry.location.lng
      ),
      url: place.website,
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
    }));
  } catch (error) {
    console.error("Error finding nearby stores:", error);
    return [];
  }
}

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d * 0.621371; // Convert to miles
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

export async function compareStores(
  stores: Store[],
  items: string[]
): Promise<ScrapingResult[]> {
  const results: ScrapingResult[] = [];
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  for (const store of stores) {
    try {
      const storeResults: ScrapingResult = {
        storeName: store.name,
        items: [],
      };

      for (const item of items) {
        const searchResults = await searchItemWithAI(item);
        const bestResult = searchResults
          .filter((result) =>
            result.store.toLowerCase().includes(store.name.toLowerCase())
          )
          .sort((a, b) => a.price - b.price)[0];

        if (bestResult) {
          storeResults.items.push({
            name: item,
            price: bestResult.price,
            url: bestResult.url,
            store: bestResult.store,
          });
        }

        await delay(1000); // Respect rate limits
      }

      if (storeResults.items.length > 0) {
        results.push(storeResults);
      }
    } catch (error) {
      console.error(`Error processing ${store.name}:`, error);
    }
  }

  return results;
}
