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

Untuk runtime nyata, sistem memerlukan credential Neon (PostgreSQL dengan
pgvector) dan SumoPod. Credential tidak disediakan oleh repository.

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
database Neon dengan ekstensi `vector`, serta API key SumoPod yang aktif.

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
| `AI_SERVICE_URL` | URL AI dari Backend; lokal `http://127.0.0.1:8001` |
| `SUMOPOD_API_KEY` | Akses embedding/LLM AI Service |
| `VITE_API_BASE_URL` | Base URL Backend dari browser lokal |

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

## Kontrak pemrosesan dokumen

Backend menyediakan kontrak internal bagi worker milik AI Engineer. Kontrak ini hanya mengatur antrean, akses file, dan perubahan status; parsing, chunking, embedding, retrieval, dan LLM tidak diimplementasikan oleh Backend.

Semua endpoint berikut membutuhkan header `X-Worker-Token` yang nilainya sama dengan `WORKER_TOKEN`:

- `POST /internal/processing-jobs/claim` — mengambil job `QUEUED` paling lama dan mengubah job serta dokumen menjadi `PROCESSING`.
- `GET /internal/processing-jobs/:id/file` — mengambil binary PDF/DOCX untuk job yang sudah di-claim.
- `PATCH /internal/processing-jobs/:id/result` — menerima hasil `COMPLETED` atau `FAILED` dan memperbarui status dokumen menjadi `READY` atau `FAILED` secara transaksional.

Nilai `WORKER_TOKEN` harus berbeda dari `JWT_SECRET` dan tidak boleh dikirim ke frontend atau disimpan di Git.

## Persistence percakapan

Endpoint percakapan membutuhkan JWT `ADMIN` atau `USER`. Setiap akun hanya dapat mengakses percakapan miliknya sendiri:

- `POST /conversations` — membuat percakapan kosong dengan judul opsional.
- `GET /conversations` — menampilkan daftar percakapan sendiri, jumlah pesan, dan preview pesan terakhir.
- `GET /conversations/:id` — menampilkan riwayat pesan dan metadata citation dari percakapan sendiri.
- `POST /conversations/:id/messages` — menyimpan pesan `USER` tanpa menjalankan AI.

Judul percakapan yang kosong otomatis diambil dari 100 karakter pertama pesan pertama. Endpoint publik tidak menerima field role, sehingga client tidak dapat membuat pesan `ASSISTANT` atau `SYSTEM`. Penyimpanan jawaban AI dan citation akan dilakukan melalui kontrak internal pada tahap integrasi AI berikutnya.

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
