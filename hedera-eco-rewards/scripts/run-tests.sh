#!/bin/bash

# Hedera Eco-Rewards System - Comprehensive Test Runner
# This script runs all test suites with proper setup and reporting

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_RESULTS_DIR="./test-results"
COVERAGE_DIR="./coverage"
LOG_FILE="$TEST_RESULTS_DIR/test-execution.log"

# Create directories
mkdir -p "$TEST_RESULTS_DIR"
mkdir -p "$COVERAGE_DIR"

# Initialize log file
echo "Test execution started at $(date)" > "$LOG_FILE"

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
    echo "$(date): $message" >> "$LOG_FILE"
}

# Function to run test suite
run_test_suite() {
    local suite_name=$1
    local command=$2
    local description=$3
    
    print_status "$BLUE" "🧪 Running $suite_name tests: $description"
    
    if eval "$command"; then
        print_status "$GREEN" "✅ $suite_name tests passed"
        return 0
    else
        print_status "$RED" "❌ $suite_name tests failed"
        return 1
    fi
}

# Function to check prerequisites
check_prerequisites() {
    print_status "$BLUE" "🔍 Checking prerequisites..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_status "$RED" "❌ Node.js is not installed"
        exit 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        print_status "$RED" "❌ npm is not installed"
        exit 1
    fi
    
    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        print_status "$YELLOW" "⚠️  Dependencies not found. Installing..."
        npm install
    fi
    
    print_status "$GREEN" "✅ Prerequisites check passed"
}

# Function to setup test environment
setup_test_environment() {
    print_status "$BLUE" "🔧 Setting up test environment..."
    
    # Set test environment variables
    export NODE_ENV=test
    export LOG_LEVEL=error
    
    # Check if test database is available
    if [ -n "$TEST_DATABASE_URL" ]; then
        print_status "$GREEN" "✅ Test database configured"
    else
        print_status "$YELLOW" "⚠️  TEST_DATABASE_URL not set, using default"
        export TEST_DATABASE_URL="postgresql://test:test@localhost:5432/hedera_eco_rewards_test"
    fi
    
    # Check if Redis is available for caching tests
    if [ -n "$TEST_REDIS_URL" ]; then
        print_status "$GREEN" "✅ Test Redis configured"
    else
        print_status "$YELLOW" "⚠️  TEST_REDIS_URL not set, using default"
        export TEST_REDIS_URL="redis://localhost:6379/1"
    fi
    
    print_status "$GREEN" "✅ Test environment setup complete"
}

