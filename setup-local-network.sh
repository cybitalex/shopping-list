#!/bin/bash

echo "📱 Setting up local network access for your phone..."

# Get the local IP address
get_local_ip() {
    # Try different methods to get local IP
    LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' 2>/dev/null)
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(ifconfig 2>/dev/null | grep -E 'inet.*192\.168\.|inet.*10\.|inet.*172\.' | head -1 | awk '{print $2}' | sed 's/addr://')
    fi
    echo "$LOCAL_IP"
}

LOCAL_IP=$(get_local_ip)

echo ""
echo "🌐 Your server's local IP address: $LOCAL_IP"

if [ -z "$LOCAL_IP" ]; then
    echo "❌ Could not detect local IP address"
    echo "🔧 Please run: ip addr show or ifconfig"
    echo "   Look for 192.168.x.x, 10.x.x.x, or 172.x.x.x"
    exit 1
fi

echo ""
echo "📋 Option 1: Use Existing Production Setup"
echo "=========================================="
echo "Your app is already running and accessible at:"
echo "   🌐 http://$LOCAL_IP (if port 80 is exposed)"
echo "   🌐 http://$LOCAL_IP:3000 (if you run development mode)"

echo ""
echo "📋 Option 2: Development Mode (Recommended for local testing)"
echo "============================================================="

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

echo "1️⃣ Stop production containers:"
echo "   $DOCKER_COMPOSE -f docker-compose.proxy.yml down"

echo ""
echo "2️⃣ Create local development setup..."

# Create a local development docker-compose file
cat > docker-compose.local.yml << EOF
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        - NODE_ENV=development
        - VITE_GOOGLE_MAPS_API_KEY=\${VITE_GOOGLE_MAPS_API_KEY}
        - VITE_GOOGLE_MAPS_ID=\${VITE_GOOGLE_MAPS_ID}
        - VITE_MAPBOX_TOKEN=\${VITE_MAPBOX_TOKEN}
    container_name: shopping-list-frontend-local
    restart: unless-stopped
    networks:
      - app-network
    volumes:
      - ./nginx.simple.conf:/etc/nginx/conf.d/default.conf
    ports:
      - "80:80"
      - "3000:80"
    environment:
      - NODE_ENV=development
    depends_on:
      - backend
    env_file:
      - .env

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    container_name: shopping-list-backend-local
    restart: unless-stopped
    networks:
      - app-network
    env_file:
      - .env
    environment:
      - NODE_ENV=development
      - PORT=3000
      - GOOGLE_MAPS_API_KEY=\${GOOGLE_MAPS_API_KEY}
      - SERPER_API_KEY=\${SERPER_API_KEY}
      - OPENAI_API_KEY=\${OPENAI_API_KEY}
      - MAPBOX_TOKEN=\${MAPBOX_TOKEN}
      - ZENSERP_API_KEY=\${ZENSERP_API_KEY:-}
      - ENABLE_PLAYWRIGHT=false
      - ENABLE_AI_EXTRACTION=false
      - USE_GOOGLE_SEARCH=false
      - PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
      - PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
      - CORS_ORIGIN=http://$LOCAL_IP:3000,http://$LOCAL_IP,http://localhost:3000,http://localhost
    volumes:
      - ./:/app
      - /app/node_modules
    ports:
      - "3001:3000"

networks:
  app-network:
    driver: bridge
EOF

echo "✅ Created docker-compose.local.yml"

echo ""
echo "3️⃣ Start local development setup:"
echo "   $DOCKER_COMPOSE -f docker-compose.local.yml up -d"

echo ""
echo "📋 Option 3: Simple Node.js Development Server"
echo "=============================================="
echo "For the fastest setup (if you have Node.js locally):"
echo ""
echo "1️⃣ Install dependencies:"
echo "   npm install"
echo ""
echo "2️⃣ Start development servers:"
echo "   # Terminal 1 - Frontend"
echo "   npm run dev -- --host 0.0.0.0 --port 3000"
echo ""
echo "   # Terminal 2 - Backend"
echo "   npm run backend"

echo ""
echo "🔥 Firewall Setup"
echo "================="
echo "Make sure your firewall allows connections:"
echo "   sudo ufw allow 3000"
echo "   sudo ufw allow 80"

echo ""
echo "📱 Phone Access URLs"
echo "==================="
echo "Once setup, access from your phone at:"
echo "   🌐 http://$LOCAL_IP:3000"
echo "   🌐 http://$LOCAL_IP (if using port 80)"

echo ""
echo "🛠️ Quick Setup Commands"
echo "======================="
echo "Run these commands to set up local access:"
echo ""
echo "# Stop production containers"
echo "$DOCKER_COMPOSE -f docker-compose.proxy.yml down"
echo ""
echo "# Start local development"
echo "$DOCKER_COMPOSE -f docker-compose.local.yml up -d"
echo ""
echo "# Check status"
echo "curl http://$LOCAL_IP:3000"

echo ""
echo "📝 Testing from Phone"
echo "===================="
echo "1. Make sure your phone is on the same WiFi network"
echo "2. Open browser on phone"
echo "3. Navigate to: http://$LOCAL_IP:3000"
echo "4. The app should load and work normally!"

echo ""
echo "⚠️ Important Notes"
echo "=================="
echo "- Phone and server must be on same WiFi network"
echo "- Some corporate networks block device-to-device communication"
echo "- If it doesn't work, try: http://$LOCAL_IP, http://$LOCAL_IP:80, or http://$LOCAL_IP:3000"
echo "- Geolocation will work on phones even with HTTP (unlike desktop browsers)"
