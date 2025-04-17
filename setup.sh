#!/bin/bash

# Create required directories
mkdir -p nginx/conf.d

# Check if .env file exists, if not create it from example
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "Created .env file from .env.example. Please edit it with your actual values."
  else
    echo "Error: .env.example file not found."
    exit 1
  fi
fi

# Ensure directory structure exists
mkdir -p nginx/conf.d

# Check for Docker and Docker Compose
if ! command -v docker &> /dev/null; then
  echo "Docker is not installed. Please install Docker first."
  exit 1
fi

if ! command -v docker-compose &> /dev/null; then
  echo "Docker Compose is not installed. Please install Docker Compose first."
  exit 1
fi

echo "Setup complete! Now follow these steps:"
echo "1. Edit the .env file with your DuckDNS and API credentials"
echo "2. Run 'docker-compose build' to build the application"
echo "3. Run 'docker-compose up -d' to start the containers"
echo "4. Your application should be accessible at your DuckDNS domain (https://YOUR-SUBDOMAIN.duckdns.org)"
echo "   (DNS changes may take a few minutes to propagate)" 