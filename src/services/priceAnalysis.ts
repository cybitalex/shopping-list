import { SerpApiService } from "./serpApi";
import { searchNearbyStores } from "./places";
import type { Store } from "../types/store";

export interface ShoppingListItem {
  name: string;
  quantity?: number;
}

export interface PriceAnalysisItem {
  item: string;
  cheapestOption: {
    store: string;
    storeDistance: number;
    productName: string;
    price: string;
    priceValue: number;
    address?: string;
  };
  allOptions: Array<{
    store: string;
    storeDistance: number;
    productName: string;
    price: string;
    priceValue: number;
    address?: string;
  }>;
}

export interface RecommendedStore {
  store: string;
  distance: number;
  items: string[];
  totalCost: number;
  address?: string;
}

export interface PriceAnalysis {
  items: PriceAnalysisItem[];
  totalEstimatedCost: number;
  recommendedStores: RecommendedStore[];
}

export interface ShoppingListAnalysis {
  items: PriceAnalysis[];
  totalEstimatedCost: number;
  recommendedStores: Array<{
    store: string;
    distance: number;
    items: string[];
    totalCost: number;
    address?: string;
  }>;
}

export class PriceAnalysisService {
  private serpApiService: SerpApiService;

  constructor(serpApiKey: string) {
    this.serpApiService = SerpApiService.getInstance(serpApiKey);
  }

  private extractPriceValue(priceString: string): number {
    // Remove currency symbols and convert to number
    const cleanPrice = priceString.replace(/[$,]/g, "");
    const match = cleanPrice.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
  }

  private findBestMatches(
    itemName: string,
    products: Array<{ name: string; price: string }>
  ): Array<{ name: string; price: string; priceValue: number }> {
    const itemWords = itemName.toLowerCase().split(" ");

    return products
      .map((product) => ({
        ...product,
        priceValue: this.extractPriceValue(product.price),
      }))
      .filter((product) => {
        const productWords = product.name.toLowerCase().split(" ");
        // Check if any word from the item name appears in the product name
        return itemWords.some((word) =>
          productWords.some(
            (pWord) => pWord.includes(word) || word.includes(pWord)
          )
        );
      })
      .sort((a, b) => a.priceValue - b.priceValue); // Sort by price, cheapest first
  }

  public async analyzeShoppingList(
    items: Array<{ name: string }>,
    userLocation: { lat: number; lng: number }
  ): Promise<PriceAnalysis> {
    try {
      console.log(
        `Analyzing shopping list with ${items.length} items at location (${userLocation.lat}, ${userLocation.lng})`
      );

      // Get nearby stores from Google Maps
      const nearbyStores = await searchNearbyStores("", userLocation);
      console.log(
        `Found ${nearbyStores.length} nearby stores from Google Maps`
      );

      if (nearbyStores.length === 0) {
        throw new Error(
          "No nearby stores found. Please try a different location."
        );
      }

      // Create a map of store names to store data for quick lookup
      const storeMap = new Map<string, Store>();
      nearbyStores.forEach((store) => {
        // Store both the full name and common variations
        storeMap.set(store.name.toLowerCase(), store);
        storeMap.set(store.name.toLowerCase().replace(/[^a-z0-9]/g, ""), store);

        // Also store common chain names if they match
        const chainNames = [
          "walmart",
          "target",
          "costco",
          "sams club",
          "kroger",
          "safeway",
          "albertsons",
          "publix",
          "wegmans",
          "whole foods",
          "trader joes",
          "aldi",
          "food lion",
          "giant",
          "giant eagle",
          "shoprite",
          "stop & shop",
          "acme",
          "meijer",
          "heb",
          "sprouts",
          "fresh market",
          "smart & final",
          "winco",
          "save a lot",
        ];

        const storeLower = store.name.toLowerCase();
        for (const chain of chainNames) {
          if (storeLower.includes(chain)) {
            storeMap.set(chain, store);
            break;
          }
        }
      });

      const analysisItems: PriceAnalysisItem[] = [];
      const storeResults = new Map<
        string,
        { items: string[]; totalCost: number }
      >();

      // Analyze each item
      for (const item of items) {
        console.log(`Searching for ${item.name}...`);

        const result = await this.serpApiService.searchProducts(
          item.name,
          userLocation
        );

        if (!result.success || result.stores.length === 0) {
          console.warn(`No results found for ${item.name}`);
          continue;
        }

        const allOptions: Array<{
          store: string;
          storeDistance: number;
          productName: string;
          price: string;
          priceValue: number;
          address?: string;
        }> = [];

        // Process each store result - ONLY if it matches a local store from Google Maps
        for (const storeResult of result.stores) {
          if (storeResult.items.length === 0) continue;

          // Check if this store matches any of our local stores
          let localStore = null;
          const storeNameLower = storeResult.name.toLowerCase();
          const storeNameNormalized = storeNameLower.replace(/[^a-z0-9]/g, "");

          // Try exact match first
          if (storeMap.has(storeNameLower)) {
            localStore = storeMap.get(storeNameLower);
          } else if (storeMap.has(storeNameNormalized)) {
            localStore = storeMap.get(storeNameNormalized);
          } else {
            // Try to match by chain name
            for (const [chainName, store] of storeMap.entries()) {
              if (storeNameLower.includes(chainName)) {
                localStore = store;
                break;
              }
            }
          }

          if (!localStore) continue; // Skip if no matching local store

          // Add each item from this store
          for (const storeItem of storeResult.items) {
            const priceValue = this.extractPriceValue(storeItem.price);
            if (priceValue === 0) continue; // Skip items with invalid prices

            allOptions.push({
              store: localStore.name,
              storeDistance: localStore.distance,
              productName: storeItem.name,
              price: storeItem.price,
              priceValue,
              address: localStore.vicinity,
            });
          }
        }

        if (allOptions.length === 0) {
          console.warn(`No valid price options found for ${item.name}`);
          continue;
        }

        // Sort options by price
        allOptions.sort((a, b) => a.priceValue - b.priceValue);
        const cheapestOption = allOptions[0];

        // Update store results for recommendations
        if (!storeResults.has(cheapestOption.store)) {
          storeResults.set(cheapestOption.store, {
            items: [],
            totalCost: 0,
          });
        }
        const storeResult = storeResults.get(cheapestOption.store)!;
        storeResult.items.push(item.name);
        storeResult.totalCost += cheapestOption.priceValue;

        analysisItems.push({
          item: item.name,
          cheapestOption,
          allOptions,
        });
      }

      // Calculate total cost and prepare store recommendations
      const totalEstimatedCost = Array.from(storeResults.values()).reduce(
        (total, store) => total + store.totalCost,
        0
      );

      const recommendedStores = Array.from(storeResults.entries())
        .map(([storeName, data]) => {
          const store = Array.from(storeMap.values()).find(
            (s) => s.name === storeName
          );
          return {
            store: storeName,
            distance: store?.distance || 0,
            items: data.items,
            totalCost: data.totalCost,
            address: store?.vicinity,
          };
        })
        .sort((a, b) => a.totalCost - b.totalCost);

      return {
        items: analysisItems,
        totalEstimatedCost,
        recommendedStores,
      };
    } catch (error) {
      console.error("Error in price analysis:", error);
      throw error;
    }
  }
}
