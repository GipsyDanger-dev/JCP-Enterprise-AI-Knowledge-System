"""Citation mapping.

Citations are copied verbatim from the metadata of chunks that were
actually retrieved. The LLM never invents a citation — this module is the
only place citations come from.
"""

from __future__ import annotations

from typing import Any

CITATION_FIELDS = ("document_id", "filename", "version", "page_number", "section_title", "chunk_id")


def citation_from_chunk(chunk: dict[str, Any]) -> dict[str, Any]:
    citation = {key: chunk[key] for key in CITATION_FIELDS}
    if "document_version_id" in chunk:
        citation["document_version_id"] = chunk["document_version_id"]
    return citation


def citations_from_matches(matches: list[tuple[float, dict[str, Any]]]) -> list[dict[str, Any]]:
    return [citation_from_chunk(chunk) for _, chunk in matches]
