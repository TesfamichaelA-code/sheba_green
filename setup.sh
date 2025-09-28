#!/bin/bash

# Hedera Eco-Rewards System Setup Script
# This script sets up the development environment

set -e

echo "🌱 Setting up Hedera Eco-Rewards System..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if Node.js is installed
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18+ is required. Current version: $(node --version)"
        exit 1
    fi
    
    print_status "Node.js $(node --version) is installed"
}

# Check if PostgreSQL is installed
check_postgres() {
    if ! command -v psql &> /dev/null; then
        print_warning "PostgreSQL is not installed. Please install PostgreSQL 13+ first."
        print_info "On macOS: brew install postgresql"
        print_info "On Ubuntu: sudo apt-get install postgresql postgresql-contrib"
        exit 1
    fi
    
    print_status "PostgreSQL is installed"
}

# Check if Redis is installed
check_redis() {
    if ! command -v redis-server &> /dev/null; then
        print_warning "Redis is not installed. Please install Redis 6+ first."
        print_info "On macOS: brew install redis"
        print_info "On Ubuntu: sudo apt-get install redis-server"
        exit 1
    fi
    
    print_status "Redis is installed"
}

# Install dependencies
install_dependencies() {
    print_info "Installing Node.js dependencies..."
    npm install
    print_status "Dependencies installed"
}

# Setup environment file
setup_env() {
    if [ ! -f .env ]; then
        print_info "Creating environment file..."
        cp env.example .env
        print_warning "Please update .env file with your configuration"
        print_info "Required: HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, DATABASE_URL, JWT_SECRET"
    else
        print_status "Environment file already exists"
    fi
}

# Setup database
setup_database() {
    print_info "Setting up database..."
    
    # Check if database exists
    if psql -lqt | cut -d \| -f 1 | grep -qw hedera_eco_rewards; then
        print_status "Database 'hedera_eco_rewards' already exists"
    else
        print_info "Creating database 'hedera_eco_rewards'..."
        createdb hedera_eco_rewards
        print_status "Database created"
    fi
    
    # Run schema
    print_info "Running database schema..."
    psql -d hedera_eco_rewards -f database/schema.sql
    print_status "Database schema applied"
}

# Start services
start_services() {
    print_info "Starting Redis server..."
    if ! pgrep -x "redis-server" > /dev/null; then
        redis-server --daemonize yes
        print_status "Redis server started"
    else
        print_status "Redis server is already running"
    fi
    
    print_info "Starting PostgreSQL server..."
    if ! pgrep -x "postgres" > /dev/null; then
        print_warning "PostgreSQL server is not running. Please start it manually."
        print_info "On macOS: brew services start postgresql"
        print_info "On Ubuntu: sudo systemctl start postgresql"
    else
        print_status "PostgreSQL server is running"
    fi
}

# Build the project
build_project() {
    print_info "Building TypeScript project..."
    npm run build
    print_status "Project built successfully"
}

# Run tests
run_tests() {
    print_info "Running tests..."
    if npm test; then
        print_status "All tests passed"
    else
        print_warning "Some tests failed, but continuing setup"
    fi
}

# Main setup function
main() {
    echo "🚀 Starting Hedera Eco-Rewards System setup..."
    echo ""
    
    check_node
    check_postgres
    check_redis
    echo ""
    
    install_dependencies
    echo ""
    
    setup_env
    echo ""
    
    setup_database
    echo ""
    
    start_services
    echo ""
    
    build_project
    echo ""
    
    run_tests
    echo ""
    
    print_status "Setup completed successfully!"
    echo ""
    print_info "Next steps:"
    echo "1. Update .env file with your Hedera account details"
    echo "2. Start the application: npm run dev"
    echo "3. Test the API: curl http://localhost:3000/health"
    echo ""
    print_info "For production deployment, use Docker:"
    echo "docker-compose up -d"
    echo ""
    print_info "API Documentation: http://localhost:3000/api/v1"
    echo ""
    print_status "Happy coding! 🌱"
}

# Run main function
main "$@"
