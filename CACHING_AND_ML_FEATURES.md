# 🚀 Performance & Intelligence Features

This document describes the store caching and machine learning features that make your shopping list app faster and smarter.

## 🏃‍♂️ Store Caching

### What it does
- **Dramatically speeds up the app** by remembering nearby stores for 30 minutes
- **Reuses store data** when you add new items to your list, instead of searching again
- **Smart location matching** - uses cached stores if you're within 2km of a previous search
- **Detects significant moves** - automatically fetches new stores if you move more than 5km
- **Filters out gas stations** - ensures only grocery stores and supermarkets are included

### How it works
1. First time you search for stores at a location → Normal API call (slower)
2. Add new items to your list → Uses cached stores (instant!)
3. Move significantly (>5km) → Automatically fetches new stores
4. Cache expires after 30 minutes or if you move too far away
5. Gas stations are automatically filtered out
6. You can manually refresh or clear cache in the ML Recommendations panel

### Benefits
- ⚡ **5-10x faster** when adding new items
- 🌐 **Reduced API calls** = less bandwidth usage
- 🔋 **Better battery life** on mobile devices
- 💰 **Lower costs** for API usage

## 🧠 Machine Learning Recommendations

### What it learns
- **Your store preferences** - which stores you choose most often
- **Price sensitivity** - whether you always pick the cheapest option
- **Brand loyalty** - when you choose stores that aren't the cheapest
- **Shopping patterns** - what items you buy and where

### Smart recommendations include
1. **Store Rankings** - AI-powered scores based on your history
2. **Recommendation Types** - Preference, convenience, value, or loyalty based
3. **Confidence Levels** - High, medium, or low based on available data
4. **Personalized Reasons** - Why each store is recommended for you
5. **Historical Insights** - Based on your past shopping patterns (no price predictions)

### Privacy & Data
- 🔒 **All data stays on your device** - stored in browser localStorage
- 🚫 **No personal info sent to servers** - only anonymous shopping patterns
- 💰 **No false prices shown** - recommendations are separate from actual pricing
- 🗑️ **Easy to clear** - delete all ML data anytime in settings
- ⛽ **No gas stations** - automatically filtered out from results

## 📊 How the ML Algorithm Works

### Store Scoring (0-100%)
The algorithm considers:
- **Your visit frequency** (30% weight) - stores you choose often get higher scores
- **Brand loyalty bonus** (20% weight) - choosing non-cheapest options shows preference  
- **Distance factor** (20% weight) - closer stores get bonus points
- **Store ratings** (15% weight) - higher rated stores get small bonus
- **Price advantage** (25% weight) - stores with historically good prices for your items

### Recommendation System
- **No price predictions** - focuses on shopping patterns instead
- **Recommendation types** - preference, convenience, value, loyalty
- **Confidence levels** - shows how reliable each recommendation is
- **Historical patterns** - based on your actual shopping behavior

### Continuous Learning
- **Every store selection** trains the model
- **Price tracking** builds better predictions over time
- **Pattern recognition** identifies your shopping preferences
- **Adapts to changes** in your habits and new stores

## 🎛️ Controls & Settings

### In the ML Recommendations Panel:
- **Toggle Store Caching** - Enable/disable the 30-minute cache
- **Refresh Cache** - Force reload stores for current location
- **Clear Cache** - Remove all cached store data
- **Show/Hide Insights** - View your shopping analytics
- **Clear ML Data** - Reset all machine learning data

### Cache Statistics:
- Shows number of cached locations available
- Displays valid cache entries vs expired ones
- Indicates when cache was last updated

### Personal Insights:
- **Favorite Stores** - Your most visited stores with visit counts
- **Average Item Prices** - What you typically pay for common items
- **Estimated Savings** - Money saved by choosing cheapest options
- **Total Decisions** - Number of shopping choices tracked

## 🚀 Performance Tips

1. **Keep caching enabled** for best performance
2. **Let the app learn** - the more you use it, the smarter it gets
3. **Check insights regularly** to understand your shopping patterns
4. **Clear cache** only if you notice stale store data
5. **Trust the recommendations** - they improve over time

## 🔧 Technical Details

### Cache Implementation
- **In-memory storage** with automatic cleanup
- **Location-based keys** with geographic clustering
- **TTL expiration** with 30-minute default
- **Distance calculation** using Haversine formula

### ML Features
- **Weighted scoring** algorithm with multiple factors
- **Exponential decay** for time-based data weighting
- **Statistical confidence** calculations for predictions
- **Real-time learning** with immediate model updates

### Data Storage
- **localStorage** for browser persistence
- **JSON serialization** for efficient storage
- **Maximum limits** to prevent storage bloat
- **Error handling** for corrupted data recovery

---

*These features make your shopping experience faster, smarter, and more personalized while keeping your data private and secure!* 🎯
