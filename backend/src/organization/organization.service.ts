import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, AuditAction, Prisma, UserRole } from '@prisma/client';
import { AuditLogsService, pelakuAktor } from '../audit-logs/audit-logs.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  CreateJabatanDto,
  CreateUnitKerjaDto,
  UpdateJabatanDto,
  UpdateRoleLabelDto,
  UpdateUnitKerjaDto,
} from './dto/organization.dto';

/**
 * Role yang boleh diberi nama tampilan sendiri.
 *
 * Sengaja daftar tertutup, bukan seluruh isi enum UserRole: nilai warisan
 * seperti BENDAHARA atau HUMAS tidak lagi dipakai kode mana pun, jadi memberi
 * instansi tombol untuk menamainya hanya akan memunculkan pilihan yang tidak
 * berarti apa-apa di form pembuatan akun.
 */
export const ROLE_YANG_DIPAKAI: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN_UNIT, UserRole.PEGAWAI];

/**
 * Nama tampilan bawaan, dipakai saat workspace lama belum punya barisnya.
 *
 * Kembarannya ada di prisma/reference-data.ts (ROLE_LABEL_BAWAAN) yang mengisi
 * database; yang di sini hanya jaring pengaman untuk pembacaan.
 */
const BAWAAN_ROLE: Record<string, { label: string; description: string }> = {
  [UserRole.SUPER_ADMIN]: { label: 'Admin', description: 'Mengelola seluruh dokumen, pengguna, dan pengaturan workspace.' },
  [UserRole.ADMIN_UNIT]: { label: 'Admin Unit', description: 'Mengelola dokumen milik unit kerjanya sendiri.' },
  [UserRole.PEGAWAI]: { label: 'Pegawai', description: 'Membaca dokumen yang terbuka untuk unit kerjanya.' },
};

/**
 * Pemegangnya disaring seperti unit kerja — akun perusahaan di workspace ini —
 * ditambah satu syarat: hanya yang akunnya masih aktif yang ikut terhitung.
 *
 * Yang menahan penghapusan harus orang yang wewenangnya benar-benar bisa
 * terpakai. Akun nonaktif tidak bisa masuk sama sekali, jadi menahannya demi
 * mereka hanya menyisakan jabatan yang tidak akan pernah bisa dibersihkan
 * selain dengan menghapus akunnya. Jumlah pemegang nonaktif tetap dihitung
 * terpisah (`inactiveUserCount`) supaya antarmuka bisa memperingatkan bahwa
 * jabatan mereka ikut lepas kalau akunnya diaktifkan lagi.
 */
const jabatanSelect = (workspaceId: string) => ({
  id: true,
  name: true,
  canManageAnnouncements: true,
  canViewAnnouncementReaders: true,
  canUploadDocuments: true,
  canManageLegalStatus: true,
  isActive: true,
  sortOrder: true,
  _count: { select: { users: { where: { accountType: AccountType.COMPANY, workspaceId, isActive: true } } } },
}) satisfies Prisma.JabatanSelect;

/**
 * Penyaring penggunanya menyamai daftar Orang & akses (UsersService.findAll),
 * bukan menghitung seluruh baris yang menunjuk unit ini.
 *
 * Tanpa disamakan, akun PERSONAL ikut terhitung padahal tidak pernah muncul di
 * daftar mana pun. Admin lalu membaca "3 pengguna" untuk unit yang hanya berisi
 * 2 orang, dan tidak punya cara menemukan yang ketiga.
 *
 * Akun PERSONAL sengaja diabaikan seluruhnya di konteks perusahaan, bukan
 * sekadar dilaporkan terpisah: penanda unit pada akun semacam itu adalah data
 * mati. documentVisibilityWhere tidak pernah melihat unit untuk akun PERSONAL —
 * aksesnya murni lewat uploadedById — jadi tidak ada yang hilang saat penandanya
 * ikut kosong. Filter yang sama dipakai pemeriksa penghapusan di bawah, supaya
 * yang ditampilkan dan yang menahan selalu populasi yang sama persis.
 */
const unitSelect = (workspaceId: string) => ({
  id: true,
  code: true,
  name: true,
  isActive: true,
  _count: {
    select: {
      users: { where: { accountType: AccountType.COMPANY, workspaceId } },
      documents: { where: { deletedAt: null } },
    },
  },
}) satisfies Prisma.UnitKerjaSelect;

