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
 *  - Admin unit melihat seluruh isi unitnya sendiri dengan keleluasaan yang
 *    sama, termasuk yang belum selesai diproses dan rancangan. Di luar unitnya
 *    ia tunduk pada aturan pegawai.
 *  - Jabatan yang dicentang "boleh unggah" melihat unggahannya sendiri apa pun
 *    statusnya, dan selebihnya tunduk pada aturan pegawai.
 *  - Pegawai biasa hanya melihat dokumen yang sudah selesai diproses (READY).
 *  - Rancangan tidak pernah terlihat oleh pegawai biasa. Ini bukan soal
 *    kerahasiaan tapi soal benar/salah: menjawab pakai draft yang angkanya
 *    belum final sama bahayanya dengan menjawab pakai aturan yang sudah dicabut.
 *  - Sisanya ditentukan kategori. Kategori tanpa daftar role berarti terbuka
 *    untuk semua pegawai — dokumen JDIH memang publik, jadi terbuka adalah
 *    default yang wajar. Dokumen yang belum berkategori ikut aturan yang sama.
 */
export function documentVisibilityWhere(actor: AuthenticatedUser): Prisma.DocumentWhereInput {
  if (actor.accountType === 'PERSONAL') return { workspaceId: actor.workspaceId, uploadedById: actor.sub, deletedAt: null };
  if (actor.isAdmin) return { workspaceId: actor.workspaceId, deletedAt: null };

  const dasar = { workspaceId: actor.workspaceId, deletedAt: null };

  /*
   * Admin unit melihat SELURUH isi unitnya sendiri, apa pun status pemrosesan
   * dan status keberlakuannya; di luar unitnya ia tetap pegawai biasa.
   *
   * Tanpa cabang ini ia tidak bisa mengurus apa pun yang belum READY — padahal
   * dokumen yang baru diunggah selalu berstatus QUEUED. Akibatnya dokumen
   * menghilang dari daftar tepat setelah ia mengunggahnya, halaman status
   * pemrosesan menjawab "tidak ditemukan", dan unggahan yang gagal diproses
   * (FAILED) tidak pernah bisa ia lihat apalagi hapus. Rancangan unitnya pun
   * tak terlihat, sehingga wewenang menyuntingnya tidak ada gunanya.
   *
   * Dokumen TANPA penanda unit sengaja tidak ikut dibuka meski belum READY:
   * itu milik seluruh organisasi, dan canTargetUnit memang tidak
   * mengizinkannya mengelola dokumen semacam itu. Membukanya di sini hanya akan
   * memperlihatkan rancangan tingkat organisasi kepada orang yang tidak boleh
   * menyentuhnya.
   *
   * Yang TIDAK ikut melonggar adalah jalur tanya-jawab AI: batas yang dikirim
   * ke sana disusun terpisah di chat.service.ts dan tetap menolak rancangan
   * untuk siapa pun selain admin. Terlihat di daftar dan boleh dikutip sebagai
   * jawaban adalah dua hal berbeda — rancangan aman diurus, tidak aman dikutip.
   */
  if (actor.role === UserRole.ADMIN_UNIT && actor.unitKerjaId) {
    return { ...dasar, OR: [{ unitKerjaId: actor.unitKerjaId }, aturanPegawai(actor)] };
  }

  // Pemegang izin unggah lewat jabatan melihat apa yang ia unggah sendiri,
  // apa pun statusnya — dokumen baru selalu QUEUED, jadi tanpa ini unggahannya
  // menghilang tepat setelah dikirim dan ia tidak bisa membereskan kekeliruan
  // yang justru hanya ia sendiri yang boleh perbaiki. Hanya miliknya: selebihnya
  // ia tetap pegawai biasa.
  if (pengunggahLewatJabatan(actor)) {
    return { ...dasar, OR: [{ uploadedById: actor.sub }, aturanPegawai(actor)] };
  }

  return { ...dasar, ...aturanPegawai(actor) };
}

