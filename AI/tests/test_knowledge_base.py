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


def make_docx(path: Path, paragraphs: list[tuple[str, str | None] | str]) -> None:
    """Build a minimal valid .docx: paragraphs are (text, style_or_None) or raw body XML."""
    w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    body_parts = []
    for item in paragraphs:
        if isinstance(item, str):
            body_parts.append(item)
            continue
        text, style = item
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
    def test_page_context_is_not_split_by_fixed_word_window(self):
        text = " ".join(f"aturan{i}" for i in range(240))
        contexts = chunk_pages([(2, text)], "policy.pdf", "doc-page", 1, words_per_chunk=40)
        self.assertEqual(len(contexts), 1)
        self.assertEqual(contexts[0]["page_number"], 2)
        self.assertEqual(contexts[0]["text"], text)

    def test_page_context_splits_only_at_detected_sections(self):
        text = "BAB I Umum isi aturan umum BAB II Cuti isi aturan cuti"
        contexts = chunk_pages(
            [(1, text)], "policy.pdf", "doc-section", 1,
            sections={1: [(0, "BAB I Umum"), (6, "BAB II Cuti")]},
        )
        self.assertEqual([context["section_title"] for context in contexts], ["BAB I Umum", "BAB II Cuti"])
        self.assertIn("isi aturan umum", contexts[0]["text"])
        self.assertIn("isi aturan cuti", contexts[1]["text"])

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
                ("", None),  # paragraf kosong dulu menggeser judul ke potongan sesudahnya
                ("Ketentuan Khusus", "Heading1"),
                ("Bukti pembayaran wajib disimpan.", None),
            ])
            markers = docx_headings(path)
            self.assertEqual(markers, {1: [(0, "BAB I KETENTUAN UMUM")], 2: [(0, "Ketentuan Khusus")]})
            pages = read_document(path)
            chunks = chunk_pages(pages, "sop.docx", "doc-1", 1, sections=markers)
            self.assertEqual(
                [(chunk["section_title"], chunk["text"]) for chunk in chunks],
                [
                    ("BAB I KETENTUAN UMUM", "BAB I KETENTUAN UMUM\nBiaya hotel maksimal Rp900.000 per malam."),
                    ("Ketentuan Khusus", "Ketentuan Khusus\nBukti pembayaran wajib disimpan."),
                ],
            )


def _cell(text: str) -> str:
    return f"<w:tc><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:tc>"


def _table(rows: list[list[str]]) -> str:
    return "<w:tbl>" + "".join("<w:tr>" + "".join(_cell(c) for c in row) + "</w:tr>" for row in rows) + "</w:tbl>"


class DocxBlockTests(unittest.TestCase):
    """Label tabel dan nilainya harus berada di potongan yang sama.

    Kejadian nyata: "Kamar rawat inap per hari" dan "Rp 750.000" tersimpan
    sebagai dua potongan, sehingga AI menemukan labelnya tetapi menjawab
    angkanya tidak ditemukan.
    """

    def blocks(self, body):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "polis.docx"
            make_docx(path, body)
            return read_document(path), docx_headings(path)

    def test_baris_tabel_menyatukan_label_dan_nilai(self):
        pages, markers = self.blocks([
            ("2. Tabel Manfaat Plan B", "Heading2"),
            _table([
                ["Jenis manfaat", "Batas manfaat Plan B"],
                ["Kamar rawat inap per hari", "Rp 750.000, maksimal 90 hari per tahun"],
                ["ICU per hari", "Rp 1.500.000"],
            ]),
        ])
        self.assertEqual(pages, [(1, (
            "2. Tabel Manfaat Plan B\n"
            "Jenis manfaat | Batas manfaat Plan B\n"
            "Kamar rawat inap per hari | Rp 750.000, maksimal 90 hari per tahun\n"
            "ICU per hari | Rp 1.500.000"
        ))])
        self.assertEqual(markers, {1: [(0, "2. Tabel Manfaat Plan B")]})

    def test_paragraf_dalam_kontrol_konten_ikut_terbaca(self):
        pages, _ = self.blocks([
            "<w:sdt><w:sdtContent><w:p><w:r><w:t>Isi di dalam kontrol konten.</w:t></w:r></w:p></w:sdtContent></w:sdt>",
        ])
        self.assertEqual(pages, [(1, "Isi di dalam kontrol konten.")])

    def test_dokumen_tanpa_heading_dipecah_per_ukuran(self):
        paragraph = " ".join(["kata"] * 100)
        pages, markers = self.blocks([(paragraph, None)] * 5)
        self.assertEqual([len(text.split()) for _, text in pages], [200, 200, 100])
        self.assertEqual(markers, {})

    def test_tabel_terpotong_mengulang_kepala_kolom(self):
        rows = [["Jenis", "Batas"]] + [[f"Manfaat {i}", " ".join(["nilai"] * 40)] for i in range(8)]
        pages, _ = self.blocks([("Tabel", "Heading1"), _table(rows)])
        self.assertGreater(len(pages), 1)
        for _, text in pages[1:]:
            self.assertEqual(text.splitlines()[:2], ["Tabel", "Jenis | Batas"])


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


