"""Embedding generation (SumoPod, OpenAI-compatible) and vector search.

Embeddings are generated once at ingest time (``ingest --embed``) and
stored in the knowledge base next to the chunks. Searching only needs the
API key to embed the query; the stored vectors are matched locally with
cosine similarity.
"""

from __future__ import annotations

import json
import math
import os
import urllib.error
import urllib.request
from typing import Any

from config import AI_PROVIDER_API_KEY_ENV, AI_PROVIDER_BASE_URL, EMBEDDING_MODEL
from provider_errors import (
    ProviderConfigurationError,
    ProviderHttpError,
    ProviderResponseError,
    ProviderUnavailableError,
)
from retrieval.filters import match_metadata


def _api_key(api_key: str | None) -> str:
    key = api_key or os.environ.get(AI_PROVIDER_API_KEY_ENV)
    if not key:
        raise ProviderConfigurationError(AI_PROVIDER_API_KEY_ENV)
    if not AI_PROVIDER_BASE_URL:
        raise ProviderConfigurationError("AI_PROVIDER_BASE_URL")
    return key


def embed_texts(
    texts: list[str],
    model: str = EMBEDDING_MODEL,
    api_key: str | None = None,
    batch_size: int = 64,
) -> list[list[float]]:
    """Embed a list of texts via an OpenAI-compatible /v1/embeddings API."""
    if not texts:
        return []
    key = _api_key(api_key)
    vectors: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start:start + batch_size]
        payload = json.dumps({"model": model, "input": batch}).encode("utf-8")
        request = urllib.request.Request(
            f"{AI_PROVIDER_BASE_URL}/embeddings",
            data=payload,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            method="POST",
        )
        failure = None
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                body = response.read()
        except urllib.error.HTTPError as exc:
            status = exc.code
            if exc.fp is not None:
                exc.close()
            failure = ProviderHttpError("embeddings", status)
        except (urllib.error.URLError, TimeoutError, OSError):
            failure = ProviderUnavailableError("embeddings")
        if failure is not None:
            raise failure

        failure = None
        try:
            data = json.loads(body.decode("utf-8"))
            items = sorted(data["data"], key=lambda item: item.get("index", 0))
            vectors.extend(item["embedding"] for item in items)
        except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, AttributeError):
            failure = ProviderResponseError("embeddings")
        if failure is not None:
            raise failure
    return vectors


def _normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


def _cosine(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


class VectorRetriever:
    # Minimum cosine similarity for a match to count as evidence.
    # Embeddings are semantic: relevant domain queries land ~0.5-0.8 while
    # unrelated ones stay below ~0.4 (calibrated against the live API).
    # TF-IDF remains the safer default for strict no-answer behaviour.
    minimum_score = 0.45

    def __init__(self, chunks: list[dict[str, Any]], embeddings: dict[str, list[float]],
                 api_key: str | None = None, model: str = EMBEDDING_MODEL):
        self.chunks = chunks
        self.embeddings = embeddings
        self.api_key = api_key
        self.model = model

    def search(self, query: str, top_k: int = 5,
               filters: dict[str, Any] | None = None) -> list[tuple[float, dict[str, Any]]]:
        """Rank chunks by cosine similarity, optionally narrowed by metadata filters."""
        query_vector = _normalize(embed_texts([query], model=self.model, api_key=self.api_key)[0])
        ranked: list[tuple[float, dict[str, Any]]] = []
        for chunk in self.chunks:
            if filters and not match_metadata(chunk, filters):
                continue
            vector = self.embeddings.get(chunk["chunk_id"])
            if vector is None:
                continue
            ranked.append((_cosine(query_vector, _normalize(vector)), chunk))
        return sorted(ranked, key=lambda item: item[0], reverse=True)[:top_k]
