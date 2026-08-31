# Catatan Git — Kunci AI Service

Catatan kerja untuk satu perubahan: **AI Service tidak lagi bisa dijangkau dari
host, dan seluruh endpoint-nya (kecuali `/health`) butuh `X-Worker-Token`.**

File ini hanya catatan bantu. Boleh dihapus sebelum commit (sama seperti
`hardcode_analysis.md`).

## Commit message

```
fix(security): require a worker token on the AI service and unpublish its port

Every endpoint in AI/http_api.py — DELETE /documents/{filename} included — was
reachable without authentication, while docker-compose published the service on
host port 8001. Any access control built on top of the backend could be bypassed
by calling the AI service directly.

- docker-compose: drop the 8001:8000 mapping so ai-api is reachable only through
  the internal Docker network, and pass WORKER_TOKEN to the container
- FastAPI: app-wide dependency that checks X-Worker-Token against WORKER_TOKEN,
  mirroring the backend WorkerTokenGuard (SHA-256 + constant-time compare)
- backend: chat.service.ts and document-processor.service.ts send the header via
  a shared aiServiceHeaders() helper

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## Yang perlu dicentang (staged)

### Inti perubahan

- [ ] `docker-compose.yml`
      Mapping `8001:8000` dihapus, diganti `expose: 8000`. `WORKER_TOKEN`
      diteruskan ke container `ai-api`. Ditambah `healthcheck` berbasis `python`
      (image slim tidak punya curl/wget) karena host sudah tidak bisa cek
      `/health` sendiri.

- [ ] `AI/http_api.py`
      Dependency `require_worker_token` dipasang di level aplikasi
      (`FastAPI(dependencies=[...])`), jadi endpoint baru otomatis terproteksi.
      Perbandingan token pakai `hmac.compare_digest` atas hash SHA-256, sama
      seperti `WorkerTokenGuard` backend. `401` kalau token salah/absen, `503`
      kalau `WORKER_TOKEN` belum di-set (fail closed). `PUBLIC_PATHS` berisi
      `/health` saja.

- [ ] `backend/src/config/env.util.ts`
      Helper baru `workerToken()` dan `aiServiceHeaders()` — satu sumber
      kebenaran untuk header panggilan backend -> AI service.

- [ ] `backend/src/chat/chat.service.ts`
      `POST /ask` memakai `aiServiceHeaders()`.

- [ ] `backend/src/processing-jobs/document-processor.service.ts`
      `POST /ingest` memakai `aiServiceHeaders()`.

### Test

- [ ] `AI/tests/test_http_api.py`
      Client default membawa `X-Worker-Token`. Kelas baru `WorkerTokenTests`:
      `/health` tetap publik, request tanpa token 401, token salah 401,
      `DELETE /documents/...` tanpa token 401, `WORKER_TOKEN` kosong 503.

### Konfigurasi dan CI

- [ ] `scripts/start-local.ps1`
      `WORKER_TOKEN` masuk `Require-Environment` supaya gagal lebih awal dengan
      pesan jelas (nilainya sudah otomatis diwarisi proses `ai-api`).

- [ ] `.env.example`
      Komentar bahwa `WORKER_TOKEN` dipakai dua arah (guard `/internal/*` di
      backend + header ke AI service).

- [ ] `.github/workflows/ci.yml`
      `WORKER_TOKEN` ditambahkan ke job `integration-tests`; health check AI pada
      job deploy diganti `docker compose exec` karena port host sudah tidak ada.

- [ ] `.github/workflows/deploy.yml`
      Dua health check `curl localhost:8001` diganti `docker compose exec -T
      ai-api python -c ...` (staging dan production).

### Dokumentasi

- [ ] `README.md` — bagian "Akses AI Service" + baris `WORKER_TOKEN` di tabel env.
- [ ] `AI/API_CONTRACT.md` — bagian "Autentikasi" dan tabel alamat service.
- [ ] `AI/README.md` — cara cek health dari dalam container + bagian autentikasi.
- [ ] `DEPLOYMENT.md` — diagram/port, variabel wajib, PM2 bind ke `127.0.0.1`,
      rute nginx `location /ai/` dihapus (itu mengekspos AI ke publik),
      troubleshooting `401`/`503`.

### Jangan dicentang

- [ ] ~~`AGENT.md`~~ — ikut diperbarui (status "sudah diperbaiki" soal port
      `ai-api`), tapi file ini di-exclude lewat `.git/info/exclude` jadi memang
      tidak muncul di git status.
- [ ] ~~`hardcode_analysis.md`~~ — file untracked yang sudah ada sebelumnya,
      bukan bagian dari perubahan ini.
- [ ] ~~`catatan-git-kunci-ai-service.md`~~ — catatan ini sendiri.

## Verifikasi yang sudah dijalankan

| Cek | Hasil |
| --- | --- |
| `python -m unittest` (5 modul test AI) | 53 test, OK |
| `npx tsc --noEmit` pada file yang disentuh | bersih (error lain sudah ada sebelumnya, karena Prisma client belum di-generate) |
| `docker compose config` + overlay prod | valid, `ai-api` tanpa `ports` |
| `curl http://localhost:8001/health` dari host | connection refused |
| `GET /documents` dari container backend tanpa token | 401 |
| `GET /documents` dengan `X-Worker-Token` | 200 |
| `DELETE /documents/{filename}` tanpa token | 401 |
| `POST /chat/query` end-to-end | 200, `POST /ask` di AI tercatat 200 |
| Upload dokumen -> `POST /ingest` | 200, job `COMPLETED` (dokumen uji sudah dihapus lagi) |

## Catatan operasional

- `WORKER_TOKEN` sekarang **wajib** ada di `.env` AI Service. Kalau kosong, semua
  endpoint selain `/health` menjawab `503`.
- Setelah menarik perubahan ini: `docker compose up -d ai-api` lalu **restart
  backend** supaya keduanya memakai token yang sama.
- Debug manual AI service sekarang lewat `docker compose exec ai-api ...`,
  bukan `http://localhost:8001`. Port `8001` hanya berlaku untuk mode lokal
  `scripts/start-local.ps1`.
