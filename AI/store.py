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
from dataclasses import dataclass
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
from generation.guardrails import (
    clarify_response,
    is_no_answer,
    no_answer_response,
    parse_clarify,
)
from generation.llm import DEFAULT_MODEL, generate_answer
from ingestion.chunking import chunk_pages
from ingestion.parsers import read_document
from ingestion.sections import extract_sections
from retrieval.embeddings import embed_texts

VECTOR_MINIMUM_SCORE = 0.45
DATABASE_URL_ENV = "DATABASE_URL"


@dataclass(frozen=True)
class AccessScope:
    """Batas akses satu penanya, cerminan ``documentVisibilityWhere`` di backend.

    Keputusan siapa-boleh-melihat-apa tetap milik backend: ia yang tahu role,
    kategori, dan aturannya. Yang menyeberang ke sini hanya hasilnya, berupa
    daftar id kategori dan unit kerja penanya. AI service tinggal menjalankan
    penyaringnya.

    Penyaringnya selalu masuk ke klausa WHERE, bukan disaring setelah baris
    terambil, supaya chunk terlarang tidak pernah sempat menyentuh prompt LLM.
    Semua jalur pengambilan wajib menerima objek ini sebagai argumen — sengaja
    tanpa nilai default supaya jalur baru gagal keras, bukan diam-diam terbuka.
    """

    is_admin: bool = False
    allowed_category_ids: tuple[str, ...] = ()
    #: Unit kerja penanya. None berarti belum ditempatkan di unit mana pun,
    #: sehingga dokumen bertanda unit tidak satu pun boleh dibacanya.
    unit_kerja_id: str | None = None

    @classmethod
    def unrestricted(cls) -> "AccessScope":
        """Untuk pemakaian CLI/ingest lokal, bukan untuk permintaan pengguna."""
        return cls(is_admin=True)

    @classmethod
    def from_payload(cls, payload: dict[str, Any] | None) -> "AccessScope | None":
        """None berarti permintaan tidak membawa batas akses — penelepon wajib menolaknya."""
        if not isinstance(payload, dict):
            return None
        ids = payload.get("allowed_category_ids") or []
        if not isinstance(ids, list):
            return None
        unit = payload.get("unit_kerja_id")
        return cls(
            is_admin=bool(payload.get("is_admin")),
            allowed_category_ids=tuple(str(i) for i in ids),
            unit_kerja_id=str(unit) if unit else None,
        )

    def conditions(self, alias: str = "d") -> tuple[list[str], list[Any]]:
        """Potongan WHERE plus parameternya, untuk ditempel ke setiap query."""
        if self.is_admin:
            return [f"{alias}.deleted_at IS NULL"], []
        conditions = [
            f"{alias}.deleted_at IS NULL",
            f"{alias}.status = 'READY'",
            # Rancangan tidak pernah dijawab: angkanya belum final, dan
            # jawaban yang mengutipnya tetap terlihat meyakinkan.
            f"{alias}.legal_status <> 'RANCANGAN'",
            f"({alias}.category_id IS NULL OR {alias}.category_id = ANY(%s::uuid[]))",
        ]
        params: list[Any] = [list(self.allowed_category_ids)]
        # Penanda unit kerja per dokumen, cerminan klausa yang sama di
        # ``documentVisibilityWhere``. Dokumen tanpa penanda terbuka untuk
        # semua; yang bertanda hanya untuk unit itu. Tanpa klausa ini, mengunci
        # dokumen hanya menyembunyikannya dari daftar sementara isinya tetap
        # bisa dikutip AI ke siapa saja.
        if self.unit_kerja_id:
            conditions.append(
                f"({alias}.unit_kerja_id IS NULL OR {alias}.unit_kerja_id = %s::uuid)"
            )
            params.append(self.unit_kerja_id)
        else:
            conditions.append(f"{alias}.unit_kerja_id IS NULL")
        return conditions, params


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

    def document_metadata(self, *, scope: AccessScope) -> list[dict[str, Any]]:
        """Sifat dokumen yang bisa dicari: halaman, ukuran, tanggal unggah.

        Penyaringnya sengaja sama dengan ``search`` supaya pertanyaan metadata
        tidak pernah menyebut dokumen yang tidak bisa ditanyakan isinya.
        """
        access_conditions, access_params = scope.conditions()
        sql = f"""
            SELECT dv.original_filename, dv.page_count, dv.file_size,
                   dv.created_at, COUNT(c.chunk_id)::int
            FROM document_versions AS dv
            JOIN documents AS d ON d.id = dv.document_id
            LEFT JOIN chunks AS c ON c.document_version_id = dv.id
            WHERE {' AND '.join(access_conditions)}
              AND dv.version_number = (
                  SELECT MAX(v.version_number) FROM document_versions AS v
                  WHERE v.document_id = d.id
              )
            GROUP BY dv.original_filename, dv.page_count, dv.file_size, dv.created_at
            ORDER BY dv.original_filename
        """
        with psycopg.connect(self.dsn) as conn:
            rows = conn.execute(sql, access_params).fetchall()
        return [
            {
                "filename": row[0],
                "page_count": row[1],
                "file_size": row[2],
                "created_at": row[3],
                "chunks": row[4],
            }
            for row in rows
        ]

    def get_document_version(self, document_version_id: str) -> dict[str, Any] | None:
        sql = """
            SELECT d.id, dv.id, dv.original_filename, dv.version_number,
                   dv.checksum, COUNT(c.chunk_id)::int, COUNT(c.embedding)::int,
                   MAX(c.page_number)::int
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
            "embedding_count": row[6],
            # Halaman tertinggi yang punya chunk. Dipakai saat ingest dilewati
            # (status "unchanged"), karena file-nya tidak dibuka ulang.
            "page_count": row[7],
        }

    def replace_document_version(
        self,
        document_version_id: str,
        chunks: list[dict[str, Any]],
    ) -> None:
        """Replace one version's chunks atomically; the version must exist."""
        with psycopg.connect(self.dsn) as conn:
            with conn.transaction():
                conn.execute(
                    "DELETE FROM chunks WHERE document_version_id = %s",
                    (document_version_id,),
                )
                for chunk in chunks:
                    conn.execute(
                        "INSERT INTO chunks (chunk_id, document_version_id, page_number, "
                        "section_title, text) VALUES (%s, %s, %s, %s, %s)",
                        (
                            chunk["chunk_id"],
                            document_version_id,
                            chunk.get("page_number"),
                            chunk.get("section_title", ""),
                            chunk["text"],
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
            raise ValueError("embedding vector count does not match chunk count")
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
        *,
        scope: AccessScope,
    ) -> list[tuple[float, dict[str, Any]]]:
        """Cosine search joined to authoritative backend document metadata."""
        access_conditions, access_params = scope.conditions()
        conditions = [
            "c.embedding IS NOT NULL",
            *access_conditions,
            "dv.version_number = (SELECT MAX(v.version_number) FROM document_versions AS v WHERE v.document_id = d.id)",
        ]
        filter_params: list[Any] = list(access_params)
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

    def context_chunks(
        self, chunk_ids: list[str], *, scope: AccessScope
    ) -> list[tuple[float, dict[str, Any]]]:
        """Load cited chunks from the prior answer without sending chat history to a provider."""
        ids = list(dict.fromkeys(chunk_ids))[:8]
        if not ids:
            return []
        # Ikut disaring meski id-nya berasal dari percakapan pengguna sendiri:
        # hak akses bisa dicabut setelah jawaban lama dibuat.
        access_conditions, access_params = scope.conditions()
        sql = f"""
            SELECT c.chunk_id, d.id, dv.id, dv.original_filename,
                   dv.version_number, c.page_number, c.section_title, c.text
            FROM chunks AS c
            JOIN document_versions AS dv ON dv.id = c.document_version_id
            JOIN documents AS d ON d.id = dv.document_id
            WHERE c.chunk_id = ANY(%s)
              AND {' AND '.join(access_conditions)}
        """
        with psycopg.connect(self.dsn) as conn:
            rows = conn.execute(sql, [ids, *access_params]).fetchall()
        chunks = {
            row[0]: {
                "chunk_id": row[0],
                "document_id": str(row[1]),
                "document_version_id": str(row[2]),
                "filename": row[3],
                "version": row[4],
                "page_number": row[5],
                "section_title": row[6] or "",
                "text": row[7],
            }
            for row in rows
        }
        return [(1.0, chunks[chunk_id]) for chunk_id in ids if chunk_id in chunks]

    def _answer_from_matches(self, query: str, matches: list[tuple[float, dict[str, Any]]],
                             use_llm: bool = False, model: str = DEFAULT_MODEL,
                             api_key: str | None = None, allow_clarify: bool = False,
                             *, scope: AccessScope) -> dict[str, Any]:
        """Turn retrieved chunks into the answer payload.

        Deliberately left outside the retrieval ``try`` blocks: a ProviderError
        here means the LLM itself failed, which is not the same as "the answer
        is not in the documents". It must reach http_api so the user is told the
        AI service is unavailable instead of being wrongly told nothing matched.
        """
        citations = citations_from_matches(matches)
        answer = (
            generate_answer(
                query, matches, model=model, api_key=api_key,
                # Sifat berkas (halaman, ukuran, tanggal) tidak ada di dalam
                # teks dokumen, jadi ikut dikirim sebagai konteks.
                documents=self.document_metadata(scope=scope),
                allow_clarify=allow_clarify,
            )
            if use_llm
            else matches[0][1]["text"]
        )
        clarify = parse_clarify(answer)
        if clarify:
            return clarify_response(clarify, query)
        if is_no_answer(answer):
            return no_answer_response()
        return {
            "answer": answer,
            "citations": citations,
            "grounded": True,
            "retrieval": [
                {"chunk_id": chunk["chunk_id"], "score": round(score, 4)}
                for score, chunk in matches
            ],
        }

    def _tfidf_fallback(self, query: str, top_k: int = 5, use_llm: bool = False, model: str = DEFAULT_MODEL, api_key: str | None = None, allow_clarify: bool = False, *, scope: AccessScope) -> dict[str, Any]:
        """TF-IDF fallback when vector search fails or finds nothing."""
        try:
            import psycopg as _psycopg
            from retrieval.tfidf import TfidfRetriever
            dsn = default_dsn()
            if not dsn:
                return no_answer_response()
            with _psycopg.connect(dsn) as conn:
                with conn.cursor() as cur:
                    # Jalur cadangan ini memuat seluruh chunk sekaligus, jadi
                    # justru di sini penyaring akses paling wajib ada.
                    access_conditions, access_params = scope.conditions()
                    cur.execute(
                        "SELECT c.chunk_id, c.document_version_id, d.id, dv.original_filename, "
                        "dv.version_number, c.page_number, c.section_title, c.text "
                        "FROM chunks c "
                        "JOIN document_versions dv ON dv.id = c.document_version_id "
                        "JOIN documents d ON d.id = dv.document_id "
                        "WHERE " + " AND ".join(access_conditions) + " "
                        "AND dv.version_number = (SELECT MAX(v.version_number) FROM document_versions v WHERE v.document_id = d.id) "
                        "ORDER BY c.created_at",
                        access_params,
                    )
                    rows = cur.fetchall()
            chunks = []
            for row in rows:
                chunks.append({
                    "chunk_id": row[0], "document_version_id": str(row[1]),
                    "document_id": str(row[2]),
                    "filename": row[3], "version": row[4],
                    "page_number": row[5], "section_title": row[6] or "",
                    "text": row[7],
                })
            tfidf = TfidfRetriever(chunks)
            matches = tfidf.search(query, top_k=top_k)
            print(f"[AI] TF-IDF: {len(chunks)} chunks, {len(matches)} matches for '{query[:30]}'")
        except Exception as exc:
            print(f"[AI] TF-IDF retrieval failed: {exc}")
            return no_answer_response()
        if not matches:
            return no_answer_response()
        return self._answer_from_matches(
            query, matches, use_llm=use_llm, model=model,
            api_key=api_key, allow_clarify=allow_clarify, scope=scope,
        )

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
        context_chunk_ids: list[str] | None = None,
        allow_clarify: bool = False,
        *,
        scope: AccessScope,
    ) -> dict[str, Any]:
        try:
            context_matches = self.context_chunks(context_chunk_ids or [], scope=scope)
            query_vector = embed_texts([query], model=self.model, api_key=api_key)[0]
            retrieved_matches = [
                (score, chunk)
                for score, chunk in self.search(query_vector, top_k, filters=filters, scope=scope)
                if score >= minimum_score
            ]
            seen = {chunk["chunk_id"] for _, chunk in context_matches}
            matches = context_matches + [
                match for match in retrieved_matches if match[1]["chunk_id"] not in seen
            ]
            matches = matches[:top_k]
        except Exception as exc:
            # Only retrieval is guarded here. TF-IDF needs no embeddings, so it is
            # a genuine fallback when the vector path fails.
            print(f"[AI] Vector search failed ({exc}), falling back to TF-IDF")
            return self._tfidf_fallback(query, top_k, use_llm=use_llm, model=model, api_key=api_key, allow_clarify=allow_clarify, scope=scope)
        if not matches:
            # Vector search found nothing above threshold, try TF-IDF fallback
            print(f"[AI] Vector search: no matches above {minimum_score}, trying TF-IDF")
            return self._tfidf_fallback(query, top_k, use_llm=use_llm, model=model, api_key=api_key, allow_clarify=allow_clarify, scope=scope)
        return self._answer_from_matches(
            query, matches, use_llm=use_llm, model=model,
            api_key=api_key, allow_clarify=allow_clarify, scope=scope,
        )


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

    if metadata["num_chunks"] > 0 and (
        not embed or metadata["embedding_count"] == metadata["num_chunks"]
    ):
        return [{
            "filename": metadata["filename"],
            "document_id": metadata["document_id"],
            "document_version_id": metadata["document_version_id"],
            "version": metadata["version"],
            "num_chunks": metadata["num_chunks"],
            "page_count": metadata["page_count"],
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

    store.replace_document_version(document_version_id, chunks)
    if embed and chunks:
        vectors = embed_texts(
            [chunk["text"] for chunk in chunks],
            model=store.model,
            api_key=api_key,
        )
        store.store_embeddings(vectors, [chunk["chunk_id"] for chunk in chunks])

    return [{
        "filename": metadata["filename"],
        "document_id": metadata["document_id"],
        "document_version_id": metadata["document_version_id"],
        "version": metadata["version"],
        "num_chunks": len(chunks),
        # Dihitung dari parser, bukan dari chunk: halaman kosong tetap ikut
        # terhitung meskipun chunk_pages melewatinya.
        "page_count": len(pages),
        "status": "indexed",
    }]
