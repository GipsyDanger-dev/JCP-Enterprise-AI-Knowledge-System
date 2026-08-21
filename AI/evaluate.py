"""Evaluate the AI pipeline against a golden question set.

Checks (per slide 12 of the briefing):
1. Retrieval : apakah chunk sumber yang diharapkan masuk top-k?
2. Answer    : apakah jawaban LLM memuat fakta yang diharapkan (--llm)?
3. Citation  : apakah file (+ halaman) di citation benar?
4. No-answer : apakah sistem menolak saat konteks tidak cukup, dengan pesan persis?

Usage:
    python evaluate.py --golden golden_set.json
    python evaluate.py --golden golden_set.json --llm --retriever vector

Exit code 0 = semua kasus PASS; 1 = ada FAIL (cocok buat release gate).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

from knowledge_base import KnowledgeBase, ingest
from retrieval.search import build_retriever
from generation.guardrails import NO_ANSWER
from generation.llm import DEFAULT_MODEL

SCRIPT_DIR = Path(__file__).resolve().parent


def load_golden(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def run_case(kb: KnowledgeBase, case: dict, top_k: int, retriever: str,
             use_llm: bool, model: str) -> tuple[list[tuple[str, bool]], dict]:
    expected = case.get("expected", {})
    question = case["question"]
    checks: list[tuple[str, bool]] = []

    if expected.get("no_answer"):
        result = kb.ask(question, top_k=top_k, use_llm=use_llm, model=model, retriever=retriever)
        ok = result["grounded"] is False and result["answer"] == NO_ANSWER
        checks.append(("no-answer", ok))
        return checks, result

    source = expected.get("source", {})
    filename = source.get("filename")
    page = source.get("page")

    # 1. Retrieval: expected source chunk ada di raw top-k (sebelum threshold).
    engine = build_retriever(kb, mode=retriever)
    raw = [chunk for _, chunk in engine.search(question, top_k)]
    retrieval_ok = any(
        chunk["filename"] == filename and (page is None or chunk["page_number"] == page)
        for chunk in raw
    )
    checks.append(("retrieval", retrieval_ok))

    # 2 & 3: grounded answer + citation dari kontrak ask().
    result = kb.ask(question, top_k=top_k, use_llm=use_llm, model=model, retriever=retriever)
    citation_ok = any(
        c["filename"] == filename and (page is None or c["page_number"] == page)
        for c in result["citations"]
    )
    checks.append(("citation", citation_ok))

    # 2. Answer: hanya dicek saat --llm dipakai (tanpa LLM, answer = teks chunk).
    if "answer_contains" in expected and use_llm:
        answer_ok = all(keyword.lower() in result["answer"].lower() for keyword in expected["answer_contains"])
        checks.append(("answer", answer_ok))

    return checks, result


def main() -> int:
    parser = argparse.ArgumentParser(description="Golden evaluation untuk pipeline AI")
    parser.add_argument("--golden", type=Path, default=SCRIPT_DIR / "golden_set.json")
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--retriever", choices=["auto", "tfidf", "vector"], default="tfidf")
    parser.add_argument("--llm", action="store_true", help="Jalankan check answer memakai SumoPod LLM")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()

    golden = load_golden(args.golden)
    top_k = golden.get("top_k", args.top_k)
    golden_dir = Path(args.golden).resolve().parent

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        for doc in golden["documents"]:
            source = Path(doc["path"])
            if not source.is_absolute():
                source = golden_dir / source
            shutil.copy2(source, tmp_dir / source.name)

        kb_path = tmp_dir / "kb.json"
        ingest(tmp_dir, kb_path)
        kb = KnowledgeBase.load(kb_path)

        print(f"Index    : {len(kb.chunks)} chunk(s), {len(kb.documents)} document(s)")
        print(f"Settings : retriever={args.retriever}, top_k={top_k}, llm={args.llm}, model={args.model}")
        print("-" * 60)

        failures = 0
        for case in golden["cases"]:
            checks, _ = run_case(kb, case, top_k, args.retriever, args.llm, args.model)
            failed = [name for name, ok in checks if not ok]
            status = "PASS" if not failed else "FAIL (" + ", ".join(failed) + ")"
            if failed:
                failures += 1
            print(f"{status:<40} {case['id']}: {case['question']}")

        print("-" * 60)
        total = len(golden["cases"])
        print(f"Result   : {total - failures}/{total} cases passed")
        return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
