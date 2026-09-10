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

from typing import Any


def display_name(record: dict[str, Any]) -> str:
    """Judul kalau ada, kalau tidak nama berkasnya."""
    title = str(record.get("title") or "").strip()
    return title or str(record.get("filename") or "").strip()

