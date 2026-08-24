import io
import unittest
import urllib.error
from unittest import mock

from generation.llm import generate_answer
from provider_errors import (
    ProviderConfigurationError,
    ProviderHttpError,
    ProviderResponseError,
    ProviderUnavailableError,
)
from retrieval.embeddings import embed_texts


SECRET = "sk-provider-secret-value"


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.body


def echoed_http_error(path):
    body = f'{{"error":"Authorization: Bearer {SECRET}"}}'.encode()
    return urllib.error.HTTPError(
        f"https://provider.invalid/{path}",
        401,
        "Unauthorized",
        {},
        io.BytesIO(body),
    )


class ProviderRedactionTests(unittest.TestCase):
    def assert_safe(self, error):
        rendered = str(error)
        self.assertNotIn(SECRET, rendered)
        self.assertNotIn("Authorization", rendered)
        self.assertNotIn("Bearer", rendered)
        self.assertIsNone(error.__context__)

    def test_embedding_http_error_discards_echoed_authorization(self):
        with mock.patch(
            "retrieval.embeddings.urllib.request.urlopen",
            side_effect=echoed_http_error("embeddings"),
        ):
            with self.assertRaises(ProviderHttpError) as caught:
                embed_texts(["policy"], api_key=SECRET)

        self.assertEqual(caught.exception.status, 401)
        self.assert_safe(caught.exception)

    def test_chat_http_error_discards_echoed_authorization(self):
        with mock.patch(
            "generation.llm.urllib.request.urlopen",
            side_effect=echoed_http_error("chat/completions"),
        ):
            with self.assertRaises(ProviderHttpError) as caught:
                generate_answer("question", [], api_key=SECRET)

        self.assertEqual(caught.exception.status, 401)
        self.assert_safe(caught.exception)

    def test_invalid_provider_body_is_not_copied_to_exception(self):
        response = FakeResponse(f'{{"secret":"{SECRET}"'.encode())
        with mock.patch(
            "retrieval.embeddings.urllib.request.urlopen",
            return_value=response,
        ):
            with self.assertRaises(ProviderResponseError) as caught:
                embed_texts(["policy"], api_key=SECRET)

        self.assert_safe(caught.exception)

    def test_network_reason_is_not_copied_to_exception(self):
        provider_error = urllib.error.URLError(
            f"connection failed with Authorization: Bearer {SECRET}"
        )
        with mock.patch(
            "generation.llm.urllib.request.urlopen",
            side_effect=provider_error,
        ):
            with self.assertRaises(ProviderUnavailableError) as caught:
                generate_answer("question", [], api_key=SECRET)

        self.assert_safe(caught.exception)

    def test_public_error_contract_has_stable_status_and_detail(self):
        http_error = ProviderHttpError("chat", 401)
        config_error = ProviderConfigurationError("SUMOPOD_API_KEY")

        self.assertEqual(http_error.http_status, 502)
        self.assertEqual(http_error.public_detail, "AI provider request failed")
        self.assertEqual(config_error.http_status, 503)
        self.assertEqual(config_error.public_detail, "AI provider is not configured")


if __name__ == "__main__":
    unittest.main()
