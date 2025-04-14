# Shop Cheeply - Grocery Price Comparison App

A full-stack application to compare grocery prices across multiple stores in your area, helping you save money on your shopping trips.

## Features

- **Price Comparison**: Compare prices for grocery items across multiple stores.
- **Interactive Map**: View store locations with interactive markers. The cheapest store is highlighted with a pulsing effect.
- **Multi-tier Price Fetching**:
  - SerpAPI for verified online prices
  - AI-powered extraction from HTML (using OpenAI)
  - Fallback to local price estimates database
- **Best Price Indicators**: Items with the lowest price across all stores are highlighted with a "Best Price" badge.
- **Mobile-Friendly**: Responsive design works on all devices.

## Setup

### Prerequisites

- Node.js (v16+)
- npm or yarn
- API keys:
  - SerpAPI
  - Google Maps API or Mapbox
  - OpenAI (optional for AI extraction)

### Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd shopping-list
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Install Playwright browsers for web scraping (optional):
   ```
   npm run install-browsers
   ```

4. Create a `.env` file based on the `.env.example` with your API keys:
   ```
   SERPAPI_KEY=your_serpapi_key
   GOOGLE_MAPS_API_KEY=your_google_maps_key
   OPENAI_API_KEY=your_openai_key
   MAPBOX_TOKEN=your_mapbox_token
   
   # Feature flags
   ENABLE_AI_EXTRACTION=true
   ENABLE_PLAYWRIGHT=true
   ```

5. Start the development server:
   ```
   npm run dev:all
   ```

6. Open http://localhost:5173 in your browser

## Architecture

### Frontend

- React with TypeScript
- Material UI for components
- Leaflet for mapping
- Custom components for price comparison and shopping list

### Backend

- Node.js with Express
- Endpoints:
  - `/api/stores` - Find nearby grocery stores
  - `/api/fetch-price` - Get prices for items at specific stores
  - `/api/compare` - Compare prices across stores

### Price Fetching Pipeline

1. **Primary Source**: SerpAPI search for verified online prices
2. **Secondary Source**: OpenAI + Playwright for extracting prices from web pages
3. **Fallback**: Local database of estimated prices for common items

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
