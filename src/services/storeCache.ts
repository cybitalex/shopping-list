import type { Store } from '../types/store';

interface CachedStoreData {
  stores: Store[];
  location: { lat: number; lng: number };
  timestamp: number;
  radius: number;
}

interface CacheEntry {
  data: CachedStoreData;
  expiryTime: number;
}

class StoreCacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_DISTANCE_KM = 2; // Maximum distance to consider cached stores valid
  private readonly SIGNIFICANT_MOVE_KM = 5; // Distance that triggers new store search
  private lastSearchLocation: { lat: number; lng: number } | null = null;

  private generateCacheKey(lat: number, lng: number, radius: number = 8046.7): string {
    // Round to reduce cache key variations for nearby locations
    const roundedLat = Math.round(lat * 1000) / 1000;
    const roundedLng = Math.round(lng * 1000) / 1000;
    return `stores_${roundedLat}_${roundedLng}_${radius}`;
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

  private isLocationSimilar(cachedLocation: { lat: number; lng: number }, currentLocation: { lat: number; lng: number }): boolean {
    const distance = this.calculateDistance(
      cachedLocation.lat, cachedLocation.lng,
      currentLocation.lat, currentLocation.lng
    );
    return distance <= this.MAX_DISTANCE_KM;
  }

  getCachedStores(location: { lat: number; lng: number }, radius: number = 8046.7): Store[] | null {
    // Check if this is a significant location change that should bypass cache
    if (this.hasMovedSignificantly(location)) {
      console.log('🚶‍♂️ Significant location change detected - bypassing cache');
      return null;
    }

    // Try exact match first
    const exactKey = this.generateCacheKey(location.lat, location.lng, radius);
    const exactEntry = this.cache.get(exactKey);
    
    if (exactEntry && Date.now() < exactEntry.expiryTime) {
      console.log('🎯 Found exact cache match for stores');
      return exactEntry.data.stores;
    }

    // Try to find similar location matches
    for (const [key, entry] of this.cache.entries()) {
      if (Date.now() < entry.expiryTime && 
          this.isLocationSimilar(entry.data.location, location)) {
        console.log('📍 Found nearby cache match for stores');
        return entry.data.stores;
      }
    }

    console.log('❌ No valid cache found for stores');
    return null;
  }

  cacheStores(stores: Store[], location: { lat: number; lng: number }, radius: number = 8046.7): void {
    const key = this.generateCacheKey(location.lat, location.lng, radius);
    const cacheEntry: CacheEntry = {
      data: {
        stores,
        location,
        timestamp: Date.now(),
        radius
      },
      expiryTime: Date.now() + this.CACHE_DURATION
    };

    this.cache.set(key, cacheEntry);
    this.lastSearchLocation = location; // Update last search location
    console.log(`💾 Cached ${stores.length} stores for location ${location.lat}, ${location.lng}`);
    
    // Clean up expired entries
    this.cleanupExpiredEntries();
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiryTime) {
        this.cache.delete(key);
      }
    }
  }

  clearCache(): void {
    this.cache.clear();
    this.lastSearchLocation = null;
    console.log('🗑️ Store cache cleared');
  }

  private hasMovedSignificantly(currentLocation: { lat: number; lng: number }): boolean {
    if (!this.lastSearchLocation) {
      return false; // First search, not a move
    }

    const distance = this.calculateDistance(
      this.lastSearchLocation.lat, this.lastSearchLocation.lng,
      currentLocation.lat, currentLocation.lng
    );

    return distance > this.SIGNIFICANT_MOVE_KM;
  }

  getCacheStats(): { totalEntries: number; validEntries: number } {
    const now = Date.now();
    let validEntries = 0;
    
    for (const entry of this.cache.values()) {
      if (now < entry.expiryTime) {
        validEntries++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries
    };
  }

  // Force refresh cache for a location
  invalidateLocation(location: { lat: number; lng: number }): void {
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isLocationSimilar(entry.data.location, location)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    console.log(`🔄 Invalidated ${keysToDelete.length} cache entries for location`);
  }
}

// Export singleton instance
export const storeCacheService = new StoreCacheService();
export default storeCacheService;
