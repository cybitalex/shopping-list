#!/bin/bash

echo "🚀 Fixing all remaining issues for cheeply.duckdns.org..."

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
echo "🔧 Step 1: Rebuild backend with fixed server.cjs..."
$DOCKER_COMPOSE build backend

echo ""
echo "🔄 Step 2: Restart backend..."
$DOCKER_COMPOSE restart backend

echo ""
echo "⏳ Step 3: Wait for backend to restart..."
sleep 15

echo ""
echo "🧪 Step 4: Test backend (should not show static file errors)..."
$DOCKER_COMPOSE logs backend --tail 10

echo ""
echo "🔐 Step 5: Set up SSL certificates..."

# Create required directories
mkdir -p certbot/www/.well-known/acme-challenge
chmod 755 certbot/www
chmod 755 certbot/www/.well-known
chmod 755 certbot/www/.well-known/acme-challenge

# Remove old certificates if they exist
if [ -d "certbot/conf/live/cheeply.duckdns.org" ]; then
    echo "Removing old certificates..."
    rm -rf certbot/conf/live/cheeply.duckdns.org
    rm -rf certbot/conf/renewal/cheeply.duckdns.org.conf
    rm -rf certbot/conf/archive/cheeply.duckdns.org
fi

# Get SSL certificate using certbot container
echo "🔐 Requesting SSL certificate from Let's Encrypt..."
$DOCKER_COMPOSE exec -T certbot certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email alex.cybitdevs@gmail.com \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    --non-interactive \
    -d cheeply.duckdns.org

if [ $? -eq 0 ]; then
    echo "✅ SSL certificate obtained successfully!"
else
    echo "❌ SSL certificate request failed. Trying alternative method..."
    
    # Alternative: Stop frontend, use temporary server, get cert, restart
    echo "Using standalone method..."
    $DOCKER_COMPOSE stop frontend
    
    # Wait a moment
    sleep 5
    
    # Use standalone method
    $DOCKER_COMPOSE run --rm --service-ports certbot certbot certonly \
        --standalone \
        --email alex.cybitdevs@gmail.com \
        --agree-tos \
        --no-eff-email \
        --force-renewal \
        --non-interactive \
        -d cheeply.duckdns.org
    
    # Restart frontend
    $DOCKER_COMPOSE start frontend
fi

echo ""
echo "🔄 Step 6: Restart frontend to use SSL certificates..."
$DOCKER_COMPOSE restart frontend

echo ""
echo "⏳ Step 7: Wait for services to fully start..."
sleep 20

echo ""
echo "🧪 Step 8: Test all endpoints..."

echo "Testing HTTP..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://cheeply.duckdns.org || echo "000")
echo "HTTP Status: $HTTP_STATUS"

echo "Testing HTTPS..."
HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://cheeply.duckdns.org || echo "000")
echo "HTTPS Status: $HTTPS_STATUS"

echo "Testing Mapbox API..."
MAPBOX_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://cheeply.duckdns.org/api/mapbox-token || echo "000")
echo "Mapbox API Status: $MAPBOX_STATUS"

echo ""
echo "📊 Step 9: Container status..."
$DOCKER_COMPOSE ps

echo ""
echo "🎉 Fix complete!"
echo ""
if [ "$HTTPS_STATUS" = "200" ]; then
    echo "✅ Your app is now running with HTTPS!"
    echo "🌐 Access your app: https://cheeply.duckdns.org"
    echo "🗺️ Geolocation should now work (requires HTTPS)"
else
    echo "⚠️ HTTPS not fully working yet, but HTTP is available:"
    echo "🌐 HTTP: http://cheeply.duckdns.org"
    echo "🔧 Check SSL certificate status with: $DOCKER_COMPOSE logs certbot"
fi

echo ""
echo "🔍 If you need to troubleshoot:"
echo "   Backend logs: $DOCKER_COMPOSE logs backend"
echo "   Frontend logs: $DOCKER_COMPOSE logs frontend"
echo "   SSL logs: $DOCKER_COMPOSE logs certbot"
