#!/bin/bash

echo "🔧 Fixing 'authority invalid' error for cheeply.duckdns.org..."

# Step 1: Update DuckDNS to point to current server
echo "1️⃣ Updating DuckDNS..."
./update-duckdns.sh

# Step 2: Clean up old SSL certificates completely
echo "2️⃣ Cleaning SSL certificates..."
docker-compose down 2>/dev/null || true
sudo rm -rf certbot/conf/live/*
sudo rm -rf certbot/conf/renewal/*
sudo rm -rf certbot/conf/archive/*
mkdir -p certbot/conf/live
mkdir -p certbot/conf/renewal
mkdir -p certbot/conf/archive

# Step 3: Force container cleanup
echo "3️⃣ Cleaning containers..."
docker stop $(docker ps -aq) 2>/dev/null || true
docker rm $(docker ps -aq) 2>/dev/null || true
docker system prune -f

# Step 4: Check if ports are available
echo "4️⃣ Checking ports..."
if netstat -tulpn | grep :80 > /dev/null; then
    echo "⚠️ Port 80 is in use:"
    netstat -tulpn | grep :80
    echo "Trying to free port 80..."
    sudo fuser -k 80/tcp 2>/dev/null || true
fi

if netstat -tulpn | grep :443 > /dev/null; then
    echo "⚠️ Port 443 is in use:"
    netstat -tulpn | grep :443
    echo "Trying to free port 443..."
    sudo fuser -k 443/tcp 2>/dev/null || true
fi

# Step 5: Wait for DNS propagation
echo "5️⃣ Waiting for DNS propagation..."
echo "Testing DNS resolution..."
for i in {1..3}; do
    echo "Attempt $i/3..."
    nslookup cheeply.duckdns.org
    if nslookup cheeply.duckdns.org | grep -q "$(curl -s http://checkip.amazonaws.com)"; then
        echo "✅ DNS is resolving correctly!"
        break
    fi
    echo "⏳ Waiting 10 seconds for DNS propagation..."
    sleep 10
done

# Step 6: Start deployment with HTTP only first
echo "6️⃣ Starting HTTP-only deployment first..."
# Temporarily modify docker-compose to only use port 80
cp docker-compose.yml docker-compose.yml.backup
sed -i 's/- "443:443"/# - "443:443"/' docker-compose.yml

echo "🚀 Starting containers..."
docker-compose up -d

echo "⏳ Waiting for containers to start..."
sleep 30

# Test HTTP access
echo "🧪 Testing HTTP access..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://cheeply.duckdns.org || echo "000")
if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "302" ]; then
    echo "✅ HTTP access working! Status: $HTTP_STATUS"
    
    # Now restore HTTPS and get certificates
    echo "7️⃣ Setting up HTTPS..."
    cp docker-compose.yml.backup docker-compose.yml
    
    # Get SSL certificates
    docker-compose exec certbot certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email alex.cybitdevs@gmail.com \
        --agree-tos \
        --no-eff-email \
        -d cheeply.duckdns.org \
        --force-renewal
    
    # Restart with HTTPS
    docker-compose restart frontend
    
    echo "🧪 Testing HTTPS access..."
    sleep 10
    HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://cheeply.duckdns.org || echo "000")
    if [ "$HTTPS_STATUS" = "200" ]; then
        echo "🎉 HTTPS access working! Your app is live at https://cheeply.duckdns.org"
    else
        echo "⚠️ HTTPS not working yet. Status: $HTTPS_STATUS"
        echo "You can access via HTTP: http://cheeply.duckdns.org"
    fi
else
    echo "❌ HTTP access failed. Status: $HTTP_STATUS"
    echo "Running troubleshooting..."
    ./troubleshoot-deployment.sh
fi

echo ""
echo "🏁 Fix attempt complete!"
echo "Try accessing: https://cheeply.duckdns.org"
