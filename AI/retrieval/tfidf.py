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

TOKEN_RE = re.compile(r"[\wÀ-ÿ]+", re.UNICODE)


def tokens(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_RE.findall(text)]


class TfidfRetriever:
    # Minimum cosine score for a match to count as evidence (no-answer below this).
    minimum_score = 0.08

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

    def search(self, query: str, top_k: int = 5) -> list[tuple[float, dict[str, Any]]]:
        query_vector = self._vector(query)
        ranked = [(self._cosine(query_vector, vector), chunk) for vector, chunk in zip(self.vectors, self.chunks)]
        return sorted(ranked, key=lambda item: item[0], reverse=True)[:top_k]
