import { AppBar, Toolbar, Typography, Box } from "@mui/material";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";

const Header = () => {
  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        backgroundColor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <Toolbar>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <ShoppingCartIcon sx={{ color: "primary.main" }} />
          <Typography
            variant="h6"
            component="div"
            sx={{ color: "text.primary", fontWeight: 600 }}
          >
            Smart Grocery Finder
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
