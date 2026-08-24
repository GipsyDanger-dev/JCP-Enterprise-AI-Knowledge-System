"""A small, deterministic fallback when an LLM is not configured.

The fallback deliberately extracts the sentence with the strongest overlap with
the question instead of returning an entire retrieved chunk.  It keeps local
development useful while preserving the grounded-answer contract.
"""

from __future__ import annotations

import re

from retrieval.tfidf import tokens


STOP_WORDS = {
    "apa", "apakah", "atau", "bagaimana", "berapa", "dan", "dari", "di", "dengan",
    "ini", "itu", "ke", "kapan", "karena", "yang", "untuk", "pada", "saya", "sebuah",
    "tentang", "the", "sebelum", "sesudah",
}


def _table_duration_answer(query_terms: set[str], sentence: str) -> str:
    """Extract a compact table row ending in a duration such as ``3 hari kerja``."""
    words = sentence.split()
    candidates: list[tuple[tuple[int, float, int], str]] = []
    for index, word in enumerate(words[:-1]):
        number = word.rstrip(".,")
        unit = words[index + 1].lower().rstrip(".,")
        if not re.fullmatch(r"\d+(?:[.,]\d+)?", number) or unit not in {"hari", "bulan"}:
            continue
        end = min(index + 3, len(words)) if index + 2 < len(words) and words[index + 2].lower() == "kerja" else index + 2
        for start in range(max(0, index - 7), index):
            candidate = " ".join(words[start:end])
            overlap, ratio = _score_terms(query_terms, candidate)
            if overlap:
                candidates.append(((overlap, ratio, start), candidate))
    return max(candidates, default=((0, 0.0, 0), ""), key=lambda item: item[0])[1]


def _score_terms(query_terms: set[str], sentence: str) -> tuple[int, float]:
    overlap = query_terms & set(tokens(sentence))
    return len(overlap), len(overlap) / max(len(query_terms), 1)


def extractive_answer(query: str, text: str) -> str:
    """Return the most question-relevant sentence in *text*.

    This is intentionally conservative: an empty result lets the caller emit
    the normal no-answer response rather than returning arbitrary prose.
    """
    query_terms = {token for token in tokens(query) if token not in STOP_WORDS}
    if not query_terms:
        return ""

    normalized = re.sub(r"\s+", " ", text).strip()
    sentences = [part.strip(" -•\t") for part in re.split(r"(?<=[.!?])\s+", normalized) if part.strip()]
    if not sentences:
        return ""

    def score(sentence: str) -> tuple[int, float]:
        return _score_terms(query_terms, sentence)

    best = max(sentences, key=score)
    overlap_count, _ = score(best)
    if overlap_count == 0:
        return ""

    # PDF tables are often extracted as one very long "sentence".  Return a
    # compact window around the densest cluster of question terms instead.
    if len(best) > 350:
        duration_row = _table_duration_answer(query_terms, best)
        if duration_row:
            return duration_row.rstrip()
        words = best.split()
        window_size = 14
        candidates = []
        for start in range(max(len(words) - window_size + 1, 1)):
            window = " ".join(words[start:start + window_size])
            candidates.append((score(window), start, window))
        # Later tied windows usually begin at the table row label itself (for
        # example "Cuti Menikah") instead of a preceding row's trailing text.
        _, _, best = max(candidates, key=lambda item: (item[0][0], item[0][1], item[1]))

    return re.sub(r"^\d+\s+", "", best).rstrip()
