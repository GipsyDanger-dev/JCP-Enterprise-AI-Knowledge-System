import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

/**
 * Kabar bahwa ada job pemrosesan baru di antrean.
 *
 * Pemroses dokumen dulu menanyai database tiap 3 detik, dan itu yang membuat
 * Neon tidak pernah sempat tidur: compute baru mati setelah 5 menit tanpa
 * query, jadi poll sesering itu membuatnya menyala 24 jam dan menghabiskan
 * kuota compute paket gratis di pertengahan bulan. Dengan sinyal ini pemroses
 * cukup menunggu kabar dari tempat job dibuat.
 *
 * Tinggal di DocumentsModule karena ProcessingJobsModule sudah mengimpornya;
 * menyuntikkan pemrosesnya langsung ke DocumentsService akan membuat impor
 * melingkar.
 */
@Injectable()
export class DocumentQueueSignal {
  private readonly queued = new Subject<void>();

  readonly queued$: Observable<void> = this.queued.asObservable();

  /** Panggil setelah transaksi yang membuat job selesai di-commit. */
  notify() {
    this.queued.next();
  }
}
