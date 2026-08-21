"""Prompt assembly: query + retrieved chunks -> LLM messages.

The system prompt enforces the MVP guardrails: answer only from the
provided chunks, never fabricate, cite chunk ids, and emit the exact
no-answer sentence when evidence is insufficient.
"""

from __future__ import annotations

from typing import Any

SYSTEM_PROMPT = (
    "Kamu adalah asisten perusahaan yang menjawab pertanyaan HANYA berdasarkan "
    "potongan dokumen (chunk) yang diberikan, ditandai dengan [chunk_id]. "
    "Jangan memakai pengetahuan di luar chunk. Kalau chunk tidak cukup untuk "
    "menjawab, jawab persis: \"Informasi tidak ditemukan pada dokumen yang tersedia.\" "
    "Jawab dalam Bahasa Indonesia, ringkas dan jelas. Sertakan [chunk_id] sumber "
    "setiap klaim dalam kurung siku."
)


def build_messages(query: str, matches: list[tuple[float, dict[str, Any]]]) -> list[dict[str, str]]:
    context = "\n\n".join(f"[{chunk['chunk_id']}] {chunk['text']}" for _, chunk in matches)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Pertanyaan: {query}\n\nPotongan dokumen:\n{context}"},
    ]
