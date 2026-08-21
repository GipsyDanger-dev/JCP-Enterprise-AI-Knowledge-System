"""Retriever selection: auto -> vector when embeddings + key exist, else TF-IDF."""

from __future__ import annotations

import os
from typing import Any

from config import SUMOPOD_API_KEY_ENV
from retrieval.tfidf import TfidfRetriever
from retrieval.embeddings import VectorRetriever


def _has_api_key(api_key: str | None) -> bool:
    return bool(api_key or os.environ.get(SUMOPOD_API_KEY_ENV))


def build_retriever(knowledge_base: Any, mode: str = "auto", api_key: str | None = None):
    """Return a retriever for the requested mode.

    mode="auto" prefers the stored embeddings (vector search) and falls back
    to TF-IDF when the index has no embeddings or when no API key is
    available to embed the query.
    """
    if mode == "vector":
        if not knowledge_base.embeddings:
            raise RuntimeError("No embeddings stored in the index. Re-run ingest with --embed first.")
        return VectorRetriever(knowledge_base.chunks, knowledge_base.embeddings, api_key=api_key)
    if mode == "tfidf":
        return TfidfRetriever(knowledge_base.chunks)
    # auto
    if knowledge_base.embeddings and _has_api_key(api_key):
        return VectorRetriever(knowledge_base.chunks, knowledge_base.embeddings, api_key=api_key)
    return TfidfRetriever(knowledge_base.chunks)
