#!/bin/bash

# Hedera Eco-Rewards System Integration Test Suite
# This script runs comprehensive system integration and testing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_ENV="test"
HEDERA_NETWORK="testnet"
LOG_FILE="integration-test-results.log"
REPORT_DIR="test-reports"

echo -e "${BLUE}🚀 Starting Hedera Eco-Rewards System Integration Tests${NC}"
echo "=================================================="

# Function to print status
print_status() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    REQUIRED_VERSION="18.0.0"
    if ! npx semver -r ">=$REQUIRED_VERSION" "$NODE_VERSION" &> /dev/null; then
        print_error "Node.js version $NODE_VERSION is not supported. Required: >=$REQUIRED_VERSION"
        exit 1
    fi
    
    # Check npm dependencies
    if [ ! -d "node_modules" ]; then
        print_status "Installing dependencies..."
        npm ci
    fi
    
    # Check environment variables
    if [ -z "$HEDERA_ACCOUNT_ID" ] || [ -z "$HEDERA_PRIVATE_KEY" ]; then
        print_warning "Hedera testnet credentials not found. Some tests may be skipped."
    fi
    
    print_success "Prerequisites check completed"
}

# Function to setup test environment
setup_test_environment() {
    print_status "Setting up test environment..."
    
    # Create test reports directory
    mkdir -p "$REPORT_DIR"
    
    # Set environment variables
    export NODE_ENV="$TEST_ENV"
    export HEDERA_NETWORK="$HEDERA_NETWORK"
    export LOG_LEVEL="error"
    
    # Start test database if needed
    if command -v docker &> /dev/null; then
        print_status "Starting test database..."
        docker-compose -f docker-compose.test.yml up -d postgres redis
        sleep 5
    fi
    
    # Run database migrations
    print_status "Running database migrations..."
    npm run migrate:test
    
    print_success "Test environment setup completed"
}

# Function to run unit tests
run_unit_tests() {
    print_status "Running unit tests..."
    
    if npm run test:unit -- --run --reporter=json --outputFile="$REPORT_DIR/unit-test-results.json"; then
        print_success "Unit tests passed"
        return 0
    else
        print_error "Unit tests failed"
        return 1
    fi
}

