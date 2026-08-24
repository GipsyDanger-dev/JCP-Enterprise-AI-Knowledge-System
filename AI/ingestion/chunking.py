"""Page/section context strategy.

Fixed word windows often separate a policy rule from its heading, table label,
or exception. The current strategy keeps each PDF page intact and only splits
it at detected section headings. The historical function name and metadata
shape remain for compatibility with the JSON and PostgreSQL stores.

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

    ``words_per_chunk`` and ``overlap`` are retained only for backwards
    compatibility. They are intentionally ignored by the new strategy.
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
            section = heading or next(
                (title for word_index, title in reversed(markers) if word_index <= start), ""
            )
            contexts.append({
                "document_id": document_id,
                "filename": filename,
                "version": version,
                "page_number": page_number,
                "section_title": section,
                "chunk_id": f"{document_id}-{len(contexts) + 1}",
                "text": text,
            })
    return contexts
