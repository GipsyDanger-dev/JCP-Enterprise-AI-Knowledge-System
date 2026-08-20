import unittest

from fastapi.testclient import TestClient

import http_api


class HttpApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(http_api.app)

    def test_health(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_ask_returns_grounded_answer(self):
        response = self.client.post("/ask", json={"query": "Berapa maksimal biaya hotel level Manager?"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["grounded"])
        self.assertTrue(body["citations"])
        self.assertEqual(body["citations"][0]["filename"], "sop_perjalanan.txt")

    def test_ask_no_answer_for_unknown(self):
        response = self.client.post("/ask", json={"query": "prosedur pengajuan cuti tahunan"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["grounded"])
        self.assertEqual(body["answer"], "Informasi tidak ditemukan pada dokumen yang tersedia.")

    def test_ask_empty_query_is_400(self):
        response = self.client.post("/ask", json={"query": "   "})
        self.assertEqual(response.status_code, 400)

    def test_documents_list(self):
        response = self.client.get("/documents")
        self.assertEqual(response.status_code, 200)
        names = [doc["filename"] for doc in response.json()]
        self.assertIn("sop_perjalanan.txt", names)

    def test_delete_missing_document_is_404(self):
        response = self.client.delete("/documents/nggak_ada.pdf")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
