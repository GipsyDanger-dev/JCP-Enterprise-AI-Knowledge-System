"""Build question suggestions from the documents visible to the user."""

from __future__ import annotations

import re
from typing import Any


MAX_SUGGESTIONS = 4

_CAMEL_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_ALPHA_NUM_BOUNDARY = re.compile(r"(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])")
_SEPARATORS = re.compile(r"[_\-.]+")
_SPACES = re.compile(r"\s+")
_BARE_HEADING = re.compile(
    r"^(bab|pasal|bagian|paragraf|lampiran)\s*[\dIVXivx]*$", re.IGNORECASE
)

_SECTION_TEMPLATES = (
    "Apa yang diatur dalam {topic}?",
    "Ringkas ketentuan {topic}",
    "Apa isi pokok {topic}?",
)
_DOCUMENT_TEMPLATES = (
    "Apa poin utama dokumen {topic}?",
    "Ringkas isi {topic}",
)


def _shorten(text: str, limit: int = 64) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:-")
    return cut or text[:limit]


def clean_document_name(filename: str) -> str:
    stem = re.sub(r"\.[A-Za-z0-9]{1,5}$", "", (filename or "").strip())
    spaced = _SEPARATORS.sub(" ", stem)
    spaced = _CAMEL_BOUNDARY.sub(" ", spaced)
    spaced = _ALPHA_NUM_BOUNDARY.sub(" ", spaced)
    spaced = _SPACES.sub(" ", spaced).strip()
    return _shorten(re.sub(r"\bttg\b", "tentang", spaced, flags=re.IGNORECASE))


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
    """Turn section/file metadata into a small set of clickable questions."""
    questions: list[str] = []
    used_documents: set[str] = set()
    for topic in topics:
        if len(questions) >= limit:
            break
        filename = str(topic.get("filename") or "")
        if filename in used_documents:
            continue
        section = clean_section(str(topic.get("section_title") or ""))
        # Nama berkas tetap jadi identitas untuk menghindari duplikat di atas,
        # tapi labelnya memakai judul yang dilihat pengguna — saran yang
        # menyebut nama berkas lama tidak akan mereka kenali.
        #
        # Judul dipakai apa adanya, tidak lewat `clean_document_name`. Fungsi
        # itu merapikan nama berkas buatan mesin dengan menyisipkan spasi di
        # batas huruf-angka, dan itu justru merusak judul yang diketik orang:
        # "tessss1" berubah jadi "tessss 1", lalu tidak cocok lagi dengan yang
        # tertulis di daftar dokumen.
        title = str(topic.get("title") or "").strip()
        document = _shorten(title) if title else clean_document_name(filename)
        if section:
            template = _SECTION_TEMPLATES[len(questions) % len(_SECTION_TEMPLATES)]
            label = section
        elif document:
            template = _DOCUMENT_TEMPLATES[len(questions) % len(_DOCUMENT_TEMPLATES)]
            label = document
        else:
            continue
        question = template.format(topic=label)
        if question not in questions:
            questions.append(question)
        if filename:
            used_documents.add(filename)
    return questions
