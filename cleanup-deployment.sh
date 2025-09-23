#!/bin/bash

echo "🧹 Cleaning up existing deployment..."

# Stop and remove old containers
echo "🛑 Stopping old containers..."
docker stop shopping-list-api letsencrypt app-gateway nginx-proxy duckdns shopping-list-app 2>/dev/null || true
docker rm shopping-list-api letsencrypt app-gateway nginx-proxy duckdns shopping-list-app 2>/dev/null || true

# Stop current deployment
echo "🛑 Stopping current deployment..."
docker-compose down --remove-orphans

# Remove old volumes and networks
echo "🗑️ Cleaning up old volumes and networks..."
docker volume prune -f
docker network prune -f

# Clean up old images
echo "🗑️ Removing old images..."
docker image prune -f

echo "✅ Cleanup complete!"
echo "📝 You can now run: ./deploy-cheeply.sh"
