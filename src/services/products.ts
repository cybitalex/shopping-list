import type { Store } from "../types/store";
import { getGoogleMapsService } from "../utils/googleMaps";

export interface Product {
  name: string;
  price: number;
  storeId: string;
  storeName: string;
}

export const searchProducts = async (
  itemName: string,
  store: Store
): Promise<Product | null> => {
  try {
    const maps = getGoogleMapsService();
    const service = new maps.places.PlacesService(
      document.createElement("div")
    );

    // First, get the place details to access more information
    const placeDetails = await new Promise<google.maps.places.PlaceResult>(
      (resolve, reject) => {
        service.getDetails(
          {
            placeId: store.id,
            fields: ["name", "formatted_address", "website"],
          },
          (result, status) => {
            if (status === maps.places.PlacesServiceStatus.OK && result) {
              resolve(result);
            } else {
              reject(new Error(`Failed to get store details: ${status}`));
            }
          }
        );
      }
    );

    // Here you would typically:
    // 1. Use the store's website to scrape product data
    // 2. Or use a product API to search for the item
    // 3. Or use a database of store products

    // For now, we'll simulate finding a product with a random price
    // In a real implementation, you would replace this with actual product search logic
    const mockPrice = Math.random() * 10 + 1; // Random price between $1 and $11

    return {
      name: itemName,
      price: parseFloat(mockPrice.toFixed(2)),
      storeId: store.id,
      storeName: store.name,
    };
  } catch (error) {
    console.error(`Error searching for ${itemName} at ${store.name}:`, error);
    return null;
  }
};

export const searchProductsAtStores = async (
  itemName: string,
  stores: Store[]
): Promise<Product[]> => {
  const productPromises = stores.map((store) =>
    searchProducts(itemName, store)
  );
  const products = await Promise.all(productPromises);
  return products.filter((product): product is Product => product !== null);
};
