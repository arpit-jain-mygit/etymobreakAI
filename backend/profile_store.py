from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from typing import Any
from urllib import error, parse, request

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

CONFIDENT_WORDS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS confident_words (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    google_sub TEXT NOT NULL,
    email TEXT NOT NULL,
    query TEXT NOT NULL,
    mode TEXT NOT NULL,
    title TEXT NOT NULL,
    analysis TEXT NOT NULL,
    bucket_object_name TEXT,
    bucket_uri TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(google_sub, query, mode)
);
CREATE INDEX IF NOT EXISTS idx_confident_words_google_sub ON confident_words(google_sub);
"""

NEEDS_FOCUS_WORDS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS needs_focus_words (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    google_sub TEXT NOT NULL,
    email TEXT NOT NULL,
    query TEXT NOT NULL,
    mode TEXT NOT NULL,
    title TEXT NOT NULL,
    analysis TEXT NOT NULL,
    bucket_object_name TEXT,
    bucket_uri TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(google_sub, query, mode)
);
CREATE INDEX IF NOT EXISTS idx_needs_focus_words_google_sub ON needs_focus_words(google_sub);
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
            cursor.execute(CONFIDENT_WORDS_TABLE_SQL)
            cursor.execute(NEEDS_FOCUS_WORDS_TABLE_SQL)
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


def _sanitize_path_segment(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._=-]+", "_", value.strip())
    return cleaned.strip("._-") or "unknown"




def _broker_url() -> str:
    return os.getenv("BROKER_URL", "").strip().rstrip("/")


def _broker_secret() -> str:
    return os.getenv("BROKER_SHARED_SECRET", "").strip()


def _broker_is_configured() -> bool:
    return bool(_broker_url() and _broker_secret())


def _cache_confident_word_to_db(word_data: dict[str, Any]) -> None:
    try:
        google_sub = str(word_data.get("googleSub", "")).strip()
        profile_id = str(word_data.get("profileId", "")).strip()
        email = str(word_data.get("player", {}).get("email", "")).strip() if isinstance(word_data.get("player"), dict) else ""
        query = str(word_data.get("query", "")).strip()
        mode = str(word_data.get("mode", "")).strip() or "word"
        title = str(word_data.get("title", "")).strip()
        analysis = json.dumps(word_data.get("analysis", {}))
        now = datetime.now(timezone.utc).isoformat()

        if not google_sub or not query:
            return

        with _connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO confident_words (
                        id, profile_id, google_sub, email, query, mode, title, analysis,
                        bucket_object_name, bucket_uri, created_at, updated_at
                    ) VALUES (
                        %(id)s, %(profile_id)s, %(google_sub)s, %(email)s, %(query)s, %(mode)s,
                        %(title)s, %(analysis)s, %(bucket_object_name)s, %(bucket_uri)s, %(created_at)s, %(updated_at)s
                    )
                    ON CONFLICT (google_sub, query, mode) DO UPDATE SET
                        title = EXCLUDED.title,
                        analysis = EXCLUDED.analysis,
                        bucket_object_name = EXCLUDED.bucket_object_name,
                        bucket_uri = EXCLUDED.bucket_uri,
                        updated_at = EXCLUDED.updated_at
                    """,
                    {
                        "id": str(word_data.get("id", "")).strip() or f"confident-{google_sub}-{query}",
                        "profile_id": profile_id,
                        "google_sub": google_sub,
                        "email": email,
                        "query": query,
                        "mode": mode,
                        "title": title,
                        "analysis": analysis,
                        "bucket_object_name": str(word_data.get("bucketObjectName", "")).strip() or None,
                        "bucket_uri": str(word_data.get("bucketUri", "")).strip() or None,
                        "created_at": str(word_data.get("createdAt", "")).strip() or now,
                        "updated_at": now,
                    },
                )
            conn.commit()
    except Exception:
        pass


