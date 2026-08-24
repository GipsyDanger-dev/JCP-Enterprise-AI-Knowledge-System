"""Guardrails: the "no evidence = no answer" rule.

The no-answer response is a fixed contract so the UI and the QA golden
tests can rely on it verbatim.
"""

from __future__ import annotations

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
