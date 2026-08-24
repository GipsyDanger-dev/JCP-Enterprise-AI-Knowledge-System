# Enterprise AI Knowledge System — AI Service

Service Python/FastAPI untuk pipeline RAG: dokumen diparse menjadi konteks
halaman/section utuh, diretrieval, lalu digunakan sebagai bukti jawaban dan citation.

## Status

Pipeline standalone sudah menyediakan:

```text
ingestion/      parser TXT/MD/DOCX/PDF, section detection, dan page/section context
retrieval/      TF-IDF dan embedding/vector search
generation/     prompt, grounded answer, citation, dan guardrail
knowledge_base.py
                JSON store, versioning, idempotency, dan delete
http_api.py     FastAPI untuk integrasi Backend
evaluate.py     evaluasi golden question
```

Schema PostgreSQL sekarang dimiliki Prisma. Tabel `chunks` mereferensikan
`document_versions.id`, sehingga AI tidak lagi membuat tabel `documents`
sendiri. Mode JSON tetap tersedia untuk pengembangan AI secara mandiri.

### Status desain database

Sudah diperbaiki:

1. Tidak ada lagi schema creation dari `AI/store.py`.
2. `chunks.document_version_id` menjadi foreign key ke `document_versions.id`.
3. Metadata filename, version, dan document dibaca melalui join ke tabel Backend.
4. Response daftar dokumen memakai field `chunks` secara konsisten.
5. Urutan parameter SQL vector search sudah diperbaiki dan dikunci unit test.
6. Citation PostgreSQL membawa `document_version_id` dari chunk hasil retrieval.

Yang masih perlu diselesaikan:

1. `/ingest` masih menerima `input_dir`; Backend belum mengirim binary `bytea`
   atau multipart ke AI.
2. Migration dan vector query belum diuji terhadap instance PostgreSQL nyata di
   environment ini.

## Aturan utama

- Citation selalu disalin dari metadata konteks halaman/section yang benar-benar diretrieval.
- LLM tidak boleh membuat citation sendiri.
- Re-ingest file yang tidak berubah harus menjadi no-op.
- File yang berubah menaikkan version dan mengganti konteks lama.
- Delete membersihkan dokumen, konteks, dan embedding terkait.
- Jika bukti tidak cukup, response harus `grounded: false` dengan jawaban:

```text
Informasi tidak ditemukan pada dokumen yang tersedia.
```

Metadata minimum konteks:

```text
document_id
filename
version
page_number
section_title
chunk_id
text
```

## Quickstart standalone

Dari folder `AI`:

```powershell
python ai_engine.py ingest sample_docs --output knowledge_base.json
python ai_engine.py ask "Berapa maksimal biaya hotel Manager?" --index knowledge_base.json
python ai_engine.py docs
```

Perintah lifecycle:

```powershell
python ai_engine.py ingest sample_docs
python ai_engine.py delete sop_perjalanan.txt
```

## Menjalankan HTTP API tanpa Docker

Mode JSON tanpa database:

```powershell
python -m uvicorn http_api:app --host 0.0.0.0 --port 8000
```

Swagger tersedia di http://localhost:8000/docs.

Jika `DATABASE_URL` tersedia, service memilih PostgreSQL/pgvector. Jika tidak,
service menggunakan `knowledge_base.json`.

| Kondisi | Store | Status penggunaan |
| --- | --- | --- |
| `DATABASE_URL` kosong | JSON | Dapat dipakai untuk pengembangan standalone |
| `DATABASE_URL` terisi | PostgreSQL/pgvector | Schema siap; alur pengiriman file belum terhubung |

## Menjalankan melalui Docker

Dari root repository:

```powershell
Copy-Item .env.example .env
docker compose up -d postgres ai-api
```

Alamat dari host:

| Endpoint | URL |
| --- | --- |
| Health | http://localhost:8001/health |
| Swagger | http://localhost:8001/docs |

Di dalam jaringan Docker, Backend mengakses AI melalui:

```text
http://ai-api:8000
```

Port `8001` hanya merupakan port yang diekspos ke host.

## Endpoint

| Method | Path | Kegunaan |
| --- | --- | --- |
| GET | `/health` | Status service dan store aktif |
| POST | `/ask` | Retrieval dan grounded answer |
| POST | `/ingest` | Ingestion satu file untuk `document_version_id` (kontrak sementara) |
| GET | `/documents` | Daftar dokumen yang telah diindeks |
| DELETE | `/documents/{filename}` | Menghapus dokumen dan chunk terkait |

Spesifikasi lengkap terdapat di `API_CONTRACT.md`. Pada PostgreSQL, endpoint
`/ingest` wajib menerima `document_version_id` milik Backend dan tepat satu file
dalam `input_dir`. Endpoint belum terhubung langsung dengan file `bytea` Backend.

## LLM dan embedding

LLM dan embedding menggunakan gateway OpenAI-compatible SumoPod. API key hanya
dibaca dari environment:

```powershell
$env:SUMOPOD_API_KEY="sk-xxxx"
```

Jangan menyimpan atau commit API key ke repository.

Contoh:

```powershell
python ai_engine.py ingest sample_docs --embed
python ai_engine.py ask "Berapa biaya hotel Manager?" --retriever vector
python ai_engine.py ask "Berapa biaya hotel Manager?" --llm --model deepseek-v4-pro
```

`--retriever auto` memilih vector jika embedding dan API key tersedia; jika
tidak, retrieval fallback ke TF-IDF.

Filter metadata dapat digunakan:

```powershell
python ai_engine.py ask "Berapa biaya hotel Manager?" --doc sop_perjalanan.txt
python ai_engine.py ask "biaya hotel" --section "KETENTUAN UMUM"
```

## Pengujian dan evaluasi

```powershell
python -m unittest discover -s tests -v
python evaluate.py
```

Evaluasi memeriksa retrieval, fakta jawaban, citation, dan no-answer. Exit code
0 berarti seluruh kasus evaluasi lolos.

Melalui image Docker:

```powershell
docker compose run --rm --entrypoint python ai-api -m unittest discover -s tests -v
docker compose run --rm --entrypoint python ai-api evaluate.py
```
