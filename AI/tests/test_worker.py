import json
import unittest
from pathlib import Path
from urllib.error import HTTPError
from unittest import mock

import worker


JOB_ID = "11111111-1111-4111-8111-111111111111"
VERSION_ID = "22222222-2222-4222-8222-222222222222"


class FakeResponse:
    def __init__(self, body=b"{}"):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.body


class RecordingOpener:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def __call__(self, request, timeout):
        self.requests.append((request, timeout))
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        return FakeResponse(response)


class FakeClient:
    def __init__(self, job, content=b"document bytes"):
        self.job = job
        self.content = content
        self.downloads = []
        self.reports = []

    def claim(self):
        return self.job

    def download_file(self, job_id):
        self.downloads.append(job_id)
        return self.content

    def report_result(self, job_id, status, error_message=None):
        self.reports.append((job_id, status, error_message))


def claimed_job(filename="policy.pdf"):
    return worker.ClaimedJob(JOB_ID, VERSION_ID, filename)


class WorkerConfigTests(unittest.TestCase):
    def test_requires_all_connection_environment(self):
        base = {
            "BACKEND_URL": "http://backend:8000",
            "WORKER_TOKEN": "worker-secret",
            "DATABASE_URL": "postgresql://db/service",
            "SUMOPOD_API_KEY": "api-secret",
        }
        for missing in ("BACKEND_URL", "WORKER_TOKEN", "DATABASE_URL", "SUMOPOD_API_KEY"):
            with self.subTest(missing=missing):
                values = dict(base)
                values.pop(missing)
                with self.assertRaisesRegex(worker.WorkerError, missing):
                    worker.WorkerConfig.from_env(values)

    def test_poll_delay_is_bounded(self):
        base = {
            "BACKEND_URL": "http://backend:8000",
            "WORKER_TOKEN": "worker-secret",
            "DATABASE_URL": "postgresql://db/service",
            "SUMOPOD_API_KEY": "api-secret",
        }
        for value in ("0", "61", "not-a-number"):
            with self.subTest(value=value), self.assertRaises(worker.WorkerError):
                worker.WorkerConfig.from_env({**base, "WORKER_POLL_SECONDS": value})


class BackendClientTests(unittest.TestCase):
    def test_claim_404_is_idle(self):
        error = HTTPError("http://backend/claim", 404, "not found", {}, None)
        opener = RecordingOpener([error])
        client = worker.BackendClient("http://backend:8000", "secret", opener=opener)
        self.assertIsNone(client.claim())

    def test_claim_non_404_is_failure(self):
        error = HTTPError("http://backend/claim", 500, "server error", {}, None)
        client = worker.BackendClient(
            "http://backend:8000",
            "secret",
            opener=RecordingOpener([error]),
        )
        with self.assertRaisesRegex(worker.BackendRequestError, "HTTP 500"):
            client.claim()

    def test_claim_parses_contract_and_sends_worker_token(self):
        body = json.dumps({
            "id": JOB_ID,
            "version": {"id": VERSION_ID, "originalFilename": "policy.pdf"},
        }).encode()
        opener = RecordingOpener([body])
        client = worker.BackendClient("http://backend:8000/", "worker-secret", opener=opener)

        job = client.claim()

        self.assertEqual(job, claimed_job())
        request, timeout = opener.requests[0]
        self.assertEqual(request.method, "POST")
        self.assertEqual(
            request.full_url,
            "http://backend:8000/internal/processing-jobs/claim",
        )
        self.assertEqual(request.get_header("X-worker-token"), "worker-secret")
        self.assertEqual(timeout, worker.HTTP_TIMEOUT_SECONDS)

    def test_result_payload_matches_backend_contract(self):
        opener = RecordingOpener([b"{}"])
        client = worker.BackendClient("http://backend:8000", "secret", opener=opener)

        client.report_result(JOB_ID, "FAILED", "parser failed")

        request, _ = opener.requests[0]
        self.assertEqual(request.method, "PATCH")
        self.assertEqual(
            json.loads(request.data),
            {"status": "FAILED", "errorMessage": "parser failed"},
        )


