"""Nama dokumen yang dipakai untuk berbicara dengan pengguna.

Backend menyimpan dua nama: ``original_filename`` (identitas teknis berkas,
dipakai untuk validasi unggahan dan pencocokan versi) dan ``title`` (nama yang
dilihat pengguna di daftar dokumen, bisa diubah kapan saja lewat menu ubah
nama). Keduanya berpisah begitu seseorang mengganti judul.

Selama AI hanya diberi nama berkas, dokumen yang sudah diganti namanya menjadi
tidak bisa disebut: pengguna bertanya memakai nama yang ia lihat, sedangkan
daftar yang dipegang AI memuat nama lain, dan jawabannya menjadi "tidak ada
dokumen dengan nama seperti itu" untuk dokumen yang jelas-jelas ada.
"""

from __future__ import annotations

import re
from typing import Any


def display_name(record: dict[str, Any]) -> str:
    """Judul kalau ada, kalau tidak nama berkasnya."""
    title = str(record.get("title") or "").strip()
    return title or str(record.get("filename") or "").strip()


#: Nama sependek ini terlalu mudah muncul kebetulan di kalimat lain. Judul
#: dokumen sungguhan hampir selalu lebih panjang, jadi ambang ini menutup
#: salah-tunjuk tanpa mengorbankan kasus nyata.
MIN_NAME_LENGTH = 5

_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_EXTENSION = re.compile(r"\.[A-Za-z0-9]{1,5}$")


def _normalize(text: Any) -> str:
    """Samakan bentuk supaya "55.19" dan "55 19" bisa saling cocok."""
    return _NON_ALNUM.sub(" ", str(text or "").lower()).strip()


def find_named_document(
    query: str, documents: list[dict[str, Any]]
) -> dict[str, Any] | None:
    """Dokumen yang namanya disebut di dalam ``query``, atau None.

    Pencarian biasa bekerja per potongan dan berbasis kemiripan makna, sehingga
    pertanyaan tingkat dokumen seperti "apa isi dokumen X" justru gagal: yang
    paling mirip dengan frasa itu ternyata judul bab — "BAB II PELAPORAN" —
    yang tidak memuat apa pun, sedangkan isi sesungguhnya berada di bawah
    ambang kemiripan dan tidak pernah ikut terkirim.

    Begitu penanya menyebut nama dokumennya, dokumen itu sudah pasti; kemiripan
    tidak lagi layak jadi penyaring. Pemanggil memakai hasil fungsi ini untuk
    mempersempit pencarian ke dokumen tersebut sekaligus melepas ambangnya.

    Kecocokan terpanjang yang menang, supaya judul yang merupakan bagian dari
    judul lain tidak menyerobot yang lebih spesifik.
    """
    haystack = _normalize(query)
    if not haystack:
        return None

    best_length = 0
    best: dict[str, Any] | None = None
    for document in documents or []:
        candidates = (
            document.get("title"),
            _EXTENSION.sub("", str(document.get("filename") or "")),
        )
        for candidate in candidates:
            name = _normalize(candidate)
            if len(name) < MIN_NAME_LENGTH or len(name) <= best_length:
                continue
            if name in haystack:
                best_length = len(name)
                best = document
    return best
