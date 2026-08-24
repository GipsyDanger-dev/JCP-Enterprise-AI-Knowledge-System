"""Deterministic local TF-IDF retriever.

This is the default retriever so the pipeline works without an API key.
It matches words mathematically (no semantics), which is exactly the
behaviour the MVP presentation describes.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

from retrieval.filters import match_metadata

# Small, deliberately transparent normalisation layer for common Indonesian
# chat phrasing. It improves retrieval without pretending that TF-IDF is a
# semantic model or relaxing the no-evidence rule.
QUERY_ALIASES = {
    "ngajuin": "pengajuan",
    "ngajukan": "pengajuan",
    "ajuin": "pengajuan",
    "ajuan": "pengajuan",
    "syarat": "dokumen pendukung formulir",
    "persyaratan": "dokumen pendukung formulir",
}
QUERY_FILLER = {"apa", "aja", "sih", "dong", "nih", "ya", "yah"}

TOKEN_RE = re.compile(r"[\wÀ-ÿ]+", re.UNICODE)


def tokens(text: str) -> list[str]:
    result: list[str] = []
    for raw_token in TOKEN_RE.findall(text):
        token = raw_token.lower()
        if token in QUERY_FILLER:
            continue
        result.extend(QUERY_ALIASES.get(token, token).split())
    return result


class TfidfRetriever:
    # Minimum cosine score for a match to count as evidence (no-answer below this).
    minimum_score = 0.15

    def __init__(self, chunks: list[dict[str, Any]]):
        self.chunks = chunks
        document_frequency = Counter()
        for chunk in chunks:
            document_frequency.update(set(tokens(chunk["text"])))
        self.idf = {
            word: math.log((1 + len(chunks)) / (1 + frequency)) + 1
            for word, frequency in document_frequency.items()
        }
        self.vectors = [self._vector(chunk["text"]) for chunk in chunks]

    def _vector(self, text: str) -> dict[str, float]:
        counts = Counter(tokens(text))
        total = sum(counts.values()) or 1
        return {word: (count / total) * self.idf.get(word, 1.0) for word, count in counts.items()}

    @staticmethod
    def _cosine(left: dict[str, float], right: dict[str, float]) -> float:
        denominator = math.sqrt(sum(value * value for value in left.values())) * math.sqrt(sum(value * value for value in right.values()))
        return sum(left.get(key, 0.0) * value for key, value in right.items()) / denominator if denominator else 0.0

    def search(self, query: str, top_k: int = 5,
               filters: dict[str, Any] | None = None) -> list[tuple[float, dict[str, Any]]]:
        """Rank chunks by cosine similarity, optionally narrowed by metadata filters."""
        query_vector = self._vector(query)
        candidates = range(len(self.chunks))
        if filters:
            candidates = [i for i, chunk in enumerate(self.chunks) if match_metadata(chunk, filters)]
        ranked = [(self._cosine(query_vector, self.vectors[i]), self.chunks[i]) for i in candidates]
        return sorted(ranked, key=lambda item: item[0], reverse=True)[:top_k]
