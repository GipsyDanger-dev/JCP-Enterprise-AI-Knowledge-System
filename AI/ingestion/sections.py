"""Section (heading) detection.

Produces, per page, a list of (word_index, heading) markers where
word_index is the offset of the first word of the heading inside the
page text. Chunking uses these markers to fill ``section_title`` so
provenance survives from parse to citation.

PDF has no reliable structure here, so it returns no sections
(section_title stays empty, which is fine for the MVP).
"""

from __future__ import annotations

import re
from pathlib import Path

from ingestion.parsers import docx_blocks

# Matches "BAB I", "BAB 1", "Bab 2", ...
_BAB_RE = re.compile(r"^bab\s+[ivxlcdm\d]+", re.IGNORECASE)
# Matches "1. Tujuan", "2) Ruang lingkup", ...
_NUMBERED_RE = re.compile(r"^\d{1,2}[\.\)]\s+\S")
# Markdown ATX headings: "## Cara pakai"
_MARKDOWN_RE = re.compile(r"^#{1,6}\s+(.+)$")


def _is_heading_line(line: str) -> bool:
    text = line.strip()
    if not text:
        return False
    # Markdown heading.
    match = _MARKDOWN_RE.match(text)
    if match:
        return True
    # "BAB I ..." style.
    if _BAB_RE.match(text) and len(text) <= 80:
        return True
    # Numbered heading like "1. Tujuan" (short, no sentence-ending period).
    if _NUMBERED_RE.match(text) and len(text) <= 80 and not text.rstrip().endswith((".", "?", "!")):
        return True
    # Short title in mostly-uppercase, e.g. "SOP PERJALANAN DINAS 2026".
    letters = [c for c in text if c.isalpha()]
    if (
        letters
        and len(text) <= 80
        and sum(c.isupper() for c in letters) / len(letters) >= 0.6
        and not text.rstrip().endswith((".", "?", "!"))
    ):
        return True
    # Title case heading: short, few words, starts with a capital letter.
    words = text.split()
    if (
        len(text) <= 60
        and len(words) <= 6
        and words[0][0].isupper()
        and not text.rstrip().endswith((".", "?", "!"))
    ):
        return True
    return False


def _heading_label(line: str) -> str:
    match = _MARKDOWN_RE.match(line.strip())
    return match.group(1).strip() if match else line.strip()


def text_headings(text: str) -> list[tuple[int, str]]:
    """Detect headings in plain text. Returns [(word_index, heading)]."""
    markers: list[tuple[int, str]] = []
    word_offset = 0
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if _is_heading_line(stripped):
            markers.append((word_offset, _heading_label(stripped)))
        word_offset += len(stripped.split())
    return markers


def docx_headings(path: Path) -> dict[int, list[tuple[int, str]]]:
    """Judul bagian tiap blok DOCX, bernomor sama dengan parsers.read_document.

    Penomorannya diambil dari ``docx_blocks`` yang sama, bukan dihitung ulang.
    Versi sebelumnya menghitung paragraf kosong sementara parser melewatinya,
    sehingga setiap judul bergeser ke potongan sesudahnya.
    Returns {page_number: [(word_index, heading)]}.
    """
    return {
        index: [(0, heading)]
        for index, (heading, _) in enumerate(docx_blocks(path), 1)
        if heading
    }


def extract_sections(suffix: str, path: Path, pages: list[tuple[int, str]]) -> dict[int, list[tuple[int, str]]]:
    """Unified section extraction: returns per-page heading markers."""
    if suffix == ".docx":
        return docx_headings(path)
    if suffix in {".txt", ".md"} and len(pages) == 1:
        markers = text_headings(path.read_text(encoding="utf-8"))
        return {pages[0][0]: markers} if markers else {}
    return {}
