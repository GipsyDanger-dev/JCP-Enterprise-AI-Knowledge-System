import unittest

from generation.citations import supporting_matches

BAKU = (
    "Ditetapkan di Sleman pada tanggal {tanggal}. Diundangkan di Sleman pada "
    "tanggal {tanggal}. Agar setiap orang mengetahuinya, memerintahkan "
    "pengundangan Peraturan Bupati ini dengan penempatannya dalam Berita Daerah."
)


def chunk(nama, teks, nomor=1):
    return {
        "chunk_id": f"{nama}-{nomor}", "filename": nama, "document_id": nama,
        "document_version_id": nama, "version": 1, "page_number": nomor,
        "section_title": "", "text": teks,
    }


class SupportingMatchesTests(unittest.TestCase):
    """Kalimat baku yang dimiliki semua peraturan tidak boleh jadi bukti.

    Skor kemiripan gagal di sini: pada kasus nyata dokumen yang benar justru
    berperingkat keempat, hanya terpaut 0,04 dari yang teratas.
    """

    def setUp(self):
        self.benar = chunk("perbup-55.19.pdf", BAKU.format(tanggal="21 Desember 2021"), 17)
        self.lain = [
            chunk("sleman-22-2026.pdf", BAKU.format(tanggal="4 Maret 2026"), 30),
            chunk("sleman-25-2026.pdf", BAKU.format(tanggal="9 Juli 2026"), 12),
            chunk("sleman-8-2026.pdf", BAKU.format(tanggal="17 Mei 2026"), 11),
        ]
        self.jawaban = (
            "Peraturan Bupati Sleman Nomor 55.19 Tahun 2021 ditetapkan dan "
            "diundangkan di Sleman pada tanggal 21 Desember 2021."
        )

    def test_only_the_document_behind_the_answer_survives(self):
        matches = [(0.6372, self.lain[0]), (0.6243, self.lain[1]),
                   (0.6145, self.lain[2]), (0.6108, self.benar)]
        kept = supporting_matches(self.jawaban, matches)
        self.assertEqual([c["filename"] for _, c in kept], ["perbup-55.19.pdf"])

    def test_a_lower_ranked_document_is_not_penalised(self):
        """Yang benar tadi justru peringkat terakhir — urutan retrieval tidak
        boleh ikut menentukan."""
        matches = [(0.9, self.lain[0]), (0.1, self.benar)]
        kept = supporting_matches(self.jawaban, matches)
        self.assertEqual([c["filename"] for _, c in kept], ["perbup-55.19.pdf"])

    def test_every_genuinely_used_document_is_kept(self):
        """Prompt-nya memang meminta perbedaan antar aturan ditampilkan, jadi
        jawaban lintas dokumen harus tetap membawa semua sumbernya."""
        a = chunk("cuti-2023.pdf", "Cuti tahunan karyawan tetap adalah 12 hari kerja.")
        b = chunk("cuti-2026.pdf", "Cuti tahunan diperbarui menjadi 15 hari kerja.")
        jawaban = ("Aturan lama menyebut cuti tahunan 12 hari kerja, sedangkan "
                   "aturan terbaru menyebut 15 hari kerja.")
        kept = supporting_matches(jawaban, [(0.7, a), (0.68, b)])
        self.assertEqual(sorted(c["filename"] for _, c in kept),
                         ["cuti-2023.pdf", "cuti-2026.pdf"])

    def test_indistinguishable_evidence_is_left_untouched(self):
        """Kalau tidak ada yang menonjol, bukti dipertahankan seluruhnya —
        menampilkan berlebih lebih ringan daripada menyembunyikan."""
        matches = [(0.6, self.lain[0]), (0.59, self.lain[1])]
        kept = supporting_matches("Informasi tersebut tercantum dalam dokumen.", matches)
        self.assertEqual(len(kept), len(matches))

    def test_result_is_never_empty(self):
        matches = [(0.6, self.lain[0]), (0.59, self.lain[1])]
        for jawaban in ("", "   ", "xyzzy", self.jawaban):
            with self.subTest(jawaban=jawaban):
                self.assertTrue(supporting_matches(jawaban, matches))

    def test_single_match_is_returned_as_is(self):
        matches = [(0.6, self.benar)]
        self.assertEqual(supporting_matches("apa pun", matches), matches)

    def test_original_order_is_preserved(self):
        a = chunk("a.pdf", "cuti tahunan 12 hari kerja")
        b = chunk("b.pdf", "cuti tahunan 15 hari kerja")
        jawaban = "Cuti tahunan 12 hari kerja pada aturan lama dan 15 hari kerja pada aturan baru."
        kept = supporting_matches(jawaban, [(0.5, b), (0.4, a)])
        self.assertEqual([c["filename"] for _, c in kept], ["b.pdf", "a.pdf"])


if __name__ == "__main__":
    unittest.main()
