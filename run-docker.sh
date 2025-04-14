#!/bin/bash

# Create necessary directories
mkdir -p certbot/conf
mkdir -p certbot/www
mkdir -p certbot/logs
mkdir -p screenshots

# Build and start the containers
echo "Building and starting containers..."
docker-compose up --build -d

echo "Application is running in containers"
echo "Frontend: http://localhost (production) or https://shopcheeply.duckdns.org"
echo "Backend API: http://localhost:3000/api/"

# Show logs
echo "Showing container logs (Ctrl+C to exit logs, containers will keep running)"
docker-compose logs -f 