/**
 * ============================================================================
 *  DATA ACUAN — VERSI SEMENTARA, BUKAN DARI SUMBER RESMI
 * ============================================================================
 *
 * Daftar unit kerja di bawah ini DIKARANG untuk keperluan pengembangan dan
 * BELUM dicocokkan dengan Perbup Susunan Organisasi dan Tata Kerja Kabupaten
 * Sleman.
 *
 * Bentuknya sengaja dibuat SATU-LAWAN-SATU dengan kategori dokumen: setiap
 * dinas punya tepat satu kategori, dan sebaliknya. Alasannya praktis — orang
 * yang menambah pengguna cukup memilih dinasnya dan langsung tahu dokumen apa
 * yang akan terlihat, tanpa perlu menghafal OPD mana saja yang dititipkan ke
 * satu kategori. Relasinya di skema tetap banyak-ke-banyak, jadi kalau nanti
 * ada dinas yang perlu membaca lebih dari satu kategori, cukup tambahkan
 * kodenya di `units` di bawah tanpa mengubah kode program.
 *
 * Cara menggantinya kalau daftar resmi sudah didapat:
 *   1. ubah isi UNIT_KERJA dan KATEGORI_DOKUMEN di file ini
 *   2. bila ada kode unit yang dihapus/diganti, catat di PEMETAAN_UNIT_LAMA
 *      supaya pengguna lama ikut dipindahkan, bukan malah kehilangan aksesnya
 *   3. jalankan `npm run prisma:seed`
 *
 * Tidak perlu migration dan tidak perlu mengubah kode lain — inilah alasan
 * daftar ini disimpan sebagai baris tabel, bukan sebagai enum di skema.
 */

export interface UnitKerjaSeed {
  code: string;
  name: string;
}

/** Unit kerja / OPD. `code` dipakai sebagai kunci, jadi jangan diubah sembarangan. */
export const UNIT_KERJA: UnitKerjaSeed[] = [
  { code: 'HUKUM', name: 'Dinas Hukum & Peradilan' },
  { code: 'KEBUDAYAAN', name: 'Dinas Kebudayaan' },
  { code: 'KEPEGAWAIAN', name: 'Dinas Kepegawaian & ASN' },
  { code: 'KEUANGAN', name: 'Dinas Keuangan & Anggaran Daerah' },
  { code: 'KOPERASI', name: 'Dinas Koperasi, UMKM & Ekonomi' },
  { code: 'LINGKUNGAN', name: 'Dinas Lingkungan & Sarana Prasarana' },
  { code: 'PAJAK', name: 'Dinas Pajak & Retribusi' },
  { code: 'PELAYANAN', name: 'Dinas Pelayanan Publik & Informasi' },
  { code: 'KALURAHAN', name: 'Dinas Pemerintahan Kalurahan' },
  { code: 'PERENCANAAN', name: 'Dinas Perencanaan & Pembangunan' },
  { code: 'PERTANIAN', name: 'Dinas Pertanian' },
  { code: 'SOSIAL', name: 'Dinas Sosial, Kesehatan & Pendidikan' },
];

/**
 * Kode unit kerja yang sudah tidak ada lagi, dan penggantinya.
 *
 * Dipakai seed untuk memindahkan pengguna serta penanda dokumen sebelum baris
 * lamanya dihapus. Tanpa ini `onDelete: SetNull` akan membuat unitKerjaId
 * pengguna menjadi NULL — dan pegawai tanpa unit kerja hanya melihat kategori
 * yang terbuka untuk semua orang, jadi akses mereka hilang diam-diam.
 *
 * Isinya susunan OPD versi pertama, sebelum daftar unit disamakan dengan
 * kategori. Aman dibiarkan meski barisnya sudah tidak ada di database.
 */