class MetadataFilterTests(unittest.TestCase):
    def _two_doc_kb(self):
        chunks_a = chunk_pages([(1, "Biaya hotel untuk level Manager maksimal Rp900.000 per malam.")],
                               "sop_a.txt", "doc-a", 1, sections={1: text_headings("BAB I KETENTUAN UMUM")})
        chunks_b = chunk_pages([(1, "Cuti tahunan berhak diambil setelah 12 bulan bekerja.")],
                               "sop_b.txt", "doc-b", 1, sections={1: text_headings("BAB II KETENTUAN KHUSUS")})
        return KnowledgeBase(chunks_a + chunks_b)

    def test_filter_by_filename_narrows_results(self):
        kb = self._two_doc_kb()
        result = kb.ask("cuti", top_k=5, filters={"filename": "sop_b.txt"})
        self.assertTrue(result["grounded"])
        self.assertEqual([c["filename"] for c in result["citations"]], ["sop_b.txt"])

    def test_filter_by_filename_substring(self):
        kb = self._two_doc_kb()
        result = kb.ask("cuti", top_k=5, filters={"filename": "sop_b"})
        self.assertTrue(result["grounded"])
        self.assertEqual([c["filename"] for c in result["citations"]], ["sop_b.txt"])

    def test_filter_excludes_other_document(self):
        kb = self._two_doc_kb()
        result = kb.ask("hotel", top_k=5, filters={"filename": "sop_b.txt"})
        self.assertFalse(result["grounded"])  # hotel is only in sop_a -> filtered out
        self.assertEqual(result["answer"], "Informasi tidak ditemukan pada dokumen yang tersedia.")

    def test_filter_by_section_title(self):
        kb = self._two_doc_kb()
        result = kb.ask("biaya", top_k=5, filters={"section_title": "KETENTUAN UMUM"})
        self.assertTrue(result["grounded"])
        self.assertEqual([c["section_title"] for c in result["citations"]], ["BAB I KETENTUAN UMUM"])

    def test_filter_with_vector_retriever(self):
        chunks_a = chunk_pages([(1, "Biaya hotel untuk level Manager maksimal Rp900.000 per malam.")],
                               "sop_a.txt", "doc-a", 1)
        chunks_b = chunk_pages([(1, "Cuti tahunan berhak diambil setelah 12 bulan bekerja.")],
                               "sop_b.txt", "doc-b", 1)
        kb = KnowledgeBase(chunks_a + chunks_b, embeddings={
            chunks_a[0]["chunk_id"]: [1.0, 0.0],
            chunks_b[0]["chunk_id"]: [0.0, 1.0],
        })
        with mock.patch("retrieval.embeddings.embed_texts", return_value=[[0.0, 1.0]]):
            result = kb.ask("cuti", top_k=5, filters={"filename": "sop_b.txt"})
        self.assertTrue(result["grounded"])
        self.assertEqual([c["filename"] for c in result["citations"]], ["sop_b.txt"])


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
