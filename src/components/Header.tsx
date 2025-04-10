import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";

const Header = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <AppBar
      position="fixed"
      elevation={1}
      sx={{
        backgroundColor: "background.paper",
        backdropFilter: "blur(20px)",
        background: "rgba(255, 255, 255, 0.9)",
      }}
    >
      <Toolbar>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <LocalOfferIcon
            sx={{
              color: "primary.main",
              fontSize: isMobile ? 24 : 28,
            }}
          />
          <Typography
            variant={isMobile ? "h6" : "h5"}
            component="div"
            sx={{
              background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
              fontWeight: 700,
              letterSpacing: "-0.5px",
            }}
          >
            Shop Cheeply
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
