#!/bin/bash

# EtymobreakAI PostgreSQL Backup Script
# Backs up remote Postgres instance with schema + data

set -e  # Exit on error

# Configuration
DB_HOST="dpg-d8lcu9rtqb8s73cadivg-a.singapore-postgres.render.com"
DB_PORT="5432"
DB_NAME="etymobreak_ai_postgres"
DB_USER="etymobreak_ai_postgres_user"
DB_PASSWORD="ncuJgDm4qcYBgXptgf32F6vhAtPWNyou"
BACKUP_DIR="$HOME/.etymo_backups"
LOG_FILE="$BACKUP_DIR/etymo_backup.log"
RETENTION_DAYS=30

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Backup filename with timestamp
BACKUP_FILE="$BACKUP_DIR/etymo_backup_$(date +%Y%m%d_%H%M%S).sql.gz"

# Function to log messages
log_message() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_message "Starting PostgreSQL backup..."

# Export password for non-interactive backup
export PGPASSWORD="$DB_PASSWORD"

# Perform backup with error handling
PG_DUMP="/opt/homebrew/Cellar/libpq/18.4/bin/pg_dump"

if $PG_DUMP \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --verbose \
  --no-password \
  2>> "$LOG_FILE" | gzip > "$BACKUP_FILE"; then

  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  log_message "✅ Backup completed successfully: $BACKUP_FILE ($BACKUP_SIZE)"

  # Delete old backups (retention policy)
  log_message "Cleaning up backups older than $RETENTION_DAYS days..."
  DELETED_COUNT=$(find "$BACKUP_DIR" -name "etymo_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
  log_message "Deleted $DELETED_COUNT old backup files"

  # Show current backups
  log_message "Current backups:"
  ls -lh "$BACKUP_DIR"/etymo_backup_*.sql.gz 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}' | tee -a "$LOG_FILE"

else
  log_message "❌ Backup failed!"
  exit 1
fi

unset PGPASSWORD
