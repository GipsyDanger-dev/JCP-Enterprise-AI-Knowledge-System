"""Polling worker that connects Backend processing jobs to the AI pipeline."""

from __future__ import annotations

import json
import logging
import os
import re
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen
from uuid import UUID

if TYPE_CHECKING:
    from store import PgVectorStore

LOGGER = logging.getLogger("ai-worker")
DEFAULT_POLL_SECONDS = 5.0
MIN_POLL_SECONDS = 1.0
MAX_POLL_SECONDS = 60.0
HTTP_TIMEOUT_SECONDS = 60.0
MAX_ERROR_MESSAGE_LENGTH = 1000
RESULT_REPORT_ATTEMPTS = 3
MAX_RESULT_RETRY_DELAY_SECONDS = 4.0


class WorkerError(RuntimeError):
    """Base error for configuration, protocol, and processing failures."""


class BackendRequestError(WorkerError):
    def __init__(self, method: str, path: str, status: int | None = None):
        detail = f"backend request failed: {method} {path}"
        if status is not None:
            detail += f" (HTTP {status})"
        super().__init__(detail)
        self.status = status


@dataclass(frozen=True)
class WorkerConfig:
    backend_url: str
    worker_token: str
    database_url: str
    sumopod_api_key: str
    poll_seconds: float

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "WorkerConfig":
        values = os.environ if env is None else env
        required: dict[str, str] = {}
        for name in ("BACKEND_URL", "WORKER_TOKEN", "DATABASE_URL", "SUMOPOD_API_KEY"):
            value = values.get(name, "").strip()
            if not value:
                raise WorkerError(f"required environment variable is missing: {name}")
            required[name] = value

        backend_url = required["BACKEND_URL"].rstrip("/")
        parsed_backend = urlsplit(backend_url)
        if parsed_backend.scheme not in {"http", "https"} or not parsed_backend.netloc:
            raise WorkerError("BACKEND_URL must be an absolute http(s) URL")

        raw_poll_seconds = values.get("WORKER_POLL_SECONDS", str(DEFAULT_POLL_SECONDS))
        try:
            poll_seconds = float(raw_poll_seconds)
        except ValueError as error:
            raise WorkerError("WORKER_POLL_SECONDS must be a number") from error
        if not MIN_POLL_SECONDS <= poll_seconds <= MAX_POLL_SECONDS:
            raise WorkerError(
                f"WORKER_POLL_SECONDS must be between {MIN_POLL_SECONDS:g} "
                f"and {MAX_POLL_SECONDS:g}"
            )

        return cls(
            backend_url=backend_url,
            worker_token=required["WORKER_TOKEN"],
            database_url=required["DATABASE_URL"],
            sumopod_api_key=required["SUMOPOD_API_KEY"],
            poll_seconds=poll_seconds,
        )

    def secret_values(self) -> tuple[str, ...]:
        secrets = [self.worker_token, self.database_url]
        secrets.append(self.sumopod_api_key)
        database_password = urlsplit(self.database_url).password
        if database_password:
            secrets.append(database_password)
            secrets.append(unquote(database_password))
        return tuple(secret for secret in secrets if secret)


@dataclass(frozen=True)
class ClaimedJob:
    id: str
    document_version_id: str
    original_filename: str

    @classmethod
    def from_payload(cls, payload: Any) -> "ClaimedJob":
        if not isinstance(payload, dict) or not isinstance(payload.get("version"), dict):
            raise WorkerError("claim response does not contain a version object")
        return cls(
            id=_uuid_string(payload.get("id"), "claim.id"),
            document_version_id=_uuid_string(payload["version"].get("id"), "claim.version.id"),
            original_filename=_required_string(
                payload["version"].get("originalFilename"),
                "claim.version.originalFilename",
            ),
        )


def _required_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise WorkerError(f"{field} must be a non-empty string")
    return value


def _uuid_string(value: Any, field: str) -> str:
    text = _required_string(value, field)
    try:
        parsed = UUID(text)
    except ValueError as error:
        raise WorkerError(f"{field} must be a UUID") from error
    return str(parsed)


def validate_original_filename(filename: str) -> str:
    """Accept a safe basename without changing the backend-owned filename."""
    if (
        not filename
        or filename in {".", ".."}
        or "/" in filename
        or "\\" in filename
        or "\x00" in filename
        or any(ord(character) < 32 for character in filename)
        or len(filename.encode("utf-8")) > 255
    ):
        raise WorkerError("claimed originalFilename is not a safe basename")
    return filename


def sanitize_error(error: BaseException, secrets: tuple[str, ...] = ()) -> str:
    message = f"{type(error).__name__}: {error}"
    for secret in sorted(set(secrets), key=len, reverse=True):
        message = message.replace(secret, "[REDACTED]")
    message = re.sub(r"[\x00-\x1f\x7f]+", " ", message)
    message = " ".join(message.split())
    return (message or type(error).__name__)[:MAX_ERROR_MESSAGE_LENGTH]


def ingest_document(
    input_dir: Path,
    store: "PgVectorStore",
    document_version_id: str,
    *,
    embed: bool,
    api_key: str | None,
) -> list[dict[str, Any]]:
    from store import ingest_to_pg

    return ingest_to_pg(
        input_dir,
        store,
        document_version_id,
        embed=embed,
        api_key=api_key,
    )


