#!/bin/bash

echo "🦆 Updating DuckDNS for cheeply.duckdns.org..."

# Load environment variables
if [ -f ".env.production" ]; then
    source .env.production
elif [ -f ".env" ]; then
    source .env
else
    echo "❌ No environment file found"
    exit 1
fi

# Check if DuckDNS token exists
if [ -z "$DUCKDNS_TOKEN" ]; then
    echo "❌ DUCKDNS_TOKEN not found in environment file"
    echo "Please add DUCKDNS_TOKEN to your .env file"
    exit 1
fi

# Get current server IP
CURRENT_IP=$(curl -s http://checkip.amazonaws.com)
echo "📍 Current server IP: $CURRENT_IP"

# Update DuckDNS
echo "🔄 Updating DuckDNS..."
RESPONSE=$(curl -s "https://www.duckdns.org/update?domains=cheeply&token=$DUCKDNS_TOKEN&ip=$CURRENT_IP")

if [ "$RESPONSE" = "OK" ]; then
    echo "✅ DuckDNS updated successfully!"
    echo "🕒 DNS propagation may take a few minutes..."
    
    # Test DNS resolution
    echo "🧪 Testing DNS resolution..."
    sleep 5
    nslookup cheeply.duckdns.org
    
else
    echo "❌ DuckDNS update failed. Response: $RESPONSE"
    echo "Please check your DuckDNS token and subdomain"
fi
