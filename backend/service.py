from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
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


ROOT_INVENTORY_PATH = Path(__file__).resolve().parents[1] / "public" / "root-inventory.json"


def _blank_output(query: str, mode: str) -> dict[str, Any]:
    return {
        "query": query,
        "mode": normalize_mode(mode),
        "title": "",
        "summary": "",
        "literalMeaningFormula": "",
        "literalMeaningArrow": "",
        "literalMeaning": "",
        "actualMeaning": "",
        "breakdown": [],
        "otherWords": [],
        "relatedWords": [],
        "slideNumber": None,
        "rootFamily": {},
        "familyMemory": [],
        "notes": [],
    }


def _text(value: Any) -> str:
    if isinstance(value, str):
        cleaned = value.strip()
        if cleaned.startswith("{") or cleaned.startswith("["):
            return ""
        return cleaned
    return ""


def _text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_text(item) for item in value if _text(item)]


def _coerce_breakdown(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    output: list[dict[str, Any]] = []
    for index, item in enumerate(value, start=1):
        if not isinstance(item, dict):
            continue
        output.append(
            {
                "index": item.get("index", index),
                "label": _text(item.get("label", "")),
                "type": _text(item.get("type", "")),
                "meaning": _text(item.get("meaning", "")),
                "source": _text(item.get("source", "")),
            }
        )
    return output


def _coerce_other_words(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    groups: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        words = item.get("words", [])
        if not isinstance(words, list):
            words = []
        groups.append(
            {
                "title": _text(item.get("title", "")),
                "focus": _text(item.get("focus", "")),
                "words": [
                    {
                        "word": _text(word.get("word", "")),
                        "meaning": _text(word.get("meaning", "")),
                    }
                    for word in words
                    if isinstance(word, dict) and _text(word.get("word", ""))
                ],
            }
        )
    return groups


def _coerce_word_family(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    words: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue

        word = _text(item.get("word", ""))
        if not word:
            continue

        words.append(
            {
                "word": word,
                "meaning": _text(item.get("meaning", "")),
            }
        )
    return words


def _coerce_related_words(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    words: list[dict[str, Any]] = []
    for item in value[:10]:
        if not isinstance(item, dict):
            continue
        word = _text(item.get("word", ""))
        if not word:
            continue
        words.append(
            {
                "word": word,
                "breakdown": _text(item.get("breakdown", "")),
                "meaning": _text(item.get("meaning", "")),
                "explanation": _text(item.get("explanation", "")),
                "exampleSentence": _text(item.get("exampleSentence", "")),
            }
        )
    return words


def _coerce_family_memory(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    rows: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        term = _text(item.get("term", ""))
        if not term:
            continue
        rows.append(
            {
                "term": term,
                "meaning": _text(item.get("meaning", "")),
            }
        )
    return rows


def _coerce_root_family(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}

    return {
        "root": _text(value.get("root", "")),
        "meaning": _text(value.get("meaning", "")),
        "origin": _text(value.get("origin", "")),
    }


@lru_cache(maxsize=1)
def _load_inventory() -> dict[str, dict[str, Any]]:
    if not ROOT_INVENTORY_PATH.exists():
        return {}

    try:
        raw = json.loads(ROOT_INVENTORY_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}

    entries: list[dict[str, Any]]
    if isinstance(raw, list):
        entries = [item for item in raw if isinstance(item, dict)]
    elif isinstance(raw, dict):
        entries = [item for item in raw.values() if isinstance(item, dict)]
    else:
        entries = []

    inventory: dict[str, dict[str, Any]] = {}
    for item in entries:
        key = str(item.get("query", "")).strip().lower()
        if key:
            inventory[key] = item
    return inventory


def _lookup_inventory(query: str) -> dict[str, Any] | None:
    return _load_inventory().get(query.strip().lower())


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


def _parse_json_payload(text: str) -> dict[str, Any] | None:
    cleaned = _strip_json_wrappers(text)
    candidates = [cleaned]

    for _ in range(3):
        current = candidates[-1]

        try:
            parsed = json.loads(current)
        except json.JSONDecodeError:
            parsed = None

        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, str):
            unwrapped = parsed.strip()
            if unwrapped and unwrapped not in candidates:
                candidates.append(unwrapped)
                continue
            break
        if isinstance(parsed, list):
            return None

        block = _find_json_object(current)
        if block:
            try:
                nested = json.loads(block)
            except json.JSONDecodeError:
                nested = None
            if isinstance(nested, dict):
                return nested
            if isinstance(nested, str):
                unwrapped = nested.strip()
                if unwrapped and unwrapped not in candidates:
                    candidates.append(unwrapped)
                    continue
        break

    return None


def _normalize_output(data: dict[str, Any], query: str, mode: str) -> dict[str, Any]:
    breakdown = _coerce_breakdown(data.get("breakdown", data.get("parts", [])))
    word_family = _coerce_word_family(data.get("wordFamily", []))
    other_words = _coerce_other_words(data.get("otherWords", []))
    related_words = _coerce_related_words(data.get("relatedWords", []))
    family_memory = _coerce_family_memory(data.get("familyMemory", []))
    slide_number = data.get("slideNumber", None)
    if isinstance(slide_number, bool):
        slide_number = None
    elif isinstance(slide_number, int):
        pass
    else:
        slide_number = None
    return {
        "query": _text(data.get("query", query)) or query,
        "mode": normalize_mode(_text(data.get("mode", mode)) or mode),
        "title": _text(data.get("title", query.upper())),
        "summary": _text(data.get("summary", "")),
        "literalMeaningFormula": _text(data.get("literalMeaningFormula", "")),
        "literalMeaningArrow": _text(data.get("literalMeaningArrow", "")),
        "literalMeaning": _text(data.get("literalMeaning", "")),
        "actualMeaning": _text(data.get("actualMeaning", "")),
        "breakdown": breakdown,
        "otherWords": other_words
        if other_words
        else (
            [
                {
                    "title": "Word Family",
                    "focus": _text(data.get("rootFamily", {}).get("root", "")),
                    "words": word_family,
                }
            ]
            if word_family
            else []
        ),
        "relatedWords": related_words
        if related_words
        else [
            {
                "word": item["word"],
                "breakdown": "",
                "meaning": item["meaning"],
                "explanation": "",
                "exampleSentence": "",
            }
            for item in word_family
        ],
        "slideNumber": slide_number,
        "rootFamily": _coerce_root_family(data.get("rootFamily", {})),
        "familyMemory": family_memory,
        "notes": _text_list(data.get("notes", [])),
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
    inventory_hit = _lookup_inventory(query)
    if inventory_hit:
        return _normalize_output(inventory_hit, query, mode)

    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        raise AnalysisError(503, "Missing Mistral API key", "Set MISTRAL_API_KEY in Render")

    model_name = os.getenv("MISTRAL_MODEL", "mistral-small-latest")
    prompt = f"""JSON only. Keys: query, mode, title, summary, breakdown, literalMeaningFormula, literalMeaningArrow, literalMeaning, actualMeaning, otherWords, relatedWords, familyMemory, notes, slideNumber, rootFamily.
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
familyMemory: 3 to 6 short rows with term and meaning.
notes: up to 2 short strings.
slideNumber: a number.
rootFamily: object with root, meaning, origin.
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

    parsed = _parse_json_payload(text)
    if not isinstance(parsed, dict):
        return _blank_output(query, mode)

    output = _normalize_output(parsed, query, mode)
    output["relatedWords"] = _filter_related_words(
        output["relatedWords"],
        query,
        output["breakdown"],
        output["otherWords"],
    )
    return output


def analyze(query: str, mode: str = "word") -> dict[str, Any]:
    normalized_query = query.strip().lower()
    normalized_mode = normalize_mode(mode)

    if not normalized_query:
        raise AnalysisError(400, "Query is required")

    return _mistral_analysis(normalized_query, normalized_mode)
