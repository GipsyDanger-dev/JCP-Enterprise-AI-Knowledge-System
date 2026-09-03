import { DocumentStatus, LegalStatus, Prisma } from '@prisma/client';
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
    OR: [
      { categoryId: null },
      { category: { allowedRoles: { isEmpty: true } } },
      { category: { allowedRoles: { has: actor.role } } },
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
    OR: [{ allowedRoles: { isEmpty: true } }, { allowedRoles: { has: actor.role } }],
  };
}
