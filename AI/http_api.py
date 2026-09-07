"""HTTP API for the AI Service — consumed by the NestJS backend.

Run (from the AI/ folder, after ``pip install -r requirements.txt``):
    uvicorn http_api:app --host 0.0.0.0 --port 8000

Store selection:
    DATABASE_URL set      -> PostgreSQL + pgvector (PgVectorStore)
    DATABASE_URL unset    -> local JSON knowledge_base.json (KnowledgeBase)

Endpoints (full OpenAPI docs at /docs):
    POST   /ask           query -> {answer, citations, grounded}
    POST   /ingest        index a directory of documents
    GET    /documents     list indexed documents
    DELETE /documents/{filename}
    GET    /health

Authentication:
    Every endpoint except /health requires the header ``X-Worker-Token`` whose
    value matches the ``WORKER_TOKEN`` environment variable — the same shared
    secret the NestJS backend uses for its own worker endpoints. The check is
    registered as an application-wide dependency, so a new endpoint is protected
    by default; add its path to PUBLIC_PATHS to opt out deliberately.
"""

from __future__ import annotations

import hmac
import os
import re
from hashlib import sha256
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

try:
    from fastapi import Depends, FastAPI, Header, HTTPException, Request
    from pydantic import BaseModel
except ImportError:  # pragma: no cover - optional dependency
    raise RuntimeError(
        "fastapi/pydantic are not installed. Run: pip install -r requirements.txt"
    ) from None

from config import DEFAULT_MODEL, EMBEDDING_MODEL, EMBEDDINGS_ENABLED
from generation.guardrails import QUICK_SUGGESTIONS, is_out_of_scope, out_of_scope_response
from knowledge_base import KnowledgeBase
from provider_errors import ProviderError
from store import PgVectorStore, default_dsn, ingest_to_pg

PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_INDEX = PROJECT_DIR / "knowledge_base.json"

WORKER_TOKEN_HEADER = "X-Worker-Token"

# Hanya endpoint di daftar ini yang boleh diakses tanpa token. /health dibiarkan
# terbuka supaya healthcheck container tetap bisa jalan tanpa menyimpan rahasia.
PUBLIC_PATHS = frozenset({"/health"})


def token_digest(value: str) -> bytes:
    """Hash dulu supaya perbandingan selalu memakai panjang byte yang sama."""
    return sha256(value.encode("utf-8")).digest()


def require_worker_token(
    request: Request,
    x_worker_token: str | None = Header(default=None, alias=WORKER_TOKEN_HEADER),
) -> None:
    """Shared-secret guard, sepadan dengan WorkerTokenGuard di backend NestJS."""
    if request.url.path in PUBLIC_PATHS:
        return

    expected = (os.environ.get("WORKER_TOKEN") or "").strip()
    if not expected:
        # Fail closed: tanpa token terkonfigurasi, service tidak bisa membedakan
        # pemanggil sah dari sembarang klien, jadi jangan layani permintaan.
        raise HTTPException(status_code=503, detail="WORKER_TOKEN is not configured")

    supplied = (x_worker_token or "").strip()
    if not supplied or not hmac.compare_digest(token_digest(supplied), token_digest(expected)):
        raise HTTPException(status_code=401, detail="Valid worker token required")


app = FastAPI(
    title="Enterprise AI — AI Service",
    description="Grounded retrieval engine: ingest, ask, citations. "
                "Citation selalu berasal dari metadata halaman/section, bukan dari LLM. "
                f"Semua endpoint selain /health butuh header {WORKER_TOKEN_HEADER}.",
    version="0.1.0",
    dependencies=[Depends(require_worker_token)],
)


class AskRequest(BaseModel):
    query: str
    context_chunk_ids: list[str] = []
    conversation_topic: str | None = None
    top_k: int = 5
    filters: dict[str, str] | None = None
    workspace_type: Literal["COMPANY", "PERSONAL"] = "COMPANY"
    use_llm: bool = False
    model: str | None = None
    retriever: str = "auto"  # auto | tfidf | vector (JSON store only; pg selalu vector)
    # Dimatikan untuk pertanyaan yang datang dari klik tombol: aplikasi tidak
    # boleh balik bertanya atas saran yang ia usulkan sendiri.
    allow_clarify: bool = False


class AskResponse(BaseModel):
    answer: str
    citations: list[dict[str, Any]]
    grounded: bool
    retrieval: list[dict[str, Any]] = []
    suggestions: list[str] = []
    awaiting_choice: bool = False


