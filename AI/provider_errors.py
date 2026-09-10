"""Safe, stable errors for calls to the external AI provider."""

from __future__ import annotations


class ProviderError(RuntimeError):
    http_status = 502
    public_detail = "AI provider request failed"


class ProviderConfigurationError(ProviderError):
    http_status = 503
    public_detail = "AI provider is not configured"

    def __init__(self, environment_name: str):
        super().__init__(f"{environment_name} is not configured")


class ProviderHttpError(ProviderError):
    def __init__(self, operation: str, status: int):
        super().__init__(f"AI provider {operation} request failed (HTTP {status})")
        self.status = status
        # Status upstream-nya ikut ke pesan publik: tanpa ini, 401 (key salah),
        # 429 (rate limit) dan 402 (kuota habis) semuanya terbaca sebagai satu
        # kalimat generik, padahal penanganannya berbeda total. Hanya angkanya
        # yang ikut — `operation` sengaja tidak, karena bisa memuat detail
        # request, sedangkan int tidak bisa membawa kredensial.
        self.public_detail = f"AI provider request failed (upstream HTTP {status})"


class ProviderUnavailableError(ProviderError):
    http_status = 503
    public_detail = "AI provider is unavailable"

    def __init__(self, operation: str):
        super().__init__(f"AI provider {operation} is unavailable")


class ProviderResponseError(ProviderError):
    public_detail = "AI provider returned an invalid response"

    def __init__(self, operation: str):
        super().__init__(f"AI provider {operation} returned an invalid response")
