# Enterprise AI Knowledge System — AI Service

Service Python/FastAPI untuk pipeline RAG: dokumen diparse, dibagi menjadi
chunk, diretrieval, lalu digunakan sebagai bukti jawaban dan citation.

## Status

Pipeline standalone sudah menyediakan:

```text
ingestion/      parser TXT/MD/DOCX/PDF, section detection, dan chunking
retrieval/      TF-IDF dan embedding/vector search
generation/     prompt, grounded answer, citation, dan guardrail
knowledge_base.py
                JSON store, versioning, idempotency, dan delete
http_api.py     FastAPI untuk integrasi Backend
evaluate.py     evaluasi golden question
```

Integrasi PostgreSQL bersama Backend belum aman untuk ingestion sampai konflik
tabel `documents` dan hubungan ID ke `DocumentVersion` diperbaiki. Mode JSON
tetap dapat digunakan untuk pengembangan AI secara mandiri.

### Kendala integrasi yang diketahui

1. `AI/store.py` membuat tabel `documents` sendiri, bertabrakan dengan tabel
   `documents` milik Prisma.
2. AI membentuk `document_id` dari nama file dan belum menerima
   `documentVersionId` dari Backend.
3. Endpoint `/ingest` menerima path direktori, sedangkan file Backend disimpan
   sebagai PostgreSQL `bytea`.
4. Hasil PostgreSQL `list_documents()` memakai field `num_chunks`, sedangkan
   response model `GET /documents` mengharuskan field `chunks`.
5. Parameter SQL vector search perlu diperbaiki dan diuji terhadap PostgreSQL
   asli, terutama saat metadata filter digunakan.

Gunakan JSON store untuk demo AI mandiri. Jangan menyatakan integrasi pgvector
siap sebelum kelima poin tersebut diselesaikan dan diuji.

## Aturan utama

- Citation selalu disalin dari metadata chunk yang benar-benar diretrieval.
- LLM tidak boleh membuat citation sendiri.
- Re-ingest file yang tidak berubah harus menjadi no-op.
- File yang berubah menaikkan version dan mengganti chunk lama.
- Delete membersihkan dokumen, chunk, dan embedding terkait.
- Jika bukti tidak cukup, response harus `grounded: false` dengan jawaban:

```text
Informasi tidak ditemukan pada dokumen yang tersedia.
```

Metadata minimum chunk:

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
| `DATABASE_URL` terisi | PostgreSQL/pgvector | Belum aman bersama schema Backend |

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
| POST | `/ingest` | Ingestion direktori dokumen (kontrak sementara) |
| GET | `/documents` | Daftar dokumen yang telah diindeks |
| DELETE | `/documents/{filename}` | Menghapus dokumen dan chunk terkait |

Spesifikasi lengkap terdapat di `API_CONTRACT.md`. Endpoint `/ingest` masih
menerima `input_dir` dan belum terhubung dengan file `bytea` milik Backend.

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
python ai_engine.py ask "Berapa biaya hotel Manager?" --llm --model gpt-5-nano
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
