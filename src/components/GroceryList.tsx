import { useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  TextField,
  Button,
  Box,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import type { GroceryItem } from "../App";

interface GroceryListProps {
  items: GroceryItem[];
  onAddItem: (name: string) => void;
  onDeleteItem: (id: number) => void;
}

const GroceryList = ({ items, onAddItem, onDeleteItem }: GroceryListProps) => {
  const [newItem, setNewItem] = useState("");

  const handleAddItem = () => {
    if (newItem.trim()) {
      onAddItem(newItem);
      setNewItem("");
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      handleAddItem();
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Shopping List
        </Typography>
        <Box sx={{ mb: 2, display: "flex", gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Add an item..."
            variant="outlined"
          />
          <Button
            variant="contained"
            onClick={handleAddItem}
            disabled={!newItem.trim()}
            startIcon={<AddIcon />}
          >
            Add
          </Button>
        </Box>
        <List>
          {items.map((item) => (
            <ListItem
              key={item.id}
              sx={{
                bgcolor: "background.paper",
                borderRadius: 1,
                mb: 1,
                "&:last-child": { mb: 0 },
              }}
            >
              <ListItemText primary={item.name} />
              <ListItemSecondaryAction>
                <IconButton
                  edge="end"
                  aria-label="delete"
                  onClick={() => onDeleteItem(item.id)}
                  size="small"
                >
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
        {items.length === 0 && (
          <Typography color="text.secondary" align="center" sx={{ mt: 2 }}>
            Add items to your shopping list
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default GroceryList;
