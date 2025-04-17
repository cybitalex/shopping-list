export interface Store {
  id?: string;
  place_id?: string;
  name: string;
  vicinity?: string;
  distance: number;
  latitude?: number;
  longitude?: number;
  rating?: number;
  priceLevel?: number;
  items?: Array<{
    name: string;
    price: number | null;
    lastUpdated: string | null;
    productName?: string;
    isGenericName?: boolean;
    productDetail?: string | null;
  }>;
}