class BackendClient:
    def __init__(
        self,
        backend_url: str,
        worker_token: str,
        opener: Callable[..., Any] = urlopen,
        timeout: float = HTTP_TIMEOUT_SECONDS,
    ):
        self.backend_url = backend_url.rstrip("/")
        self.worker_token = worker_token
        self.opener = opener
        self.timeout = timeout

    def claim(self) -> ClaimedJob | None:
        try:
            payload = self._json_request("POST", "/internal/processing-jobs/claim")
        except BackendRequestError as error:
            if error.status == 404:
                return None
            raise
        return ClaimedJob.from_payload(payload)

    def download_file(self, job_id: str) -> bytes:
        content = self._request("GET", f"/internal/processing-jobs/{job_id}/file")
        if not content:
            raise WorkerError("backend returned an empty document file")
        return content

    def report_result(self, job_id: str, status: str, error_message: str | None = None) -> None:
        if status not in {"COMPLETED", "FAILED"}:
            raise ValueError("status must be COMPLETED or FAILED")
        payload: dict[str, str] = {"status": status}
        if error_message is not None:
            payload["errorMessage"] = error_message
        self._json_request("PATCH", f"/internal/processing-jobs/{job_id}/result", payload)

    def _json_request(
        self,
        method: str,
        path: str,
        payload: Mapping[str, Any] | None = None,
    ) -> Any:
        body = self._request(method, path, payload)
        try:
            return json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise WorkerError(f"backend returned invalid JSON for {method} {path}") from error

    def _request(
        self,
        method: str,
        path: str,
        payload: Mapping[str, Any] | None = None,
    ) -> bytes:
        data = None
        headers = {
            "Accept": "application/json",
            "X-Worker-Token": self.worker_token,
        }
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        elif method == "POST":
            data = b""

        request = Request(
            f"{self.backend_url}{path}",
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with self.opener(request, timeout=self.timeout) as response:
                return response.read()
        except HTTPError as error:
            raise BackendRequestError(method, path, error.code) from error
        except (URLError, TimeoutError, OSError) as error:
            raise BackendRequestError(method, path) from error


class ProcessingWorker:
    def __init__(
        self,
        client: BackendClient,
        store: "PgVectorStore",
        *,
        api_key: str | None = None,
        poll_seconds: float = DEFAULT_POLL_SECONDS,
        secret_values: tuple[str, ...] = (),
        sleeper: Callable[[float], None] = time.sleep,
        ingest: Callable[..., Any] = ingest_document,
    ):
        self.client = client
        self.store = store
        self.api_key = api_key
        self.poll_seconds = poll_seconds
        self.secret_values = secret_values
        self.sleeper = sleeper
        self.ingest = ingest

    def run_once(self) -> bool:
        job = self.client.claim()
        if job is None:
            return False

        try:
            self._process(job)
        except Exception as error:
            safe_error = sanitize_error(error, self.secret_values)
            LOGGER.error("Processing job %s failed: %s", job.id, safe_error)
            self._report_result(job.id, "FAILED", safe_error)
            return True

        self._report_result(job.id, "COMPLETED")
        LOGGER.info("Processing job %s completed", job.id)
        return True

    def _report_result(
        self,
        job_id: str,
        status: str,
        error_message: str | None = None,
    ) -> None:
        for attempt in range(1, RESULT_REPORT_ATTEMPTS + 1):
            try:
                self.client.report_result(job_id, status, error_message)
                return
            except Exception:
                if attempt == RESULT_REPORT_ATTEMPTS:
                    raise
                delay = min(2 ** (attempt - 1), MAX_RESULT_RETRY_DELAY_SECONDS)
                LOGGER.warning(
                    "Result report for job %s failed; retrying (%s/%s)",
                    job_id,
                    attempt + 1,
                    RESULT_REPORT_ATTEMPTS,
                )
                self.sleeper(delay)

    def _process(self, job: ClaimedJob) -> None:
        filename = validate_original_filename(job.original_filename)
        content = self.client.download_file(job.id)
        with tempfile.TemporaryDirectory(prefix="jcp-ai-worker-") as temp_path:
            input_dir = Path(temp_path)
            (input_dir / filename).write_bytes(content)
            self.ingest(
                input_dir,
                self.store,
                job.document_version_id,
                embed=True,
                api_key=self.api_key,
            )

    def run_forever(self) -> None:
        LOGGER.info("AI processing worker started")
        while True:
            try:
                processed = self.run_once()
            except Exception as error:
                LOGGER.error(
                    "Worker polling cycle failed: %s",
                    sanitize_error(error, self.secret_values),
                )
                processed = False
            if not processed:
                self.sleeper(self.poll_seconds)


def main() -> None:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    config = WorkerConfig.from_env()
    from store import PgVectorStore

    client = BackendClient(config.backend_url, config.worker_token)
    store = PgVectorStore(config.database_url)
    ProcessingWorker(
        client,
        store,
        api_key=config.sumopod_api_key,
        poll_seconds=config.poll_seconds,
        secret_values=config.secret_values(),
    ).run_forever()


if __name__ == "__main__":
    main()
