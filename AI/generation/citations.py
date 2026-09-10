"""Citation mapping.

Citations are copied verbatim from the metadata of chunks that were
actually retrieved. The LLM never invents a citation — this module is the
only place citations come from.
"""

from __future__ import annotations

import math
import re
from typing import Any

CITATION_FIELDS = ("document_id", "filename", "version", "page_number", "section_title", "chunk_id")


def citation_from_chunk(chunk: dict[str, Any]) -> dict[str, Any]:
    citation = {key: chunk[key] for key in CITATION_FIELDS}
    # Keep a bounded, verbatim preview for the evidence viewer. Retrieval still
    # uses the intact page/section context; this is only presentation metadata.
    text = str(chunk.get("text", "")).strip()
    if text:
        citation["excerpt"] = text[:2400]
    if "document_version_id" in chunk:
        citation["document_version_id"] = chunk["document_version_id"]
    # Judul ikut supaya kartu bukti menyebut nama yang sama dengan daftar
    # dokumen. `filename` tetap dikirim sebagai identitas teknisnya.
    title = str(chunk.get("title") or "").strip()
    if title:
        citation["title"] = title
    return citation


def citations_from_matches(matches: list[tuple[float, dict[str, Any]]]) -> list[dict[str, Any]]:
    return [citation_from_chunk(chunk) for _, chunk in matches]


#: Angka ikut ditangkap utuh ("55.19", "2021") karena justru itu yang
#: membedakan satu produk hukum dari yang lain. Kata pendek tetap diambil dari
#: tiga huruf supaya nama bulan seperti "mei" tidak hilang.
_TOKEN = re.compile(r"[0-9]+(?:[.,][0-9]+)*|[a-z]{3,}")

#: Kata fungsi dibuang tegas, tidak diserahkan ke IDF. IDF hanya menolkan kata
#: yang muncul di SEMUA kandidat; yang muncul di 4 dari 5 masih menyumbang, dan
#: kumpulan "dan/yang/pada" sudah cukup untuk mengangkat dokumen yang sama
#: sekali tidak menopang jawaban.
_STOPWORDS = frozenset("""
adalah agar akan antara atas atau bagi bahwa berikut dalam dan dengan dari
untuk ini itu juga karena kepada lain maka masing melalui memiliki mengenai
oleh pada paling para perlu sebagai sebagaimana sehingga selain serta setiap
sesuai tersebut tentang telah tidak yang kami kita mereka anda saya adanya
""".split())

#: Angka jauh lebih menentukan daripada kata di korpus produk hukum: nomor,
#: tahun, dan tanggal itulah yang membedakan satu peraturan dari yang lain.
_NUMBER_WEIGHT = 2.0

#: Ambang relatif terhadap dukungan tertinggi. Dokumen yang benar-benar ikut
#: dipakai menjawab biasanya terpaut jauh, bukan tipis.
SUPPORT_KEEP_RATIO = 0.34
#: Di bawah ini penilaiannya dianggap tidak bermakna — misalnya jawaban yang
#: seluruhnya kalimat baku. Saat itu terjadi, seluruh bukti dipertahankan:
#: menampilkan bukti berlebih jauh lebih ringan daripada menyembunyikan bukti
#: yang sebenarnya mendasari jawaban.
SUPPORT_MINIMUM = 1.0


def content_tokens(text: str) -> set[str]:
    """Kata isi teks: angka dan kata >=3 huruf, tanpa kata fungsi."""
    return {
        token for token in _TOKEN.findall(str(text).lower())
        if token not in _STOPWORDS
    }


def supporting_matches(
    answer: str, matches: list[tuple[float, dict[str, Any]]]
) -> list[tuple[float, dict[str, Any]]]:
    """Sisakan chunk yang benar-benar menopang jawaban.

    Skor kemiripan tidak bisa dipakai untuk ini. Pada koleksi produk hukum,
    setiap peraturan memuat kalimat baku yang sama ("Ditetapkan di ... pada
    tanggal ..."), sehingga pertanyaan tentang tanggal penetapan cocok merata
    ke semuanya — pada satu kasus nyata dokumen yang benar justru berperingkat
    keempat, dengan selisih skor hanya 0,04 dari yang teratas.

    Yang membedakan bukan kemiripan dengan pertanyaan, melainkan kesamaan
    dengan JAWABAN yang sudah tersusun. IDF-nya dihitung di antara kandidat itu
    sendiri, jadi kalimat baku yang dimiliki semua kandidat otomatis berbobot
    nol dan yang tersisa hanya penanda khas seperti nomor dan tanggal.
    """
    if len(matches) < 2:
        return matches
    answer_tokens = content_tokens(answer)
    if not answer_tokens:
        return matches

    candidates = [content_tokens(chunk.get("text", "")) for _, chunk in matches]
    total = len(candidates)
    frequency: dict[str, int] = {}
    for tokens in candidates:
        for token in tokens:
            frequency[token] = frequency.get(token, 0) + 1

    supports = [
        sum(
            math.log(total / frequency[token])
            * (_NUMBER_WEIGHT if token[0].isdigit() else 1.0)
            for token in answer_tokens & tokens
        )
        for tokens in candidates
    ]
    best = max(supports)
    if best < SUPPORT_MINIMUM:
        return matches

    threshold = best * SUPPORT_KEEP_RATIO
    kept = [match for match, support in zip(matches, supports) if support >= threshold]
    # Urutan aslinya dipertahankan supaya bukti terkuat menurut retrieval tetap
    # di depan; `kept` tidak pernah kosong karena `best` selalu lolos ambang.
    return kept
