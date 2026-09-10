"""Prompt assembly: query + retrieved page/section contexts -> LLM messages.

The system prompt enforces the MVP guardrails: answer only from the
provided chunks, never fabricate, and emit the exact no-answer sentence
when evidence is insufficient. Citations are returned as separate metadata.
"""

from __future__ import annotations

import re
from typing import Any

from generation.naming import display_name

SYSTEM_PROMPT = (
    "Kamu adalah asisten knowledge berbasis dokumen. Jawab HANYA berdasarkan "
    "konteks dokumen yang diberikan. Bidang dokumen dapat berupa apa saja, jadi "
    "tentukan istilah, topik, dan sudut pandang dari isi dokumen; jangan otomatis "
    "menganggap dokumen membahas HR atau kebijakan perusahaan. Jangan menggunakan "
    "pengetahuan umum, asumsi, "
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


_QUESTION_OPENERS = (
    "apa", "apakah", "bagaimana", "gimana", "berapa", "kapan", "siapa",
    "mengapa", "kenapa", "dimana", "di mana", "bolehkah", "adakah",
    "jelaskan", "ringkas", "sebutkan", "tolong", "carikan", "cari",
    "what", "how", "when", "who", "why", "where",
)


#: Judul produk hukum panjang secara wajar — "Perbup Sleman Nomor 55.19 Tahun
#: 2021" saja sudah enam kata. Batas lama (lima) membuat justru judul dokumen,
#: bentuk yang paling sering diketik pengguna, tidak pernah terdeteksi.
_MAX_TOPIC_WORDS = 8


#: Dicocokkan sebagai kata utuh: "apa" tidak boleh ikut tersulut oleh
#: "siapa" atau "berapa" yang kebetulan memuatnya sebagai potongan huruf.
_WORDS = re.compile(r"[a-z]+")
QUESTION_WORDS = frozenset(
    word for opener in _QUESTION_OPENERS for word in opener.split()
)


def looks_like_topic_phrase(query: str) -> bool:
    """Detect a short topic label that has no explicit question yet.

    Tanda tanya di ujung sengaja tidak dianggap sebagai bukti pertanyaan:
    "Perbup Sleman Nomor 55.19 Tahun 2021?" tetap sebuah judul, dan tanpa
    pengecualian ini satu karakter saja sudah cukup untuk melewati
    pemeriksaannya. Tanda tanya di TENGAH tetap menggugurkan, karena itu
    menandakan kalimat tanya yang sungguhan.
    """
    text = query.strip().lower().rstrip("?").strip()
    if not text or "?" in text:
        return False
    words = text.split()
    if len(words) > _MAX_TOPIC_WORDS:
        return False
    # Kata tanya dicari di SELURUH kalimat, bukan hanya di awal. Bahasa
    # Indonesia lazim menaruhnya di belakang — "gaji manager berapa",
    # "peraturan ini berlaku kapan" — dan memeriksa awalan saja membuat
    # kalimat tanya yang jelas disangka label topik lalu dibalas pertanyaan.
    if _WORDS.findall(text) and set(_WORDS.findall(text)) & QUESTION_WORDS:
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
            f"- {display_name(document)} — {halaman_teks}, "
            f"{_format_size(document.get('file_size'))}, diunggah {diunggah_teks}"
        )
    return "\n".join(baris)


def build_messages(
    query: str,
    matches: list[tuple[float, dict[str, Any]]],
    documents: list[dict[str, Any]] | None = None,
    allow_clarify: bool = False,
    workspace_type: str = "COMPANY",
) -> list[dict[str, str]]:
    context = "\n\n".join(
        f"[DOKUMEN: {display_name(chunk)} | HALAMAN: {chunk.get('page_number') or '-'} | "
        f"SECTION: {chunk.get('section_title') or '-'}]\n{chunk['text']}"
        for _, chunk in matches
    )
    workspace_label = "personal milik pengguna" if workspace_type == "PERSONAL" else "perusahaan"
    bagian = [
        f"Jenis workspace: {workspace_label}",
        f"Pertanyaan pengguna: {query}",
    ]
    if documents:
        bagian.append(
            "Daftar berkas yang tersimpan (sifat berkas, bukan isinya):\n"
            + format_inventory(documents)
        )
    bagian.append(f"Konteks dokumen yang dapat diakses pengguna:\n{context}")
    if allow_clarify and looks_like_topic_phrase(query):
        bagian.append(
            f"Catatan: pengguna hanya menyebut topik \"{query.strip()}\" tanpa pertanyaan "
            "yang jelas. Jangan menebak maksudnya — balas dengan type clarify dan "
            "susun pilihan dari sudut pandang berbeda yang benar-benar ada di konteks."
        )
    system = SYSTEM_PROMPT + CLARIFY_RULE if allow_clarify else SYSTEM_PROMPT
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n\n".join(bagian)},
    ]
