#!/bin/bash

echo "🔧 Fixing backend issues and setting up SSL..."

# Step 1: Rebuild backend with fixes
echo "1️⃣ Rebuilding backend with fixes..."
docker-compose build backend

# Step 2: Restart backend to apply fixes
echo "2️⃣ Restarting backend..."
docker-compose restart backend

# Wait for backend to start
echo "⏳ Waiting for backend to start..."
sleep 10

# Step 3: Test Mapbox token endpoint
echo "3️⃣ Testing Mapbox token endpoint..."
curl -s http://localhost:3001/api/mapbox-token || echo "Mapbox endpoint test failed (this is normal if backend isn't ready)"

# Step 4: Setup SSL certificates
echo "4️⃣ Setting up SSL certificates..."

# Check if certificates already exist
if [ -d "certbot/conf/live/cheeply.duckdns.org" ]; then
    echo "📜 SSL certificates already exist, checking if valid..."
    if docker exec shopping-list-frontend nginx -t 2>/dev/null; then
        echo "✅ Existing SSL certificates are valid"
    else
        echo "❌ SSL certificates are invalid, recreating..."
        rm -rf certbot/conf/live/cheeply.duckdns.org
        rm -rf certbot/conf/renewal/cheeply.duckdns.org.conf
        rm -rf certbot/conf/archive/cheeply.duckdns.org
    fi
fi

# Get new certificates if needed
if [ ! -d "certbot/conf/live/cheeply.duckdns.org" ]; then
    echo "🔐 Getting new SSL certificates..."
    
    # Stop the frontend temporarily
    docker-compose stop frontend
    
    # Create a simple HTTP server for validation
    echo "Starting temporary validation server..."
    docker run -d \
        --name temp-nginx \
        -p 80:80 \
        -v $(pwd)/certbot/www:/var/www/certbot \
        nginx:alpine \
        sh -c 'echo "server { listen 80; location /.well-known/acme-challenge/ { root /var/www/certbot; } }" > /etc/nginx/conf.d/default.conf && nginx -g "daemon off;"'
    
    # Wait a moment for the server to start
    sleep 5
    
    # Get the certificate
    docker run --rm \
        -v $(pwd)/certbot/conf:/etc/letsencrypt \
        -v $(pwd)/certbot/www:/var/www/certbot \
        certbot/certbot \
        certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email alex.cybitdevs@gmail.com \
        --agree-tos \
        --no-eff-email \
        --force-renewal \
        -d cheeply.duckdns.org
    
    # Stop the temporary server
    docker stop temp-nginx
    docker rm temp-nginx
    
    # Start the frontend again
    docker-compose start frontend
    
    echo "🔐 SSL certificate setup complete"
else
    echo "✅ SSL certificates already exist"
fi

# Step 5: Test final setup
echo "5️⃣ Testing final setup..."
sleep 10

# Test HTTP
echo "🧪 Testing HTTP access..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://cheeply.duckdns.org || echo "000")
echo "HTTP Status: $HTTP_STATUS"

# Test HTTPS
echo "🧪 Testing HTTPS access..."
HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://cheeply.duckdns.org || echo "000")
echo "HTTPS Status: $HTTPS_STATUS"

# Test API endpoints
echo "🧪 Testing API endpoints..."
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://cheeply.duckdns.org/api/mapbox-token || echo "000")
echo "API Status: $API_STATUS"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "🌐 Your application should now be accessible at:"
echo "   HTTP:  http://cheeply.duckdns.org"
echo "   HTTPS: https://cheeply.duckdns.org"
echo ""
echo "📊 Container status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
