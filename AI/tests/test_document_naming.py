import unittest

from generation.citations import citation_from_chunk
from generation.naming import display_name
from generation.prompts import build_messages, format_inventory
from generation.suggestions import questions_from_topics

# Kasus nyata: pengguna mengunggah "uji-provider-baru.txt" lalu memberinya
# judul "tessss1". Selama AI hanya diberi nama berkas, pertanyaan "apa isi
# dokumen tessss1" dijawab "tidak ada dokumen dengan nama seperti itu" —
# untuk dokumen yang jelas-jelas ada di daftar.
BERKAS = "uji-provider-baru.txt"
JUDUL = "tessss1"


def chunk(**extra):
    dasar = {
        "chunk_id": "c-1", "document_id": "d-1", "document_version_id": "v-1",
        "filename": BERKAS, "version": 1, "page_number": 3,
        "section_title": "", "text": "Isi dokumen uji.",
    }
    dasar.update(extra)
    return dasar


class DisplayNameTests(unittest.TestCase):
    def test_title_wins_when_present(self):
        self.assertEqual(display_name({"filename": BERKAS, "title": JUDUL}), JUDUL)

    def test_filename_is_the_fallback(self):
        self.assertEqual(display_name({"filename": BERKAS}), BERKAS)
        self.assertEqual(display_name({"filename": BERKAS, "title": None}), BERKAS)
        self.assertEqual(display_name({"filename": BERKAS, "title": "   "}), BERKAS)


class PromptNamingTests(unittest.TestCase):
    def test_inventory_lists_the_name_the_user_sees(self):
        baris = format_inventory([{"filename": BERKAS, "title": JUDUL, "page_count": 2}])
        self.assertIn(JUDUL, baris)

    def test_retrieved_context_is_labelled_with_the_title(self):
        pesan = build_messages("apa isi dokumen tessss1", [(0.7, chunk(title=JUDUL))])
        self.assertIn(JUDUL, pesan[1]["content"])

    def test_documents_without_a_title_still_use_the_filename(self):
        pesan = build_messages("apa isi dokumen", [(0.7, chunk())])
        self.assertIn(BERKAS, pesan[1]["content"])


class SuggestionNamingTests(unittest.TestCase):
    def test_suggestions_offer_the_title_not_the_filename(self):
        pertanyaan = questions_from_topics(
            [{"section_title": "", "filename": BERKAS, "title": JUDUL}]
        )
        self.assertTrue(pertanyaan)
        self.assertTrue(any(JUDUL in q for q in pertanyaan))
        self.assertFalse(any(BERKAS in q for q in pertanyaan))


class CitationNamingTests(unittest.TestCase):
    def test_citation_carries_both_names(self):
        sitasi = citation_from_chunk(chunk(title=JUDUL))
        self.assertEqual(sitasi["title"], JUDUL)
        # Nama berkas tetap ada: itu identitas teknis yang dipakai backend
        # untuk memverifikasi bahwa sitasinya memang boleh diakses.
        self.assertEqual(sitasi["filename"], BERKAS)

    def test_citation_without_a_title_omits_the_field(self):
        self.assertNotIn("title", citation_from_chunk(chunk()))


if __name__ == "__main__":
    unittest.main()
