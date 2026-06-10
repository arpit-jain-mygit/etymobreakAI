from __future__ import annotations

import json
import os
import re
from typing import Any

DEFAULT_ANALYSES: dict[tuple[str, str], dict[str, Any]] = {
    (
        "cardiology",
        "word",
    ): {
        "query": "cardiology",
        "mode": "word",
        "title": "CARDIOLOGY",
        "summary": "A medical term built from the root cardio and the suffix -logy.",
        "literalMeaning": "cardio + logy",
        "actualMeaning": "The branch of medicine that deals with the heart and blood vessels.",
        "parts": [
            {"label": "cardio", "type": "root", "meaning": "heart", "source": "Greek kardia"},
            {"label": "-logy", "type": "suffix", "meaning": "study of, science of", "source": "Greek logia"},
        ],
        "relatedWords": [
            {"word": "Cardiology", "meaning": "study of the heart"},
            {"word": "Cardiologist", "meaning": "heart specialist"},
            {"word": "Cardiac", "meaning": "relating to the heart"},
            {"word": "Cardiovascular", "meaning": "heart and blood vessels"},
            {"word": "Electrocardiogram", "meaning": "recording of heart activity"},
        ],
        "notes": ["This is a demo analysis that can be replaced by Gemini output."],
    },
    (
        "arch",
        "root",
    ): {
        "query": "arch",
        "mode": "root",
        "title": "ARCH",
        "summary": "A root tied to leadership, rule, and chief authority.",
        "literalMeaning": "chief, ruler",
        "actualMeaning": "A root that appears in words meaning leader, first, or principal.",
        "parts": [
            {"label": "arch", "type": "root", "meaning": "chief; ruler", "source": "Greek archon"}
        ],
        "relatedWords": [
            {"word": "Monarch", "meaning": "one ruler"},
            {"word": "Patriarch", "meaning": "father ruler"},
            {"word": "Matriarch", "meaning": "mother ruler"},
            {"word": "Archangel", "meaning": "chief angel"},
            {"word": "Architect", "meaning": "chief builder"},
        ],
        "notes": ["Search by a root to discover a full word family."],
    },
}

FALLBACKS: dict[str, dict[str, Any]] = {
    "word": {
        "query": "cardiology",
        "mode": "word",
        "title": "CARDIOLOGY",
        "summary": "A word breakdown view for a full term.",
        "literalMeaning": "root + suffix",
        "actualMeaning": "Shows how the word is built from smaller parts.",
        "parts": [{"label": "cardio", "type": "root", "meaning": "heart", "source": "Greek kardia"}],
        "relatedWords": [{"word": "Cardiac", "meaning": "relating to the heart"}],
        "notes": ["Fallback preview for word analysis."],
    },
    "root": {
        "query": "arch",
        "mode": "root",
        "title": "ARCH",
        "summary": "A root preview for related words.",
        "literalMeaning": "chief, ruler",
        "actualMeaning": "Useful for exploring a root family.",
        "parts": [{"label": "arch", "type": "root", "meaning": "chief; ruler", "source": "Greek archon"}],
        "relatedWords": [{"word": "Monarch", "meaning": "one ruler"}],
        "notes": ["Fallback preview for root analysis."],
    },
    "prefix": {
        "query": "bio",
        "mode": "prefix",
        "title": "BIO-",
        "summary": "A prefix associated with life and living systems.",
        "literalMeaning": "life",
        "actualMeaning": "Used in words related to life or living organisms.",
        "parts": [{"label": "bio", "type": "prefix", "meaning": "life", "source": "Greek bios"}],
        "relatedWords": [{"word": "Biology", "meaning": "study of life"}],
        "notes": ["Fallback preview for prefix analysis."],
    },
    "suffix": {
        "query": "logy",
        "mode": "suffix",
        "title": "-LOGY",
        "summary": "A suffix that often means study of or science of.",
        "literalMeaning": "study of",
        "actualMeaning": "Used in academic and scientific terms.",
        "parts": [{"label": "logy", "type": "suffix", "meaning": "study of", "source": "Greek logia"}],
        "relatedWords": [{"word": "Biology", "meaning": "study of life"}],
        "notes": ["Fallback preview for suffix analysis."],
    },
}


def normalize_mode(value: str | None) -> str:
    if value in {"word", "root", "prefix", "suffix"}:
        return value
    return "word"


def _strip_json_wrappers(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned


def _normalize_output(data: dict[str, Any], query: str, mode: str) -> dict[str, Any]:
    return {
        "query": data.get("query", query),
        "mode": normalize_mode(data.get("mode", mode)),
        "title": data.get("title", query.upper()),
        "summary": data.get("summary", ""),
        "literalMeaning": data.get("literalMeaning", ""),
        "actualMeaning": data.get("actualMeaning", ""),
        "parts": data.get("parts", []),
        "relatedWords": data.get("relatedWords", []),
        "notes": data.get("notes", []),
    }


def _gemini_analysis(query: str, mode: str) -> dict[str, Any] | None:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    try:
        import google.generativeai as genai
    except Exception:
        return None

    model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    prompt = f"""
Return only valid JSON with the following keys:
query, mode, title, summary, literalMeaning, actualMeaning, parts, relatedWords, notes

User input:
- query: {query}
- mode: {mode}

Rules:
- parts must be an array of objects with label, type, meaning, and optional source.
- relatedWords must be an array of objects with word and meaning.
- notes must be an array of short strings.
- Keep the response concise and educational.
"""

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name)
    response = model.generate_content(prompt)
    text = getattr(response, "text", "") or ""
    parsed = json.loads(_strip_json_wrappers(text))
    return _normalize_output(parsed, query, mode)


def analyze(query: str, mode: str = "word") -> dict[str, Any]:
    normalized_query = query.strip().lower()
    normalized_mode = normalize_mode(mode)

    if not normalized_query:
        return {
            "query": "",
            "mode": normalized_mode,
            "title": "",
            "summary": "",
            "literalMeaning": "",
            "actualMeaning": "",
            "parts": [],
            "relatedWords": [],
            "notes": ["Enter a word, root, prefix, or suffix to continue."],
        }

    for key in ((normalized_query, normalized_mode), ("cardiology", "word"), ("arch", "root")):
        if key in DEFAULT_ANALYSES:
            return DEFAULT_ANALYSES[key]

    try:
        gemini_result = _gemini_analysis(normalized_query, normalized_mode)
        if gemini_result:
            return gemini_result
    except Exception:
        pass

    return _normalize_output(FALLBACKS[normalized_mode], normalized_query, normalized_mode)
