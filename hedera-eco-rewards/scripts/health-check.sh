#!/bin/bash

# Health Check Script for Hedera Eco-Rewards System
set -e

# Configuration
HEALTH_ENDPOINT="http://localhost:3000/health"
TIMEOUT=10
MAX_RETRIES=3

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Check application health
check_application_health() {
    local retry=1
    
    while [[ $retry -le $MAX_RETRIES ]]; do
        log "Checking application health (attempt $retry/$MAX_RETRIES)..."
        
        if curl -f -s --max-time $TIMEOUT "$HEALTH_ENDPOINT" > /dev/null; then
            log "✓ Application is healthy"
            return 0
        else
            warn "✗ Application health check failed"
            if [[ $retry -lt $MAX_RETRIES ]]; then
                sleep 5
            fi
        fi
        
        ((retry++))
    done
    
    error "✗ Application is unhealthy after $MAX_RETRIES attempts"
    return 1
}

# Check database connectivity
check_database_health() {
    log "Checking database connectivity..."
    
    if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        log "✓ Database is healthy"
        return 0
    else
        error "✗ Database is unhealthy"
        return 1
    fi
}

# Check Redis connectivity
check_redis_health() {
    log "Checking Redis connectivity..."
    
    if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
        log "✓ Redis is healthy"
        return 0
    else
        error "✗ Redis is unhealthy"
        return 1
    fi
}

# Check container status
check_container_status() {
    log "Checking container status..."
    
    local containers=("hedera-eco-rewards" "postgres" "redis")
    local all_healthy=true
    
    for container in "${containers[@]}"; do
        local status=$(docker-compose ps -q "$container" | xargs docker inspect --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")
        
        case $status in
            "healthy")
                log "✓ $container is healthy"
                ;;
            "unhealthy")
                error "✗ $container is unhealthy"
                all_healthy=false
                ;;
            "starting")
                warn "⚠ $container is starting"
                ;;
            "not_found")
                error "✗ $container not found"
                all_healthy=false
                ;;
            *)
                warn "? $container status unknown: $status"
                ;;
        esac
    done
    
    if [[ "$all_healthy" == true ]]; then
        return 0
    else
        return 1
    fi
}

# Check system resources
check_system_resources() {
    log "Checking system resources..."
    
    # Check disk space
    local disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [[ $disk_usage -gt 90 ]]; then
        error "✗ Disk usage is critical: ${disk_usage}%"
        return 1
    elif [[ $disk_usage -gt 80 ]]; then
        warn "⚠ Disk usage is high: ${disk_usage}%"
    else
        log "✓ Disk usage is normal: ${disk_usage}%"
    fi
    
    # Check memory usage
    local mem_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    if [[ $mem_usage -gt 90 ]]; then
        error "✗ Memory usage is critical: ${mem_usage}%"
        return 1
    elif [[ $mem_usage -gt 80 ]]; then
        warn "⚠ Memory usage is high: ${mem_usage}%"
    else
        log "✓ Memory usage is normal: ${mem_usage}%"
    fi
    
    return 0
}

# Generate health report
generate_health_report() {
    log "Generating health report..."
    
    local report_file="health_report_$(date +%Y%m%d_%H%M%S).json"
    
    cat > "$report_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "application": {
    "status": "$(curl -f -s --max-time $TIMEOUT "$HEALTH_ENDPOINT" && echo "healthy" || echo "unhealthy")",
    "endpoint": "$HEALTH_ENDPOINT"
  },
  "database": {
    "status": "$(docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1 && echo "healthy" || echo "unhealthy")"
  },
  "redis": {
    "status": "$(docker-compose exec -T redis redis-cli ping > /dev/null 2>&1 && echo "healthy" || echo "unhealthy")"
  },
  "system": {
    "disk_usage": "$(df / | awk 'NR==2 {print $5}')",
    "memory_usage": "$(free | awk 'NR==2{printf "%.0f%%", $3*100/$2}')",
    "load_average": "$(uptime | awk -F'load average:' '{print $2}')"
  }
}
EOF
    
    log "Health report saved to: $report_file"
}

# Main function
main() {
    log "Starting comprehensive health check..."
    
    local exit_code=0
    
    # Run all health checks
    check_container_status || exit_code=1
    check_database_health || exit_code=1
    check_redis_health || exit_code=1
    check_application_health || exit_code=1
    check_system_resources || exit_code=1
    
    # Generate report
    generate_health_report
    
    if [[ $exit_code -eq 0 ]]; then
        log "🎉 All health checks passed!"
    else
        error "❌ Some health checks failed!"
    fi
    
    exit $exit_code
}

# Handle script arguments
case "${1:-}" in
    "app"|"application")
        check_application_health
        ;;
    "db"|"database")
        check_database_health
        ;;
    "redis")
        check_redis_health
        ;;
    "containers")
        check_container_status
        ;;
    "system")
        check_system_resources
        ;;
    "report")
        generate_health_report
        ;;
    "")
        main
        ;;
    *)
        echo "Usage: $0 [app|db|redis|containers|system|report]"
        echo "  app        - Check application health only"
        echo "  db         - Check database health only"
        echo "  redis      - Check Redis health only"
        echo "  containers - Check container status only"
        echo "  system     - Check system resources only"
        echo "  report     - Generate health report only"
        echo "  (no args)  - Run all health checks"
        exit 1
        ;;
esac