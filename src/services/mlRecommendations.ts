import type { Store } from '../types/store';
import type { GroceryItem } from '../App';

interface UserBehavior {
  itemName: string;
  selectedStore: string;
  price: number;
  timestamp: number;
  location: { lat: number; lng: number };
  wasCheapest: boolean;
}

interface PricePrediction {
  predictedPrice: number;
  confidence: number;
  basedOnSamples: number;
}

interface StoreRecommendation {
  store: Store;
  score: number;
  reasons: string[];
  confidenceLevel: 'high' | 'medium' | 'low';
  recommendationType: 'preference' | 'convenience' | 'value' | 'loyalty';
}

class MLRecommendationService {
  private userBehaviorData: UserBehavior[] = [];
  private readonly MAX_BEHAVIOR_RECORDS = 1000;
  private readonly STORAGE_KEY = 'shopping_ml_data';

  constructor() {
    this.loadBehaviorData();
  }

  // Track user behavior for ML training
  trackUserChoice(
    item: GroceryItem,
    selectedStore: Store,
    price: number,
    currentLocation: { lat: number; lng: number },
    wasCheapestOption: boolean
  ): void {
    const behavior: UserBehavior = {
      itemName: item.name.toLowerCase(),
      selectedStore: selectedStore.name,
      price,
      timestamp: Date.now(),
      location: currentLocation,
      wasCheapest: wasCheapestOption
    };

    this.userBehaviorData.unshift(behavior);
    
    // Keep only recent records
    if (this.userBehaviorData.length > this.MAX_BEHAVIOR_RECORDS) {
      this.userBehaviorData = this.userBehaviorData.slice(0, this.MAX_BEHAVIOR_RECORDS);
    }

    this.saveBehaviorData();
    console.log(`📊 Tracked user choice: ${item.name} at ${selectedStore.name} for $${price}`);
  }

  // Predict price for an item at a specific store
  predictPrice(itemName: string, storeName: string): PricePrediction | null {
    const relevantData = this.userBehaviorData.filter(
      behavior => 
        behavior.itemName === itemName.toLowerCase() &&
        behavior.selectedStore === storeName
    );

    if (relevantData.length === 0) {
      return null;
    }

    // Simple weighted average with more recent data having higher weight
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    let weightedSum = 0;
    let totalWeight = 0;

    relevantData.forEach(data => {
      const age = now - data.timestamp;
      const ageWeight = Math.max(0, 1 - (age / maxAge));
      const weight = ageWeight * ageWeight; // Exponential decay
      
      weightedSum += data.price * weight;
      totalWeight += weight;
    });

    if (totalWeight === 0) return null;

    const predictedPrice = weightedSum / totalWeight;
    const confidence = Math.min(0.95, Math.sqrt(relevantData.length / 10)); // Higher confidence with more data

    return {
      predictedPrice,
      confidence,
      basedOnSamples: relevantData.length
    };
  }

  // Get store recommendations based on user preferences and historical data
  getStoreRecommendations(
    items: GroceryItem[],
    availableStores: Store[],
    currentLocation: { lat: number; lng: number }
  ): StoreRecommendation[] {
    const recommendations: StoreRecommendation[] = [];

    availableStores.forEach(store => {
      const score = this.calculateStoreScore(items, store, currentLocation);
      const reasons = this.getRecommendationReasons(items, store, currentLocation);

      recommendations.push({
        store,
        score,
        reasons,
        confidenceLevel: this.getConfidenceLevel(store, items),
        recommendationType: this.getRecommendationType(store, items, currentLocation)
      });
    });

    // Sort by score (higher is better)
    return recommendations.sort((a, b) => b.score - a.score);
  }

