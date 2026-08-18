"""PostgreSQL + pgvector store for the AI service.

Mirrors the JSON ``KnowledgeBase`` contract so the pipeline (ingestion,
retrieval, generation) can run against a shared Postgres database — the
Data Layer in the briefing architecture. Backend (NestJS) owns the schema
and migrations; this module only writes/reads the tables it needs:

    documents(document_id, filename, version, content_hash, num_chunks)
    chunks(chunk_id, document_id, filename, version, page_number,
           section_title, text, embedding vector(1536))

Vector search uses the pgvector cosine distance operator (``<=>``); TF-IDF
stays available in the JSON store for fully offline mode.

Dependencies are optional on purpose (like ``pypdf``): importing this
module never fails, only *using* it without ``psycopg``/``pgvector``
installed raises a clear error.
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any

try:
    import psycopg
except ImportError:  # pragma: no cover - optional dependency
    psycopg = None

try:
    from pgvector.psycopg import register_vector
except ImportError:  # pragma: no cover - optional dependency
    register_vector = None

from config import EMBEDDING_MODEL, SUMOPOD_API_KEY_ENV
from generation.citations import citations_from_matches
from generation.guardrails import no_answer_response
from generation.llm import DEFAULT_MODEL, generate_answer
from ingestion.chunking import chunk_pages
from ingestion.parsers import read_document
from ingestion.sections import extract_sections
from retrieval.embeddings import embed_texts

# Matches text-embedding-3-small output size.
EMBEDDING_DIM = 1536
# Same threshold as the local vector retriever (calibrated against the live API).
VECTOR_MINIMUM_SCORE = 0.45

DATABASE_URL_ENV = "DATABASE_URL"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS documents (
    document_id   UUID PRIMARY KEY,
    filename      TEXT NOT NULL,
    version       INT NOT NULL,
    content_hash  TEXT NOT NULL,
    num_chunks    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
    chunk_id      TEXT PRIMARY KEY,
    document_id   UUID NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    version       INT NOT NULL,
    page_number   INT,
    section_title TEXT NOT NULL DEFAULT '',
    text          TEXT NOT NULL,
    embedding     vector({dim})
);

CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks(document_id);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
    ON chunks USING hnsw (embedding vector_cosine_ops);
""".format(dim=EMBEDDING_DIM)


def _require_deps() -> None:
    if psycopg is None:
        raise RuntimeError("psycopg is not installed. Run: pip install 'psycopg[binary]'")
    if register_vector is None:
        raise RuntimeError("pgvector is not installed. Run: pip install pgvector")


def default_dsn() -> str | None:
    return os.environ.get(DATABASE_URL_ENV)


