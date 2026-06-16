#!/usr/bin/env python3
"""
Cleanup script to remove non-root words from Postgres database.

This script:
1. Identifies all root words (35 total)
2. Deletes all non-root/assembled words from confident_words and needs_focus_words tables
3. Verifies the cleanup was successful

Usage:
    python cleanup_non_roots.py

Environment:
    DATABASE_URL or DATABASE_URL_EXTERNAL - Postgres connection string
"""

from __future__ import annotations

import os

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


# Root words that should be kept (35 total)
ROOTS_TO_KEEP = {
    'able', 'acro', 'anim', 'apo', 'arch', 'astro', 'atic', 'aud', 'avi',
    'bary', 'bell', 'bio', 'cumul', 'duct', 'geo', 'graphy', 'ic', 'in', 'itis',
    'logy', 'oid', 'ology', 'ous', 'oxi', 'phil', 'phile', 'phon', 'phot', 'pod',
    'pre', 'rupt', 'scope', 'sphere', 'tion', 'ty'
}


def cleanup_confident_words() -> int:
    """Remove non-root words from confident_words table."""
    print("Analyzing confident_words table...")

    with _connect() as conn:
        with conn.cursor(row_factory=dict_row) as cursor:
            # Get all unique queries
            cursor.execute("""
                SELECT DISTINCT LOWER(query) as query_lower, query as query_orig, COUNT(*) as count
                FROM confident_words
                GROUP BY LOWER(query), query
                ORDER BY LOWER(query)
            """)
            all_words = cursor.fetchall()

            total_before = sum(w['count'] for w in all_words)
            print(f"Before cleanup: {total_before} total confident words")

            # Identify words to delete
            words_to_delete = []
            roots_kept = []

            for word_row in all_words:
                query_lower = word_row['query_lower'].strip()
                if query_lower in ROOTS_TO_KEEP:
                    roots_kept.append(query_lower)
                else:
                    words_to_delete.append((query_lower, word_row['query_orig']))

            print(f"\nRoots to keep ({len(roots_kept)}):")
            for root in sorted(roots_kept):
                print(f"  ✓ {root}")

            if words_to_delete:
                print(f"\nAssembled words to DELETE ({len(words_to_delete)}):")
                deleted_count = 0
                for query_lower, query_orig in sorted(words_to_delete):
                    print(f"  ✗ {query_orig} (normalized: {query_lower})")
                    cursor.execute(
                        "DELETE FROM confident_words WHERE LOWER(query) = %s",
                        (query_lower,)
                    )
                    deleted_count += cursor.rowcount

                conn.commit()
                print(f"\n✓ Deleted {deleted_count} words from confident_words")

            # Verify cleanup
            cursor.execute("SELECT COUNT(*) as count FROM confident_words")
            confident_count = cursor.fetchone()['count']

            return confident_count

    return 0


def cleanup_needs_focus_words() -> int:
    """Remove non-root words from needs_focus_words table."""
    print("\n" + "="*60)
    print("Analyzing needs_focus_words table...")

    with _connect() as conn:
        with conn.cursor(row_factory=dict_row) as cursor:
            # Get all unique queries
            cursor.execute("""
                SELECT DISTINCT LOWER(query) as query_lower, query as query_orig, COUNT(*) as count
                FROM needs_focus_words
                GROUP BY LOWER(query), query
                ORDER BY LOWER(query)
            """)
            all_words = cursor.fetchall()

            total_before = sum(w['count'] for w in all_words)
            print(f"Before cleanup: {total_before} total needs-focus words")

            # Identify words to delete
            words_to_delete = []
            roots_kept = []

            for word_row in all_words:
                query_lower = word_row['query_lower'].strip()
                if query_lower in ROOTS_TO_KEEP:
                    roots_kept.append(query_lower)
                else:
                    words_to_delete.append((query_lower, word_row['query_orig']))

            print(f"\nRoots to keep ({len(roots_kept)}):")
            for root in sorted(roots_kept):
                print(f"  ✓ {root}")

            if words_to_delete:
                print(f"\nAssembled words to DELETE ({len(words_to_delete)}):")
                deleted_count = 0
                for query_lower, query_orig in sorted(words_to_delete):
                    print(f"  ✗ {query_orig} (normalized: {query_lower})")
                    cursor.execute(
                        "DELETE FROM needs_focus_words WHERE LOWER(query) = %s",
                        (query_lower,)
                    )
                    deleted_count += cursor.rowcount

                conn.commit()
                print(f"\n✓ Deleted {deleted_count} words from needs_focus_words")

            # Verify cleanup
            cursor.execute("SELECT COUNT(*) as count FROM needs_focus_words")
            focus_count = cursor.fetchone()['count']

            return focus_count

    return 0


def verify_cleanup() -> None:
    """Verify that only root words remain."""
    print("\n" + "="*60)
    print("Verifying cleanup...")

    with _connect() as conn:
        with conn.cursor(row_factory=dict_row) as cursor:
            # Check confident words
            cursor.execute("""
                SELECT query, mode, COUNT(*) as count
                FROM confident_words
                GROUP BY query, mode
                ORDER BY query
            """)
            confident_words = cursor.fetchall()

            print(f"\nRemaining confident words ({len(confident_words)}):")
            for row in confident_words:
                print(f"  {row['query']} ({row['mode']}) - {row['count']} entries")

            # Check needs-focus words
            cursor.execute("""
                SELECT query, mode, COUNT(*) as count
                FROM needs_focus_words
                GROUP BY query, mode
                ORDER BY query
            """)
            focus_words = cursor.fetchall()

            print(f"\nRemaining needs-focus words ({len(focus_words)}):")
            for row in focus_words:
                print(f"  {row['query']} ({row['mode']}) - {row['count']} entries")


def main() -> None:
    """Run the cleanup."""
    print("="*60)
    print("Database Cleanup: Remove Non-Root Words")
    print("="*60)

    try:
        # Check environment
        db_url = database_url()
        if not db_url:
            print("ERROR: DATABASE_URL not configured")
            return

        print(f"Database: {db_url.split('@')[1] if '@' in db_url else 'unknown'}")
        print(f"Roots to keep: {len(ROOTS_TO_KEEP)}")
        print()

        # Run cleanup
        confident_count = cleanup_confident_words()
        focus_count = cleanup_needs_focus_words()

        # Verify
        verify_cleanup()

        print()
        print("="*60)
        print(f"Cleanup Complete!")
        print(f"Confident words remaining: {confident_count}")
        print(f"Needs-focus words remaining: {focus_count}")
        print("="*60)

    except Exception as e:
        print(f"ERROR: {e}")
        exit(1)


if __name__ == "__main__":
    main()
