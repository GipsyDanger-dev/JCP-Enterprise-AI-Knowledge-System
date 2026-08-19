"""Chunking strategy: fixed word windows with overlap, per page.

Every chunk carries the full minimum metadata contract:
document_id, filename, version, page_number, section_title, chunk_id, text.
"""

from __future__ import annotations

from typing import Any


def chunk_pages(
    pages: list[tuple[int, str]],
    filename: str,
    document_id: str,
    version: int,
    sections: dict[int, list[tuple[int, str]]] | None = None,
    words_per_chunk: int = 120,
    overlap: int = 25,
) -> list[dict[str, Any]]:
    """Split each page into word-based chunks with overlap.

    ``sections`` maps page_number -> [(word_index, heading)]; the heading
    active at the start of a chunk becomes its ``section_title``.
    """
    sections = sections or {}
    chunks: list[dict[str, Any]] = []
    for page_number, page_text in pages:
        words = page_text.split()
        if not words:
            continue
        markers = sections.get(page_number, [])
        step = max(1, words_per_chunk - overlap)
        for start in range(0, len(words), step):
            text = " ".join(words[start:start + words_per_chunk]).strip()
            if not text:
                continue
            section = next((heading for word_index, heading in reversed(markers) if word_index <= start), "")
            chunks.append({
                "document_id": document_id,
                "filename": filename,
                "version": version,
                "page_number": page_number,
                "section_title": section,
                "chunk_id": f"{document_id}-{len(chunks) + 1}",
                "text": text,
            })
            if start + words_per_chunk >= len(words):
                break
    return chunks
