# API Contract — Backend dan AI Service

Version: `0.1`

Status: draft; kontrak query tersedia, kontrak ingestion end-to-end belum final.

AI Service adalah service HTTP internal yang dipanggil oleh Backend NestJS.
Frontend React/Vite tidak boleh memanggil AI Service secara langsung.

## Alamat service

| Konteks | Base URL |
| --- | --- |
| Backend di Docker Compose | `http://ai-api:8000` |
| Akses dari host ke container | `http://localhost:8001` |
| AI dijalankan langsung tanpa Docker | `http://localhost:8000` |

- Format request/response: JSON UTF-8.
- Swagger FastAPI: `GET /docs` pada base URL yang sesuai.
- Auth antar-service belum tersedia.
- Jangan mengekspos AI Service langsung ke publik.
- `AI_SERVICE_URL` Backend di Docker harus bernilai `http://ai-api:8000`.

## Status integrasi

Endpoint di bawah sudah ada pada FastAPI, tetapi integrasi PostgreSQL bersama
Backend masih memiliki kendala:

1. AI dan Prisma membuat tabel bernama `documents` dengan schema berbeda.
2. AI membuat `document_id` dari nama file, bukan memakai
   `DocumentVersion.id` Backend.
3. Backend menyimpan file sebagai `bytea`, sementara `/ingest` hanya menerima
   path direktori pada filesystem AI.
4. PostgreSQL `list_documents()` menghasilkan `num_chunks`, tetapi response
   model `/documents` mengharuskan `chunks`.
5. Parameter query vector search perlu diperbaiki dan diuji pada PostgreSQL
   asli, termasuk metadata filter.

Karena itu, endpoint JSON store dapat dipakai untuk pengembangan mandiri, tetapi
alur upload–ingest end-to-end belum boleh dianggap selesai.

## 1. Health

### `GET /health`

Response `200`:

```json
{
  "status": "ok",
  "store": "json",
  "chat_model": "gpt-5-nano",
  "embedding_model": "text-embedding-3-small"
}
```

`store` bernilai `pgvector` ketika `DATABASE_URL` tersedia dan `json` ketika
variabel tersebut tidak tersedia.

## 2. Ask

### `POST /ask`

Request:

```json
{
  "query": "Berapa maksimal biaya hotel level Manager?",
  "top_k": 5,
  "filters": {
    "filename": "sop_perjalanan.pdf",
    "section_title": "KETENTUAN UMUM"
  },
  "use_llm": true,
  "model": "gpt-5-nano",
  "retriever": "auto"
}
```

| Field | Wajib | Default | Keterangan |
| --- | --- | --- | --- |
| `query` | Ya | — | Pertanyaan yang tidak boleh kosong |
| `top_k` | Tidak | `5` | Jumlah hasil retrieval maksimum |
| `filters` | Tidak | `null` | Filter `filename` dan `section_title` |
| `use_llm` | Tidak | `false` | Mengaktifkan penyusunan jawaban oleh LLM |
| `model` | Tidak | model default | Model chat yang digunakan |
| `retriever` | Tidak | `auto` | `auto`, `tfidf`, atau `vector` pada JSON store |

Response grounded `200`:

```json
{
  "answer": "Maksimal biaya hotel level Manager adalah Rp900.000 per malam.",
  "citations": [
    {
      "document_id": "document-id",
      "filename": "sop_perjalanan.pdf",
      "version": 1,
      "page_number": 1,
      "section_title": "KETENTUAN UMUM",
      "chunk_id": "chunk-id"
    }
  ],
  "grounded": true,
  "retrieval": [
    { "chunk_id": "chunk-id", "score": 0.71 }
  ]
}
```

Response no-answer `200`:

```json
{
  "answer": "Informasi tidak ditemukan pada dokumen yang tersedia.",
  "citations": [],
  "grounded": false,
  "retrieval": []
}
```

Query kosong menghasilkan:

```json
{ "detail": "query must not be empty" }
```

dengan HTTP `400`.

Aturan:

- Citation selalu berasal dari metadata chunk hasil retrieval.
- `grounded: false` adalah hasil no-answer, bukan kegagalan HTTP.
- LLM tidak boleh membuat citation.
- `retriever` hanya berpengaruh pada JSON store; pgvector selalu memakai vector.

## 3. Ingest saat ini

### `POST /ingest`

Kontrak ini bersifat sementara dan hanya menerima direktori yang dapat dibaca
oleh filesystem AI Service.

Request:

