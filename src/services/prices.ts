import type { Store } from "../types/store";

export interface PriceEstimate {
  storeId: string;
  itemName: string;
  price: number;
  confidence: number;
}

// This is a mock implementation - in a real app, you'd want to use actual price data
// or integrate with store APIs
export const estimatePrices = async (
  items: string[],
  stores: Store[]
): Promise<Record<string, PriceEstimate[]>> => {
  try {
    const priceEstimates: Record<string, PriceEstimate[]> = {};

    // For each item, estimate prices at each store
    for (const item of items) {
      const itemEstimates: PriceEstimate[] = [];

      for (const store of stores) {
        // Base price on store's price level and rating
        const basePrice = 5 + (store.priceLevel || 1) * 2; // Higher price level = more expensive
        const ratingFactor = ((store.rating || 3) - 5) * 0.5; // Lower rating = slightly lower prices

        // Add some randomness to make it more realistic
        const randomFactor = 0.8 + Math.random() * 0.4; // Random factor between 0.8 and 1.2

        const estimatedPrice = (basePrice + ratingFactor) * randomFactor;
        const confidence = 0.7 + (store.rating || 3) / 10; // Higher rating = higher confidence

        itemEstimates.push({
          storeId: store.id || store.place_id || `store-${Date.now()}`, // Provide a fallback ID
          itemName: item,
          price: Number(estimatedPrice.toFixed(2)),
          confidence: Number(confidence.toFixed(2)),
        });
      }

      // Sort by price
      itemEstimates.sort((a, b) => a.price - b.price);
      priceEstimates[item] = itemEstimates;
    }

    return priceEstimates;
  } catch (error) {
    console.error("Error estimating prices:", error);
    throw error;
  }
};

export const findCheapestStore = (
  priceEstimates: Record<string, PriceEstimate[]>
): string | null => {
  try {
    // Calculate total cost for each store
    const storeTotals: Record<string, number> = {};

    Object.values(priceEstimates).forEach((estimates) => {
      estimates.forEach((estimate) => {
        if (!storeTotals[estimate.storeId]) {
          storeTotals[estimate.storeId] = 0;
        }
        storeTotals[estimate.storeId] += estimate.price;
      });
    });

    // Find store with lowest total
    let cheapestStoreId: string | null = null;
    let lowestTotal = Infinity;

    Object.entries(storeTotals).forEach(([storeId, total]) => {
      if (total < lowestTotal) {
        lowestTotal = total;
        cheapestStoreId = storeId;
      }
    });

    return cheapestStoreId;
  } catch (error) {
    console.error("Error finding cheapest store:", error);
    return null;
  }
};
