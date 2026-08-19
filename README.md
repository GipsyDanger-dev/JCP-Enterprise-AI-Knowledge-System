# Enterprise AI Knowledge System — Merged (BE + FE + AI)

> **Status:** Hasil penggabungan 3 branch (`backend`, `frontend`, `AI`) ke satu
> struktur mengikuti tata letak folder BE. Ini gabungan STRUKTUR saja — bug
> integrasi berikut **belum** diperbaiki dan perlu ditangani sebelum fitur
> upload/chat dites end-to-end:
>
> 1. Tabel `documents` dibuat dua kali dengan skema berbeda (oleh Prisma di
>    `backend/` dan oleh raw SQL di `AI/store.py`) — perlu rename/refactor.
> 2. `document_id` yang di-generate AI Service belum terhubung ke `Document.id`
>    milik backend — perlu keputusan bersama (lihat `AI/API_CONTRACT.md`).
> 3. Kontrak field antara `frontend/src/api/types.ts` dan response asli
>    backend belum sama persis (nama field, casing, tipe ID) — lihat catatan
>    review sebelumnya.
>
> Yang SUDAH disesuaikan supaya bisa `docker compose up` tanpa crash:
> - Port `ai-api` digeser ke `8001` di host (internal tetap `8000`) supaya
>   tidak bentrok dengan `backend`.
> - Satu Postgres dipakai bersama oleh `backend` dan `ai-api` (bukan dua
>   database terpisah).
> - Service `minio` dihapus dari compose (storage dokumen pakai VPS internal,
>   bukan object storage pihak ketiga).
> - `VITE_API_BASE_URL` di `.env.example` diperbaiki ke `http://localhost:8000`.

---

# Enterprise AI Knowledge System — M0

Monorepo MVP knowledge base internal berbasis RAG. M0 hanya menyiapkan infrastruktur dan skeleton modular; logic auth, upload, dan chat belum diimplementasikan.

## Menjalankan seluruh service

Prasyarat: Git dan Docker Desktop/Docker Engine dengan Docker Compose v2.

```bash
git clone <repository-url>
cd JCP-Enterprise-AI-Knowledge-System
cp .env.example .env
docker compose up --build
```

Di PowerShell, gunakan `Copy-Item .env.example .env` sebagai pengganti `cp`.

- Frontend: http://localhost:5173 — menampilkan **Backend connected**
- Health: http://localhost:8000/health — mengembalikan `OK`
- Swagger UI: http://localhost:8000/api/docs
- MinIO API/Console: http://localhost:9000 dan http://localhost:9001
- PostgreSQL: `localhost:5432`

Hentikan dengan `docker compose down`. Flag `-v` juga menghapus seluruh data di volume.

## File dan struktur

- `docker-compose.yml`: orkestrasi Postgres/pgvector, MinIO, NestJS, Vite, health checks, dan persistent volumes.
- `.env.example`: template konfigurasi bersama untuk database, storage, backend, LLM, dan URL frontend.
- `backend/Dockerfile`: image development NestJS; `package.json` dan konfigurasi TypeScript/Nest mengatur build serta hot-reload.
- `backend/prisma/schema.prisma`: koneksi Prisma/PostgreSQL; model domain ditunda ke milestone fitur.
- `backend/src/main.ts`: bootstrap, CORS, port 8000, dan Swagger; `health.controller.ts` menyediakan `GET /health`.
- `backend/src/database/`: Prisma client dan lifecycle koneksi database.
- `backend/src/{auth,users,documents,chat,ai}/`: skeleton modul terpisah untuk pengembangan paralel.
- `frontend/Dockerfile`: image development Vite dengan port 5173.
- `frontend/src/api/health.ts`: client health API memakai `VITE_API_URL`.
- `frontend/src/pages/HealthPage.tsx`: halaman pengecekan koneksi; `components/ConnectionStatus.tsx` menampilkan hasilnya.
- `.gitignore` dan `.dockerignore`: mengecualikan secret, dependency, output build, dan file yang tidak diperlukan image.

Source backend dan frontend di-mount ke container. NestJS watch mode dan Vite polling membuat perubahan kode ter-reload. Jalankan ulang `docker compose up --build` setelah dependency berubah.

Image PostgreSQL sudah membawa pgvector. Aktivasi `CREATE EXTENSION vector` sengaja ditunda sampai model embedding dibuat pada milestone berikutnya.

## Database dan autentikasi lokal

Schema inti dan migration Prisma berada di `backend/prisma`. Setelah database hidup, migration dapat diperiksa atau diterapkan dengan:

```bash
docker compose exec backend npx prisma migrate status
docker compose exec backend npx prisma migrate dev
```

Buat atau perbarui akun development `ADMIN` dan `USER` dari nilai `SEED_*` di `.env`:

```bash
docker compose exec backend npm run prisma:seed
```

Seed bersifat idempotent dan tidak mencetak password. Endpoint autentikasi awal:

- `POST /auth/login` menerima `email` dan `password`, lalu mengembalikan JWT serta profil aman dengan role.
- `GET /auth/me` membutuhkan header `Authorization: Bearer <token>`.

Role yang tersedia adalah `ADMIN` dan `USER`. Backend memakai JWT guard dan role guard; pemilihan tampilan dashboard berdasarkan role dilakukan oleh frontend.

## Penyimpanan dokumen Backend

Keputusan MVP saat ini adalah menyimpan binary PDF/DOCX langsung di PostgreSQL, terpisah dari metadata:

- `document_versions` menyimpan filename, MIME type, ukuran, checksum, dan nomor versi.
- `document_files` menyimpan binary sebagai `bytea` dengan relasi satu-ke-satu ke versi dokumen.
- Query daftar dan status tidak mengambil atau mengembalikan binary.
- Upload dibatasi maksimal 10 MB dan menerima PDF/DOCX dengan pemeriksaan ekstensi, MIME type, dan signature awal file.
- Delete mempertahankan metadata sebagai `DELETED`, menghapus binary, dan menggagalkan job yang masih aktif.

Endpoint awal:

- `POST /documents` — khusus `ADMIN`, multipart field `file` dan optional `title`.
- `GET /documents` — `ADMIN` melihat dokumen aktif; `USER` hanya dokumen `READY`.
- `GET /documents/:id/status` — khusus `ADMIN`.
- `DELETE /documents/:id` — khusus `ADMIN`.

Backend tidak menggunakan MinIO untuk alur dokumen ini. Service MinIO di environment tetap dibiarkan sampai keputusan infrastructure diperbarui oleh owner DevOps.
