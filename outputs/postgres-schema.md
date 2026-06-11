# EtymoBreak AI - Postgres Schema

Use this schema for the profile flow. The backend currently persists user profiles in a single table named `profiles`.

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

## Recommended Render Setup

1. Create or attach a Render Postgres database to `etymobreak-ai-api`.
2. Use the **internal database URL** as `DATABASE_URL` inside the Render backend service.
3. For local development, use the **external database URL** instead.
4. The backend auto-creates this table on startup, but you can also run the SQL manually in the Render SQL console.

## Notes

- The app only needs this one table for the current onboarding flow.
- Profile data is still cached locally in the browser for a faster return experience, but Postgres is the source of truth.
