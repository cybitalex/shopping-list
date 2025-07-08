import React from "react";
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
} from "@mui/material";
import type { GroceryItem } from "../App";
import type { Store as ComparisonStore } from "../types/store";

interface CheapestItemsSummaryProps {
  items: GroceryItem[];
  stores: Array<
    ComparisonStore & { items: Array<{ name: string; price: number | null }> }
  >;
  showSummary: boolean;
}

const CheapestItemsSummary: React.FC<CheapestItemsSummaryProps> = ({
  items,
  stores,
  showSummary,
}) => {
  // Don't render if we don't have final results yet
  if (!showSummary || stores.length === 0) {
    return null;
  }

  // For each item, find the lowest price and which stores have it
  const summary: { name: string; price: number | null; stores: string[] }[] =
    items.map((item) => {
      let cheapestPrice: number | null = null;
      let cheapestStores: Set<string> = new Set(); // Use Set to avoid duplicates

      stores.forEach((store) => {
        const found = store.items.find(
          (i) =>
            i.name.toLowerCase() === item.name.toLowerCase() && i.price !== null
        );
        if (found) {
          if (
            cheapestPrice === null ||
            (found.price !== null && found.price < cheapestPrice)
          ) {
            cheapestPrice = found.price;
            cheapestStores.clear();
            cheapestStores.add(store.name);
          } else if (found.price === cheapestPrice) {
            cheapestStores.add(store.name);
          }
        }
      });

      return {
        name: item.name,
        price: cheapestPrice,
        stores: Array.from(cheapestStores), // Convert Set back to array
      };
    });

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Cheapest Prices by Item
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell>
              <TableCell>Cheapest Price</TableCell>
              <TableCell>Store(s)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {summary.map((row) => (
              <TableRow key={row.name}>
                <TableCell>{row.name}</TableCell>
                <TableCell>
                  {typeof row.price === "number" ? (
                    `$${(row.price as number).toFixed(2)}`
                  ) : (
                    <Chip label="Not found" color="warning" size="small" />
                  )}
                </TableCell>
                <TableCell>
                  {row.stores.length > 0 ? (
                    row.stores.join(", ")
                  ) : (
                    <Chip label="No store" color="default" size="small" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default CheapestItemsSummary;
