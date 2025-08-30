# Hedera Eco-Rewards System - Deployment Guide

This guide covers the deployment and containerization of the Hedera Eco-Rewards System.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Monitoring and Health Checks](#monitoring-and-health-checks)
- [Backup and Recovery](#backup-and-recovery)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- Docker (>= 20.10)
- Docker Compose (>= 2.0)
- Node.js (>= 18.0) - for local development
- kubectl (for Kubernetes deployment)

### Environment Setup

1. Clone the repository
2. Copy environment files:
   ```bash
   cp .env.example .env.development
   cp .env.example .env.production
   ```
3. Update environment variables with your Hedera credentials

## Local Development

### Quick Start

```bash
# Start all services
./scripts/deploy.sh development

# Check health
./scripts/health-check.sh

# View logs
docker-compose logs -f hedera-eco-rewards
```

### Services

The development environment includes:

- **Application**: http://localhost:3000
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Jaeger**: http://localhost:16686
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### Development Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f [service-name]

# Execute commands in containers
docker-compose exec hedera-eco-rewards npm run test
docker-compose exec postgres psql -U postgres -d hedera_eco_rewards

# Rebuild application
docker-compose build hedera-eco-rewards
```

## Production Deployment

### Environment Configuration

1. Update `.env.production` with production values:
   ```bash
   # Database
   DATABASE_URL=postgresql://user:password@host:port/database
   
   # Hedera Mainnet
   HEDERA_NETWORK=mainnet
   HEDERA_OPERATOR_ID=0.0.YOUR_ACCOUNT_ID
   HEDERA_OPERATOR_KEY=YOUR_PRIVATE_KEY
   
   # Security
   JWT_SECRET=your_secure_jwt_secret
   ENCRYPTION_KEY=your_32_character_encryption_key
   ```

2. Deploy to production:
   ```bash
   ./scripts/deploy.sh production
   ```

### Production Features

- **Load Balancing**: Nginx reverse proxy
- **SSL/TLS**: HTTPS termination
- **Monitoring**: Prometheus + Grafana
- **Logging**: Structured JSON logging
- **Health Checks**: Comprehensive health monitoring
- **Auto-scaling**: Resource-based scaling

### Security Considerations

- All secrets stored in environment variables
- Non-root container execution
- Network isolation
- Rate limiting
- Input validation
- Encryption at rest and in transit

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (>= 1.20)
- kubectl configured
- Ingress controller (nginx)
- Cert-manager (for SSL)

### Deployment Steps

1. **Create namespace and secrets**:
   ```bash
   kubectl apply -f k8s/namespace.yaml
   kubectl apply -f k8s/secret.yaml
   kubectl apply -f k8s/configmap.yaml
   ```

2. **Deploy application**:
   ```bash
   kubectl apply -f k8s/deployment.yaml
   kubectl apply -f k8s/service.yaml
   kubectl apply -f k8s/ingress.yaml
   kubectl apply -f k8s/hpa.yaml
   ```

3. **Verify deployment**:
   ```bash
   kubectl get pods -n hedera-eco-rewards
   kubectl get services -n hedera-eco-rewards
   kubectl get ingress -n hedera-eco-rewards
   ```

### Scaling

The application supports horizontal pod autoscaling based on:
- CPU utilization (target: 70%)
- Memory utilization (target: 80%)
- Min replicas: 3
- Max replicas: 10

## Monitoring and Health Checks

### Health Check Endpoints

- **Application Health**: `GET /health`
- **Metrics**: `GET /metrics`
- **Readiness**: `GET /ready`
- **Liveness**: `GET /live`

### Monitoring Stack

1. **Prometheus**: Metrics collection
   - Application metrics
   - System metrics
   - Custom business metrics

2. **Grafana**: Visualization
   - Pre-configured dashboards
   - Alerting rules
   - Performance monitoring

3. **Jaeger**: Distributed tracing
   - Request flow tracking
   - Performance analysis
   - Error tracking

### Health Check Script

```bash
# Run comprehensive health check
./scripts/health-check.sh

# Check specific components
./scripts/health-check.sh app
./scripts/health-check.sh db
./scripts/health-check.sh redis
```

## Backup and Recovery

### Automated Backups

```bash
# Full backup
./scripts/backup.sh full

# Database only
./scripts/backup.sh database

# Redis only
./scripts/backup.sh redis

# Configuration files
./scripts/backup.sh config
```

### Backup Schedule

Recommended backup schedule:
- **Database**: Daily at 2 AM
- **Redis**: Every 6 hours
- **Logs**: Weekly
- **Full system**: Weekly

### Recovery

```bash
# List available backups
./scripts/backup.sh list

# Restore database
./scripts/backup.sh restore backups/database_backup_20240101_020000.sql.gz

# Restore full system
./scripts/backup.sh restore backups/full_backup_20240101_020000.tar.gz
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `HEDERA_OPERATOR_ID` | Hedera account ID | `0.0.123456` |
| `HEDERA_OPERATOR_KEY` | Hedera private key | `302e020100300506032b657004220420...` |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis connection | `redis://host:6379` |
| `JWT_SECRET` | JWT signing key | `your-secret-key` |
| `ENCRYPTION_KEY` | Data encryption key | `32-character-key` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | Application port |
| `LOG_LEVEL` | `info` | Logging level |
| `CACHE_TTL` | `3600` | Cache TTL in seconds |

## Troubleshooting

### Common Issues

1. **Container won't start**:
   ```bash
   # Check logs
   docker-compose logs hedera-eco-rewards
   
   # Check environment variables
   docker-compose exec hedera-eco-rewards env
   ```

2. **Database connection issues**:
   ```bash
   # Test database connectivity
   docker-compose exec postgres pg_isready -U postgres
   
   # Check database logs
   docker-compose logs postgres
   ```

3. **Hedera network issues**:
   ```bash
   # Verify Hedera credentials
   # Check network connectivity
   # Validate account balance
   ```

4. **Performance issues**:
   ```bash
   # Check resource usage
   docker stats
   
   # Monitor application metrics
   curl http://localhost:3000/metrics
   ```

### Log Analysis

```bash
# Application logs
docker-compose logs -f hedera-eco-rewards

# Database logs
docker-compose logs -f postgres

# System logs
journalctl -u docker

# Structured log analysis
docker-compose exec hedera-eco-rewards tail -f /app/logs/app.log | jq
```

### Performance Tuning

1. **Database optimization**:
   - Connection pooling
   - Query optimization
   - Index tuning

2. **Cache optimization**:
   - Redis memory management
   - Cache hit ratio monitoring
   - TTL optimization

3. **Application tuning**:
   - Node.js cluster mode
   - Memory management
   - CPU optimization

## Security Best Practices

1. **Secrets Management**:
   - Use environment variables
   - Rotate keys regularly
   - Use secure key storage

2. **Network Security**:
   - Use HTTPS/TLS
   - Implement rate limiting
   - Network segmentation

3. **Container Security**:
   - Non-root execution
   - Minimal base images
   - Regular updates

4. **Monitoring**:
   - Security event logging
   - Anomaly detection
   - Audit trails

## Support

For deployment issues:
1. Check the logs first
2. Verify environment configuration
3. Test network connectivity
4. Review resource usage
5. Consult the troubleshooting guide

For Hedera-specific issues:
- Check Hedera network status
- Verify account credentials
- Review transaction history
- Check account balance