/**
 * Kolom mana yang bentrok pada pelanggaran keunikan.
 *
 * Unit kerja dikunci dua kali — pada kode dan pada nama — jadi satu pesan
 * "kode sudah dipakai" akan menyesatkan orang yang sebenarnya mengetik nama
 * yang sudah ada. Prisma menyebutkan kolomnya di `meta.target`; kalau tidak
 * (bentuknya berbeda antarversi), dipakai pesan bawaan yang masih benar.
 */
function pesanKonflik(error: Prisma.PrismaClientKnownRequestError, peta: Record<string, string>, bawaan: string) {
  const target = error.meta?.target;
  const kolom = (Array.isArray(target) ? target : [target]).filter((item): item is string => typeof item === 'string');
  const cocok = Object.entries(peta).find(([kunci]) => kolom.some((item) => item.toLowerCase().includes(kunci)));
  return cocok?.[1] ?? bawaan;
}

function ringkasJabatan<T extends { _count: { users: number } }>(row: T, inactiveUserCount: number) {
  const { _count, ...jabatan } = row;
  return { ...jabatan, userCount: _count.users, inactiveUserCount };
}

/**
 * `deletedDocumentCount` dipisah dari `documentCount`, bukan dijumlahkan ke
 * dalamnya: yang berguna dilihat admin sehari-hari adalah dokumen aktif, tapi
 * yang menahan penghapusan adalah kedua-duanya. Tanpa angka kedua ini
 * antarmuka tidak punya cara tahu kenapa unit yang tertulis "0 dokumen" tetap
 * ditolak, dan admin hanya melihat penolakan yang tampak asal-asalan.
 */
function ringkasUnit<T extends { _count: { users: number; documents: number } }>(row: T, deletedDocumentCount: number) {
  const { _count, ...unit } = row;
  return { ...unit, userCount: _count.users, documentCount: _count.documents, deletedDocumentCount };
}

/**
 * Pengelolaan daftar acuan organisasi: unit kerja, jabatan, dan nama tampilan
 * role. Dulu ketiganya hidup sebagai konstanta di prisma/reference-data.ts dan
 * enum di skema, jadi menambah satu jabatan berarti menunggu deploy.
 *
 * Yang TIDAK dipindahkan ke sini adalah perilaku role. Wewenang SUPER_ADMIN dan
 * ADMIN_UNIT tertanam di kode (documents/document-visibility.ts dan RolesGuard),
 * jadi role bikinan baru tidak akan punya aturan apa pun di baliknya dan hanya
 * akan berperilaku seperti PEGAWAI. Yang bisa diubah instansi cuma istilahnya.
 */
