#!/bin/bash

# Hedera Eco-Rewards Deployment Script
set -e

# Configuration
ENVIRONMENT=${1:-development}
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env.${ENVIRONMENT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Validate environment
validate_environment() {
    log "Validating environment: $ENVIRONMENT"
    
    if [[ "$ENVIRONMENT" == "production" ]]; then
        COMPOSE_FILE="docker-compose.prod.yml"
    fi
    
    if [[ ! -f "$ENV_FILE" ]]; then
        error "Environment file $ENV_FILE not found"
    fi
    
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        error "Docker compose file $COMPOSE_FILE not found"
    fi
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed"
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
    fi
}

# Build application
build_application() {
    log "Building application..."
    
    # Copy environment file
    cp "$ENV_FILE" .env
    
    # Build Docker images
    docker-compose -f "$COMPOSE_FILE" build --no-cache
    
    log "Application built successfully"
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."
    
    # Wait for database to be ready
    docker-compose -f "$COMPOSE_FILE" up -d postgres
    sleep 10
    
    # Run migrations
    docker-compose -f "$COMPOSE_FILE" run --rm hedera-eco-rewards npm run migrate
    
    log "Database migrations completed"
}

# Deploy services
deploy_services() {
    log "Deploying services..."
    
    # Stop existing services
    docker-compose -f "$COMPOSE_FILE" down
    
    # Start services
    docker-compose -f "$COMPOSE_FILE" up -d
    
    # Wait for services to be healthy
    log "Waiting for services to be healthy..."
    sleep 30
    
    # Check service health
    check_service_health
    
    log "Services deployed successfully"
}

# Check service health
check_service_health() {
    log "Checking service health..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f http://localhost:3000/health &> /dev/null; then
            log "Application is healthy"
            return 0
        fi
        
        warn "Health check attempt $attempt/$max_attempts failed, retrying..."
        sleep 10
        ((attempt++))
    done
    
    error "Application failed health checks"
}

# Cleanup old images
cleanup() {
    log "Cleaning up old Docker images..."
    
    # Remove dangling images
    docker image prune -f
    
    # Remove unused volumes (be careful in production)
    if [[ "$ENVIRONMENT" != "production" ]]; then
        docker volume prune -f
    fi
    
    log "Cleanup completed"
}

# Backup database (production only)
backup_database() {
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log "Creating database backup..."
        
        local backup_file="backup_$(date +%Y%m%d_%H%M%S).sql"
        docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U postgres hedera_eco_rewards > "backups/$backup_file"
        
        log "Database backup created: $backup_file"
    fi
}

# Main deployment function
main() {
    log "Starting deployment for environment: $ENVIRONMENT"
    
    validate_environment
    check_prerequisites
    
    # Create backup in production
    backup_database
    
    build_application
    run_migrations
    deploy_services
    cleanup
    
    log "Deployment completed successfully!"
    log "Application is running at: http://localhost:3000"
    
    if [[ "$ENVIRONMENT" == "development" ]]; then
        log "Grafana dashboard: http://localhost:3001 (admin/admin)"
        log "Prometheus: http://localhost:9090"
        log "Jaeger: http://localhost:16686"
    fi
}

# Handle script arguments
case "${1:-}" in
    "development"|"production"|"staging")
        main
        ;;
    "health")
        check_service_health
        ;;
    "cleanup")
        cleanup
        ;;
    *)
        echo "Usage: $0 {development|production|staging|health|cleanup}"
        echo "  development - Deploy in development mode"
        echo "  production  - Deploy in production mode"
        echo "  staging     - Deploy in staging mode"
        echo "  health      - Check application health"
        echo "  cleanup     - Clean up Docker resources"
        exit 1
        ;;
esac