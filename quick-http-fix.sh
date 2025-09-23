#!/bin/bash

echo "🚀 Quick HTTP-only fix for immediate access..."

# Function to detect docker-compose command
get_docker_compose_cmd() {
    if command -v docker-compose &> /dev/null; then
        echo "docker-compose"
    elif docker compose version &> /dev/null; then
        echo "docker compose"
    else
        echo "ERROR: Neither docker-compose nor docker compose found"
        exit 1
    fi
}

DOCKER_COMPOSE=$(get_docker_compose_cmd)
echo "Using: $DOCKER_COMPOSE"

echo ""
echo "🛑 Step 1: Stop reverse proxy containers..."
$DOCKER_COMPOSE -f docker-compose.proxy.yml down

echo ""
echo "🧹 Step 2: Clean up..."
docker stop nginx-proxy letsencrypt 2>/dev/null || true
docker rm nginx-proxy letsencrypt 2>/dev/null || true

echo ""
echo "📝 Step 3: Create simple HTTP-only compose file..."
cat > docker-compose.simple.yml << 'EOF'
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        - NODE_ENV=production
        - VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}
        - VITE_GOOGLE_MAPS_ID=${VITE_GOOGLE_MAPS_ID}
        - VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN}
    container_name: shopping-list-frontend
    restart: unless-stopped
    networks:
      - app-network
    volumes:
      - ./nginx.simple.conf:/etc/nginx/conf.d/default.conf
    ports:
      - "80:80"
    environment:
      - NODE_ENV=production
    depends_on:
      - backend
    env_file:
      - .env.production

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    container_name: shopping-list-backend
    restart: unless-stopped
    networks:
      - app-network
    env_file:
      - .env.production
    environment:
      - NODE_ENV=production
      - PORT=3000
      - GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY}
      - SERPER_API_KEY=${SERPER_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - MAPBOX_TOKEN=${MAPBOX_TOKEN}
      - ZENSERP_API_KEY=${ZENSERP_API_KEY:-}
      - ENABLE_PLAYWRIGHT=false
      - ENABLE_AI_EXTRACTION=false
      - USE_GOOGLE_SEARCH=false
      - PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
      - PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
      - CORS_ORIGIN=http://cheeply.duckdns.org
    volumes:
      - ./:/app
      - /app/node_modules

networks:
  app-network:
    driver: bridge
EOF

echo ""
echo "🚀 Step 4: Start simple HTTP-only setup..."
$DOCKER_COMPOSE -f docker-compose.simple.yml up -d

echo ""
echo "⏳ Step 5: Wait for services to start..."
sleep 15

echo ""
echo "📊 Step 6: Check container status..."
$DOCKER_COMPOSE -f docker-compose.simple.yml ps

echo ""
echo "🧪 Step 7: Test HTTP access..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://cheeply.duckdns.org || echo "000")
echo "HTTP Status: $HTTP_STATUS"

if [ "$HTTP_STATUS" = "200" ]; then
    echo ""
    echo "🎉 SUCCESS! Your app is now accessible via HTTP!"
    echo "🌐 Visit: http://cheeply.duckdns.org"
    echo ""
    echo "⚠️ Note: Geolocation will show a warning because it's HTTP (not HTTPS)"
    echo "   But the app will be fully functional for testing!"
    echo ""
    echo "🔧 To enable HTTPS later, run: ./fix-ssl-domain.sh"
else
    echo "❌ HTTP test failed. Status: $HTTP_STATUS"
    echo "🔧 Check logs: $DOCKER_COMPOSE -f docker-compose.simple.yml logs"
fi

echo ""
echo "📝 Management commands:"
echo "   View logs: $DOCKER_COMPOSE -f docker-compose.simple.yml logs -f"
echo "   Restart: $DOCKER_COMPOSE -f docker-compose.simple.yml restart"
echo "   Stop: $DOCKER_COMPOSE -f docker-compose.simple.yml down"
