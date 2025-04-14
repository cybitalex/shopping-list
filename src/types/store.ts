export interface Store {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance: number; // in miles
  rating?: number;
  priceLevel?: number;
}
