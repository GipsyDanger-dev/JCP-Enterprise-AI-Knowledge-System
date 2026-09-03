import tempfile
import unittest
from pathlib import Path
from unittest import mock

try:
    from fastapi.testclient import TestClient
    import http_api
    from provider_errors import ProviderConfigurationError, ProviderHttpError
    HAS_DEPS = True
except ImportError:  # pragma: no cover - optional dependencies
    HAS_DEPS = False


@unittest.skipUnless(HAS_DEPS, "fastapi/httpx not installed (pip install -r requirements.txt)")
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
        self.assertEqual(body["citations"], [])

    def test_ask_rejects_out_of_scope_math_without_citations(self):
        response = self.client.post("/ask", json={"query": "1+1 berapa"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["grounded"])
        self.assertIn("hanya dapat membantu", body["answer"])
        self.assertEqual(body["citations"], [])

    def test_ask_rejects_general_person_question_without_citations(self):
        response = self.client.post("/ask", json={"query": "siapa itu elon musk"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["grounded"])
        self.assertIn("hanya dapat membantu", body["answer"])
        self.assertEqual(body["citations"], [])

    def test_ask_empty_query_is_400(self):
        response = self.client.post("/ask", json={"query": "   "})
        self.assertEqual(response.status_code, 400)

    def test_contextualize_query_keeps_follow_up_topic(self):
        query = http_api.contextualize_query(
            "Berarti karyawan biasa tidak bisa ya?",
            "kebijakan cuti dan izin karyawan",
        )
        self.assertIn("kebijakan cuti dan izin karyawan", query)
        self.assertIn("Berarti karyawan biasa tidak bisa ya?", query)

    def test_documents_list(self):
        response = self.client.get("/documents")
        self.assertEqual(response.status_code, 200)
        names = [doc["filename"] for doc in response.json()]
        self.assertIn("sop_perjalanan.txt", names)

    def test_delete_missing_document_is_404(self):
        response = self.client.delete("/documents/nggak_ada.pdf")
        self.assertEqual(response.status_code, 404)

    def test_ingest_file_multipart_indexes_and_answers(self):
        with tempfile.TemporaryDirectory() as tmp:
            index = Path(tmp) / "kb.json"
            with mock.patch.object(http_api, "DEFAULT_INDEX", index):
                doc = "sop_upload_test.txt"
                content = b"Karyawan berhak atas cuti tahunan 12 hari kerja setelah bekerja 1 tahun."
                response = self.client.post(
                    "/ingest-file",
                    files={"file": (doc, content, "text/plain")},
                    data={"embed": "false"},
                )
                self.assertEqual(response.status_code, 200)
                body = response.json()
                self.assertEqual(body["store"], "json")
                self.assertEqual(body["documents"][0]["filename"], doc)

                ask = self.client.post("/ask", json={"query": "Berapa hari cuti tahunan karyawan?"})
                self.assertEqual(ask.status_code, 200)
                ask_body = ask.json()
                self.assertTrue(ask_body["grounded"])
                self.assertIn("12 hari", ask_body["answer"])

    def test_ingest_file_rejects_empty_content(self):
        response = self.client.post(
            "/ingest-file",
            files={"file": ("empty.txt", b"", "text/plain")},
            data={"embed": "false"},
        )
        self.assertEqual(response.status_code, 400)

    def test_provider_http_error_maps_to_safe_502(self):
        secret = "sk-provider-secret-value"

        class FailingStore:
            def ask(self, *_args, **_kwargs):
                raise ProviderHttpError(f"chat Authorization: Bearer {secret}", 401)

        with mock.patch("http_api.current_store", return_value=FailingStore()):
            response = self.client.post("/ask", json={"query": "policy"})

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {"detail": "AI provider request failed"})
        self.assertNotIn(secret, response.text)
        self.assertNotIn("Authorization", response.text)

    def test_missing_provider_configuration_maps_to_safe_503(self):
        class FailingStore:
            def ask(self, *_args, **_kwargs):
                raise ProviderConfigurationError("SUMOPOD_API_KEY")

        with mock.patch("http_api.current_store", return_value=FailingStore()):
            response = self.client.post("/ask", json={"query": "policy"})

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"detail": "AI provider is not configured"})


if __name__ == "__main__":
    unittest.main()
