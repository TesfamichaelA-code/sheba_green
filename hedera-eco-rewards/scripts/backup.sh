#!/bin/bash

# Backup Script for Hedera Eco-Rewards System
set -e

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

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
    exit 1
}

# Create backup directory
create_backup_dir() {
    if [[ ! -d "$BACKUP_DIR" ]]; then
        mkdir -p "$BACKUP_DIR"
        log "Created backup directory: $BACKUP_DIR"
    fi
}

# Backup database
backup_database() {
    log "Starting database backup..."
    
    local backup_file="$BACKUP_DIR/database_backup_$TIMESTAMP.sql"
    
    if docker-compose exec -T postgres pg_dump -U postgres -h localhost hedera_eco_rewards > "$backup_file"; then
        log "Database backup completed: $backup_file"
        
        # Compress the backup
        gzip "$backup_file"
        log "Database backup compressed: ${backup_file}.gz"
    else
        error "Database backup failed"
    fi
}

# Backup Redis data
backup_redis() {
    log "Starting Redis backup..."
    
    local backup_file="$BACKUP_DIR/redis_backup_$TIMESTAMP.rdb"
    
    # Create Redis backup
    docker-compose exec -T redis redis-cli BGSAVE
    sleep 5
    
    # Copy the RDB file
    if docker cp "$(docker-compose ps -q redis):/data/dump.rdb" "$backup_file"; then
        log "Redis backup completed: $backup_file"
        
        # Compress the backup
        gzip "$backup_file"
        log "Redis backup compressed: ${backup_file}.gz"
    else
        error "Redis backup failed"
    fi
}

# Backup application logs
backup_logs() {
    log "Starting logs backup..."
    
    local logs_backup="$BACKUP_DIR/logs_backup_$TIMESTAMP.tar.gz"
    
    if [[ -d "./logs" ]]; then
        tar -czf "$logs_backup" -C . logs/
        log "Logs backup completed: $logs_backup"
    else
        warn "No logs directory found, skipping logs backup"
    fi
}

# Backup configuration files
backup_config() {
    log "Starting configuration backup..."
    
    local config_backup="$BACKUP_DIR/config_backup_$TIMESTAMP.tar.gz"
    
    # Create list of config files to backup
    local config_files=(
        ".env.production"
        ".env.development"
        "docker-compose.yml"
        "docker-compose.prod.yml"
        "nginx/nginx.conf"
        "monitoring/prometheus.yml"
        "monitoring/grafana"
    )
    
    # Create temporary directory for config files
    local temp_dir=$(mktemp -d)
    
    for file in "${config_files[@]}"; do
        if [[ -e "$file" ]]; then
            # Create directory structure in temp
            local dir_path=$(dirname "$file")
            mkdir -p "$temp_dir/$dir_path"
            
            # Copy file or directory
            cp -r "$file" "$temp_dir/$file"
        fi
    done
    
    # Create archive
    if tar -czf "$config_backup" -C "$temp_dir" .; then
        log "Configuration backup completed: $config_backup"
    else
        error "Configuration backup failed"
    fi
    
    # Cleanup temp directory
    rm -rf "$temp_dir"
}

# Create full system backup
backup_full() {
    log "Starting full system backup..."
    
    local full_backup="$BACKUP_DIR/full_backup_$TIMESTAMP"
    mkdir -p "$full_backup"
    
    # Backup database
    local db_backup="$full_backup/database.sql"
    docker-compose exec -T postgres pg_dump -U postgres -h localhost hedera_eco_rewards > "$db_backup"
    
    # Backup Redis
    local redis_backup="$full_backup/redis.rdb"
    docker-compose exec -T redis redis-cli BGSAVE
    sleep 5
    docker cp "$(docker-compose ps -q redis):/data/dump.rdb" "$redis_backup"
    
    # Backup logs
    if [[ -d "./logs" ]]; then
        cp -r "./logs" "$full_backup/"
    fi
    
    # Backup configuration
    local config_files=(
        ".env.production"
        ".env.development" 
        "docker-compose.yml"
        "docker-compose.prod.yml"
        "nginx"
        "monitoring"
    )
    
    for file in "${config_files[@]}"; do
        if [[ -e "$file" ]]; then
            cp -r "$file" "$full_backup/"
        fi
    done
    
    # Create compressed archive
    tar -czf "${full_backup}.tar.gz" -C "$BACKUP_DIR" "$(basename "$full_backup")"
    rm -rf "$full_backup"
    
    log "Full backup completed: ${full_backup}.tar.gz"
}

