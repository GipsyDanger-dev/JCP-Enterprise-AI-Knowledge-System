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


class ProviderUnavailableError(ProviderError):
    http_status = 503
    public_detail = "AI provider is unavailable"

    def __init__(self, operation: str):
        super().__init__(f"AI provider {operation} is unavailable")


class ProviderResponseError(ProviderError):
    public_detail = "AI provider returned an invalid response"

    def __init__(self, operation: str):
        super().__init__(f"AI provider {operation} returned an invalid response")
