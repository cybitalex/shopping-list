#!/bin/bash

echo "Starting Shopping List App in test mode with Google Shopping enabled..."
echo "This will enable Playwright for location-based shopping searches"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy .env.example to .env and fill in your API keys:"
    echo "  cp .env.example .env"
    echo ""
    echo "Required API keys:"
    echo "  - GOOGLE_MAPS_API_KEY"
    echo "  - MAPBOX_TOKEN"
    echo "  - OPENAI_API_KEY (optional)"
    exit 1
fi

# Stop any existing containers
echo "🛑 Stopping any existing containers..."
docker compose -f docker-compose.test.yml down

# Remove old images to ensure fresh build
echo "🗑️  Removing old images..."
docker rmi shopping-list-backend-test shopping-list-frontend-test 2>/dev/null || true

# Build and start containers
echo "🔨 Building and starting containers..."
docker compose -f docker-compose.test.yml up --build

echo ""
echo "🎉 App should be available at:"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:3000"
echo ""
echo "To stop the containers, press Ctrl+C or run:"
echo "   docker compose -f docker-compose.test.yml down" 