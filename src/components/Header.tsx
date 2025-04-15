import {
  AppBar,
  Toolbar,
  Box,
  useTheme,
  useMediaQuery,
} from "@mui/material";

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
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
          <img 
            src="/shop_cheeply_logo.png" 
            alt="Shop Cheeply"
            style={{
              height: isMobile ? '40px' : '50px',
              width: 'auto'
            }}
          />
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
