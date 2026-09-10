import unittest

from generation.naming import MIN_NAME_LENGTH, find_named_document

DOKUMEN = [
    {"title": "tessss1", "filename": "tessss1.txt"},
    {"title": "Perbup Sleman Nomor 55.19 Tahun 2021",
     "filename": "Perbup Sleman Nomor 55.19 Tahun 2021.pdf"},
    {"title": None,
     "filename": "SlemanNomor8Tahun2025ttgPengembanganEkonomiKreatif.pdf"},
]


def nama(hasil):
    return hasil["filename"] if hasil else None


class FindNamedDocumentTests(unittest.TestCase):
    """Pertanyaan tingkat dokumen gagal di pencarian per potongan.

    "apa isi dokumen tessss1" mengembalikan judul bab "BAB II PELAPORAN" —
    dua kata tanpa isi — sementara pasal-pasalnya berada di bawah ambang
    kemiripan dan tidak pernah ikut terkirim ke model.
    """

    def test_title_mentioned_in_the_question(self):
        self.assertEqual(nama(find_named_document("apa isi dokumen tessss1", DOKUMEN)),
                         "tessss1.txt")

    def test_punctuation_and_case_do_not_matter(self):
        self.assertEqual(
            nama(find_named_document(
                "Apa yang diatur dalam Perbup Sleman Nomor 55.19 Tahun 2021?", DOKUMEN)),
            "Perbup Sleman Nomor 55.19 Tahun 2021.pdf",
        )

    def test_filename_is_matched_when_there_is_no_title(self):
        self.assertEqual(
            nama(find_named_document(
                "ringkas SlemanNomor8Tahun2025ttgPengembanganEkonomiKreatif", DOKUMEN)),
            "SlemanNomor8Tahun2025ttgPengembanganEkonomiKreatif.pdf",
        )

    def test_a_question_without_a_document_name_is_left_alone(self):
        """Paling penting: pertanyaan biasa tidak boleh ikut dipersempit,
        karena mempersempit ke dokumen yang salah menyembunyikan jawabannya."""
        for pertanyaan in (
            "Berapa biaya penginapan untuk pejabat setingkat Manager?",
            "Apakah ada aturan yang berbeda antar dokumen?",
            "Kapan peraturan itu mulai berlaku?",
        ):
            with self.subTest(pertanyaan=pertanyaan):
                self.assertIsNone(find_named_document(pertanyaan, DOKUMEN))

    def test_the_longest_match_wins(self):
        dokumen = [
            {"title": "Perbup Sleman", "filename": "a.pdf"},
            {"title": "Perbup Sleman Nomor 55.19 Tahun 2021", "filename": "b.pdf"},
        ]
        self.assertEqual(
            nama(find_named_document("isi Perbup Sleman Nomor 55.19 Tahun 2021", dokumen)),
            "b.pdf",
        )

    def test_very_short_names_are_ignored(self):
        """Nama sependek ini terlalu mudah muncul kebetulan di kalimat lain."""
        pendek = "a" * (MIN_NAME_LENGTH - 1)
        dokumen = [{"title": pendek, "filename": f"{pendek}.pdf"}]
        self.assertIsNone(find_named_document(f"apa isi dokumen {pendek}", dokumen))

    def test_empty_inputs_are_safe(self):
        self.assertIsNone(find_named_document("", DOKUMEN))
        self.assertIsNone(find_named_document("apa isi dokumen tessss1", []))
        self.assertIsNone(find_named_document("apa isi", [{}]))


if __name__ == "__main__":
    unittest.main()
