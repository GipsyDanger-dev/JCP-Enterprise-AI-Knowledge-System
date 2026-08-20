# Kontrak API Frontend-Backend

Folder ini berisi API client, tipe TypeScript, dan mapper untuk Backend NestJS.
Frontend selalu mengirim request ke Backend nyata; tidak ada mode API alternatif.

## Konfigurasi

```env
VITE_API_BASE_URL=http://localhost:8000
```

Backend tidak memasang global prefix `/api`. Path `/api/docs` hanya digunakan
untuk Swagger. Seluruh endpoint terproteksi memakai header berikut:

```http
Authorization: Bearer <accessToken>
```

ID adalah UUID string, role adalah `ADMIN | USER`, dan error mengikuti format
standar NestJS `{ statusCode, message, error }`.

## Auth

| Method | Path | Akses | Keterangan |
| --- | --- | --- | --- |
| POST | `/auth/login` | Publik | Login akun aktif dan menerima JWT serta profil aman |
| GET | `/auth/me` | `ADMIN`, `USER` | Mengambil profil dari access token |

Response login:

```json
{
  "accessToken": "jwt-token",
  "tokenType": "Bearer",
  "user": {
    "id": "uuid",
    "email": "user@company.test",
    "displayName": "Nama User",
    "role": "USER"
  }
}
```

`GET /auth/me` mengembalikan `{ sub, email, role, displayName }`.

## Documents

| Method | Path | Akses | Keterangan |
| --- | --- | --- | --- |
| POST | `/documents` | `ADMIN` | Upload PDF/DOCX multipart pada field `file`, dengan `title` opsional |
| GET | `/documents` | `ADMIN`, `USER` | Admin melihat dokumen aktif; user hanya dokumen `READY` |
| GET | `/documents/:id/status` | `ADMIN` | Membaca status dokumen dan processing job terbaru |
| DELETE | `/documents/:id` | `ADMIN` | Soft-delete metadata dan menghapus binary tersimpan |

Status dokumen menggunakan
`UPLOADED | QUEUED | PROCESSING | READY | FAILED | DELETED`. Upload dibatasi
10 MB oleh Backend. Delete mengembalikan HTTP 200 dengan ID, status `DELETED`,
dan waktu penghapusan.

Contoh item dari `GET /documents`:

```json
{
  "id": "document-uuid",
  "title": "SOP Perjalanan",
  "status": "READY",
  "createdAt": "2026-08-19T00:00:00.000Z",
  "updatedAt": "2026-08-19T00:00:00.000Z",
  "uploadedBy": {
    "id": "user-uuid",
    "displayName": "Nama Admin"
  },
  "latestVersion": {
    "id": "version-uuid",
    "versionNumber": 1,
    "originalFilename": "sop.pdf",
    "mimeType": "application/pdf",
    "fileSize": 1024,
    "checksum": "sha256"
  }
}
```

## Users

Semua endpoint users khusus `ADMIN`.

| Method | Path | Keterangan |
| --- | --- | --- |
| GET | `/users` | Menampilkan akun aktif tanpa password hash |
| POST | `/users` | Membuat akun `ADMIN` atau `USER`; password wajib 12-128 karakter |
| DELETE | `/users/:id` | Menonaktifkan akun dan mengembalikan HTTP 204 |

Backend menolak deaktivasi admin aktif terakhir. Frontend harus memperlakukan
delete sebagai deaktivasi, bukan penghapusan riwayat pengguna.

## Chat dan conversations

Endpoint berikut tersedia untuk `ADMIN` dan `USER`.

| Method | Path | Keterangan |
| --- | --- | --- |
| POST | `/chat/query` | Menjalankan query AI dan menyimpan percakapan |
| POST | `/conversations` | Membuat conversation kosong |
| GET | `/conversations` | Menampilkan conversation milik user aktif |
| GET | `/conversations/:id` | Menampilkan pesan dan citation milik user aktif |
| POST | `/conversations/:id/messages` | Menambah pesan USER tanpa menjalankan AI |

Request query:

```json
{
  "question": "Berapa jatah cuti tahunan?",
  "conversationId": "uuid-opsional"
}
```

Jawaban grounded mengembalikan `answer` dan minimal satu citation. Jika bukti
tidak cukup, Backend mengembalikan HTTP 200 dengan `answer: null`, pesan
no-answer, dan `citations: []`. State no-answer bukan kegagalan HTTP.

Metadata citation berasal dari hasil retrieval dan tidak dibuat oleh LLM:

```text
documentId
documentVersionId
filename
version
pageNumber
sectionTitle
chunkId
excerpt
```

## Keamanan client

- JWT disimpan oleh auth context dan dikirim hanya sebagai Bearer token.
- `WORKER_TOKEN`, `JWT_SECRET`, `SEED_*`, dan key AI tidak boleh masuk ke
  environment Frontend.
- Hanya variable berawalan `VITE_` yang boleh dianggap tersedia di browser.
- UI role guard membantu navigasi, tetapi otorisasi tetap wajib ditegakkan oleh
  JWT guard dan role guard Backend.
