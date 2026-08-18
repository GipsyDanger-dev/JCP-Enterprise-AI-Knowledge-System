# Kontrak API — Enterprise AI Knowledge System

Kesepakatan **Frontend ↔ Backend** (per slide 12 Technical Briefing). Semua perubahan schema/API yang menyentuh modul lain **harus lewat PR, didokumentasikan, dan disepakati sebelum merge**.

## Aturan umum

- Format respons JSON; error object konsisten:

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "..." } }
```

- Status code: `200` sukses · `201` created · `204` deleted · `400` validasi · `401` token/login salah · `403` role tidak punya akses · `404` tidak ditemukan · `500` server error
- **Role: `ADMIN | EMPLOYEE` (UPPERCASE)** — backend WAJIB menolak endpoint admin untuk `EMPLOYEE` (403), bukan hanya disembunyikan di UI
- Auth: `Authorization: Bearer <token>`
- Endpoint admin (documents upload/delete, users, status) hanya untuk `ADMIN`

## Endpoint

### Auth
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `200 { token, user }` · `401` |
| GET | `/auth/me` | — | `200 { user }` · `401` |

### Users (admin)
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/users` | — | `200 User[]` |
| POST | `/users` | `{ name, email, role, password? }` | `201 User` |

### Documents (admin: upload/delete; semua role: list)
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/documents` | multipart `file` | `201 Document` (status `queued`) |
| GET | `/documents` | — | `200 Document[]` |
| GET | `/documents/:id/status` | — | `200 { id, status, error?, chunks? }` |
| DELETE | `/documents/:id` | — | `204` |

### Chat
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/chat/query` | `{ question, conversationId? }` | `200 { conversationId, answer, message?, citations }` |
| GET | `/conversations` | — | `200 ConversationSummary[]` |
| GET | `/conversations/:id` | — | `200 ConversationDetail` |

## Tipe kunci

```ts
type ApiRole = 'ADMIN' | 'EMPLOYEE'
type ApiDocumentStatus = 'queued' | 'processing' | 'ready' | 'failed'

interface Citation {
  documentId: number
  filename: string
  version?: string
  pageNumber: number | null
  sectionTitle: string | null
  chunkId: number
}
```

### No-answer (prinsip "No evidence = no answer")
Saat retrieval tidak menemukan bukti cukup, backend mengembalikan `answer: null` + `message` penjelasan — **bukan jawaban karangan**:

```json
{ "conversationId": 7, "answer": null,
  "message": "Informasi tidak ditemukan pada dokumen yang tersedia.", "citations": [] }
```

## Provenance (wajib ikut terus)

`document_id` · `filename` · `version` · `page_number` · `section_title` · `chunk_id` — citation di UI berasal dari metadata ini, **bukan dibuat ulang oleh LLM**.

### Mock mode (development)
Mock auth aktif **secara default di development** (`mockAuth.ts`) — tidak butuh backend:

- Admin: `admin@jcp.co.id` / `admin123`
- Employee: `nadia@jcp.co.id` / `employee123`

Set `VITE_USE_MOCK_AUTH=false` saat backend sudah siap untuk memakai API asli. Di produksi, mock hanya aktif bila `VITE_USE_MOCK_AUTH=true` dieksplisitkan.

Endpoint dokumen juga di-mock (`mockDocuments.ts`): upload langsung masuk antrean dan statusnya berjalan `queued → processing → ready` otomatis.

## Implementasi frontend

- `client.ts` — `request<T>()` + `ApiError` (status, code); base URL dari `VITE_API_BASE_URL`
- `types.ts` — schema typed untuk semua endpoint di atas
- `auth.ts` / `documents.ts` / `chat.ts` / `users.ts` — fungsi per endpoint
- `mappers.ts` — konversi tipe API ↔ tipe UI (role, status dokumen)
