"""Metadata filtering for retrieval (slide 6: top-k search + filtering metadata).

Filters let a caller narrow the search space by document metadata, e.g.
    ask("biaya hotel", filters={"filename": "sop_perjalanan.txt"})
    ask("biaya hotel", filters={"section_title": "KETENTUAN UMUM"})

String values match case-insensitively as substrings (so "sop" matches
"sop_perjalanan.txt"); non-string values must match exactly.
"""

from __future__ import annotations

from typing import Any


def match_metadata(chunk: dict[str, Any], filters: dict[str, Any]) -> bool:
    """Return True when ``chunk`` satisfies every key in ``filters``."""
    for key, expected in filters.items():
        if expected is None:
            continue
        actual = chunk.get(key)
        if isinstance(actual, str) and isinstance(expected, str):
            if expected.lower() not in actual.lower():
                return False
        elif actual != expected:
            return False
    return True
