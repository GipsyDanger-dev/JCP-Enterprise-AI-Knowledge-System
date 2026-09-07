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
#
# Dikirim bersama response_format json_object, jadi bentuk balasannya dipaksa oleh
# provider. Versi sebelumnya meminta awalan teks "CLARIFY:" dan sesekali diabaikan
# model; balasan prosa yang lolos itu lalu disangka jawaban dan diberi sitasi.
CLARIFY_RULE = (
    "\n\nBalas SELALU berupa satu objek JSON, tanpa teks lain di luar JSON.\n"
    "Sebelum menjawab, nilai dulu pertanyaannya. Kalau pertanyaannya begitu "
    "luas sehingga jawaban jujurnya harus mencakup banyak topik berbeda, jangan "
    "menjawab; balas:\n"
    "{\"type\":\"clarify\",\"pertanyaan\":\"<satu kalimat menanyakan maksud pengguna>\","
    "\"pilihan\":[\"<pertanyaan spesifik 1>\",\"<pertanyaan spesifik 2>\","
    "\"<pertanyaan spesifik 3>\"]}\n"
    "Selain itu, jawab seperti biasa dan bungkus jawabannya:\n"
    "{\"type\":\"answer\",\"jawaban\":\"<jawaban lengkap sesuai aturan di atas>\"}\n"
    "Setiap pilihan harus bisa dijawab dari konteks yang diberikan. Kalau ragu, "
    "jawab saja seperti biasa; hanya minta penjelasan bila pertanyaannya benar-benar rancu."
)


# Kata yang menandai pengguna benar-benar sedang bertanya, bukan menyebut topik.
_QUESTION_OPENERS = (
    "apa", "apakah", "bagaimana", "gimana", "berapa", "kapan", "siapa", "mengapa",
    "kenapa", "dimana", "di mana", "bolehkah", "adakah", "jelaskan", "ringkas",
    "sebutkan", "tolong", "carikan", "cari", "apa saja", "what", "how", "when",
    "who", "why", "where",
)


def looks_like_topic_phrase(query: str) -> bool:
    """Benar bila masukan hanya menyebut topik, tanpa pertanyaan.

    "kemitraan usaha mikro" bukan pertanyaan: jawabannya bisa syaratnya,
    bentuknya, sanksinya, atau siapa pelaksananya. Menebak satu di antaranya
    lebih buruk daripada bertanya balik sebentar.
    """
    text = query.strip().lower()
    if not text or "?" in text:
        return False
    words = text.split()
    if len(words) > 5:
        return False
    return not any(text.startswith(opener) for opener in _QUESTION_OPENERS)


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
    if allow_clarify and looks_like_topic_phrase(query):
        # Penilaian ini dikerjakan di sini, bukan diserahkan ke model: nada
        # CLARIFY_RULE sengaja condong ke menjawab, sehingga frasa topik telanjang
        # kerap dijawab dengan satu sudut pandang yang dipilih sendiri oleh model.
        bagian.append(
            f"Catatan: pengguna hanya menyebut topik \"{query.strip()}\" tanpa pertanyaan "
            "yang jelas. Jangan menebak maksudnya — balas dengan type clarify, dan susun "
            "setiap pilihan dari sudut pandang berbeda yang benar-benar ada di konteks di atas."
        )
    system = SYSTEM_PROMPT + CLARIFY_RULE if allow_clarify else SYSTEM_PROMPT
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n\n".join(bagian)},
    ]
