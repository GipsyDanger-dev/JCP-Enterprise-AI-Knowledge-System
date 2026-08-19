"""Shared configuration for the AI engine.

Kept dependency-free on purpose: everything here is a plain constant so the
ingestion / retrieval / generation modules never need to agree on magic
strings between themselves.
"""

SUMOPOD_BASE_URL = "https://ai.sumopod.com/v1"
SUMOPOD_API_KEY_ENV = "SUMOPOD_API_KEY"

# Chat model used for --llm grounded answers.
DEFAULT_MODEL = "gpt-5-nano"

# Embedding model used by `ingest --embed` and the vector retriever.
EMBEDDING_MODEL = "text-embedding-3-small"

# The exact no-answer sentence required by the MVP rule "no evidence = no answer".
NO_ANSWER = "Informasi tidak ditemukan pada dokumen yang tersedia."
