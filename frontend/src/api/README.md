# Kontrak API Frontend–Backend

Folder ini berisi API client, tipe TypeScript, mapper, dan implementasi mock.
Backend NestJS menjadi sumber kontrak utama. Tipe auth, UUID, role, status
dokumen, mock, dan mapper Frontend sudah diselaraskan dengan response Backend.

## Aturan Backend aktual

- Base URL lokal: `http://localhost:8000` tanpa prefix global `/api`.
- Auth menggunakan `Authorization: Bearer <accessToken>`.
- ID menggunakan UUID bertipe `string`.
- Role Backend adalah `ADMIN | USER`.
- Status dokumen menggunakan uppercase:
  `UPLOADED | QUEUED | PROCESSING | READY | FAILED | DELETED`.
- Endpoint admin dilindungi Backend dengan JWT guard dan role guard.

## Endpoint yang sudah tersedia

### Auth

| Method | Path | Keterangan |
| --- | --- | --- |
| POST | `/auth/login` | Menerima `{ email, password }`, mengembalikan `accessToken` dan profil user |
| GET | `/auth/me` | Mengembalikan payload user terautentikasi secara langsung |

Response login aktual:

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

### Documents

| Method | Path | Akses |
| --- | --- | --- |
| POST | `/documents` | `ADMIN`, multipart `file`, optional `title` |
| GET | `/documents` | `ADMIN` dan `USER`; user hanya melihat status `READY` |
| GET | `/documents/:id/status` | `ADMIN` |
| DELETE | `/documents/:id` | `ADMIN` |

Upload mengembalikan HTTP `201` dengan document, version, dan processing job.
Delete mengembalikan HTTP `200` dengan `{ id, status: "DELETED", deletedAt }`,
bukan response kosong `204`.

Contoh bentuk item dari `GET /documents`:

```json
{
  "id": "document-uuid",
  "title": "SOP Perjalanan",
  "status": "QUEUED",
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

Endpoint users, chat, dan conversations yang dipanggil Frontend belum tersedia
karena modul Backend terkait masih skeleton.

## Penyesuaian yang sudah dilakukan

| Kontrak lama | Kontrak sekarang |
| --- | --- |
| `token` | `accessToken` |
| `user.name` | `user.displayName` |
| ID `number` | UUID `string` |
| `ADMIN | EMPLOYEE` | `ADMIN | USER` |
| status lowercase | status uppercase |
| `{ error: { code, message } }` | error standar NestJS `{ statusCode, message, error }` |
| delete `204` tanpa body | delete `200` dengan body |

File yang telah disesuaikan:

```text
types.ts
auth.ts
documents.ts
chat.ts
users.ts
mappers.ts
```

Mock sekarang mengikuti UUID string, `accessToken`, `displayName`, role `USER`,
status uppercase, dan format error NestJS.

## Pekerjaan integrasi yang tersisa

1. `/auth/me` hanya mengembalikan payload JWT tanpa `displayName`, sehingga
   pemulihan sesi sementara memakai email sebagai nama tampilan.
2. Backend users, chat, dan conversations masih skeleton.
3. Backend documents belum mengembalikan jumlah chunk.
4. Selector E2E login lama perlu diselaraskan dengan markup UI saat ini.

## Mock mode

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_USE_MOCK_AUTH=true
```

| Role UI | Email | Password |
| --- | --- | --- |
| Admin | `admin@jcp.co.id` | `admin123` |
| Employee | `nadia@jcp.co.id` | `employee123` |

Mock documents mensimulasikan `queued → processing → ready`. Mock chat hanya
memberikan citation dari metadata mock yang sudah ditentukan dan mengembalikan
no-answer untuk pertanyaan yang tidak cocok.

## No-answer dan citation

Citation tidak boleh dibuat oleh LLM. Citation harus berasal dari metadata chunk
yang benar-benar diretrieval:

```text
document_version_id
filename
version
page_number
section_title
chunk_id
```

Jika bukti tidak cukup, UI harus menampilkan:

```text
Informasi tidak ditemukan pada dokumen yang tersedia.
```

State no-answer bukan kegagalan HTTP.
