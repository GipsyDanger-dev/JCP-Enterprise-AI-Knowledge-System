"""PostgreSQL + pgvector store for the AI service.

Prisma owns the shared database schema and migrations. The AI service only
reads backend document metadata and writes retrieval chunks:

    document_versions(id, document_id, original_filename, version_number, checksum)
        -> chunks(chunk_id, document_version_id, page_number, section_title,
                  text, embedding vector(1536))

No AI-owned ``documents`` table is created. Every chunk is tied to the exact
backend ``DocumentVersion`` that produced it, and database cascade deletion
removes its chunks when that version is deleted.
"""

from __future__ import annotations

import os
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

from config import EMBEDDING_MODEL
from generation.citations import citations_from_matches
from generation.guardrails import no_answer_response
from generation.llm import DEFAULT_MODEL, generate_answer
from ingestion.chunking import chunk_pages
from ingestion.parsers import read_document
from ingestion.sections import extract_sections
from retrieval.embeddings import embed_texts

VECTOR_MINIMUM_SCORE = 0.45
DATABASE_URL_ENV = "DATABASE_URL"


def _require_deps() -> None:
    if psycopg is None:
        raise RuntimeError("psycopg is not installed. Run: pip install 'psycopg[binary]'")
    if register_vector is None:
        raise RuntimeError("pgvector is not installed. Run: pip install pgvector")


def default_dsn() -> str | None:
    return os.environ.get(DATABASE_URL_ENV)