```json
{
  "input_dir": "sample_docs",
  "embed": true,
  "model": "text-embedding-3-small"
}
```

Response `200`:

```json
{
  "documents": [
    {
      "filename": "sop_perjalanan.txt",
      "document_id": "document-id",
      "version": 1,
      "num_chunks": 1,
      "status": "indexed"
    }
  ],
  "store": "json"
}
```

Pada PostgreSQL, `status` dapat bernilai `indexed` atau `unchanged`. JSON store
saat ini tidak selalu menyertakan `status` pada item response.

Direktori yang tidak ditemukan menghasilkan HTTP `400`:

```json
{ "detail": "input_dir not found: sample_docs" }
```

Keterbatasan:

- Path dipahami dari sisi AI Service/container, bukan dari Backend atau browser.
- Endpoint belum menerima file multipart atau binary dari PostgreSQL.
- Endpoint belum menerima `documentVersionId` Backend.
- Kontrak ini belum sesuai untuk alur upload production MVP.

## 4. Daftar dokumen AI

### `GET /documents`

Target response:

```json
[
  {
    "filename": "sop_perjalanan.txt",
    "document_id": "document-id",
    "version": 1,
    "chunks": 1
  }
]
```

Mode JSON menghasilkan bentuk tersebut. Mode PostgreSQL saat ini memiliki
ketidaksesuaian `num_chunks` versus `chunks` yang harus diperbaiki sebelum
endpoint dianggap stabil.

## 5. Delete dokumen AI

### `DELETE /documents/{filename}`

Response `200`:

```json
{ "ok": true, "filename": "sop_perjalanan.txt" }
```

Jika file tidak ditemukan:

```json
{ "detail": "document not found: sop_perjalanan.txt" }
```

dengan HTTP `404`.

Pada store standalone, delete menghapus document, chunk, dan embedding terkait.

## Metadata citation

Metadata minimum yang harus dipertahankan dari ingestion sampai response:

```json
{
  "document_id": "string",
  "filename": "string",
  "version": 1,
  "page_number": 1,
  "section_title": "string",
  "chunk_id": "string",
  "text": "string"
}
```

Untuk integrasi final, `document_id` perlu diganti atau dilengkapi dengan
`document_version_id` UUID yang berasal dari Backend/Prisma.

## Kontrak ingestion yang dituju

Backend menyimpan binary file pada PostgreSQL `bytea`. Alur target yang perlu
disepakati dan diimplementasikan:

```text
Frontend upload PDF/DOCX
→ Backend membuat Document, DocumentVersion, dan ProcessingJob
→ Backend mengirim file dan documentVersionId ke AI
→ AI parse, chunk, embed, dan menyimpan chunk
→ AI mengembalikan jumlah chunk
→ Backend memperbarui job dan status Document
```

Request target sebaiknya membawa:

```text
documentVersionId
filename
mimeType
file
```

Pilihan sederhana untuk MVP adalah multipart dari Backend ke AI. Keputusan ini
belum diterapkan dan merupakan perubahan kontrak berikutnya.

Aturan target:

- `documentVersionId` berasal dari Backend; AI tidak membuat ID dokumen sendiri.
- Re-ingest ID dan checksum yang sama tidak menduplikasi chunk.
- Re-ingest versi yang sama mengganti chunk secara transaksional.
- Delete versi/dokumen membersihkan chunk dan embedding terkait.
- Citation menyimpan referensi ke `DocumentVersion.id` yang benar.

## Alur query yang dituju

```text
Frontend POST /chat/query ke Backend
→ Backend menyimpan pesan user
→ Backend POST /ask ke AI
→ AI mengembalikan answer, grounded, retrieval, dan citations
→ Backend memvalidasi documentVersionId dan menyimpan citation
→ Backend mengembalikan response UI
```

Backend harus mempertahankan `grounded: false` sebagai state no-answer dan tidak
mengubahnya menjadi error atau jawaban karangan.

## Checklist sebelum kontrak dinyatakan stabil

1. Hilangkan konflik tabel `documents`.
2. Jadikan `document_versions.id` sebagai referensi chunk.
3. Perbaiki parameter SQL vector search dan test dengan PostgreSQL asli.
4. Samakan field `chunks` pada response semua store.
5. Tetapkan endpoint ingestion file dan ukuran maksimal request.
6. Tambahkan timeout serta penanganan error pada Backend AI client.
7. Uji idempotency, delete cascade, no-answer, dan citation end-to-end.
8. Perbarui version dokumen ini setelah kontrak disepakati tim.
