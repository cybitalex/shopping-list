#!/bin/bash

echo "🔧 Fixing port mapping issue..."

# Stop current containers
echo "1️⃣ Stopping current containers..."
docker-compose down

# Remove any containers using the wrong ports
echo "2️⃣ Cleaning up containers..."
docker stop shopping-list-frontend shopping-list-backend certbot 2>/dev/null || true
docker rm shopping-list-frontend shopping-list-backend certbot 2>/dev/null || true

# Free up ports if they're still in use
echo "3️⃣ Freeing up ports..."
sudo fuser -k 80/tcp 2>/dev/null || true
sudo fuser -k 443/tcp 2>/dev/null || true

# Rebuild and start with correct port mapping
echo "4️⃣ Starting containers with correct configuration..."
docker-compose up -d

echo "5️⃣ Waiting for containers to start..."
sleep 15

# Show container status
echo "6️⃣ Container status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Test HTTP access
echo "7️⃣ Testing HTTP access..."
sleep 5
curl -I http://cheeply.duckdns.org 2>/dev/null | head -1 || echo "HTTP test failed"

# Test HTTPS access (might fail if no SSL cert yet)
echo "8️⃣ Testing HTTPS access..."
curl -I https://cheeply.duckdns.org 2>/dev/null | head -1 || echo "HTTPS test failed (this is normal if no SSL cert yet)"

echo ""
echo "✅ Port mapping fix complete!"
echo "Your app should now be accessible at:"
echo "   HTTP:  http://cheeply.duckdns.org"
echo "   HTTPS: https://cheeply.duckdns.org (if SSL cert exists)"
