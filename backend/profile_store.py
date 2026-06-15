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

try:
    from google.cloud import storage
    from google.oauth2 import service_account
except ImportError:  # pragma: no cover - dependency is installed in deployment
    storage = None  # type: ignore[assignment]
    service_account = None  # type: ignore[assignment]


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


def _sanitize_path_segment(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._=-]+", "_", value.strip())
    return cleaned.strip("._-") or "unknown"


def _bucket_name() -> str:
    return (
        os.getenv("GCP_ETYMOBREAK_BUCKET", "").strip()
        or os.getenv("GCP_QUIZ_BUCKET", "").strip()
        or os.getenv("GCS_BUCKET_NAME", "").strip()
        or os.getenv("QUIZ_BUCKET_NAME", "").strip()
    )


def _bucket_client() -> tuple[Any, str]:
    bucket_name = _bucket_name()
    if not bucket_name:
        raise ProfileStoreError("GCP quiz bucket is not configured.")
    if storage is None:
        raise ProfileStoreError("google-cloud-storage is not installed.")

    raw_credentials = (
        os.getenv("GCP_SERVICE_ACCOUNT_JSON", "").strip()
        or os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "").strip()
    )
    if raw_credentials:
        if service_account is None:
            raise ProfileStoreError("google-auth is not installed.")
        try:
            credentials_info = json.loads(raw_credentials)
        except Exception as exc:
            raise ProfileStoreError(f"Invalid GCP service account JSON: {exc}") from exc

        credentials = service_account.Credentials.from_service_account_info(credentials_info)
        project_id = str(credentials_info.get("project_id", "")).strip() or os.getenv("GCP_PROJECT_ID", "").strip()
        return storage.Client(project=project_id or None, credentials=credentials), bucket_name

    return storage.Client(), bucket_name


def _broker_url() -> str:
    return os.getenv("BROKER_URL", "").strip().rstrip("/")


def _broker_secret() -> str:
    return os.getenv("BROKER_SHARED_SECRET", "").strip()


