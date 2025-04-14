#!/bin/bash

# Create necessary directories
mkdir -p screenshots

# Build and start the development containers
echo "Building and starting development containers..."
docker-compose -f docker-compose.dev.yml up --build -d

echo "Development environment is running in containers"
echo "Frontend: http://localhost"
echo "Backend API: http://localhost:3000/api/"

# Show logs
echo "Showing container logs (Ctrl+C to exit logs, containers will keep running)"
docker-compose -f docker-compose.dev.yml logs -f 