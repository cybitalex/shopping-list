#!/bin/bash

echo "🔄 Switching to reverse proxy setup..."

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
echo "🛑 Step 1: Stop current failing containers..."
$DOCKER_COMPOSE -f docker-compose.yml down 2>/dev/null || true

# Force stop containers that might be stuck
docker stop shopping-list-frontend shopping-list-backend certbot 2>/dev/null || true
docker rm shopping-list-frontend shopping-list-backend certbot 2>/dev/null || true

# Also clean up any existing nginx-proxy containers
docker stop nginx-proxy letsencrypt 2>/dev/null || true
docker rm nginx-proxy letsencrypt 2>/dev/null || true

echo ""
echo "🧹 Step 2: Clean up ports..."
sudo fuser -k 80/tcp 443/tcp 2>/dev/null || true

echo ""
echo "📋 Step 3: Show current nginx.simple.conf (what we'll use)..."
echo "This config only handles HTTP - the reverse proxy will handle HTTPS:"
head -10 nginx.simple.conf

echo ""
echo "🚀 Step 4: Start reverse proxy setup..."
$DOCKER_COMPOSE -f docker-compose.proxy.yml up -d

echo ""
echo "⏳ Step 5: Wait for services to initialize..."
sleep 20

echo ""
echo "📊 Step 6: Check container status..."
$DOCKER_COMPOSE -f docker-compose.proxy.yml ps

echo ""
echo "🧪 Step 7: Check frontend container logs..."
docker logs shopping-list-frontend --tail 5

echo ""
echo "🧪 Step 8: Test connectivity..."
echo "Testing HTTP..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://cheeply.duckdns.org || echo "000")
echo "HTTP Status: $HTTP_STATUS"

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "302" ]; then
    echo "✅ HTTP working!"
    
    echo "Testing HTTPS (may take a few minutes for SSL cert generation)..."
    HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://cheeply.duckdns.org || echo "000")
    echo "HTTPS Status: $HTTPS_STATUS"
    
    if [ "$HTTPS_STATUS" = "200" ]; then
        echo "🎉 SUCCESS! Both HTTP and HTTPS working!"
        echo "✅ Your app: https://cheeply.duckdns.org"
        echo "✅ Geolocation should now work!"
    else
        echo "⏳ HTTP working, HTTPS still setting up..."
        echo "🌐 Visit: http://cheeply.duckdns.org"
        echo "⏰ HTTPS may take 2-5 minutes for SSL cert generation"
    fi
else
    echo "⚠️ Services may still be starting..."
    echo "Check logs: $DOCKER_COMPOSE -f docker-compose.proxy.yml logs"
fi

echo ""
echo "📝 Quick status commands:"
echo "   All logs: $DOCKER_COMPOSE -f docker-compose.proxy.yml logs -f"
echo "   nginx-proxy logs: docker logs nginx-proxy"
echo "   letsencrypt logs: docker logs letsencrypt"
echo "   Frontend logs: docker logs shopping-list-frontend"

echo ""
echo "🎯 The reverse proxy will:"
echo "   ✅ Handle all SSL certificate management automatically"
echo "   ✅ Redirect HTTP to HTTPS"
echo "   ✅ Proxy requests to your app containers"
echo "   ✅ Fix the geolocation error (HTTPS required)"