def _broker_is_configured() -> bool:
    return bool(_broker_url() and _broker_secret())


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
        if _broker_is_configured():
            try:
                return _call_broker("POST", "/confident-words", payload=payload)
            except ProfileStoreError:
                pass

        _delete_confident_word_from_bucket(google_sub, query, mode)
        return {
            "id": confident_id,
            "query": query,
            "mode": mode,
            "removed": True,
        }

    if _broker_is_configured():
        try:
            return _call_broker("POST", "/confident-words", payload=payload)
        except ProfileStoreError:
            pass

    bucket_object_name, bucket_uri = _write_confident_word_to_bucket(
        confident_id=confident_id,
        profile_id=profile_id,
        google_sub=google_sub,
        profile_data=profile,
        payload=payload,
        created_at=now,
    )
    analysis = _confident_analysis_payload(payload)
    return {
        "id": confident_id,
        "time": now,
        "query": query,
        "mode": mode,
        "title": str(analysis.get("title", "")).strip(),
        "playerName": f"{first_name} {last_name}".strip(),
        "playerEmail": email,
        "country": country,
        "analysis": analysis,
        "bucketObjectName": bucket_object_name,
        "bucketUri": bucket_uri,
    }


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
        if _broker_is_configured():
            try:
                return _call_broker("POST", "/needs-focus-words", payload=payload)
            except ProfileStoreError:
                pass

        _delete_needs_focus_word_from_bucket(google_sub, query, mode)
        return {
            "id": focus_id,
            "query": query,
            "mode": mode,
            "removed": True,
        }

    if _broker_is_configured():
        try:
            return _call_broker("POST", "/needs-focus-words", payload=payload)
        except ProfileStoreError:
            pass

    bucket_object_name, bucket_uri = _write_needs_focus_word_to_bucket(
        focus_id=focus_id,
        profile_id=profile_id,
        google_sub=google_sub,
        profile_data=profile,
        payload=payload,
        created_at=now,
    )
    return {
        "id": focus_id,
        "time": now,
        "query": query,
        "mode": mode,
        "title": str(analysis.get("title", "")).strip(),
        "playerName": f"{first_name} {last_name}".strip(),
        "playerEmail": email,
        "country": country,
        "analysis": analysis,
        "bucketObjectName": bucket_object_name,
        "bucketUri": bucket_uri,
    }


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

    if _broker_is_configured():
        try:
            broker_payload = _call_broker("GET", "/confident-words", params={"sub": resolved_sub, "email": mail})
            items = broker_payload.get("items", [])
            return items if isinstance(items, list) else []
        except ProfileStoreError:
            pass

    client, bucket_name = _bucket_client()
    bucket = client.bucket(bucket_name)
    prefix = f"users/{_sanitize_path_segment(resolved_sub)}/confident-words/"

    entries: list[dict[str, Any]] = []
    for blob in client.list_blobs(bucket, prefix=prefix):
        try:
            raw = blob.download_as_text()
            payload = json.loads(raw)
        except Exception:
            continue

        if not isinstance(payload, dict):
            continue

        player = payload.get("player", {})
        analysis = payload.get("analysis", {})
        if not isinstance(player, dict):
            player = {}
        if not isinstance(analysis, dict):
            analysis = {}

        entries.append(
            {
                "id": str(payload.get("id", "")).strip() or blob.name.rsplit("/", 1)[-1].removesuffix(".json"),
                "time": str(payload.get("updatedAt", "")).strip() or str(payload.get("createdAt", "")).strip() or (
                    blob.updated.isoformat() if getattr(blob, "updated", None) else ""
                ),
                "query": str(payload.get("query", "")).strip(),
                "mode": str(payload.get("mode", "")).strip(),
                "title": str(payload.get("metadata", {}).get("title", "")).strip()
                if isinstance(payload.get("metadata", {}), dict)
                else str(analysis.get("title", "")).strip(),
                "playerName": f"{str(player.get('firstName', '')).strip()} {str(player.get('lastName', '')).strip()}".strip(),
                "playerEmail": str(player.get("email", "")).strip() or mail,
                "country": str(player.get("country", "")).strip(),
                "analysis": analysis,
                "bucketObjectName": blob.name,
                "bucketUri": f"gs://{bucket_name}/{blob.name}",
            }
        )

    entries.sort(key=lambda item: item.get("time", ""), reverse=True)
    return entries


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

    if _broker_is_configured():
        try:
            broker_payload = _call_broker("GET", "/needs-focus-words", params={"sub": resolved_sub, "email": mail})
            items = broker_payload.get("items", [])
            return items if isinstance(items, list) else []
        except ProfileStoreError:
            pass

    client, bucket_name = _bucket_client()
    bucket = client.bucket(bucket_name)
    prefix = f"users/{_sanitize_path_segment(resolved_sub)}/needs-focus-words/"

    entries: list[dict[str, Any]] = []
    for blob in client.list_blobs(bucket, prefix=prefix):
        try:
            raw = blob.download_as_text()
            payload = json.loads(raw)
        except Exception:
            continue

        if not isinstance(payload, dict):
            continue

        player = payload.get("player", {})
        analysis = payload.get("analysis", {})
        if not isinstance(player, dict):
            player = {}
        if not isinstance(analysis, dict):
            analysis = {}

        entries.append(
            {
                "id": str(payload.get("id", "")).strip() or blob.name.rsplit("/", 1)[-1].removesuffix(".json"),
                "time": str(payload.get("updatedAt", "")).strip() or str(payload.get("createdAt", "")).strip() or (
                    blob.updated.isoformat() if getattr(blob, "updated", None) else ""
                ),
                "query": str(payload.get("query", "")).strip(),
                "mode": str(payload.get("mode", "")).strip(),
                "title": str(payload.get("metadata", {}).get("title", "")).strip()
                if isinstance(payload.get("metadata", {}), dict)
                else str(analysis.get("title", "")).strip(),
                "playerName": f"{str(player.get('firstName', '')).strip()} {str(player.get('lastName', '')).strip()}".strip(),
                "playerEmail": str(player.get("email", "")).strip() or mail,
                "country": str(player.get("country", "")).strip(),
                "analysis": analysis,
                "bucketObjectName": blob.name,
                "bucketUri": f"gs://{bucket_name}/{blob.name}",
            }
        )

    entries.sort(key=lambda item: item.get("time", ""), reverse=True)
    return entries
