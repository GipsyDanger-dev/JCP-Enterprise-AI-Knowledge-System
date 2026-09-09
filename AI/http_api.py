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
"""

from __future__ import annotations

import os
import hmac
import re
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

try:
    from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
    from pydantic import BaseModel
except ImportError:  # pragma: no cover - optional dependency
    raise RuntimeError(
        "fastapi/pydantic are not installed. Run: pip install -r requirements.txt"
    ) from None

from config import DEFAULT_MODEL, EMBEDDING_MODEL, EMBEDDINGS_ENABLED
from generation.guardrails import is_out_of_scope, out_of_scope_response
from knowledge_base import KnowledgeBase
from provider_errors import ProviderError
from store import AccessScope, PgVectorStore, default_dsn, ingest_file_to_pg, ingest_to_pg

PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_INDEX = PROJECT_DIR / "knowledge_base.json"


def provider_api_key() -> str | None:
    """Support SlemaN's provider name while keeping unified .env compatible."""
    return os.environ.get("SUMOPOD_API_KEY") or os.environ.get("AI_PROVIDER_API_KEY")

def require_worker_token(request: Request, x_worker_token: str | None = Header(default=None)) -> None:
    if request.url.path == "/health":
        return
    expected = (os.environ.get("WORKER_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="WORKER_TOKEN is not configured")
    if not x_worker_token or not hmac.compare_digest(x_worker_token.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Valid worker token required")


app = FastAPI(
    dependencies=[Depends(require_worker_token)],
    title="Enterprise AI — AI Service",
    description="Grounded retrieval engine: ingest, ask, citations. "
                "Citation selalu berasal dari metadata halaman/section, bukan dari LLM.",
    version="0.1.0",
)


class AskRequest(BaseModel):
    allow_clarify: bool = False
    access: dict[str, Any] | None = None
    query: str
    context_chunk_ids: list[str] = []
    conversation_topic: str | None = None
    top_k: int = 5
    filters: dict[str, str] | None = None
    workspace_type: Literal["COMPANY", "PERSONAL"] = "COMPANY"
    use_llm: bool = False
    model: str | None = None
    retriever: str = "auto"  # auto | tfidf | vector (JSON store only; pg selalu vector)


class AskResponse(BaseModel):
    awaiting_choice: bool = False
    answer: str
    citations: list[dict[str, Any]]
    grounded: bool
    retrieval: list[dict[str, Any]] = []
    suggestions: list[str] = []


class IngestRequest(BaseModel):
    input_dir: str  # path relative to the AI service container/workdir
    document_version_id: UUID | None = None  # required by the PostgreSQL store
    embed: bool = EMBEDDINGS_ENABLED
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
SMALL_TALK_PATTERNS = [
    r'^(halo|hai|hi|hey|hello|selamat|morning|pagi|siang|sore|malam)[\s!.?]*$',
    r'^(apa kabar|how are you|kabar)[\s!.?]*$',
    r'^(siapa (kamu|anda|nama)|who are you|kenalan)[\s!.?]*$',
    r'^(terima kasih|thank|thanks|makasih|thx)[\s!.?]*$',
    r'^(bye|dadah|selamat tinggal|see you|sampai jumpa)[\s!.?]*$',
    r'^(tolong|help|bantuan|bisa bantu)[\s!.?]*$',
    r'^(oks?|ok|baik|baiklah|siap|ready|noted)[\s!.?]*$',
]
INCOMPLETE_PATTERNS = [
    r'^(apa itu|what is|what are|gimana|bagaimana|how)[\s]?$',
    r'^(ceritain|cerita|tell me|explain)[\s]?$',
]
GENERAL_CHAT_PATTERNS = SMALL_TALK_PATTERNS + INCOMPLETE_PATTERNS

def is_general_chat(query: str, workspace_type: str = "COMPANY", has_topic: bool = False) -> bool:
    """Detect greetings without classifying document topics by keywords."""
    q = query.strip().lower()
    if is_out_of_scope(q, workspace_type):
        return True
    if any(re.match(pattern, q, re.IGNORECASE) for pattern in SMALL_TALK_PATTERNS):
        return True
    return (not has_topic) and any(
        re.match(pattern, q, re.IGNORECASE) for pattern in INCOMPLETE_PATTERNS
    )


SMART_RESPONSES = {
    'halo': 'Halo! Saya Enterprise AI. Saya menjawab dari dokumen resmi yang tersimpan di sistem ini. Silakan ketik pertanyaan Anda, atau pilih salah satu topik di bawah.',
    'hai': 'Hai! Saya menjawab berdasarkan dokumen resmi yang tersimpan di sistem ini. Silakan ajukan pertanyaan.',
    'hi': 'Hi! I answer questions from the official documents stored in this system.',
    'apa kabar': 'Kabar baik! Saya siap membantu mencari informasi dari dokumen yang tersimpan.',
    'siapa': 'Saya Enterprise AI, asisten berbasis dokumen. Jawaban saya diambil dari dokumen resmi yang tersimpan di sistem ini.',
    'terima kasih': 'Sama-sama! Silakan tanyakan hal lain dari dokumen yang tersimpan.',
    'thanks': "You're welcome! Feel free to ask anything else about the stored documents.",
    'help': 'Saya bisa mencari isi dokumen, menjelaskan ketentuan, dan menunjukkan sumbernya.',
    'bantuan': 'Saya bisa mencari isi dokumen, menjelaskan ketentuan, dan menunjukkan sumbernya.',
    'ok': 'Baik! Silakan ketik pertanyaan Anda tentang dokumen yang tersimpan.',
    'siap': 'Siap! Saya menunggu pertanyaan Anda tentang dokumen yang tersimpan.',
}

DEFAULT_GENERAL_RESPONSE = 'Halo! Saya Enterprise AI. Saya menjawab dari dokumen resmi yang tersimpan di sistem ini. Silakan ketik pertanyaan Anda.'


def suggested_questions(store: PgVectorStore | KnowledgeBase, scope: AccessScope | None) -> list[str]:
    """Build suggestions from the same corpus and access scope as retrieval."""
    try:
        if isinstance(store, PgVectorStore):
            return [] if scope is None else store.suggested_questions(scope=scope)
        return store.suggested_questions()
    except Exception as exc:
        print(f"[AI] Suggestion build failed: {exc}")
        return []


def general_chat_response(query: str, suggestions: list[str]) -> dict[str, Any]:
    """Return a greeting response with corpus-derived suggestions."""
    q = query.strip().lower()
    for keyword, response in SMART_RESPONSES.items():
        if keyword in q:
            return {
                "answer": response,
                "citations": [],
                "grounded": False,
                "retrieval": [],
                "suggestions": suggestions,
            }
    
    return {
        "answer": DEFAULT_GENERAL_RESPONSE,
        "citations": [],
        "grounded": False,
        "retrieval": [],
        "suggestions": suggestions,
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
    store = current_store()
    scope: AccessScope | None = None
    if isinstance(store, PgVectorStore):
        # Access boundaries are required before even generating suggestions.
        scope = AccessScope.from_payload(request.access)
        if scope is None:
            raise HTTPException(status_code=400, detail="access scope is required")

    # Guardrails evaluate the new user question before a local topic label is applied.
    if is_out_of_scope(request.query, request.workspace_type):
        return out_of_scope_response(suggested_questions(store, scope))
    if is_general_chat(
        request.query,
        request.workspace_type,
        has_topic=bool(request.conversation_topic),
    ):
        return general_chat_response(request.query, suggested_questions(store, scope))

    retrieval_query = contextualize_query(request.query, request.conversation_topic)

    try:
        if isinstance(store, PgVectorStore):
            return store.ask(
                retrieval_query, top_k=request.top_k, use_llm=request.use_llm,
                model=request.model or DEFAULT_MODEL, filters=request.filters,
                context_chunk_ids=request.context_chunk_ids,
                allow_clarify=request.allow_clarify, scope=scope,
                workspace_type=request.workspace_type,
            )
        if request.access is not None:
            raise HTTPException(status_code=503, detail="Workspace retrieval requires PostgreSQL storage")
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
                api_key=provider_api_key(),
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


@app.post("/ingest-file", response_model=IngestResponse)
async def ingest_file(
    file: UploadFile = File(...),
    document_version_id: UUID | None = Form(None),
    embed: bool = Form(EMBEDDINGS_ENABLED),
    model: str | None = Form(None),
) -> dict[str, Any]:
    """Ingest one uploaded file sent as multipart from the Backend.

    This is the production transport: the Backend streams the binary file
    directly, so the two services do not need to share a filesystem.
    """
    if file.filename is None or not file.filename.strip():
        raise HTTPException(status_code=400, detail="file must have a filename")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="file is empty")

    store = current_store()
    if isinstance(store, PgVectorStore):
        if document_version_id is None:
            raise HTTPException(
                status_code=400,
                detail="document_version_id is required for PostgreSQL ingestion",
            )
        try:
            documents = ingest_file_to_pg(
                content,
                file.filename,
                store,
                str(document_version_id),
                embed=embed,
                api_key=provider_api_key(),
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except ProviderError as error:
            raise provider_http_error(error) from None
        return {"documents": documents, "store": "pgvector"}

    # JSON store: write the uploaded file to a temp dir and reuse the CLI path.
    import tempfile
    from knowledge_base import ingest
    with tempfile.TemporaryDirectory() as tmp_dir:
        target = Path(tmp_dir) / Path(file.filename.replace("\\", "/")).name
        target.write_bytes(content)
        try:
            ingest(Path(tmp_dir), DEFAULT_INDEX, embed=embed)
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
