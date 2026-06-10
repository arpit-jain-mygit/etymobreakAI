from __future__ import annotations

import json
import os
import re
from typing import Any


class AnalysisError(Exception):
    def __init__(self, status_code: int, message: str, details: str | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.details = details

    def __str__(self) -> str:
        if self.details:
            return f"{self.message}: {self.details}"
        return self.message


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


def _extract_json_block(text: str) -> str:
    cleaned = _strip_json_wrappers(text)
    if cleaned.startswith("{") and cleaned.endswith("}"):
        return cleaned

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        return cleaned[start : end + 1]

    raise AnalysisError(502, "Gemini returned non-JSON output", cleaned[:400])


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


def _gemini_analysis(query: str, mode: str) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise AnalysisError(503, "Missing Gemini API key", "Set GEMINI_API_KEY in Render")

    try:
        import google.generativeai as genai
    except Exception as exc:
        raise AnalysisError(500, "Gemini SDK import failed", str(exc)) from exc

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
- Use the user's exact input. Do not substitute another word.
- If the word is unfamiliar or ambiguous, infer the most likely morphology from the exact input.
- Never return an answer about a different query.
"""

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name)
    try:
        response = model.generate_content(
            prompt,
            generation_config={
                "temperature": 0.2,
                "top_p": 0.95,
                "max_output_tokens": 900,
            },
        )
    except Exception as exc:
        raise AnalysisError(502, "Gemini request failed", str(exc)) from exc

    text = getattr(response, "text", "") or ""
    if not text.strip():
        raise AnalysisError(502, "Gemini returned an empty response")

    try:
        parsed = json.loads(_extract_json_block(text))
    except json.JSONDecodeError as exc:
        raise AnalysisError(502, "Gemini returned invalid JSON", text[:400]) from exc

    output = _normalize_output(parsed, query, mode)
    if not output["summary"] or not output["parts"]:
        raise AnalysisError(502, "Gemini response missing required fields", text[:400])
    return output


def analyze(query: str, mode: str = "word") -> dict[str, Any]:
    normalized_query = query.strip().lower()
    normalized_mode = normalize_mode(mode)

    if not normalized_query:
        raise AnalysisError(400, "Query is required")

    return _gemini_analysis(normalized_query, normalized_mode)
