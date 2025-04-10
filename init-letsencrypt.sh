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

docker-compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    $email_arg \
    $domain_args \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --force-renewal" certbot
echo

# Reload nginx with SSL configuration
echo "### Reloading nginx with SSL configuration ..."
docker-compose exec app nginx -s reload 