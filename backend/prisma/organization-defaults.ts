import type { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { JABATAN, ROLE_LABEL_BAWAAN } from './reference-data';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Mengisi jabatan dan nama tampilan role bawaan untuk satu workspace.
 *
 * Dipakai dua tempat: `prisma:seed` untuk workspace pengembangan, dan
 * pendaftaran workspace baru supaya instansi yang baru mendaftar tidak
 * mendapati dropdown jabatan kosong di form pembuatan akun.
 *
 * Sengaja `update: {}` — baris yang sudah ada TIDAK pernah ditimpa. Daftar ini
 * cuma nilai awal; begitu super admin menyunting namanya atau mencabut centang
 * wewenangnya lewat antarmuka, deploy berikutnya tidak boleh mengembalikannya
 * diam-diam. Karena itu pula fungsi ini aman dijalankan berulang.
 */
export async function seedJabatanDanRoleLabel(db: Db, workspaceId: string): Promise<void> {
  for (const [index, jabatan] of JABATAN.entries()) {
    await db.jabatan.upsert({
      where: { workspaceId_name: { workspaceId, name: jabatan.name } },
      update: {},
      create: {
        workspaceId,
        name: jabatan.name,
        sortOrder: index + 1,
        canManageAnnouncements: jabatan.canManageAnnouncements ?? false,
        canViewAnnouncementReaders: jabatan.canViewAnnouncementReaders ?? false,
        canAssignRequiredReadings: jabatan.canAssignRequiredReadings ?? false,
      },
    });
  }

  for (const bawaan of ROLE_LABEL_BAWAAN) {
    await db.roleLabel.upsert({
      where: { workspaceId_role: { workspaceId, role: bawaan.role as UserRole } },
      update: {},
      create: { workspaceId, role: bawaan.role as UserRole, label: bawaan.label, description: bawaan.description },
    });
  }
}
