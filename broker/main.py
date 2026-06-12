from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from google.cloud import storage
except ImportError:  # pragma: no cover - dependency is installed in deployment
    storage = None  # type: ignore[assignment]

# for cloud build trigger check
class QuizHistoryRequest(BaseModel):
    id: str = Field(default="")
    profile: dict
    quizScope: str = Field(min_length=1)
    quizType: str = Field(default="")
    difficulty: int = Field(default=0, ge=0)
    questionCount: int = Field(default=0, ge=0)
    timeLimitMinutes: int = Field(default=25, ge=0)
    timeSpentSeconds: int = Field(default=0, ge=0)
    correctCount: int = Field(ge=0)
    wrongCount: int = Field(ge=0)
    marks: int = Field()
    percentage: int = Field(ge=0)
    totalPossible: int = Field(ge=0)
    attempt: dict = Field(default_factory=dict)

# test message for cloud build trigger
class ConfidentWordRequest(BaseModel):
    id: str = Field(default="")
    profile: dict
    query: str = Field(min_length=1)
    mode: str = Field(default="word")
    analysis: dict = Field(default_factory=dict)
    confident: bool = Field(default=True)


app = FastAPI(title="EtymoBreak AI Quiz Broker")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _bucket_name() -> str:
    return (
        os.getenv("GCP_QUIZ_BUCKET", "").strip()
        or os.getenv("GCS_BUCKET_NAME", "").strip()
        or os.getenv("QUIZ_BUCKET_NAME", "").strip()
    )


def _shared_secret() -> str:
    return os.getenv("BROKER_SHARED_SECRET", "").strip()


def _sanitize_path_segment(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._=-]+", "_", value.strip())
    return cleaned.strip("._-") or "unknown"


def _require_secret(secret: str | None = Header(default=None, alias="X-EtymoBreak-Broker-Secret")) -> None:
    expected = _shared_secret()
    if not expected:
        raise HTTPException(status_code=500, detail="BROKER_SHARED_SECRET is not configured.")
    if secret != expected:
        raise HTTPException(status_code=403, detail="Invalid broker secret.")


def _bucket_client() -> tuple[Any, str]:
    bucket_name = _bucket_name()
    if not bucket_name:
        raise HTTPException(status_code=500, detail="GCP quiz bucket is not configured.")
    if storage is None:
        raise HTTPException(status_code=500, detail="google-cloud-storage is not installed.")
    return storage.Client(), bucket_name


def _profile_payload(profile: dict[str, Any]) -> dict[str, str]:
    google = profile.get("google", {}) if isinstance(profile.get("google", {}), dict) else {}
    return {
        "firstName": str(profile.get("firstName", "")).strip(),
        "lastName": str(profile.get("lastName", "")).strip(),
        "country": str(profile.get("country", "")).strip(),
        "email": str(google.get("email", "")).strip(),
    }


def _attempt_payload(
    *,
    quiz_history_id: str,
    profile_id: str,
    google_sub: str,
    profile_data: dict[str, Any],
    payload: QuizHistoryRequest,
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
        "player": _profile_payload(profile_data),
        "attempt": payload.attempt,
        "metadata": {
            "quizScope": str(payload.quizScope).strip().upper() or "ALL",
            "correctCount": int(payload.correctCount or 0),
            "wrongCount": int(payload.wrongCount or 0),
            "marks": int(payload.marks or 0),
            "percentage": int(payload.percentage or 0),
            "totalPossible": int(payload.totalPossible or 0),
        },
        "summary": {
            "quizType": str(payload.quizType).strip(),
            "difficulty": int(payload.difficulty or 0),
            "questionCount": int(payload.questionCount or 0),
            "timeLimitMinutes": int(payload.timeLimitMinutes or 0),
            "timeSpentSeconds": int(payload.timeSpentSeconds or 0),
        },
    }

    blob = bucket.blob(object_name)
    blob.upload_from_string(json.dumps(bucket_payload, ensure_ascii=False, indent=2), content_type="application/json")
    return object_name, f"gs://{bucket_name}/{object_name}"


def _confident_object_name(google_sub: str, query: str, mode: str) -> str:
    profile_folder = _sanitize_path_segment(google_sub)
    return f"users/{profile_folder}/confident-words/{_sanitize_path_segment(query)}--{_sanitize_path_segment(mode or 'word')}.json"


def _confident_payload(payload: ConfidentWordRequest) -> dict[str, Any]:
    analysis = payload.analysis if isinstance(payload.analysis, dict) else {}
    return {
        "id": str(payload.id or "").strip(),
        "query": str(payload.query or analysis.get("query", "")).strip(),
        "mode": str(payload.mode or analysis.get("mode", "word")).strip() or "word",
        "analysis": analysis,
    }