# Function to run integration tests
run_integration_tests() {
    print_status "Running integration tests..."
    
    local test_files=(
        "tests/integration/system-integration.test.ts"
        "tests/integration/scalability.test.ts"
        "tests/integration/security-audit.test.ts"
    )
    
    local failed_tests=()
    
    for test_file in "${test_files[@]}"; do
        print_status "Running $test_file..."
        
        if npm run test:integration -- --run "$test_file" --reporter=json --outputFile="$REPORT_DIR/$(basename "$test_file" .test.ts)-results.json"; then
            print_success "$(basename "$test_file") passed"
        else
            print_error "$(basename "$test_file") failed"
            failed_tests+=("$test_file")
        fi
    done
    
    if [ ${#failed_tests[@]} -eq 0 ]; then
        print_success "All integration tests passed"
        return 0
    else
        print_error "Failed tests: ${failed_tests[*]}"
        return 1
    fi
}

# Function to run end-to-end tests
run_e2e_tests() {
    print_status "Running end-to-end tests..."
    
    # Start the application server
    print_status "Starting application server..."
    npm run start:test &
    SERVER_PID=$!
    
    # Wait for server to start
    sleep 10
    
    # Check if server is running
    if ! curl -f http://localhost:3000/health &> /dev/null; then
        print_error "Application server failed to start"
        kill $SERVER_PID 2>/dev/null || true
        return 1
    fi
    
    # Run E2E tests
    if npm run test:e2e -- --run --reporter=json --outputFile="$REPORT_DIR/e2e-test-results.json"; then
        print_success "End-to-end tests passed"
        local e2e_result=0
    else
        print_error "End-to-end tests failed"
        local e2e_result=1
    fi
    
    # Stop the server
    kill $SERVER_PID 2>/dev/null || true
    
    return $e2e_result
}

# Function to run performance tests
run_performance_tests() {
    print_status "Running performance tests..."
    
    if npm run test:performance -- --run --reporter=json --outputFile="$REPORT_DIR/performance-test-results.json"; then
        print_success "Performance tests passed"
        return 0
    else
        print_error "Performance tests failed"
        return 1
    fi
}

# Function to run security tests
run_security_tests() {
    print_status "Running security tests..."
    
    if npm run test:security -- --run --reporter=json --outputFile="$REPORT_DIR/security-test-results.json"; then
        print_success "Security tests passed"
        return 0
    else
        print_error "Security tests failed"
        return 1
    fi
}

# Function to generate test report
generate_test_report() {
    print_status "Generating test report..."
    
    local report_file="$REPORT_DIR/integration-test-report.html"
    
    cat > "$report_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Hedera Eco-Rewards Integration Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background-color: #f0f0f0; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .success { background-color: #d4edda; border-color: #c3e6cb; }
        .error { background-color: #f8d7da; border-color: #f5c6cb; }
        .warning { background-color: #fff3cd; border-color: #ffeaa7; }
        .timestamp { color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Hedera Eco-Rewards System Integration Test Report</h1>
        <p class="timestamp">Generated on: $(date)</p>
        <p>Environment: $TEST_ENV | Network: $HEDERA_NETWORK</p>
    </div>
EOF
    
    # Add test results sections
    for result_file in "$REPORT_DIR"/*-results.json; do
        if [ -f "$result_file" ]; then
            local test_name=$(basename "$result_file" -results.json)
            echo "    <div class=\"section\">" >> "$report_file"
            echo "        <h2>$test_name Results</h2>" >> "$report_file"
            echo "        <pre>$(cat "$result_file" | jq '.' 2>/dev/null || cat "$result_file")</pre>" >> "$report_file"
            echo "    </div>" >> "$report_file"
        fi
    done
    
    echo "</body></html>" >> "$report_file"
    
    print_success "Test report generated: $report_file"
}

# Function to cleanup test environment
cleanup_test_environment() {
    print_status "Cleaning up test environment..."
    
    # Stop test services
    if command -v docker &> /dev/null; then
        docker-compose -f docker-compose.test.yml down
    fi
    
    # Clean up test data
    if [ -f ".env.test" ]; then
        source .env.test
        if [ -n "$TEST_DATABASE_URL" ]; then
            print_status "Cleaning up test database..."
            # Add database cleanup commands here
        fi
    fi
    
    print_success "Cleanup completed"
}

# Function to run health checks
run_health_checks() {
    print_status "Running system health checks..."
    
    local health_checks=(
        "Database connectivity"
        "Redis connectivity"
        "Hedera testnet connectivity"
        "External service availability"
    )
    
    local failed_checks=()
    
    # Database health check
    if npm run health:database &> /dev/null; then
        print_success "Database connectivity: OK"
    else
        print_error "Database connectivity: FAILED"
        failed_checks+=("Database")
    fi
    
    # Redis health check
    if npm run health:redis &> /dev/null; then
        print_success "Redis connectivity: OK"
    else
        print_error "Redis connectivity: FAILED"
        failed_checks+=("Redis")
    fi
    
    # Hedera testnet health check
    if npm run health:hedera &> /dev/null; then
        print_success "Hedera testnet connectivity: OK"
    else
        print_warning "Hedera testnet connectivity: FAILED (some tests may be skipped)"
    fi
    
    if [ ${#failed_checks[@]} -gt 0 ]; then
        print_error "Health check failures: ${failed_checks[*]}"
        return 1
    fi
    
    return 0
}

# Main execution function
main() {
    local start_time=$(date +%s)
    local exit_code=0
    
    # Trap to ensure cleanup on exit
    trap cleanup_test_environment EXIT
    
    echo "Starting integration test suite at $(date)" > "$LOG_FILE"
    
    # Run test phases
    check_prerequisites || exit_code=1
    
    if [ $exit_code -eq 0 ]; then
        setup_test_environment || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        run_health_checks || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        run_unit_tests || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        run_integration_tests || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        run_e2e_tests || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        run_performance_tests || exit_code=1
    fi
    
    if [ $exit_code -eq 0 ]; then
        run_security_tests || exit_code=1
    fi
    
    # Generate report regardless of test results
    generate_test_report
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo "=================================================="
    if [ $exit_code -eq 0 ]; then
        print_success "All integration tests completed successfully!"
        print_success "Total execution time: ${duration}s"
    else
        print_error "Integration tests completed with failures"
        print_error "Total execution time: ${duration}s"
        print_error "Check the test reports in $REPORT_DIR for details"
    fi
    
    echo "Test results logged to: $LOG_FILE"
    echo "Detailed reports available in: $REPORT_DIR"
    
    exit $exit_code
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            TEST_ENV="$2"
            shift 2
            ;;
        --network)
            HEDERA_NETWORK="$2"
            shift 2
            ;;
        --skip-cleanup)
            SKIP_CLEANUP=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --env ENV          Set test environment (default: test)"
            echo "  --network NETWORK  Set Hedera network (default: testnet)"
            echo "  --skip-cleanup     Skip cleanup after tests"
            echo "  --help             Show this help message"
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