def _cache_needs_focus_word_to_db(word_data: dict[str, Any]) -> None:
    try:
        google_sub = str(word_data.get("googleSub", "")).strip()
        profile_id = str(word_data.get("profileId", "")).strip()
        email = str(word_data.get("player", {}).get("email", "")).strip() if isinstance(word_data.get("player"), dict) else ""
        query = str(word_data.get("query", "")).strip()
        mode = str(word_data.get("mode", "")).strip() or "word"
        title = str(word_data.get("title", "")).strip()
        analysis = json.dumps(word_data.get("analysis", {}))
        now = datetime.now(timezone.utc).isoformat()

        if not google_sub or not query:
            return

        with _connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO needs_focus_words (
                        id, profile_id, google_sub, email, query, mode, title, analysis,
                        bucket_object_name, bucket_uri, created_at, updated_at
                    ) VALUES (
                        %(id)s, %(profile_id)s, %(google_sub)s, %(email)s, %(query)s, %(mode)s,
                        %(title)s, %(analysis)s, %(bucket_object_name)s, %(bucket_uri)s, %(created_at)s, %(updated_at)s
                    )
                    ON CONFLICT (google_sub, query, mode) DO UPDATE SET
                        title = EXCLUDED.title,
                        analysis = EXCLUDED.analysis,
                        bucket_object_name = EXCLUDED.bucket_object_name,
                        bucket_uri = EXCLUDED.bucket_uri,
                        updated_at = EXCLUDED.updated_at
                    """,
                    {
                        "id": str(word_data.get("id", "")).strip() or f"focus-{google_sub}-{query}",
                        "profile_id": profile_id,
                        "google_sub": google_sub,
                        "email": email,
                        "query": query,
                        "mode": mode,
                        "title": title,
                        "analysis": analysis,
                        "bucket_object_name": str(word_data.get("bucketObjectName", "")).strip() or None,
                        "bucket_uri": str(word_data.get("bucketUri", "")).strip() or None,
                        "created_at": str(word_data.get("createdAt", "")).strip() or now,
                        "updated_at": now,
                    },
                )
            conn.commit()
    except Exception:
        pass


def _list_confident_words_from_db(google_sub: str) -> list[dict[str, Any]]:
    try:
        sub = str(google_sub or "").strip()
        if not sub:
            return []

        with _connect() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT id, profile_id, google_sub, email, query, mode, title, analysis,
                           bucket_object_name, bucket_uri, created_at, updated_at
                    FROM confident_words
                    WHERE google_sub = %s
                    ORDER BY updated_at DESC
                    """,
                    (sub,),
                )
                rows = cursor.fetchall()

        result: list[dict[str, Any]] = []
        for row in rows:
            try:
                analysis = json.loads(str(row.get("analysis", "{}") or "{}"))
            except Exception:
                analysis = {}

            result.append({
                "id": row.get("id", ""),
                "time": row.get("updated_at", ""),
                "query": row.get("query", ""),
                "mode": row.get("mode", "word"),
                "title": row.get("title", ""),
                "playerName": "",
                "playerEmail": row.get("email", ""),
                "country": "",
                "analysis": analysis,
                "bucketObjectName": row.get("bucket_object_name", ""),
                "bucketUri": row.get("bucket_uri", ""),
            })

        return result
    except Exception:
        return []


