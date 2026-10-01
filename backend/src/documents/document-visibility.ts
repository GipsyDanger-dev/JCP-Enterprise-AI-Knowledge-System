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
 * ikut. Dipisah supaya pemegang izin unggah lewat jabatan bisa memakainya apa
 * adanya untuk dokumen selain unggahannya — kalau disalin, keduanya akan
 * berbeda diam-diam pada perubahan berikutnya, dan yang menyimpang adalah
 * aturan akses.
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
  if (!pengunggahLewatJabatan(actor)) return false;
  // Tanpa unit tujuan berarti dokumen untuk semua orang — itu keputusan
  // tingkat organisasi, bukan wewenang satu unit.
  return unitKerjaId === actor.unitKerjaId;
}

/**
 * Bolehkah aktor mengubah atau menghapus dokumen yang SUDAH ada.
 *
 * Berbeda dari canTargetUnit karena izin lewat jabatan sengaja sempit:
 * pemegangnya boleh membereskan apa yang ia unggah sendiri — salah berkas, salah judul — tetapi tidak boleh menyentuh arsip
 * yang dinaikkan orang lain. Centang berlabel "boleh unggah" tidak semestinya
 * diam-diam memberi kuasa menghapus seluruh dokumen unitnya.
 */
export function canManageDocument(
  actor: AuthenticatedUser,
  document: { unitKerjaId: string | null; uploadedById: string | null },
): boolean {
  if (!canTargetUnit(actor, document.unitKerjaId)) return false;
  if (actor.isAdmin || actor.accountType === 'PERSONAL') return true;
  // NULL berarti akun pengunggahnya sudah dihapus. Perbandingan ini otomatis
  // bernilai salah, jadi dokumen yatim jatuh ke tangan admin saja -- haknya
  // mengecil, tidak pernah melebar.
  return document.uploadedById === actor.sub;
}

/**
 * Bolehkah aktor mengubah status keberlakuan sebuah dokumen.
 *
 * Lebih longgar daripada canManageDocument dan sengaja demikian: menetapkan
 * sebuah peraturan sudah dicabut atau diubah adalah pekerjaan bagian hukum,
 * yang biasanya bukan orang yang menaikkan berkasnya dan bukan pula admin. Karena itu ada centang jabatan tersendiri, dan pemegangnya boleh
 * menyentuh status dokumen mana pun yang bisa ia lihat.
 *
 * Yang TIDAK ikut melonggar adalah kategori dan penanda unit: keduanya tetap
 * milik canManageDocument. Centang ini hanya memberi kuasa atas satu kolom.
 *
 * Batas "yang bisa ia lihat" tetap ditegakkan terpisah lewat
 * documentVisibilityWhere saat barisnya dicari — tanpa itu, centang ini jadi
 * jalan mengintip keberadaan dokumen unit lain.
 */
export function canManageLegalStatus(
  actor: AuthenticatedUser,
  document: { unitKerjaId: string | null; uploadedById: string | null },
): boolean {
  if (actor.accountType === 'PERSONAL') return canManageDocument(actor, document);
  return Boolean(actor.jabatan?.canManageLegalStatus) || canManageDocument(actor, document);
}

/** Aktor yang boleh mengunggah dokumen sama sekali. */
export function canUploadDocuments(actor: AuthenticatedUser): boolean {
  return actor.accountType === 'PERSONAL'
    || actor.isAdmin
    || pengunggahLewatJabatan(actor);
}