/**
 * Aturan untuk pegawai biasa, tanpa batas workspace dan `deletedAt` yang selalu
 * ikut. Dipisah supaya admin unit bisa memakainya apa adanya untuk dokumen di
 * luar unitnya — kalau disalin, keduanya akan berbeda diam-diam pada perubahan
 * berikutnya, dan yang menyimpang adalah aturan akses.
 */
function aturanPegawai(actor: AuthenticatedUser): Prisma.DocumentWhereInput {
  return {
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
  if (actor.isAdmin || actor.accountType === 'PERSONAL') return { workspaceId: actor.workspaceId };
  return {
    workspaceId: actor.workspaceId,
    OR: [
      { units: { none: {} } },
      ...(actor.unitKerjaId ? [{ units: { some: { id: actor.unitKerjaId } } }] : []),
    ],
  };
}

/**
 * Pemegang izin unggah lewat jabatan, mis. seorang Ketua yang di mata
 * pengelolaan dokumen tetap PEGAWAI biasa.
 *
 * Wajib punya unit kerja. Tanpa itu satu-satunya dokumen yang bisa ia buat
 * adalah dokumen tanpa penanda — yang terbuka untuk SELURUH pegawai — dan
 * menerbitkan yang seperti itu adalah keputusan tingkat organisasi, bukan
 * sesuatu yang menempel pada nomenklatur jabatan.
 */
function pengunggahLewatJabatan(actor: AuthenticatedUser): boolean {
  return Boolean(actor.jabatan?.canUploadDocuments) && Boolean(actor.unitKerjaId);
}

/**
 * Bolehkah aktor menaruh dokumen pada unit kerja ini — saat mengunggah baru,
 * maupun saat memindahkan yang sudah ada.
 *
 * Gagal tertutup: yang belum ditempatkan di unit kerja mana pun tidak bisa
 * menaruh apa pun, bukan malah bisa menaruh di mana saja.
 */
export function canTargetUnit(actor: AuthenticatedUser, unitKerjaId: string | null | undefined): boolean {
  if (actor.accountType === 'PERSONAL') return !unitKerjaId;
  if (actor.isAdmin) return true;
  if (!actor.unitKerjaId) return false;
  if (actor.role !== UserRole.ADMIN_UNIT && !pengunggahLewatJabatan(actor)) return false;
  // Tanpa unit tujuan berarti dokumen untuk semua orang — itu keputusan
  // tingkat organisasi, bukan wewenang satu unit.
  return unitKerjaId === actor.unitKerjaId;
}

/**
 * Bolehkah aktor mengubah atau menghapus dokumen yang SUDAH ada.
 *
 * Berbeda dari canTargetUnit karena izin lewat jabatan sengaja lebih sempit
 * daripada ADMIN_UNIT: pemegangnya boleh membereskan apa yang ia unggah
 * sendiri — salah berkas, salah judul — tetapi tidak boleh menyentuh arsip
 * yang dinaikkan orang lain. Centang berlabel "boleh unggah" tidak semestinya
 * diam-diam memberi kuasa menghapus seluruh dokumen unitnya.
 */
export function canManageDocument(
  actor: AuthenticatedUser,
  document: { unitKerjaId: string | null; uploadedById: string },
): boolean {
  if (!canTargetUnit(actor, document.unitKerjaId)) return false;
  if (actor.isAdmin || actor.accountType === 'PERSONAL' || actor.role === UserRole.ADMIN_UNIT) return true;
  return document.uploadedById === actor.sub;
}

/** Aktor yang boleh mengunggah dokumen sama sekali. */
export function canUploadDocuments(actor: AuthenticatedUser): boolean {
  return actor.accountType === 'PERSONAL'
    || actor.isAdmin
    || (actor.role === UserRole.ADMIN_UNIT && Boolean(actor.unitKerjaId))
    || pengunggahLewatJabatan(actor);
}
