# JCP Enterprise AI Knowledge System

Monorepo untuk tim 4 programmer (sesuai Technical Briefing). Setiap branch
modul tinggal di foldernya masing-masing dan digabungkan lewat merge:

```
AI/         # Programmer 1 — AI Engineer (document pipeline, RAG, eval)
Backend/    # Programmer 2 — Backend Engineer (API, auth, jobs) [menyusul]
Frontend/   # Programmer 3 — Frontend + DevOps [menyusul]
```

## AI Engineer module

```powershell
cd AI
python ai_engine.py ingest sample_docs --output knowledge_base.json
python ai_engine.py ask "Berapa maksimal biaya hotel Manager?"
python -m unittest discover -s tests -v
python evaluate.py
```

Dokumentasi lengkap ada di `AI/README.md`.

## Local development (Docker) — Milestone M0/M1

Lingkungan reproducible untuk seluruh repo. Service yang tersedia:

```bash
cp .env.example .env        # isi SUMOPOD_API_KEY (opsional, jangan commit aslinya)
docker compose build
docker compose run --rm ai ask "Berapa maksimal biaya hotel Manager?"
docker compose run --rm ai ingest sample_docs --embed
# Tes & evaluasi (entrypoint di-override):
docker compose run --rm --entrypoint python ai -m unittest discover -s tests -v
docker compose run --rm --entrypoint python ai evaluate.py --llm
# HTTP API (dipanggil NestJS) + PostgreSQL/pgvector:
docker compose up -d postgres ai-api   # Swagger: http://localhost:8000/docs
```

Folder `./AI` di-mount ke `/app`, jadi perubahan kode langsung kebaca tanpa
rebuild image. Kontrak Backend ↔ AI Service ada di `AI/API_CONTRACT.md`.
Service Backend/Frontend ditambahkan di file yang sama saat branch-nya
digabung.
