# Enterprise AI Knowledge System — Frontend

Web UI internal untuk pengelolaan dokumen dan AI assistant berbasis citation.
Frontend menggunakan React, Vite, dan TypeScript (bukan Next.js).

## Status

Halaman login, documents, chat, dan users sudah tersedia. Untuk development,
seluruh alur dapat didemonstrasikan dengan mock API. Integrasi Backend asli
belum selesai karena kontrak field Frontend masih perlu disesuaikan dengan
kontrak NestJS.

## Menjalankan UI dengan mock

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Buka http://localhost:5173.

| Role UI | Email | Password |
| --- | --- | --- |
| Admin | `admin@jcp.co.id` | `admin123` |
| Employee | `nadia@jcp.co.id` | `employee123` |

Pastikan environment berisi:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_USE_MOCK_AUTH=true
```

Untuk integrasi Backend asli, gunakan `VITE_USE_MOCK_AUTH=false`. Kontrak tipe
Frontend belum sepenuhnya sama dengan Backend sehingga integrasi masih perlu
dikerjakan.

## Mode development

| Kebutuhan | `VITE_USE_MOCK_AUTH` | Backend diperlukan |
| --- | --- | --- |
| Demo UI sementara | `true` | Tidak |
| Integrasi API | `false` | Ya, port 8000 |

Gunakan file `.env` di folder `frontend` agar base URL selalu eksplisit. Source
API client saat ini masih memiliki fallback URL lama jika variable tersebut
tidak tersedia; fallback itu perlu diperbaiki pada tahap integrasi source code.

## Scripts

| Command | Kegunaan |
| --- | --- |
| `npm run dev` | Menjalankan Vite pada port 5173 |
| `npm run build` | TypeScript check dan production build |
| `npm run lint` | Menjalankan oxlint |
| `npm run preview` | Preview production build |
| `npm run test:e2e` | Menjalankan E2E login, chat, dan users |

E2E menggunakan `puppeteer-core` dan membutuhkan Chrome. Suite saat ini berisi
38 skenario mock: 14 login, 11 chat, dan 13 users.

## Struktur

```text
src/
├── api/          # API client, tipe, mapper, dan mock
├── components/   # Komponen UI reusable
├── context/      # Auth dan workspace state
├── hooks/        # Custom hooks
├── pages/        # Login, documents, chat, users, dan halaman lain
├── types/        # Tipe domain UI
├── App.tsx       # Routing
└── main.tsx      # Entry point
```

## Environment

| Variable | Nilai contoh | Kegunaan |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Base URL NestJS tanpa trailing slash |
| `VITE_USE_MOCK_AUTH` | `true` | Menggunakan mock API saat demo lokal |

Dokumentasi kontrak dan status integrasi tersedia di `src/api/README.md`.

## Batasan integrasi saat ini

- Login Frontend membaca `token`, sedangkan Backend mengirim `accessToken`.
- Frontend menggunakan ID angka, sedangkan Backend menggunakan UUID string.
- Role UI `EMPLOYEE` belum dipetakan ke role Backend `USER`.
- Status dan bentuk response dokumen belum sama.
- Format error Frontend belum menangani format error standar NestJS.
- Endpoint users, chat, dan conversations belum tersedia di Backend.

Karena batasan tersebut, gunakan mock mode untuk demo sampai tahap penyesuaian
API Frontend selesai.
