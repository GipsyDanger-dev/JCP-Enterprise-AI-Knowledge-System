# Enterprise AI Knowledge System

Monorepo MVP gudang dokumen internal dengan AI chat berbasis RAG. Admin dapat
mengunggah PDF/DOCX, sistem memproses dan mengindeks isinya, lalu user bertanya
dan menerima jawaban dengan citation dari chunk hasil retrieval.

## Status project

Project ini menggabungkan Backend, Frontend, dan AI Service dalam satu alur
RAG: login, upload dokumen, ingest, retrieval, chat, citation, dan riwayat
percakapan.

| Komponen | Status |
| --- | --- |
| Backend auth | Sudah diimplementasikan (JWT dan role guard) |
| Backend documents | Sudah diimplementasikan (upload, list, status, delete) |
| Backend chat, AI, users | Terhubung ke AI Service dan database |
| Frontend | Terhubung ke Backend asli, tanpa mock runtime |
| AI Service | Ingestion, retrieval, generation, citation, dan evaluasi tersedia |
| Integrasi Backend–AI | Backend meneruskan file ke endpoint ingestion AI |

Database PostgreSQL + pgvector dapat berjalan lokal melalui Docker Compose
atau memakai database eksternal (misal Neon dengan ekstensi `vector`). Runtime
AI memerlukan credential provider OpenAI-compatible yang tidak disediakan oleh
repository.

## Tech stack

| Layer | Teknologi |
| --- | --- |
| Frontend | React + Vite + TypeScript |
| Backend | NestJS 11 + Prisma + TypeScript |
| AI Service | Python + FastAPI |
| Database | PostgreSQL + pgvector |
| Penyimpanan file | PostgreSQL `bytea` |
| Deployment | Docker Compose |

Project tidak menggunakan MinIO, S3, atau object storage pihak ketiga.

## Struktur repository

```text
JCP-Enterprise-AI-Knowledge-System/
├── AI/                 # FastAPI dan pipeline RAG
├── backend/            # NestJS, Prisma, auth, dan documents
├── frontend/           # React/Vite UI dan mock API
├── docker-compose.yml
├── .env.example
└── README.md
```

## Menjalankan lokal tanpa Docker

Prasyarat: Node.js, Python 3, dependensi masing-masing service sudah terpasang,
database PostgreSQL dengan ekstensi `vector` (Docker Compose lokal atau
eksternal seperti Neon), serta API key provider AI OpenAI-compatible yang aktif.

```powershell
Copy-Item .env.example .env
# Isi .env, lalu jalankan migration, optional seed, dan seluruh service native.
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Seed
```

Skrip membaca `.env` hanya ke process environment, tidak mencetak credential,
menjalankan Prisma migration/seed, lalu menyalakan AI API, Backend, dan Frontend.
Gunakan `-Seed` saat pertama kali menyiapkan akun uji; berikutnya parameter itu
boleh dihilangkan.

Jika port `5173` sedang dipakai, isi `FRONTEND_PORT` dengan port kosong di
`.env` sebelum menjalankan launcher.

Perintah di atas memakai frontend development untuk pekerjaan lokal. Untuk VPS,
set `VITE_API_BASE_URL` ke URL HTTPS Backend lalu gunakan override production:

```powershell
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Gunakan file production secara langsung agar bind mount dan service PostgreSQL
lokal dari Compose development tidak ikut terbawa ke VPS. Stack production
membangun aset Vite lalu menyajikannya melalui Nginx. Karena nilai frontend
masuk saat build, perubahan konfigurasi build memerlukan rebuild image.

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| Backend | http://localhost:8000 |
| Backend health | http://localhost:8000/health |
| Backend Swagger | http://localhost:8000/api/docs |
| AI Service | http://localhost:8001 |
| AI health | http://localhost:8001/health |
| AI Swagger | http://localhost:8001/docs |
| PostgreSQL | Neon (sesuai `DATABASE_URL`) |

Hentikan service lokal dengan:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-local.ps1
```

