"""Grounded answer generation via an OpenAI-compatible provider.

The LLM only rewrites the retrieved chunks into a natural answer; it never
produces the citations (see generation/citations.py).
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
from typing import Any

from config import AI_PROVIDER_API_KEY_ENV, AI_PROVIDER_BASE_URL, DEFAULT_MODEL
from generation.guardrails import CLARIFY_MARKER
from generation.prompts import build_messages
from provider_errors import ProviderConfigurationError, ProviderResponseError
from provider_retry import read_with_retry


CHAT_MAX_ATTEMPTS = 2
#: Total waktu yang boleh dihabiskan untuk mencoba ulang jawaban chat. Dipilih
#: di bawah 2x CHAT_TIMEOUT supaya provider yang menggantung tidak pernah
#: melipatgandakan waktu tunggu pengguna: 429/503 yang kembali seketika tetap
#: diulang, timeout penuh tidak.
CHAT_TIMEOUT = 60
CHAT_RETRY_BUDGET = 75

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
                    allow_clarify: bool = False,
                    workspace_type: str = "COMPANY") -> str:
    """Ask the configured LLM to answer using intact page/section contexts only."""
    key = (
        api_key
        or os.environ.get("SUMOPOD_API_KEY")
        or os.environ.get(AI_PROVIDER_API_KEY_ENV)
    )
    if not key:
        raise ProviderConfigurationError(AI_PROVIDER_API_KEY_ENV)
    base_url = (
        os.environ.get("SUMOPOD_BASE_URL")
        or os.environ.get("AI_PROVIDER_BASE_URL")
        or AI_PROVIDER_BASE_URL
    ).rstrip("/")
    if not base_url:
        raise ProviderConfigurationError("AI_PROVIDER_BASE_URL")
    body_fields: dict[str, Any] = {
        "model": model,
        "messages": build_messages(
            query, matches, documents, allow_clarify,
            workspace_type=workspace_type,
        ),
        "temperature": 0.2,
    }
    if allow_clarify:
        # Bentuk balasan dipaksa provider, bukan diminta lewat kalimat prompt.
        # Tanpa ini model sesekali menulis permintaan penjelasan sebagai prosa
        # biasa, yang lalu disangka jawaban dan diberi sitasi + "Evidence verified".
        body_fields["response_format"] = {"type": "json_object"}
    payload = json.dumps(body_fields).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    # Percobaan ulangnya sedikit: ada pengguna yang menunggu jawaban di layar.
    # Tanpa ini sama sekali, satu 429/503 sesaat dari provider langsung menjadi
    # kegagalan yang dilihat pengguna, padahal panggilan berikutnya biasanya
    # berhasil.
    body = read_with_retry(
        request, operation="chat", timeout=CHAT_TIMEOUT,
        max_attempts=CHAT_MAX_ATTEMPTS, retry_budget=CHAT_RETRY_BUDGET,
    )

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