# Cleanup old backups
cleanup_old_backups() {
    log "Cleaning up old backups (older than $RETENTION_DAYS days)..."
    
    if [[ -d "$BACKUP_DIR" ]]; then
        find "$BACKUP_DIR" -name "*.gz" -type f -mtime +$RETENTION_DAYS -delete
        find "$BACKUP_DIR" -name "*.sql" -type f -mtime +$RETENTION_DAYS -delete
        find "$BACKUP_DIR" -name "*.rdb" -type f -mtime +$RETENTION_DAYS -delete
        
        log "Old backups cleaned up"
    fi
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"
    
    if [[ ! -f "$backup_file" ]]; then
        error "Backup file not found: $backup_file"
    fi
    
    log "Verifying backup integrity: $backup_file"
    
    case "$backup_file" in
        *.sql.gz)
            if gunzip -t "$backup_file"; then
                log "✓ SQL backup integrity verified"
            else
                error "✗ SQL backup integrity check failed"
            fi
            ;;
        *.tar.gz)
            if tar -tzf "$backup_file" > /dev/null; then
                log "✓ Archive backup integrity verified"
            else
                error "✗ Archive backup integrity check failed"
            fi
            ;;
        *.rdb.gz)
            if gunzip -t "$backup_file"; then
                log "✓ Redis backup integrity verified"
            else
                error "✗ Redis backup integrity check failed"
            fi
            ;;
        *)
            warn "Unknown backup format, skipping integrity check"
            ;;
    esac
}

# List available backups
list_backups() {
    log "Available backups in $BACKUP_DIR:"
    
    if [[ -d "$BACKUP_DIR" ]]; then
        ls -lh "$BACKUP_DIR"/*.gz 2>/dev/null || log "No backups found"
    else
        log "Backup directory does not exist"
    fi
}

# Restore from backup
restore_backup() {
    local backup_file="$1"
    
    if [[ -z "$backup_file" ]]; then
        error "Please specify backup file to restore"
    fi
    
    if [[ ! -f "$backup_file" ]]; then
        error "Backup file not found: $backup_file"
    fi
    
    log "Restoring from backup: $backup_file"
    
    case "$backup_file" in
        *database*.sql.gz)
            log "Restoring database backup..."
            gunzip -c "$backup_file" | docker-compose exec -T postgres psql -U postgres -d hedera_eco_rewards
            log "Database restore completed"
            ;;
        *redis*.rdb.gz)
            log "Restoring Redis backup..."
            # Stop Redis, restore file, start Redis
            docker-compose stop redis
            gunzip -c "$backup_file" > /tmp/dump.rdb
            docker cp /tmp/dump.rdb "$(docker-compose ps -q redis):/data/dump.rdb"
            docker-compose start redis
            rm /tmp/dump.rdb
            log "Redis restore completed"
            ;;
        *full*.tar.gz)
            log "Restoring full backup..."
            local temp_dir=$(mktemp -d)
            tar -xzf "$backup_file" -C "$temp_dir"
            
            # Restore database
            if [[ -f "$temp_dir/database.sql" ]]; then
                cat "$temp_dir/database.sql" | docker-compose exec -T postgres psql -U postgres -d hedera_eco_rewards
            fi
            
            # Restore Redis
            if [[ -f "$temp_dir/redis.rdb" ]]; then
                docker-compose stop redis
                docker cp "$temp_dir/redis.rdb" "$(docker-compose ps -q redis):/data/dump.rdb"
                docker-compose start redis
            fi
            
            rm -rf "$temp_dir"
            log "Full restore completed"
            ;;
        *)
            error "Unknown backup format"
            ;;
    esac
}

# Main function
main() {
    create_backup_dir
    
    case "${1:-}" in
        "database"|"db")
            backup_database
            ;;
        "redis")
            backup_redis
            ;;
        "logs")
            backup_logs
            ;;
        "config")
            backup_config
            ;;
        "full")
            backup_full
            ;;
        "cleanup")
            cleanup_old_backups
            ;;
        "list")
            list_backups
            ;;
        "verify")
            verify_backup "$2"
            ;;
        "restore")
            restore_backup "$2"
            ;;
        "")
            # Default: backup database and Redis
            backup_database
            backup_redis
            cleanup_old_backups
            ;;
        *)
            echo "Usage: $0 [database|redis|logs|config|full|cleanup|list|verify|restore] [file]"
            echo "  database  - Backup database only"
            echo "  redis     - Backup Redis only"
            echo "  logs      - Backup logs only"
            echo "  config    - Backup configuration files only"
            echo "  full      - Create full system backup"
            echo "  cleanup   - Remove old backups"
            echo "  list      - List available backups"
            echo "  verify    - Verify backup integrity"
            echo "  restore   - Restore from backup"
            echo "  (no args) - Backup database and Redis"
            exit 1
            ;;
    esac
    
    log "Backup operation completed successfully"
}

main "$@"