class PgVectorStore:
    """Chunk store backed by the Prisma-managed PostgreSQL schema."""

    def __init__(self, dsn: str | None = None, model: str = EMBEDDING_MODEL):
        _require_deps()
        self.dsn = dsn or default_dsn()
        if not self.dsn:
            raise RuntimeError(
                f"{DATABASE_URL_ENV} is not set. Run e.g.: "
                '$env:DATABASE_URL="postgresql://user:pass@localhost:5432/rag_knowledge"'
            )
        self.model = model

    # ---------- backend document metadata ----------

    def list_documents(self) -> list[dict[str, Any]]:
        """List active backend document versions and their indexed chunk count."""
        sql = """
            SELECT d.id, dv.id, dv.original_filename, dv.version_number,
                   COUNT(c.chunk_id)::int
            FROM document_versions AS dv
            JOIN documents AS d ON d.id = dv.document_id
            LEFT JOIN chunks AS c ON c.document_version_id = dv.id
            WHERE d.deleted_at IS NULL
            GROUP BY d.id, dv.id, dv.original_filename, dv.version_number
            ORDER BY dv.original_filename, dv.version_number DESC
        """
        with psycopg.connect(self.dsn) as conn:
            rows = conn.execute(sql).fetchall()
        return [
            {
                "document_id": str(row[0]),
                "document_version_id": str(row[1]),
                "filename": row[2],
                "version": row[3],
                "chunks": row[4],
            }
            for row in rows
        ]

    def get_document_version(self, document_version_id: str) -> dict[str, Any] | None:
        sql = """
            SELECT d.id, dv.id, dv.original_filename, dv.version_number,
                   dv.checksum, COUNT(c.chunk_id)::int,
                   COUNT(c.embedding)::int
            FROM document_versions AS dv
            JOIN documents AS d ON d.id = dv.document_id
            LEFT JOIN chunks AS c ON c.document_version_id = dv.id
            WHERE dv.id = %s AND d.deleted_at IS NULL
            GROUP BY d.id, dv.id, dv.original_filename, dv.version_number, dv.checksum
        """
        with psycopg.connect(self.dsn) as conn:
            row = conn.execute(sql, (document_version_id,)).fetchone()
        if row is None:
            return None
        return {
            "document_id": str(row[0]),
            "document_version_id": str(row[1]),
            "filename": row[2],
            "version": row[3],
            "content_hash": row[4],
            "num_chunks": row[5],
            "num_embedded_chunks": row[6],
        }

    def replace_document_version(
        self,
        document_version_id: str,
        chunks: list[dict[str, Any]],
        vectors: list[list[float]] | None = None,
    ) -> None:
        """Replace a version's chunks and optional embeddings atomically."""
        if vectors is not None and len(vectors) != len(chunks):
            raise ValueError("embedding count must match chunk count")

        with psycopg.connect(self.dsn) as conn:
            if vectors is not None:
                register_vector(conn)
            with conn.transaction():
                conn.execute(
                    "DELETE FROM chunks WHERE document_version_id = %s",
                    (document_version_id,),
                )
                for index, chunk in enumerate(chunks):
                    vector = vectors[index] if vectors is not None else None
                    conn.execute(
                        "INSERT INTO chunks (chunk_id, document_version_id, page_number, "
                        "section_title, text, embedding) "
                        "VALUES (%s, %s, %s, %s, %s, %s)",
                        (
                            chunk["chunk_id"],
                            document_version_id,
                            chunk.get("page_number"),
                            chunk.get("section_title", ""),
                            chunk["text"],
                            vector,
                        ),
                    )

    def delete(self, filename: str) -> bool:
        """Delete AI chunks for the latest active version, not backend metadata."""
        select_sql = """
            SELECT dv.id
            FROM document_versions AS dv
            JOIN documents AS d ON d.id = dv.document_id
            WHERE dv.original_filename = %s AND d.deleted_at IS NULL
            ORDER BY dv.version_number DESC
            LIMIT 1
        """
        with psycopg.connect(self.dsn) as conn:
            with conn.transaction():
                row = conn.execute(select_sql, (filename,)).fetchone()
                if row is None:
                    return False
                conn.execute(
                    "DELETE FROM chunks WHERE document_version_id = %s",
                    (row[0],),
                )
        return True

    # ---------- embeddings ----------

    def store_embeddings(self, vectors: list[list[float]], chunk_ids: list[str]) -> None:
        if len(vectors) != len(chunk_ids):
            raise ValueError("embedding count must match chunk count")
        with psycopg.connect(self.dsn) as conn:
            register_vector(conn)
            with conn.transaction():
                for chunk_id, vector in zip(chunk_ids, vectors):
                    conn.execute(
                        "UPDATE chunks SET embedding = %s WHERE chunk_id = %s",
                        (vector, chunk_id),
                    )

    # ---------- retrieval ----------

    def search(
        self,
        query_vector: list[float],
        top_k: int = 5,
        filters: dict[str, Any] | None = None,
    ) -> list[tuple[float, dict[str, Any]]]:
        """Cosine search joined to authoritative backend document metadata."""
        conditions = [
            "c.embedding IS NOT NULL",
            "d.deleted_at IS NULL",
            "d.status = 'READY'",
            "NOT EXISTS ("
            "SELECT 1 FROM document_versions AS newer "
            "WHERE newer.document_id = dv.document_id "
            "AND newer.version_number > dv.version_number"
            ")",
        ]
        filter_params: list[Any] = []
        if filters:
            filename = filters.get("filename")
            if filename:
                conditions.append("dv.original_filename ILIKE %s")
                filter_params.append(f"%{filename}%")
            section_title = filters.get("section_title")
            if section_title:
                conditions.append("c.section_title ILIKE %s")
                filter_params.append(f"%{section_title}%")

        where = " AND ".join(conditions)
        sql = f"""
            SELECT c.chunk_id, d.id, dv.id, dv.original_filename,
                   dv.version_number, c.page_number, c.section_title, c.text,
                   1 - (c.embedding <=> %s::vector) AS score
            FROM chunks AS c
            JOIN document_versions AS dv ON dv.id = c.document_version_id
            JOIN documents AS d ON d.id = dv.document_id
            WHERE {where}
            ORDER BY c.embedding <=> %s::vector
            LIMIT %s
        """
        params = [query_vector, *filter_params, query_vector, top_k]
        with psycopg.connect(self.dsn) as conn:
            register_vector(conn)
            rows = conn.execute(sql, params).fetchall()

        results: list[tuple[float, dict[str, Any]]] = []
        for row in rows:
            chunk = {
                "chunk_id": row[0],
                "document_id": str(row[1]),
                "document_version_id": str(row[2]),
                "filename": row[3],
                "version": row[4],
                "page_number": row[5],
                "section_title": row[6] or "",
                "text": row[7],
            }
            results.append((float(row[8]), chunk))
        return results

    # ---------- orchestration ----------

    def ask(
        self,
        query: str,
        top_k: int = 5,
        minimum_score: float = VECTOR_MINIMUM_SCORE,
        use_llm: bool = False,
        model: str = DEFAULT_MODEL,
        api_key: str | None = None,
        filters: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        query_vector = embed_texts([query], model=self.model, api_key=api_key)[0]
        matches = [
            (score, chunk)
            for score, chunk in self.search(query_vector, top_k, filters=filters)
            if score >= minimum_score
        ]
        if not matches:
            return no_answer_response()
        citations = citations_from_matches(matches)
        answer = (
            generate_answer(query, matches, model=model, api_key=api_key)
            if use_llm
            else matches[0][1]["text"]
        )
        return {
            "answer": answer,
            "citations": citations,
            "grounded": True,
            "retrieval": [
                {
                    "chunk_id": chunk["chunk_id"],
                    "score": round(score, 4),
                    "text": chunk["text"],
                }
                for score, chunk in matches
            ],
        }


def content_hash(path: Path) -> str:
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()


def ingest_to_pg(
    input_dir: Path,
    store: PgVectorStore,
    document_version_id: str,
    embed: bool = True,
    api_key: str | None = None,
) -> list[dict[str, Any]]:
    """Ingest exactly one file for an existing backend DocumentVersion."""
    from knowledge_base import SUPPORTED_SUFFIXES

    paths = [
        path
        for path in sorted(Path(input_dir).rglob("*"))
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES
    ]
    if len(paths) != 1:
        raise ValueError(
            "PostgreSQL ingestion requires exactly one supported file per document_version_id"
        )

    metadata = store.get_document_version(document_version_id)
    if metadata is None:
        raise ValueError(f"document version not found: {document_version_id}")

    path = paths[0]
    if path.name != metadata["filename"]:
        raise ValueError(
            f"filename does not match document version: expected {metadata['filename']}"
        )

    digest = content_hash(path)
    expected_hash = metadata.get("content_hash")
    if expected_hash and digest != expected_hash:
        raise ValueError("file checksum does not match document version")

    num_chunks = int(metadata.get("num_chunks") or 0)
    num_embedded_chunks = int(metadata.get("num_embedded_chunks") or 0)
    if num_chunks > 0 and num_embedded_chunks == num_chunks:
        return [{
            "filename": metadata["filename"],
            "document_id": metadata["document_id"],
            "document_version_id": metadata["document_version_id"],
            "version": metadata["version"],
            "num_chunks": num_chunks,
            "status": "unchanged",
        }]

    pages = read_document(path)
    sections = extract_sections(path.suffix.lower(), path, pages)
    chunks = chunk_pages(
        pages,
        metadata["filename"],
        metadata["document_version_id"],
        metadata["version"],
        sections=sections,
    )
    for chunk in chunks:
        chunk["document_id"] = metadata["document_id"]
        chunk["document_version_id"] = metadata["document_version_id"]

    vectors: list[list[float]] | None = None
    if embed and chunks:
        vectors = embed_texts(
            [chunk["text"] for chunk in chunks],
            model=store.model,
            api_key=api_key,
        )
        if len(vectors) != len(chunks):
            raise ValueError("embedding provider returned an unexpected vector count")

    # Embeddings are generated before any database mutation. A retry replaces
    # partial legacy data with one complete transaction.
    store.replace_document_version(document_version_id, chunks, vectors=vectors)

    return [{
        "filename": metadata["filename"],
        "document_id": metadata["document_id"],
        "document_version_id": metadata["document_version_id"],
        "version": metadata["version"],
        "num_chunks": len(chunks),
        "status": "indexed",
    }]
