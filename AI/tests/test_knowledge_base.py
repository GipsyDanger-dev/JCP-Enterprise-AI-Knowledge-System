import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

from ai_engine import KnowledgeBase, chunk_pages
from ingestion.parsers import read_document
from ingestion.sections import docx_headings, text_headings
from knowledge_base import ingest
from retrieval.search import build_retriever


def make_docx(path: Path, paragraphs: list[tuple[str, str | None]]) -> None:
    """Build a minimal valid .docx: paragraphs are (text, style_or_None)."""
    w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    body_parts = []
    for text, style in paragraphs:
        part = "<w:p>"
        if style:
            part += f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>'
        part += f"<w:r><w:t>{text}</w:t></w:r></w:p>"
        body_parts.append(part)
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:document xmlns:w="{w}"><w:body>{"".join(body_parts)}</w:body></w:document>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/>'
        "</Relationships>"
    )
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", rels)
        archive.writestr("word/document.xml", document)


class SectionExtractionTests(unittest.TestCase):
    def test_text_headings_detected(self):
        text = (
            "SOP Perjalanan Dinas 2026\n\n"
            "1. Tujuan\n"
            "Biaya hotel untuk level Manager maksimal Rp900.000 per malam.\n"
            "BAB II\n"
            "Penggantian biaya wajib disertai bukti pembayaran.\n"
        )
        headings = [heading for _, heading in text_headings(text)]
        self.assertIn("SOP Perjalanan Dinas 2026", headings)
        self.assertIn("1. Tujuan", headings)
        self.assertIn("BAB II", headings)

    def test_body_sentence_not_treated_as_heading(self):
        text = "Penggantian biaya wajib disertai bukti pembayaran yang sah."
        self.assertEqual(text_headings(text), [])

    def test_chunk_section_title_assigned(self):
        text = "BAB I KETENTUAN UMUM\nBiaya hotel untuk level Manager maksimal Rp900.000 per malam."
        chunks = chunk_pages([(1, text)], "sop.txt", "doc-1", 1, sections={1: text_headings(text)})
        self.assertEqual(chunks[0]["section_title"], "BAB I KETENTUAN UMUM")

    def test_docx_headings_flow_into_chunks(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sop.docx"
            make_docx(path, [
                ("BAB I KETENTUAN UMUM", "Heading1"),
                ("Biaya hotel maksimal Rp900.000 per malam.", None),
                ("Ketentuan Khusus", "Heading1"),
                ("Bukti pembayaran wajib disimpan.", None),
            ])
            markers = docx_headings(path)
            self.assertEqual(markers[1][0][1], "BAB I KETENTUAN UMUM")
            self.assertEqual(markers[3][0][1], "Ketentuan Khusus")
            pages = read_document(path)
            chunks = chunk_pages(pages, "sop.docx", "doc-1", 1, sections=markers)
            self.assertEqual(chunks[0]["section_title"], "BAB I KETENTUAN UMUM")
            self.assertEqual(chunks[1]["section_title"], "")  # body paragraph, no heading
            self.assertEqual(chunks[2]["section_title"], "Ketentuan Khusus")


class KnowledgeBaseLifecycleTests(unittest.TestCase):
    def test_delete_removes_chunks_and_embeddings(self):
        kb = KnowledgeBase([], [], {"doc-1-1": [0.1, 0.2]})
        kb.replace_document("doc-1", "sop.txt", 1, "hash-a",
                            chunk_pages([(1, "Biaya hotel maksimal Rp900.000 per malam.")], "sop.txt", "doc-1", 1))
        self.assertEqual(len(kb.chunks), 1)
        self.assertTrue(kb.delete("sop.txt"))
        self.assertEqual(kb.chunks, [])
        self.assertEqual(kb.embeddings, {})
        self.assertEqual(kb.documents, [])
        self.assertFalse(kb.delete("sop.txt"))

    def test_ingest_idempotent_then_version_bump(self):
        with tempfile.TemporaryDirectory() as tmp:
            doc_dir = Path(tmp) / "docs"
            doc_dir.mkdir()
            out = Path(tmp) / "kb.json"
            source = doc_dir / "sop.txt"
            source.write_text("Biaya hotel untuk level Manager maksimal Rp900.000 per malam.", encoding="utf-8")

            ingest(doc_dir, out)
            first = KnowledgeBase.load(out)
            self.assertEqual(first.documents[0]["version"], 1)

            ingest(doc_dir, out)  # unchanged -> no-op, idempotent
            second = KnowledgeBase.load(out)
            self.assertEqual(second.documents[0]["version"], 1)
            self.assertEqual(len(second.chunks), len(first.chunks))

            source.write_text("Biaya hotel untuk level Direktur maksimal Rp1.500.000 per malam. Baru.", encoding="utf-8")
            ingest(doc_dir, out)  # content changed -> version 2
            third = KnowledgeBase.load(out)
            self.assertEqual(third.documents[0]["version"], 2)
            self.assertIn("Direktur", third.chunks[0]["text"])


class VectorRetrieverTests(unittest.TestCase):
    def test_vector_search_with_stored_embeddings(self):
        chunks = chunk_pages([(1, "Biaya hotel untuk level Manager maksimal Rp900.000 per malam.")],
                             "sop.txt", "doc-1", 1)
        kb = KnowledgeBase(chunks, embeddings={chunks[0]["chunk_id"]: [1.0, 0.0, 0.0]})
        with mock.patch("retrieval.embeddings.embed_texts", return_value=[[0.9, 0.1, 0.0]]):
            retriever = build_retriever(kb, mode="vector")
            results = retriever.search("hotel", top_k=1)
        self.assertEqual(len(results), 1)
        self.assertGreater(results[0][0], 0.5)

    def test_vector_mode_requires_stored_embeddings(self):
        kb = KnowledgeBase([], [], {})
        with self.assertRaises(RuntimeError):
            build_retriever(kb, mode="vector")

    def test_auto_prefers_vector_when_embeddings_stored(self):
        chunks = chunk_pages([(1, "Biaya hotel untuk level Manager maksimal Rp900.000 per malam.")],
                             "sop.txt", "doc-1", 1)
        kb = KnowledgeBase(chunks, embeddings={chunks[0]["chunk_id"]: [1.0, 0.0]})
        with mock.patch("retrieval.embeddings.embed_texts", return_value=[[1.0, 0.0]]):
            result = kb.ask("hotel", top_k=1)
        self.assertTrue(result["grounded"])

    def test_auto_falls_back_to_tfidf_without_embeddings(self):
        chunks = chunk_pages([(1, "Biaya hotel untuk level Manager maksimal Rp900.000 per malam.")],
                             "sop.txt", "doc-1", 1)
        kb = KnowledgeBase(chunks)
        result = kb.ask("Berapa maksimal biaya hotel Manager?", top_k=1)
        self.assertTrue(result["grounded"])


if __name__ == "__main__":
    unittest.main()
