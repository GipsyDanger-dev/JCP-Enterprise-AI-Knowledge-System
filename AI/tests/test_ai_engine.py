import json
import os
import unittest
from unittest import mock
from pathlib import Path

from ai_engine import KnowledgeBase, chunk_pages, generate_answer
from generation.prompts import build_messages, looks_like_topic_phrase


class RetrievalContractTests(unittest.TestCase):
    def setUp(self):
        self.chunks = chunk_pages(
            [(7, "Manager dapat menginap dengan biaya maksimal Rp900.000 per malam. Simpan bukti pembayaran.")],
            "SOP Perjalanan Dinas 2026.pdf", "doc-1", 1, words_per_chunk=120,
        )
        self.kb = KnowledgeBase(self.chunks)

    def test_answer_contains_provenance(self):
        result = self.kb.ask("Berapa maksimal biaya hotel Manager?")
        self.assertTrue(result["grounded"])
        self.assertEqual(result["citations"][0]["filename"], "SOP Perjalanan Dinas 2026.pdf")
        self.assertEqual(result["citations"][0]["page_number"], 7)
        self.assertEqual(result["citations"][0]["chunk_id"], "doc-1-1")

    def test_unknown_question_is_no_answer(self):
        result = self.kb.ask("Bagaimana prosedur pengajuan cuti tahunan?")
        self.assertFalse(result["grounded"])
        self.assertEqual(result["citations"], [])
        self.assertIn("tidak ditemukan", result["answer"])

    def test_index_round_trip(self):
        index = Path(".test-index.json")
        try:
            self.kb.save(index)
            loaded = KnowledgeBase.load(index)
            self.assertEqual(loaded.chunks, self.kb.chunks)
        finally:
            if index.exists():
                index.unlink()


class LlmModeTests(unittest.TestCase):
    def setUp(self):
        self.chunks = chunk_pages(
            [(7, "Manager dapat menginap dengan biaya maksimal Rp900.000 per malam. Simpan bukti pembayaran.")],
            "SOP Perjalanan Dinas 2026.pdf", "doc-1", 1, words_per_chunk=120,
        )
        self.kb = KnowledgeBase(self.chunks)

    def test_llm_mode_requires_api_key(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError) as ctx:
                self.kb.ask("Berapa maksimal biaya hotel Manager?", use_llm=True)
        self.assertIn("AI_PROVIDER_API_KEY", str(ctx.exception))

    def test_generate_answer_missing_key_message(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError) as ctx:
                generate_answer("q", [])
        self.assertIn("AI_PROVIDER_API_KEY", str(ctx.exception))

    def test_llm_answer_hides_internal_chunk_coordinates(self):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return json.dumps({"choices": [{"message": {"content": "Maksimal Rp900.000 [7db293d7-e271-473e-9d0d-431972042f04-1 - Biaya hotel]"}}]}).encode()

        with mock.patch.dict(os.environ, {
            "AI_PROVIDER_API_KEY": "sk-test",
            "AI_PROVIDER_BASE_URL": "https://provider.test/v1",
        }, clear=False), \
             mock.patch("generation.llm.urllib.request.urlopen", return_value=FakeResponse()):
            result = self.kb.ask("Berapa maksimal biaya hotel Manager?", use_llm=True)
        self.assertTrue(result["grounded"])
        self.assertEqual(result["answer"], "Maksimal Rp900.000")
        self.assertEqual(result["citations"][0]["chunk_id"], "doc-1-1")
        self.assertEqual(result["citations"][0]["page_number"], 7)

    def test_personal_prompt_derives_domain_from_documents(self):
        messages = build_messages(
            "Apa kategori nodul ini?",
            [(0.8, {
                "filename": "panduan_tirads.pdf",
                "page_number": 4,
                "section_title": "Klasifikasi",
                "text": "Kategori TI-RADS ditentukan dari karakteristik ultrasonografi.",
            })],
            workspace_type="PERSONAL",
        )
        self.assertIn("personal milik pengguna", messages[1]["content"])
        self.assertIn("Bidang dokumen dapat berupa apa saja", messages[0]["content"])
        self.assertIn("TI-RADS", messages[1]["content"])


class TopicPhraseTests(unittest.TestCase):
    """Judul dokumen yang diketik tanpa pertanyaan harus memicu clarify.

    Sebelumnya tidak: batas lima kata membuat judul produk hukum — bentuk yang
    paling sering diketik pengguna — lolos sebagai "pertanyaan", lalu dijawab
    "Informasi tidak ditemukan" padahal isinya ada di dokumen.
    """

    JUDUL = "Perbup Sleman Nomor 55.19 Tahun 2021"

    def test_document_title_is_a_topic_phrase(self):
        self.assertTrue(looks_like_topic_phrase(self.JUDUL))

    def test_trailing_question_mark_does_not_make_a_title_a_question(self):
        self.assertTrue(looks_like_topic_phrase(self.JUDUL + "?"))

    def test_real_questions_are_left_alone(self):
        for query in (
            f"Apa yang diatur dalam {self.JUDUL}?",
            f"Ringkas isi {self.JUDUL}",
            "Berapa lama cuti tahunan?",
            "Kapan peraturan itu mulai berlaku?",
        ):
            with self.subTest(query=query):
                self.assertFalse(looks_like_topic_phrase(query))

    def test_question_word_at_the_end_still_counts_as_a_question(self):
        """Bahasa Indonesia lazim menaruh kata tanya di belakang.

        Memeriksa awalan kalimat saja membuat "gaji manager berapa?" disangka
        label topik, lalu dibalas pertanyaan padahal sudah jelas maksudnya.
        """
        for query in (
            "gaji manager berapa?",
            "cuti tahunan berapa hari?",
            "peraturan ini berlaku kapan?",
            "yang menandatangani siapa",
        ):
            with self.subTest(query=query):
                self.assertFalse(looks_like_topic_phrase(query))

    def test_mid_sentence_question_mark_still_disqualifies(self):
        self.assertFalse(looks_like_topic_phrase("benarkah? tolong cek"))

    def test_long_sentence_is_not_a_topic_phrase(self):
        self.assertFalse(
            looks_like_topic_phrase(
                "peraturan bupati sleman tentang tata cara pemilihan lurah antar waktu di kabupaten"
            )
        )

    def test_clarify_note_reaches_the_prompt_for_a_bare_title(self):
        matches = [(0.6, {
            "filename": "perbup.pdf", "page_number": 17, "section_title": "",
            "text": "Peraturan Bupati ini mulai berlaku pada tanggal diundangkan.",
        })]
        with_note = build_messages(self.JUDUL, matches, allow_clarify=True)[1]["content"]
        self.assertIn("hanya menyebut topik", with_note)

        # Tanpa allow_clarify tidak ada pintu clarify, jadi catatannya pun tidak
        # boleh ikut — kalau ikut, model diminta melakukan yang tak bisa dibalas.
        without = build_messages(self.JUDUL, matches, allow_clarify=False)[1]["content"]
        self.assertNotIn("hanya menyebut topik", without)


if __name__ == "__main__":
    unittest.main()
