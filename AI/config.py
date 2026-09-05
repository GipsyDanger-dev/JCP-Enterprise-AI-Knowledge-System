"""Shared configuration for the AI engine.

Kept dependency-free on purpose: everything here is a plain constant so the
ingestion / retrieval / generation modules never need to agree on magic
strings between themselves.
"""

import os

# Provider memakai format API OpenAI-compatible. Nama netral ini membuat
# aplikasi tidak terikat pada satu vendor tertentu.
# rstrip("/") menjaga URL endpoint tidak memiliki garis miring ganda.
# Default memakai endpoint standar OpenAI-compatible. Deployment sebenarnya
# harus selalu mengisi AI_PROVIDER_BASE_URL dengan endpoint provider pilihannya.
AI_PROVIDER_BASE_URL = os.environ.get("AI_PROVIDER_BASE_URL", "https://api.openai.com/v1").rstrip("/")
AI_PROVIDER_API_KEY_ENV = "AI_PROVIDER_API_KEY"

# Chat model used for --llm grounded answers through SumoPod.
DEFAULT_MODEL = os.environ.get("AI_CHAT_MODEL", "auto")

# Embedding model used by `ingest --embed` and the vector retriever.
EMBEDDING_MODEL = os.environ.get("AI_EMBEDDING_MODEL", "text-embedding-3-small")

# The exact no-answer sentence required by the MVP rule "no evidence = no answer".
NO_ANSWER = "Informasi tidak ditemukan pada dokumen yang tersedia."
