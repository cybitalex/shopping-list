#!/bin/bash

COMPOSE="/usr/local/bin/docker-compose"
DOCKER="/usr/bin/docker"

cd /path/to/your/app
$COMPOSE run certbot renew && $COMPOSE kill -s SIGHUP app
$DOCKER system prune -af 