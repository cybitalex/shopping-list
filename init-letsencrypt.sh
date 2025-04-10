#!/bin/bash

domains=(shopcheeply.duckdns.org)
email="alex.cybitdevs@gmail.com"
staging=0

data_path="./certbot"
rsa_key_size=4096

# Create necessary directories with proper permissions
echo "### Creating necessary directories ..."
mkdir -p "$data_path/conf/live/$domains"
mkdir -p "$data_path/www"
chmod -R 755 "$data_path"

# Download recommended TLS parameters
if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ] || [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
  echo "### Downloading recommended TLS parameters ..."
  mkdir -p "$data_path/conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$data_path/conf/options-ssl-nginx.conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$data_path/conf/ssl-dhparams.pem"
  chmod 644 "$data_path/conf/options-ssl-nginx.conf" "$data_path/conf/ssl-dhparams.pem"
  echo
fi

# Stop any running containers
echo "### Stopping any running containers ..."
docker-compose down

# Start nginx without SSL
echo "### Starting nginx ..."
docker-compose up --force-recreate -d app
echo

# Wait for nginx to start
echo "### Waiting for nginx to start ..."
sleep 10

# Request Let's Encrypt certificate
echo "### Requesting Let's Encrypt certificate for $domains ..."
domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

# Select appropriate email arg
case "$email" in
  "") email_arg="--register-unsafely-without-email" ;;
  *) email_arg="--email $email" ;;
esac

# Enable staging mode if needed
if [ $staging != "0" ]; then staging_arg="--staging"; fi

# Phase 1: Get the certificate
docker-compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    $email_arg \
    $domain_args \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --force-renewal" certbot

if [ $? -eq 0 ]; then
  echo "### Certificate obtained successfully!"
  
  # Phase 2: Update nginx configuration with SSL
  echo "### Updating nginx configuration with SSL ..."
  cat > nginx.conf << 'EOL'
server {
    listen 80;
    server_name shopcheeply.duckdns.org;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files $uri =404;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name shopcheeply.duckdns.org;

    ssl_certificate /etc/letsencrypt/live/shopcheeply.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/shopcheeply.duckdns.org/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_stapling on;
    ssl_stapling_verify on;
    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Enable gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml application/javascript;
    gzip_disable "MSIE [1-6]\.";
}
EOL

  # Restart nginx with SSL configuration
  echo "### Restarting nginx with SSL configuration ..."
  docker-compose down
  docker-compose up -d
else
  echo "### Certificate request failed. Please check the logs and try again."
  exit 1
fi 