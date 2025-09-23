# 🚀 Deployment Guide for cheeply.duckdns.org

This guide will help you deploy your Shopping List App to `cheeply.duckdns.org` with Docker and SSL certificates.

## 📋 Prerequisites

1. **Server Requirements:**

   - Ubuntu/Debian Linux server (or any Docker-compatible OS)
   - Docker and Docker Compose installed
   - At least 2GB RAM and 20GB storage
   - Port 80 and 443 open for HTTP/HTTPS traffic

2. **Domain Setup:**

   - DuckDNS account configured
   - `cheeply.duckdns.org` pointing to your server's IP address

3. **API Keys:**
   - Google Maps API key
   - SerpAPI key (for price searching)
   - OpenAI API key (optional)
   - Mapbox token

## 🛠️ Step-by-Step Deployment

### Step 1: Server Setup

```bash
# Update your server
sudo apt update && sudo apt upgrade -y

# Install Docker (if not already installed)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose (if not already installed)
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in to apply Docker group changes
```

### Step 2: Clone and Configure

```bash
# Clone your repository (adjust the path as needed)
git clone <your-repo-url> shopping_list_app
cd shopping_list_app

# Make deployment script executable
chmod +x deploy-cheeply.sh
```

### Step 3: Configure Environment Variables

Your `.env` file is already configured! Here's what it contains:

```env
# API Keys
GOOGLE_MAPS_API_KEY=AIzaSyDmhjKmd1ZFKBa7uYnCz_EiNyqYI4T3Q9c
SERPER_API_KEY=c54c47bdbf6dbe1eef970a76495dee22009aafee9b2af718100155a7f14d4f59
MAPBOX_TOKEN=pk.eyJ1IjoiY3liaXRhbGV4IiwiYSI6ImNtOWN2cWxkcjB3MGEyaW92YXlrMjJxcmQifQ.zFTSXlMhmhwh2lyCPhLfqQ

# DuckDNS Configuration
DUCKDNS_SUBDOMAIN=cheeply
DUCKDNS_TOKEN=8153f770-63e6-48d9-9801-ceab967ccdd0

# Let's Encrypt Configuration
LETSENCRYPT_EMAIL=alex.cybitdevs@gmail.com
```

### Step 4: Configure DuckDNS

Make sure your DuckDNS subdomain points to your server:

```bash
# Check your current server IP
curl -s http://checkip.amazonaws.com

# Update DuckDNS (replace with your actual IP)
curl "https://www.duckdns.org/update?domains=cheeply&token=8153f770-63e6-48d9-9801-ceab967ccdd0&ip=YOUR_SERVER_IP"
```

### Step 5: Deploy the Application

```bash
# Run the deployment script
./deploy-cheeply.sh
```

This script will:

1. ✅ Check prerequisites
2. 🔨 Build Docker containers
3. 🔐 Set up SSL certificates with Let's Encrypt
4. 🚀 Start all services
5. ✅ Verify deployment

### Step 6: Verify Deployment

After deployment, check that everything is working:

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f

# Test HTTP access
curl -I http://cheeply.duckdns.org

# Test HTTPS access
curl -I https://cheeply.duckdns.org
```

## 🌐 Access Your App

Once deployed, your app will be available at:

- **HTTP**: http://cheeply.duckdns.org
- **HTTPS**: https://cheeply.duckdns.org (recommended)

## 🔧 Management Commands

```bash
# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Stop all services
docker-compose down

# Start services
docker-compose up -d

# Rebuild and restart
docker-compose up --build -d

# View resource usage
docker stats
```

## 🔐 SSL Certificate Management

SSL certificates are automatically managed by Let's Encrypt and will auto-renew.

To manually renew certificates:

```bash
docker-compose exec certbot certbot renew
docker-compose restart frontend
```

## 🐛 Troubleshooting

### Common Issues:

1. **Port conflicts**: Make sure ports 80 and 443 are not used by other services
2. **DNS issues**: Verify that `cheeply.duckdns.org` resolves to your server IP
3. **SSL issues**: Check certbot logs: `docker-compose logs certbot`
4. **API errors**: Verify all API keys in `.env` file are correct

### Useful Debug Commands:

```bash
# Check if services are responding
curl -v http://cheeply.duckdns.org/api/health

# Check container logs
docker-compose logs backend
docker-compose logs frontend

# Check nginx configuration
docker-compose exec frontend nginx -t

# Check SSL certificate
openssl s_client -connect cheeply.duckdns.org:443 -servername cheeply.duckdns.org
```

## 📊 Monitoring

Your app includes:

- **Health checks** for all services
- **Automatic SSL renewal**
- **Docker restart policies**
- **CORS configuration** for security
- **Gzip compression** for performance

## 🔄 Updates

To update your deployment with new code:

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose up --build -d

# Check logs for any issues
docker-compose logs -f
```

## 🎉 Success!

If everything is working correctly, you should be able to:

1. ✅ Access https://cheeply.duckdns.org
2. ✅ Search for items by location
3. ✅ View store comparisons with pricing
4. ✅ See the map with store locations
5. ✅ Get real-time price data

Your Shopping List App is now live at **https://cheeply.duckdns.org**! 🎊
