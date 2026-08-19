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

Endpoint pengelolaan akun berikut hanya dapat digunakan oleh `ADMIN`:

- `GET /users` — menampilkan profil aman seluruh akun tanpa `passwordHash`.
- `POST /users` — membuat akun aktif dengan role `USER` (default) atau `ADMIN`; password minimal 12 karakter dan disimpan sebagai hash `scrypt`.

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
