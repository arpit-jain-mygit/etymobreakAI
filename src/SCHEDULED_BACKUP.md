# Weekly Scheduled PostgreSQL Backup

## Setup Instructions

### Option 1: Using Cron (Recommended for Production)

#### 1. Install Script

```bash
# Copy to user bin directory
mkdir -p ~/.local/bin
cp src/etymo_backup.sh ~/.local/bin/

# Make executable
chmod +x ~/.local/bin/etymo_backup.sh
```

#### 2. Create Cron Job

```bash
# Edit crontab
crontab -e

# Add this line for weekly backup at 2 AM on Sundays
0 2 * * 0 ~/.local/bin/etymo_backup.sh
```

**Cron Format Breakdown:**
```
0 2 * * 0  ~/.local/bin/etymo_backup.sh
│ │ │ │ │
│ │ │ │ └─ Day of week (0 = Sunday)
│ │ │ └─── Month (*)
│ │ └───── Day of month (*)
│ └─────── Hour (2 = 2 AM)
└───────── Minute (0)
```

#### 3. Verify Cron Job

```bash
# List cron jobs
crontab -l

# View cron logs (macOS)
log stream --predicate 'process == "cron"' --level debug
```

#### 4. Monitor Backups

```bash
# Check backup log
tail -f ~/.etymo_backups/etymo_backup.log

# List backups
ls -lh ~/.etymo_backups/etymo_backup_*.sql.gz
```

---

### Option 2: Using Launchd (macOS Native)

#### 1. Create Launchd Plist

Create `~/Library/LaunchAgents/com.etymobreak.backup.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.etymobreak.backup</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>/Users/arpit/.local/bin/etymo_backup.sh</string>
    </array>
    
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>0</integer>
        <key>Weekday</key>
        <integer>0</integer>
    </dict>
    
    <key>StandardOutPath</key>
    <string>/Users/arpit/.etymo_backups/backup.log</string>
    
    <key>StandardErrorPath</key>
    <string>/Users/arpit/.etymo_backups/backup_error.log</string>
</dict>
</plist>
```

#### 2. Load Launchd Job

```bash
# Load the job
launchctl load ~/Library/LaunchAgents/com.etymobreak.backup.plist

# Verify it's loaded
launchctl list | grep etymobreak

# Test immediately (optional)
launchctl start com.etymobreak.backup
```

#### 3. Monitor

```bash
# View logs
tail -f ~/.etymo_backups/backup.log

# Unload job (if needed)
launchctl unload ~/Library/LaunchAgents/com.etymobreak.backup.plist
```

---

### Option 3: Using Claude Code Schedule (Cloud-based)

See the main project for Claude Code scheduled backup setup.

---

## Schedule Variations

### Daily Backup (Midnight)
```bash
# Crontab
0 0 * * * ~/.local/bin/etymo_backup.sh
```

### Twice Weekly (Sunday & Wednesday, 2 AM)
```bash
# Crontab
0 2 * * 0,3 ~/.local/bin/etymo_backup.sh
```

### Every 6 Hours
```bash
# Crontab
0 */6 * * * ~/.local/bin/etymo_backup.sh
```

### Monday-Friday at 1 AM
```bash
# Crontab
0 1 * * 1-5 ~/.local/bin/etymo_backup.sh
```

---

## Backup Retention Policy

Script automatically deletes backups older than 30 days.

**To change retention:**

Edit `etymo_backup.sh`:
```bash
RETENTION_DAYS=30  # Change to desired number of days
```

---

## Email Notifications (Optional)

### Setup Email Alerts for Failed Backups

Edit `etymo_backup.sh` and add before the last line:

```bash
# Send email on failure
if [ $? -ne 0 ]; then
    echo "Backup failed at $(date)" | mail -s "EtymobreakAI Backup Failed" your-email@example.com
fi
```

Requires `mail` command configured on system.

---

## Verify Scheduled Backup is Running

```bash
# Check last backup timestamp
ls -lt ~/.etymo_backups/etymo_backup_*.sql.gz | head -1

# If file is recent (within last 24 hours), backup is working
stat -f "%Sm" ~/.etymo_backups/etymo_backup_*.sql.gz | sort -r | head -1
```

---

## Troubleshooting Scheduled Backups

### Backup Not Running

```bash
# Check cron logs
log stream --predicate 'process == "cron"' --level debug

# Check if script is executable
ls -l ~/.local/bin/etymo_backup.sh
# Should show: -rwxr-xr-x (755 permissions)

# Run script manually to test
~/.local/bin/etymo_backup.sh
```

### PATH Issues in Cron

If pg_dump not found, update script with full path or add PATH to crontab:

```bash
# Edit crontab
crontab -e

# Add PATH before backup command
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
0 2 * * 0 ~/.local/bin/etymo_backup.sh
```

### Permission Denied

```bash
# Fix permissions
chmod +x ~/.local/bin/etymo_backup.sh
chmod 755 ~/.etymo_backups
```

---

## Monitoring Dashboard

Monitor backups with this command:

```bash
# Create alias for easy monitoring
alias backup-status='echo "=== Last Backup ===" && ls -lh ~/.etymo_backups/etymo_backup_*.sql.gz | tail -1 && echo "" && echo "=== Recent Backups ===" && ls -lh ~/.etymo_backups/etymo_backup_*.sql.gz | head -5 && echo "" && echo "=== Backup Log ===" && tail -5 ~/.etymo_backups/etymo_backup.log'

# Run backup status
backup-status
```

---

## Backup Lifecycle

```
Day 1:   Backup created → stored in ~/.etymo_backups/
Day 7:   Weekly backup runs
Day 14:  Weekly backup runs
Day 21:  Weekly backup runs
Day 28:  Weekly backup runs
Day 30:  First backup deleted (retention policy)
Day 31+: Older backups automatically deleted
```

---

## Best Practices

1. ✅ **Test restores monthly:** Verify backup integrity
2. ✅ **Monitor log file:** Set up alerts for errors
3. ✅ **Track backup size:** Should be consistent (~150-200KB)
4. ✅ **Offsite storage:** Upload to S3/cloud after backup
5. ✅ **Document schedule:** Keep this guide updated with your setup
