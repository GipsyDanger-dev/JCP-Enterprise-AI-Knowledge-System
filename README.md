# Enterprise AI Knowledge System

Monorepo MVP gudang dokumen internal dengan AI chat berbasis RAG. Admin dapat
mengunggah PDF/DOCX, sistem memproses dan mengindeks isinya, lalu user bertanya
dan menerima jawaban dengan citation dari chunk hasil retrieval.

## Status project

Project ini merupakan hasil penggabungan Backend, Frontend, dan AI Service yang
sebelumnya dikembangkan terpisah. Fondasi setiap service sudah tersedia, tetapi
integrasi end-to-end belum selesai.

| Komponen | Status |
| --- | --- |
| Backend auth | Sudah diimplementasikan (JWT dan role guard) |
| Backend documents | Sudah diimplementasikan (upload, list, status, delete) |
| Backend chat, AI, users | Masih skeleton |
| Frontend | UI dan mock API tersedia; belum teruji penuh dengan Backend asli |
| AI Service | Ingestion, retrieval, generation, citation, dan evaluasi tersedia |
| Integrasi Backend–AI | Belum selesai |

Masalah integrasi utama yang tersisa:

1. Backend belum mengirim binary dokumen ke endpoint ingestion AI.
2. Modul Backend chat, AI wrapper, dan users masih skeleton.
3. Kontrak Frontend belum sama dengan Backend (field, UUID, role, dan status).

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

## Menjalankan seluruh service

Prasyarat: Git, Docker Desktop/Docker Engine, dan Docker Compose v2.

```powershell
Copy-Item .env.example .env
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
| PostgreSQL | localhost:5432 |

Hentikan service dengan `docker compose down`. Jangan gunakan flag `-v` kecuali
memang ingin menghapus seluruh data PostgreSQL pada volume lokal.

> AI Service dan Backend memakai database yang sama. Schema chunk sudah
> mereferensikan `document_versions`, tetapi alur pengiriman file dari Backend
> ke AI belum diimplementasikan.

## Environment

Salin `.env.example` menjadi `.env`. Jangan commit `.env` atau credential asli.

| Variable | Kegunaan |
| --- | --- |
| `DATABASE_URL` | Koneksi PostgreSQL bersama |
| `JWT_SECRET` | Penandatanganan JWT Backend |
| `AI_SERVICE_URL` | URL internal AI dari container Backend |
| `SUMOPOD_API_KEY` | Akses embedding/LLM AI Service |
| `VITE_API_BASE_URL` | Base URL Backend dari Frontend |
| `VITE_USE_MOCK_AUTH` | Mengaktifkan atau mematikan mock frontend |

Di jaringan Docker, Backend memanggil AI melalui `http://ai-api:8000`. Port
`8001` hanya merupakan port AI yang diekspos ke host.

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

Auth:

- `POST /auth/login`
- `GET /auth/me`

Documents:

- `POST /documents` — khusus `ADMIN`, multipart `file`, optional `title`
- `GET /documents` — admin melihat dokumen aktif; user hanya dokumen `READY`
- `GET /documents/:id/status` — khusus `ADMIN`
- `DELETE /documents/:id` — khusus `ADMIN`

Role Backend adalah `ADMIN` dan `USER`. Modul chat, AI wrapper, dan users masih
perlu diimplementasikan.

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
