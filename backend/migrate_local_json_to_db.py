#!/usr/bin/env python3
"""
Migration script to populate Postgres database from local JSON files.

This script reads confident-words and needs-focus-words JSON files from
a local folder and inserts them into Postgres database.

Usage:
    python migrate_local_json_to_db.py /path/to/json/files

The folder structure should be:
    /path/to/json/files/
    ├── users/
    │   ├── user1/
    │   │   ├── confident-words/
    │   │   │   ├── word1.json
    │   │   │   └── word2.json
    │   │   └── needs-focus-words/
    │   │       └── word3.json
    │   └── user2/
    │       └── ...
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    print("ERROR: psycopg not installed. Install with: pip install psycopg")
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


def migrate_confident_words(json_folder: Path) -> int:
    """Migrate confident words from local JSON files to Postgres."""
    print("Migrating confident words from local JSON files...")

    migrated_count = 0
    error_count = 0

    # Find all confident-words JSON files
    confident_pattern = json_folder / "**" / "confident-words" / "*.json"

    with _connect() as conn:
        with conn.cursor() as cursor:
            for json_file in json_folder.glob("**/confident-words/*.json"):
                try:
                    # Read JSON file
                    with open(json_file, "r", encoding="utf-8") as f:
                        payload = json.load(f)

                    if not isinstance(payload, dict):
                        continue

                    # Extract google_sub from file path
                    # Path: users/{google_sub}/confident-words/word.json
                    parts = json_file.relative_to(json_folder).parts
                    if len(parts) < 3 or parts[0] != "users":
                        continue

                    google_sub = parts[1]

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

                    # Get timestamps from file
                    stat = json_file.stat()
                    file_mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()

                    created_at = str(payload.get("createdAt", "")).strip() or file_mtime
                    updated_at = str(payload.get("updatedAt", "")).strip() or file_mtime

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
                            str(json_file.relative_to(json_folder)),  # relative path
                            str(json_file),  # absolute path
                            created_at,
                            updated_at,
                        ),
                    )
                    migrated_count += 1

                    if migrated_count % 50 == 0:
                        print(f"  Migrated {migrated_count} confident words...")

                except json.JSONDecodeError as e:
                    error_count += 1
                    if error_count <= 5:
                        print(f"  ERROR: Invalid JSON in {json_file}: {e}")
                except Exception as e:
                    error_count += 1
                    if error_count <= 5:
                        print(f"  ERROR: {json_file}: {e}")

        conn.commit()

    print(f"✓ Migrated {migrated_count} confident words ({error_count} errors)")
    return migrated_count


def migrate_needs_focus_words(json_folder: Path) -> int:
    """Migrate needs-focus words from local JSON files to Postgres."""
    print("Migrating needs-focus words from local JSON files...")

    migrated_count = 0
    error_count = 0

    # Find all needs-focus-words JSON files
    with _connect() as conn:
        with conn.cursor() as cursor:
            for json_file in json_folder.glob("**/needs-focus-words/*.json"):
                try:
                    # Read JSON file
                    with open(json_file, "r", encoding="utf-8") as f:
                        payload = json.load(f)

                    if not isinstance(payload, dict):
                        continue

                    # Extract google_sub from file path
                    # Path: users/{google_sub}/needs-focus-words/word.json
                    parts = json_file.relative_to(json_folder).parts
                    if len(parts) < 3 or parts[0] != "users":
                        continue

                    google_sub = parts[1]

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

                    # Get timestamps from file
                    stat = json_file.stat()
                    file_mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()

                    created_at = str(payload.get("createdAt", "")).strip() or file_mtime
                    updated_at = str(payload.get("updatedAt", "")).strip() or file_mtime

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
                            str(json_file.relative_to(json_folder)),  # relative path
                            str(json_file),  # absolute path
                            created_at,
                            updated_at,
                        ),
                    )
                    migrated_count += 1

                    if migrated_count % 50 == 0:
                        print(f"  Migrated {migrated_count} needs-focus words...")

                except json.JSONDecodeError as e:
                    error_count += 1
                    if error_count <= 5:
                        print(f"  ERROR: Invalid JSON in {json_file}: {e}")
                except Exception as e:
                    error_count += 1
                    if error_count <= 5:
                        print(f"  ERROR: {json_file}: {e}")

        conn.commit()

    print(f"✓ Migrated {migrated_count} needs-focus words ({error_count} errors)")
    return migrated_count


def main() -> None:
    """Run the migration."""
    print("=" * 60)
    print("Local JSON to Postgres Migration")
    print("=" * 60)

    # Get JSON folder from command line argument
    if len(sys.argv) < 2:
        print("\nUsage: python migrate_local_json_to_db.py /path/to/json/files")
        print("\nExpected folder structure:")
        print("  /path/to/json/files/")
        print("  └── users/")
        print("      ├── user1/")
        print("      │   ├── confident-words/")
        print("      │   │   ├── word1.json")
        print("      │   │   └── word2.json")
        print("      │   └── needs-focus-words/")
        print("      │       └── word3.json")
        print("      └── user2/")
        print("          └── ...")
        exit(1)

    json_folder = Path(sys.argv[1]).resolve()

    # Validate folder exists
    if not json_folder.exists():
        print(f"ERROR: Folder not found: {json_folder}")
        exit(1)

    if not json_folder.is_dir():
        print(f"ERROR: Not a directory: {json_folder}")
        exit(1)

    try:
        # Check environment
        db_url = database_url()
        if not db_url:
            print("ERROR: DATABASE_URL not configured")
            return

        print(f"Database: {db_url.split('@')[1] if '@' in db_url else 'unknown'}")
        print(f"JSON Folder: {json_folder}")

        # Count files first
        confident_files = list(json_folder.glob("**/confident-words/*.json"))
        focus_files = list(json_folder.glob("**/needs-focus-words/*.json"))

        print(f"Found {len(confident_files)} confident word files")
        print(f"Found {len(focus_files)} needs-focus word files")
        print()

        if not confident_files and not focus_files:
            print("WARNING: No JSON files found in the specified folder!")
            return

        # Run migrations
        confident_count = migrate_confident_words(json_folder)
        focus_count = migrate_needs_focus_words(json_folder)

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