def _confident_item_from_payload(payload: dict[str, Any], bucket_name: str, blob_name: str, fallback_email: str) -> dict[str, Any]:
    metadata = payload.get("metadata", {}) if isinstance(payload.get("metadata", {}), dict) else {}
    player = payload.get("player", {}) if isinstance(payload.get("player", {}), dict) else {}
    analysis = payload.get("analysis", {}) if isinstance(payload.get("analysis", {}), dict) else {}

    return {
        "id": str(payload.get("id", "")).strip() or blob_name.rsplit("/", 1)[-1].removesuffix(".json"),
        "time": str(payload.get("updatedAt", "")).strip() or str(payload.get("createdAt", "")).strip(),
        "query": str(payload.get("query", "")).strip(),
        "mode": str(payload.get("mode", "")).strip(),
        "title": str(metadata.get("title", "")).strip() or str(analysis.get("title", "")).strip(),
        "playerName": f"{str(player.get('firstName', '')).strip()} {str(player.get('lastName', '')).strip()}".strip(),
        "playerEmail": str(player.get("email", "")).strip() or fallback_email,
        "country": str(player.get("country", "")).strip(),
        "analysis": analysis,
        "bucketObjectName": blob_name,
        "bucketUri": f"gs://{bucket_name}/{blob_name}",
    }


def _profile_id(google_sub: str) -> str:
    return f"profile-{google_sub}"


def _history_item_from_payload(payload: dict[str, Any], bucket_name: str, blob_name: str, fallback_email: str) -> dict[str, Any]:
    metadata = payload.get("metadata", {}) if isinstance(payload.get("metadata", {}), dict) else {}
    summary = payload.get("summary", {}) if isinstance(payload.get("summary", {}), dict) else {}
    player = payload.get("player", {}) if isinstance(payload.get("player", {}), dict) else {}
    attempt = payload.get("attempt", {}) if isinstance(payload.get("attempt", {}), dict) else {}
    player_first = str(player.get("firstName", "")).strip()
    player_last = str(player.get("lastName", "")).strip()

    return {
        "id": str(payload.get("id", "")).strip() or blob_name.rsplit("/", 1)[-1].removesuffix(".json"),
        "time": str(payload.get("createdAt", "")).strip(),
        "playerName": f"{player_first} {player_last}".strip(),
        "playerEmail": str(player.get("email", "")).strip() or fallback_email,
        "country": str(player.get("country", "")).strip(),
        "quizScope": str(metadata.get("quizScope", "")).strip(),
        "correct": int(metadata.get("correctCount", 0) or 0),
        "wrong": int(metadata.get("wrongCount", 0) or 0),
        "marks": int(metadata.get("marks", 0) or 0),
        "percentage": int(metadata.get("percentage", 0) or 0),
        "total": int(metadata.get("totalPossible", 0) or 0),
        "bucketObjectName": blob_name,
        "bucketUri": f"gs://{bucket_name}/{blob_name}",
        "quizType": str(summary.get("quizType", "")).strip(),
        "difficulty": int(summary.get("difficulty", 0) or 0),
        "questionCount": int(summary.get("questionCount", 0) or 0),
        "timeLimitMinutes": int(summary.get("timeLimitMinutes", 0) or 0),
        "timeSpentSeconds": int(summary.get("timeSpentSeconds", 0) or 0),
        "questions": attempt.get("questions", []),
    }


@app.get("/health")
def health() -> dict[str, str]:
    # Smoke-test anchor for Cloud Build trigger verification.
    return {"status": "ok"}


@app.post("/quiz-history", dependencies=[Depends(_require_secret)])
def create_quiz_history(payload: QuizHistoryRequest) -> dict[str, Any]:
    profile = payload.profile if isinstance(payload.profile, dict) else {}
    google = profile.get("google", {}) if isinstance(profile.get("google", {}), dict) else {}

    google_sub = str(google.get("sub", "")).strip()
    email = str(google.get("email", "")).strip()
    first_name = str(profile.get("firstName", "")).strip()
    last_name = str(profile.get("lastName", "")).strip()
    country = str(profile.get("country", "")).strip()

    if not google_sub or not email:
        raise HTTPException(status_code=400, detail="Google identity is required.")
    if not first_name or not last_name or not country:
        raise HTTPException(status_code=400, detail="Profile details are required.")

    now = datetime.now(timezone.utc).isoformat()
    quiz_history_id = str(payload.id or "").strip() or f"quiz-{google_sub}-{now}"
    bucket_object_name, bucket_uri = _attempt_payload(
        quiz_history_id=quiz_history_id,
        profile_id=_profile_id(google_sub),
        google_sub=google_sub,
        profile_data=profile,
        payload=payload,
        created_at=now,
    )

    return {
        "id": quiz_history_id,
        "time": now,
        "playerName": f"{first_name} {last_name}".strip(),
        "playerEmail": email,
        "country": country,
        "quizScope": str(payload.quizScope).strip().upper() or "ALL",
        "correct": int(payload.correctCount or 0),
        "wrong": int(payload.wrongCount or 0),
        "marks": int(payload.marks or 0),
        "percentage": int(payload.percentage or 0),
        "total": int(payload.totalPossible or 0),
        "bucketObjectName": bucket_object_name,
        "bucketUri": bucket_uri,
    }


