"""Ingest sample documents directly into the PostgreSQL + pgvector store.

Run from AI/ folder:
    python ingest_sample.py
"""

from __future__ import annotations

import os
import sys
import hashlib
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parent))

import psycopg
from pgvector.psycopg import register_vector

from config import EMBEDDING_MODEL
from ingestion.parsers import read_document
from ingestion.sections import extract_sections
from ingestion.chunking import chunk_pages
from retrieval.embeddings import embed_texts

DATABASE_URL = os.environ.get("DATABASE_URL")
SAMPLE_DIR = Path(__file__).resolve().parent / "sample_docs"


def main():
    if not DATABASE_URL:
        print("❌ DATABASE_URL not set")
        sys.exit(1)

    sample_files = [
        p for p in sorted(SAMPLE_DIR.rglob("*"))
        if p.is_file() and p.suffix.lower() in {".txt", ".md", ".pdf", ".docx"}
    ]

    if not sample_files:
        print(f"❌ No sample documents found in {SAMPLE_DIR}")
        sys.exit(1)

    print(f"🔍 Found {len(sample_files)} sample document(s)\n")

    api_key = os.environ.get("SUMOPOD_API_KEY")

    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        # Check pgvector
        try:
            row = conn.execute("SELECT 1 FROM pg_extension WHERE extname = 'vector'").fetchone()
            has_pgvector = row is not None
            print(f"✅ pgvector: {'active' if has_pgvector else 'NOT FOUND'}")
        except Exception as e:
            print(f"⚠️  pgvector check failed: {e}")
            has_pgvector = False

        for path in sample_files:
            filename = path.name
            content = path.read_bytes()
            checksum = hashlib.sha256(content).hexdigest()

            print(f"\n📄 Processing: {filename} ({len(content)} bytes)")

            doc_id = str(uuid4())
            version_id = str(uuid4())

            # Check if already ingested
            existing = conn.execute(
                "SELECT id FROM document_versions WHERE original_filename = %s",
                (filename,),
            ).fetchone()
            if existing:
                print(f"   ⏭️  Already ingested, skipping")
                continue

            # Parse
            pages = read_document(path)
            sections = extract_sections(path.suffix.lower(), path, pages)
            chunks = chunk_pages(pages, filename, version_id, 1, sections=sections)
            print(f"   Parsed: {len(pages)} pages, {len(chunks)} chunks")

            # Insert document + version + file
            # Get an admin user ID
            admin_row = conn.execute("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1").fetchone()
            admin_id = admin_row[0] if admin_row else None

            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            conn.execute(
                """INSERT INTO documents (id, title, status, uploaded_by_id, created_at, updated_at)
                   VALUES (%s, %s, 'READY', %s, %s, %s)""",
                (doc_id, path.stem.replace("_", " ").title(), admin_id, now, now),
            )
            conn.execute(
                """INSERT INTO document_versions
                   (id, document_id, version_number, original_filename, mime_type, file_size, checksum)
                   VALUES (%s, %s, 1, %s, 'text/plain', %s, %s)""",
                (version_id, doc_id, filename, len(content), checksum),
            )
            conn.execute(
                """INSERT INTO document_files (id, document_version_id, content)
                   VALUES (%s, %s, %s)""",
                (str(uuid4()), version_id, psycopg.Binary(content)),
            )
            print(f"   ✅ Document + version + file created")

            # Insert chunks
            for chunk in chunks:
                conn.execute(
                    """INSERT INTO chunks (chunk_id, document_version_id, page_number, section_title, text)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (chunk["chunk_id"], version_id, chunk.get("page_number"),
                     chunk.get("section_title", ""), chunk["text"]),
                )
            print(f"   ✅ {len(chunks)} chunks stored")

            # Generate embeddings
            if has_pgvector and api_key and chunks:
                print(f"   🧠 Generating embeddings...")
                texts = [c["text"] for c in chunks]
                vectors = embed_texts(texts, model=EMBEDDING_MODEL, api_key=api_key)
                register_vector(conn)
                for chunk, vector in zip(chunks, vectors):
                    conn.execute(
                        "UPDATE chunks SET embedding = %s WHERE chunk_id = %s",
                        (vector, chunk["chunk_id"]),
                    )
                print(f"   ✅ {len(vectors)} embeddings stored")
            else:
                print(f"   ⚠️  Embeddings skipped (pgvector={has_pgvector}, api_key={'yes' if api_key else 'no'})")

            # Update document status
            conn.execute("UPDATE documents SET status = 'READY' WHERE id = %s", (doc_id,))
            print(f"   ✅ Document status → READY (doc_id={doc_id})")

    print("\n" + "=" * 50)
    print("📊 Ingestion complete!")
    print("=" * 50)


if __name__ == "__main__":
    main()
