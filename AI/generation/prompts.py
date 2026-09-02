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
    "Daftar berkas yang tersimpan juga termasuk konteks resmi: pakai untuk "
    "pertanyaan tentang jumlah halaman, ukuran berkas, atau tanggal unggah, dan "
    "salin angkanya persis tanpa membulatkan atau menambah kata perkiraan. "
    "Jawab dalam Bahasa Indonesia, ringkas, jelas, dan langsung. Jangan membuat "
    "citation atau referensi baru; sumber dikelola oleh aplikasi."
)


# Nadanya sengaja condong ke menjawab: uji coba menunjukkan model terlalu sering
# minta penjelasan, termasuk untuk pertanyaan yang sebenarnya sudah spesifik.
CLARIFY_RULE = (
    "\n\nSebelum menjawab, nilai dulu pertanyaannya. Kalau pertanyaannya begitu "
    "luas sehingga jawaban jujurnya harus mencakup banyak topik berbeda, jangan "
    "menjawab; balas satu baris saja dengan format persis:\n"
    "CLARIFY: {\"pertanyaan\":\"<satu kalimat menanyakan maksud pengguna>\","
    "\"pilihan\":[\"<pertanyaan spesifik 1>\",\"<pertanyaan spesifik 2>\","
    "\"<pertanyaan spesifik 3>\"]}\n"
    "Setiap pilihan harus bisa dijawab dari konteks yang diberikan. Kalau ragu, "
    "jawab saja seperti biasa; hanya minta penjelasan bila pertanyaannya benar-benar rancu."
)


def _format_size(size_bytes: int | None) -> str:
    if not size_bytes:
        return "ukuran tidak tercatat"
    if size_bytes >= 1024 * 1024:
        return f"{size_bytes / 1024 / 1024:.1f} MB"
    return f"{max(1, round(size_bytes / 1024))} KB"


def format_inventory(documents: list[dict[str, Any]]) -> str:
    """Daftar sifat berkas: halaman, ukuran, tanggal unggah.

    Jumlah halaman dan ukuran tidak pernah tertulis di dalam teks dokumen,
    jadi tanpa daftar ini model tidak punya bahan untuk menjawabnya.
    """
    baris = []
    for document in documents:
        halaman = document.get("page_count")
        halaman_teks = f"{halaman} halaman" if halaman else "jumlah halaman tidak tercatat"
        diunggah = document.get("created_at")
        try:
            diunggah_teks = diunggah.strftime("%d %B %Y")
        except AttributeError:
            diunggah_teks = "tanggal unggah tidak tercatat"
        baris.append(
            f"- {document['filename']} — {halaman_teks}, "
            f"{_format_size(document.get('file_size'))}, diunggah {diunggah_teks}"
        )
    return "\n".join(baris)


def build_messages(
    query: str,
    matches: list[tuple[float, dict[str, Any]]],
    documents: list[dict[str, Any]] | None = None,
    allow_clarify: bool = False,
) -> list[dict[str, str]]:
    context = "\n\n".join(
        f"[DOKUMEN: {chunk['filename']} | HALAMAN: {chunk.get('page_number') or '-'} | "
        f"SECTION: {chunk.get('section_title') or '-'}]\n{chunk['text']}"
        for _, chunk in matches
    )
    bagian = [f"Pertanyaan pengguna: {query}"]
    if documents:
        bagian.append(
            "Daftar berkas yang tersimpan (sifat berkas, bukan isinya):\n"
            + format_inventory(documents)
        )
    bagian.append(f"Konteks dokumen resmi:\n{context}")
    system = SYSTEM_PROMPT + CLARIFY_RULE if allow_clarify else SYSTEM_PROMPT
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n\n".join(bagian)},
    ]
