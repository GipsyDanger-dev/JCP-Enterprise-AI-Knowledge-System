"""Ingestion: dokumen mentah -> teks + halaman -> section -> chunk + metadata."""

from ingestion.parsers import read_document
from ingestion.sections import extract_sections
from ingestion.chunking import chunk_pages

__all__ = ["read_document", "extract_sections", "chunk_pages"]
