/**
 * ============================================================================
 *  DATA ACUAN — VERSI SEMENTARA, BUKAN DARI SUMBER RESMI
 * ============================================================================
 *
 * Daftar unit kerja di bawah ini DIKARANG untuk keperluan pengembangan. Bentuknya
 * dibuat menyerupai susunan perangkat daerah pada umumnya, tetapi BELUM
 * dicocokkan dengan Perbup Susunan Organisasi dan Tata Kerja Kabupaten Sleman.
 *
 * Cara menggantinya kalau daftar resmi sudah didapat:
 *   1. ubah isi UNIT_KERJA dan KATEGORI_DOKUMEN di file ini
 *   2. jalankan `npm run prisma:seed`
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
  { code: 'SETDA', name: 'Sekretariat Daerah' },
  { code: 'SETWAN', name: 'Sekretariat DPRD' },
  { code: 'INSPEKTORAT', name: 'Inspektorat' },
  { code: 'BAPPEDA', name: 'Badan Perencanaan Pembangunan Daerah' },
  { code: 'BKAD', name: 'Badan Keuangan dan Aset Daerah' },
  { code: 'BKPP', name: 'Badan Kepegawaian, Pendidikan dan Pelatihan' },
  { code: 'DISKUKMPP', name: 'Dinas Koperasi, UKM, Perindustrian dan Perdagangan' },
  { code: 'DPMPTSP', name: 'Dinas Penanaman Modal dan Pelayanan Terpadu Satu Pintu' },
  { code: 'DISDIK', name: 'Dinas Pendidikan' },
  { code: 'DINKES', name: 'Dinas Kesehatan' },
  { code: 'DINSOS', name: 'Dinas Sosial' },
  { code: 'DPUPKP', name: 'Dinas Pekerjaan Umum, Perumahan dan Kawasan Permukiman' },
  { code: 'DLH', name: 'Dinas Lingkungan Hidup' },
  { code: 'DPPP', name: 'Dinas Pertanian, Pangan dan Perikanan' },
  { code: 'DISBUD', name: 'Dinas Kebudayaan' },
  { code: 'DISPAR', name: 'Dinas Pariwisata' },
  { code: 'DUKCAPIL', name: 'Dinas Kependudukan dan Pencatatan Sipil' },
  { code: 'DISHUB', name: 'Dinas Perhubungan' },
  { code: 'DISKOMINFO', name: 'Dinas Komunikasi dan Informatika' },
  { code: 'DPMK', name: 'Dinas Pemberdayaan Masyarakat dan Kalurahan' },
  { code: 'SATPOLPP', name: 'Satuan Polisi Pamong Praja' },
];

export interface KategoriSeed {
  name: string;
  /** Unit kerja yang boleh membacanya. Daftar KOSONG = terbuka untuk semua pegawai. */
  units: string[];
}

/**
 * Kategori/subjek dokumen. Daftar ini disusun dari hasil pembacaan 152 dokumen
 * JDIH Sleman yang sudah dikumpulkan, jadi proporsinya mengikuti isi korpus
 * yang nyata — bukan daftar teoretis.
 */
export const KATEGORI_DOKUMEN: KategoriSeed[] = [
  { name: 'Koperasi, UMKM & Ekonomi', units: ['DISKUKMPP', 'DPMPTSP', 'BAPPEDA'] },
  { name: 'Keuangan & Anggaran Daerah', units: ['BKAD', 'SETDA', 'INSPEKTORAT', 'BAPPEDA'] },
  { name: 'Pajak & Retribusi', units: ['BKAD', 'DPMPTSP'] },
  { name: 'Kepegawaian & ASN', units: ['BKPP', 'SETDA'] },
  { name: 'Pemerintahan Kalurahan', units: ['DPMK', 'SETDA'] },
  { name: 'Perencanaan & Pembangunan', units: ['BAPPEDA', 'SETDA'] },
  { name: 'Sosial, Kesehatan & Pendidikan', units: ['DINSOS', 'DINKES', 'DISDIK'] },
  { name: 'Lingkungan & Sarana Prasarana', units: ['DLH', 'DPUPKP', 'DISHUB'] },
  { name: 'Kebudayaan', units: ['DISBUD', 'DISPAR'] },
  { name: 'Pertanian', units: ['DPPP'] },
  { name: 'Hukum & Peradilan', units: ['SETDA', 'INSPEKTORAT'] },
  // Sengaja terbuka: peraturan pelayanan publik dan keterbukaan informasi
  // memang ditujukan untuk semua pegawai, bukan satu bidang tertentu.
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

/** Kategori demo bawaan template lama; dihapus saat seed bila belum dipakai dokumen. */
export const KATEGORI_DEMO_LAMA = [
  'finance', 'it & security', 'legal', 'marketing', 'operations', 'people',
];
