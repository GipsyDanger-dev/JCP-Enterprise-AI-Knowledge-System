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


def generate_answer(query: str, matches: list[tuple[float, dict[str, Any]]],
                    model: str = DEFAULT_MODEL, api_key: str | None = None,
                    documents: list[dict[str, Any]] | None = None) -> str:
    """Ask a SumoPod LLM to answer using intact page/section contexts only."""
    key = api_key or os.environ.get(SUMOPOD_API_KEY_ENV)
    if not key:
        raise ProviderConfigurationError(SUMOPOD_API_KEY_ENV)
    payload = json.dumps({
        "model": model,
        "messages": build_messages(query, matches, documents),
        "temperature": 0.2,
    }).encode("utf-8")
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
    return strip_internal_chunk_references(content)