class ProcessingWorkerTests(unittest.TestCase):
    def test_processes_one_exactly_named_temp_file_and_cleans_it(self):
        client = FakeClient(claimed_job(), content=b"pdf content")
        store = object()
        observed = {}

        def fake_ingest(input_dir, actual_store, version_id, embed, api_key):
            observed["input_dir"] = Path(input_dir)
            files = [path for path in Path(input_dir).iterdir() if path.is_file()]
            observed["files"] = [path.name for path in files]
            observed["content"] = files[0].read_bytes()
            observed["args"] = (actual_store, version_id, embed, api_key)

        processed = worker.ProcessingWorker(
            client,
            store,
            api_key="api-placeholder",
            ingest=fake_ingest,
        ).run_once()

        self.assertTrue(processed)
        self.assertEqual(observed["files"], ["policy.pdf"])
        self.assertEqual(observed["content"], b"pdf content")
        self.assertEqual(observed["args"], (store, VERSION_ID, True, "api-placeholder"))
        self.assertFalse(observed["input_dir"].exists())
        self.assertEqual(client.downloads, [JOB_ID])
        self.assertEqual(client.reports, [(JOB_ID, "COMPLETED", None)])

    def test_rejects_unsafe_filename_before_download(self):
        for filename in (".", "..", "../policy.pdf", "folder/policy.pdf", "folder\\policy.pdf", "bad\x00.pdf"):
            with self.subTest(filename=filename):
                client = FakeClient(claimed_job(filename))
                ingest = mock.Mock()
                worker.ProcessingWorker(client, object(), ingest=ingest).run_once()
                self.assertEqual(client.downloads, [])
                self.assertFalse(ingest.called)
                self.assertEqual(client.reports[0][1], "FAILED")

    def test_ingestion_failure_is_sanitized_reported_and_temp_is_removed(self):
        client = FakeClient(claimed_job())
        temp_path = None
        config = worker.WorkerConfig.from_env({
            "BACKEND_URL": "http://backend:8000",
            "WORKER_TOKEN": "worker-secret",
            "DATABASE_URL": "postgresql://user:db-secret@postgres/db",
            "SUMOPOD_API_KEY": "api-secret",
        })

        def fail_ingest(input_dir, *_args, **_kwargs):
            nonlocal temp_path
            temp_path = Path(input_dir)
            raise RuntimeError("api-secret and db-secret must not escape")

        worker.ProcessingWorker(
            client,
            object(),
            secret_values=config.secret_values(),
            ingest=fail_ingest,
        ).run_once()

        self.assertIsNotNone(temp_path)
        self.assertFalse(temp_path.exists())
        job_id, status, message = client.reports[0]
        self.assertEqual((job_id, status), (JOB_ID, "FAILED"))
        self.assertIn("[REDACTED]", message)
        self.assertNotIn("api-secret", message)
        self.assertNotIn("db-secret", message)
        self.assertLessEqual(len(message), worker.MAX_ERROR_MESSAGE_LENGTH)

    def test_idle_claim_does_not_touch_store(self):
        client = FakeClient(None)
        ingest = mock.Mock()
        self.assertFalse(worker.ProcessingWorker(client, object(), ingest=ingest).run_once())
        ingest.assert_not_called()
        self.assertEqual(client.reports, [])

    def test_result_reporting_retries_with_bounded_backoff(self):
        client = FakeClient(claimed_job())
        attempts = []
        sleeps = []

        def flaky_report(job_id, status, error_message=None):
            attempts.append((job_id, status, error_message))
            if len(attempts) < 3:
                raise worker.BackendRequestError("PATCH", "/result", 503)

        client.report_result = flaky_report
        worker.ProcessingWorker(
            client,
            object(),
            sleeper=sleeps.append,
            ingest=mock.Mock(),
        ).run_once()

        self.assertEqual(len(attempts), 3)
        self.assertEqual(sleeps, [1, 2])
        self.assertEqual(attempts[-1][1], "COMPLETED")


if __name__ == "__main__":
    unittest.main()
