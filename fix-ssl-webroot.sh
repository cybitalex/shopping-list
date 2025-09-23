#!/bin/bash

echo "🔐 Fixing SSL setup with proper webroot configuration..."

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
echo "🔧 Step 1: Update nginx configuration with Let's Encrypt webroot..."
echo "✅ nginx.conf already updated with /.well-known/acme-challenge/ location"

echo ""
echo "🔄 Step 2: Restart frontend to apply nginx config changes..."
$DOCKER_COMPOSE restart frontend

echo ""
echo "📁 Step 3: Create and set proper permissions for webroot..."
mkdir -p certbot/www/.well-known/acme-challenge
chmod -R 755 certbot/www
chown -R 33:33 certbot/www 2>/dev/null || true  # www-data user

echo ""
echo "🗑️ Step 4: Clean old certificates..."
rm -rf certbot/conf/live/cheeply.duckdns.org 2>/dev/null || true
rm -rf certbot/conf/renewal/cheeply.duckdns.org.conf 2>/dev/null || true
rm -rf certbot/conf/archive/cheeply.duckdns.org 2>/dev/null || true

echo ""
echo "🧪 Step 5: Test webroot accessibility..."
# Create a test file
echo "test" > certbot/www/.well-known/acme-challenge/test.txt
TEST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://cheeply.duckdns.org/.well-known/acme-challenge/test.txt || echo "000")
echo "Webroot test status: $TEST_STATUS"

if [ "$TEST_STATUS" = "200" ]; then
    echo "✅ Webroot is accessible!"
    rm certbot/www/.well-known/acme-challenge/test.txt
else
    echo "❌ Webroot not accessible. Trying alternative approach..."
    
    # Alternative: Use standalone method
    echo "🔄 Switching to standalone method..."
    $DOCKER_COMPOSE stop frontend
    sleep 5
    
    echo "🔐 Getting certificate with standalone method..."
    $DOCKER_COMPOSE run --rm -p 80:80 certbot certbot certonly \
        --standalone \
        --email alex.cybitdevs@gmail.com \
        --agree-tos \
        --no-eff-email \
        --force-renewal \
        --non-interactive \
        -d cheeply.duckdns.org
    
    # Start frontend again
    $DOCKER_COMPOSE start frontend
    
    echo "⏳ Waiting for frontend to start..."
    sleep 15
    
    echo "🧪 Testing HTTPS after standalone method..."
    HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://cheeply.duckdns.org 2>/dev/null || echo "000")
    echo "HTTPS Status: $HTTPS_STATUS"
    
    if [ "$HTTPS_STATUS" = "200" ] || [ "$HTTPS_STATUS" = "301" ] || [ "$HTTPS_STATUS" = "302" ]; then
        echo "🎉 SUCCESS! SSL working with standalone method"
        echo "✅ Your app: https://cheeply.duckdns.org"
        exit 0
    else
        echo "❌ Standalone method also failed"
        exit 1
    fi
fi

echo ""
echo "🔐 Step 6: Get SSL certificate with webroot..."
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

if [ $SSL_SUCCESS -eq 0 ]; then
    echo "✅ SSL certificate obtained successfully!"
else
    echo "❌ Webroot method failed, trying standalone..."
    
    # Fallback to standalone
    $DOCKER_COMPOSE stop frontend
    sleep 5
    
    $DOCKER_COMPOSE run --rm -p 80:80 certbot certbot certonly \
        --standalone \
        --email alex.cybitdevs@gmail.com \
        --agree-tos \
        --no-eff-email \
        --force-renewal \
        --non-interactive \
        -d cheeply.duckdns.org
    
    $DOCKER_COMPOSE start frontend
fi

echo ""
echo "🔄 Step 7: Restart frontend to load SSL certificates..."
$DOCKER_COMPOSE restart frontend

echo ""
echo "⏳ Step 8: Wait for services to start..."
sleep 20

echo ""
echo "🧪 Step 9: Test final setup..."

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://cheeply.duckdns.org || echo "000")
echo "HTTP Status: $HTTP_STATUS"

HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://cheeply.duckdns.org || echo "000")
echo "HTTPS Status: $HTTPS_STATUS"

echo ""
if [ "$HTTPS_STATUS" = "200" ] || [ "$HTTPS_STATUS" = "301" ] || [ "$HTTPS_STATUS" = "302" ]; then
    echo "🎉 SUCCESS! Your app is now running with HTTPS!"
    echo "✅ Visit: https://cheeply.duckdns.org"
    echo "✅ Geolocation should now work!"
else
    echo "⚠️ HTTPS not fully working yet"
    echo "🌐 HTTP available: http://cheeply.duckdns.org"
    echo "🔧 Check logs: $DOCKER_COMPOSE logs frontend"
    echo "🔧 Check SSL: ls -la certbot/conf/live/"
fi

echo ""
echo "📝 Certificate status:"
ls -la certbot/conf/live/ 2>/dev/null || echo "No certificates found"
