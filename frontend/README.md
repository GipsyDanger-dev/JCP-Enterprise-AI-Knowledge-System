# Enterprise AI Knowledge System - Frontend

Web internal untuk dokumen perusahaan dan AI assistant berbasis citation.
Frontend menggunakan React, Vite, dan TypeScript serta selalu memakai API
Backend nyata.

## Menjalankan Frontend

Pastikan Backend dan database sudah berjalan, migration sudah diterapkan, dan
akun lokal sudah dibuat melalui seed Backend. Kemudian:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Buka http://localhost:5173. Konfigurasi default mengarah ke Backend lokal:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Backend tidak memakai global prefix `/api`; `/api/docs` hanya path Swagger.

## Scripts

| Command | Kegunaan |
| --- | --- |
| `npm run dev` | Menjalankan Vite pada port 5173 |
| `npm run build` | Memeriksa TypeScript dan membuat production build |
| `npm run lint` | Menjalankan oxlint |
| `npm run preview` | Menjalankan preview production build |
| `npm run test:e2e` | Menjalankan smoke test login, chat, dan users terhadap API nyata |

## E2E dengan akun seed

Suite E2E tidak memiliki email atau password bawaan. Isi kredensial lokal pada
`frontend/.env` dengan akun yang benar-benar dibuat oleh `prisma:seed`:

```env
E2E_ADMIN_EMAIL=
E2E_ADMIN_PASSWORD=
E2E_USER_EMAIL=
E2E_USER_PASSWORD=
```

Pasangan admin wajib untuk menjalankan suite. Jika belum diisi, setiap script
keluar dengan status sukses dan pesan `SKIP` yang jelas. Pasangan user opsional;
tanpanya hanya pemeriksaan pembatasan route role USER yang dilewati.

Nilai `E2E_ADMIN_*` biasanya sama dengan `SEED_ADMIN_*`, sedangkan
`E2E_USER_*` sama dengan `SEED_USER_*`. Jangan menaruh credential nyata di
repository. Variabel E2E tidak memakai prefix `VITE_`, sehingga tidak tersedia
di bundle browser.

Untuk menguji satu query ke AI nyata, isi pertanyaan yang sesuai dengan dokumen
`READY` pada environment pengujian:

```env
E2E_CHAT_QUESTION=
E2E_CHAT_FOLLOWUP=
```

Jika pertanyaan kosong, suite chat tetap memeriksa login dan halaman chat tetapi
tidak membuat conversation. `E2E_CHAT_QUESTION` harus berupa pertanyaan yang
memiliki jawaban dan citation dari dokumen `READY`. Bila
`E2E_CHAT_FOLLOWUP` diisi, suite juga memverifikasi request kedua mengirim dan
menerima `conversationId` yang sama. Test users hanya membaca dan memfilter
data; test tidak membuat atau menonaktifkan akun. URL UI dan lokasi Chrome
dapat diubah dengan `E2E_BASE_URL` dan `CHROME_PATH`.

## Struktur

```text
src/
|-- api/          # API client, tipe, dan mapper
|-- components/   # Komponen UI reusable
|-- context/      # Auth dan workspace state
|-- hooks/        # Custom hooks
|-- pages/        # Login, documents, chat, users, dan halaman pendukung
|-- types/        # Tipe domain UI
|-- App.tsx       # Routing
`-- main.tsx      # Entry point
```

Kontrak endpoint dan aturan role tersedia di `src/api/README.md`.

## Ketergantungan runtime

- Auth, documents, users, chat, dan conversations memerlukan Backend di port
  `8000` atau URL yang ditentukan melalui `VITE_API_BASE_URL`.
- Query chat memerlukan `AI_SERVICE_URL` Backend yang valid dan AI service yang
  sehat.
- Jawaban grounded memerlukan dokumen `READY` yang sudah diproses dan diindeks.