  private calculateStoreScore(
    items: GroceryItem[],
    store: Store,
    currentLocation: { lat: number; lng: number }
  ): number {
    let score = 0;
    let factors = 0;

    // Factor 1: User's historical preference for this store
    const userVisits = this.userBehaviorData.filter(
      behavior => behavior.selectedStore === store.name
    ).length;
    if (userVisits > 0) {
      score += Math.min(0.3, userVisits * 0.05); // Max 0.3 points
      factors++;
    }

    // Factor 2: How often user chose this store when it wasn't cheapest (brand loyalty)
    const nonCheapestChoices = this.userBehaviorData.filter(
      behavior => 
        behavior.selectedStore === store.name && 
        !behavior.wasCheapest
    ).length;
    if (nonCheapestChoices > 0) {
      score += Math.min(0.2, nonCheapestChoices * 0.1); // Brand loyalty bonus
      factors++;
    }

    // Factor 3: Distance factor (closer is better)
    if (store.latitude && store.longitude) {
      const distance = this.calculateDistance(
        currentLocation.lat, currentLocation.lng,
        store.latitude, store.longitude
      );
      const distanceScore = Math.max(0, 1 - (distance / 10)); // 10km max distance
      score += distanceScore * 0.2;
      factors++;
    }

    // Factor 4: Store rating
    if (store.rating) {
      const ratingScore = (store.rating - 3) / 2; // Normalize 3-5 rating to 0-1
      score += Math.max(0, ratingScore) * 0.15;
      factors++;
    }

    // Factor 5: Price history for specific items
    let priceAdvantage = 0;
    let itemsWithHistory = 0;
    
    items.forEach(item => {
      const prediction = this.predictPrice(item.name, store.name);
      if (prediction) {
        // Compare with average market price for this item
        const marketAverage = this.getMarketAveragePrice(item.name);
        if (marketAverage && prediction.predictedPrice < marketAverage) {
          priceAdvantage += (marketAverage - prediction.predictedPrice) / marketAverage;
          itemsWithHistory++;
        }
      }
    });

    if (itemsWithHistory > 0) {
      score += (priceAdvantage / itemsWithHistory) * 0.25;
      factors++;
    }

    // Normalize score
    return factors > 0 ? score / factors : 0;
  }

  private getRecommendationReasons(
    items: GroceryItem[],
    store: Store,
    currentLocation: { lat: number; lng: number }
  ): string[] {
    const reasons: string[] = [];

    // Check user history
    const userVisits = this.userBehaviorData.filter(
      behavior => behavior.selectedStore === store.name
    ).length;
    
    if (userVisits > 5) {
      reasons.push('You frequently shop here');
    }

    // Check if close by
    if (store.latitude && store.longitude) {
      const distance = this.calculateDistance(
        currentLocation.lat, currentLocation.lng,
        store.latitude, store.longitude
      );
      if (distance < 2) {
        reasons.push('Very close to your location');
      } else if (distance < 5) {
        reasons.push('Conveniently located');
      }
    }

    // Check rating
    if (store.rating && store.rating >= 4.0) {
      reasons.push('Highly rated store');
    }

    // Check price predictions
    let goodPriceItems = 0;
    items.forEach(item => {
      const prediction = this.predictPrice(item.name, store.name);
      const marketAverage = this.getMarketAveragePrice(item.name);
      if (prediction && marketAverage && prediction.predictedPrice < marketAverage * 0.9) {
        goodPriceItems++;
      }
    });

    if (goodPriceItems > 0) {
      reasons.push(`Historically good prices on ${goodPriceItems} item${goodPriceItems > 1 ? 's' : ''}`);
    }

    return reasons;
  }

  private getConfidenceLevel(store: Store, items: GroceryItem[]): 'high' | 'medium' | 'low' {
    const userVisits = this.userBehaviorData.filter(
      behavior => behavior.selectedStore === store.name
    ).length;

    let dataPoints = userVisits;
    items.forEach(item => {
      const prediction = this.predictPrice(item.name, store.name);
      if (prediction) dataPoints += prediction.basedOnSamples;
    });

    if (dataPoints >= 10) return 'high';
    if (dataPoints >= 3) return 'medium';
    return 'low';
  }

