import json
import os
import unittest
from unittest import mock
from pathlib import Path

from ai_engine import KnowledgeBase, chunk_pages, generate_answer


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
        self.assertIn("SUMOPOD_API_KEY", str(ctx.exception))

    def test_generate_answer_missing_key_message(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError) as ctx:
                generate_answer("q", [])
        self.assertIn("SUMOPOD_API_KEY", str(ctx.exception))

    def test_llm_answer_hides_internal_chunk_coordinates(self):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return json.dumps({"choices": [{"message": {"content": "Maksimal Rp900.000 [7db293d7-e271-473e-9d0d-431972042f04-1 - Biaya hotel]"}}]}).encode()

        with mock.patch.dict(os.environ, {"SUMOPOD_API_KEY": "sk-test"}, clear=False), \
             mock.patch("generation.llm.urllib.request.urlopen", return_value=FakeResponse()):
            result = self.kb.ask("Berapa maksimal biaya hotel Manager?", use_llm=True)
        self.assertTrue(result["grounded"])
        self.assertEqual(result["answer"], "Maksimal Rp900.000")
        self.assertEqual(result["citations"][0]["chunk_id"], "doc-1-1")
        self.assertEqual(result["citations"][0]["page_number"], 7)


if __name__ == "__main__":
    unittest.main()
