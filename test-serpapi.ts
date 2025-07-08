import { SerpApiService } from "./src/services/serpApi.js";

// Initialize SerpAPI service with the provided key
const serpApi = SerpApiService.getInstance(
  "c54c47bdbf6dbe1eef970a76495dee22009aafee9b2af718100155a7f14d4f59"
);

// Test items to search for
const testItems = ["apples", "milk", "bread"] as const;

// Test location (example: San Francisco)
const testLocation = {
  lat: 37.7749,
  lng: -122.4194,
} as const;

async function runTests() {
  console.log("Starting SerpAPI integration tests (location-based only)...\n");

  for (const item of testItems) {
    console.log(`Testing search for "${item}" with location...`);

    try {
      const result = await serpApi.searchProducts(item, testLocation);
      console.log(
        `Found ${result.stores?.length || 0} stores with location data`
      );

      if (result.stores?.[0]) {
        console.log(
          "Sample results:",
          JSON.stringify(
            {
              name: result.stores[0].name,
              distance: result.stores[0].distance,
              items: result.stores[0].items.map((item) => ({
                name: item.name,
                price: item.price,
                method: item.method,
              })),
            },
            null,
            2
          )
        );
      }

      console.log("\n-------------------\n");
    } catch (error) {
      console.error(`Error testing "${item}":`, error);
    }
  }
}

// Run the tests
runTests().catch(console.error);
