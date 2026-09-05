import unittest
from unittest import mock

try:
    from fastapi.testclient import TestClient
    import http_api
    from provider_errors import ProviderConfigurationError, ProviderHttpError
    HAS_DEPS = True
except ImportError:  # pragma: no cover - optional dependencies
    HAS_DEPS = False


WORKER_TOKEN = "test-worker-token"


@unittest.skipUnless(HAS_DEPS, "fastapi/httpx not installed (pip install -r requirements.txt)")
class HttpApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Semua endpoint selain /health butuh X-Worker-Token, jadi client default
        # membawanya; autentikasi diuji terpisah di WorkerTokenTests.
        token_env = mock.patch.dict("os.environ", {"WORKER_TOKEN": WORKER_TOKEN})
        token_env.start()
        cls.addClassCleanup(token_env.stop)
        cls.client = TestClient(http_api.app, headers={"X-Worker-Token": WORKER_TOKEN})

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
                raise ProviderConfigurationError("AI_PROVIDER_API_KEY")

        with mock.patch("http_api.current_store", return_value=FailingStore()):
            response = self.client.post("/ask", json={"query": "policy"})

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"detail": "AI provider is not configured"})


@unittest.skipUnless(HAS_DEPS, "fastapi/httpx not installed (pip install -r requirements.txt)")
class WorkerTokenTests(unittest.TestCase):
    """AI service hanya boleh dipanggil pemegang WORKER_TOKEN (backend)."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(http_api.app)

    def test_health_stays_public(self):
        with mock.patch.dict("os.environ", {"WORKER_TOKEN": WORKER_TOKEN}):
            response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)

    def test_request_without_token_is_401(self):
        with mock.patch.dict("os.environ", {"WORKER_TOKEN": WORKER_TOKEN}):
            response = self.client.post("/ask", json={"query": "policy"})
        self.assertEqual(response.status_code, 401)

    def test_request_with_wrong_token_is_401(self):
        with mock.patch.dict("os.environ", {"WORKER_TOKEN": WORKER_TOKEN}):
            response = self.client.get("/documents", headers={"X-Worker-Token": "salah"})
        self.assertEqual(response.status_code, 401)

    def test_delete_without_token_is_401(self):
        with mock.patch.dict("os.environ", {"WORKER_TOKEN": WORKER_TOKEN}):
            response = self.client.delete("/documents/sop_perjalanan.txt")
        self.assertEqual(response.status_code, 401)

    def test_unconfigured_token_fails_closed(self):
        with mock.patch.dict("os.environ", {"WORKER_TOKEN": "  "}):
            response = self.client.get("/documents", headers={"X-Worker-Token": WORKER_TOKEN})
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
