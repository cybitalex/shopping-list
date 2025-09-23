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

  // Special case for fruits - check for specific fruit pricing patterns
  const fruitNames = ['apple', 'banana', 'orange', 'grape', 'strawberry', 'blueberry', 'cherry', 'peach', 'pear', 'mango', 'pineapple', 'watermelon', 'cantaloupe', 'honeydew'];
  const isFruit = fruitNames.some(fruit => lowerName.includes(fruit));

  // Per pound indicators (highest priority for fruits)
  if (lowerName.includes(" per lb") || lowerName.includes(" per pound") || lowerName.includes("/lb") || 
      (isFruit && (lowerName.includes(" lb") || lowerName.includes(" pound")))) {
    return {
      text: "Per Pound",
      amount: 1,
      unit: "lb",
      pricingType: "per pound",
      description: "Price per pound"
    };
  }

  // Individual fruit pricing
  if (isFruit && (lowerName.includes(" each") || lowerName.includes("- each") || lowerName.includes(" per item") || 
      lowerName.includes("individual") || lowerName.includes("single"))) {
    return {
      text: "Each",
      amount: 1,
      unit: "each",
      pricingType: "individually",
      description: "Price per individual fruit"
    };
  }

  // Bunch pricing (especially for bananas, grapes)
  if (lowerName.includes(" bunch") || (isFruit && lowerName.includes("bunch"))) {
    return {
      text: "Per Bunch",
      amount: 1,
      unit: "bunch",
      pricingType: "per bunch",
      description: "Price per bunch"
    };
  }

  // Bag pricing with weight specification
  if (lowerName.includes(" bag")) {
    const bagMatch = lowerName.match(/(\d+(\.\d+)?)\s*(lb|pound|oz|ounce)?\s*bag/i);
    if (bagMatch && bagMatch[1] && bagMatch[3]) {
      const amount = parseFloat(bagMatch[1]);
      const unit = bagMatch[3].toLowerCase();
      const normalizedUnit = (unit === "pound" || unit === "lb") ? "lb" : 
                             (unit === "ounce" || unit === "oz") ? "oz" : unit;
      return {
        text: `${amount} ${normalizedUnit} bag`,
        amount: amount,
        unit: `${normalizedUnit}`,
        pricingType: "per bag",
        description: `${amount} ${normalizedUnit} bag`
      };
    }
    if (bagMatch && bagMatch[1]) {
      const amount = parseFloat(bagMatch[1]);
      return {
        text: `${amount} item bag`,
        amount: amount,
        unit: "bag",
        pricingType: "per bag",
        description: `${amount} item bag`
      };
    }
    return {
      text: "Per Bag",
      amount: 1,
      unit: "bag",
      pricingType: "per bag",
      description: "Price per bag"
    };
  }

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
      text: `${amount} ${unit} package`,
      amount: amount,
      unit: unit,
      pricingType: "per package",
      description: `${amount} ${unit} package`
    };
  }

  // Count-based units (pack, count, etc.)
  const countMatch = lowerName.match(/(\d+)[\s-]*(ct|count|pack|pk|piece|pc)/i);
  if (countMatch) {
    const amount = parseInt(countMatch[1], 10);
    let unit = countMatch[2].toLowerCase();

    // Normalize units
    if (unit === "count" || unit === "ct") unit = "count";
    else if (unit === "pack" || unit === "pk") unit = "pack";
    else if (unit === "piece" || unit === "pc") unit = "piece";

    return {
      text: `${amount} ${unit}`,
      amount: amount,
      unit: unit,
      pricingType: "per package",
      description: `${amount} ${unit} package`
    };
  }

  // Items sold individually (general)
  if (lowerName.includes(" each") || lowerName.includes("- each") || lowerName.includes(" per item")) {
    return {
      text: "Each",
      amount: 1,
      unit: "each",
      pricingType: "individually",
      description: "Price per individual item"
    };
  }

  // Per ounce indicators
  if (lowerName.includes(" per oz") || lowerName.includes(" per ounce") || lowerName.includes("/oz")) {
    return {
      text: "Per Ounce",
      amount: 1,
      unit: "oz",
      pricingType: "per ounce",
      description: "Price per ounce"
    };
  }

  // If we couldn't detect a specific unit but it's a fruit, assume per pound (common for loose fruits)
  if (isFruit) {
    return {
      text: "Per Pound (estimated)",
      amount: 1,
      unit: "lb",
      pricingType: "per pound",
      description: "Likely priced per pound (common for loose fruits)"
    };
  }

  // If we couldn't detect a specific unit
  return {
    text: "Unit not specified",
    amount: null,
    unit: "unknown",
    pricingType: "unknown",
    description: "Pricing unit not clearly specified"
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
    <Paper
      sx={{ p: 3, mb: 3, border: "2px solid", borderColor: "success.main" }}
    >
      <Box sx={{ mb: 2 }}>
        <Typography
          variant="h5"
          gutterBottom
          sx={{ color: "success.main", fontWeight: "bold" }}
        >
          🏆 Best Deals Found
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The cheapest price for each item on your list, showing exactly what
          you're paying for and where to find it.
        </Typography>
      </Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell>
              <TableCell>Cheapest Price</TableCell>
              <TableCell>Price Type</TableCell>
              <TableCell>Product Details</TableCell>
              <TableCell>Store(s) with Cheapest Price</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {summary.map((row) => (
              <TableRow key={row.name}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: "medium" }}>
                    {row.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  {typeof row.price === "number" ? (
                    <Box>
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: "bold", color: "success.main" }}
                      >
                        ${(row.price as number).toFixed(2)}
                      </Typography>
                      {row.unitInfo && row.unitInfo.pricingType && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontStyle: "italic" }}
                        >
                          {row.unitInfo.pricingType}
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
                      <Box>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontWeight: "bold" }}
                        >
                          {row.unitInfo.pricingType === "per pound"
                            ? "Per Pound"
                            : row.unitInfo.pricingType === "per bag"
                            ? "Per Bag"
                            : row.unitInfo.pricingType === "individually"
                            ? "Each"
                            : row.unitInfo.pricingType === "per package"
                            ? "Per Package"
                            : row.unitInfo.pricingType === "per container"
                            ? "Per Container"
                            : row.unitInfo.pricingType === "per bunch"
                            ? "Per Bunch"
                            : row.unitInfo.pricingType === "per ounce"
                            ? "Per Ounce"
                            : "Unknown"}
                        </Typography>
                        {row.unitInfo.text !== "Unknown unit" && (
                          <Typography variant="caption" color="text.secondary">
                            ({row.unitInfo.text})
                          </Typography>
                        )}
                      </Box>
                    </Tooltip>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {row.productName ? (
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: "medium" }}>
                        {row.productName}
                      </Typography>
                      {row.unitInfo && row.unitInfo.text !== "Unknown unit" && (
                        <Typography variant="caption" color="text.secondary">
                          Size: {row.unitInfo.text}
                        </Typography>
                      )}
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      No product details
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {row.stores.length > 0 ? (
                    <Box>
                      {row.stores.map((store, index) => (
                        <Chip
                          key={index}
                          label={store}
                          size="small"
                          color="primary"
                          sx={{
                            mb: 0.5,
                            mr: 0.5,
                            fontWeight: "medium",
                          }}
                        />
                      ))}
                    </Box>
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
