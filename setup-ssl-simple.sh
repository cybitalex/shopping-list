#!/bin/bash

echo "🔐 Setting up SSL certificates for cheeply.duckdns.org..."

# Step 1: Remove old certificates
echo "1️⃣ Cleaning old certificates..."
sudo rm -rf certbot/conf/live/cheeply.duckdns.org
sudo rm -rf certbot/conf/renewal/cheeply.duckdns.org.conf
sudo rm -rf certbot/conf/archive/cheeply.duckdns.org

# Step 2: Create necessary directories
echo "2️⃣ Creating directories..."
mkdir -p certbot/conf/live
mkdir -p certbot/conf/renewal
mkdir -p certbot/conf/archive
mkdir -p certbot/www

# Step 3: Get certificates using the existing certbot container
echo "3️⃣ Getting SSL certificates..."

# Make sure certbot container is running
docker-compose up -d certbot

# Get the certificate
docker exec certbot certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email alex.cybitdevs@gmail.com \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    -d cheeply.duckdns.org

# Step 4: Restart frontend to use new certificates
echo "4️⃣ Restarting frontend with new certificates..."
docker-compose restart frontend

# Wait for restart
sleep 15

# Step 5: Test HTTPS
echo "5️⃣ Testing HTTPS access..."
curl -I https://cheeply.duckdns.org 2>/dev/null | head -1 || echo "HTTPS test failed"

echo ""
echo "✅ SSL setup complete!"
echo "🌐 Test your site: https://cheeply.duckdns.org"
