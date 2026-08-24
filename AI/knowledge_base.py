"""Knowledge base: the store and orchestrator of the AI pipeline.

Holds the page/section context index (with the full metadata contract), a document
registry used for versioning, and optionally stored embedding vectors.

Versioning rules (slide 17 of the briefing):
- Idempotent jobs: re-ingesting an unchanged file is a no-op.
- Version everything: a content change bumps ``version`` and replaces chunks.
- Delete cleanly: deleting a document removes its chunks and embeddings.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path
from typing import Any

from ingestion.chunking import chunk_pages
from ingestion.parsers import read_document
from ingestion.sections import extract_sections
from retrieval.search import build_retriever
from generation.citations import citations_from_matches
from generation.guardrails import is_no_answer, no_answer_response
from generation.llm import DEFAULT_MODEL, generate_answer
from config import EMBEDDING_MODEL

SUPPORTED_SUFFIXES = {".txt", ".md", ".docx", ".pdf"}


def _document_id(filename: str) -> str:
    # Stable per filename so re-ingesting the same file keeps the same id.
    return str(uuid.uuid5(uuid.NAMESPACE_URL, filename))


def _content_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _derive_documents(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    registry: dict[str, dict[str, Any]] = {}
    for chunk in chunks:
        entry = registry.setdefault(chunk["document_id"], {
            "document_id": chunk["document_id"],
            "filename": chunk["filename"],
            "version": chunk["version"],
            "num_chunks": 0,
        })
        entry["num_chunks"] += 1
    return list(registry.values())


class KnowledgeBase:
    def __init__(self, chunks: list[dict[str, Any]], documents: list[dict[str, Any]] | None = None,
                 embeddings: dict[str, list[float]] | None = None):
        self.chunks = chunks
        self.documents = documents if documents is not None else _derive_documents(chunks)
        self.embeddings = embeddings or {}

    @classmethod
    def load(cls, path: Path | str) -> "KnowledgeBase":
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(payload.get("chunks", []), payload.get("documents", []), payload.get("embeddings", {}))

    def save(self, path: Path | str) -> None:
        Path(path).write_text(json.dumps({
            "schema_version": 2,
            "documents": self.documents,
            "chunks": self.chunks,
            "embeddings": self.embeddings,
        }, ensure_ascii=False, indent=2), encoding="utf-8")

    def document(self, document_id: str) -> dict[str, Any] | None:
        return next((doc for doc in self.documents if doc["document_id"] == document_id), None)

    def replace_document(self, document_id: str, filename: str, version: int,
                         content_hash: str, chunks: list[dict[str, Any]]) -> None:
        """Swap a document's chunks (used when re-ingesting a changed file)."""
        old_chunk_ids = {c["chunk_id"] for c in self.chunks if c["document_id"] == document_id}
        self.chunks = [c for c in self.chunks if c["document_id"] != document_id]
        self.embeddings = {k: v for k, v in self.embeddings.items() if k not in old_chunk_ids}
        self.chunks.extend(chunks)
        self.documents = [d for d in self.documents if d["document_id"] != document_id]
        self.documents.append({
            "document_id": document_id,
            "filename": filename,
            "version": version,
            "content_hash": content_hash,
            "num_chunks": len(chunks),
        })

    def delete(self, filename: str) -> bool:
        """Delete a document by filename; its chunks and embeddings go too."""
        doc = next((d for d in self.documents if d["filename"] == filename), None)
        if doc is None:
            return False
        old_chunk_ids = {c["chunk_id"] for c in self.chunks if c["document_id"] == doc["document_id"]}
        self.chunks = [c for c in self.chunks if c["document_id"] != doc["document_id"]]
        self.embeddings = {k: v for k, v in self.embeddings.items() if k not in old_chunk_ids}
        self.documents = [d for d in self.documents if d["document_id"] != doc["document_id"]]
        return True

    def embed_all(self, model: str = EMBEDDING_MODEL, api_key: str | None = None) -> int:
        from retrieval.embeddings import embed_texts
        vectors = embed_texts([chunk["text"] for chunk in self.chunks], model=model, api_key=api_key)
        self.embeddings = {chunk["chunk_id"]: vector for chunk, vector in zip(self.chunks, vectors)}
        return len(vectors)

    def ask(self, query: str, top_k: int = 5, minimum_score: float | None = None,
            use_llm: bool = False, model: str = DEFAULT_MODEL,
            retriever: str = "auto", api_key: str | None = None,
            filters: dict[str, Any] | None = None) -> dict[str, Any]:
        """Answer ``query``, optionally narrowed to page/section contexts matching ``filters``
        (e.g. {"filename": "sop.pdf"} or {"section_title": "KETENTUAN UMUM"})."""
        engine = build_retriever(self, mode=retriever, api_key=api_key)
        threshold = engine.minimum_score if minimum_score is None else minimum_score
        matches = [(score, chunk) for score, chunk in engine.search(query, top_k, filters=filters) if score >= threshold]
        if not matches:
            return no_answer_response()
        citations = citations_from_matches(matches)
        if use_llm:
            answer = generate_answer(query, matches, model=model, api_key=api_key)
        else:
            answer = matches[0][1]["text"]
        if is_no_answer(answer):
            return no_answer_response()
        return {
            "answer": answer,
            "citations": citations,
            "grounded": True,
            "retrieval": [{"chunk_id": chunk["chunk_id"], "score": round(score, 4)} for score, chunk in matches],
        }


def ingest(input_dir: Path | str, output: Path | str, embed: bool = False,
           embed_model: str | None = None, api_key: str | None = None) -> None:
    """Index (or re-index) every supported document under ``input_dir``.

    Idempotent: unchanged files are skipped, changed files get version+1.
    """
    embed_model = embed_model or EMBEDDING_MODEL
    output_path = Path(output)
    kb = KnowledgeBase.load(output_path) if output_path.exists() else KnowledgeBase([], [], {})
    indexed = 0
    for path in sorted(Path(input_dir).rglob("*")):
        if not (path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES):
            continue
        filename = path.name
        document_id = _document_id(filename)
        content_hash = _content_hash(path)
        existing = kb.document(document_id)
        if existing and existing["content_hash"] == content_hash:
            print(f"unchanged : {filename} (v{existing['version']})")
            continue
        pages = read_document(path)
        sections = extract_sections(path.suffix.lower(), path, pages)
        version = (existing["version"] + 1) if existing else 1
        chunks = chunk_pages(pages, filename, document_id, version, sections=sections)
        kb.replace_document(document_id, filename, version, content_hash, chunks)
        indexed += 1
        print(f"{'reindexed' if existing else 'indexed  '}: {filename} (v{version}, {len(chunks)} chunk(s))")
    if not kb.chunks:
        raise RuntimeError("No supported documents found in the input directory.")
    if embed and kb.chunks:
        count = kb.embed_all(embed_model, api_key=api_key)
        print(f"embedded  : {count} chunk(s) with {embed_model}")
    kb.save(output_path)
    print(f"saved     : {len(kb.chunks)} chunk(s) from {len(kb.documents)} document(s) -> {output_path}")
