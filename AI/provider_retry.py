"""Satu tempat untuk mencoba ulang panggilan ke provider AI.

Sengaja dipakai bersama oleh jalur embeddings dan chat. Loop-nya menyimpan
satu properti yang mudah rusak kalau disalin-tempel: exception-nya dibangun di
dalam ``except`` tetapi di-``raise`` di LUAR-nya. Begitu blok ``except``
selesai, exception aslinya sudah dibersihkan, sehingga ``__context__`` tetap
``None`` dan header ``Authorization`` yang dipantulkan provider tidak ikut
terbawa ke rantai exception. Menuliskannya sekali jauh lebih aman daripada
mengandalkan setiap pemanggil mengingat urutannya.
"""

from __future__ import annotations

import random
import time
import urllib.error
import urllib.request
from typing import Any

from provider_errors import (
    ProviderHttpError,
    ProviderUnavailableError,
)

#: Status yang pantas dicoba ulang: semuanya gangguan sesaat. 401/403 tidak
#: masuk daftar — mengulang request dengan kredensial yang sama tidak akan
#: berubah hasilnya, hanya menambah penundaan.
RETRYABLE_STATUSES = frozenset({429, 500, 502, 503, 504})
#: Jeda dasar backoff. Dikalikan dua setiap percobaan, plus jitter supaya
#: beberapa worker tidak menabrak provider pada detik yang sama.
RETRY_BASE_SECONDS = 1.5
#: Batas atas penghormatan header Retry-After, supaya provider yang mengirim
#: angka besar tidak menggantung permintaan pengguna.
MAX_RETRY_AFTER_SECONDS = 30.0


def _retry_after_seconds(headers: Any) -> float | None:
    """Baca Retry-After sebagai angka detik, atau None kalau tidak terpakai.

    Hanya menerima bentuk angka dan tidak pernah ikut ke pesan error: nilainya
    datang dari provider, jadi diperlakukan sebagai data, bukan teks yang boleh
    diteruskan.
    """
    try:
        value = float(str(headers.get("Retry-After")).strip())
    except (AttributeError, TypeError, ValueError):
        return None
    if value <= 0:
        return None
    return min(value, MAX_RETRY_AFTER_SECONDS)


def read_with_retry(
    request: urllib.request.Request,
    *,
    operation: str,
    timeout: float,
    max_attempts: int,
    retry_budget: float | None = None,
) -> bytes:
    """Kirim ``request``, ulangi gangguan sesaat, kembalikan body mentahnya.

    ``retry_budget`` membatasi total waktu yang boleh dihabiskan untuk mencoba
    ulang. Gunanya membedakan dua jenis kegagalan yang biayanya jauh berbeda:
    status 429/503 kembali dalam hitungan milidetik sehingga mengulangnya
    hampir gratis, sedangkan timeout berarti provider menggantung selama
    ``timeout`` penuh — mengulanginya melipatgandakan waktu tunggu orang yang
    sedang menatap layar. Jalur latar belakang boleh membiarkannya ``None``.
    """
    attempts = max(1, max_attempts)
    started = time.monotonic()
    for attempt in range(1, attempts + 1):
        failure: ProviderHttpError | ProviderUnavailableError | None = None
        retry_after: float | None = None
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            status = exc.code
            retry_after = _retry_after_seconds(exc.headers)
            if exc.fp is not None:
                exc.close()
            failure = ProviderHttpError(operation, status)
        except (urllib.error.URLError, TimeoutError, OSError):
            failure = ProviderUnavailableError(operation)

        retryable = (
            not isinstance(failure, ProviderHttpError)
            or failure.status in RETRYABLE_STATUSES
        )
        # Lihat catatan modul: `raise` wajib di luar blok except di atas.
        if not retryable or attempt == attempts:
            raise failure

        delay = retry_after if retry_after is not None else (
            RETRY_BASE_SECONDS * (2 ** (attempt - 1))
        )
        delay += random.uniform(0, 0.25 * delay)

        # Percobaan berikutnya sendiri bisa memakan `timeout` penuh, jadi
        # biayanya ikut dihitung sebelum memutuskan — bukan hanya jedanya.
        if retry_budget is not None:
            elapsed = time.monotonic() - started
            if elapsed + delay + timeout > retry_budget:
                print(
                    f"[AI] {operation} gagal ({failure}); tidak dicoba ulang "
                    f"karena sudah menghabiskan {elapsed:.0f}s dari anggaran "
                    f"{retry_budget:.0f}s"
                )
                raise failure

        print(
            f"[AI] {operation} percobaan {attempt}/{attempts} gagal "
            f"({failure}); coba lagi dalam {delay:.1f}s"
        )
        time.sleep(delay)

    raise ProviderUnavailableError(operation)  # pragma: no cover - loop selalu kembali/raise
