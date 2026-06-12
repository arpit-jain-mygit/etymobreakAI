from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .service import AnalysisError, analyze
from .profile_store import (
    ProfileStoreError,
    ensure_schema,
    get_profile_by_google_identity,
    insert_quiz_history,
    list_quiz_history_by_google_identity,
    upsert_profile,
)

app = FastAPI(title="EtymoBreak AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    query: str = Field(min_length=1)


class ProfileRequest(BaseModel):
    firstName: str = Field(min_length=1)
    lastName: str = Field(min_length=1)
    country: str = Field(min_length=1)
    google: dict


class QuizHistoryRequest(BaseModel):
    profile: dict
    quizScope: str = Field(min_length=1)
    correctCount: int = Field(ge=0)
    wrongCount: int = Field(ge=0)
    marks: int = Field()
    percentage: int = Field(ge=0)
    totalPossible: int = Field(ge=0)
    attempt: dict = Field(default_factory=dict)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.on_event("startup")
def initialize_profile_store() -> None:
    try:
        ensure_schema()
    except ProfileStoreError:
        return


@app.get("/config")
def config() -> dict[str, str]:
    return {
        "googleClientId": os.getenv("GOOGLE_CLIENT_ID", ""),
    }


@app.post("/analyze")
def analyze_word(payload: AnalyzeRequest) -> dict:
    try:
        return analyze(payload.query)
    except AnalysisError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.message,
                "details": exc.details,
            },
        )


@app.post("/profile")
def create_profile(payload: ProfileRequest) -> dict:
    try:
        return upsert_profile(payload.model_dump())
    except ProfileStoreError as exc:
        return JSONResponse(
            status_code=503,
            content={
                "error": "Profile storage is unavailable.",
                "details": str(exc),
            },
        )


@app.get("/profile")
def get_profile(sub: str | None = None, email: str | None = None) -> dict:
    try:
        profile = get_profile_by_google_identity(sub, email)
    except ProfileStoreError as exc:
        return JSONResponse(
            status_code=503,
            content={
                "error": "Profile storage is unavailable.",
                "details": str(exc),
            },
        )

    if not profile:
        return JSONResponse(
            status_code=404,
            content={
                "error": "Profile not found.",
                "details": "No saved profile exists for this Google account.",
            },
        )

    return profile


@app.post("/quiz-history")
def create_quiz_history(payload: QuizHistoryRequest) -> dict:
    try:
        return insert_quiz_history(payload.model_dump())
    except ProfileStoreError as exc:
        return JSONResponse(
            status_code=503,
            content={
                "error": "Quiz history storage is unavailable.",
                "details": str(exc),
            },
        )


@app.get("/quiz-history")
def get_quiz_history(sub: str | None = None, email: str | None = None) -> dict:
    try:
        history = list_quiz_history_by_google_identity(sub, email)
    except ProfileStoreError as exc:
        return JSONResponse(
            status_code=503,
            content={
                "error": "Quiz history storage is unavailable.",
                "details": str(exc),
            },
        )

    return {"items": history}
