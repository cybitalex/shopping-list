#!/bin/bash

# Deployment script for cheeply.duckdns.org
# This script will deploy your shopping list app with SSL certificates

set -e  # Exit on any error

echo "🚀 Starting deployment for cheeply.duckdns.org..."

# Check if production .env file exists
if [ ! -f ".env.production" ]; then
    if [ -f ".env" ]; then
        echo "📝 Creating production environment file..."
        cp .env .env.production
    else
        echo "❌ .env file not found! Please create it with your API keys."
        echo "📝 Copy .env.example to .env and fill in your API keys:"
        echo "   cp .env.example .env"
        exit 1
    fi
fi

# Check for required environment variables
echo "🔍 Checking environment variables..."
source .env.production

if [ -z "$GOOGLE_MAPS_API_KEY" ]; then
    echo "❌ GOOGLE_MAPS_API_KEY is missing from .env file"
    exit 1
fi

if [ -z "$SERPER_API_KEY" ]; then
    echo "❌ SERPER_API_KEY is missing from .env file"
    exit 1
fi

if [ -z "$DUCKDNS_TOKEN" ]; then
    echo "❌ DUCKDNS_TOKEN is missing from .env file"
    exit 1
fi

echo "✅ Environment variables look good"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running! Please start Docker first."
    exit 1
fi

# Step 1: Make sure DuckDNS is pointing to this server
echo "📡 Checking DuckDNS configuration..."
CURRENT_IP=$(curl -s http://checkip.amazonaws.com)
echo "Current server IP: $CURRENT_IP"
echo "Make sure cheeply.duckdns.org points to this IP address"

# Step 2: Create necessary directories
echo "📁 Creating directories..."
mkdir -p certbot/conf certbot/www certbot/logs screenshots

# Step 3: Clean up existing containers and port conflicts
echo "🛑 Cleaning up existing deployment..."
docker-compose down --remove-orphans 2>/dev/null || true

# Stop any containers that might be using our ports
echo "🔍 Checking for port conflicts..."
docker ps --format "table {{.Names}}\t{{.Ports}}" | grep -E ":80->|:443->" || echo "No port conflicts detected"

# Stop specific containers that might conflict
docker stop nginx-proxy letsencrypt app-gateway shopping-list-app shopping-list-api 2>/dev/null || true

# Remove old SSL certificates for the old domain
echo "🗑️ Cleaning old SSL certificates..."
rm -rf certbot/conf/live/shopcheeply.duckdns.org 2>/dev/null || true
rm -rf certbot/conf/renewal/shopcheeply.duckdns.org.conf 2>/dev/null || true

# Step 4: Build the application
echo "🔨 Building application..."
docker-compose build

# Step 5: Initialize SSL certificates (if needed)
if [ ! -f "certbot/conf/live/cheeply.duckdns.org/fullchain.pem" ]; then
    echo "🔐 Initializing SSL certificates..."
    
    # Create temporary self-signed certificate for initial startup
    mkdir -p certbot/conf/live/cheeply.duckdns.org
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout certbot/conf/live/cheeply.duckdns.org/privkey.pem \
        -out certbot/conf/live/cheeply.duckdns.org/fullchain.pem \
        -subj "/CN=cheeply.duckdns.org"
    
    # Start containers with temporary certificate
    echo "🔄 Starting with temporary certificates..."
    docker-compose up -d
    
    # Wait for services to be ready
    echo "⏱️  Waiting for services to start..."
    sleep 30
    
    # Get real SSL certificates from Let's Encrypt
    echo "🔐 Requesting real SSL certificates from Let's Encrypt..."
    docker-compose exec certbot certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email alex.cybitdevs@gmail.com \
        --agree-tos \
        --no-eff-email \
        -d cheeply.duckdns.org \
        --force-renewal
    
    # Restart nginx to use new certificates
    echo "🔄 Restarting nginx with real certificates..."
    docker-compose restart frontend
else
    echo "✅ SSL certificates already exist"
    # Start containers normally
    docker-compose up -d
fi

# Step 6: Wait for all services to be ready
echo "⏱️  Waiting for all services to be ready..."
sleep 20

# Step 7: Check if services are running
echo "🔍 Checking service status..."
if docker-compose ps | grep -q "Up"; then
    echo "✅ Services are running!"
    
    # Show service status
    docker-compose ps
    
    echo ""
    echo "🎉 Deployment successful!"
    echo "Your app is now available at:"
    echo "   🌐 HTTP:  http://cheeply.duckdns.org"
    echo "   🔒 HTTPS: https://cheeply.duckdns.org"
    echo ""
    echo "📊 To view logs: docker-compose logs -f"
    echo "🛑 To stop: docker-compose down"
    echo "🔄 To restart: docker-compose restart"
    
else
    echo "❌ Some services failed to start. Checking logs..."
    docker-compose logs
    exit 1
fi

echo "✅ Deployment complete!"
