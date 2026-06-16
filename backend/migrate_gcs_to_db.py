#!/usr/bin/env python3
"""
Migration script to populate Postgres database with confident and needs-focus words from GCS bucket.

Usage:
    python migrate_gcs_to_db.py

This script:
1. Lists all confident-words and needs-focus-words JSON files from GCS
2. Parses each JSON file
3. Inserts data into confident_words and needs_focus_words tables
4. Handles deduplication via UNIQUE constraints
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from typing import Any

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    print("ERROR: psycopg not installed. Install with: pip install psycopg")
    exit(1)

try:
    from google.cloud import storage
    from google.oauth2 import service_account
except ImportError:
    print("ERROR: google-cloud-storage not installed. Install with: pip install google-cloud-storage")
    exit(1)


def database_url() -> str:
    primary = os.getenv("DATABASE_URL", "").strip()
    if primary:
        return primary
    return os.getenv("DATABASE_URL_EXTERNAL", "").strip()


def _connect():
    url = database_url()
    if not url:
        raise Exception("DATABASE_URL is not configured.")
    try:
        return psycopg.connect(url)
    except Exception as exc:
        raise Exception(f"Could not connect to Postgres: {exc}") from exc


def _bucket_name() -> str:
    return (
        os.getenv("GCP_ETYMOBREAK_BUCKET", "").strip()
        or os.getenv("GCP_QUIZ_BUCKET", "").strip()
        or os.getenv("GCS_BUCKET_NAME", "").strip()
        or os.getenv("QUIZ_BUCKET_NAME", "").strip()
        or "etymobreak-ai-quizzes"
    )


def _bucket_client() -> tuple[Any, str]:
    bucket_name = _bucket_name()
    if not bucket_name:
        raise Exception("GCP quiz bucket is not configured.")

    raw_credentials = (
        os.getenv("GCP_SERVICE_ACCOUNT_JSON", "").strip()
        or os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "").strip()
    )
    if raw_credentials:
        try:
            credentials_info = json.loads(raw_credentials)
        except Exception as exc:
            raise Exception(f"Invalid GCP service account JSON: {exc}") from exc

        credentials = service_account.Credentials.from_service_account_info(credentials_info)
        project_id = str(credentials_info.get("project_id", "")).strip() or os.getenv("GCP_PROJECT_ID", "").strip()
        return storage.Client(project=project_id or None, credentials=credentials), bucket_name

    return storage.Client(), bucket_name


def migrate_confident_words() -> int:
    """Migrate confident words from GCS to Postgres."""
    print("Migrating confident words from GCS to Postgres...")

    client, bucket_name = _bucket_client()
    bucket = client.bucket(bucket_name)

    migrated_count = 0
    error_count = 0

    with _connect() as conn:
        with conn.cursor() as cursor:
            for blob in client.list_blobs(bucket, prefix="users/"):
                if "/confident-words/" not in blob.name:
                    continue

                try:
                    # Parse blob name to extract google_sub
                    parts = blob.name.split("/")
                    if len(parts) < 3:
                        continue

                    google_sub = parts[1]

                    # Download and parse JSON
                    raw = blob.download_as_text()
                    payload = json.loads(raw)

                    if not isinstance(payload, dict):
                        continue

                    # Extract fields
                    profile_id = str(payload.get("profileId", "")).strip() or f"profile-{google_sub}"
                    email = ""
                    player = payload.get("player", {})
                    if isinstance(player, dict):
                        email = str(player.get("email", "")).strip()

                    query = str(payload.get("query", "")).strip()
                    mode = str(payload.get("mode", "")).strip() or "word"
                    title = str(payload.get("title", "")).strip()
                    analysis = json.dumps(payload.get("analysis", {}))
                    created_at = str(payload.get("createdAt", "")).strip() or blob.time_created.isoformat()
                    updated_at = str(payload.get("updatedAt", "")).strip() or (blob.updated.isoformat() if blob.updated else created_at)

                    if not query:
                        continue

                    # Insert into database
                    word_id = str(payload.get("id", "")).strip() or f"confident-{google_sub}-{query}"

                    cursor.execute(
                        """
                        INSERT INTO confident_words (
                            id, profile_id, google_sub, email, query, mode, title, analysis,
                            bucket_object_name, bucket_uri, created_at, updated_at
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        ON CONFLICT (google_sub, query, mode) DO UPDATE SET
                            title = EXCLUDED.title,
                            analysis = EXCLUDED.analysis,
                            bucket_object_name = EXCLUDED.bucket_object_name,
                            bucket_uri = EXCLUDED.bucket_uri,
                            updated_at = EXCLUDED.updated_at
                        """,
                        (
                            word_id,
                            profile_id,
                            google_sub,
                            email,
                            query,
                            mode,
                            title,
                            analysis,
                            blob.name,
                            f"gs://{bucket_name}/{blob.name}",
                            created_at,
                            updated_at,
                        ),
                    )
                    migrated_count += 1

                    if migrated_count % 50 == 0:
                        print(f"  Migrated {migrated_count} confident words...")

                except Exception as e:
                    error_count += 1
                    if error_count <= 5:  # Only print first 5 errors
                        print(f"  Error processing {blob.name}: {e}")

        conn.commit()

    print(f"✓ Migrated {migrated_count} confident words ({error_count} errors)")
    return migrated_count


def migrate_needs_focus_words() -> int:
    """Migrate needs-focus words from GCS to Postgres."""
    print("Migrating needs-focus words from GCS to Postgres...")

    client, bucket_name = _bucket_client()
    bucket = client.bucket(bucket_name)

    migrated_count = 0
    error_count = 0

    with _connect() as conn:
        with conn.cursor() as cursor:
            for blob in client.list_blobs(bucket, prefix="users/"):
                if "/needs-focus-words/" not in blob.name:
                    continue

                try:
                    # Parse blob name to extract google_sub
                    parts = blob.name.split("/")
                    if len(parts) < 3:
                        continue

                    google_sub = parts[1]

                    # Download and parse JSON
                    raw = blob.download_as_text()
                    payload = json.loads(raw)

                    if not isinstance(payload, dict):
                        continue

                    # Extract fields
                    profile_id = str(payload.get("profileId", "")).strip() or f"profile-{google_sub}"
                    email = ""
                    player = payload.get("player", {})
                    if isinstance(player, dict):
                        email = str(player.get("email", "")).strip()

                    query = str(payload.get("query", "")).strip()
                    mode = str(payload.get("mode", "")).strip() or "word"
                    title = str(payload.get("title", "")).strip()
                    analysis = json.dumps(payload.get("analysis", {}))
                    created_at = str(payload.get("createdAt", "")).strip() or blob.time_created.isoformat()
                    updated_at = str(payload.get("updatedAt", "")).strip() or (blob.updated.isoformat() if blob.updated else created_at)

                    if not query:
                        continue

                    # Insert into database
                    word_id = str(payload.get("id", "")).strip() or f"focus-{google_sub}-{query}"

                    cursor.execute(
                        """
                        INSERT INTO needs_focus_words (
                            id, profile_id, google_sub, email, query, mode, title, analysis,
                            bucket_object_name, bucket_uri, created_at, updated_at
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        ON CONFLICT (google_sub, query, mode) DO UPDATE SET
                            title = EXCLUDED.title,
                            analysis = EXCLUDED.analysis,
                            bucket_object_name = EXCLUDED.bucket_object_name,
                            bucket_uri = EXCLUDED.bucket_uri,
                            updated_at = EXCLUDED.updated_at
                        """,
                        (
                            word_id,
                            profile_id,
                            google_sub,
                            email,
                            query,
                            mode,
                            title,
                            analysis,
                            blob.name,
                            f"gs://{bucket_name}/{blob.name}",
                            created_at,
                            updated_at,
                        ),
                    )
                    migrated_count += 1

                    if migrated_count % 50 == 0:
                        print(f"  Migrated {migrated_count} needs-focus words...")

                except Exception as e:
                    error_count += 1
                    if error_count <= 5:  # Only print first 5 errors
                        print(f"  Error processing {blob.name}: {e}")

        conn.commit()

    print(f"✓ Migrated {migrated_count} needs-focus words ({error_count} errors)")
    return migrated_count


def main() -> None:
    """Run the migration."""
    print("=" * 60)
    print("GCS to Postgres Migration")
    print("=" * 60)

    try:
        # Check environment
        db_url = database_url()
        if not db_url:
            print("ERROR: DATABASE_URL not configured")
            return

        print(f"Database: {db_url.split('@')[1] if '@' in db_url else 'unknown'}")
        print(f"GCS Bucket: {_bucket_name()}")
        print()

        # Run migrations
        confident_count = migrate_confident_words()
        focus_count = migrate_needs_focus_words()

        print()
        print("=" * 60)
        print(f"Migration Complete!")
        print(f"Total migrated: {confident_count + focus_count} words")
        print("=" * 60)

    except Exception as e:
        print(f"ERROR: {e}")
        exit(1)


if __name__ == "__main__":
    main()