class IngestRequest(BaseModel):
    input_dir: str  # path relative to the AI service container/workdir
    document_version_id: UUID | None = None  # required by the PostgreSQL store
    embed: bool = True
    model: str | None = None


class IngestResponse(BaseModel):
    documents: list[dict[str, Any]]
    store: str


class DocumentSummary(BaseModel):
    filename: str
    document_id: str
    document_version_id: str | None = None
    version: int
    chunks: int


def current_store() -> PgVectorStore | KnowledgeBase:
    """Pick the active store once per process (env decides)."""
    if default_dsn():
        return PgVectorStore(model=EMBEDDING_MODEL)
    return KnowledgeBase.load(DEFAULT_INDEX) if DEFAULT_INDEX.exists() else KnowledgeBase([], [], {})


def provider_http_error(error: ProviderError) -> HTTPException:
    return HTTPException(status_code=error.http_status, detail=error.public_detail)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "store": "pgvector" if default_dsn() else "json",
        "chat_model": DEFAULT_MODEL,
        "embedding_model": EMBEDDING_MODEL,
        "embeddings_enabled": EMBEDDINGS_ENABLED,
    }


# Patterns for general chat (greetings, small talk, general knowledge)
GENERAL_CHAT_PATTERNS = [
    r'^(halo|hai|hi|hey|hello|selamat|morning|pagi|siang|sore|malam)[\s!.?]*$',
    r'^(apa kabar|how are you|kabar)[\s!.?]*$',
    r'^(siapa (kamu|anda|nama)|who are you|kenalan)[\s!.?]*$',
    r'^(terima kasih|thank|thanks|makasih|thx)[\s!.?]*$',
    r'^(bye|dadah|selamat tinggal|see you|sampai jumpa)[\s!.?]*$',
    r'^(tolong|help|bantuan|bisa bantu)[\s!.?]*$',
    r'^(apa itu|what is|what are|gimana|bagaimana|how)[\s]?$',
    r'^(ceritain|cerita|tell me|explain)[\s]?$',
    r'^(oks?|ok|baik|baiklah|siap|ready|noted)[\s!.?]*$',
]

def is_general_chat(query: str, workspace_type: str = "COMPANY") -> bool:
    """Detect if query is general chat, not document-specific."""
    q = query.strip().lower()
    
    # Check off-topic first - these are NOT document queries
    if is_out_of_scope(q, workspace_type):
        return True
    
    # Check general chat patterns
    for pattern in GENERAL_CHAT_PATTERNS:
        if re.match(pattern, q, re.IGNORECASE):
            return True
    
    return False


SMART_RESPONSES = {
    'halo': 'Halo! Saya siap membantu mencari dan menjelaskan informasi dari dokumen yang dapat Anda akses.',
    'hai': 'Hai! Silakan tanyakan apa pun yang berkaitan dengan file di workspace Anda.',
    'hi': 'Hi! I can help answer questions using the documents available in your workspace.',
    'apa kabar': 'Kabar baik! Saya siap membantu memahami dokumen di workspace Anda.',
    'siapa': 'Saya adalah asisten berbasis dokumen. Jawaban saya disusun dari isi file yang tersedia di workspace Anda.',
    'terima kasih': 'Sama-sama! Silakan tanyakan hal lain dari dokumen Anda.',
    'thanks': 'You\'re welcome! Feel free to ask another question about your documents.',
    'help': 'Saya dapat mencari informasi, menjelaskan bagian tertentu, membandingkan, dan merangkum dokumen di workspace Anda.',
    'bantuan': 'Silakan tanyakan isi file, minta ringkasan, cari poin penting, atau bandingkan informasi antar dokumen.',
    'ok': 'Baik! Silakan ajukan pertanyaan tentang dokumen Anda.',
    'siap': 'Siap! Saya menunggu pertanyaan tentang dokumen Anda.',
}

DEFAULT_GENERAL_RESPONSE = 'Saya siap membantu menjawab berdasarkan dokumen yang tersedia di workspace Anda.'


