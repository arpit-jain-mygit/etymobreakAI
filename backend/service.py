from __future__ import annotations

import json
import os
import re
from urllib import error, request
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


def _find_json_object(text: str) -> str | None:
    start = text.find("{")
    if start < 0:
        return None

    depth = 0
    in_string = False
    escape = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return None


def _extract_json_block(text: str) -> str:
    cleaned = _strip_json_wrappers(text)
    if cleaned.startswith("{") and cleaned.endswith("}"):
        return cleaned

    block = _find_json_object(cleaned)
    if block:
        return block

    raise AnalysisError(502, "Mistral returned non-JSON output", cleaned[:400])


def _normalize_output(data: dict[str, Any], query: str, mode: str) -> dict[str, Any]:
    breakdown = data.get("breakdown", data.get("parts", []))
    other_words = data.get("otherWords", [])
    related_words = data.get("relatedWords", [])
    memory_hacks = data.get("memoryHacks", [])
    quick_recall = data.get("quickRecallTable", [])
    family_memory = data.get("familyMemory", [])
    final_shortcut = data.get("finalShortcut", {})
    return {
        "query": data.get("query", query),
        "mode": normalize_mode(data.get("mode", mode)),
        "title": data.get("title", query.upper()),
        "summary": data.get("summary", ""),
        "literalMeaningFormula": data.get("literalMeaningFormula", ""),
        "literalMeaningArrow": data.get("literalMeaningArrow", ""),
        "literalMeaning": data.get("literalMeaning", ""),
        "actualMeaning": data.get("actualMeaning", ""),
        "breakdown": breakdown if isinstance(breakdown, list) else [],
        "otherWords": other_words if isinstance(other_words, list) else [],
        "relatedWords": related_words[:10] if isinstance(related_words, list) else [],
        "memoryHacks": memory_hacks if isinstance(memory_hacks, list) else [],
        "quickRecallTable": quick_recall if isinstance(quick_recall, list) else [],
        "finalShortcut": final_shortcut if isinstance(final_shortcut, dict) else {},
        "familyMemory": family_memory if isinstance(family_memory, list) else [],
        "notes": data.get("notes", []),
        "conclusion": data.get("conclusion", ""),
    }


def _extract_match_terms(query: str, breakdown: list[Any], other_words: list[Any]) -> list[str]:
    terms = [query.strip().lower()]
    for part in breakdown:
        if not isinstance(part, dict):
            continue
        label = str(part.get("label", "")).strip().lower()
        cleaned = re.sub(r"^[^a-z0-9]+|[^a-z0-9]+$", "", label)
        if len(cleaned) >= 3:
            terms.append(cleaned)
    for group in other_words:
        if not isinstance(group, dict):
            continue
        focus = str(group.get("focus", "")).strip().lower()
        cleaned = re.sub(r"^[^a-z0-9]+|[^a-z0-9]+$", "", focus)
        if len(cleaned) >= 3:
            terms.append(cleaned)
    return list(dict.fromkeys(term for term in terms if term))


def _filter_related_words(
    related_words: Any,
    query: str,
    breakdown: list[Any],
    other_words: list[Any],
) -> list[dict[str, Any]]:
    if not isinstance(related_words, list):
        return []

    match_terms = _extract_match_terms(query, breakdown, other_words)
    filtered: list[dict[str, Any]] = []
    for item in related_words:
        if not isinstance(item, dict):
            continue
        word = str(item.get("word", "")).strip()
        normalized_word = word.lower()
        if any(term in normalized_word for term in match_terms):
            filtered.append(item)

    source = filtered if filtered else [item for item in related_words if isinstance(item, dict)]
    normalized: list[dict[str, Any]] = []
    for item in source[:10]:
        word = str(item.get("word", "")).strip()
        if not word:
            continue
        normalized.append(
            {
                "word": word,
                "meaning": str(item.get("meaning", "")).strip(),
                "explanation": str(item.get("explanation", "")).strip(),
                "exampleSentence": str(item.get("exampleSentence", "")).strip(),
            }
        )
    return normalized


def _mistral_analysis(query: str, mode: str) -> dict[str, Any]:
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        raise AnalysisError(503, "Missing Mistral API key", "Set MISTRAL_API_KEY in Render")

    model_name = os.getenv("MISTRAL_MODEL", "mistral-small-latest")
    prompt = f"""JSON only. Keys: query, mode, title, summary, breakdown, literalMeaningFormula, literalMeaningArrow, literalMeaning, actualMeaning, otherWords, relatedWords, memoryHacks, quickRecallTable, finalShortcut, familyMemory, conclusion, notes.
Query: {query}
Infer mode from the query and keep text short.
breakdown: up to 4 items. Each item must include: index, label, type, meaning, source.
literalMeaningFormula: a short formula line like "cardio + logy".
literalMeaningArrow: a short arrow line like "➡️ study of the heart".
literalMeaning: a one-line label or heading for the literal meaning block.
actualMeaning: one short paragraph.
otherWords: up to 2 groups. Each group must include: title, focus, words. Each words item must include: word, meaning.
relatedWords: up to 5 word-family items tied to the query root/prefix/suffix or extracted parts. No synonyms.
Each relatedWords item must include: word, breakdown, meaning, exampleSentence.
memoryHacks: up to 2 groups. Each group must include: title, lines. Make the lines short, friendly memory tips.
quickRecallTable: 2 to 4 rows with part and meaning.
finalShortcut: object with title and text.
familyMemory: 3 to 6 short rows with term and meaning.
conclusion: one short closing line that starts with the final answer, like "➡️ ..."
notes: up to 2 short strings.
No markdown. Never answer about a different query.
"""

    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "top_p": 0.95,
        "max_tokens": 650,
    }
    http_request = request.Request(
        "https://api.mistral.ai/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(http_request, timeout=45) as response:
            response_data = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
        raise AnalysisError(exc.code, "Mistral request failed", details[:400]) from exc
    except Exception as exc:
        raise AnalysisError(502, "Mistral request failed", str(exc)) from exc

    choices = response_data.get("choices") or []
    first_choice = choices[0] if choices else {}
    message = first_choice.get("message") or {}
    content = message.get("content", "")
    if isinstance(content, list):
        text = "".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in content)
    else:
        text = str(content or "")

    if not text.strip():
        raise AnalysisError(502, "Mistral returned an empty response")

    try:
        parsed = json.loads(_extract_json_block(text))
    except json.JSONDecodeError as exc:
        raise AnalysisError(502, "Mistral returned invalid JSON", text[:400]) from exc

    output = _normalize_output(parsed, query, mode)
    output["relatedWords"] = _filter_related_words(
        output["relatedWords"],
        query,
        output["breakdown"],
        output["otherWords"],
    )
    if not output["summary"] or not output["breakdown"]:
        raise AnalysisError(502, "Mistral response missing required fields", text[:400])
    return output


def analyze(query: str, mode: str = "word") -> dict[str, Any]:
    normalized_query = query.strip().lower()
    normalized_mode = normalize_mode(mode)

    if not normalized_query:
        raise AnalysisError(400, "Query is required")

    return _mistral_analysis(normalized_query, normalized_mode)
