# EtymoBreak AI - Postgres Schema

Use this schema for the profile flow only. The backend now stores user profiles in Postgres and writes quiz attempts to GCS instead of Postgres.

## Table: `profiles`

```sql
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    country TEXT NOT NULL,
    google_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

## What Each Column Stores

- `id`: Stable profile identifier derived from the Google subject.
- `google_sub`: Google account subject ID.
- `email`: Google email address.
- `first_name`: User's first name from the profile form.
- `last_name`: User's last name from the profile form.
- `country`: User-selected country.
- `google_json`: Raw Google identity JSON stored as text.
- `created_at`: Timestamp when the profile was first created.
- `updated_at`: Timestamp when the profile was last updated.

## What Is No Longer Stored in Postgres

- Quiz attempts
- Per-question answer history
- Quiz summaries beyond the profile record

Those records now live in GCS under a per-user folder.

## Recommended Render Setup

1. Create or attach a Render Postgres database to `etymobreak-ai-api`.
2. Use the **internal database URL** as `DATABASE_URL` inside the Render backend service.
3. For local development, use the **external database URL** instead.
4. The backend auto-creates the `profiles` table on startup, but you can also run the SQL manually in the Render SQL console.

## Notes

- The app currently uses Postgres only for user profiles.
- Quiz attempts are stored in GCS under `users/{google_sub}/quiz-attempts/`.