def general_chat_response(query: str, model: str, workspace_type: str = "COMPANY") -> dict[str, Any]:
    """Smart keyword-based response for general chat with off-topic guardrails."""
    q = query.strip().lower()
    
    # Check for off-topic content first
    if is_out_of_scope(q, workspace_type):
        return out_of_scope_response(workspace_type)
    
    # Check for known patterns (greetings, small talk)
    for keyword, response in SMART_RESPONSES.items():
        if keyword in q:
            return {
                "answer": response,
                "citations": [],
                "grounded": False,
                "retrieval": [],
                "suggestions": QUICK_SUGGESTIONS,
            }
    
    return {
        "answer": DEFAULT_GENERAL_RESPONSE,
        "citations": [],
        "grounded": False,
        "retrieval": [],
        "suggestions": QUICK_SUGGESTIONS,
    }


def contextualize_query(query: str, topic: str | None) -> str:
    """Use a minimal local topic label for follow-up retrieval, not chat history."""
    if not topic:
        return query
    return f"Topik percakapan sebelumnya: {topic}. Pertanyaan terbaru: {query}"


@app.post("/ask", response_model=AskResponse)
def ask(request: AskRequest) -> dict[str, Any]:
    """Page/section retrieval -> (optional LLM) -> answer + citations."""
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="query must not be empty")
    # Guardrails evaluate the new user question before a local topic label is applied.
    if is_out_of_scope(request.query, request.workspace_type):
        return out_of_scope_response(request.workspace_type)
    if is_general_chat(request.query, request.workspace_type) and not request.conversation_topic:
        return general_chat_response(
            request.query, request.model or DEFAULT_MODEL, request.workspace_type,
        )

    retrieval_query = contextualize_query(request.query, request.conversation_topic)

    try:
        store = current_store()
        if isinstance(store, PgVectorStore):
            return store.ask(
                retrieval_query, top_k=request.top_k, use_llm=request.use_llm,
                model=request.model or DEFAULT_MODEL, filters=request.filters,
                context_chunk_ids=request.context_chunk_ids,
                allow_clarify=request.allow_clarify,
                workspace_type=request.workspace_type,
            )
        return store.ask(
            retrieval_query, top_k=request.top_k, use_llm=request.use_llm,
            model=request.model or DEFAULT_MODEL, retriever=request.retriever,
            filters=request.filters,
            workspace_type=request.workspace_type,
        )
    except ProviderError as error:
        raise provider_http_error(error) from None


@app.post("/ingest", response_model=IngestResponse)
def ingest_documents(request: IngestRequest) -> dict[str, Any]:
    """Parse -> page/section context -> (embed) -> index a directory of documents."""
    input_dir = Path(request.input_dir)
    if not input_dir.is_dir():
        raise HTTPException(status_code=400, detail=f"input_dir not found: {input_dir}")
    store = current_store()
    if isinstance(store, PgVectorStore):
        if request.document_version_id is None:
            raise HTTPException(
                status_code=400,
                detail="document_version_id is required for PostgreSQL ingestion",
            )
        try:
            documents = ingest_to_pg(
                input_dir,
                store,
                str(request.document_version_id),
                embed=request.embed,
                api_key=os.environ.get("AI_PROVIDER_API_KEY"),
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except ProviderError as error:
            raise provider_http_error(error) from None
        return {"documents": documents, "store": "pgvector"}
    # JSON store: reuse the CLI ingest path.
    from knowledge_base import ingest
    try:
        ingest(input_dir, DEFAULT_INDEX, embed=request.embed)
    except ProviderError as error:
        raise provider_http_error(error) from None
    kb = KnowledgeBase.load(DEFAULT_INDEX)
    return {
        "documents": [
            {"filename": d["filename"], "document_id": d["document_id"],
             "version": d["version"], "num_chunks": d["num_chunks"]}
            for d in kb.documents
        ],
        "store": "json",
    }


@app.get("/documents", response_model=list[DocumentSummary])
def list_documents() -> list[dict[str, Any]]:
    store = current_store()
    if isinstance(store, PgVectorStore):
        return store.list_documents()
    return [
        {"filename": d["filename"], "document_id": d["document_id"],
         "version": d["version"], "chunks": d["num_chunks"]}
        for d in store.documents
    ]


@app.delete("/documents/{filename}", status_code=200)
def delete_document(filename: str) -> dict[str, Any]:
    store = current_store()
    deleted = store.delete(filename) if isinstance(store, PgVectorStore) else store.delete(filename)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"document not found: {filename}")
    if isinstance(store, KnowledgeBase):
        store.save(DEFAULT_INDEX)
    return {"ok": True, "filename": filename}
