"""Prompt assembly: query + retrieved page/section contexts -> LLM messages.

The system prompt enforces the MVP guardrails: answer only from the
provided chunks, never fabricate, and emit the exact no-answer sentence
when evidence is insufficient. Citations are returned as separate metadata.
"""

from __future__ import annotations

from typing import Any

SYSTEM_PROMPT = (
    "Kamu adalah asisten knowledge perusahaan. Jawab HANYA berdasarkan konteks "
    "dokumen resmi yang diberikan. Jangan menggunakan pengetahuan umum, asumsi, "
    "atau informasi dari luar konteks. Jangan menebak dan jangan mengisi bagian "
    "yang tidak tertulis eksplisit. Jika bukti tidak cukup, jawab persis: "
    "\"Informasi tidak ditemukan pada dokumen yang tersedia.\" Jika ada aturan "
    "yang berbeda, tampilkan perbedaannya dan jangan memilih tanpa dasar. "
    "Jawab dalam Bahasa Indonesia, ringkas, jelas, dan langsung. Jangan membuat "
    "citation atau referensi baru; sumber dikelola oleh aplikasi."
)


def build_messages(query: str, matches: list[tuple[float, dict[str, Any]]]) -> list[dict[str, str]]:
    context = "\n\n".join(
        f"[DOKUMEN: {chunk['filename']} | HALAMAN: {chunk.get('page_number') or '-'} | "
        f"SECTION: {chunk.get('section_title') or '-'}]\n{chunk['text']}"
        for _, chunk in matches
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Pertanyaan pengguna: {query}\n\nKonteks dokumen resmi:\n{context}"},
    ]
