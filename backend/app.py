from __future__ import annotations

import os

from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .service import AnalysisError, analyze

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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
    first_name = payload.firstName.strip()
    last_name = payload.lastName.strip()
    country = payload.country.strip()
    google = payload.google if isinstance(payload.google, dict) else {}

    if not first_name or not last_name or not country:
        return JSONResponse(
            status_code=422,
            content={
                "error": "Profile fields are required.",
                "details": "First name, last name, and country must be provided.",
            },
        )

    return {
        "id": f"profile-{google.get('sub', '') or google.get('email', '') or 'local'}",
        "firstName": first_name,
        "lastName": last_name,
        "country": country,
        "google": google,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
