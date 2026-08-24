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
  "model": "deepseek-v4-pro",
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
  saat `DATABASE_URL` diset (pgvector) retrieval selalu vector. Jika nilainya
  `auto`, service memakai `AI_RETRIEVER` (default `tfidf`) supaya API key baru
  tidak otomatis mengaktifkan vector index yang belum di-embed ulang.
- `AI_USE_LLM=true` membuat AI service memakai model chat untuk request dari
  Backend. API key tetap hanya disimpan di environment AI service, tidak di
  Frontend atau Backend.

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

---

## Contoh integrasi NestJS (buat Backend Engineer)

### 0. Yang perlu disiapkan Backend Engineer

1. Pastikan AI Service jalan (dari root repo):
   `docker compose up -d postgres ai-api`
2. Set env di backend:
   - `AI_SERVICE_URL=http://ai-api:8000` (dalam docker network, nama service =
     hostname) atau `http://localhost:8000` (kalau AI jalan lokal)
3. (Opsional) Eksplorasi endpoint interaktif: `http://localhost:8000/docs`
   (Swagger, auto-generated). `SUMOPOD_API_KEY` & `DATABASE_URL` diurus AI
   Service — Backend tidak perlu tahu isinya.

### 1. Service wrapper (taruh di `src/ai/ai.service.ts`)

```typescript
import { Injectable } from '@nestjs/common';

export interface Citation {
  document_id: string;
  filename: string;
  version: number;
  page_number: number;
  section_title: string;
  chunk_id: string;
}

export interface AskResult {
  answer: string;
  citations: Citation[];
  grounded: boolean;
  retrieval?: { chunk_id: string; score: number }[];
}

@Injectable()
export class AiService {
  // Di docker: http://ai-api:8000 — lokal: http://localhost:8000
  private readonly baseUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';

  async ask(
    query: string,
    options?: { useLlm?: boolean; filters?: Record<string, string> },
  ): Promise<AskResult> {
    const res = await fetch(`${this.baseUrl}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        top_k: 5,
        filters: options?.filters,
        use_llm: options?.useLlm ?? true,
      }),
    });
    if (!res.ok) {
      throw new Error(`AI service error ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as AskResult;
  }

  async ingest(inputDir: string) {
    const res = await fetch(`${this.baseUrl}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input_dir: inputDir, embed: true }),
    });
    if (!res.ok) {
      throw new Error(`AI ingest error ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }
}
```

Register di module (jangan lupa `@Module({ providers: [AiService], exports: [AiService] })`).

### 2. Contoh pemakaian di chat flow

```typescript
// src/chat/chat.service.ts (potongan)
const result = await this.aiService.ask(question);

// grounded=false -> ini NO-ANSWER, bukan error:
// kirim state ke frontend supaya UI menampilkan "informasi tidak ditemukan"
return {
  answer: result.answer,
  citations: result.citations,
  grounded: result.grounded,
};
```

### 3. Catatan alur upload

Endpoint `/ingest` sekarang menerima `input_dir` (path di sisi AI Service).
Untuk alur upload asli (Frontend kirim file → Backend simpan), ada 2 opsi yang
harus disepakati di kickoff:

- **Opsi A (paling sederhana):** Backend menulis file upload ke direktori
  bersama yang bisa dibaca AI Service (misal volume docker), lalu panggil
  `POST /ingest` dengan path-nya.
- **Opsi B:** AI Service menambah endpoint `POST /documents` (multipart)
  supaya file dikirim langsung. Ini perubahan kontrak → perlu PR + review.

Apapun opsi yang dipilih, alur tetap: upload → `POST /ingest` → dapat
`document_id` → update status job `ready` → frontend polling.
