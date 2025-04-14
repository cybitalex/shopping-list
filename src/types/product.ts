export interface Product {
  id: string;
  name: string;
  prices: Record<string, number | null>;
} 