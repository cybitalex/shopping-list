# Testing Guide: Google Shopping Location-Based Search

This guide will help you test the shopping list app's Google Shopping integration with location-based searches.

## Prerequisites

1. **Docker & Docker Compose installed**
2. **Required API Keys in .env file:**
   - `GOOGLE_MAPS_API_KEY`: For location services and map display
   - `MAPBOX_TOKEN`: For map visualization
   - `OPENAI_API_KEY`: Optional, for AI-enhanced product matching

## Quick Start

### Option 1: Using Docker Compose (Recommended for Testing)

```bash
# 1. Start the app in test mode with Google Shopping enabled
./test-docker.sh

# 2. Access the app at:
# Frontend: http://localhost:5173
# Backend API: http://localhost:3000
```

### Option 2: Manual Docker Compose

```bash
# Build and start with Google Shopping enabled
docker compose -f docker-compose.test.yml up --build

# Stop the containers
docker compose -f docker-compose.test.yml down
```

### Option 3: Local Development (No Docker)

```bash
# Terminal 1 - Backend with Google Shopping enabled
ENABLE_PLAYWRIGHT=true ENABLE_AI_EXTRACTION=true USE_GOOGLE_SEARCH=true npm run backend

# Terminal 2 - Frontend
npm run dev
```

## Testing Location-Based Shopping

### Test Case 1: Current Location Search

1. **Open the app** at http://localhost:5173
2. **Add items to your shopping list** (e.g., "apples", "milk", "bread")
3. **Click "Use Current Location"** when prompted
4. **Wait for stores to load** - you should see stores actually near your current location
5. **Verify the stores are real** nearby grocery stores, not hardcoded ones

### Test Case 2: Zip Code Search

1. **Add items to your shopping list**
2. **Enter a zip code** in a different city (e.g., "90210" for Beverly Hills, "10001" for NYC)
3. **Click search**
4. **Verify stores appear** that are actually in that area
5. **Check that distances make sense** for the chosen location

### Test Case 3: Multiple Items Search

1. **Add multiple diverse items:**
   - Fresh produce: "apples", "bananas"
   - Dairy: "milk", "cheese"
   - Meat: "chicken breast", "ground turkey"
   - Pantry: "rice", "pasta"
2. **Search by location**
3. **Verify each store shows** relevant items with prices
4. **Check store comparison** functionality

## What to Look For

### ✅ Expected Behavior

- **Real Stores**: Only actual grocery stores near the specified location
- **Accurate Distances**: Distance calculations that make geographic sense
- **Real Products**: Product names and prices from actual Google Shopping results
- **Location Consistency**: Different zip codes should show different stores
- **Price Variety**: Prices should vary between stores and products

### ❌ Issues to Watch For

- **Hardcoded Stores**: If you see the same 5 stores regardless of location
- **Impossible Distances**: Stores showing as 0.01 miles or 999+ miles away
- **Generic Product Names**: All products named exactly as you typed them
- **Same Prices**: All items having identical prices across stores
- **Location Mismatch**: NYC zip code showing North Carolina stores

## Debugging

### Check Backend Logs

```bash
# If using Docker
docker compose -f docker-compose.test.yml logs backend

# Look for these log messages:
# ✅ "Searching for stores near: [latitude], [longitude]"
# ✅ "Results for [item]: Success, Stores: [number]"
# ✅ "Final stores being returned to client based on coordinates"
# ❌ "Skipping store [name] - missing required data or distance"
# ❌ "Error searching for [item]"
```

### Test Backend API Directly

```bash
# Test store search endpoint
curl "http://localhost:3000/api/stores?latitude=40.7128&longitude=-74.0060&items=%5B%22apples%22%2C%22milk%22%5D"

# Test individual price lookup
curl "http://localhost:3000/api/google-price?item=apples&store=walmart"
```

### Browser Developer Tools

1. **Open Network tab** before searching
2. **Look for API calls** to `/api/stores`
3. **Check the response** - should contain stores with real distances
4. **Verify coordinates** are being passed correctly

## Common Issues & Solutions

### Issue: All stores show same location

**Solution**: Check that coordinates are being passed to the scraper correctly

### Issue: No stores found

**Solution**:

- Verify Google Shopping is accessible
- Check that Playwright is enabled (`ENABLE_PLAYWRIGHT=true`)
- Ensure Chrome/Chromium is installed in Docker container

### Issue: Generic prices only

**Solution**: Check scraper.js is actually running and not falling back to estimates

### Issue: Location not updating

**Solution**:

- Clear browser location cache
- Check browser location permissions
- Verify Google Maps API key is valid

## Environment Variables for Testing

The test configuration uses these key settings:

```env
ENABLE_PLAYWRIGHT=true
ENABLE_AI_EXTRACTION=true
USE_GOOGLE_SEARCH=true
PLAYWRIGHT_HEADLESS=true
```

## Success Criteria

The app passes testing if:

1. ✅ **Different locations return different stores**
2. ✅ **Store distances are geographically accurate**
3. ✅ **Product prices come from real Google Shopping results**
4. ✅ **Store names match actual businesses**
5. ✅ **No hardcoded store fallbacks are used**
6. ✅ **Zip code searches work for various US locations**

## Performance Notes

- Initial search may take 30-60 seconds as Playwright scrapes Google Shopping
- Subsequent searches for the same location should be faster
- Each item requires a separate Google Shopping search
- Docker builds may take a few minutes on first run
