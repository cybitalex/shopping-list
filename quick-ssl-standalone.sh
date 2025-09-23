#!/bin/bash

echo "🚀 Quick SSL fix using standalone method..."

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
echo "🛑 Step 1: Stop frontend to free port 80..."
$DOCKER_COMPOSE stop frontend

echo ""
echo "⏳ Step 2: Wait for port to be free..."
sleep 10

echo ""
echo "🔐 Step 3: Get SSL certificate using standalone method..."
$DOCKER_COMPOSE run --rm --service-ports certbot certbot certonly \
    --standalone \
    --email alex.cybitdevs@gmail.com \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    --non-interactive \
    -d cheeply.duckdns.org

SSL_SUCCESS=$?

echo ""
echo "🔄 Step 4: Start frontend again..."
$DOCKER_COMPOSE start frontend

echo ""
echo "⏳ Step 5: Wait for frontend to start..."
sleep 15

if [ $SSL_SUCCESS -eq 0 ]; then
    echo "✅ SSL certificate obtained successfully!"
    
    echo ""
    echo "🧪 Step 6: Test HTTPS..."
    HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://cheeply.duckdns.org 2>/dev/null || echo "000")
    
    if [ "$HTTPS_STATUS" = "200" ] || [ "$HTTPS_STATUS" = "301" ] || [ "$HTTPS_STATUS" = "302" ]; then
        echo "🎉 SUCCESS! HTTPS is working!"
        echo "✅ Your app: https://cheeply.duckdns.org"
        echo "✅ Geolocation should now work!"
        
        echo ""
        echo "🧪 Testing geolocation fix..."
        echo "The browser location error should be gone now!"
        echo "Visit: https://cheeply.duckdns.org"
    else
        echo "⚠️ HTTPS Status: $HTTPS_STATUS"
        echo "SSL certificate created but HTTPS not working yet"
        echo "Check: $DOCKER_COMPOSE logs frontend"
    fi
else
    echo "❌ SSL certificate creation failed"
    echo "Check: $DOCKER_COMPOSE logs certbot"
fi

echo ""
echo "📊 Container status:"
$DOCKER_COMPOSE ps

echo ""
echo "📝 Certificate files:"
ls -la certbot/conf/live/ 2>/dev/null || echo "No certificates found"
