# AWS Deployment Branch

This branch (`aws-deployment`) contains AWS Elastic Beanstalk deployment configuration and should be kept separate from the main development branches.

## Branch Structure

- **`api` branch**: Main development branch - clean of AWS configs
- **`aws-deployment` branch**: Contains all AWS EB deployment files and configurations

## AWS Files in This Branch

### Core Configuration

- `.elasticbeanstalk/` - EB CLI configuration and logs
- `Dockerrun.aws.json` - Multi-container EB configuration
- `docker-compose.eb.yml` - EB-ready Docker Compose setup
- `Dockerfile.single` - Single-container approach for EB

### Deployment Tools

- `deploy-eb.sh` - Automated deployment preparation script
- `start-eb.sh` - Container startup script for EB
- `EB-DEPLOYMENT.md` - Comprehensive deployment documentation

### NGINX Configuration

- `nginx.eb.conf` - EB-optimized NGINX reverse proxy config

### Environment Files

- `.env.production` - Production environment variables template

## Workflow

### Development

1. Work on the `api` branch for all development
2. Keep AWS configurations isolated on this branch

### Deployment

1. Switch to `aws-deployment` branch: `git checkout aws-deployment`
2. Merge latest changes from `api`: `git merge api`
3. Run deployment: `./deploy-eb.sh`
4. Deploy to EB: `eb deploy`

### Keeping Branches in Sync

```bash
# Update aws-deployment with latest api changes
git checkout aws-deployment
git merge api

# Never merge aws-deployment back to api
# This keeps api branch clean
```

## Security Notes

- API keys are set via EB environment variables, not committed to git
- `.env.production` contains only placeholders
- Actual secrets are configured through `eb setenv` or EB Console

## EB Environment Details

- **Platform**: Docker Multi-container
- **Instance Type**: t3.small
- **Auto Scaling**: 1-4 instances
- **Load Balancer**: Application Load Balancer with SSL
- **Health Monitoring**: Enhanced

## Current Status

✅ EB application created: `cheeply-app`
✅ Docker configurations ready
✅ NGINX reverse proxy configured  
✅ Deployment scripts prepared
🔄 Environment deployment in progress

## Next Steps

1. Create new EB environment with Node.js platform (simpler than Docker)
2. Set environment variables via EB Console
3. Deploy application
4. Configure DuckDNS domain mapping
