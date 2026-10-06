"""Grounded answer generation via an OpenAI-compatible provider.

The LLM only rewrites the retrieved chunks into a natural answer; it never
produces the citations (see generation/citations.py).
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.request
from typing import Any

from config import AI_PROVIDER_API_KEY_ENV, AI_PROVIDER_BASE_URL, DEFAULT_MODEL
from generation.guardrails import CLARIFY_MARKER, foreign_script_words
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


#: Pagar kode markdown di sekeliling balasan. ``response_format`` sudah meminta
#: JSON polos, tetapi sebagian model tetap membungkusnya dengan ```json. Pagar
#: itu membuat `json.loads` gagal, dan amplop yang gagal dibaca diteruskan apa
#: adanya — sehingga JSON mentahnya yang tampil di layar sebagai "jawaban".
_CODE_FENCE = re.compile(r"^```[^\n`]*\n(?P<isi>.*?)\n?```$", re.DOTALL)


def _without_code_fence(content: str) -> str:
    """Isi di dalam pagar kode, atau teks aslinya kalau tidak berpagar."""
    fenced = _CODE_FENCE.match(content.strip())
    return fenced.group("isi").strip() if fenced else content


def unwrap_clarify_envelope(content: str) -> str:
    """Turn the typed JSON envelope back into what guardrails already parses.

    ``{"type":"clarify",...}`` becomes the ``CLARIFY: {...}`` line, anything else
    becomes plain answer text. A reply that is not the expected envelope is passed
    through untouched, so a provider that ignores ``response_format`` degrades to
    the old text behaviour rather than failing the request.
    """
    try:
        payload = json.loads(_without_code_fence(content))
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
    messages = build_messages(
        query, matches, documents, allow_clarify,
        workspace_type=workspace_type,
    )
    content = _complete(base_url, key, model, messages, allow_clarify)
    if content.startswith(CLARIFY_MARKER):
        # Pertanyaan balik punya penggantinya sendiri yang baku dan tanpa biaya
        # (lihat clarify_response), jadi tidak perlu memanggil model sekali lagi.
        return content

    # Model sesekali melenceng ke bahasa lain di tengah mode JSON. Sekali ulang
    # dengan perintah eksplisit biasanya cukup; kalau masih juga, lebih jujur
    # melapor layanan AI bermasalah daripada menayangkan jawaban yang tidak
    # bisa dibaca pengguna — atau berbohong "informasi tidak ditemukan".
    source = _source_text(query, matches, documents)
    foreign = foreign_script_words(content, source)
    if not foreign:
        return content
    # Jumlahnya saja, bukan katanya: konsol yang tidak UTF-8 akan gagal
    # mencetak aksara itu, dan baris log tidak boleh menggagalkan jawaban.
    print(f"[AI] Jawaban memuat {len(foreign)} kata beraksara asing, diulang sekali")
    retry_messages = [
        *messages,
        {"role": "user", "content": LANGUAGE_RETRY_INSTRUCTION},
    ]
    content = _complete(base_url, key, model, retry_messages, allow_clarify)
    if content.startswith(CLARIFY_MARKER) or not foreign_script_words(content, source):
        return content
    print("[AI] Jawaban ulang masih memuat aksara asing, dilaporkan sebagai balasan tidak valid")
    raise ProviderResponseError("chat")


LANGUAGE_RETRY_INSTRUCTION = (
    "Balasan sebelumnya ditulis dalam bahasa selain Bahasa Indonesia. Tulis "
    "ulang seluruh balasan dalam Bahasa Indonesia. Aksara lain hanya boleh "
    "muncul bila disalin persis dari konteks dokumen."
)


def _source_text(query: str, matches: list[tuple[float, dict[str, Any]]],
                 documents: list[dict[str, Any]] | None) -> str:
    """Semua teks yang memang dikirim ke model: tempat kata asing yang sah berasal."""
    parts = [query]
    for _, chunk in matches:
        parts.extend(str(chunk.get(field) or "") for field in ("text", "section_title", "title", "filename"))
    if documents:
        parts.append(json.dumps(documents, ensure_ascii=False, default=str))
    return "\n".join(parts)


def _complete(base_url: str, key: str, model: str,
              messages: list[dict[str, str]], allow_clarify: bool) -> str:
    """Satu panggilan chat completion, sudah dibuka amplopnya dan dibersihkan."""
    body_fields: dict[str, Any] = {
        "model": model,
        "messages": messages,
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
    started = time.perf_counter()
    body = read_with_retry(
        request, operation="chat", timeout=CHAT_TIMEOUT,
        max_attempts=CHAT_MAX_ATTEMPTS, retry_budget=CHAT_RETRY_BUDGET,
    )
    print(f"[AI] chat completion completed in {(time.perf_counter() - started) * 1000:.0f}ms")

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