  private getRecommendationType(
    store: Store, 
    items: GroceryItem[], 
    currentLocation: { lat: number; lng: number }
  ): 'preference' | 'convenience' | 'value' | 'loyalty' {
    const userVisits = this.userBehaviorData.filter(
      behavior => behavior.selectedStore === store.name
    ).length;

    // Check if user frequently chose this store when it wasn't cheapest (loyalty)
    const loyaltyChoices = this.userBehaviorData.filter(
      behavior => 
        behavior.selectedStore === store.name && 
        !behavior.wasCheapest
    ).length;

    if (loyaltyChoices > 2) return 'loyalty';

    // Check distance for convenience
    if (store.latitude && store.longitude) {
      const distance = this.calculateDistance(
        currentLocation.lat, currentLocation.lng,
        store.latitude, store.longitude
      );
      if (distance < 2 && userVisits > 0) return 'convenience';
    }

    // Check for value based on price history
    let hasGoodPrices = false;
    items.forEach(item => {
      const prediction = this.predictPrice(item.name, store.name);
      const marketAverage = this.getMarketAveragePrice(item.name);
      if (prediction && marketAverage && prediction.predictedPrice < marketAverage * 0.9) {
        hasGoodPrices = true;
      }
    });

    if (hasGoodPrices) return 'value';
    
    return 'preference';
  }


  private getMarketAveragePrice(itemName: string): number | null {
    const relevantData = this.userBehaviorData.filter(
      behavior => behavior.itemName === itemName.toLowerCase()
    );

    if (relevantData.length === 0) return null;

    const sum = relevantData.reduce((acc, data) => acc + data.price, 0);
    return sum / relevantData.length;
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private loadBehaviorData(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.userBehaviorData = JSON.parse(stored);
        console.log(`📈 Loaded ${this.userBehaviorData.length} ML behavior records`);
      }
    } catch (error) {
      console.error('Failed to load ML behavior data:', error);
      this.userBehaviorData = [];
    }
  }

  private saveBehaviorData(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.userBehaviorData));
    } catch (error) {
      console.error('Failed to save ML behavior data:', error);
    }
  }

  // Get insights for the user
  getUserInsights(): {
    totalPurchases: number;
    favoriteStores: Array<{ name: string; visits: number }>;
    averageItemPrice: Record<string, number>;
    savings: number;
  } {
    const insights = {
      totalPurchases: this.userBehaviorData.length,
      favoriteStores: [] as Array<{ name: string; visits: number }>,
      averageItemPrice: {} as Record<string, number>,
      savings: 0
    };

    // Calculate favorite stores
    const storeVisits: Record<string, number> = {};
    this.userBehaviorData.forEach(behavior => {
      storeVisits[behavior.selectedStore] = (storeVisits[behavior.selectedStore] || 0) + 1;
    });

    insights.favoriteStores = Object.entries(storeVisits)
      .map(([name, visits]) => ({ name, visits }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 5);

    // Calculate average prices per item
    const itemPrices: Record<string, number[]> = {};
    this.userBehaviorData.forEach(behavior => {
      if (!itemPrices[behavior.itemName]) {
        itemPrices[behavior.itemName] = [];
      }
      itemPrices[behavior.itemName].push(behavior.price);
    });

    Object.entries(itemPrices).forEach(([item, prices]) => {
      insights.averageItemPrice[item] = prices.reduce((a, b) => a + b, 0) / prices.length;
    });

    // Calculate estimated savings from choosing cheapest options
    insights.savings = this.userBehaviorData
      .filter(behavior => behavior.wasCheapest)
      .reduce((total, behavior) => {
        const avgPrice = insights.averageItemPrice[behavior.itemName];
        return total + (avgPrice - behavior.price);
      }, 0);

    return insights;
  }

  clearData(): void {
    this.userBehaviorData = [];
    localStorage.removeItem(this.STORAGE_KEY);
    console.log('🗑️ Cleared all ML data');
  }
}

// Export singleton instance
export const mlRecommendationService = new MLRecommendationService();
export default mlRecommendationService;