Docker Compose dipakai pada tahap deployment VPS, bukan sebagai prasyarat
runtime lokal.

## Environment

Salin `.env.example` menjadi `.env`. Jangan commit `.env` atau credential asli.

| Variable | Kegunaan |
| --- | --- |
| `DATABASE_URL` | Koneksi PostgreSQL bersama |
| `JWT_SECRET` | Penandatanganan JWT Backend |
| `GOOGLE_CLIENT_ID` | OAuth Web Client ID untuk memverifikasi Google ID token di Backend |
| `VITE_GOOGLE_CLIENT_ID` | OAuth Web Client ID publik untuk Google Identity Services di Frontend |
| `AI_SERVICE_URL` | URL AI dari Backend; lokal `http://127.0.0.1:8001`, Docker `http://ai-api:8000` |
| `WORKER_TOKEN` | Shared secret Backend <-> AI Service (header `X-Worker-Token`) |
| `AI_PROVIDER_API_KEY` | API key provider AI yang kompatibel OpenAI |
| `AI_PROVIDER_BASE_URL` | Base URL provider AI, misalnya `https://provider.example/v1` |
| `AI_CHAT_MODEL` | ID model chat sesuai daftar model provider |
| `AI_EMBEDDINGS_ENABLED` | Isi `false` bila provider tidak menyediakan `/v1/embeddings` |
| `VITE_API_BASE_URL` | Base URL Backend dari browser lokal; `/api` berarti satu origin lewat proxy |

## Database dan seed

Schema dan migration Prisma berada di `backend/prisma`.

```powershell
docker compose exec backend npx prisma migrate status
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run prisma:seed
```

Seed menggunakan variabel `SEED_*` dan bersifat idempotent.

```text
users
├── documents
│   └── document_versions
│       ├── document_files
│       ├── processing_jobs
│       └── citations
└── conversations
    └── messages
        └── citations
```

Binary PDF/DOCX disimpan pada `document_files.content` sebagai PostgreSQL
`bytea`. Query daftar dokumen tidak mengambil binary file.

## Endpoint Backend yang tersedia

Endpoint pengelolaan akun berikut hanya dapat digunakan oleh `ADMIN`:

- `GET /users` — menampilkan profil aman seluruh akun tanpa `passwordHash`.
- `POST /users` — membuat akun aktif dengan role `USER` (default) atau `ADMIN`; password minimal 12 karakter dan disimpan sebagai hash `scrypt`.

## Penyimpanan dokumen Backend

Auth:

- `POST /auth/login`
- `GET /auth/me`

Documents:

- `POST /documents` — khusus `ADMIN`, multipart `file`, optional `title`
- `GET /documents` — admin melihat dokumen aktif; user hanya dokumen `READY`
- `GET /documents/:id/status` — khusus `ADMIN`
- `DELETE /documents/:id` — khusus `ADMIN`

Backend tidak menggunakan MinIO untuk alur dokumen ini. Service MinIO di environment tetap dibiarkan sampai keputusan infrastructure diperbarui oleh owner DevOps.

### Visibilitas dokumen per divisi

Admin dapat membatasi dokumen ke satu divisi saat upload (field `division`).
Karyawan hanya melihat dokumen `READY` yang bersifat publik atau milik
divisinya; admin melihat semua dokumen. Download dan preview chunk menerapkan
filter yang sama.

### Transport file ke AI (multipart)

`DocumentProcessorService` membaca binary dari PostgreSQL `bytea` lalu
mengirimnya ke `POST /ingest-file` AI Service sebagai multipart. Backend dan AI
tidak perlu berbagi filesystem, sehingga alur upload–ingest aman di Docker
dengan container terpisah.

## Kontrak pemrosesan dokumen

