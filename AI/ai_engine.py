"""Standalone retrieval engine CLI + public API for the AI engineer milestone.

Commands:
    ingest  <dir>     parse -> chunk -> (--embed embeddings) -> index
    ask     <query>   retrieval -> answer + citation (--llm via SumoPod)
    delete  <file>    remove a document and its chunks/embeddings
    docs              list indexed documents with their versions

The module re-exports the public API used by tests and other programmers:
KnowledgeBase, chunk_pages, generate_answer, read_document.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from knowledge_base import KnowledgeBase, ingest
from ingestion.parsers import read_document
from ingestion.chunking import chunk_pages
from generation.llm import DEFAULT_MODEL, generate_answer

# Defaults resolve relative to this script so the CLI works from the repo
# root (python AI/ai_engine.py ...) or from inside the AI/ folder.
PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_INDEX = PROJECT_DIR / "knowledge_base.json"


def main() -> int:
    parser = argparse.ArgumentParser(description="Standalone grounded retrieval engine (AI Engineer milestone)")
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest_parser = subparsers.add_parser("ingest")
    ingest_parser.add_argument("input_dir", type=Path)
    ingest_parser.add_argument("--output", type=Path, default=DEFAULT_INDEX)
    ingest_parser.add_argument("--embed", action="store_true", help="Generate and store embeddings via SumoPod")
    ingest_parser.add_argument("--embed-model", default=None, help="Embedding model id (default: text-embedding-3-small)")

    ask_parser = subparsers.add_parser("ask")
    ask_parser.add_argument("query")
    ask_parser.add_argument("--index", type=Path, default=DEFAULT_INDEX)
    ask_parser.add_argument("--top-k", type=int, default=5)
    ask_parser.add_argument("--llm", action="store_true", help="Answer with a SumoPod LLM grounded on retrieved chunks")
    ask_parser.add_argument("--model", default=DEFAULT_MODEL, help="SumoPod chat model id (default: %(default)s)")
    ask_parser.add_argument("--retriever", choices=["auto", "tfidf", "vector"], default="auto",
                            help="Retrieval mode (default: auto -> vector if embeddings stored, else TF-IDF)")
    ask_parser.add_argument("--doc", default=None,
                            help="Only search chunks from this document (filename, case-insensitive substring)")
    ask_parser.add_argument("--section", default=None,
                            help="Only search chunks in this section (case-insensitive substring)")

    delete_parser = subparsers.add_parser("delete")
    delete_parser.add_argument("filename")
    delete_parser.add_argument("--index", type=Path, default=DEFAULT_INDEX)

    docs_parser = subparsers.add_parser("docs")
    docs_parser.add_argument("--index", type=Path, default=DEFAULT_INDEX)

    args = parser.parse_args()
    try:
        if args.command == "ingest":
            ingest(args.input_dir, args.output, embed=args.embed, embed_model=args.embed_model)
        elif args.command == "ask":
            filters = {"filename": args.doc, "section_title": args.section} if (args.doc or args.section) else None
            result = KnowledgeBase.load(args.index).ask(
                args.query, args.top_k, use_llm=args.llm, model=args.model, retriever=args.retriever,
                filters=filters,
            )
            print(json.dumps(result, ensure_ascii=False, indent=2))
        elif args.command == "delete":
            kb = KnowledgeBase.load(args.index)
            if not kb.delete(args.filename):
                print(f"error: document '{args.filename}' not found in the index", file=sys.stderr)
                return 1
            kb.save(args.index)
            print(f"Deleted '{args.filename}' and its chunks from {args.index}")
        else:  # docs
            kb = KnowledgeBase.load(args.index)
            rows = [
                {"filename": doc["filename"], "document_id": doc["document_id"],
                 "version": doc["version"], "chunks": doc["num_chunks"]}
                for doc in kb.documents
            ]
            print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
