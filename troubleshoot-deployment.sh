#!/bin/bash

echo "🔍 Troubleshooting cheeply.duckdns.org deployment..."

echo ""
echo "📡 === DNS RESOLUTION TEST ==="
echo "Testing if cheeply.duckdns.org resolves..."
nslookup cheeply.duckdns.org
echo ""

echo "🌐 === PING TEST ==="
echo "Testing connectivity to cheeply.duckdns.org..."
ping -c 3 cheeply.duckdns.org
echo ""

echo "🔌 === PORT CONNECTIVITY TEST ==="
echo "Testing HTTP (port 80)..."
nc -zv cheeply.duckdns.org 80 2>&1 || echo "Port 80 not accessible"
echo ""
echo "Testing HTTPS (port 443)..."
nc -zv cheeply.duckdns.org 443 2>&1 || echo "Port 443 not accessible"
echo ""

echo "🐳 === DOCKER CONTAINER STATUS ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

echo "📋 === CONTAINER LOGS ==="
echo "Backend logs:"
docker logs shopping-list-backend --tail 10 2>/dev/null || echo "Backend container not found"
echo ""
echo "Frontend logs:"
docker logs shopping-list-frontend --tail 10 2>/dev/null || echo "Frontend container not found"
echo ""

echo "🔐 === SSL CERTIFICATE CHECK ==="
echo "Checking SSL certificates..."
ls -la certbot/conf/live/ 2>/dev/null || echo "No SSL certificates found"
echo ""

echo "🔧 === NGINX CONFIGURATION TEST ==="
docker exec shopping-list-frontend nginx -t 2>/dev/null || echo "Cannot test nginx config - container not running"
echo ""

echo "🌍 === DUCKDNS STATUS CHECK ==="
echo "Checking DuckDNS token status..."
if [ -f ".env.production" ]; then
    source .env.production
    if [ ! -z "$DUCKDNS_TOKEN" ]; then
        echo "DuckDNS token found in .env.production"
        echo "Checking current IP vs DuckDNS..."
        CURRENT_IP=$(curl -s http://checkip.amazonaws.com)
        DUCKDNS_IP=$(nslookup cheeply.duckdns.org | grep "Address:" | tail -1 | awk '{print $2}')
        echo "Current server IP: $CURRENT_IP"
        echo "DuckDNS IP: $DUCKDNS_IP"
        if [ "$CURRENT_IP" = "$DUCKDNS_IP" ]; then
            echo "✅ IPs match!"
        else
            echo "❌ IP mismatch - DuckDNS needs updating"
        fi
    else
        echo "❌ DuckDNS token not found"
    fi
else
    echo "❌ .env.production not found"
fi

echo ""
echo "🔥 === FIREWALL CHECK ==="
echo "Checking if ports are open..."
sudo ufw status 2>/dev/null || echo "UFW not installed or not accessible"

echo ""
echo "📝 === RECOMMENDED ACTIONS ==="
echo "Based on the results above, try:"
echo "1. If DNS doesn't resolve: Update DuckDNS token"
echo "2. If containers aren't running: Run ./deploy-cheeply.sh"
echo "3. If SSL issues: Delete certbot/conf and redeploy"
echo "4. If port issues: Check firewall settings"
