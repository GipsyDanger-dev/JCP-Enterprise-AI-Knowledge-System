# Enterprise AI Knowledge System

Monorepo MVP gudang dokumen internal dengan AI chat berbasis RAG. Admin dapat
mengunggah PDF/DOCX, sistem memproses dan mengindeks isinya, lalu user bertanya
dan menerima jawaban dengan citation dari chunk hasil retrieval.

## Status project

Project ini merupakan hasil penggabungan Backend, Frontend, dan AI Service yang
sebelumnya dikembangkan terpisah. Integrasi kode dan Docker Compose tersedia;
validasi runtime end-to-end dengan PostgreSQL dan provider AI nyata belum selesai.

| Komponen | Status |
| --- | --- |
| Backend auth | Sudah diimplementasikan (JWT dan role guard) |
| Backend documents | Sudah diimplementasikan (upload, list, status, delete) |
| Backend chat, AI, users | Sudah diimplementasikan dengan persistence dan role guard |
| Frontend | Menggunakan API Backend asli; browser E2E nyata masih perlu dijalankan |
| AI Service | Ingestion, retrieval, generation, citation, dan evaluasi tersedia |
| Integrasi Backend–AI | Worker pemrosesan tersedia; validasi runtime end-to-end masih diperlukan |

Masalah integrasi utama yang tersisa:

1. Alur chat Backend ke AI masih perlu divalidasi end-to-end dengan provider asli.
2. Worker belum memiliki lease/reaper untuk memulihkan job `PROCESSING` jika proses
   berhenti setelah claim.
3. Seluruh stack masih perlu menjalani pengujian runtime dengan PostgreSQL nyata.

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
├── frontend/           # React/Vite UI dan client API Backend
├── docker-compose.yml
├── .env.example
└── README.md
```

## Menjalankan seluruh service

Prasyarat: Git, Docker Desktop/Docker Engine, dan Docker Compose v2.

```powershell
Copy-Item .env.example .env
# Ganti seluruh nilai CHANGE_ME dan periksa port sebelum menjalankan stack.
docker compose up --build
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| Backend | http://localhost:8000 |
| Backend health | http://localhost:8000/health |
| Backend Swagger | http://localhost:8000/api/docs |
| AI Service | http://localhost:8001 |
| AI health | http://localhost:8001/health |
| AI Swagger | http://localhost:8001/docs |
| AI Worker | Background service tanpa port publik |
| PostgreSQL | 127.0.0.1:5432 (default, dapat diubah) |

Hentikan service dengan `docker compose down`. Jangan gunakan flag `-v` kecuali
memang ingin menghapus seluruh data PostgreSQL pada volume lokal.

> Backend, AI API, dan AI Worker memakai `DATABASE_URL` yang sama. Worker
> mengambil binary melalui kontrak internal Backend lalu mengindeksnya ke
> `document_versions` yang diklaim.

## Environment

Salin `.env.example` menjadi `.env`. Jangan commit `.env` atau credential asli.

| Variable | Kegunaan |
| --- | --- |
| `POSTGRES_PASSWORD` | Password role database; harus cocok dengan password pada DSN |
| `DATABASE_URL` | Koneksi PostgreSQL bersama |
| `BIND_ADDRESS` | Host bind Compose; default aman `127.0.0.1` |
| `POSTGRES_PORT`, `BACKEND_PORT`, `AI_API_PORT`, `FRONTEND_PORT` | Host port yang dapat disesuaikan |
| `JWT_SECRET` | Penandatanganan JWT Backend |
| `AI_SERVICE_URL` | URL internal AI dari container Backend |
| `AI_SERVICE_TIMEOUT_MS` | Timeout panggilan Backend ke AI API |
| `WORKER_TOKEN` | Token internal terpisah untuk kontrak processing job |
| `SUMOPOD_API_KEY` | Akses embedding/LLM AI Service |
| `WORKER_POLL_SECONDS` | Jeda polling worker saat antrean kosong (1–60 detik) |
| `VITE_API_BASE_URL` | Base URL Backend dari Frontend |

Di jaringan Docker, Backend memanggil AI melalui `http://ai-api:8000`. Port
`8001` hanya merupakan port AI yang diekspos ke host.

### Checklist environment VPS

Sebelum menjalankan Compose di VPS:

1. Ganti `POSTGRES_PASSWORD`; bagian password pada `DATABASE_URL` harus mewakili
   secret yang sama dan harus di-URL-encode bila mengandung karakter khusus.
2. Isi `JWT_SECRET`, `WORKER_TOKEN`, dan `SUMOPOD_API_KEY` dengan secret acak yang
   berbeda. Jangan kirim nilainya ke frontend atau commit ke Git.
3. Biarkan seluruh `SEED_*` kosong dan jangan jalankan `prisma:seed` di production.
   Jika seed memang diperlukan, gunakan password unik sementara lalu kosongkan lagi.
4. Set `VITE_API_BASE_URL` ke URL HTTPS Backend yang diakses browser, bukan
   `localhost`, lalu periksa `POSTGRES_PORT`, `BACKEND_PORT`, `AI_API_PORT`, dan
   `FRONTEND_PORT` agar tidak bentrok dengan service VPS yang sudah berjalan.
