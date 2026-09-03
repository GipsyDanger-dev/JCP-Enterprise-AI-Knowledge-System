import { DocumentStatus, LegalStatus, Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Satu-satunya definisi "dokumen mana yang boleh dilihat siapa".
 *
 * Sengaja berupa klausa `where` Prisma, bukan pengecekan setelah data terambil:
 * dokumen terlarang tidak pernah ikut keluar dari database, jadi tidak ada
 * jalur yang bisa membocorkannya karena lupa disaring. Setiap endpoint yang
 * menyentuh dokumen wajib memakai fungsi ini.
 *
 * Aturannya:
 *  - Admin melihat semua yang belum dihapus, apa pun status dan kategorinya.
 *  - Pegawai biasa hanya melihat dokumen yang sudah selesai diproses (READY).
 *  - Rancangan tidak pernah terlihat oleh pegawai biasa. Ini bukan soal
 *    kerahasiaan tapi soal benar/salah: menjawab pakai draft yang angkanya
 *    belum final sama bahayanya dengan menjawab pakai aturan yang sudah dicabut.
 *  - Sisanya ditentukan kategori. Kategori tanpa daftar role berarti terbuka
 *    untuk semua pegawai — dokumen JDIH memang publik, jadi terbuka adalah
 *    default yang wajar. Dokumen yang belum berkategori ikut aturan yang sama.
 */
export function documentVisibilityWhere(actor: AuthenticatedUser): Prisma.DocumentWhereInput {
  if (actor.isAdmin) return { deletedAt: null };

  return {
    deletedAt: null,
    status: DocumentStatus.READY,
    legalStatus: { not: LegalStatus.RANCANGAN },
    // Penanda per dokumen. Hanya mempersempit: dokumen tanpa penanda ikut
    // aturan kategori, dokumen bertanda hanya lolos untuk unit kerja itu.
    AND: [
      {
        OR: [
          { unitKerjaId: null },
          ...(actor.unitKerjaId ? [{ unitKerjaId: actor.unitKerjaId }] : []),
        ],
      },
    ],
    OR: [
      // Belum berkategori, atau kategorinya tidak dibatasi unit kerja mana pun.
      { categoryId: null },
      { category: { units: { none: {} } } },
      // Kategori yang secara tegas mencantumkan unit kerja aktor.
      ...(actor.unitKerjaId
        ? [{ category: { units: { some: { id: actor.unitKerjaId } } } }]
        : []),
    ],
  };
}

/**
 * Daftar id kategori yang boleh dibaca aktor. Dipakai untuk meneruskan batas
 * akses ke AI service, supaya keputusan siapa-boleh-apa tetap satu tempat di
 * backend dan AI hanya menjalankan penyaringnya.
 *
 * Mengembalikan `null` bila aktor boleh membaca semuanya (admin).
 */
export function allowedCategoryFilter(actor: AuthenticatedUser): Prisma.DocumentCategoryWhereInput | null {
  if (actor.isAdmin) return null;
  return {
    OR: [
      { units: { none: {} } },
      ...(actor.unitKerjaId ? [{ units: { some: { id: actor.unitKerjaId } } }] : []),
    ],
  };
}

/**
 * Apakah aktor boleh mengelola (unggah/ubah/hapus) dokumen pada unit kerja ini.
 *
 * Gagal tertutup: ADMIN_UNIT yang belum ditempatkan di unit kerja mana pun
 * tidak bisa mengelola apa pun, bukan malah bisa mengelola semuanya.
 */
export function canManageForUnit(actor: AuthenticatedUser, unitKerjaId: string | null | undefined): boolean {
  if (actor.isAdmin) return true;
  if (actor.role !== UserRole.ADMIN_UNIT) return false;
  if (!actor.unitKerjaId) return false;
  // Tanpa unit tujuan berarti dokumen untuk semua orang — itu keputusan
  // tingkat organisasi, bukan wewenang admin satu unit.
  return unitKerjaId === actor.unitKerjaId;
}

/** Aktor yang boleh mengunggah dokumen sama sekali. */
export function canUploadDocuments(actor: AuthenticatedUser): boolean {
  return actor.isAdmin || (actor.role === UserRole.ADMIN_UNIT && Boolean(actor.unitKerjaId));
}
