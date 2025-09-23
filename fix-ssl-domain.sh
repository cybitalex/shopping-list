#!/bin/bash

echo "🔧 Fixing SSL domain name issue..."

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
echo "🔍 Step 1: Check current container status..."
$DOCKER_COMPOSE -f docker-compose.proxy.yml ps

echo ""
echo "🧪 Step 2: Check nginx-proxy logs for domain detection..."
docker logs nginx-proxy --tail 10

echo ""
echo "🧪 Step 3: Check letsencrypt logs..."
docker logs letsencrypt --tail 10

echo ""
echo "🔄 Step 4: Restart containers to refresh environment variables..."
$DOCKER_COMPOSE -f docker-compose.proxy.yml restart

echo ""
echo "⏳ Step 5: Wait for services to restart..."
sleep 15

echo ""
echo "🧪 Step 6: Force certificate regeneration..."
# Remove old certificates and force regeneration
docker exec letsencrypt /app/force_renew 2>/dev/null || echo "Force renew not available"

# Alternative: restart letsencrypt to trigger certificate check
$DOCKER_COMPOSE -f docker-compose.proxy.yml restart letsencrypt

echo ""
echo "⏳ Step 7: Wait for certificate generation..."
sleep 30

echo ""
echo "🧪 Step 8: Test both HTTP and HTTPS..."

echo "Testing HTTP..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://cheeply.duckdns.org || echo "000")
echo "HTTP Status: $HTTP_STATUS"

echo "Testing HTTPS..."
HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://cheeply.duckdns.org || echo "000")
echo "HTTPS Status: $HTTPS_STATUS"

echo ""
echo "🔍 Step 9: Check what certificates exist..."
docker exec nginx-proxy ls -la /etc/nginx/certs/ 2>/dev/null || echo "Cannot access certificates"

echo ""
if [ "$HTTPS_STATUS" = "200" ]; then
    echo "🎉 SUCCESS! HTTPS is now working!"
    echo "✅ Your app: https://cheeply.duckdns.org"
    echo "✅ Geolocation should now work!"
elif [ "$HTTP_STATUS" = "200" ]; then
    echo "⏳ HTTP working, HTTPS still setting up..."
    echo "🌐 Visit: http://cheeply.duckdns.org"
    echo "🔧 SSL certificates may need more time (2-5 minutes)"
    
    echo ""
    echo "📋 Manual certificate trigger (if needed):"
    echo "   docker exec letsencrypt /app/signal_le_service"
else
    echo "⚠️ Issues detected. Let's troubleshoot..."
    echo ""
    echo "🔧 Check container logs:"
    echo "   nginx-proxy: docker logs nginx-proxy"
    echo "   letsencrypt: docker logs letsencrypt"
    echo "   frontend: docker logs shopping-list-frontend"
fi

echo ""
echo "📝 Environment variables being used:"
docker exec shopping-list-frontend env | grep -E "VIRTUAL|LETSENCRYPT" || echo "Cannot access frontend env vars"

echo ""
echo "🎯 If HTTPS still not working after 5 minutes:"
echo "   1. Check: docker logs letsencrypt"
echo "   2. Restart: $DOCKER_COMPOSE -f docker-compose.proxy.yml restart letsencrypt"
echo "   3. Wait 2-3 minutes and test again"
