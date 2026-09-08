"""Guardrails: the "no evidence = no answer" rule.

The no-answer response is a fixed contract so the UI and the QA golden
tests can rely on it verbatim.
"""

from __future__ import annotations

import json
import re
from typing import Any

from config import NO_ANSWER

OUT_OF_SCOPE = (
    "Saya hanya dapat membantu menjawab pertanyaan yang jawabannya ada pada "
    "dokumen resmi yang tersimpan di sistem ini."
)

# Backward-compatible alias for callers that still import this constant.
OUT_OF_SCOPE_PERSONAL = OUT_OF_SCOPE

_ARITHMETIC_QUERY = re.compile(
    r"^\s*(?:berapa\s+|hitung(?:kan)?\s+)?\d+(?:[.,]\d+)?\s*"
    r"(?:[+\-*/x×÷]\s*\d+(?:[.,]\d+)?)+\s*(?:berapa|hasil(?:nya)?|=)?\s*\??\s*$",
    re.IGNORECASE,
)
_PROMPT_INJECTION_PHRASES = (
    "ignore previous", "ignore all previous", "disregard previous",
    "abaikan instruksi", "lupakan instruksi", "abaikan aturan di atas",
)


def no_answer_response(
    suggestions: list[str] | None = None,
    workspace_type: str | None = None,
) -> dict[str, Any]:
    """Return the fixed no-evidence answer with corpus-derived suggestions."""
    # ``workspace_type`` remains accepted for old callers; suggestions now come
    # from the same filtered corpus as retrieval instead of a stale fixed list.
    if isinstance(suggestions, str):
        suggestions = None
    return {
        "answer": NO_ANSWER,
        "citations": [],
        "grounded": False,
        "retrieval": [],
        "suggestions": list(suggestions or []),
    }


def out_of_scope_response(
    suggestions: list[str] | None = None,
    workspace_type: str | None = None,
) -> dict[str, Any]:
    if isinstance(suggestions, str):
        suggestions = None
    return {
        "answer": OUT_OF_SCOPE,
        "citations": [],
        "grounded": False,
        "retrieval": [],
        "suggestions": list(suggestions or []),
    }


def is_out_of_scope(query: str, workspace_type: str = "COMPANY") -> bool:
    """Reject only arithmetic and explicit prompt-injection attempts.

    Domain keyword lists reject valid questions when the archive changes. The
    retrieval result is the source of truth for document scope.
    """
    normalized = query.strip().lower()
    if _ARITHMETIC_QUERY.match(normalized):
        return True
    return any(phrase in normalized for phrase in _PROMPT_INJECTION_PHRASES)


def is_no_answer(answer: str) -> bool:
    return answer == NO_ANSWER


# Penanda satu baris, bukan JSON penuh: jawaban biasa tetap teks polos sehingga
# jalur yang paling sering dipakai tidak menanggung risiko salah format.
CLARIFY_MARKER = "CLARIFY:"


def parse_clarify(answer: str) -> dict[str, Any] | None:
    """Baca permintaan penjelasan dari model, atau None kalau ini jawaban biasa."""
    text = answer.strip()
    if not text.startswith(CLARIFY_MARKER):
        return None
    try:
        payload = json.loads(text[len(CLARIFY_MARKER):].strip())
        question = str(payload["pertanyaan"]).strip()
        options = [str(option).strip() for option in payload.get("pilihan", [])]
    except (ValueError, KeyError, TypeError):
        print("[AI] Clarify parse failed, treating as no answer")
        return None
    if not question:
        return None
    return {"question": question, "options": [option for option in options if option][:3]}


def clarify_response(clarify: dict[str, Any], query: str) -> dict[str, Any]:
    """Pertanyaan balik plus pilihan, selalu dengan satu jalan keluar.

    Tanpa jalan keluar, salah menilai pertanyaan yang sebenarnya sudah jelas
    membuat pengguna tidak punya cara mendapatkan jawabannya.
    """
    escape = f"Jelaskan ringkasan lengkap tentang {query.strip().rstrip('?')}"
    return {
        "answer": clarify["question"],
        # Ini pertanyaan balik, bukan klaim berdasarkan dokumen: tanpa kutipan,
        # lencana "Evidence verified" ikut tidak muncul.
        "citations": [],
        "grounded": False,
        "retrieval": [],
        "suggestions": [*clarify["options"], escape],
        # Penanda bagi antarmuka: percakapan sedang menunggu pengguna memilih,
        # bukan sekadar jawaban tanpa kutipan seperti "informasi tidak ditemukan".
        "awaiting_choice": True,
    }
