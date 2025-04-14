#!/bin/bash

# Build the frontend
echo "Building frontend..."
npm run build

# Start the server in production mode
echo "Starting server in production mode..."
NODE_ENV=production npm start

# Note: In a real production environment, you would use a process manager like PM2:
# NODE_ENV=production pm2 start server.js --name "shopping-app" 