# API Contract — Backend (NestJS) ↔ AI Service (Python)

Version: 0.1 — status: draft untuk technical kickoff (slide 13 & 18 briefing).

AI Service adalah **HTTP service terpisah** yang dipanggil NestJS. Frontend
(Next.js) **tidak pernah** memanggil AI Service langsung — semua request
lewat Backend.

- Base URL: `http://ai-api:8000` (docker network) / `http://localhost:8000` (local)
- Format: JSON, UTF-8
- OpenAPI docs otomatis: `GET /docs` (FastAPI Swagger)
- Auth antar-service: belum ada (internal network). Jangan expose ke publik
  tanpa auth di sisi Backend.

---

## 1. `POST /ask` — pertanyaan → jawaban + citation

Request:
```json
{
  "query": "Berapa maksimal biaya hotel level Manager?",
  "top_k": 5,
  "filters": { "filename": "sop_perjalanan.pdf", "section_title": "KETENTUAN UMUM" },
  "use_llm": true,
  "model": "gpt-5-nano",
  "retriever": "auto"
}
```

Response `200`:
```json
{
  "answer": "Maksimal biaya hotel level Manager adalah Rp900.000 per malam.",
  "citations": [
    {
      "document_id": "b9d7a539-...",
      "filename": "sop_perjalanan.pdf",
      "version": 1,
      "page_number": 1,
      "section_title": "SOP Perjalanan Dinas 2026",
      "chunk_id": "b9d7a539-...-1"
    }
  ],
  "grounded": true,
  "retrieval": [ { "chunk_id": "b9d7a539-...-1", "score": 0.71 } ]
}
```

Response no-answer `200` (bukan error!):
```json
{
  "answer": "Informasi tidak ditemukan pada dokumen yang tersedia.",
  "citations": [],
  "grounded": false,
  "retrieval": []
}
```

Error `400`: `{"detail": "query must not be empty"}`

**Aturan penting:**
- `citations` SELALU berasal dari metadata chunk yang benar-benar
  diretrieval. AI tidak pernah mengarang citation.
- `grounded: false` berarti Backend/UI harus menampilkan state NO ANSWER
  (bukan error), sesuai slide 10.
- `filters` opsional; key yang didukung: `filename`, `section_title`
  (case-insensitive substring).
- `retriever` hanya berlaku untuk JSON store (`auto`/`tfidf`/`vector`);
  saat `DATABASE_URL` diset (pgvector) retrieval selalu vector.

## 2. `POST /ingest` — indeks dokumen

Request:
```json
{ "input_dir": "sample_docs", "embed": true, "model": "text-embedding-3-small" }
```
> `input_dir` relatif terhadap working directory container AI Service.
> Untuk alur upload (Frontend → Backend → storage), Backend menulis file ke
> direktori bersama lalu memanggil endpoint ini — atau kontrak diperluas
> dengan multipart upload (keputusan bersama di kickoff).

Response `200`:
```json
{
  "documents": [
    { "filename": "sop_perjalanan.txt", "document_id": "b9d7a539-...",
      "version": 1, "num_chunks": 1, "status": "indexed" }
  ],
  "store": "pgvector"
}
```
`status` = `indexed` (baru/berubah) atau `unchanged` (idempotent, content hash sama).

Error `400`: `{"detail": "input_dir not found: ..."}`

## 3. `GET /documents` — daftar dokumen terindeks

Response `200`:
```json
[
  { "filename": "sop_perjalanan.txt", "document_id": "b9d7a539-...", "version": 1, "chunks": 1 }
]
```

## 4. `DELETE /documents/{filename}` — hapus dokumen + chunk + embedding

Response `200`:
```json
{ "ok": true, "filename": "sop_perjalanan.txt" }
```
Error `404`: `{"detail": "document not found: ..."}`

## 5. `GET /health`

Response `200`:
```json
{
  "status": "ok",
  "store": "pgvector",
  "chat_model": "gpt-5-nano",
  "embedding_model": "text-embedding-3-small"
}
```

---

## Alur integrasi yang disarankan (backend)

**Upload dokumen:**
1. Frontend `POST /documents` (multipart) → Backend simpan file + buat
   `processing_jobs` row `queued`
2. Backend tulis file ke lokasi yang bisa dibaca AI Service → `POST /ingest`
3. `POST /ingest` balikin `{filename, document_id, version, num_chunks}`
4. Backend update job → `ready`, Frontend polling `GET /documents/:id/status`

**Chat:**
1. Frontend `POST /chat/query {question}` → Backend simpan conversation
2. Backend `POST /ask {query, filters, use_llm}`
3. Balikin ke Frontend: `{answer, citations, grounded}` → UI render jawaban +
   kartu citation (klik → viewer dokumen, slide 9/10)

## Kontrak metadata chunk (dipakai Backend sebagai referensi schema)

```json
{
  "document_id": "uuid",
  "filename": "string",
  "version": "int",
  "page_number": "int",
  "section_title": "string",
  "chunk_id": "string",
  "text": "string"
}
```
Ini kontrak minimum slide 7. Perubahan apa pun pada schema/response harus
lewat PR + disepakati sebelum merge (slide 13).
