#!/bin/bash

echo "🔄 Setting up reverse proxy with automatic SSL..."

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
echo "🛑 Step 1: Stop existing containers..."
$DOCKER_COMPOSE -f docker-compose.yml down 2>/dev/null || true

# Also stop any containers that might be using ports 80/443
docker stop nginx-proxy letsencrypt shopping-list-frontend shopping-list-backend certbot 2>/dev/null || true
docker rm nginx-proxy letsencrypt 2>/dev/null || true

echo ""
echo "🧹 Step 2: Clean up old SSL setup..."
sudo rm -rf certbot/ 2>/dev/null || true

echo ""
echo "📁 Step 3: Create required directories..."
mkdir -p logs

echo ""
echo "🚀 Step 4: Start reverse proxy setup..."
$DOCKER_COMPOSE -f docker-compose.proxy.yml up -d

echo ""
echo "⏳ Step 5: Wait for services to start..."
echo "This may take a few minutes for SSL certificates to be generated..."
sleep 30

echo ""
echo "📊 Step 6: Check container status..."
$DOCKER_COMPOSE -f docker-compose.proxy.yml ps

echo ""
echo "🧪 Step 7: Test connectivity..."

echo "Testing HTTP (should redirect to HTTPS)..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://cheeply.duckdns.org || echo "000")
echo "HTTP Status: $HTTP_STATUS"

echo "Testing HTTPS..."
HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://cheeply.duckdns.org || echo "000")
echo "HTTPS Status: $HTTPS_STATUS"

echo ""
if [ "$HTTPS_STATUS" = "200" ]; then
    echo "🎉 SUCCESS! Your app is running with automatic SSL!"
    echo "✅ Visit: https://cheeply.duckdns.org"
    echo "✅ Geolocation should now work!"
elif [ "$HTTP_STATUS" = "200" ]; then
    echo "⏳ HTTP working, HTTPS may still be setting up..."
    echo "🌐 Visit: http://cheeply.duckdns.org (will redirect to HTTPS when ready)"
    echo "⏰ SSL certificates can take up to 5 minutes to generate"
else
    echo "⚠️ Services may still be starting up..."
    echo "🔧 Check logs: $DOCKER_COMPOSE -f docker-compose.proxy.yml logs"
fi

echo ""
echo "📝 Useful commands:"
echo "   View logs: $DOCKER_COMPOSE -f docker-compose.proxy.yml logs -f"
echo "   Restart: $DOCKER_COMPOSE -f docker-compose.proxy.yml restart"
echo "   Stop: $DOCKER_COMPOSE -f docker-compose.proxy.yml down"

echo ""
echo "🔍 SSL Certificate status:"
echo "   Check nginx-proxy logs: docker logs nginx-proxy"
echo "   Check letsencrypt logs: docker logs letsencrypt"

echo ""
echo "🎯 This setup provides:"
echo "   ✅ Automatic SSL certificate generation and renewal"
echo "   ✅ HTTP to HTTPS redirect"
echo "   ✅ Reverse proxy to your app containers"
echo "   ✅ Zero manual SSL configuration needed"
