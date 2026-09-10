import io
import unittest
import urllib.error
import urllib.request
from unittest import mock

from provider_errors import ProviderHttpError, ProviderUnavailableError
from provider_retry import read_with_retry

SECRET = "sk-provider-secret-value"


def http_error(status, headers=None):
    return urllib.error.HTTPError(
        "http://provider.invalid/v1/embeddings", status, "boom",
        headers or {"Authorization": f"Bearer {SECRET}"}, io.BytesIO(b"{}"),
    )


class FakeResponse:
    def __init__(self, body=b"ok"):
        self.body = body

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class ReadWithRetryTests(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch("provider_retry.time.sleep")
        self.sleep = patcher.start()
        self.addCleanup(patcher.stop)
        self.request = urllib.request.Request("http://provider.invalid/v1/embeddings")

    def call(self, side_effect, **kwargs):
        options = {"operation": "embeddings", "timeout": 5, "max_attempts": 3}
        options.update(kwargs)
        with mock.patch("provider_retry.urllib.request.urlopen", side_effect=side_effect) as opened:
            try:
                return read_with_retry(self.request, **options), opened.call_count, None
            except (ProviderHttpError, ProviderUnavailableError) as error:
                return None, opened.call_count, error

    def test_transient_status_is_retried_until_it_succeeds(self):
        body, calls, error = self.call([http_error(502), FakeResponse(b"vektor")])
        self.assertEqual(body, b"vektor")
        self.assertEqual(calls, 2)
        self.assertIsNone(error)

    def test_permanent_status_is_not_retried(self):
        _, calls, error = self.call([http_error(401)])
        self.assertEqual(calls, 1)
        self.assertIsInstance(error, ProviderHttpError)
        self.assertEqual(error.status, 401)

    def test_attempts_are_capped(self):
        _, calls, error = self.call([http_error(503)] * 5)
        self.assertEqual(calls, 3)
        self.assertIsInstance(error, ProviderHttpError)

    def test_network_failure_is_retried_then_surfaces(self):
        _, calls, error = self.call([urllib.error.URLError("unreachable")] * 3)
        self.assertEqual(calls, 3)
        self.assertIsInstance(error, ProviderUnavailableError)

    def test_retry_after_header_is_honoured_and_capped(self):
        self.call([http_error(429, {"Retry-After": "900"}), FakeResponse()])
        # Jitter menambah paling banyak 25%, jadi batas 30 dtk tetap terjaga.
        self.assertLessEqual(self.sleep.call_args[0][0], 30 * 1.25)

    def test_garbage_retry_after_falls_back_to_backoff(self):
        self.call([http_error(429, {"Retry-After": "besok pagi"}), FakeResponse()])
        self.assertGreater(self.sleep.call_args[0][0], 0)

    def test_failure_never_carries_the_provider_exception_chain(self):
        """Kontrak keamanan: header Authorization yang dipantulkan provider
        tidak boleh ikut lewat __context__."""
        _, _, error = self.call([http_error(401)])
        self.assertIsNone(error.__context__)
        self.assertNotIn(SECRET, str(error))
        self.assertNotIn("Authorization", str(error))

    def test_slow_failure_is_not_retried_when_it_would_blow_the_budget(self):
        """Timeout penuh tidak diulang: pengguna sudah menunggu selama itu, dan
        percobaan kedua bisa menggantung selama itu lagi."""
        slow = [urllib.error.URLError("timed out")] * 2
        with mock.patch("provider_retry.time.monotonic", side_effect=[0.0, 60.0, 60.0]):
            _, calls, error = self.call(slow, timeout=60, retry_budget=75)
        self.assertEqual(calls, 1)
        self.assertIsInstance(error, ProviderUnavailableError)
        self.sleep.assert_not_called()

    def test_fast_failure_is_still_retried_within_the_budget(self):
        with mock.patch("provider_retry.time.monotonic", side_effect=[0.0, 0.2, 0.2]):
            body, calls, error = self.call(
                [http_error(429), FakeResponse(b"ok")], timeout=5, retry_budget=75,
            )
        self.assertEqual(body, b"ok")
        self.assertEqual(calls, 2)
        self.assertIsNone(error)

    def test_single_attempt_disables_retrying(self):
        _, calls, error = self.call([http_error(503)] * 2, max_attempts=1)
        self.assertEqual(calls, 1)
        self.assertIsInstance(error, ProviderHttpError)


if __name__ == "__main__":
    unittest.main()
