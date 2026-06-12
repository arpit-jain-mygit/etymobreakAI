from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - dependency is installed in deployment
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]


class ProfileStoreError(Exception):
    pass


PROFILE_TABLE_SQL = """
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
"""


def database_url() -> str:
    primary = os.getenv("DATABASE_URL", "").strip()
    if primary:
        return primary
    return os.getenv("DATABASE_URL_EXTERNAL", "").strip()


def _connect():
    url = database_url()
    if not url:
        raise ProfileStoreError("DATABASE_URL is not configured.")
    if psycopg is None:
        raise ProfileStoreError("psycopg is not installed.")
    try:
        return psycopg.connect(url)
    except Exception as exc:  # pragma: no cover - network/runtime dependent
        raise ProfileStoreError(f"Could not connect to Postgres: {exc}") from exc


def ensure_schema() -> None:
    with _connect() as conn:
        with conn.cursor() as cursor:
            cursor.execute(PROFILE_TABLE_SQL)
        conn.commit()


def _normalize_google(data: dict[str, Any]) -> dict[str, str]:
    return {
        "sub": str(data.get("sub", "")).strip(),
        "email": str(data.get("email", "")).strip(),
        "name": str(data.get("name", "")).strip(),
        "given_name": str(data.get("given_name", "")).strip(),
        "family_name": str(data.get("family_name", "")).strip(),
        "picture": str(data.get("picture", "")).strip(),
    }


def _profile_row_to_payload(row: dict[str, Any]) -> dict[str, Any]:
    google = row.get("google_json") or "{}"
    try:
        google_data = json.loads(google)
    except Exception:
        google_data = {}

    return {
        "id": row.get("id", ""),
        "firstName": row.get("first_name", ""),
        "lastName": row.get("last_name", ""),
        "country": row.get("country", ""),
        "google": google_data,
        "createdAt": row.get("created_at", ""),
        "updatedAt": row.get("updated_at", ""),
    }


def upsert_profile(payload: dict[str, Any]) -> dict[str, Any]:
    first_name = str(payload.get("firstName", "")).strip()
    last_name = str(payload.get("lastName", "")).strip()
    country = str(payload.get("country", "")).strip()
    google = _normalize_google(payload.get("google", {}) if isinstance(payload.get("google", {}), dict) else {})

    if not first_name or not last_name or not country:
        raise ProfileStoreError("First name, last name, and country are required.")
    if not google["sub"] or not google["email"]:
        raise ProfileStoreError("Google identity is required.")

    now = datetime.now(timezone.utc).isoformat()
    profile_id = f"profile-{google['sub']}"
    google_json = json.dumps(google, ensure_ascii=False)

    ensure_schema()
    with _connect() as conn:
        with conn.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                INSERT INTO profiles (
                    id, google_sub, email, first_name, last_name, country, google_json, created_at, updated_at
                ) VALUES (
                    %(id)s, %(google_sub)s, %(email)s, %(first_name)s, %(last_name)s, %(country)s, %(google_json)s,
                    %(created_at)s, %(updated_at)s
                )
                ON CONFLICT (google_sub) DO UPDATE SET
                    email = EXCLUDED.email,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    country = EXCLUDED.country,
                    google_json = EXCLUDED.google_json,
                    updated_at = EXCLUDED.updated_at
                RETURNING id, first_name, last_name, country, google_json, created_at, updated_at
                """,
                {
                    "id": profile_id,
                    "google_sub": google["sub"],
                    "email": google["email"],
                    "first_name": first_name,
                    "last_name": last_name,
                    "country": country,
                    "google_json": google_json,
                    "created_at": now,
                    "updated_at": now,
                },
            )
            row = cursor.fetchone()
        conn.commit()

    if not row:
        raise ProfileStoreError("Profile could not be saved.")

    return _profile_row_to_payload(row)


def get_profile_by_google_identity(google_sub: str | None, email: str | None) -> dict[str, Any] | None:
    sub = str(google_sub or "").strip()
    mail = str(email or "").strip()
    if not sub and not mail:
        return None

    ensure_schema()
    with _connect() as conn:
        with conn.cursor(row_factory=dict_row) as cursor:
            if sub:
                cursor.execute(
                    """
                    SELECT id, first_name, last_name, country, google_json, created_at, updated_at
                    FROM profiles
                    WHERE google_sub = %s
                    """,
                    (sub,),
                )
            else:
                cursor.execute(
                    """
                    SELECT id, first_name, last_name, country, google_json, created_at, updated_at
                    FROM profiles
                    WHERE email = %s
                    """,
                    (mail,),
                )
            row = cursor.fetchone()

    if not row:
        return None

    return _profile_row_to_payload(row)
