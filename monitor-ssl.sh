#!/bin/bash

echo "🔍 Monitoring SSL certificate generation for cheeply.duckdns.org..."

# Function to test HTTPS
test_https() {
    curl -s -o /dev/null -w "%{http_code}" https://cheeply.duckdns.org 2>/dev/null || echo "000"
}

# Function to check certificate files
check_certs() {
    docker exec nginx-proxy ls -la /etc/nginx/certs/cheeply.duckdns.org/ 2>/dev/null || echo "Certificate directory not ready"
}

echo ""
echo "📊 Initial status:"
echo "HTTP: $(curl -s -o /dev/null -w "%{http_code}" http://cheeply.duckdns.org 2>/dev/null || echo "000")"
echo "HTTPS: $(test_https)"
echo ""

echo "🕐 Checking HTTPS every 30 seconds (will auto-stop when ready)..."
echo "   Press Ctrl+C to stop monitoring"

for i in {1..20}; do
    echo ""
    echo "🔍 Check $i/20 ($(date '+%H:%M:%S')):"
    
    HTTPS_STATUS=$(test_https)
    echo "   HTTPS Status: $HTTPS_STATUS"
    
    if [ "$HTTPS_STATUS" = "200" ]; then
        echo ""
        echo "🎉 SUCCESS! HTTPS is now working!"
        echo "✅ Your app: https://cheeply.duckdns.org"
        echo "✅ Geolocation should now work!"
        echo ""
        echo "🧪 Final verification:"
        curl -I https://cheeply.duckdns.org 2>/dev/null | head -3
        exit 0
    elif [ "$HTTPS_STATUS" = "301" ] || [ "$HTTPS_STATUS" = "302" ]; then
        echo "   ↳ Redirect detected - HTTPS is working!"
        echo ""
        echo "🎉 SUCCESS! HTTPS is working (with redirect)!"
        echo "✅ Your app: https://cheeply.duckdns.org"
        exit 0
    else
        echo "   ↳ Still generating... (Let's Encrypt can take 2-5 minutes)"
        
        # Show certificate files if available
        CERT_FILES=$(check_certs)
        if [[ "$CERT_FILES" != *"not ready"* ]]; then
            echo "   📁 Certificate files: Available"
        else
            echo "   📁 Certificate files: $CERT_FILES"
        fi
        
        # Show recent letsencrypt logs
        RECENT_LOG=$(docker logs letsencrypt --tail 2 2>/dev/null | tail -1)
        if [ ! -z "$RECENT_LOG" ]; then
            echo "   📝 Latest: $RECENT_LOG"
        fi
    fi
    
    if [ $i -lt 20 ]; then
        echo "   ⏳ Waiting 30 seconds..."
        sleep 30
    fi
done

echo ""
echo "⏰ 10 minutes elapsed. Let's check what's happening..."
echo ""
echo "🔧 Troubleshooting info:"
echo "1. Certificate directory contents:"
check_certs

echo ""
echo "2. Recent letsencrypt logs:"
docker logs letsencrypt --tail 10

echo ""
echo "3. nginx-proxy status:"
docker logs nginx-proxy --tail 5

echo ""
echo "🛠️ If HTTPS still not working:"
echo "   Manual trigger: docker exec letsencrypt /app/signal_le_service"
echo "   Restart LE: docker-compose -f docker-compose.proxy.yml restart letsencrypt"
echo "   Check logs: docker logs letsencrypt -f"