Backend menyediakan kontrak internal bagi worker milik AI Engineer. Kontrak ini hanya mengatur antrean, akses file, dan perubahan status; parsing, chunking, embedding, retrieval, dan LLM tidak diimplementasikan oleh Backend.

Semua endpoint berikut membutuhkan header `X-Worker-Token` yang nilainya sama dengan `WORKER_TOKEN`:

- `POST /internal/processing-jobs/claim` — mengambil job `QUEUED` paling lama dan mengubah job serta dokumen menjadi `PROCESSING`.
- `GET /internal/processing-jobs/:id/file` — mengambil binary PDF/DOCX untuk job yang sudah di-claim.
- `PATCH /internal/processing-jobs/:id/result` — menerima hasil `COMPLETED` atau `FAILED` dan memperbarui status dokumen menjadi `READY` atau `FAILED` secara transaksional.

Nilai `WORKER_TOKEN` harus berbeda dari `JWT_SECRET` dan tidak boleh dikirim ke frontend atau disimpan di Git.

## Messaging real-time (SSE)

Pesan langsung karyawan ↔ admin memakai Server-Sent Events:

- `GET /messaging/stream?token=...` — stream pesan baru, edit, hapus, dan
  indikator mengetik (token lewat query karena EventSource tidak bisa
  mengirim header Authorization).
- `POST /messaging/:conversationId/typing` — menyiarkan status mengetik ke
  lawan bicara.

Frontend menggantikan polling 2 detik dengan stream ini; EventSource
terhubung otomatis kembali jika koneksi terputus.

## Persistence percakapan

Endpoint percakapan membutuhkan JWT `ADMIN` atau `USER`. Setiap akun hanya dapat mengakses percakapan miliknya sendiri:

- `POST /conversations` — membuat percakapan kosong dengan judul opsional.
- `GET /conversations` — menampilkan daftar percakapan sendiri, jumlah pesan, dan preview pesan terakhir.
- `GET /conversations/:id` — menampilkan riwayat pesan dan metadata citation dari percakapan sendiri.
- `POST /conversations/:id/messages` — menyimpan pesan `USER` tanpa menjalankan AI.

Judul percakapan yang kosong otomatis diambil dari 100 karakter pertama pesan pertama. Endpoint publik tidak menerima field role, sehingga client tidak dapat membuat pesan `ASSISTANT` atau `SYSTEM`. Penyimpanan jawaban AI dan citation akan dilakukan melalui kontrak internal pada tahap integrasi AI berikutnya.

Untuk akun `PERSONAL`, Ask AI hanya mengambil chunk dari dokumen milik akun
tersebut. Bidang tidak di-hardcode: prompt menentukan topik secara dinamis dari
isi file hasil retrieval. Saat embedding dinonaktifkan, pencarian memakai TF-IDF
lokal dan provider eksternal hanya menyusun jawaban dari konteks beserta citation.

## Audit logs

Backend menyimpan aktivitas penting ke tabel PostgreSQL `audit_logs` dalam transaksi yang sama dengan aksi utamanya. Event yang dicatat:

- Login berhasil.
- Pembuatan akun.
- Upload dan delete dokumen.
- Claim processing job.
- Processing job selesai atau gagal.

`GET /audit-logs` hanya dapat digunakan `ADMIN` dan mendukung pagination serta filter `action`, `actorUserId`, `targetType`, dan `targetId`. Audit metadata hanya berisi identifier dan metadata operasional yang aman; password, JWT, worker token, dan binary dokumen tidak disimpan.

## Pengujian

```powershell
# AI
cd AI
python -m unittest discover -s tests -v
python evaluate.py

# Frontend
cd ../frontend
npm install
npm run lint
npm run build
npm run test:e2e

# Backend
cd ../backend
npm install
npm run build
```

Citation harus berasal dari metadata chunk yang benar-benar diretrieval. Jika
bukti tidak cukup, sistem mengembalikan state no-answer dan tidak menebak.
