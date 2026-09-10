"""Guardrails: the "no evidence = no answer" rule.

The no-answer response is a fixed contract so the UI and the QA golden
tests can rely on it verbatim.
"""

from __future__ import annotations

import json
import re
from typing import Any

from config import NO_ANSWER
from generation.citations import content_tokens
from generation.prompts import QUESTION_WORDS

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
_GENERAL_PERSON_QUERY = re.compile(r"^\s*(?:siapa itu|who is)\s+.+", re.IGNORECASE)


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
    if workspace_type != "PERSONAL" and _GENERAL_PERSON_QUERY.match(normalized):
        return True
    return any(phrase in normalized for phrase in _PROMPT_INJECTION_PHRASES)


#: Inti kalimat baku, tanpa subjek di depannya. Model kerap menyisipkan
#: pokok pertanyaan ke tengah ("Informasi MENGENAI HARGA BITCOIN tidak
#: ditemukan pada dokumen yang tersedia"), jadi pembandingan kata per kata
#: dengan NO_ANSWER meleset justru pada kalimat yang maksudnya sama persis.
_NO_ANSWER_CORE = "tidak ditemukan pada dokumen"

_SENTENCE_END = re.compile(r"(?<=[.!?])\s")


def is_no_answer(answer: str) -> bool:
    """Apakah ini pernyataan tidak-ditemukan, termasuk yang diparafrase model?

    Tanpa pengenalan parafrase, jawaban yang isinya "tidak ditemukan" lolos ke
    jalur jawaban biasa: ia diberi sitasi, memakai lencana "Evidence verified"
    di antarmuka, dan kehilangan usulan pertanyaan lanjutannya.

    Hanya kalimat PERTAMA yang diperiksa. Jawaban yang menjawab sebagian lalu
    menyebut ada bagian yang tidak ditemukan tetap jawaban sungguhan, dan
    sitasinya memang layak dipertahankan.
    """
    text = answer.strip()
    if text == NO_ANSWER:
        return True
    first = _SENTENCE_END.split(text, maxsplit=1)[0]
    return _NO_ANSWER_CORE in first.lower()


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


#: Kata penunjuk lanjutan dan partikel obrolan: pembawa maksud "seperti
#: jawaban tadi, tapi ...".
#: Kata-kata ini tidak memperkenalkan pokok baru, jadi kehadirannya tidak boleh
#: dihitung sebagai tuntutan agar dokumen memuatnya. Tanpa daftar ini
#: "jelaskan lebih detail" dinilai tak berpijak hanya karena kata "lebih" dan
#: "detail" memang tidak ada di dalam teks dokumen mana pun.
_FOLLOW_UP_WORDS = frozenset("""
lebih detail detil rinci terperinci lanjut lanjutkan lagi ringkas ringkasan
singkat contoh contohnya maksud maksudnya arti artinya tadi sebelumnya
pertama kedua ketiga keempat kelima terakhir poin bagian atas bawah
more detail details further again summarize summary briefly example meaning
dong sih nih deh kok tuh aja saja lah pun kah kan
coba mohon bisa boleh silakan please
""".split())


def clarify_has_footing(query: str, matches: list[tuple[float, dict[str, Any]]]) -> bool:
    """Apakah pertanyaannya punya pijakan kata di potongan yang terambil?

    Sitasi jawaban sebelumnya ikut dibawa sebagai konteks lanjutan, jadi
    potongan topik LAMA selalu ada di prompt meski pertanyaan barunya tidak
    berkaitan sama sekali. Dalam keadaan itu model cenderung menjembatani
    keduanya dan menawarkan pilihan yang isinya tidak ada di dokumen mana pun.
    Bertanya balik hanya layak bila kata yang ditanyakan memang muncul di
    bahan yang terambil; kalau tidak, berhenti lebih jujur daripada menebak.

    Pertanyaan lanjutan yang menunjuk jawaban sebelumnya ("jelaskan lebih
    detail", "yang kedua bagaimana") sengaja tetap lolos: ia memang tidak
    membawa kata isi sendiri, dan itu bukan tanda tak berdasar.
    """
    asked = content_tokens(query) - QUESTION_WORDS - _FOLLOW_UP_WORDS
    if not asked:
        return True
    tersedia: set[str] = set()
    for _, chunk in matches:
        tersedia |= content_tokens(chunk.get("text", ""))
        tersedia |= content_tokens(chunk.get("title") or "")
        tersedia |= content_tokens(chunk.get("filename") or "")
    # SEMUA kata isinya harus ada, bukan sekadar salah satu. "harga bitcoin
    # hari ini" memuat "harga" dan "hari" yang lazim ada di dokumen apa pun,
    # sehingga syarat "salah satu cocok" meloloskannya justru karena kata
    # umumnya — sementara kata pembedanya, "bitcoin", tidak ada di mana pun.
    return asked <= tersedia


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
