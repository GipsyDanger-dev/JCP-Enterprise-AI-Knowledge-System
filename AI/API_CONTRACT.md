# API Contract — Backend dan AI Service

Version: `0.3`

Status: terimplementasi di level kode; validasi runtime end-to-end masih diperlukan.

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

Schema chunk sudah diperbaiki:

- Prisma menjadi pemilik schema dan migration.
- AI tidak lagi membuat tabel `documents` atau `chunks` saat startup.
- `chunks.document_version_id` mereferensikan `document_versions.id` dengan
  `ON DELETE CASCADE`.
- Metadata dokumen dibaca melalui join ke schema Backend.
- Vector search dan metadata filter memakai parameter SQL yang sesuai urutan.
- Citation PostgreSQL membawa `document_version_id` hasil retrieval.
- Retrieval hanya memakai dokumen aktif berstatus `READY` dan versi terbaru.
- Worker mengambil binary `bytea` melalui endpoint internal Backend, lalu melakukan
  parse, embedding, dan replace chunk secara atomik.
- Backend `POST /chat/query` memanggil `/ask` dan menyimpan percakapan serta
  citation yang sudah divalidasi.

Yang belum terbukti adalah runtime nyata PostgreSQL/pgvector dan provider AI.
Worker juga belum memiliki lease/reaper untuk mengembalikan job `PROCESSING`
yang tertinggal bila proses berhenti setelah claim.

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
      "document_version_id": "document-version-uuid",
      "filename": "sop_perjalanan.pdf",
      "version": 1,
      "page_number": 1,
      "section_title": "KETENTUAN UMUM",
      "chunk_id": "chunk-id"
    }
  ],
  "grounded": true,
  "retrieval": [
    {
      "chunk_id": "chunk-id",
      "score": 0.71,
      "text": "Maksimal biaya hotel level Manager adalah Rp900.000 per malam."
    }
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
- `retrieval[].text` berasal dari chunk yang sama dan digunakan Backend sebagai
  excerpt citation; nilainya bukan hasil karangan LLM.
- `retriever` hanya berpengaruh pada JSON store; pgvector selalu memakai vector.

## 3. Manual ingest endpoint

### `POST /ingest`

Kontrak ini bersifat sementara dan hanya menerima direktori yang dapat dibaca
oleh filesystem AI Service.

Request:

```json
{
  "input_dir": "sample_docs",
  "document_version_id": "document-version-uuid",
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
      "document_version_id": "document-version-uuid",
      "version": 1,
      "num_chunks": 1,
      "status": "indexed"
    }
  ],
  "store": "pgvector"
}
```

Pada PostgreSQL, `document_version_id` wajib berupa UUID dan direktori harus
memuat tepat satu file yang nama serta checksum-nya sesuai metadata Backend.
`status` dapat bernilai `indexed` atau `unchanged`. `unchanged` hanya dikembalikan
jika versi memiliki minimal satu chunk dan seluruh chunk sudah memiliki embedding.
JSON store tidak memerlukan `document_version_id` dan tidak selalu menyertakan
`status`.

Direktori yang tidak ditemukan menghasilkan HTTP `400`:

```json
{ "detail": "input_dir not found: sample_docs" }
```

Keterbatasan:

- Path dipahami dari sisi AI Service/container, bukan dari Backend atau browser.
- Endpoint ini tidak menerima multipart atau binary secara langsung.
- Alur aplikasi normal menggunakan `ai-worker`, bukan endpoint manual ini.

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

Mode JSON dan PostgreSQL menghasilkan field `chunks`. Response PostgreSQL juga
menyertakan `document_version_id`.

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

Pada PostgreSQL, metadata citation dilengkapi dengan `document_version_id` UUID
yang berasal dari Backend/Prisma.

## Kontrak worker ingestion

Backend menyimpan binary file pada PostgreSQL `bytea`. `ai-worker` memakai
kontrak internal berikut dengan header `X-Worker-Token`:

- `POST /internal/processing-jobs/claim`
- `GET /internal/processing-jobs/{jobId}/file`
- `PATCH /internal/processing-jobs/{jobId}/result`

Alur yang terimplementasi:

```text
Frontend upload PDF/DOCX
→ Backend membuat Document, DocumentVersion, dan ProcessingJob
→ Worker claim job dan mengunduh binary dari Backend
→ Worker parse dan membuat seluruh embedding sebelum mutasi database
→ Worker mengganti chunk dan embedding versi tersebut dalam satu transaksi
→ Worker melaporkan COMPLETED atau FAILED ke Backend
→ Backend memperbarui job dan status Document secara transaksional
```

Aturan:

- `documentVersionId` berasal dari Backend; AI tidak membuat ID dokumen sendiri.
- Filename harus berupa basename aman dan checksum harus cocok dengan metadata.
- Re-ingest hanya menjadi no-op bila semua chunk memiliki embedding.
- Retry atas data parsial membangun ulang satu versi secara transaksional.
- Delete versi/dokumen membersihkan chunk dan embedding terkait.
- Citation menyimpan referensi ke `DocumentVersion.id` yang benar.

## Alur query terintegrasi

```text
Frontend POST /chat/query ke Backend
→ Backend memvalidasi JWT dan kepemilikan conversation
→ Backend POST /ask ke AI
→ AI mengembalikan answer, grounded, retrieval, dan citations
→ Backend memvalidasi documentVersionId serta provenance excerpt
→ Backend menyimpan pesan user, jawaban, dan citation dalam transaksi
→ Backend mengembalikan response UI
```

Backend harus mempertahankan `grounded: false` sebagai state no-answer dan tidak
mengubahnya menjadi error atau jawaban karangan.

## Checklist sebelum kontrak dinyatakan stabil

1. Terapkan dan verifikasi seluruh migration pada PostgreSQL target.
2. Uji upload, worker, vector search, LLM, no-answer, dan citation dengan provider nyata.
3. Tambahkan lease/reaper untuk pemulihan job `PROCESSING` setelah worker crash.
4. Jalankan browser E2E untuk akun `ADMIN` dan `USER` terhadap stack asli.
5. Verifikasi secret, port, reverse proxy, backup, dan health check di VPS.
