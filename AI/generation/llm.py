"""Grounded answer generation via SumoPod (OpenAI-compatible chat).

The LLM only rewrites the retrieved chunks into a natural answer; it never
produces the citations (see generation/citations.py).
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

from config import DEFAULT_MODEL, SUMOPOD_API_KEY_ENV, SUMOPOD_BASE_URL
from generation.guardrails import CLARIFY_MARKER
from generation.prompts import build_messages
from provider_errors import (
    ProviderConfigurationError,
    ProviderHttpError,
    ProviderResponseError,
    ProviderUnavailableError,
)


_INTERNAL_CHUNK_REFERENCE = re.compile(
    r"\s*\[[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}-\d+(?:\s*-\s*[^\]]*)?\]",
    re.IGNORECASE,
)


def strip_internal_chunk_references(answer: str) -> str:
    """Keep chunk coordinates out of text; citations are sent as metadata."""
    return _INTERNAL_CHUNK_REFERENCE.sub("", answer).strip()


def unwrap_clarify_envelope(content: str) -> str:
    """Turn the typed JSON envelope back into what guardrails already parses.

    ``{"type":"clarify",...}`` becomes the ``CLARIFY: {...}`` line, anything else
    becomes plain answer text. A reply that is not the expected envelope is passed
    through untouched, so a provider that ignores ``response_format`` degrades to
    the old text behaviour rather than failing the request.
    """
    try:
        payload = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return content
    if not isinstance(payload, dict):
        return content
    if payload.get("type") == "clarify" and str(payload.get("pertanyaan", "")).strip():
        return CLARIFY_MARKER + " " + json.dumps(
            {
                "pertanyaan": payload.get("pertanyaan"),
                "pilihan": payload.get("pilihan", []),
            },
            ensure_ascii=False,
        )
    answer = payload.get("jawaban")
    return str(answer) if isinstance(answer, str) and answer.strip() else content


def generate_answer(query: str, matches: list[tuple[float, dict[str, Any]]],
                    model: str = DEFAULT_MODEL, api_key: str | None = None,
                    documents: list[dict[str, Any]] | None = None,
                    allow_clarify: bool = False) -> str:
    """Ask a SumoPod LLM to answer using intact page/section contexts only."""
    key = api_key or os.environ.get(SUMOPOD_API_KEY_ENV)
    if not key:
        raise ProviderConfigurationError(SUMOPOD_API_KEY_ENV)
    body_fields: dict[str, Any] = {
        "model": model,
        "messages": build_messages(query, matches, documents, allow_clarify),
        "temperature": 0.2,
    }
    if allow_clarify:
        # Bentuk balasan dipaksa provider, bukan diminta lewat kalimat prompt.
        # Tanpa ini model sesekali menulis permintaan penjelasan sebagai prosa
        # biasa, yang lalu disangka jawaban dan diberi sitasi + "Evidence verified".
        body_fields["response_format"] = {"type": "json_object"}
    payload = json.dumps(body_fields).encode("utf-8")
    request = urllib.request.Request(
        f"{SUMOPOD_BASE_URL}/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    failure = None
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        status = exc.code
        if exc.fp is not None:
            exc.close()
        failure = ProviderHttpError("chat", status)
    except (urllib.error.URLError, TimeoutError, OSError):
        failure = ProviderUnavailableError("chat")
    if failure is not None:
        raise failure

    failure = None
    content = ""
    try:
        data = json.loads(body.decode("utf-8"))
        content = data["choices"][0]["message"]["content"].strip()
    except (
        UnicodeDecodeError,
        json.JSONDecodeError,
        KeyError,
        IndexError,
        TypeError,
        AttributeError,
    ):
        failure = ProviderResponseError("chat")
    if failure is not None:
        raise failure
    if allow_clarify:
        content = unwrap_clarify_envelope(content)
    return strip_internal_chunk_references(content)
