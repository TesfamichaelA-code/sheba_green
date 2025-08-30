#!/bin/bash

# System Health Check Script for Hedera Eco-Rewards Integration Testing
# This script monitors system health during integration testing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
HEALTH_CHECK_INTERVAL=30
MAX_RETRIES=3
TIMEOUT=10
LOG_FILE="system-health.log"

# Services to monitor
SERVICES=(
    "app:3000:/health"
    "postgres:5432"
    "redis:6379"
    "prometheus:9090/-/healthy"
    "grafana:3000/api/health"
)

# Metrics thresholds
CPU_THRESHOLD=80
MEMORY_THRESHOLD=80
DISK_THRESHOLD=90
RESPONSE_TIME_THRESHOLD=2000

echo -e "${BLUE}🏥 Starting System Health Monitoring${NC}"
echo "========================================"

# Function to print status with timestamp
print_status() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

print_success() {
    echo -e "${GREEN}✅ [$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

print_error() {
    echo -e "${RED}❌ [$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

print_warning() {
    echo -e "${YELLOW}⚠️  [$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

# Function to check service health
check_service_health() {
    local service_info="$1"
    local service_name=$(echo "$service_info" | cut -d':' -f1)
    local service_port=$(echo "$service_info" | cut -d':' -f2)
    local health_path=$(echo "$service_info" | cut -d':' -f3)
    
    if [ -z "$health_path" ]; then
        # Simple port check
        if nc -z "$service_name" "$service_port" 2>/dev/null; then
            print_success "$service_name:$service_port is reachable"
            return 0
        else
            print_error "$service_name:$service_port is not reachable"
            return 1
        fi
    else
        # HTTP health check
        local url="http://$service_name:$service_port$health_path"
        local start_time=$(date +%s%3N)
        
        if curl -f -s --max-time "$TIMEOUT" "$url" > /dev/null 2>&1; then
            local end_time=$(date +%s%3N)
            local response_time=$((end_time - start_time))
            
            if [ "$response_time" -gt "$RESPONSE_TIME_THRESHOLD" ]; then
                print_warning "$service_name health check passed but slow (${response_time}ms)"
            else
                print_success "$service_name health check passed (${response_time}ms)"
            fi
            return 0
        else
            print_error "$service_name health check failed at $url"
            return 1
        fi
    fi
}

# Function to check system resources
check_system_resources() {
    print_status "Checking system resources..."
    
    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}')
    if (( $(echo "$cpu_usage > $CPU_THRESHOLD" | bc -l) )); then
        print_warning "High CPU usage: ${cpu_usage}%"
    else
        print_success "CPU usage: ${cpu_usage}%"
    fi
    
    # Memory usage
    local memory_info=$(free | grep Mem)
    local total_memory=$(echo "$memory_info" | awk '{print $2}')
    local used_memory=$(echo "$memory_info" | awk '{print $3}')
    local memory_usage=$(echo "scale=1; $used_memory * 100 / $total_memory" | bc)
    
    if (( $(echo "$memory_usage > $MEMORY_THRESHOLD" | bc -l) )); then
        print_warning "High memory usage: ${memory_usage}%"
    else
        print_success "Memory usage: ${memory_usage}%"
    fi
    
    # Disk usage
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk_usage" -gt "$DISK_THRESHOLD" ]; then
        print_warning "High disk usage: ${disk_usage}%"
    else
        print_success "Disk usage: ${disk_usage}%"
    fi
    
    # Load average
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    print_status "Load average: $load_avg"
}

# Function to check Docker containers
check_docker_containers() {
    print_status "Checking Docker containers..."
    
    if ! command -v docker &> /dev/null; then
        print_warning "Docker not available"
        return
    fi
    
    local containers=$(docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}")
    echo "$containers" | while IFS= read -r line; do
        if [[ "$line" == *"hedera-eco-rewards"* ]]; then
            local container_name=$(echo "$line" | awk '{print $1}')
            local status=$(echo "$line" | awk '{print $2}')
            
            if [[ "$status" == "Up"* ]]; then
                print_success "Container $container_name is running"
            else
                print_error "Container $container_name status: $status"
            fi
        fi
    done
}

# Function to check application metrics
check_application_metrics() {
    print_status "Checking application metrics..."
    
    # Check if Prometheus is available
    if curl -f -s --max-time "$TIMEOUT" "http://prometheus:9090/-/healthy" > /dev/null 2>&1; then
        # Query application metrics
        local metrics_url="http://prometheus:9090/api/v1/query"
        
        # Check HTTP request rate
        local request_rate=$(curl -s "$metrics_url?query=rate(http_requests_total[5m])" | jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || echo "0")
        print_status "HTTP request rate: $request_rate req/sec"
        
        # Check error rate
        local error_rate=$(curl -s "$metrics_url?query=rate(http_requests_total{status=~\"5..\"}[5m])" | jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || echo "0")
        if (( $(echo "$error_rate > 0.1" | bc -l) )); then
            print_warning "High error rate: $error_rate errors/sec"
        else
            print_success "Error rate: $error_rate errors/sec"
        fi
        
        # Check response time
        local avg_response_time=$(curl -s "$metrics_url?query=rate(http_request_duration_seconds_sum[5m])/rate(http_request_duration_seconds_count[5m])" | jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || echo "0")
        local avg_response_time_ms=$(echo "$avg_response_time * 1000" | bc)
        
        if (( $(echo "$avg_response_time_ms > $RESPONSE_TIME_THRESHOLD" | bc -l) )); then
            print_warning "High average response time: ${avg_response_time_ms}ms"
        else
            print_success "Average response time: ${avg_response_time_ms}ms"
        fi
    else
        print_warning "Prometheus not available for metrics collection"
    fi
}

# Function to check Hedera network connectivity
check_hedera_connectivity() {
    print_status "Checking Hedera network connectivity..."
    
    if [ -z "$HEDERA_ACCOUNT_ID" ] || [ -z "$HEDERA_PRIVATE_KEY" ]; then
        print_warning "Hedera credentials not configured"
        return
    fi
    
    # This would require a Node.js script to properly test Hedera connectivity
    # For now, we'll just check if the environment variables are set
    print_success "Hedera credentials configured"
}

# Function to generate health report
generate_health_report() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local report_file="health-report-$(date '+%Y%m%d-%H%M%S').json"
    
    cat > "$report_file" << EOF
{
  "timestamp": "$timestamp",
  "system": {
    "cpu_usage": "$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}')%",
    "memory_usage": "$(free | grep Mem | awk '{printf "%.1f", $3*100/$2}')%",
    "disk_usage": "$(df / | tail -1 | awk '{print $5}')%",
    "load_average": "$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')"
  },
  "services": [
EOF
    
    local first=true
    for service in "${SERVICES[@]}"; do
        if [ "$first" = true ]; then
            first=false
        else
            echo "," >> "$report_file"
        fi
        
        local service_name=$(echo "$service" | cut -d':' -f1)
        if check_service_health "$service" > /dev/null 2>&1; then
            echo "    {\"name\": \"$service_name\", \"status\": \"healthy\"}" >> "$report_file"
        else
            echo "    {\"name\": \"$service_name\", \"status\": \"unhealthy\"}" >> "$report_file"
        fi
    done
    
    cat >> "$report_file" << EOF
  ]
}
EOF
    
    print_status "Health report generated: $report_file"
}

# Main monitoring loop
main() {
    local check_count=0
    local failed_checks=0
    
    print_status "Starting continuous health monitoring (interval: ${HEALTH_CHECK_INTERVAL}s)"
    
    while true; do
        check_count=$((check_count + 1))
        print_status "Health check #$check_count"
        
        local current_failed=0
        
        # Check all services
        for service in "${SERVICES[@]}"; do
            if ! check_service_health "$service"; then
                current_failed=$((current_failed + 1))
            fi
        done
        
        # Check system resources
        check_system_resources
        
        # Check Docker containers
        check_docker_containers
        
        # Check application metrics
        check_application_metrics
        
        # Check Hedera connectivity
        check_hedera_connectivity
        
        # Update failed checks counter
        if [ "$current_failed" -gt 0 ]; then
            failed_checks=$((failed_checks + 1))
            print_warning "Health check #$check_count completed with $current_failed failures"
        else
            print_success "Health check #$check_count completed successfully"
        fi
        
        # Generate periodic health reports
        if [ $((check_count % 10)) -eq 0 ]; then
            generate_health_report
        fi
        
        # Exit if running in CI mode
        if [ "$CI" = "true" ]; then
            break
        fi
        
        sleep "$HEALTH_CHECK_INTERVAL"
    done
    
    print_status "Health monitoring completed. Total checks: $check_count, Failed: $failed_checks"
    
    if [ "$failed_checks" -gt 0 ]; then
        exit 1
    fi
}

# Handle script termination
cleanup() {
    print_status "Health monitoring stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --interval)
            HEALTH_CHECK_INTERVAL="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --once)
            CI=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --interval SECONDS  Health check interval (default: 30)"
            echo "  --timeout SECONDS   Request timeout (default: 10)"
            echo "  --once              Run once and exit (for CI)"
            echo "  --help              Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main function
main "$@"