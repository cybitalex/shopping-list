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
  Tooltip,
  Box,
} from "@mui/material";
import type { GroceryItem } from "../App";
import type { Store as ComparisonStore } from "../types/store";

interface CheapestItemsSummaryProps {
  items: GroceryItem[];
  stores: Array<
    ComparisonStore & {
      items: Array<{
        name: string;
        price: number | null;
        productName?: string;
      }>;
    }
  >;
  showSummary: boolean;
}

// Extract unit information from product name
const extractUnitInfo = (productName: string) => {
  const lowerName = productName.toLowerCase();

  // Weight-based units (pounds, ounces, grams)
  const weightMatch = lowerName.match(
    /(\d+(\.\d+)?)\s*(lb|pound|oz|ounce|g|gram|kg|kilogram)/i
  );
  if (weightMatch) {
    const amount = parseFloat(weightMatch[1]);
    let unit = weightMatch[3].toLowerCase();

    // Normalize units
    if (unit === "pound" || unit === "lb") unit = "lb";
    else if (unit === "ounce" || unit === "oz") unit = "oz";
    else if (unit === "gram" || unit === "g") unit = "g";
    else if (unit === "kilogram" || unit === "kg") unit = "kg";

    return {
      text: `${amount} ${unit}`,
      amount: amount,
      unit: unit,
      pricingType: "per unit",
      description: `${amount} ${unit} package`,
    };
  }

  // Count-based units (pack, count, etc.)
  const countMatch = lowerName.match(/(\d+)[\s-]*(ct|count|pack|pk|piece|pc)/i);
  if (countMatch) {
    const amount = parseInt(countMatch[1], 10);
    let unit = countMatch[2].toLowerCase();

    // Normalize units
    if (unit === "count" || unit === "ct") unit = "ct";
    else if (unit === "pack" || unit === "pk") unit = "pk";
    else if (unit === "piece" || unit === "pc") unit = "pc";

    return {
      text: `${amount} ${unit}`,
      amount: amount,
      unit: unit,
      pricingType: "per unit",
      description: `${amount} ${unit} package`,
    };
  }

  // Bags with weight specification
  if (lowerName.includes(" bag")) {
    const match = lowerName.match(/(\d+(\.\d+)?)\s*(lb|pound)?\s*bag/i);
    if (match && match[1] && match[3]) {
      const amount = parseFloat(match[1]);
      const unit = match[3].toLowerCase();
      return {
        text: `${amount} ${unit} bag`,
        amount: amount,
        unit: `${unit} bag`,
        pricingType: "per bag",
        description: `${amount} ${unit} bag`,
      };
    }
    if (match && match[1]) {
      const amount = parseFloat(match[1]);
      return {
        text: `${amount} bag`,
        amount: amount,
        unit: "bag",
        pricingType: "per bag",
        description: `${amount} bag`,
      };
    }
    return {
      text: "Per bag",
      amount: 1,
      unit: "bag",
      pricingType: "per bag",
      description: "Per bag",
    };
  }

  // Per pound indicators
  if (
    lowerName.includes(" per lb") ||
    lowerName.includes(" per pound") ||
    lowerName.includes("/lb")
  ) {
    return {
      text: "Per lb",
      amount: 1,
      unit: "lb",
      pricingType: "per pound",
      description: "Price per pound",
    };
  }

  // If we couldn't detect a specific unit
  return {
    text: "Unknown unit",
    amount: null,
    unit: "unknown",
    pricingType: "unknown",
    description: "Unit not specified",
  };
};

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
  const summary: {
    name: string;
    price: number | null;
    stores: string[];
    unitInfo?: any;
    productName?: string;
  }[] = items.map((item) => {
    let cheapestPrice: number | null = null;
    let cheapestStores: Set<string> = new Set(); // Use Set to avoid duplicates
    let cheapestProductName: string | undefined;
    let cheapestUnitInfo: any = null;

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
          cheapestProductName = found.productName;
          cheapestUnitInfo = extractUnitInfo(found.productName || item.name);
        } else if (found.price === cheapestPrice) {
          cheapestStores.add(store.name);
        }
      }
    });

    return {
      name: item.name,
      price: cheapestPrice,
      stores: Array.from(cheapestStores), // Convert Set back to array
      unitInfo: cheapestUnitInfo,
      productName: cheapestProductName,
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
              <TableCell>Pricing Type</TableCell>
              <TableCell>Store(s)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {summary.map((row) => (
              <TableRow key={row.name}>
                <TableCell>{row.name}</TableCell>
                <TableCell>
                  {typeof row.price === "number" ? (
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                        ${(row.price as number).toFixed(2)}
                      </Typography>
                      {row.unitInfo && row.unitInfo.amount && (
                        <Typography variant="caption" color="text.secondary">
                          {row.unitInfo.text}
                        </Typography>
                      )}
                    </Box>
                  ) : (
                    <Chip label="Not found" color="warning" size="small" />
                  )}
                </TableCell>
                <TableCell>
                  {row.unitInfo ? (
                    <Tooltip title={row.unitInfo.description}>
                      <Typography variant="body2" color="text.secondary">
                        {row.unitInfo.pricingType}
                      </Typography>
                    </Tooltip>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
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
