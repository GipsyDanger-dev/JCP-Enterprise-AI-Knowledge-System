"""Document context strategy.

The first version of the project used fixed word windows. That is a poor fit
for SOPs and policy PDFs because headings, table rows, and exceptions can be
separated from the text that gives them meaning. The current strategy keeps
each PDF page intact, and splits a page only at detected section headings.

The function keeps its historical name and metadata shape so existing stores
and API contracts remain compatible. These records are now page/section
contexts, not arbitrary fixed-size chunks.

Every context carries the full minimum metadata contract:
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
    """Create one intact context per page or detected section.

    ``words_per_chunk`` and ``overlap`` remain accepted for backwards
    compatibility with the CLI/tests, but are deliberately ignored.
    """
    sections = sections or {}
    contexts: list[dict[str, Any]] = []
    for page_number, page_text in pages:
        words = page_text.split()
        if not words:
            continue
        markers = sections.get(page_number, [])
        boundaries = [(0, "")] + [(index, heading) for index, heading in markers if index > 0]
        for marker_index, (start, heading) in enumerate(boundaries):
            end = boundaries[marker_index + 1][0] if marker_index + 1 < len(boundaries) else len(words)
            text = " ".join(words[start:end]).strip()
            if not text:
                continue
            if not heading:
                heading = next((title for word_index, title in reversed(markers) if word_index <= start), "")
            contexts.append({
                "document_id": document_id,
                "filename": filename,
                "version": version,
                "page_number": page_number,
                "section_title": heading,
                "chunk_id": f"{document_id}-{len(contexts) + 1}",
                "text": text,
            })
    return contexts
