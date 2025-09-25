import {
  AppBar,
  Toolbar,
  Box,
  Typography,
  useTheme,
  useMediaQuery,
  alpha,
} from "@mui/material";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";

const Header = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        backgroundColor: alpha(theme.palette.background.paper, 0.8),
        backdropFilter: "blur(20px)",
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        color: theme.palette.text.primary,
      }}
    >
      <Toolbar sx={{ 
        minHeight: { xs: '64px', sm: '72px' },
        px: { xs: 2, sm: 3 }
      }}>
        <Box sx={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center", 
          width: "100%",
          gap: 2
        }}>
          <Box sx={{ 
            display: "flex", 
            alignItems: "center", 
            gap: 1.5,
            p: 1,
            borderRadius: 2,
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
          }}>
            <ShoppingCartIcon 
              sx={{ 
                fontSize: isMobile ? 28 : 32,
                color: theme.palette.primary.main
              }} 
            />
            <Typography
              variant={isMobile ? "h5" : "h4"}
              sx={{
                fontWeight: 700,
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.025em",
              }}
            >
              Shop Cheeply
            </Typography>
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
