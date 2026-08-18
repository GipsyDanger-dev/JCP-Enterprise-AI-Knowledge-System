# JCP Enterprise AI Knowledge System

## Standalone AI milestone (AI Engineer scope)

Pipeline dokumen mentah → konteks yang bisa dipercaya LLM, sesuai Technical
Briefing (Programmer 1 — AI Engineer). Modular:

```
ingestion/   parsers (txt/md/docx/pdf) + section detection + chunking
retrieval/   TF-IDF (default) / embedding-vector search (SumoPod)
generation/  prompt assembly, grounded answer (LLM), citations, guardrails
knowledge_base.py   store + versioning (idempotent, delete cleanly)
ai_engine.py        CLI
evaluate.py         golden question evaluation (release gate)
golden_set.json     golden dataset untuk QA AI
```

## Quickstart

```powershell
python ai_engine.py ingest sample_docs --output knowledge_base.json
python ai_engine.py ask "Berapa maksimal biaya hotel Manager?" --index knowledge_base.json
python -m unittest discover -s tests -v
```

Kontrak respons: `answer`, `citations`, `grounded`. Citation selalu disalin dari
metadata chunk yang benar-benar di-retrieval — LLM tidak pernah membuat citation
sendiri. Bila tidak ada bukti cukup: `grounded: false` dan jawaban persis
"Informasi tidak ditemukan pada dokumen yang tersedia." (aturan MVP
*no evidence = no answer*).

## Metadata contract

Setiap chunk membawa provenance lengkap yang bertahan sampai citation:

```json
{ "document_id", "filename", "version", "page_number", "section_title", "chunk_id", "text" }
```

`section_title` dideteksi dari heading (txt/md: pola BAB / penomoran / judul;
docx: paragraph style Heading/Title).

## Versioning, delete, dan idempotency

```powershell
python ai_engine.py docs                      # daftar dokumen + version
python ai_engine.py delete sop_perjalanan.txt # hapus dokumen + chunk + embeddings
python ai_engine.py ingest sample_docs        # idempotent: file tidak berubah = skip
```

- Re-ingest file yang tidak berubah = no-op (content hash).
- File berubah → `version` naik, chunk lama diganti (tidak dobel).
- `delete` membersihkan dokumen, chunk, dan embedding-nya sekaligus.

## LLM mode (SumoPod)

Rangkum jawaban dengan LLM (OpenAI-compatible gateway) berdasarkan chunk yang
di-retrieval. Retrieval tetap lokal; LLM hanya menulis jawaban.

```powershell
$env:SUMOPOD_API_KEY="sk-xxxx"
python ai_engine.py ask "Berapa maksimal biaya hotel Manager?" --index knowledge_base.json --llm --model gpt-5-nano
```

API key dibaca dari environment variable `SUMOPOD_API_KEY`; jangan pernah
simpan di file project atau commit ke Git.

## Docker (Milestone M0)

```bash
# dari root repo
cp .env.example .env        # isi SUMOPOD_API_KEY kalau mau pakai --llm / --embed
docker compose build
docker compose run --rm ai ask "Berapa maksimal biaya hotel Manager?"
docker compose run --rm ai ingest sample_docs --embed
# Tes & evaluasi (override entrypoint):
docker compose run --rm --entrypoint python ai -m unittest discover -s tests -v
docker compose run --rm --entrypoint python ai evaluate.py --llm
```

`./AI` di-mount ke `/app`, jadi kode lokal langsung kebaca (tidak perlu rebuild
setiap ganti kode). `SUMOPOD_API_KEY` diambil dari `.env` atau environment host.

## Embedding + vector search (opsional)

```powershell
$env:SUMOPOD_API_KEY="sk-xxxx"
python ai_engine.py ingest sample_docs --embed                    # simpan embeddings
python ai_engine.py ask "Berapa maksimal biaya hotel Manager?" --retriever vector
```

`--retriever auto` memakai vector bila embeddings tersimpan DAN
`SUMOPOD_API_KEY` tersedia; tanpa itu otomatis fallback ke TF-IDF (tetap bisa
dipakai offline). Catatan: no-answer paling ketat dengan TF-IDF; vector search
bersifat semantik sehingga threshold-nya lebih tinggi (0.45).

## Filtering metadata (slide 6: top-k + filtering metadata)

`ask` bisa dipersempit ke dokumen/bagian tertentu lewat filter metadata —
berguna saat knowledge base sudah berisi banyak file:

```powershell
python ai_engine.py ask "Berapa biaya hotel Manager?" --doc sop_perjalanan.txt
python ai_engine.py ask "biaya hotel" --section "KETENTUAN UMUM"
python ai_engine.py ask "cuti" --doc sop_b.txt --retriever vector
```

- `--doc`    → hanya cari di chunk dokumen dengan nama tersebut (case-insensitive substring)
- `--section` → hanya cari di chunk dengan section_title tersebut

Bisa dikombinasikan dengan `--retriever`/`--llm`. Kalau filter tidak
mencocokkan dokumen apa pun, hasilnya no-answer (bukan error). Filter juga
tersedia di API Python: `kb.ask(query, filters={"filename": ...})`.

## Evaluasi golden question set

```powershell
python evaluate.py            # cek retrieval + citation + no-answer (offline)
python evaluate.py --llm      # + cek isi jawaban LLM
```

Check sesuai slide "Cara menguji AI/RAG": retrieval (chunk sumber masuk top-k),
answer (fakta yang diharapkan ada), citation (file + halaman benar), dan
no-answer (menolak saat bukti tidak cukup). Exit code 0 = semua PASS, cocok
untuk release gate.
