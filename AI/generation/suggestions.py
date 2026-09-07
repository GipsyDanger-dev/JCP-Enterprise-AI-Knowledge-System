"""Saran pertanyaan yang dirakit dari korpus, bukan dari daftar tetap.

Daftar tetap selalu basi. Begitu isi arsipnya berganti, tombol saran menunjuk
ke topik yang tidak ada di dalam sistem, dan pengguna dijamin menekan tombol
yang tidak punya jawaban. Karena itu setiap saran di sini dibentuk dari judul
bagian dan nama berkas yang memang boleh dibaca penanya — sumbernya sama
dengan sumber jawabannya.
"""

from __future__ import annotations

import re
from typing import Any

MAX_SUGGESTIONS = 4

# Nama berkas arsip hukum jarang berupa kalimat: "PerbupNomor11Tahun2026ttg
# PengelolaanSampah.pdf". Dipecah dulu supaya tombolnya bisa dibaca manusia.
_CAMEL_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_ALPHA_NUM_BOUNDARY = re.compile(r"(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])")
_SEPARATORS = re.compile(r"[_\-.]+")
_SPACES = re.compile(r"\s+")

_SECTION_TEMPLATES = (
    "Apa yang diatur dalam {topic}?",
    "Ringkas ketentuan {topic}",
    "Apa isi pokok {topic}?",
)
_DOCUMENT_TEMPLATES = (
    "Apa poin utama dokumen {topic}?",
    "Ringkas isi {topic}",
)

# Judul sependek "BAB III" atau "Pasal 4" tidak memberi tahu apa pun kalau
# berdiri sendiri, jadi topiknya diambil dari nama dokumen saja.
_BARE_HEADING = re.compile(r"^(bab|pasal|bagian|paragraf|lampiran)\s*[\dIVXivx]*$", re.IGNORECASE)


def _shorten(text: str, limit: int = 64) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:-")
    return cut or text[:limit]


def clean_document_name(filename: str) -> str:
    """Nama berkas -> label yang enak dibaca di tombol saran."""
    stem = re.sub(r"\.[A-Za-z0-9]{1,5}$", "", (filename or "").strip())
    spaced = _SEPARATORS.sub(" ", stem)
    spaced = _CAMEL_BOUNDARY.sub(" ", spaced)
    spaced = _ALPHA_NUM_BOUNDARY.sub(" ", spaced)
    spaced = _SPACES.sub(" ", spaced).strip()
    # "ttg" adalah singkatan yang lazim di nama berkas JDIH, bukan kata.
    spaced = re.sub(r"\bttg\b", "tentang", spaced, flags=re.IGNORECASE)
    return _shorten(spaced)


def clean_section(section_title: str) -> str:
    text = _SPACES.sub(" ", (section_title or "").strip())
    if not text or _BARE_HEADING.match(text):
        return ""
    if text.isupper() and len(text) > 3:
        text = text.capitalize()
    return _shorten(text)


def questions_from_topics(
    topics: list[dict[str, Any]], limit: int = MAX_SUGGESTIONS
) -> list[str]:
    """Ubah judul bagian / nama berkas menjadi pertanyaan yang bisa diklik.

    Satu dokumen paling banyak menyumbang satu saran, supaya empat tombolnya
    tidak berisi empat bagian dari berkas yang sama.
    """
    questions: list[str] = []
    used_documents: set[str] = set()
    for topic in topics:
        if len(questions) >= limit:
            break
        filename = str(topic.get("filename") or "")
        if filename in used_documents:
            continue
        section = clean_section(str(topic.get("section_title") or ""))
        document = clean_document_name(filename)
        if section:
            template = _SECTION_TEMPLATES[len(questions) % len(_SECTION_TEMPLATES)]
            label = section
        elif document:
            template = _DOCUMENT_TEMPLATES[len(questions) % len(_DOCUMENT_TEMPLATES)]
            label = document
        else:
            continue
        question = template.format(topic=label)
        if question in questions:
            continue
        questions.append(question)
        if filename:
            used_documents.add(filename)
    return questions
