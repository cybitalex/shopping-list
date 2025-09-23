#!/bin/bash

echo "📊 Quick Status Check for cheeply.duckdns.org"
echo "================================================"

echo ""
echo "🌐 Website Access:"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://cheeply.duckdns.org 2>/dev/null || echo "000")
HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://cheeply.duckdns.org 2>/dev/null || echo "000")

echo "   HTTP:  $HTTP_STATUS $([ "$HTTP_STATUS" = "200" ] && echo "✅ Working" || echo "❌ Issue")"
echo "   HTTPS: $HTTPS_STATUS $([ "$HTTPS_STATUS" = "200" ] && echo "✅ Working" || [ "$HTTPS_STATUS" = "301" -o "$HTTPS_STATUS" = "302" ] && echo "✅ Working (redirect)" || echo "⏳ Still setting up")"

echo ""
echo "🐳 Container Status:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(nginx-proxy|letsencrypt|shopping-list)"

echo ""
echo "🔐 SSL Certificate Status:"
CERT_DIR=$(docker exec nginx-proxy ls -la /etc/nginx/certs/cheeply.duckdns.org/ 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "   📁 Certificate directory: ✅ Exists"
    echo "$CERT_DIR" | grep -E "\.(crt|key|pem)$" | head -3
else
    echo "   📁 Certificate directory: ❌ Not found"
fi

echo ""
echo "📝 Recent Activity:"
echo "   Let's Encrypt logs (last 3 lines):"
docker logs letsencrypt --tail 3 2>/dev/null | sed 's/^/      /'

echo ""
if [ "$HTTPS_STATUS" = "200" ]; then
    echo "🎉 ALL SYSTEMS GO!"
    echo "   🌐 Visit: https://cheeply.duckdns.org"
    echo "   ✅ Geolocation should work!"
elif [ "$HTTP_STATUS" = "200" ]; then
    echo "⏳ HTTP Working, HTTPS Setting Up"
    echo "   🌐 Visit: http://cheeply.duckdns.org"
    echo "   ⏰ HTTPS should be ready in 2-5 minutes"
    echo "   📱 Run ./monitor-ssl.sh to watch progress"
else
    echo "⚠️ Issues Detected"
    echo "   🔧 Check logs: docker logs nginx-proxy"
    echo "   🔧 Check logs: docker logs letsencrypt"
fi
