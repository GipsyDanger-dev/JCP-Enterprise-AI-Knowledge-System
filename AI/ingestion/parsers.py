"""Document parsers: file -> list of (page_number, text).

Supported today: TXT, MD, DOCX, and PDF (PDF needs the optional pypdf
package). Parsing never depends on an API key, so ingestion works offline.
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree


def _normalize(text: str) -> str:
    """Collapse any run of whitespace into a single space and strip edges."""
    return re.sub(r"[ \t\r\n]+", " ", text).strip()


def read_document(path: Path) -> list[tuple[int, str]]:
    """Return [(page_number, text)] for a supported document.

    TXT/MD are treated as a single page. DOCX returns one item per
    paragraph (paragraph index acts as the page number, matching the
    standalone milestone). PDF returns one item per page.
    """
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md"}:
        return [(1, _normalize(path.read_text(encoding="utf-8")))]
    if suffix == ".docx":
        with zipfile.ZipFile(path) as archive:
            root = ElementTree.fromstring(archive.read("word/document.xml"))
        paragraphs = []
        for paragraph in root.iter():
            if paragraph.tag.endswith("}p"):
                text = "".join(node.text or "" for node in paragraph.iter() if node.tag.endswith("}t"))
                if text.strip():
                    paragraphs.append(_normalize(text))
        return [(index, text) for index, text in enumerate(paragraphs, 1)]
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RuntimeError("PDF support needs pypdf. Install it with: python -m pip install pypdf") from exc
        reader = PdfReader(str(path))
        return [(index, _normalize(page.extract_text() or "")) for index, page in enumerate(reader.pages, 1)]
    raise ValueError(f"Unsupported document type: {path.suffix}")