class PgVectorStore:
    """Store + retriever backed by PostgreSQL/pgvector (mirrors KnowledgeBase)."""

    def __init__(self, dsn: str | None = None, model: str = EMBEDDING_MODEL):
        _require_deps()
        self.dsn = dsn or default_dsn()
        if not self.dsn:
            raise RuntimeError(
                f"{DATABASE_URL_ENV} is not set. Run e.g.: "
                '$env:DATABASE_URL="postgresql://user:pass@localhost:5432/ai"'
            )
        self.model = model
        with psycopg.connect(self.dsn) as conn:
            conn.execute(SCHEMA_SQL)
            conn.commit()

    # ---------- documents ----------

    def list_documents(self) -> list[dict[str, Any]]:
        with psycopg.connect(self.dsn) as conn:
            rows = conn.execute(
                "SELECT document_id, filename, version, num_chunks FROM documents ORDER BY filename"
            ).fetchall()
        return [
            {"document_id": str(row[0]), "filename": row[1], "version": row[2], "num_chunks": row[3]}
            for row in rows
        ]

    def get_document(self, document_id: str) -> dict[str, Any] | None:
        with psycopg.connect(self.dsn) as conn:
            row = conn.execute(
                "SELECT document_id, filename, version, content_hash, num_chunks "
                "FROM documents WHERE document_id = %s",
                (document_id,),
            ).fetchone()
        if row is None:
            return None
        return {
            "document_id": str(row[0]), "filename": row[1], "version": row[2],
            "content_hash": row[3], "num_chunks": row[4],
        }

    def replace_document(self, document_id: str, filename: str, version: int,
                         content_hash: str, chunks: list[dict[str, Any]]) -> None:
        """Swap a document's chunks in one transaction (used on re-ingest)."""
        with psycopg.connect(self.dsn) as conn:
            with conn.transaction():
                conn.execute("DELETE FROM chunks WHERE document_id = %s", (document_id,))
                conn.execute(
                    "INSERT INTO documents (document_id, filename, version, content_hash, num_chunks) "
                    "VALUES (%s, %s, %s, %s, %s) "
                    "ON CONFLICT (document_id) DO UPDATE SET "
                    "filename = EXCLUDED.filename, version = EXCLUDED.version, "
                    "content_hash = EXCLUDED.content_hash, num_chunks = EXCLUDED.num_chunks",
                    (document_id, filename, version, content_hash, len(chunks)),
                )
                for chunk in chunks:
                    conn.execute(
                        "INSERT INTO chunks (chunk_id, document_id, filename, version, "
                        "page_number, section_title, text) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (chunk["chunk_id"], document_id, filename, version,
                         chunk.get("page_number"), chunk.get("section_title", ""), chunk["text"]),
                    )

    def delete(self, filename: str) -> bool:
        """Delete a document and all its chunks (ON DELETE CASCADE handles chunks)."""
        with psycopg.connect(self.dsn) as conn:
            with conn.transaction():
                row = conn.execute(
                    "DELETE FROM documents WHERE filename = %s RETURNING document_id", (filename,)
                ).fetchone()
        return row is not None

    # ---------- embeddings ----------

    def store_embeddings(self, vectors: list[list[float]], chunk_ids: list[str]) -> None:
        with psycopg.connect(self.dsn) as conn:
            register_vector(conn)
            with conn.transaction():
                for chunk_id, vector in zip(chunk_ids, vectors):
                    conn.execute(
                        "UPDATE chunks SET embedding = %s WHERE chunk_id = %s", (vector, chunk_id)
                    )

    # ---------- retrieval ----------

    def search(self, query_vector: list[float], top_k: int = 5,
               filters: dict[str, Any] | None = None) -> list[tuple[float, dict[str, Any]]]:
        """Cosine search over stored embeddings, optionally filtered by metadata.

        Returns [(score, chunk)] with score in [0, 1] (1 = identical direction).
        """
        conditions = ["embedding IS NOT NULL"]
        params: list[Any] = []
        if filters:
            for key in ("filename", "section_title"):
                value = filters.get(key)
                if value:
                    conditions.append(f"{key} ILIKE %s")
                    params.append(f"%{value}%")
        where = " AND ".join(conditions)
        params.append(query_vector)
        params.append(top_k)
        sql = (
            f"SELECT chunk_id, document_id, filename, version, page_number, section_title, text, "
            f"1 - (embedding <=> %s::vector) AS score "
            f"FROM chunks WHERE {where} ORDER BY embedding <=> %s::vector LIMIT %s"
        )
        with psycopg.connect(self.dsn) as conn:
            register_vector(conn)
            rows = conn.execute(sql, params).fetchall()
        results: list[tuple[float, dict[str, Any]]] = []
        for row in rows:
            chunk = {
                "chunk_id": row[0], "document_id": str(row[1]), "filename": row[2],
                "version": row[3], "page_number": row[4],
                "section_title": row[5] or "", "text": row[6],
            }
            results.append((float(row[7]), chunk))
        return results

    # ---------- orchestration (same contract as KnowledgeBase) ----------

    def ask(self, query: str, top_k: int = 5, minimum_score: float = VECTOR_MINIMUM_SCORE,
            use_llm: bool = False, model: str = DEFAULT_MODEL,
            api_key: str | None = None, filters: dict[str, Any] | None = None) -> dict[str, Any]:
        query_vector = embed_texts([query], model=self.model, api_key=api_key)[0]
        matches = [(score, chunk) for score, chunk in self.search(query_vector, top_k, filters=filters)
                   if score >= minimum_score]
        if not matches:
            return no_answer_response()
        citations = citations_from_matches(matches)
        if use_llm:
            answer = generate_answer(query, matches, model=model, api_key=api_key)
        else:
            answer = matches[0][1]["text"]
        return {
            "answer": answer,
            "citations": citations,
            "grounded": True,
            "retrieval": [{"chunk_id": chunk["chunk_id"], "score": round(score, 4)} for score, chunk in matches],
        }


def document_id(filename: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, filename))


def content_hash(path: Path) -> str:
    import hashlib
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ingest_to_pg(input_dir: Path, store: PgVectorStore, embed: bool = True,
                 api_key: str | None = None) -> list[dict[str, Any]]:
    """Parse -> chunk -> (embed) -> upsert every supported file into Postgres.

    Idempotent: unchanged files are skipped, changed files get version+1.
    """
    from knowledge_base import SUPPORTED_SUFFIXES
    results: list[dict[str, Any]] = []
    for path in sorted(Path(input_dir).rglob("*")):
        if not (path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES):
            continue
        filename = path.name
        doc_id = document_id(filename)
        digest = content_hash(path)
        existing = store.get_document(doc_id)
        if existing and existing["content_hash"] == digest:
            results.append({"filename": filename, "document_id": doc_id,
                            "version": existing["version"], "num_chunks": existing["num_chunks"],
                            "status": "unchanged"})
            continue
        pages = read_document(path)
        sections = extract_sections(path.suffix.lower(), path, pages)
        version = (existing["version"] + 1) if existing else 1
        chunks = chunk_pages(pages, filename, doc_id, version, sections=sections)
        store.replace_document(doc_id, filename, version, digest, chunks)
        if embed:
            vectors = embed_texts([chunk["text"] for chunk in chunks], model=store.model, api_key=api_key)
            store.store_embeddings(vectors, [chunk["chunk_id"] for chunk in chunks])
        results.append({"filename": filename, "document_id": doc_id, "version": version,
                        "num_chunks": len(chunks), "status": "indexed"})
    return results
