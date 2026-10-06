"""Document parsers: file -> list of (page_number, text).

Supported today: TXT, MD, DOCX, and PDF (PDF needs the optional pypdf
package). Parsing never depends on an API key, so ingestion works offline.
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree

_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

#: Batas satu blok DOCX. Cukup besar untuk memuat satu bagian utuh beserta
#: tabelnya, cukup kecil supaya dokumen tanpa heading tidak menjadi satu
#: potongan raksasa yang kemiripannya kabur terhadap pertanyaan apa pun.
DOCX_BLOCK_WORDS = 250


def _normalize(text: str) -> str:
    """Collapse any run of whitespace into a single space and strip edges."""
    return re.sub(r"[ \t\r\n]+", " ", text).strip()


def _text_of(element: ElementTree.Element) -> str:
    return _normalize("".join(node.text or "" for node in element.iter(f"{_W}t")))


def _is_heading(paragraph: ElementTree.Element) -> bool:
    style = paragraph.find(f"{_W}pPr/{_W}pStyle")
    value = (style.get(f"{_W}val") or "").lower() if style is not None else ""
    return value.startswith("heading") or value in {"title", "judul", "subtitle"}


def _body_items(parent: ElementTree.Element):
    """Isi badan dokumen secara berurutan: ("heading"|"para"|"table", isi).

    Hanya anak langsung yang dibaca, bukan ``iter()`` seluruh pohon: paragraf
    di dalam sel tabel harus tetap menjadi bagian barisnya, bukan muncul lagi
    sebagai paragraf lepas. Kontrol konten (``sdt``) hanya pembungkus, jadi
    isinya ditelusuri seperti badan biasa.
    """
    for child in parent:
        if child.tag == f"{_W}p":
            text = _text_of(child)
            if text:
                yield ("heading" if _is_heading(child) else "para", text)
        elif child.tag == f"{_W}tbl":
            rows = []
            for row in child.iter(f"{_W}tr"):
                cells = [_text_of(cell) for cell in row.findall(f"{_W}tc")]
                if any(cells):
                    rows.append(" | ".join(cell for cell in cells if cell))
            if rows:
                yield ("table", rows)
        elif child.tag in {f"{_W}sdt", f"{_W}sdtContent"}:
            yield from _body_items(child)


def docx_blocks(path: Path) -> list[tuple[str, str]]:
    """Kelompokkan DOCX menjadi blok [(judul_bagian, teks)].

    Dulu setiap paragraf menjadi satu potongan sendiri, termasuk setiap sel
    tabel. Label "Kamar rawat inap per hari" dan nilainya "Rp 750.000" jadi
    dua potongan terpisah: pencarian menemukan labelnya, angkanya tertinggal,
    dan AI menjawab "tidak ditemukan" untuk informasi yang jelas tertulis.

    Sekarang satu baris tabel menjadi satu baris teks, dan paragraf dikumpulkan
    sampai heading berikutnya atau sampai ``DOCX_BLOCK_WORDS``. Baris-barisnya
    dipisah newline supaya batas antarbaris tabel tetap terbaca model. Bila
    tabel terpotong batas ukuran, baris pertamanya (biasanya kepala kolom)
    diulang di blok berikutnya agar nilai di sana tidak kehilangan maknanya.
    """
    with zipfile.ZipFile(path) as archive:
        root = ElementTree.fromstring(archive.read("word/document.xml"))
    body = root.find(f"{_W}body")
    if body is None:
        return []

    blocks: list[tuple[str, str]] = []
    heading = ""
    lines: list[str] = []
    words = 0

    def flush() -> None:
        nonlocal lines, words
        # Blok yang isinya hanya judulnya sendiri tidak membawa informasi;
        # judulnya tetap ikut sebagai baris pertama blok sesudahnya.
        if lines and lines != [heading]:
            blocks.append((heading, "\n".join(lines)))
        lines, words = [], 0

    def add(line: str, repeat: str | None = None) -> None:
        nonlocal words
        size = len(line.split())
        if words and words + size > DOCX_BLOCK_WORDS:
            flush()
            if heading:
                lines.append(heading)
            if repeat and repeat != line:
                lines.append(repeat)
            words = sum(len(item.split()) for item in lines)
        lines.append(line)
        words += size

    for kind, content in _body_items(body):
        if kind == "heading":
            flush()
            heading = content
            lines, words = [heading], len(heading.split())
        elif kind == "para":
            add(content)
        else:
            header = content[0]
            for row in content:
                add(row, repeat=header)
    flush()
    return blocks


def read_document(path: Path) -> list[tuple[int, str]]:
    """Return [(page_number, text)] for a supported document.

    TXT/MD are treated as a single page. DOCX has no real pages without a
    layout engine, so it returns one item per block from :func:`docx_blocks`
    (block index acts as the page number). PDF returns one item per page.
    """
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md"}:
        return [(1, _normalize(path.read_text(encoding="utf-8")))]
    if suffix == ".docx":
        return [(index, text) for index, (_, text) in enumerate(docx_blocks(path), 1)]
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RuntimeError("PDF support needs pypdf. Install it with: python -m pip install pypdf") from exc
        reader = PdfReader(str(path))
        return [(index, _normalize(page.extract_text() or "")) for index, page in enumerate(reader.pages, 1)]
    raise ValueError(f"Unsupported document type: {path.suffix}")