export const PEMETAAN_UNIT_LAMA: Record<string, string> = {
  SETDA: 'HUKUM',
  SETWAN: 'HUKUM',
  SATPOLPP: 'HUKUM',
  INSPEKTORAT: 'KEUANGAN',
  BKAD: 'KEUANGAN',
  BAPPEDA: 'PERENCANAAN',
  BKPP: 'KEPEGAWAIAN',
  DISKUKMPP: 'KOPERASI',
  DPMPTSP: 'KOPERASI',
  DISDIK: 'SOSIAL',
  DINKES: 'SOSIAL',
  DINSOS: 'SOSIAL',
  DPUPKP: 'LINGKUNGAN',
  DLH: 'LINGKUNGAN',
  DISHUB: 'LINGKUNGAN',
  DPPP: 'PERTANIAN',
  DISBUD: 'KEBUDAYAAN',
  DISPAR: 'KEBUDAYAAN',
  DUKCAPIL: 'PELAYANAN',
  DISKOMINFO: 'PELAYANAN',
  DPMK: 'KALURAHAN',
};

export interface KategoriSeed {
  name: string;
  /**
   * Unit kerja yang boleh membacanya. Daftar KOSONG = terbuka untuk semua pegawai.
   *
   * Semua kategori sengaja dibiarkan kosong: isi JDIH adalah peraturan daerah
   * yang memang publik, dan mengunci kategori berarti mengunci puluhan dokumen
   * sekaligus tanpa ada yang pernah memutuskannya per dokumen. Pembatasan
   * ditetapkan sadar lewat penanda unit kerja pada masing-masing dokumen
   * (`documents.unit_kerja_id`), yang bisa dipasang dan dilepas admin dari
   * antarmuka. Mekanisme ini tetap ada bila suatu saat memang ada kategori yang
   * seluruh isinya rahasia bagi satu dinas.
   */
  units: string[];
}

/**
 * Kategori/subjek dokumen. Daftar ini disusun dari hasil pembacaan 152 dokumen
 * JDIH Sleman yang sudah dikumpulkan, jadi proporsinya mengikuti isi korpus
 * yang nyata — bukan daftar teoretis.
 *
 * Kategori di sini murni penanda subjek untuk pencarian dan filter. Tidak ada
 * satu pun yang membatasi akses.
 */
export const KATEGORI_DOKUMEN: KategoriSeed[] = [
  { name: 'Koperasi, UMKM & Ekonomi', units: [] },
  { name: 'Keuangan & Anggaran Daerah', units: [] },
  { name: 'Pajak & Retribusi', units: [] },
  { name: 'Kepegawaian & ASN', units: [] },
  { name: 'Pemerintahan Kalurahan', units: [] },
  { name: 'Perencanaan & Pembangunan', units: [] },
  { name: 'Sosial, Kesehatan & Pendidikan', units: [] },
  { name: 'Lingkungan & Sarana Prasarana', units: [] },
  { name: 'Kebudayaan', units: [] },
  { name: 'Pertanian', units: [] },
  { name: 'Hukum & Peradilan', units: [] },
  { name: 'Pelayanan Publik & Informasi', units: [] },
];

/**
 * Nomenklatur jabatan. Hanya keterangan — tidak memengaruhi hak akses dokumen
 * sama sekali. Yang menentukan akses adalah unit kerja.
 */
export const JABATAN: string[] = [
  'Kepala Perangkat Daerah',
  'Sekretaris',
  'Kepala Bidang',
  'Kepala Subbagian',
  'Kepala Seksi',
  'Kepala Subbidang',
  'Jabatan Fungsional',
  'Staf / Pelaksana',
];

/**
 * Jabatan yang boleh menerbitkan pengumuman dan melihat siapa saja yang sudah
 * membacanya, di luar admin.
 *
 * Ditaruh berdampingan dengan JABATAN supaya isinya tidak bisa lepas dari
 * nomenklatur yang dipakai form pengguna: jabatan yang salah tulis di sini
 * tidak akan pernah cocok dengan jabatan siapa pun, dan wewenangnya hilang
 * diam-diam. Perbandingannya sendiri mengabaikan besar-kecil huruf dan spasi
 * di tepi, karena jabatan pengguna lama masih berupa teks bebas.
 */
export const JABATAN_PENERBIT_PENGUMUMAN: string[] = [
  'Kepala Perangkat Daerah',
  'Sekretaris',
];

/** Kategori demo bawaan template lama; dihapus saat seed bila belum dipakai dokumen. */
export const KATEGORI_DEMO_LAMA = [
  'finance', 'it & security', 'legal', 'marketing', 'operations', 'people',
];
