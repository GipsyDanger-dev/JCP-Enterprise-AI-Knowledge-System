import unittest
from contextlib import ExitStack, contextmanager
from unittest import mock

import store
from store import PgVectorStore


class FakeCursor:
    def __init__(self, rows=None, row=None):
        self.rows = rows or []
        self.row = row

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.row


class FakeTxn:
    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self.conn

    def __exit__(self, *args):
        return False


class FakeConn:
    def __init__(self, cursor=None):
        self._cursor = cursor or FakeCursor()
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        return self._cursor

    def commit(self):
        pass

    def transaction(self):
        return FakeTxn(self)


class FakePsycopg:
    """Stand-in for the ``psycopg`` module: every connect() returns one conn."""

    def __init__(self, cursor=None):
        self.conn = FakeConn(cursor)

    def connect(self, dsn):
        return self.conn


@contextmanager
def patch_deps(cursor=None):
    fake = FakePsycopg(cursor)
    with ExitStack() as stack:
        stack.enter_context(mock.patch("store.psycopg", fake))
        stack.enter_context(mock.patch("store.register_vector", lambda conn: None))
        yield fake


class PgVectorStoreTests(unittest.TestCase):
    def test_requires_dsn(self):
        with patch_deps(), mock.patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(RuntimeError):
                PgVectorStore()

    def test_init_creates_schema(self):
        with patch_deps() as fake:
            store.PgVectorStore("postgresql://u:p@h/db")
        schema_sql = fake.conn.executed[0][0]
        self.assertIn("CREATE TABLE IF NOT EXISTS documents", schema_sql)
        self.assertIn("CREATE TABLE IF NOT EXISTS chunks", schema_sql)
        self.assertIn("embedding     vector(1536)", schema_sql)
        self.assertIn("hnsw (embedding vector_cosine_ops)", schema_sql)

    def test_replace_document_inserts_chunks(self):
        chunk = {
            "chunk_id": "doc-1-1", "document_id": "doc-1", "filename": "sop.txt",
            "version": 1, "page_number": 1, "section_title": "SOP", "text": "Biaya hotel.",
        }
        with patch_deps() as fake:
            db = PgVectorStore("postgresql://u:p@h/db")
            db.replace_document("doc-1", "sop.txt", 1, "hash-a", [chunk])
        statements = [sql for sql, _ in fake.conn.executed]
        self.assertTrue(any("DELETE FROM chunks WHERE document_id" in sql for sql in statements))
        self.assertTrue(any("INSERT INTO documents" in sql for sql in statements))
        self.assertTrue(any("INSERT INTO chunks" in sql for sql in statements))

    def test_search_returns_scored_chunks(self):
        row = ("chunk-1", "doc-1", "sop.txt", 1, 1, "SOP", "Biaya hotel.", 0.71)
        with patch_deps(cursor=FakeCursor(rows=[row])):
            db = PgVectorStore("postgresql://u:p@h/db")
            results = db.search([0.1, 0.2, 0.3], top_k=5)
        self.assertEqual(len(results), 1)
        score, chunk = results[0]
        self.assertAlmostEqual(score, 0.71)
        self.assertEqual(chunk["chunk_id"], "chunk-1")
        self.assertEqual(chunk["filename"], "sop.txt")
        self.assertEqual(chunk["section_title"], "SOP")

    def test_search_builds_metadata_filters(self):
        with patch_deps(cursor=FakeCursor(rows=[])) as fake:
            db = PgVectorStore("postgresql://u:p@h/db")
            db.search([0.1], top_k=5, filters={"filename": "sop_b.txt", "section_title": "KETENTUAN"})
        sql, params = fake.conn.executed[-1]
        self.assertIn("filename ILIKE %s", sql)
        self.assertIn("section_title ILIKE %s", sql)
        self.assertIn("%sop_b.txt%", params)
        self.assertIn("%KETENTUAN%", params)
        self.assertIn("ORDER BY embedding <=> %s::vector", sql)
        self.assertIn("LIMIT %s", sql)

    def test_ask_returns_no_answer_below_threshold(self):
        chunk = {
            "chunk_id": "chunk-1", "document_id": "doc-1", "filename": "sop.txt",
            "version": 1, "page_number": 1, "section_title": "SOP",
            "text": "Biaya hotel maksimal Rp900.000.",
        }
        with patch_deps():
            db = PgVectorStore("postgresql://u:p@h/db")
            with mock.patch("store.embed_texts", return_value=[[1.0, 0.0]]), \
                 mock.patch.object(PgVectorStore, "search", return_value=[(0.20, chunk)]):
                result = db.ask("presiden")
        self.assertFalse(result["grounded"])
        self.assertEqual(result["answer"], "Informasi tidak ditemukan pada dokumen yang tersedia.")
        self.assertEqual(result["citations"], [])

    def test_delete_returns_false_when_missing(self):
        with patch_deps(cursor=FakeCursor(row=None)):
            db = PgVectorStore("postgresql://u:p@h/db")
            self.assertFalse(db.delete("nggak_ada.txt"))


if __name__ == "__main__":
    unittest.main()
