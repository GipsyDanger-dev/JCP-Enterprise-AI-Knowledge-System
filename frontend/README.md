# Enterprise AI Knowledge System — Frontend

Web UI internal untuk pengelolaan dokumen dan AI assistant berbasis citation.
Frontend menggunakan React, Vite, dan TypeScript (bukan Next.js).

## Status

Halaman login, documents, chat, users, messaging, dan history memakai API
Backend secara langsung. Frontend tidak menyediakan fallback data atau API palsu.

## Menjalankan UI

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Buka http://localhost:5173.

Pastikan environment berisi:

```env
VITE_API_BASE_URL=http://localhost:8000
```

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

E2E menggunakan `puppeteer-core`, membutuhkan Chrome, Backend aktif, serta akun
uji yang disediakan melalui environment.

## Struktur

```text
src/
├── api/          # API client, tipe, dan mapper
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

Dokumentasi kontrak dan status integrasi tersedia di `src/api/README.md`.

## Batasan integrasi saat ini

- `/auth/me` belum mengembalikan `displayName` untuk pemulihan sesi.
- Response documents belum menyediakan jumlah chunk untuk kartu UI.
- Endpoint, database, dan AI service harus aktif untuk verifikasi runtime.
