import React, { useState } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  TextField,
  Paper,
  Divider,
  Chip,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import StoreIcon from "@mui/icons-material/Store";
import type { GroceryItem } from "../App";

interface Store {
  name: string;
  items: Array<{
    name: string;
    price: number | null;
    productName?: string;
  }>;
}

interface GroceryListProps {
  items: Array<{ id: string; name: string }>;
  onRemoveItem: (id: string) => void;
  onAddItem: (name: string) => void;
  stores?: Store[];
}

const GroceryList: React.FC<GroceryListProps> = ({
  items,
  onAddItem,
  onRemoveItem,
  stores = [],
}) => {
  const [newItem, setNewItem] = useState("");

  // Function to find the cheapest price for an item across all stores
  const findCheapestPrice = (itemName: string) => {
    let cheapestPrice: number | null = null;
    let cheapestStore: string | null = null;

    stores.forEach((store) => {
      const found = store.items.find(
        (item) => item.name.toLowerCase() === itemName.toLowerCase() && item.price !== null
      );
      if (found && found.price !== null) {
        if (cheapestPrice === null || found.price < cheapestPrice) {
          cheapestPrice = found.price;
          cheapestStore = store.name;
        }
      }
    });

    return {
      price: cheapestPrice,
      store: cheapestStore,
    };
  };

  const handleAddItem = () => {
    if (newItem.trim()) {
      onAddItem(newItem.trim());
      setNewItem("");
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      handleAddItem();
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 500, mb: 2 }}>
        Shopping List
      </Typography>

      <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Add an item..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <IconButton
          onClick={handleAddItem}
          sx={{
            bgcolor: "action.hover",
            "&:hover": { bgcolor: "action.selected" },
          }}
        >
          <AddIcon />
        </IconButton>
      </Box>

      {items.length === 0 ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ textAlign: "center", py: 4 }}
        >
          Add items to your shopping list
        </Typography>
      ) : (
        <List sx={{ py: 0 }}>
          {items.map((item, index) => {
            const cheapest = findCheapestPrice(item.name);
            return (
              <React.Fragment key={item.id}>
                {index > 0 && <Divider />}
                <ListItem
                  disableGutters
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => onRemoveItem(item.id)}
                      sx={{ color: "error.light" }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography sx={{ fontWeight: 500 }}>
                          {item.name}
                        </Typography>
                        {cheapest.price !== null && cheapest.store && (
                          <Chip
                            icon={<StoreIcon />}
                            label={`$${cheapest.price.toFixed(2)} at ${cheapest.store}`}
                            size="small"
                            color="success"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              </React.Fragment>
            );
          })}
        </List>
      )}
    </Box>
  );
};

export default GroceryList;
