"""Grounded answer generation via SumoPod (OpenAI-compatible chat).

The LLM only rewrites the retrieved chunks into a natural answer; it never
produces the citations (see generation/citations.py).
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from config import DEFAULT_MODEL, SUMOPOD_API_KEY_ENV, SUMOPOD_BASE_URL
from generation.prompts import build_messages


def generate_answer(query: str, matches: list[tuple[float, dict[str, Any]]],
                    model: str = DEFAULT_MODEL, api_key: str | None = None) -> str:
    """Ask a SumoPod LLM to answer `query` grounded only on the given chunks."""
    key = api_key or os.environ.get(SUMOPOD_API_KEY_ENV)
    if not key:
        raise RuntimeError(
            f"{SUMOPOD_API_KEY_ENV} is not set. Run e.g.: "
            "$env:SUMOPOD_API_KEY=\"sk-...\" in the terminal before using --llm."
        )
    payload = json.dumps({
        "model": model,
        "messages": build_messages(query, matches),
        "temperature": 0.2,
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{SUMOPOD_BASE_URL}/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"SumoPod API error {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"SumoPod API unreachable: {exc.reason}") from exc
    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected SumoPod response: {json.dumps(data)[:300]}") from exc
