"""Kecilkan gambar pengumuman yang sudah telanjur tersimpan besar.

Gambar pengumuman disimpan sebagai data URL base64 di kolom
``announcements.image_data_url`` dan ikut terkirim utuh pada setiap
``GET /announcements``. Unggahan baru sudah dikecilkan di browser sejak
``imageFileToCompressedDataUrl`` dipakai di ``frontend/src/utils/files.ts``;
skrip ini memberlakukan hal yang sama untuk baris yang sudah ada.

Batas dan aturannya sengaja dijaga sama persis dengan yang di browser, supaya
gambar lama dan baru tidak berakhir dengan dua mutu yang berbeda.

Jalankan:
    python backend/scripts/shrink-announcement-images.py            # hanya melapor
    python backend/scripts/shrink-announcement-images.py --apply    # menulis

Tanpa ``--apply`` tidak ada satu baris pun yang disentuh. Itu disengaja:
DATABASE_URL di ``.env`` bisa saja menunjuk basis data yang dipakai sungguhan,
dan pengecilan ini tidak bisa dibatalkan — gambar aslinya tidak disimpan
di tempat lain.

Butuh Pillow (``pip install Pillow``) dan psycopg, yang sudah jadi syarat
AI Service.
"""
import argparse
import base64
import io
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

import psycopg
from PIL import Image

# Sama dengan IMAGE_MAX_DIMENSION, IMAGE_KEEP_AS_IS_SIZE, dan IMAGE_QUALITY
# di frontend/src/utils/files.ts. Kalau salah satunya berubah, ubah keduanya.
MAX_DIMENSION = 1600
KEEP_AS_IS_SIZE = 300 * 1024
QUALITY = 82

DATA_URL = re.compile(r'^data:image/(avif|gif|jpeg|png|webp);base64,(.+)$', re.DOTALL)


def shrink(data_url: str) -> tuple[str | None, str]:
    """Data URL yang lebih kecil, atau None bila sebaiknya dibiarkan.

    Nilai kedua adalah alasannya, untuk dilaporkan ke layar.
    """
    match = DATA_URL.match(data_url)
    if not match:
        return None, 'bukan data URL gambar yang dikenali'
    source_format, payload = match.group(1), match.group(2)
    # GIF dilewatkan dengan alasan yang sama seperti di browser: menyimpannya
    # ulang hanya menahan satu bingkai, jadi gambar bergerak akan jadi diam.
    if source_format == 'gif':
        return None, 'GIF dibiarkan supaya animasinya tidak hilang'
    try:
        original = base64.b64decode(payload, validate=True)
    except Exception:
        return None, 'base64 tidak dapat dibaca'

    try:
        image = Image.open(io.BytesIO(original))
        image.load()
    except Exception as error:
        return None, f'gambar tidak dapat dibuka ({error})'

    longest = max(image.size)
    if longest <= MAX_DIMENSION and len(original) <= KEEP_AS_IS_SIZE:
        return None, 'sudah cukup kecil'

    if longest > MAX_DIMENSION:
        scale = MAX_DIMENSION / longest
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        image = image.resize(size, Image.LANCZOS)

    buffer = io.BytesIO()
    # WebP menyimpan alpha, jadi PNG tembus pandang tidak perlu dialasi putih
    # seperti pada jalur cadangan JPEG di browser.
    image.convert('RGBA' if image.mode in ('RGBA', 'LA', 'P') else 'RGB').save(
        buffer, format='WEBP', quality=QUALITY, method=6
    )
    shrunk = buffer.getvalue()
    if len(shrunk) >= len(original):
        return None, 'hasilnya tidak lebih kecil'
    return 'data:image/webp;base64,' + base64.b64encode(shrunk).decode('ascii'), (
        f'{len(original) // 1024} KB -> {len(shrunk) // 1024} KB'
    )


def database_url() -> str:
    """DATABASE_URL dari lingkungan, atau dari .env di akar repo."""
    from_env = os.environ.get('DATABASE_URL')
    if from_env:
        return from_env
    env_file = Path(__file__).resolve().parents[2] / '.env'
    for line in env_file.read_text(encoding='utf-8-sig').splitlines():
        if line.startswith('DATABASE_URL='):
            return line.removeprefix('DATABASE_URL=').strip().strip('"').strip("'")
    raise SystemExit('DATABASE_URL tidak ditemukan di lingkungan maupun .env')


def to_dsn(url: str) -> str:
    """Buang parameter khusus Prisma yang tidak dikenali libpq."""
    parts = urlsplit(url)
    prisma_only = {'schema', 'connection_limit', 'pool_timeout', 'pgbouncer', 'connect_timeout'}
    query = [(k, v) for k, v in parse_qsl(parts.query) if k not in prisma_only]
    return urlunsplit(parts._replace(query=urlencode(query)))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='tulis perubahannya; tanpa ini hanya melapor')
    args = parser.parse_args()

    with psycopg.connect(to_dsn(database_url())) as conn:
        rows = conn.execute(
            'SELECT id, title, image_data_url FROM announcements '
            'WHERE image_data_url IS NOT NULL ORDER BY published_at'
        ).fetchall()

        if not rows:
            print('Tidak ada pengumuman bergambar.')
            return 0

        saved = 0
        changed = 0
        for announcement_id, title, data_url in rows:
            shrunk, reason = shrink(data_url)
            label = (title or '')[:48]
            if shrunk is None:
                print(f'  lewati  {label} — {reason}')
                continue
            saved += len(data_url) - len(shrunk)
            changed += 1
            print(f'  kecilkan {label} — {reason}')
            if args.apply:
                conn.execute(
                    'UPDATE announcements SET image_data_url = %s WHERE id = %s',
                    (shrunk, announcement_id),
                )

        if args.apply:
            conn.commit()

        print()
        print(f'{changed} dari {len(rows)} pengumuman bergambar, hemat ~{saved // 1024} KB.')
        if changed and not args.apply:
            print('Belum ada yang ditulis. Ulangi dengan --apply untuk menyimpannya.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
