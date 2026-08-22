"""Prompt assembly: query + retrieved chunks -> LLM messages.

The system prompt enforces the MVP guardrails: answer only from the
provided chunks, never fabricate, and emit the exact no-answer sentence
when evidence is insufficient. Citations are returned as separate metadata.
"""

from __future__ import annotations

from typing import Any

SYSTEM_PROMPT = (
    "Kamu adalah asisten perusahaan yang menjawab pertanyaan HANYA berdasarkan "
    "potongan dokumen (chunk) yang diberikan. "
    "Jangan memakai pengetahuan di luar chunk. Kalau chunk tidak cukup untuk "
    "menjawab, jawab persis: \"Informasi tidak ditemukan pada dokumen yang tersedia.\" "
    "Jawab dalam Bahasa Indonesia, ringkas dan jelas. Jangan menampilkan ID chunk, "
    "koordinat dokumen, atau referensi dalam kurung siku; sumber ditampilkan oleh aplikasi."
)


def build_messages(query: str, matches: list[tuple[float, dict[str, Any]]]) -> list[dict[str, str]]:
    context = "\n\n".join(chunk["text"] for _, chunk in matches)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Pertanyaan: {query}\n\nPotongan dokumen:\n{context}"},
    ]
