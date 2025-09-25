#!/bin/bash

echo "🚀 Quick setup for local phone access..."

# Get local IP
get_local_ip() {
    LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' 2>/dev/null)
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(ifconfig 2>/dev/null | grep -E 'inet.*192\.168\.|inet.*10\.|inet.*172\.' | head -1 | awk '{print $2}' | sed 's/addr://')
    fi
    echo "$LOCAL_IP"
}

LOCAL_IP=$(get_local_ip)

if [ -z "$LOCAL_IP" ]; then
    echo "❌ Could not detect local IP. Please check manually:"
    echo "   ip addr show | grep 'inet 192.168'"
    exit 1
fi

echo "📍 Your local IP: $LOCAL_IP"

# Function to detect docker-compose command
get_docker_compose_cmd() {
    if command -v docker-compose &> /dev/null; then
        echo "docker-compose"
    elif docker compose version &> /dev/null; then
        echo "docker compose"
    else
        echo "ERROR: Neither docker-compose nor docker compose found"
        exit 1
    fi
}

DOCKER_COMPOSE=$(get_docker_compose_cmd)

echo ""
echo "🛑 Step 1: Stop production containers..."
$DOCKER_COMPOSE -f docker-compose.proxy.yml down 2>/dev/null || true

echo ""
echo "🔧 Step 2: Update CORS for local IP..."
# Update the backend CORS to include local IP
sed -i.bak "s/CORS_ORIGIN=.*/CORS_ORIGIN=http:\/\/$LOCAL_IP:3000,http:\/\/$LOCAL_IP,http:\/\/localhost:3000,http:\/\/localhost/" docker-compose.local.yml 2>/dev/null || true

echo ""
echo "🚀 Step 3: Start local development setup..."
$DOCKER_COMPOSE -f docker-compose.local.yml up -d

echo ""
echo "⏳ Step 4: Wait for services to start..."
sleep 15

echo ""
echo "📊 Step 5: Check container status..."
$DOCKER_COMPOSE -f docker-compose.local.yml ps

echo ""
echo "🧪 Step 6: Test local access..."
echo "Testing localhost..."
LOCAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
echo "   localhost:3000 → $LOCAL_STATUS"

echo "Testing local IP..."
IP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://$LOCAL_IP:3000 2>/dev/null || echo "000")
echo "   $LOCAL_IP:3000 → $IP_STATUS"

echo ""
if [ "$IP_STATUS" = "200" ]; then
    echo "🎉 SUCCESS! Local network access is working!"
    echo ""
    echo "📱 Phone Access:"
    echo "   Open your phone's browser"
    echo "   Navigate to: http://$LOCAL_IP:3000"
    echo ""
    echo "✅ Your app should load and work perfectly!"
    
    # Generate QR code if qrencode is available
    if command -v qrencode &> /dev/null; then
        echo ""
        echo "📱 QR Code for easy phone access:"
        qrencode -t ansiutf8 "http://$LOCAL_IP:3000"
        echo "   Scan this QR code with your phone!"
    else
        echo ""
        echo "💡 Tip: Install qrencode for QR code generation:"
        echo "   sudo apt install qrencode  # Ubuntu/Debian"
        echo "   brew install qrencode      # macOS"
    fi
    
elif [ "$LOCAL_STATUS" = "200" ]; then
    echo "⚠️ Localhost working but IP access failed"
    echo "🔧 This might be a firewall issue"
    echo ""
    echo "Try these commands:"
    echo "   sudo ufw allow 3000"
    echo "   sudo ufw allow from $LOCAL_IP"
else
    echo "❌ Services not responding yet"
    echo "🔧 Check logs: $DOCKER_COMPOSE -f docker-compose.local.yml logs"
fi

echo ""
echo "📋 Useful commands:"
echo "   View logs: $DOCKER_COMPOSE -f docker-compose.local.yml logs -f"
echo "   Restart: $DOCKER_COMPOSE -f docker-compose.local.yml restart"
echo "   Stop: $DOCKER_COMPOSE -f docker-compose.local.yml down"

echo ""
echo "🌐 Alternative access methods:"
echo "   http://$LOCAL_IP (port 80)"
echo "   http://$LOCAL_IP:3000 (port 3000)"

echo ""
echo "🔍 Troubleshooting:"
echo "   1. Ensure phone and server are on same WiFi"
echo "   2. Check firewall: sudo ufw status"
echo "   3. Try different ports if needed"