@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  /** Seluruh daftar acuan dalam satu permintaan — halaman pengelolanya butuh ketiganya sekaligus. */
  async overview(actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    const [unitKerja, dokumenTerhapus, jabatan, pemegangNonaktifPerJabatan, roleLabels] = await Promise.all([
      this.prisma.unitKerja.findMany({
        where: { workspaceId: actor.workspaceId },
        select: unitSelect(actor.workspaceId),
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      // Satu groupBy untuk seluruh unit, bukan satu hitungan per baris: daftar
      // ini dimuat ulang setiap kali ada perubahan apa pun di halamannya.
      this.prisma.document.groupBy({
        by: ['unitKerjaId'],
        where: { workspaceId: actor.workspaceId, unitKerjaId: { not: null }, deletedAt: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.jabatan.findMany({
        where: { workspaceId: actor.workspaceId },
        select: jabatanSelect(actor.workspaceId),
        orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
      // Sama alasannya dengan dokumen terhapus di atas: satu groupBy untuk
      // seluruh jabatan, bukan satu hitungan per baris.
      this.prisma.user.groupBy({
        by: ['jabatanId'],
        where: { workspaceId: actor.workspaceId, jabatanId: { not: null }, accountType: AccountType.COMPANY, isActive: false },
        _count: { _all: true },
      }),
      this.roleLabels(actor.workspaceId),
    ]);
    const terhapusPerUnit = new Map(dokumenTerhapus.map((baris) => [baris.unitKerjaId, baris._count._all]));
    const nonaktifPerJabatan = new Map(pemegangNonaktifPerJabatan.map((baris) => [baris.jabatanId, baris._count._all]));
    return {
      unitKerja: unitKerja.map((unit) => ringkasUnit(unit, terhapusPerUnit.get(unit.id) ?? 0)),
      jabatan: jabatan.map((baris) => ringkasJabatan(baris, nonaktifPerJabatan.get(baris.id) ?? 0)),
      roleLabels,
    };
  }

  // ---------------------------------------------------------------- unit kerja

  async createUnitKerja(input: CreateUnitKerjaDto, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    return this.tulis(AuditAction.USER_CREATED, 'UNIT_KERJA', actor, async (tx) => {
      const unit = await tx.unitKerja.create({
        data: { workspaceId: actor.workspaceId, name: input.name, code: input.code },
        select: unitSelect(actor.workspaceId),
      });
      return ringkasUnit(unit, 0);
    }, {
      name: 'Unit kerja dengan nama itu sudah ada',
      code: 'Kode unit kerja sudah dipakai di workspace ini',
    });
  }

  async updateUnitKerja(id: string, input: UpdateUnitKerjaDto, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    await this.unitMilikWorkspace(id, actor);
    return this.tulis(AuditAction.USER_UPDATED, 'UNIT_KERJA', actor, async (tx) => {
      const unit = await tx.unitKerja.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: unitSelect(actor.workspaceId),
      });
      // `division` pada pegawai adalah salinan teks nama unit yang dipakai di
      // daftar dan laporan. Tanpa disamakan di sini, mengganti nama unit membuat
      // dua tempat menampilkan nama berbeda untuk orang yang sama.
      if (input.name !== undefined) {
        await tx.user.updateMany({ where: { unitKerjaId: id }, data: { division: input.name } });
      }
      const terhapus = await tx.document.count({ where: { unitKerjaId: id, deletedAt: { not: null } } });
      return ringkasUnit(unit, terhapus);
    }, { name: 'Unit kerja dengan nama itu sudah ada' });
  }

  /**
   * Hanya unit yang belum menyentuh siapa pun yang benar-benar dihapus.
   *
   * Unit kerja adalah satu-satunya penentu dokumen mana yang terlihat seorang
   * pegawai. Relasinya `onDelete: SetNull`, jadi menghapus unit yang masih
   * dipakai akan mengosongkan unitKerjaId pemegangnya — dan akses mereka
   * menyusut tanpa pesan apa pun. Karena itu penghapusannya ditolak dan
   * penanya diarahkan menonaktifkan, yang menyembunyikannya dari dropdown tanpa
   * memindahkan siapa-siapa.
   */
  async removeUnitKerja(id: string, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    const unit = await this.unitMilikWorkspace(id, actor);
    return this.tulis(AuditAction.USER_UPDATED, 'UNIT_KERJA', actor, async (tx) => {
      await this.pastikanUnitTakDipakai(tx, unit, actor.workspaceId);
      await tx.unitKerja.delete({ where: { id } });
      return { id, deleted: true };
    });
  }

  /**
   * Menolak penghapusan selama masih ada baris yang menunjuk unit ini.
   *
   * Dua hal membuatnya tidak sesederhana membaca `_count` dari UNIT_SELECT:
   *
   * 1. Dokumen dihitung TANPA menyaring `deletedAt`. Angka di `unitSelect`
   *    sengaja hanya menghitung yang aktif — itu yang berguna dilihat admin di
   *    tabel — tapi dokumen yang sudah dihapus pun barisnya masih memegang
   *    unit_kerja_id, dan relasinya `SetNull`. Menghapus unitnya mengosongkan
   *    penanda itu untuk selamanya, sehingga tidak ada lagi yang bisa menjawab
   *    unit mana yang dulu memilikinya ketika sebuah kebocoran diusut.
   *
   *    Pengguna sebaliknya: dihitung dengan penyaring yang PERSIS sama dengan
   *    tabel, supaya yang menahan penghapusan selalu orang yang bisa admin
   *    temukan dan pindahkan. Akun PERSONAL tidak ikut dihitung di mana pun.
   *
   * 2. Pemeriksaannya dijalankan di dalam transaksi penghapusan dan diawali
   *    mengunci baris unitnya. Tanpa kunci itu ada jeda antara menghitung dan
   *    `delete` yang cukup untuk satu unggahan masuk; dokumen yang lolos di jeda
   *    itu kehilangan penandanya tanpa pernah ikut dihitung, dan dokumen tanpa
   *    penanda terbuka untuk seluruh pegawai. Kunci ini bertabrakan dengan kunci
   *    yang diambil Postgres saat menyisipkan baris ber-foreign-key ke unit yang
   *    sama, jadi unggahan yang berbarengan menunggu — lalu gagal karena unitnya
   *    memang sudah tidak ada, yang justru jawaban yang benar.
   */
  private async pastikanUnitTakDipakai(tx: Prisma.TransactionClient, unit: { id: string; name: string }, workspaceId: string) {
    await tx.$queryRaw`SELECT id FROM unit_kerja WHERE id = ${unit.id}::uuid FOR UPDATE`;
    const [pengguna, dokumen, dokumenAktif] = await Promise.all([
      // Filter yang sama dengan unitSelect dan daftar Orang & akses: yang
      // menahan penghapusan harus tepat yang bisa dilihat dan dipindahkan admin.
      // Akun PERSONAL tidak ikut — penanda unitnya tidak dipakai apa pun, jadi
      // membiarkannya terlepas tidak mencabut akses siapa-siapa.
      tx.user.count({ where: { unitKerjaId: unit.id, accountType: AccountType.COMPANY, workspaceId } }),
      tx.document.count({ where: { unitKerjaId: unit.id } }),
      tx.document.count({ where: { unitKerjaId: unit.id, deletedAt: null } }),
    ]);
    if (pengguna === 0 && dokumen === 0) return;

    // Penghalangnya disebut satu per satu, bukan sebagai satu angka gabungan.
    // Admin yang membaca "masih dipakai 3" tidak tahu harus membuka halaman
    // yang mana; yang membaca "2 pengguna, 1 dokumen" langsung tahu keduanya.
    //
    // Dokumen terhapus disebut terpisah karena jumlahnya bisa melebihi yang
    // tertera di tabel, dan karena jalan keluarnya berbeda: dokumen itu tidak
    // muncul di halaman mana pun, jadi penandanya tidak bisa dilepas admin dan
    // yang tersisa hanya menonaktifkan. Mengarahkannya "kosongkan dulu" untuk
    // sesuatu yang tidak bisa dikosongkan hanya membuatnya berputar-putar.
    const terhapus = dokumen - dokumenAktif;
    const penghalang = [
      pengguna > 0 ? `${pengguna} pengguna masih terdaftar di unit ini` : null,
      dokumenAktif > 0 ? `${dokumenAktif} dokumen masih ditandai unit ini` : null,
      terhapus > 0 ? `${terhapus} dokumen yang sudah dihapus masih menyimpan penandanya` : null,
    ].filter((item): item is string => item !== null);

    throw new ConflictException(
      `Unit kerja "${unit.name}" belum bisa dihapus: ${penghalang.join(', ')}. ` +
      (terhapus > 0
        ? 'Penanda pada dokumen yang sudah dihapus tidak bisa dilepas dari antarmuka, jadi unit ini hanya bisa dinonaktifkan agar tidak muncul lagi di pilihan.'
        : 'Kosongkan dulu isinya — pindahkan penggunanya lewat tab Pengguna, dan lepas penanda unitnya lewat Dokumen → Atur akses — atau nonaktifkan saja unit ini agar tidak muncul lagi di pilihan.'),
    );
  }

  // ------------------------------------------------------------------- jabatan

  async createJabatan(input: CreateJabatanDto, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    return this.tulis(AuditAction.USER_CREATED, 'JABATAN', actor, async (tx) => {
      const jabatan = await tx.jabatan.create({
        data: {
          workspaceId: actor.workspaceId,
          name: input.name,
          canManageAnnouncements: input.canManageAnnouncements ?? false,
          canViewAnnouncementReaders: input.canViewAnnouncementReaders ?? false,
          canUploadDocuments: input.canUploadDocuments ?? false,
          canManageLegalStatus: input.canManageLegalStatus ?? false,
          sortOrder: input.sortOrder ?? 99,
        },
        select: jabatanSelect(actor.workspaceId),
      });
      // Baru dibuat, jadi belum mungkin ada pemegangnya — aktif maupun tidak.
      return ringkasJabatan(jabatan, 0);
    }, { name: 'Jabatan dengan nama itu sudah ada' });
  }

  async updateJabatan(id: string, input: UpdateJabatanDto, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    await this.jabatanMilikWorkspace(id, actor);
    return this.tulis(AuditAction.USER_UPDATED, 'JABATAN', actor, async (tx) => {
      const jabatan = await tx.jabatan.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.canManageAnnouncements !== undefined ? { canManageAnnouncements: input.canManageAnnouncements } : {}),
          ...(input.canViewAnnouncementReaders !== undefined ? { canViewAnnouncementReaders: input.canViewAnnouncementReaders } : {}),
          ...(input.canUploadDocuments !== undefined ? { canUploadDocuments: input.canUploadDocuments } : {}),
          ...(input.canManageLegalStatus !== undefined ? { canManageLegalStatus: input.canManageLegalStatus } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: jabatanSelect(actor.workspaceId),
      });
      // Sama alasannya dengan unit kerja: users.job_title adalah salinan teks
      // yang ikut tampil di laporan pembaca pengumuman.
      if (input.name !== undefined) {
        await tx.user.updateMany({ where: { jabatanId: id }, data: { jobTitle: input.name } });
      }
      // Dihitung terpisah karena `_count` tidak bisa menghitung satu relasi dua kali.
      const nonaktif = await tx.user.count({
        where: { jabatanId: id, workspaceId: actor.workspaceId, accountType: AccountType.COMPANY, isActive: false },
      });
      return ringkasJabatan(jabatan, nonaktif);
    }, { name: 'Jabatan dengan nama itu sudah ada' });
  }

  /**
   * Seperti unit kerja: yang masih dipegang ditolak, bukan dihapus beserta
   * wewenangnya.
   *
   * Yang menahan hanya pemegang yang akunnya masih aktif. Relasinya `SetNull`,
   * jadi menghapus jabatan yang masih dipakai mencabut wewenang pengumuman dan
   * unggahan pemegangnya tanpa pesan apa pun — tapi akun nonaktif tidak bisa
   * masuk, jadi tidak ada wewenang yang benar-benar hilang di sana, dan
   * menahannya demi mereka hanya menyisakan jabatan yang tidak bisa dibersihkan
   * tanpa menghapus akun orang.
   *
   * Hitungannya diambil di dalam transaksi setelah baris jabatannya dikunci.
   * Tanpa kunci itu ada jeda antara menghitung dan `delete` yang cukup untuk
   * satu akun baru dipasangi jabatan ini; akun yang lolos di jeda itu kehilangan
   * jabatannya tanpa pernah ikut dihitung. Kunci ini bertabrakan dengan kunci
   * yang diambil Postgres saat menyisipkan baris ber-foreign-key ke jabatan yang
   * sama, jadi penyimpanan yang berbarengan menunggu — lalu gagal karena
   * jabatannya memang sudah tidak ada, yang justru jawaban yang benar.
   */
  async removeJabatan(id: string, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    const jabatan = await this.jabatanMilikWorkspace(id, actor);
    return this.tulis(AuditAction.USER_UPDATED, 'JABATAN', actor, async (tx) => {
      await tx.$queryRaw`SELECT id FROM jabatan WHERE id = ${id}::uuid FOR UPDATE`;
      const pemegang = await tx.user.count({
        where: { jabatanId: id, workspaceId: actor.workspaceId, accountType: AccountType.COMPANY, isActive: true },
      });
      if (pemegang > 0) {
        throw new ConflictException(
          `Jabatan "${jabatan.name}" masih dipegang ${pemegang} akun aktif. ` +
          'Lepas dulu jabatan itu dari pemegangnya lewat tab Pengguna — atau nonaktifkan/hapus akunnya — ' +
          'atau nonaktifkan saja jabatan ini agar tidak muncul lagi di pilihan.',
        );
      }
      // Kosongkan teksnya sekalian. Relasinya `SetNull`, jadi menghapus baris
      // jabatan hanya melepas `jabatanId` dan meninggalkan salinan namanya di
      // `users.job_title` — pemegangnya lalu tampil berjabatan "Sekretaris"
      // tanpa satu pun wewenangnya, dan tidak ada yang menjelaskan kenapa.
      //
      // Yang tersisa di sini hanya pemegang nonaktif; yang aktif sudah ditolak
      // di atas. Dulu tidak apa-apa karena akun nonaktif tidak bisa kembali,
      // tetapi sekarang bisa diaktifkan lagi lewat Orang & akses, jadi teks
      // basi itu punya jalan untuk muncul kembali.
      await tx.user.updateMany({
        where: { jabatanId: id, workspaceId: actor.workspaceId },
        data: { jobTitle: null },
      });
      await tx.jabatan.delete({ where: { id } });
      return { id, deleted: true };
    });
  }

  // ---------------------------------------------------------------- nama role

  /**
   * Nama tampilan ketiga role, selalu lengkap.
   *
   * Workspace yang dibuat sebelum fitur ini ada bisa saja belum punya barisnya —
   * yang hilang diisi dari konstanta bawaan di memori saja, bukan ditulis ke
   * database, supaya membaca daftar tidak pernah berubah menjadi operasi tulis.
   */
  async roleLabels(workspaceId: string) {
    const tersimpan = await this.prisma.roleLabel.findMany({
      where: { workspaceId, role: { in: ROLE_YANG_DIPAKAI } },
      select: { role: true, label: true, description: true },
    });
    const perRole = new Map(tersimpan.map((baris) => [baris.role, baris]));
    return ROLE_YANG_DIPAKAI.map((role) => perRole.get(role) ?? {
      role,
      label: BAWAAN_ROLE[role].label,
      description: BAWAAN_ROLE[role].description as string | null,
    });
  }

  async updateRoleLabel(role: UserRole, input: UpdateRoleLabelDto, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    if (!ROLE_YANG_DIPAKAI.includes(role)) {
      throw new BadRequestException(`Role "${role}" tidak dipakai lagi dan namanya tidak bisa diubah`);
    }

    // Diperiksa terhadap daftar EFEKTIF, bukan langsung ke tabel: workspace lama
    // bisa saja belum punya barisnya dan masih memakai nama bawaan. Tanpa ini
    // "Admin Unit" bisa diganti jadi "Admin" selama baris SUPER_ADMIN belum
    // pernah disimpan — indeks unik di database pun tidak menangkapnya, karena
    // memang belum ada baris untuk ditabrak.
    const efektif = await this.roleLabels(actor.workspaceId);
    const diminta = input.label.trim().toLowerCase();
    const bentrok = efektif.find((item) => item.role !== role && item.label.trim().toLowerCase() === diminta);
    if (bentrok) {
      throw new ConflictException(
        `Nama "${bentrok.label}" sudah dipakai role lain. Tiap role harus punya nama yang berbeda, ` +
        'karena nama itulah yang muncul di pilihan Role saat membuat akun.',
      );
    }

    return this.tulis(AuditAction.USER_UPDATED, 'ROLE_LABEL', actor, async (tx) =>
      tx.roleLabel.upsert({
        where: { workspaceId_role: { workspaceId: actor.workspaceId, role } },
        update: { label: input.label, description: input.description ?? null },
        create: { workspaceId: actor.workspaceId, role, label: input.label, description: input.description ?? null },
        select: { role: true, label: true, description: true },
      }),
      // Jaring pengaman kalau dua admin menyimpan nama yang sama berbarengan:
      // pemeriksaan di atas sudah lewat pada keduanya, indeks unik yang menolak.
      { label: 'Nama role itu sudah dipakai role lain' },
    );
  }

  // ------------------------------------------------------------------ utilitas

  private assertAdmin(actor: AuthenticatedUser) {
    if (!actor.isAdmin || actor.accountType !== AccountType.COMPANY) {
      throw new ForbiddenException('Organization admin required');
    }
  }

  private async unitMilikWorkspace(id: string, actor: AuthenticatedUser) {
    const unit = await this.prisma.unitKerja.findFirst({ where: { id, workspaceId: actor.workspaceId }, select: unitSelect(actor.workspaceId) });
    if (!unit) throw new NotFoundException('Unit kerja not found');
    return unit;
  }

  private async jabatanMilikWorkspace(id: string, actor: AuthenticatedUser) {
    const jabatan = await this.prisma.jabatan.findFirst({ where: { id, workspaceId: actor.workspaceId }, select: jabatanSelect(actor.workspaceId) });
    if (!jabatan) throw new NotFoundException('Jabatan not found');
    return jabatan;
  }

  /**
   * Menjalankan satu perubahan beserta catatan auditnya dalam satu transaksi,
   * dan menerjemahkan tabrakan keunikan menjadi pesan yang bisa dibaca admin.
   */
  private async tulis<T>(
    action: AuditAction,
    targetType: string,
    actor: AuthenticatedUser,
    jalankan: (tx: Prisma.TransactionClient) => Promise<T>,
    /** Pesan per kolom yang bentrok, mis. { name: '…', code: '…' }. */
    pesanBentrok?: Record<string, string>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const hasil = await jalankan(tx);
        await this.auditLogs.record(tx, {
          ...pelakuAktor(actor),
          action,
          targetType,
          targetId: (hasil as { id?: string }).id,
          metadata: hasil as unknown as Prisma.InputJsonValue,
        });
        return hasil;
      });
    } catch (error: unknown) {
      if (pesanBentrok && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(pesanKonflik(error, pesanBentrok, Object.values(pesanBentrok)[0]));
      }
      throw error;
    }
  }
}