# Function to generate test report
generate_test_report() {
    print_status "$BLUE" "📊 Generating test report..."
    
    local report_file="$TEST_RESULTS_DIR/test-summary.html"
    
    cat > "$report_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Hedera Eco-Rewards Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background-color: #f0f0f0; padding: 20px; border-radius: 5px; }
        .suite { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .passed { background-color: #d4edda; border-color: #c3e6cb; }
        .failed { background-color: #f8d7da; border-color: #f5c6cb; }
        .timestamp { color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Hedera Eco-Rewards System - Test Report</h1>
        <p class="timestamp">Generated on: $(date)</p>
    </div>
EOF

    # Add test results to report
    if [ -f "$TEST_RESULTS_DIR/unit-results.xml" ]; then
        echo '<div class="suite passed"><h2>Unit Tests</h2><p>✅ Passed</p></div>' >> "$report_file"
    fi
    
    if [ -f "$TEST_RESULTS_DIR/e2e-results.xml" ]; then
        echo '<div class="suite passed"><h2>End-to-End Tests</h2><p>✅ Passed</p></div>' >> "$report_file"
    fi
    
    if [ -f "$TEST_RESULTS_DIR/performance-results.xml" ]; then
        echo '<div class="suite passed"><h2>Performance Tests</h2><p>✅ Passed</p></div>' >> "$report_file"
    fi
    
    if [ -f "$TEST_RESULTS_DIR/security-results.xml" ]; then
        echo '<div class="suite passed"><h2>Security Tests</h2><p>✅ Passed</p></div>' >> "$report_file"
    fi
    
    if [ -f "$TEST_RESULTS_DIR/contract-results.xml" ]; then
        echo '<div class="suite passed"><h2>Contract Tests</h2><p>✅ Passed</p></div>' >> "$report_file"
    fi
    
    echo '</body></html>' >> "$report_file"
    
    print_status "$GREEN" "✅ Test report generated: $report_file"
}

# Main execution
main() {
    local test_type=${1:-"all"}
    local failed_suites=0
    
    print_status "$BLUE" "🚀 Starting Hedera Eco-Rewards System Test Suite"
    print_status "$BLUE" "Test type: $test_type"
    
    # Check prerequisites
    check_prerequisites
    
    # Setup test environment
    setup_test_environment
    
    case $test_type in
        "unit")
            run_test_suite "Unit" "npm run test:coverage" "Core business logic and domain tests"
            failed_suites=$?
            ;;
        "e2e")
            run_test_suite "E2E" "npm run test:e2e" "End-to-end user workflow tests"
            failed_suites=$?
            ;;
        "performance")
            run_test_suite "Performance" "npm run test:performance" "Load and stress testing"
            failed_suites=$?
            ;;
        "security")
            run_test_suite "Security" "npm run test:security" "Security vulnerability assessment"
            failed_suites=$?
            ;;
        "contract")
            run_test_suite "Contract" "npm run test:contract" "API contract compatibility tests"
            failed_suites=$?
            ;;
        "ci")
            print_status "$BLUE" "🔄 Running CI test suite..."
            
            run_test_suite "Unit" "npm run test:coverage" "Core business logic and domain tests"
            failed_suites=$((failed_suites + $?))
            
            run_test_suite "Contract" "npm run test:contract" "API contract compatibility tests"
            failed_suites=$((failed_suites + $?))
            
            run_test_suite "E2E" "npm run test:e2e" "Critical user workflows"
            failed_suites=$((failed_suites + $?))
            ;;
        "all")
            print_status "$BLUE" "🔄 Running comprehensive test suite..."
            
            run_test_suite "Unit" "npm run test:coverage" "Core business logic and domain tests"
            failed_suites=$((failed_suites + $?))
            
            run_test_suite "Contract" "npm run test:contract" "API contract compatibility tests"
            failed_suites=$((failed_suites + $?))
            
            run_test_suite "E2E" "npm run test:e2e" "End-to-end user workflow tests"
            failed_suites=$((failed_suites + $?))
            
            run_test_suite "Performance" "npm run test:performance" "Load and stress testing"
            failed_suites=$((failed_suites + $?))
            
            run_test_suite "Security" "npm run test:security" "Security vulnerability assessment"
            failed_suites=$((failed_suites + $?))
            ;;
        *)
            print_status "$RED" "❌ Unknown test type: $test_type"
            print_status "$YELLOW" "Available options: unit, e2e, performance, security, contract, ci, all"
            exit 1
            ;;
    esac
    
    # Generate test report
    generate_test_report
    
    # Final status
    if [ $failed_suites -eq 0 ]; then
        print_status "$GREEN" "🎉 All test suites passed successfully!"
        print_status "$GREEN" "📊 Coverage report: $COVERAGE_DIR/index.html"
        print_status "$GREEN" "📋 Test report: $TEST_RESULTS_DIR/test-summary.html"
        exit 0
    else
        print_status "$RED" "💥 $failed_suites test suite(s) failed"
        print_status "$YELLOW" "📋 Check logs: $LOG_FILE"
        exit 1
    fi
}

# Help function
show_help() {
    echo "Hedera Eco-Rewards System Test Runner"
    echo ""
    echo "Usage: $0 [test_type]"
    echo ""
    echo "Test types:"
    echo "  unit        - Run unit tests with coverage"
    echo "  e2e         - Run end-to-end tests"
    echo "  performance - Run performance and load tests"
    echo "  security    - Run security vulnerability tests"
    echo "  contract    - Run API contract tests"
    echo "  ci          - Run CI test suite (unit + contract + e2e)"
    echo "  all         - Run all test suites (default)"
    echo ""
    echo "Examples:"
    echo "  $0              # Run all tests"
    echo "  $0 unit         # Run only unit tests"
    echo "  $0 ci           # Run CI test suite"
    echo ""
}

# Check for help flag
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    show_help
    exit 0
fi

# Run main function
main "$@"