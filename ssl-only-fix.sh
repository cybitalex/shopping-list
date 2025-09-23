#!/bin/bash

echo "🔐 Setting up SSL for cheeply.duckdns.org to fix geolocation..."

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
echo "🔧 Step 1: Ensure certbot container is running..."
$DOCKER_COMPOSE up -d certbot

echo ""
echo "📁 Step 2: Create webroot directory..."
mkdir -p certbot/www/.well-known/acme-challenge
chmod -R 755 certbot/www

echo ""
echo "🗑️ Step 3: Remove old certificates..."
rm -rf certbot/conf/live/cheeply.duckdns.org 2>/dev/null || true
rm -rf certbot/conf/renewal/cheeply.duckdns.org.conf 2>/dev/null || true
rm -rf certbot/conf/archive/cheeply.duckdns.org 2>/dev/null || true

echo ""
echo "🔐 Step 4: Request SSL certificate..."

# Try webroot method first
echo "Trying webroot method..."
$DOCKER_COMPOSE exec -T certbot certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email alex.cybitdevs@gmail.com \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    --non-interactive \
    -d cheeply.duckdns.org

SSL_SUCCESS=$?

if [ $SSL_SUCCESS -ne 0 ]; then
    echo ""
    echo "⚠️ Webroot method failed, trying standalone method..."
    
    # Stop frontend temporarily
    $DOCKER_COMPOSE stop frontend
    sleep 5
    
    # Use standalone method
    $DOCKER_COMPOSE run --rm -p 80:80 certbot certbot certonly \
        --standalone \
        --email alex.cybitdevs@gmail.com \
        --agree-tos \
        --no-eff-email \
        --force-renewal \
        --non-interactive \
        -d cheeply.duckdns.org
    
    # Restart frontend
    $DOCKER_COMPOSE start frontend
    SSL_SUCCESS=$?
fi

echo ""
echo "🔄 Step 5: Restart frontend to load certificates..."
$DOCKER_COMPOSE restart frontend

echo ""
echo "⏳ Step 6: Wait for services..."
sleep 15

echo ""
echo "🧪 Step 7: Test HTTPS..."
HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://cheeply.duckdns.org 2>/dev/null || echo "000")

if [ "$HTTPS_STATUS" = "200" ]; then
    echo "🎉 SUCCESS! HTTPS is working!"
    echo "✅ Your app: https://cheeply.duckdns.org"
    echo "✅ Geolocation should now work!"
elif [ "$HTTPS_STATUS" = "301" ] || [ "$HTTPS_STATUS" = "302" ]; then
    echo "🎉 SSL is working (redirect detected)!"
    echo "✅ Your app: https://cheeply.duckdns.org"
else
    echo "❌ HTTPS Status: $HTTPS_STATUS"
    echo "🔧 Check logs: $DOCKER_COMPOSE logs frontend"
    echo "🔧 Check certs: ls -la certbot/conf/live/"
fi

echo ""
echo "📝 Quick test geolocation by visiting:"
echo "   https://cheeply.duckdns.org"
echo "   (The location error should be gone now)"