@app.post("/confident-words", dependencies=[Depends(_require_secret)])
def save_confident_word(payload: ConfidentWordRequest) -> dict[str, Any]:
    profile = payload.profile if isinstance(payload.profile, dict) else {}
    google = profile.get("google", {}) if isinstance(profile.get("google", {}), dict) else {}

    google_sub = str(google.get("sub", "")).strip()
    email = str(google.get("email", "")).strip()
    first_name = str(profile.get("firstName", "")).strip()
    last_name = str(profile.get("lastName", "")).strip()
    country = str(profile.get("country", "")).strip()
    confident = bool(payload.confident)

    if not google_sub or not email:
        raise HTTPException(status_code=400, detail="Google identity is required.")
    if not first_name or not last_name or not country:
        raise HTTPException(status_code=400, detail="Profile details are required.")

    payload_data = _confident_payload(payload)
    query = payload_data["query"]
    mode = payload_data["mode"]
    if not query:
      raise HTTPException(status_code=400, detail="A query is required.")

    now = datetime.now(timezone.utc).isoformat()
    confident_id = str(payload.id or "").strip() or f"confident-{google_sub}-{query}-{mode}"

    if not confident:
        client, bucket_name = _bucket_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(_confident_object_name(google_sub, query, mode))
        try:
            blob.delete()
        except Exception:
            pass
        return {
            "id": confident_id,
            "query": query,
            "mode": mode,
            "removed": True,
        }

    client, bucket_name = _bucket_client()
    bucket = client.bucket(bucket_name)
    object_name = _confident_object_name(google_sub, query, mode)
    bucket_payload = {
        "id": confident_id,
        "profileId": f"profile-{google_sub}",
        "googleSub": google_sub,
        "createdAt": now,
        "updatedAt": now,
        "query": query,
        "mode": mode,
        "player": {
            "firstName": first_name,
            "lastName": last_name,
            "country": country,
            "email": email,
        },
        "analysis": payload_data["analysis"],
        "metadata": {
            "title": str(payload_data["analysis"].get("title", "")).strip(),
            "summary": str(payload_data["analysis"].get("summary", "")).strip(),
        },
    }

    blob = bucket.blob(object_name)
    blob.upload_from_string(json.dumps(bucket_payload, ensure_ascii=False, indent=2), content_type="application/json")
    return _confident_item_from_payload(bucket_payload, bucket_name, object_name, email)


@app.get("/confident-words", dependencies=[Depends(_require_secret)])
def get_confident_words(sub: str | None = None, email: str | None = None) -> dict[str, Any]:
    resolved_sub = str(sub or "").strip()
    mail = str(email or "").strip()
    if not resolved_sub and mail:
        return {"items": []}

    if not resolved_sub:
        return {"items": []}

    client, bucket_name = _bucket_client()
    bucket = client.bucket(bucket_name)
    prefix = f"users/{_sanitize_path_segment(resolved_sub)}/confident-words/"

    items: list[dict[str, Any]] = []
    for blob in client.list_blobs(bucket, prefix=prefix):
        try:
            raw = blob.download_as_text()
            payload = json.loads(raw)
        except Exception:
            continue

        if not isinstance(payload, dict):
            continue

        items.append(_confident_item_from_payload(payload, bucket_name, blob.name, mail))

    items.sort(key=lambda item: item.get("time", ""), reverse=True)
    return {"items": items}


@app.get("/quiz-history", dependencies=[Depends(_require_secret)])
def list_quiz_history(sub: str | None = None, email: str | None = None) -> dict[str, Any]:
    resolved_sub = str(sub or "").strip()
    fallback_email = str(email or "").strip()
    if not resolved_sub and not fallback_email:
        return {"items": []}

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

        history.append(_history_item_from_payload(payload, bucket_name, blob.name, fallback_email))

    history.sort(key=lambda item: item.get("time", ""), reverse=True)
    return {"items": history}
