import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Button,
  Collapse,
  Grid,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel,
  Alert,
  Divider,
} from "@mui/material";
import {
  Psychology as PsychologyIcon,
  Store as StoreIcon,
  TrendingUp as TrendingUpIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Storage as CacheIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Insights as InsightsIcon,
} from "@mui/icons-material";
import { mlRecommendationService } from "../services/mlRecommendations";
import { storeCacheService } from "../services/storeCache";

interface MLRecommendationsProps {
  recommendations: Array<{
    store: any;
    score: number;
    reasons: string[];
    confidenceLevel: "high" | "medium" | "low";
    recommendationType: "preference" | "convenience" | "value" | "loyalty";
  }>;
  useStoreCaching: boolean;
  onToggleCaching: (enabled: boolean) => void;
  onRefreshCache: () => void;
}

const MLRecommendations: React.FC<MLRecommendationsProps> = ({
  recommendations,
  useStoreCaching,
  onToggleCaching,
  onRefreshCache,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [insights, setInsights] = useState<any>(null);
  const [cacheStats, setCacheStats] = useState<any>(null);

  useEffect(() => {
    // Load user insights
    const userInsights = mlRecommendationService.getUserInsights();
    setInsights(userInsights);

    // Load cache stats
    const stats = storeCacheService.getCacheStats();
    setCacheStats(stats);
  }, []);

  const handleClearMLData = () => {
    if (
      window.confirm(
        "Are you sure you want to clear all machine learning data? This cannot be undone."
      )
    ) {
      mlRecommendationService.clearData();
      const userInsights = mlRecommendationService.getUserInsights();
      setInsights(userInsights);
    }
  };

  const handleClearCache = () => {
    if (window.confirm("Are you sure you want to clear the store cache?")) {
      storeCacheService.clearCache();
      const stats = storeCacheService.getCacheStats();
      setCacheStats(stats);
    }
  };

  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  return (
    <Card sx={{ mb: 3, border: "2px solid", borderColor: "primary.main" }}>
      <CardContent>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <PsychologyIcon color="primary" />
            <Typography
              variant="h6"
              sx={{ fontWeight: "bold", color: "primary.main" }}
            >
              🤖 Smart Recommendations
            </Typography>
            <Chip
              label={`${recommendations.length} suggestions`}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Box>
          <IconButton onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          AI-powered store recommendations based on your shopping history and
          preferences.
          <strong>
            {" "}
            These are suggestions only - always check actual store prices.
          </strong>
        </Typography>

        {/* Top 3 recommendations preview */}
        <Box sx={{ mb: 2 }}>
          {recommendations.slice(0, 3).map((rec, index) => (
            <Box key={index} sx={{ mb: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Chip
                  label={`#${index + 1}`}
                  size="small"
                  color={
                    index === 0 ? "success" : index === 1 ? "warning" : "info"
                  }
                />
                <Typography variant="body2" sx={{ fontWeight: "medium" }}>
                  {rec.store.name}
                </Typography>
                <Chip
                  label={rec.confidenceLevel.toUpperCase()}
                  size="small"
                  color={
                    rec.confidenceLevel === "high"
                      ? "success"
                      : rec.confidenceLevel === "medium"
                      ? "warning"
                      : "default"
                  }
                  variant="outlined"
                />
                <Chip
                  label={rec.recommendationType.toUpperCase().replace("_", " ")}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ ml: 4 }}
              >
                {rec.reasons.slice(0, 2).join(", ")}
                {rec.reasons.length > 2 && "..."}
              </Typography>
            </Box>
          ))}
        </Box>

        <Collapse in={expanded}>
          <Divider sx={{ mb: 3 }} />

          {/* Cache and ML Controls */}
          <Box sx={{ mb: 3 }}>
            <Typography
              variant="h6"
              sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}
            >
              <CacheIcon />
              Performance & Data Settings
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Store Caching
                    </Typography>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={useStoreCaching}
                          onChange={(e) => onToggleCaching(e.target.checked)}
                          color="primary"
                        />
                      }
                      label="Enable store caching"
                    />
                    {cacheStats && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", mt: 1 }}
                      >
                        {cacheStats.validEntries} cached locations available
                      </Typography>
                    )}
                    <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
                      <Button
                        size="small"
                        startIcon={<RefreshIcon />}
                        onClick={onRefreshCache}
                        disabled={!useStoreCaching}
                      >
                        Refresh
                      </Button>
                      <Button
                        size="small"
                        startIcon={<DeleteIcon />}
                        onClick={handleClearCache}
                        color="warning"
                      >
                        Clear Cache
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Machine Learning Data
                    </Typography>
                    {insights && (
                      <>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block" }}
                        >
                          {insights.totalPurchases} shopping decisions tracked
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block" }}
                        >
                          ${Math.abs(insights.savings).toFixed(2)} estimated
                          savings
                        </Typography>
                      </>
                    )}
                    <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
                      <Button
                        size="small"
                        startIcon={<InsightsIcon />}
                        onClick={() => setShowInsights(!showInsights)}
                      >
                        {showInsights ? "Hide" : "Show"} Insights
                      </Button>
                      <Button
                        size="small"
                        startIcon={<DeleteIcon />}
                        onClick={handleClearMLData}
                        color="warning"
                      >
                        Clear Data
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>

          {/* Detailed Recommendations */}
          <Typography
            variant="h6"
            sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}
          >
            <StoreIcon />
            Detailed Recommendations
          </Typography>

          <List>
            {recommendations.map((rec, index) => (
              <ListItem key={index} divider>
                <ListItemIcon>
                  <Chip
                    label={index + 1}
                    size="small"
                    color={
                      index === 0
                        ? "success"
                        : index === 1
                        ? "warning"
                        : "default"
                    }
                  />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="body1" sx={{ fontWeight: "medium" }}>
                        {rec.store.name}
                      </Typography>
                      <Chip
                        label={`${(rec.score * 100).toFixed(0)}% match`}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={rec.recommendationType}
                        size="small"
                        color={
                          rec.recommendationType === "value"
                            ? "success"
                            : rec.recommendationType === "convenience"
                            ? "info"
                            : rec.recommendationType === "loyalty"
                            ? "secondary"
                            : "primary"
                        }
                        variant="outlined"
                      />
                      <Chip
                        label={`${rec.confidenceLevel} confidence`}
                        size="small"
                        color={
                          rec.confidenceLevel === "high"
                            ? "success"
                            : rec.confidenceLevel === "medium"
                            ? "warning"
                            : "default"
                        }
                        variant="outlined"
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {rec.reasons.join(" • ")}
                      </Typography>
                      {rec.store.rating && (
                        <Typography variant="caption" color="text.secondary">
                          Rating: {rec.store.rating.toFixed(1)} stars
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>

          {/* User Insights */}
          {showInsights && insights && (
            <Box sx={{ mt: 3 }}>
              <Typography
                variant="h6"
                sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}
              >
                <TrendingUpIcon />
                Your Shopping Insights
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Favorite Stores
                      </Typography>
                      {insights.favoriteStores.length > 0 ? (
                        insights.favoriteStores.map(
                          (store: any, index: number) => (
                            <Box
                              key={index}
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                mb: 0.5,
                              }}
                            >
                              <Typography variant="body2">
                                {store.name}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {store.visits} visits
                              </Typography>
                            </Box>
                          )
                        )
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          No shopping history yet
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Item Price Averages
                      </Typography>
                      {Object.keys(insights.averageItemPrice).length > 0 ? (
                        Object.entries(insights.averageItemPrice)
                          .slice(0, 5)
                          .map(
                            ([item, price]: [string, any], index: number) => (
                              <Box
                                key={index}
                                sx={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  mb: 0.5,
                                }}
                              >
                                <Typography
                                  variant="body2"
                                  sx={{ textTransform: "capitalize" }}
                                >
                                  {item}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  ${price.toFixed(2)}
                                </Typography>
                              </Box>
                            )
                          )
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          No price history yet
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}
        </Collapse>

        {!expanded && (
          <Alert severity="info" sx={{ mt: 2 }}>
            💡 The app learns from your shopping choices to provide better
            recommendations over time.
            {useStoreCaching && " Store caching enabled for faster searches."}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default MLRecommendations;
