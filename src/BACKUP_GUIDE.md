# PostgreSQL Backup Guide

## Overview

Automated backup script for EtymobreakAI PostgreSQL database hosted on Render.com. Backs up complete database with schema (DDL) and data (DML) in compressed format with automatic retention policy.

**Database Details:**
- Host: `dpg-d8lcu9rtqb8s73cadivg-a.singapore-postgres.render.com`
- Database: `etymobreak_ai_postgres`
- User: `etymobreak_ai_postgres_user`

---

## Prerequisites

### 1. PostgreSQL Client Tools

Install `libpq` (PostgreSQL client utilities):

```bash
# Install via Homebrew (macOS)
brew install libpq

# Add to PATH
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Verify installation
pg_dump --version
```

**Output:** `pg_dump (PostgreSQL) 18.4`

### 2. Verify Database Connection

Test connection to remote database:

```bash
export PGPASSWORD="ncuJgDm4qcYBgXptgf32F6vhAtPWNyou"
psql -h dpg-d8lcu9rtqb8s73cadivg-a.singapore-postgres.render.com \
     -U etymobreak_ai_postgres_user \
     -d etymobreak_ai_postgres \
     -c "SELECT version();"
```

**Expected output:**
```
version
------------------------------------------------------------
PostgreSQL 18.4 (Debian 18.4-1.pgdg12+u1) on x86_64-pc-linux-gnu...
(1 row)
```

---

## Script Details

**File:** `etymo_backup.sh`

**What it does:**
1. ✅ Connects to remote PostgreSQL database
2. ✅ Creates full database dump (schema + data) with `pg_dump`
3. ✅ Compresses backup with gzip (~95% compression)
4. ✅ Stores in `~/.etymo_backups/` directory
5. ✅ Auto-deletes backups older than 30 days
6. ✅ Logs all actions with timestamps

**Configuration:**
```bash
BACKUP_DIR="$HOME/.etymo_backups"          # Backup location
RETENTION_DAYS=30                          # Keep backups for 30 days
LOG_FILE="$BACKUP_DIR/etymo_backup.log"   # Log file
```

---

## How to Execute

### Manual Execution

```bash
# Make script executable (first time only)
chmod +x src/etymo_backup.sh

# Run backup
./src/etymo_backup.sh

# Or with absolute path
/Users/arpit/Documents/claude/transcription-workspace/etymobreakAI/src/etymo_backup.sh
```

### Scheduled Execution (Weekly)

See [SCHEDULED_BACKUP.md](SCHEDULED_BACKUP.md) for weekly automation setup.

---

## Expected Log Output

### Successful Backup

```
[2026-06-29 21:08:11] Starting PostgreSQL backup...
[2026-06-29 21:08:16] ✅ Backup completed successfully: /Users/arpit/.etymo_backups/etymo_backup_20260629_210811.sql.gz (192K)
[2026-06-29 21:08:16] Cleaning up backups older than 30 days...
[2026-06-29 21:08:16] Deleted        0 old backup files
[2026-06-29 21:08:16] Current backups:
  /Users/arpit/.etymo_backups/etymo_backup_20260629_210603.sql.gz (20B)
  /Users/arpit/.etymo_backups/etymo_backup_20260629_210811.sql.gz (159K)
```

### View Logs

```bash
# View full log
cat ~/.etymo_backups/etymo_backup.log

# View last 20 lines
tail -20 ~/.etymo_backups/etymo_backup.log

# Watch logs in real-time during backup
tail -f ~/.etymo_backups/etymo_backup.log
```

### Success Indicators

✅ **Successful backup includes:**
- `✅ Backup completed successfully` message
- Backup file size > 100KB (compressed database)
- `✅ [timestamp] Current backups:` listing recent backup files

### Error Handling

```bash
# Failed connection
❌ Backup failed!
# Check: Database credentials, network connectivity, firewall rules

# Permission denied
mkdir: /backups: Read-only file system
# Use ~/. etymo_backups instead of /backups

# pg_dump not found
pg_dump: command not found
# Run: brew install libpq && export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
```

---

## Backup File Location & Format

```bash
# Backup directory
~/.etymo_backups/

# Filename format
etymo_backup_YYYYMMDD_HHMMSS.sql.gz

# Example
etymo_backup_20260629_210811.sql.gz

# File size (typical)
150-200 KB (compressed)
~5-10 MB (uncompressed)
```

---

## Restore from Backup

### Restore to New Database

```bash
# Decompress backup
gunzip -c ~/.etymo_backups/etymo_backup_20260629_210811.sql.gz > backup.sql

# Restore to Render database
export PGPASSWORD="ncuJgDm4qcYBgXptgf32F6vhAtPWNyou"
psql -h dpg-d8lcu9rtqb8s73cadivg-a.singapore-postgres.render.com \
     -U etymobreak_ai_postgres_user \
     -d etymobreak_ai_postgres \
     -f backup.sql
```

### Verify Restoration

```bash
export PGPASSWORD="ncuJgDm4qcYBgXptgf32F6vhAtPWNyou"
psql -h dpg-d8lcu9rtqb8s73cadivg-a.singapore-postgres.render.com \
     -U etymobreak_ai_postgres_user \
     -d etymobreak_ai_postgres \
     -c "SELECT COUNT(*) FROM confident_words;"
```

---

## Backup Verification

### Test Backup Integrity

```bash
# Verify backup file is valid
gunzip -t ~/.etymo_backups/etymo_backup_20260629_210811.sql.gz

# Output: (no error = valid backup)
```

### List All Backups

```bash
ls -lh ~/.etymo_backups/etymo_backup_*.sql.gz
```

### Check Backup Size

```bash
du -sh ~/.etymo_backups/
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `pg_dump: command not found` | Install libpq: `brew install libpq` |
| Connection timeout | Check network/firewall to Render.com |
| Permission denied on backup dir | Use `~/.etymo_backups` instead of `/backups` |
| Backup file is very small (<1KB) | Check database connection and credentials |
| Backup takes too long | Database may be large; wait 5-10 minutes |

---

## Best Practices

1. ✅ **Test backups regularly:** Restore and verify data integrity
2. ✅ **Monitor backup size:** Should be 150-200KB compressed
3. ✅ **Keep multiple backups:** Script retains 30 days by default
4. ✅ **Store offsite:** Consider uploading backups to S3/cloud storage
5. ✅ **Alert on failure:** Set up monitoring for failed backups

---

## Next Steps

- See [SCHEDULED_BACKUP.md](SCHEDULED_BACKUP.md) to set up weekly automated backups
- Configure additional retention policies if needed
- Set up email notifications for backup failures (optional)
