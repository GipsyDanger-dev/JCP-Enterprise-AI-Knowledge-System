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
    "Saya hanya dapat membantu menjawab pertanyaan seputar dokumen perusahaan, "
    "seperti SOP, kebijakan, prosedur, dan informasi internal."
)

QUICK_SUGGESTIONS = [
    "Apa persyaratan cuti tahunan?",
    "Berapa batas pengajuan cuti sebelum tanggal cuti?",
    "Dokumen apa yang diperlukan untuk cuti sakit?",
    "Bagaimana alur persetujuan cuti?",
]

_ARITHMETIC_QUERY = re.compile(
    r"^\s*(?:berapa\s+|hitung(?:kan)?\s+)?\d+(?:[.,]\d+)?\s*"
    r"(?:[+\-*/x×÷]\s*\d+(?:[.,]\d+)?)+\s*(?:berapa|hasil(?:nya)?|=)?\s*\??\s*$",
    re.IGNORECASE,
)
_OFF_TOPIC_KEYWORDS = (
    "politik", "presiden", "gubernur", "partai", "agama", "allah", "tuhan",
    "cuaca", "hujan", "sepak bola", "basket", "film", "musik", "artis",
    "iphone", "android", "samsung", "sakit", "demam", "obat", "dokter",
    "resep", "masakan", "wisata", "jalan-jalan", "bitcoin", "crypto",
    "ignore previous", "abaikan instruksi", "lupakan instruksi",
)
_DOCUMENT_KEYWORDS = (
    "sop", "kebijakan", "prosedur", "dokumen", "cuti", "izin", "reimbursement",
    "biaya", "tunjangan", "perjalanan dinas", "karyawan", "hrd", "perusahaan",
)
_GENERAL_PERSON_QUERY = re.compile(
    r"^\s*(?:siapa|siapakah|who\s+is)\s+(?:itu\s+)?[a-z][a-z .'-]{1,80}\??\s*$",
    re.IGNORECASE,
)


def no_answer_response() -> dict[str, Any]:
    return {
        "answer": NO_ANSWER,
        "citations": [],
        "grounded": False,
        "retrieval": [],
        "suggestions": QUICK_SUGGESTIONS,
    }


def out_of_scope_response() -> dict[str, Any]:
    return {
        "answer": OUT_OF_SCOPE,
        "citations": [],
        "grounded": False,
        "retrieval": [],
        "suggestions": QUICK_SUGGESTIONS,
    }


def is_out_of_scope(query: str) -> bool:
    normalized = query.strip().lower()
    if _ARITHMETIC_QUERY.match(normalized):
        return True
    if any(keyword in normalized for keyword in _OFF_TOPIC_KEYWORDS):
        return True
    return bool(_GENERAL_PERSON_QUERY.match(normalized)) and not any(
        keyword in normalized for keyword in _DOCUMENT_KEYWORDS
    )


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