def _list_needs_focus_words_from_db(google_sub: str) -> list[dict[str, Any]]:
    try:
        sub = str(google_sub or "").strip()
        if not sub:
            return []

        with _connect() as conn:
            with conn.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT id, profile_id, google_sub, email, query, mode, title, analysis,
                           bucket_object_name, bucket_uri, created_at, updated_at
                    FROM needs_focus_words
                    WHERE google_sub = %s
                    ORDER BY updated_at DESC
                    """,
                    (sub,),
                )
                rows = cursor.fetchall()

        result: list[dict[str, Any]] = []
        for row in rows:
            try:
                analysis = json.loads(str(row.get("analysis", "{}") or "{}"))
            except Exception:
                analysis = {}

            result.append({
                "id": row.get("id", ""),
                "time": row.get("updated_at", ""),
                "query": row.get("query", ""),
                "mode": row.get("mode", "word"),
                "title": row.get("title", ""),
                "playerName": "",
                "playerEmail": row.get("email", ""),
                "country": "",
                "analysis": analysis,
                "bucketObjectName": row.get("bucket_object_name", ""),
                "bucketUri": row.get("bucket_uri", ""),
            })

        return result
    except Exception:
        return []


def _call_broker(
    method: str,
    path: str,
    *,
    payload: dict[str, Any] | None = None,
    params: dict[str, str] | None = None,
) -> dict[str, Any]:
    base_url = _broker_url()
    secret = _broker_secret()
    if not base_url:
        raise ProfileStoreError("Quiz history broker URL is not configured.")
    if not secret:
        raise ProfileStoreError("Quiz history broker secret is not configured.")

    url = f"{base_url}{path}"
    if params:
        query = parse.urlencode({key: value for key, value in params.items() if value})
        if query:
            url = f"{url}?{query}"
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-EtymoBreak-Broker-Secret": secret,
    }
    http_request = request.Request(url, data=data, headers=headers, method=method.upper())

    try:
        with request.urlopen(http_request, timeout=45) as response:
            raw = response.read().decode("utf-8")
    except error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
        raise ProfileStoreError(f"Quiz history broker request failed: {details[:400]}") from exc
    except Exception as exc:
        raise ProfileStoreError(f"Quiz history broker request failed: {exc}") from exc

    try:
        parsed = json.loads(raw) if raw.strip() else {}
    except Exception as exc:
        raise ProfileStoreError(f"Quiz history broker returned invalid JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise ProfileStoreError("Quiz history broker returned an unexpected response.")

    return parsed


def _saved_word_identity(item: dict[str, Any]) -> str:
    analysis = item.get("analysis", {}) if isinstance(item.get("analysis", {}), dict) else {}
    root_family = analysis.get("rootFamily", {}) if isinstance(analysis.get("rootFamily", {}), dict) else {}
    candidates = [
        str(root_family.get("root", "")).strip(),
        str(item.get("query", "")).strip(),
        str(analysis.get("query", "")).strip(),
        str(item.get("root", "")).strip(),
        str(analysis.get("root", "")).strip(),
        str(item.get("title", "")).strip(),
        str(analysis.get("title", "")).strip(),
    ]
    for candidate in candidates:
        normalized = _sanitize_path_segment(candidate).lower()
        if normalized and normalized != "unknown":
            return normalized
    return ""


def _saved_word_state_rank(state: str) -> int:
    return 1 if state == "needs_focus" else 0


def _canonical_saved_words(confident_items: list[dict[str, Any]], focus_items: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    chosen: dict[str, dict[str, Any]] = {}

    def ingest(item: dict[str, Any], state: str) -> None:
        identity = _saved_word_identity(item)
        if not identity:
            return

        wrapped = {
            **item,
            "_identity": identity,
            "_state": state,
        }
        existing = chosen.get(identity)
        if not existing:
            chosen[identity] = wrapped
            return

        current_state = str(wrapped.get("_state", "")).strip()
        current_time = str(wrapped.get("time", "")).strip()
        existing_state = str(existing.get("_state", "")).strip()
        existing_time = str(existing.get("time", "")).strip()
        if (
            _saved_word_state_rank(current_state) > _saved_word_state_rank(existing_state)
            or (current_state == existing_state and current_time > existing_time)
        ):
            chosen[identity] = wrapped

    for item in confident_items:
        ingest(item, "confident")
    for item in focus_items:
        ingest(item, "needs_focus")

    confident: list[dict[str, Any]] = []
    focus: list[dict[str, Any]] = []
    for item in chosen.values():
        if item.get("_state") == "confident":
            confident.append(item)
        elif item.get("_state") == "needs_focus":
            focus.append(item)

    confident.sort(key=lambda item: item.get("time", ""), reverse=True)
    focus.sort(key=lambda item: item.get("time", ""), reverse=True)
    return confident, focus


def _list_saved_words_from_bucket(
    resolved_sub: str,
    fallback_email: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    client, bucket_name = _bucket_client()
    bucket = client.bucket(bucket_name)

    def infer_state(blob_name: str, payload: dict[str, Any]) -> str:
        normalized_name = blob_name.replace("\\", "/").lower()
        if "/needs-focus-words/" in normalized_name or "/needs_focus_words/" in normalized_name:
            return "needs_focus"
        if "/confident-words/" in normalized_name or "/confident_words/" in normalized_name:
            return "confident"

        for key in ("state", "bucketState", "savedState"):
            value = str(payload.get(key, "")).strip().lower()
            if value in {"confident", "needs_focus", "needs-focus"}:
                return "needs_focus" if value.startswith("needs") else "confident"

        if bool(payload.get("needsFocus", False)):
            return "needs_focus"
        if bool(payload.get("confident", False)):
            return "confident"
        return ""

    def extract_analysis(payload: dict[str, Any]) -> dict[str, Any]:
        if isinstance(payload.get("analysis"), dict):
            return payload["analysis"]
        return payload

    def extract_query(payload: dict[str, Any], analysis: dict[str, Any]) -> str:
        root_family = analysis.get("rootFamily", {}) if isinstance(analysis.get("rootFamily", {}), dict) else {}
        candidates = [
            payload.get("query", ""),
            analysis.get("query", ""),
            payload.get("root", ""),
            analysis.get("root", ""),
            root_family.get("root", ""),
            payload.get("title", ""),
            analysis.get("title", ""),
        ]
        for candidate in candidates:
            query = str(candidate).strip()
            if query:
                return query
        return ""

    def extract_mode(payload: dict[str, Any], analysis: dict[str, Any]) -> str:
        candidates = [
            payload.get("mode", ""),
            analysis.get("mode", ""),
            payload.get("type", ""),
        ]
        for candidate in candidates:
            mode = str(candidate).strip()
            if mode:
                return mode
        return "word"

    def ingest_blob(blob: Any, explicit_state: str = "") -> dict[str, Any] | None:
        try:
            raw = blob.download_as_text()
            payload = json.loads(raw)
        except Exception:
            return None

        if not isinstance(payload, dict):
            return None

        player = payload.get("player", {})
        if not isinstance(player, dict):
            player = {}
        analysis = extract_analysis(payload)
        if not isinstance(analysis, dict):
            analysis = {}
        metadata = payload.get("metadata", {})
        if not isinstance(metadata, dict):
            metadata = {}

        state = explicit_state or infer_state(blob.name, payload)
        if state not in {"confident", "needs_focus"}:
            return None

        blob_identity = _sanitize_path_segment(blob.name.rsplit("/", 1)[-1].removesuffix(".json")).lower()
        query = extract_query(payload, analysis)
        if not query:
            query = blob_identity.replace("--", " ").replace("-", " ").strip()
        mode = extract_mode(payload, analysis)
        title = str(payload.get("title", "")).strip() or str(metadata.get("title", "")).strip() or str(analysis.get("title", "")).strip()
        if not title:
            title = query.upper()
        identity = _saved_word_identity(payload) or blob_identity
        if not identity:
            return None

        return {
            "id": str(payload.get("id", "")).strip() or blob.name.rsplit("/", 1)[-1].removesuffix(".json"),
            "time": str(payload.get("updatedAt", "")).strip() or str(payload.get("createdAt", "")).strip() or (
                blob.updated.isoformat() if getattr(blob, "updated", None) else ""
            ),
            "query": query,
            "mode": mode,
            "title": title,
            "playerName": f"{str(player.get('firstName', '')).strip()} {str(player.get('lastName', '')).strip()}".strip(),
            "playerEmail": str(player.get("email", "")).strip() or fallback_email,
            "country": str(player.get("country", "")).strip(),
            "analysis": analysis,
            "bucketObjectName": blob.name,
            "bucketUri": f"gs://{bucket_name}/{blob.name}",
            "_identity": identity,
            "_state": state,
        }

    confident_entries: list[dict[str, Any]] = []
    for blob in client.list_blobs(bucket, prefix=f"users/{_sanitize_path_segment(resolved_sub)}/confident-words/"):
        entry = ingest_blob(blob, "confident")
        if not entry:
            continue
        confident_entries.append(entry)

    focus_entries: list[dict[str, Any]] = []
    for blob in client.list_blobs(bucket, prefix=f"users/{_sanitize_path_segment(resolved_sub)}/needs-focus-words/"):
        entry = ingest_blob(blob, "needs_focus")
        if not entry:
            continue
        focus_entries.append(entry)

    if not confident_entries and not focus_entries:
        user_prefix = f"users/{_sanitize_path_segment(resolved_sub)}/"
        seen_names = set()
        for blob in client.list_blobs(bucket, prefix=user_prefix):
            if blob.name in seen_names:
                continue
            seen_names.add(blob.name)
            entry = ingest_blob(blob)
            if not entry:
                continue
            if entry["_state"] == "confident":
                confident_entries.append(entry)
            elif entry["_state"] == "needs_focus":
                focus_entries.append(entry)

    return _canonical_saved_words(confident_entries, focus_entries)


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


def _write_quiz_attempt_to_bucket(
    *,
    quiz_history_id: str,
    profile_id: str,
    google_sub: str,
    profile_data: dict[str, Any],
    payload: dict[str, Any],
    created_at: str,
) -> tuple[str, str]:
    client, bucket_name = _bucket_client()
    bucket = client.bucket(bucket_name)
    profile_folder = _sanitize_path_segment(google_sub)
    day_stamp = datetime.now(timezone.utc)
    object_name = (
        f"users/{profile_folder}/quiz-attempts/"
        f"{day_stamp:%Y/%m/%d}/quiz-{_sanitize_path_segment(quiz_history_id)}.json"
    )

    bucket_payload = {
        "id": quiz_history_id,
        "profileId": profile_id,
        "googleSub": google_sub,
        "createdAt": created_at,
        "player": {
            "firstName": str(profile_data.get("firstName", "")).strip(),
            "lastName": str(profile_data.get("lastName", "")).strip(),
            "country": str(profile_data.get("country", "")).strip(),
            "email": str(profile_data.get("google", {}).get("email", "")).strip()
            if isinstance(profile_data.get("google", {}), dict)
            else "",
        },
        "attempt": payload.get("attempt", {}),
        "metadata": {
            "quizScope": str(payload.get("quizScope", "")).strip().upper() or "ALL",
            "correctCount": int(payload.get("correctCount", 0) or 0),
            "wrongCount": int(payload.get("wrongCount", 0) or 0),
            "marks": int(payload.get("marks", 0) or 0),
            "percentage": int(payload.get("percentage", 0) or 0),
            "totalPossible": int(payload.get("totalPossible", 0) or 0),
        },
        "summary": {
            "quizType": str(payload.get("quizType", "")).strip(),
            "difficulty": int(payload.get("difficulty", 0) or 0),
            "questionCount": int(payload.get("questionCount", 0) or 0),
            "timeLimitMinutes": int(payload.get("timeLimitMinutes", 0) or 0),
            "timeSpentSeconds": int(payload.get("timeSpentSeconds", 0) or 0),
        },
    }

    blob = bucket.blob(object_name)
    blob.upload_from_string(
        json.dumps(bucket_payload, ensure_ascii=False, indent=2),
        content_type="application/json",
    )
    return object_name, f"gs://{bucket_name}/{object_name}"


def insert_quiz_history(payload: dict[str, Any]) -> dict[str, Any]:
    profile = payload.get("profile", {})
    profile_data = profile if isinstance(profile, dict) else {}
    google = profile_data.get("google", {})
    google_data = google if isinstance(google, dict) else {}

    quiz_scope = str(payload.get("quizScope", "")).strip().upper() or "ALL"
    attempt = payload.get("attempt", {})
    attempt_data = attempt if isinstance(attempt, dict) else {}
    now = datetime.now(timezone.utc).isoformat()

    google_sub = str(google_data.get("sub", "")).strip()
    email = str(google_data.get("email", "")).strip()
    first_name = str(profile_data.get("firstName", "")).strip()
    last_name = str(profile_data.get("lastName", "")).strip()
    country = str(profile_data.get("country", "")).strip()

    if not google_sub or not email:
        raise ProfileStoreError("Google identity is required.")
    if not first_name or not last_name or not country:
        raise ProfileStoreError("Profile details are required.")

    profile_id = f"profile-{google_sub}"
    quiz_history_id = str(payload.get("id", "")).strip() or f"quiz-{google_sub}-{now}"

    if _broker_is_configured():
        return _call_broker("POST", "/quiz-history", payload=payload)

    bucket_object_name, bucket_uri = _write_quiz_attempt_to_bucket(
        quiz_history_id=quiz_history_id,
        profile_id=profile_id,
        google_sub=google_sub,
        profile_data=profile_data,
        payload=payload,
        created_at=now,
    )
    return {
        "id": quiz_history_id,
        "time": now,
        "playerName": f"{first_name} {last_name}".strip(),
        "playerEmail": email,
        "country": country,
        "quizScope": quiz_scope,
        "correct": int(payload.get("correctCount", 0) or 0),
        "wrong": int(payload.get("wrongCount", 0) or 0),
        "marks": int(payload.get("marks", 0) or 0),
        "percentage": int(payload.get("percentage", 0) or 0),
        "total": int(payload.get("totalPossible", 0) or 0),
        "bucketObjectName": bucket_object_name,
        "bucketUri": bucket_uri,
    }


def list_quiz_history_by_google_identity(google_sub: str | None, email: str | None) -> list[dict[str, Any]]:
    sub = str(google_sub or "").strip()
    mail = str(email or "").strip()
    if not sub and not mail:
        return []

    resolved_sub = sub
    if not resolved_sub and mail:
        profile = get_profile_by_google_identity(None, mail)
        resolved_sub = str((profile or {}).get("google", {}).get("sub", "")).strip()

    if not resolved_sub:
        return []

    def read_from_bucket() -> list[dict[str, Any]]:
        client, bucket_name = _bucket_client()
        bucket = client.bucket(bucket_name)
        prefix = f"users/{_sanitize_path_segment(resolved_sub)}/quiz-attempts/"

        history: list[dict[str, Any]] = []
        for blob in client.list_blobs(bucket, prefix=prefix):
            try:
                raw = blob.download_as_text()
                payload = json.loads(raw)
            except Exception:
                continue

            if not isinstance(payload, dict):
                continue

            metadata = payload.get("metadata", {})
            summary = payload.get("summary", {})
            player = payload.get("player", {})
            attempt = payload.get("attempt", {})
            history.append(
                {
                    "id": str(payload.get("id", "")).strip() or blob.name.rsplit("/", 1)[-1].removesuffix(".json"),
                    "time": str(payload.get("createdAt", "")).strip() or (
                        blob.updated.isoformat() if getattr(blob, "updated", None) else ""
                    ),
                    "playerName": f"{str(player.get('firstName', '')).strip()} {str(player.get('lastName', '')).strip()}".strip(),
                    "playerEmail": str(player.get("email", "")).strip() or mail,
                    "country": str(player.get("country", "")).strip(),
                    "quizScope": str(metadata.get("quizScope", "")).strip(),
                    "correct": int(metadata.get("correctCount", 0) or 0),
                    "wrong": int(metadata.get("wrongCount", 0) or 0),
                    "marks": int(metadata.get("marks", 0) or 0),
                    "percentage": int(metadata.get("percentage", 0) or 0),
                    "total": int(metadata.get("totalPossible", 0) or 0),
                    "bucketObjectName": blob.name,
                    "bucketUri": f"gs://{bucket_name}/{blob.name}",
                    "quizType": str(summary.get("quizType", "")).strip(),
                    "difficulty": int(summary.get("difficulty", 0) or 0),
                    "questionCount": int(summary.get("questionCount", 0) or 0),
                    "timeLimitMinutes": int(summary.get("timeLimitMinutes", 0) or 0),
                    "timeSpentSeconds": int(summary.get("timeSpentSeconds", 0) or 0),
                    "questions": attempt.get("questions", []),
                }
            )

        history.sort(key=lambda item: item.get("time", ""), reverse=True)
        return history

    try:
        return read_from_bucket()
    except ProfileStoreError:
        if _broker_is_configured():
            broker_payload = _call_broker("GET", "/quiz-history", params={"sub": resolved_sub, "email": mail})
            items = broker_payload.get("items", [])
            return items if isinstance(items, list) else []
        raise
    except Exception as exc:
        if _broker_is_configured():
            broker_payload = _call_broker("GET", "/quiz-history", params={"sub": resolved_sub, "email": mail})
            items = broker_payload.get("items", [])
            return items if isinstance(items, list) else []
        raise ProfileStoreError(f"Could not list quiz history: {exc}") from exc


def _confident_word_object_name(google_sub: str, query: str, mode: str) -> str:
    profile_folder = _sanitize_path_segment(google_sub)
    query_segment = _sanitize_path_segment(query)
    mode_segment = _sanitize_path_segment(mode or "word")
    return f"users/{profile_folder}/confident-words/{query_segment}--{mode_segment}.json"


def _needs_focus_word_object_name(google_sub: str, query: str, mode: str) -> str:
    profile_folder = _sanitize_path_segment(google_sub)
    query_segment = _sanitize_path_segment(query)
    mode_segment = _sanitize_path_segment(mode or "word")
    return f"users/{profile_folder}/needs-focus-words/{query_segment}--{mode_segment}.json"


def _profile_identity(profile_data: dict[str, Any]) -> tuple[str, str, str, str]:
    google = profile_data.get("google", {})
    google_data = google if isinstance(google, dict) else {}
    google_sub = str(google_data.get("sub", "")).strip()
    email = str(google_data.get("email", "")).strip()
    first_name = str(profile_data.get("firstName", "")).strip()
    last_name = str(profile_data.get("lastName", "")).strip()
    country = str(profile_data.get("country", "")).strip()
    return google_sub, email, first_name, last_name, country


def _confident_analysis_payload(payload: dict[str, Any]) -> dict[str, Any]:
    analysis = payload.get("analysis", {})
    if isinstance(analysis, dict):
        return analysis
    return {}


def _write_confident_word_to_bucket(
    *,
    confident_id: str,
    profile_id: str,
    google_sub: str,
    profile_data: dict[str, Any],
    payload: dict[str, Any],
    created_at: str,
) -> tuple[str, str]:
    client, bucket_name = _bucket_client()
    bucket = client.bucket(bucket_name)
    analysis = _confident_analysis_payload(payload)
    query = str(payload.get("query", "")).strip() or str(analysis.get("query", "")).strip()
    mode = str(payload.get("mode", "")).strip() or str(analysis.get("mode", "")).strip() or "word"
    object_name = _confident_word_object_name(google_sub, query, mode)

    bucket_payload = {
        "id": confident_id,
        "profileId": profile_id,
        "googleSub": google_sub,
        "createdAt": created_at,
        "updatedAt": created_at,
        "query": query,
        "mode": mode,
        "player": {
            "firstName": str(profile_data.get("firstName", "")).strip(),
            "lastName": str(profile_data.get("lastName", "")).strip(),
            "country": str(profile_data.get("country", "")).strip(),
            "email": str(profile_data.get("google", {}).get("email", "")).strip()
            if isinstance(profile_data.get("google", {}), dict)
            else "",
        },
        "analysis": analysis,
        "metadata": {
            "title": str(analysis.get("title", "")).strip(),
            "summary": str(analysis.get("summary", "")).strip(),
            "breakdownCount": len(analysis.get("breakdown", [])) if isinstance(analysis.get("breakdown", []), list) else 0,
            "familyCount": len(analysis.get("familyMemory", [])) if isinstance(analysis.get("familyMemory", []), list) else 0,
        },
    }

    blob = bucket.blob(object_name)
    blob.upload_from_string(
        json.dumps(bucket_payload, ensure_ascii=False, indent=2),
        content_type="application/json",
    )
    return object_name, f"gs://{bucket_name}/{object_name}"


def _write_needs_focus_word_to_bucket(
    *,
    focus_id: str,
    profile_id: str,
    google_sub: str,
    profile_data: dict[str, Any],
    payload: dict[str, Any],
    created_at: str,
) -> tuple[str, str]:
    client, bucket_name = _bucket_client()
    bucket = client.bucket(bucket_name)
    analysis = _confident_analysis_payload(payload)
    query = str(payload.get("query", "")).strip() or str(analysis.get("query", "")).strip()
    mode = str(payload.get("mode", "")).strip() or str(analysis.get("mode", "")).strip() or "word"
    object_name = _needs_focus_word_object_name(google_sub, query, mode)

    bucket_payload = {
        "id": focus_id,
        "profileId": profile_id,
        "googleSub": google_sub,
        "createdAt": created_at,
        "updatedAt": created_at,
        "query": query,
        "mode": mode,
        "player": {
            "firstName": str(profile_data.get("firstName", "")).strip(),
            "lastName": str(profile_data.get("lastName", "")).strip(),
            "country": str(profile_data.get("country", "")).strip(),
            "email": str(profile_data.get("google", {}).get("email", "")).strip()
            if isinstance(profile_data.get("google", {}), dict)
            else "",
        },
        "analysis": analysis,
        "metadata": {
            "title": str(analysis.get("title", "")).strip(),
            "summary": str(analysis.get("summary", "")).strip(),
            "breakdownCount": len(analysis.get("breakdown", [])) if isinstance(analysis.get("breakdown", []), list) else 0,
            "familyCount": len(analysis.get("familyMemory", [])) if isinstance(analysis.get("familyMemory", []), list) else 0,
        },
    }

    blob = bucket.blob(object_name)
    blob.upload_from_string(
        json.dumps(bucket_payload, ensure_ascii=False, indent=2),
        content_type="application/json",
    )
    return object_name, f"gs://{bucket_name}/{object_name}"


def _delete_confident_word_from_bucket(google_sub: str, query: str, mode: str) -> None:
    client, bucket_name = _bucket_client()
    bucket = client.bucket(bucket_name)
    object_name = _confident_word_object_name(google_sub, query, mode)
    blob = bucket.blob(object_name)
    try:
        blob.delete()
    except Exception:
        return


def _delete_needs_focus_word_from_bucket(google_sub: str, query: str, mode: str) -> None:
    client, bucket_name = _bucket_client()
    bucket = client.bucket(bucket_name)
    object_name = _needs_focus_word_object_name(google_sub, query, mode)
    blob = bucket.blob(object_name)
    try:
        blob.delete()
    except Exception:
        return


def upsert_confident_word(payload: dict[str, Any]) -> dict[str, Any]:
    profile_data = payload.get("profile", {})
    profile = profile_data if isinstance(profile_data, dict) else {}
    google_sub, email, first_name, last_name, country = _profile_identity(profile)

    if not google_sub or not email:
        raise ProfileStoreError("Google identity is required.")
    if not first_name or not last_name or not country:
        raise ProfileStoreError("Profile details are required.")

    query = str(payload.get("query", "")).strip() or str(_confident_analysis_payload(payload).get("query", "")).strip()
    mode = str(payload.get("mode", "")).strip() or str(_confident_analysis_payload(payload).get("mode", "")).strip() or "word"
    if not query:
        raise ProfileStoreError("A query is required to save a confident word.")

    profile_id = f"profile-{google_sub}"
    confident_id = str(payload.get("id", "")).strip() or f"confident-{google_sub}-{_sanitize_path_segment(query)}-{_sanitize_path_segment(mode)}"
    now = datetime.now(timezone.utc).isoformat()

    if not bool(payload.get("confident", True)):
        return {
            "id": confident_id,
            "query": query,
            "mode": mode,
            "removed": True,
        }

    analysis = _confident_analysis_payload(payload)
    response = {
        "id": confident_id,
        "time": now,
        "query": query,
        "mode": mode,
        "title": str(analysis.get("title", "")).strip(),
        "playerName": f"{first_name} {last_name}".strip(),
        "playerEmail": email,
        "country": country,
        "analysis": analysis,
    }
    _cache_confident_word_to_db({
        "id": confident_id,
        "profileId": profile_id,
        "googleSub": google_sub,
        "createdAt": now,
        "query": query,
        "mode": mode,
        "title": response["title"],
        "analysis": analysis,
        "bucketObjectName": None,
        "bucketUri": None,
        "player": {"email": email},
    })
    return response


def upsert_needs_focus_word(payload: dict[str, Any]) -> dict[str, Any]:
    profile_data = payload.get("profile", {})
    profile = profile_data if isinstance(profile_data, dict) else {}
    google_sub, email, first_name, last_name, country = _profile_identity(profile)

    if not google_sub or not email:
        raise ProfileStoreError("Google identity is required.")
    if not first_name or not last_name or not country:
        raise ProfileStoreError("Profile details are required.")

    analysis = _confident_analysis_payload(payload)
    query = str(payload.get("query", "")).strip() or str(analysis.get("query", "")).strip()
    mode = str(payload.get("mode", "")).strip() or str(analysis.get("mode", "")).strip() or "word"
    if not query:
        raise ProfileStoreError("A query is required to save a needs-focus word.")

    profile_id = f"profile-{google_sub}"
    focus_id = str(payload.get("id", "")).strip() or f"focus-{google_sub}-{_sanitize_path_segment(query)}-{_sanitize_path_segment(mode)}"
    now = datetime.now(timezone.utc).isoformat()

    if not bool(payload.get("needsFocus", True)):
        return {
            "id": focus_id,
            "query": query,
            "mode": mode,
            "removed": True,
        }

    response = {
        "id": focus_id,
        "time": now,
        "query": query,
        "mode": mode,
        "title": str(analysis.get("title", "")).strip(),
        "playerName": f"{first_name} {last_name}".strip(),
        "playerEmail": email,
        "country": country,
        "analysis": analysis,
    }
    _cache_needs_focus_word_to_db({
        "id": focus_id,
        "profileId": profile_id,
        "googleSub": google_sub,
        "createdAt": now,
        "query": query,
        "mode": mode,
        "title": response["title"],
        "analysis": analysis,
        "bucketObjectName": None,
        "bucketUri": None,
        "player": {"email": email},
    })
    return response


def list_confident_words_by_google_identity(google_sub: str | None, email: str | None) -> list[dict[str, Any]]:
    sub = str(google_sub or "").strip()
    mail = str(email or "").strip()
    if not sub and not mail:
        return []

    resolved_sub = sub
    if not resolved_sub and mail:
        profile = get_profile_by_google_identity(None, mail)
        resolved_sub = str((profile or {}).get("google", {}).get("sub", "")).strip()

    if not resolved_sub:
        return []

    return _list_confident_words_from_db(resolved_sub)


def list_needs_focus_words_by_google_identity(google_sub: str | None, email: str | None) -> list[dict[str, Any]]:
    sub = str(google_sub or "").strip()
    mail = str(email or "").strip()
    if not sub and not mail:
        return []

    resolved_sub = sub
    if not resolved_sub and mail:
        profile = get_profile_by_google_identity(None, mail)
        resolved_sub = str((profile or {}).get("google", {}).get("sub", "")).strip()

    if not resolved_sub:
        return []

    return _list_needs_focus_words_from_db(resolved_sub)
