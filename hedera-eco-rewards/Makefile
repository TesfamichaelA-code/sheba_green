# Hedera Eco-Rewards System Makefile

.PHONY: help build test deploy clean

# Default target
help:
	@echo "Available commands:"
	@echo "  build       - Build the application"
	@echo "  test        - Run tests"
	@echo "  dev         - Start development environment"
	@echo "  prod        - Start production environment"
	@echo "  deploy-dev  - Deploy to development"
	@echo "  deploy-prod - Deploy to production"
	@echo "  health      - Check application health"
	@echo "  backup      - Create backup"
	@echo "  clean       - Clean up Docker resources"
	@echo "  k8s-deploy  - Deploy to Kubernetes"
	@echo "  k8s-clean   - Clean Kubernetes resources"

# Build application
build:
	npm run build
	docker build -t hedera-eco-rewards:latest .

# Run tests
test:
	npm run test

# Development environment
dev:
	docker-compose up -d
	@echo "Development environment started"
	@echo "Application: http://localhost:3000"
	@echo "Grafana: http://localhost:3001"
	@echo "Prometheus: http://localhost:9090"

# Production environment
prod:
	docker-compose -f docker-compose.prod.yml up -d
	@echo "Production environment started"

# Deploy to development
deploy-dev:
	./scripts/deploy.sh development

# Deploy to production
deploy-prod:
	./scripts/deploy.sh production

# Health check
health:
	./scripts/health-check.sh

# Create backup
backup:
	./scripts/backup.sh full

# Clean up Docker resources
clean:
	docker-compose down -v
	docker system prune -f
	docker volume prune -f

# Kubernetes deployment
k8s-deploy:
	kubectl apply -f k8s/

# Clean Kubernetes resources
k8s-clean:
	kubectl delete -f k8s/

# Stop all services
stop:
	docker-compose down

# View logs
logs:
	docker-compose logs -f

# Database operations
db-migrate:
	npm run db:migrate

db-seed:
	npm run db:seed

# Monitoring
monitor:
	@echo "Opening monitoring dashboards..."
	@echo "Grafana: http://localhost:3001"
	@echo "Prometheus: http://localhost:9090"
	@echo "Jaeger: http://localhost:16686"