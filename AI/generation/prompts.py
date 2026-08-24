"""Prompt assembly: query + retrieved document contexts -> LLM messages.

The system prompt enforces the MVP guardrails: answer only from the
provided chunks, never fabricate, cite chunk ids, and emit the exact
no-answer sentence when evidence is insufficient.
"""

from __future__ import annotations

from typing import Any

SYSTEM_PROMPT = (
    "Kamu adalah asisten knowledge perusahaan. Jawab pertanyaan HANYA dari "
    "konteks dokumen yang diberikan. Jangan memakai pengetahuan umum, asumsi, "
    "atau isi percakapan lain. Jangan menebak atau mengisi informasi yang "
    "tidak tertulis eksplisit. Jika jawaban tidak ditemukan atau buktinya "
    "tidak cukup, jawab persis: \"Informasi tidak ditemukan pada dokumen yang "
    "tersedia.\" Jika ada dua aturan berbeda, tampilkan perbedaannya dan "
    "jangan memilih salah satunya tanpa dasar. Jawab dalam Bahasa Indonesia, "
    "ringkas, jelas, dan langsung menjawab pertanyaan. Jangan membuat citation "
    "baru; metadata sumber dikelola oleh sistem."
)


def build_messages(query: str, matches: list[tuple[float, dict[str, Any]]]) -> list[dict[str, str]]:
    context = "\n\n".join(
        f"[CONTEXT_ID: {chunk['chunk_id']} | DOKUMEN: {chunk['filename']} | "
        f"HALAMAN: {chunk.get('page_number') or '-'} | "
        f"SECTION: {chunk.get('section_title') or '-'}]\n{chunk['text']}"
        for _, chunk in matches
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Pertanyaan pengguna:\n{query}\n\nKonteks dokumen resmi:\n{context}"},
    ]
