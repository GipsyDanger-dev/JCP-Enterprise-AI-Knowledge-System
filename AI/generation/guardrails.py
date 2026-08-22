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


def no_answer_response() -> dict[str, Any]:
    return {"answer": NO_ANSWER, "citations": [], "grounded": False}


def out_of_scope_response() -> dict[str, Any]:
    return {"answer": OUT_OF_SCOPE, "citations": [], "grounded": False, "retrieval": []}


def is_out_of_scope(query: str) -> bool:
    normalized = query.strip().lower()
    return bool(_ARITHMETIC_QUERY.match(normalized)) or any(
        keyword in normalized for keyword in _OFF_TOPIC_KEYWORDS
    )


def is_no_answer(answer: str) -> bool:
    return answer == NO_ANSWER
