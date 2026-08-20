# Enterprise AI Knowledge System — Frontend

Web UI internal untuk pengelolaan dokumen dan AI assistant berbasis citation.
Frontend menggunakan React, Vite, dan TypeScript (bukan Next.js).

## Status

Halaman login, documents, chat, dan users sudah tersedia. Untuk development,
seluruh alur dapat didemonstrasikan dengan mock API. Kontrak auth dan documents
sudah disesuaikan dengan Backend; users dan chat masih menunggu implementasi
modul Backend terkait.

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

Untuk integrasi Backend asli, gunakan `VITE_USE_MOCK_AUTH=false`. Auth dan
documents sudah memakai kontrak Backend aktual.

## Mode development

| Kebutuhan | `VITE_USE_MOCK_AUTH` | Backend diperlukan |
| --- | --- | --- |
| Demo UI sementara | `true` | Tidak |
| Integrasi API | `false` | Ya, port 8000 |

Gunakan file `.env` di folder `frontend` agar base URL selalu eksplisit. Fallback
API client juga sudah mengarah ke `http://localhost:8000`.

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

- `/auth/me` belum mengembalikan `displayName` untuk pemulihan sesi.
- Response documents belum menyediakan jumlah chunk untuk kartu UI.
- Endpoint users, chat, dan conversations belum tersedia di Backend.
- Selector E2E login masih tertinggal dari markup UI saat ini.

Gunakan mock mode untuk mendemonstrasikan fitur Backend yang masih skeleton.
