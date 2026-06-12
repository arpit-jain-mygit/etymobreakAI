# EtymoBreak AI - Postgres Schema

Use this schema for the profile flow and quiz history. The backend currently persists user profiles in `profiles` and completed quiz attempts in `quiz_history`.

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

## Table: `quiz_history`

```sql
CREATE TABLE IF NOT EXISTS quiz_history (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    google_sub TEXT NOT NULL,
    email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    country TEXT NOT NULL,
    quiz_scope TEXT NOT NULL,
    correct_count INTEGER NOT NULL,
    wrong_count INTEGER NOT NULL,
    marks INTEGER NOT NULL,
    percentage INTEGER NOT NULL,
    total_possible INTEGER NOT NULL,
    attempt_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

## What Each Column Stores

- `id`: Stable quiz attempt identifier.
- `profile_id`: Profile row ID for the signed-in user.
- `google_sub`: Google account subject ID for lookup.
- `email`: Google email address.
- `first_name`: Cached profile first name.
- `last_name`: Cached profile last name.
- `country`: Cached profile country.
- `quiz_scope`: The quiz scope, usually a letter or `ALL`.
- `correct_count`: Number of correct answers.
- `wrong_count`: Number of wrong answers.
- `marks`: Final score for the attempt.
- `percentage`: Percentage score for the attempt.
- `total_possible`: Maximum possible marks for the quiz.
- `attempt_json`: JSON snapshot of the completed quiz attempt.
- `created_at`: Timestamp when the quiz was submitted.
- `updated_at`: Timestamp when the quiz row was last updated.

## Recommended Render Setup

1. Create or attach a Render Postgres database to `etymobreak-ai-api`.
2. Use the **internal database URL** as `DATABASE_URL` inside the Render backend service.
3. For local development, use the **external database URL** instead.
4. The backend auto-creates these tables on startup, but you can also run the SQL manually in the Render SQL console.

## Notes

- The app currently uses two tables: `profiles` and `quiz_history`.
- Profile data is still cached locally in the browser for a faster return experience, but Postgres is the source of truth.
