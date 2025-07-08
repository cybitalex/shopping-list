import { SerpApiService } from "./src/services/serpApi.js";
import { PriceAnalysisService } from "./src/services/priceAnalysis.js";

// Initialize services
const serpApi = SerpApiService.getInstance(
  "c54c47bdbf6dbe1eef970a76495dee22009aafee9b2af718100155a7f14d4f59"
);
const priceAnalysis = new PriceAnalysisService(serpApi);

// Test shopping list
const testShoppingList = [
  { name: "milk" },
  { name: "bread" },
  { name: "apples" },
];

// Test location (San Francisco)
const testLocation = {
  lat: 37.7749,
  lng: -122.4194,
};

async function testPriceAnalysis() {
  console.log("Testing Price Analysis Service...\n");
  console.log(
    "Shopping List:",
    testShoppingList.map((item) => item.name).join(", ")
  );
  console.log("Location: San Francisco\n");

  try {
    const analysis = await priceAnalysis.analyzeShoppingList(
      testShoppingList,
      testLocation
    );

    console.log("=== PRICE ANALYSIS RESULTS ===\n");

    // Show cheapest options for each item
    for (const item of analysis.items) {
      console.log(`📦 ${item.item.toUpperCase()}:`);
      console.log(`   🏆 CHEAPEST: ${item.cheapestOption.productName}`);
      console.log(`   💰 Price: ${item.cheapestOption.price}`);
      console.log(
        `   🏪 Store: ${item.cheapestOption.store} (${item.cheapestOption.storeDistance} mi)`
      );
      console.log(`   📊 Total options found: ${item.allOptions.length}`);
      console.log("");
    }

    console.log(
      `💰 TOTAL ESTIMATED COST: $${analysis.totalEstimatedCost.toFixed(2)}\n`
    );

    console.log("=== STORE RECOMMENDATIONS ===\n");
    for (const store of analysis.recommendedStores) {
      console.log(`🏪 ${store.store} (${store.distance} mi)`);
      console.log(`   Items: ${store.items.join(", ")}`);
      console.log(`   Total cost: $${store.totalCost.toFixed(2)}`);
      console.log("");
    }
  } catch (error) {
    console.error("Error during price analysis:", error);
  }
}

// Run the test
testPriceAnalysis().catch(console.error);
