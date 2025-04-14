#!/bin/bash

# Stop all development containers
echo "Stopping development containers..."
docker-compose -f docker-compose.dev.yml down

echo "Development containers stopped" 