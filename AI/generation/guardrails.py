"""Guardrails: the "no evidence = no answer" rule.

The no-answer response is a fixed contract so the UI and the QA golden
tests can rely on it verbatim.
"""

from __future__ import annotations

import json
import re
from typing import Any

from config import NO_ANSWER

# Tanpa menyebut jenis dokumen tertentu: isi arsipnya berganti, kalimat ini tidak.
OUT_OF_SCOPE = (
    "Saya hanya dapat membantu menjawab pertanyaan yang jawabannya ada pada "
    "dokumen resmi yang tersimpan di sistem ini."
)

_ARITHMETIC_QUERY = re.compile(
    r"^\s*(?:berapa\s+|hitung(?:kan)?\s+)?\d+(?:[.,]\d+)?\s*"
    r"(?:[+\-*/x×÷]\s*\d+(?:[.,]\d+)?)+\s*(?:berapa|hasil(?:nya)?|=)?\s*\??\s*$",
    re.IGNORECASE,
)

# Sengaja hanya percobaan membajak instruksi. Daftar topik terlarang yang dulu
# ada di sini (politik, agama, kesehatan, wisata, ...) menolak pertanyaan yang
# justru ada jawabannya: arsip peraturan daerah memang membahas kesehatan,
# keagamaan, dan pariwisata. Penjaga sebenarnya adalah bukti — pertanyaan yang
# tidak punya dasar dokumen sudah dijawab "informasi tidak ditemukan" oleh
# jalur retrieval, tanpa perlu menebak topiknya lebih dulu.
_PROMPT_INJECTION_PHRASES = (
    "ignore previous", "ignore all previous", "disregard previous",
    "abaikan instruksi", "lupakan instruksi", "abaikan aturan di atas",
)


def no_answer_response(suggestions: list[str] | None = None) -> dict[str, Any]:
    """Tidak ada bukti, jadi tidak ada jawaban.

    ``suggestions`` diisi pemanggil dari korpus yang boleh dibaca penanya.
    Kosong lebih baik daripada saran tetap: tombol yang menunjuk topik di luar
    arsip hanya mengantar pengguna ke jawaban kosong berikutnya.
    """
    return {
        "answer": NO_ANSWER,
        "citations": [],
        "grounded": False,
        "retrieval": [],
        "suggestions": list(suggestions or []),
    }


def out_of_scope_response(suggestions: list[str] | None = None) -> dict[str, Any]:
    return {
        "answer": OUT_OF_SCOPE,
        "citations": [],
        "grounded": False,
        "retrieval": [],
        "suggestions": list(suggestions or []),
    }


def is_out_of_scope(query: str) -> bool:
    """Hanya yang jelas bukan pertanyaan dokumen: hitungan dan pembajakan instruksi.

    Penilaian topik sengaja tidak dilakukan di sini. Menebak "ini soal politik,
    tolak" salah dua arah sekaligus: menutup pertanyaan yang ada jawabannya di
    arsip, dan tetap lolos untuk topik luar yang tidak ada di daftar.
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
