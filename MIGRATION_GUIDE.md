# GCS to Postgres Migration Guide

This guide explains how to migrate existing confident and needs-focus words from GCS bucket to Postgres database.

**Choose your approach:**
- **Option A**: Migrate from **local JSON files** (folder of JSON files) - See [Local JSON Migration](#local-json-migration)
- **Option B**: Migrate directly from **GCS bucket** - See [GCS Direct Migration](#gcs-direct-migration)

## Why Migrate?

- **Performance**: Database queries (1-50ms) vs GCS scans (2000-5000ms)
- **User Experience**: First request is also fast (no cold start)
- **Scalability**: Database handles large datasets better than GCS

---

## Local JSON Migration

### Recommended for most users!

If you have a folder of exported JSON files from GCS, use this approach.

### Prerequisites

1. **Environment Variable**:
   - `DATABASE_URL` or `DATABASE_URL_EXTERNAL` - Postgres connection string

2. **Python Package**:
   ```bash
   pip install psycopg
   ```
   (That's it! No GCP credentials needed)

3. **Folder Structure**:
   ```
   /path/to/json/files/
   └── users/
       ├── 100219244219086008584/
       │   ├── confident-words/
       │   │   ├── word1.json
       │   │   ├── word2.json
       │   │   └── ...
       │   └── needs-focus-words/
       │       ├── word3.json
       │       └── ...
       ├── 987654321234567890/
       │   ├── confident-words/
       │   └── needs-focus-words/
       └── ...
   ```

### How to Run

**1. Prepare your JSON folder**

You should have all JSON files exported/downloaded from GCS in this structure:
```
users/
├── user1_id/
│   ├── confident-words/*.json
│   └── needs-focus-words/*.json
├── user2_id/
│   ├── confident-words/*.json
│   └── needs-focus-words/*.json
└── ...
```

**2. Set environment variable**

```bash
export DATABASE_URL="postgresql://user:pass@host:port/database"
```

**3. Run migration**

```bash
cd etymobreakAI/backend

python migrate_local_json_to_db.py /path/to/json/files
```

**Example:**
```bash
python migrate_local_json_to_db.py ~/Downloads/gcs-backup
python migrate_local_json_to_db.py /tmp/etymobreak-words
python migrate_local_json_to_db.py ./json-files
```

### Example Output

```
============================================================
Local JSON to Postgres Migration
============================================================
Database: etymobreak-prod.postgres.render.com
JSON Folder: /Users/username/Downloads/gcs-backup

Found 157 confident word files
Found 203 needs-focus word files

Migrating confident words from local JSON files...
  Migrated 50 confident words...
  Migrated 100 confident words...
✓ Migrated 157 confident words (0 errors)

Migrating needs-focus words from local JSON files...
  Migrated 50 needs-focus words...
  Migrated 100 needs-focus words...
✓ Migrated 203 needs-focus words (1 error)

============================================================
Migration Complete!
Total migrated: 360 words
============================================================
```

### Advantages

✓ **No GCP credentials needed**
✓ **No internet access to GCS required**
✓ **Faster** (reads from local disk)
✓ **Flexible** (can migrate any time)
✓ **Works offline** (once files are downloaded)

---

## GCS Direct Migration

1. **Environment Variables Set**: 
   - `DATABASE_URL` or `DATABASE_URL_EXTERNAL` - Postgres connection string
   - `GCP_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS_JSON` - GCP credentials
   - `GCS_BUCKET_NAME` or default to `etymobreak-ai-quizzes`

2. **Python Packages**:
   ```bash
   pip install psycopg google-cloud-storage google-auth
   ```

## Migration Steps

### Option 1: Run Locally (Recommended for testing)

```bash
cd etymobreakAI/backend

# Set environment variables (if not already set)
export DATABASE_URL="postgresql://user:pass@localhost/db"
export GCP_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'

# Run migration
python migrate_gcs_to_db.py
```

### Option 2: Run on Render (Production)

**Using Render's Run Button or Shell:**

```bash
# SSH into Render service
# Then run:
cd /app && python backend/migrate_gcs_to_db.py
```

**Or use the Render CLI:**

```bash
# From your local machine with Render CLI installed
render shell --service=etymobreak-api-service
python backend/migrate_gcs_to_db.py
```

### Option 3: Docker/Container

```bash
docker run -e DATABASE_URL="..." \
           -e GCP_SERVICE_ACCOUNT_JSON="..." \
           etymobreak-api:latest \
           python backend/migrate_gcs_to_db.py
```

## What the Migration Does

1. **Connects to GCS bucket**
   - Lists all `users/*/confident-words/` JSON files
   - Lists all `users/*/needs-focus-words/` JSON files

2. **For each file:**
   - Downloads JSON content
   - Extracts: query, mode, title, analysis, timestamps, etc.
   - Inserts into Postgres with `ON CONFLICT ... DO UPDATE`
   - Deduplicates by (google_sub, query, mode)

3. **Handles errors gracefully**
   - Continues on individual file errors
   - Reports summary at end
   - Prints first 5 errors for debugging

## Example Output

```
============================================================
GCS to Postgres Migration
============================================================
Database: etymobreak-prod.postgres.render.com
GCS Bucket: etymobreak-ai-quizzes

Migrating confident words from GCS to Postgres...
  Migrated 50 confident words...
  Migrated 100 confident words...
✓ Migrated 157 confident words (0 errors)

Migrating needs-focus words from GCS to Postgres...
  Migrated 50 needs-focus words...
  Migrated 100 needs-focus words...
✓ Migrated 203 needs-focus words (1 error)

============================================================
Migration Complete!
Total migrated: 360 words
============================================================
```

## Safety Features

✓ **Non-destructive**: Only inserts/updates, never deletes
✓ **Idempotent**: Can run multiple times safely
✓ **Conflict handling**: Uses `ON CONFLICT ... DO UPDATE` for duplicate words
✓ **Error resilient**: Continues on individual file errors
✓ **Transactional**: All inserts committed atomically

## Verification

After migration, verify the data:

```bash
# Connect to Postgres
psql $DATABASE_URL

# Check counts
SELECT COUNT(*) FROM confident_words;
SELECT COUNT(*) FROM needs_focus_words;

# Check sample data
SELECT query, mode, updated_at FROM confident_words LIMIT 5;
SELECT query, mode, updated_at FROM needs_focus_words LIMIT 5;

# Check by user
SELECT google_sub, COUNT(*) as count 
FROM confident_words 
GROUP BY google_sub 
ORDER BY count DESC;
```

## Rollback (if needed)

If something goes wrong, the migration is non-destructive:

1. **Delete migrated data** (optional):
   ```sql
   DELETE FROM confident_words;
   DELETE FROM needs_focus_words;
   ```

2. **Re-run migration** (safe to do multiple times)

## Performance Expectations

- **Small dataset** (<100 words): 5-10 seconds
- **Medium dataset** (100-500 words): 10-30 seconds  
- **Large dataset** (500+ words): 30-60 seconds

The API will still work during/after migration. The database queries will be used for subsequent requests after migration completes.

## Troubleshooting

### `DATABASE_URL is not configured`
- Set `DATABASE_URL` or `DATABASE_URL_EXTERNAL` environment variable
- Test: `psql $DATABASE_URL -c "SELECT 1"`

### `GCP quiz bucket is not configured`
- Set `GCP_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- Test: `gsutil ls gs://etymobreak-ai-quizzes/users/`

### `Could not connect to Postgres`
- Check connection string format: `postgresql://user:pass@host:port/database`
- Check firewall/network access from client to Postgres
- Verify credentials

### Tables don't exist
- Run `ensure_schema()` first, or
- Restart the API once to auto-create tables

## After Migration

1. **Verify data**: Check counts match expectations
2. **Test API**: Call `/confident-words` and `/needs-focus-words` endpoints
3. **Monitor performance**: Should be much faster now
4. **Keep GCS**: Data remains in GCS as backup (optional cleanup later)

## Support

If migration fails:

1. Check error messages in script output
2. Verify environment variables
3. Test individual components:
   ```bash
   python -c "from google.cloud import storage; print(storage.Client().list_buckets())"
   python -c "import psycopg; print(psycopg.connect('$DATABASE_URL'))"
   ```
4. Run with verbose logging (add `import logging; logging.basicConfig(level=logging.DEBUG)`)
