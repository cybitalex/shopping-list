# Running Shop Cheeply with Docker

This document explains how to run the Shop Cheeply application using Docker containers.

## Prerequisites

- Docker and Docker Compose installed on your system
- API keys set in the `.env` file:
  - `SERPAPI_KEY`
  - `GOOGLE_MAPS_API_KEY`
  - `OPENAI_API_KEY` (optional for AI features)
  - `MAPBOX_TOKEN` (optional for map features)

## Quick Start

### Development Mode

For local development and testing:

```bash
# Start the development containers
./run-docker-dev.sh

# Stop the development containers
./stop-docker-dev.sh
```

### Production Mode

For production deployment:

```bash
# Start the production containers
./run-docker.sh

# Stop the production containers
./stop-docker.sh
```

## Container Structure

The application consists of the following containers:

1. **Frontend** - Nginx serving the React frontend
   - Port: 80 (and 443 in production)
   - Built with Vite and served as static files

2. **Backend** - Node.js Express API
   - Port: 3000
   - Handles all API requests
   - Integrates with SerpAPI, OpenAI, and Playwright for price fetching

3. **Certbot** (Production only)
   - Manages SSL certificates for HTTPS

## Manual Commands

If you prefer to run commands manually:

```bash
# Development mode
docker-compose -f docker-compose.dev.yml up --build -d

# Production mode
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop containers
docker-compose down
```

## Volume Mounts

- The backend container mounts the source code directory, allowing for code changes without rebuilding
- Nginx configuration is mounted from the host
- In production mode, SSL certificates are stored in `./certbot/conf`
- Screenshots from Playwright are stored in `./screenshots`

## Troubleshooting

If you encounter issues:

1. Check the container logs:
   ```bash
   docker-compose logs
   ```

2. Verify environment variables are properly set in `.env`

3. Ensure ports 80, 443, and 3000 are available on your host machine

4. For SSL certificate issues in production, check the certbot logs:
   ```bash
   docker-compose logs certbot
   ``` 