5. Pertahankan `BIND_ADDRESS=127.0.0.1` dan publikasikan aplikasi melalui reverse
   proxy. Ubah binding hanya jika firewall dan topologi jaringan memang memerlukannya.

Pada volume PostgreSQL yang sudah ada, mengganti `POSTGRES_PASSWORD` di `.env`
tidak otomatis mengubah password role di database. Rotasi role PostgreSQL dan
`DATABASE_URL` harus dilakukan bersama dalam maintenance window.

## Database dan seed

Schema dan migration Prisma berada di `backend/prisma`.

```powershell
docker compose exec backend npx prisma migrate status
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run prisma:seed
```

Seed menggunakan variabel `SEED_*` dan bersifat idempotent.
Compose tidak menjalankan seed secara otomatis.

```text
users
├── documents
│   └── document_versions
│       ├── document_files
│       ├── processing_jobs
│       ├── chunks
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
- `DELETE /users/:id` — menonaktifkan akun secara soft delete; admin tidak dapat
  menonaktifkan dirinya sendiri atau satu-satunya admin aktif.

## Penyimpanan dokumen Backend

Auth:

- `POST /auth/login`
- `GET /auth/me`

Documents:

- `POST /documents` — khusus `ADMIN`, multipart `file`, optional `title`
- `GET /documents` — admin melihat dokumen aktif; user hanya dokumen `READY`
- `GET /documents/:id/status` — khusus `ADMIN`
- `DELETE /documents/:id` — khusus `ADMIN`

Backend tidak menggunakan MinIO untuk alur dokumen ini dan Compose repository
ini tidak mendefinisikan service MinIO.

## Kontrak pemrosesan dokumen

Backend menyediakan kontrak internal bagi worker milik AI Engineer. Kontrak ini hanya mengatur antrean, akses file, dan perubahan status; parsing, chunking, embedding, retrieval, dan LLM tidak diimplementasikan oleh Backend.

Semua endpoint berikut membutuhkan header `X-Worker-Token` yang nilainya sama dengan `WORKER_TOKEN`:

- `POST /internal/processing-jobs/claim` — mengambil job `QUEUED` paling lama dan mengubah job serta dokumen menjadi `PROCESSING`.
- `GET /internal/processing-jobs/:id/file` — mengambil binary PDF/DOCX untuk job yang sudah di-claim.
- `PATCH /internal/processing-jobs/:id/result` — menerima hasil `COMPLETED` atau `FAILED` dan memperbarui status dokumen menjadi `READY` atau `FAILED` secara transaksional.

Service `ai-worker` melakukan alur tersebut secara otomatis. Setiap job ditulis
ke satu temporary directory dengan basename asli yang divalidasi, diproses oleh
`PgVectorStore` dan `ingest_to_pg`, lalu temporary file selalu dibersihkan.
Kegagalan ingestion dilaporkan sebagai `FAILED` dengan pesan yang disanitasi;
pelaporan hasil dicoba ulang secara terbatas.

Nilai `WORKER_TOKEN` harus berbeda dari `JWT_SECRET` dan tidak boleh dikirim ke frontend atau disimpan di Git.

## Persistence percakapan

Endpoint percakapan membutuhkan JWT `ADMIN` atau `USER`. Setiap akun hanya dapat mengakses percakapan miliknya sendiri:

- `POST /conversations` — membuat percakapan kosong dengan judul opsional.
- `GET /conversations` — menampilkan daftar percakapan sendiri, jumlah pesan, dan preview pesan terakhir.
- `GET /conversations/:id` — menampilkan riwayat pesan dan metadata citation dari percakapan sendiri.
- `POST /conversations/:id/messages` — menyimpan pesan `USER` tanpa menjalankan AI.
- `POST /chat/query` — memanggil AI, lalu menyimpan pertanyaan, jawaban, dan citation
  tervalidasi ke percakapan milik user.

Judul percakapan yang kosong otomatis diambil dari 100 karakter pertama pesan
pertama. Endpoint publik tidak menerima field role, sehingga client tidak dapat
membuat pesan `ASSISTANT` atau `SYSTEM`. `/chat/query` hanya menyimpan citation
yang merujuk document version aktif dan excerpt dari chunk retrieval yang sama.

## Audit logs

Backend menyimpan aktivitas penting ke tabel PostgreSQL `audit_logs` dalam transaksi yang sama dengan aksi utamanya. Event yang dicatat:

- Login berhasil.
- Pembuatan akun.
- Penonaktifan akun.
- Upload dan delete dokumen.
- Claim processing job.
- Processing job selesai atau gagal.

`GET /audit-logs` hanya dapat digunakan `ADMIN` dan mendukung pagination serta filter `action`, `actorUserId`, `targetType`, dan `targetId`. Audit metadata hanya berisi identifier dan metadata operasional yang aman; password, JWT, worker token, dan binary dokumen tidak disimpan.

## Pengujian

```powershell
# AI
cd AI
python -m pip install -r requirements.txt
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
