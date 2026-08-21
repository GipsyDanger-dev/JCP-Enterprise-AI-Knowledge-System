"""Guardrails: the "no evidence = no answer" rule.

The no-answer response is a fixed contract so the UI and the QA golden
tests can rely on it verbatim.
"""

from __future__ import annotations

from typing import Any

from config import NO_ANSWER


def no_answer_response() -> dict[str, Any]:
    return {"answer": NO_ANSWER, "citations": [], "grounded": False}


def is_no_answer(answer: str) -> bool:
    return answer == NO_ANSWER
