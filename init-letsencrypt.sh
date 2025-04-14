#!/bin/bash

# Create directories for certbot
mkdir -p certbot/conf
mkdir -p certbot/www
mkdir -p certbot/logs

# Check if certificates already exist
if [ -d "certbot/conf/live" ]; then
    echo "Certificates already exist, skipping initialization"
    exit 0
fi

# Create temporary self-signed certificate
mkdir -p certbot/conf/live/YOUR_DOMAIN
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout certbot/conf/live/YOUR_DOMAIN/privkey.pem \
    -out certbot/conf/live/YOUR_DOMAIN/fullchain.pem \
    -subj "/CN=localhost"

# Start nginx with temporary certificate
docker-compose up -d frontend

# Wait for nginx to start
sleep 5

# Stop nginx after initialization
docker-compose stop frontend

echo "SSL certificate initialization complete" 