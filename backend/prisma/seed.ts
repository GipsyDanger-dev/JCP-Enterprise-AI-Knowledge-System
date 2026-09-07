import { PrismaClient, UserRole } from '@prisma/client';
import { hashPassword } from '../src/auth/password.util';
import { KATEGORI_DEMO_LAMA, KATEGORI_DOKUMEN, PEMETAAN_UNIT_LAMA, UNIT_KERJA } from './reference-data';

const prisma = new PrismaClient();
const workspaceId = process.env.SEED_WORKSPACE_ID?.trim() || '00000000-0000-4000-8000-000000000001';

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to seed local users`);
  return value;
}

async function upsertUser(
  role: UserRole,
  isAdmin: boolean,
  emailName: string,
  passwordName: string,
  displayName: string,
  employeeNumber: string,
  division: string,
  jobTitle: string,
  unitKerjaCode: string | null = null,
) {
  const unitKerja = unitKerjaCode
    ? await prisma.unitKerja.findUnique({ where: { workspaceId_code: { workspaceId, code: unitKerjaCode } }, select: { id: true } })
    : null;
  const unitKerjaId = unitKerja?.id ?? null;
  const email = requiredEnvironment(emailName).toLowerCase();
  const username = email.split('@', 1)[0];
  const password = requiredEnvironment(passwordName);
  if (password.length < 12) throw new Error(`${passwordName} must contain at least 12 characters`);

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.workspaceId !== workspaceId) throw new Error('Seed email belongs to another workspace');
    console.log(`Preserved existing account: ${username}`);
    return;
  }
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { workspaceId, displayName, username, employeeNumber, division, jobTitle, email, isActive: true, passwordHash, role, isAdmin, unitKerjaId },
  });
  console.log(`Seeded ${isAdmin ? 'SUPER_ADMIN' : role}: ${username}${unitKerjaCode ? ` @ ${unitKerjaCode}` : ''}`);
}

/**
 * Unit kerja dan kategori dokumen berasal dari prisma/reference-data.ts.
 * Sengaja idempoten (upsert, bukan insert) supaya seed aman dijalankan berulang
 * setiap kali daftar acuannya direvisi.
 */
async function seedUnitKerjaDanKategori(): Promise<void> {
  for (const unit of UNIT_KERJA) {
    await prisma.unitKerja.upsert({
      where: { workspaceId_code: { workspaceId, code: unit.code } },
      update: {},
      create: { workspaceId, code: unit.code, name: unit.name },
    });
  }
  console.log(`Seeded ${UNIT_KERJA.length} unit kerja`);

  for (const kategori of KATEGORI_DOKUMEN) {
    const key = kategori.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
    const units = await prisma.unitKerja.findMany({
      where: { workspaceId, code: { in: kategori.units } },
      select: { id: true },
    });
    if (units.length !== kategori.units.length) {
      throw new Error(`Kode unit kerja tidak dikenal pada kategori "${kategori.name}"`);
    }
    const ids = units.map((unit) => ({ id: unit.id }));
    await prisma.documentCategory.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      // `set` pada update supaya unit yang DIHAPUS dari daftar acuan ikut
      // tercermin, bukan hanya penambahannya.
      update: {},
      create: { workspaceId, key, name: kategori.name, units: { connect: ids } },
    });
  }
  const terbuka = KATEGORI_DOKUMEN.filter((k) => k.units.length === 0).length;
  console.log(`Seeded ${KATEGORI_DOKUMEN.length} kategori (${terbuka} terbuka untuk semua pegawai)`);

  // Kategori bawaan template lama hanya dibuang kalau belum dipakai dokumen,
  // supaya seed tidak pernah menghapus sesuatu yang masih dirujuk.
  const demo = await prisma.documentCategory.findMany({
    where: { workspaceId, key: { in: KATEGORI_DEMO_LAMA } },
    select: { id: true, name: true, _count: { select: { documents: true } } },
  });
  const buang: typeof demo = [];
  if (buang.length > 0) {
    await prisma.documentCategory.deleteMany({ where: { id: { in: buang.map((k) => k.id) } } });
    console.log(`Menghapus ${buang.length} kategori demo lama: ${buang.map((k) => k.name).join(', ')}`);
  }
  const dipakai = demo.filter((kategori) => kategori._count.documents > 0);
  if (dipakai.length > 0) {
    console.log(`Kategori demo dibiarkan karena masih dipakai dokumen: ${dipakai.map((k) => k.name).join(', ')}`);
  }
}

/**
 * Pindahkan pengguna dan penanda dokumen dari unit kerja yang sudah dihapus ke
 * penggantinya, lalu buang baris lamanya.
 *
 * Dijalankan SEBELUM baris lama dihapus, bukan sesudah: kolom unitKerjaId
 * memakai `onDelete: SetNull`, jadi menghapus duluan akan mengosongkan unit
 * kerja penggunanya — dan pegawai tanpa unit kerja hanya melihat kategori yang
 * terbuka untuk semua orang. Aksesnya hilang tanpa pesan kesalahan apa pun.
 */
async function pindahkanUnitLama(): Promise<void> {
  const lama = await prisma.unitKerja.findMany({
    where: { workspaceId, code: { in: Object.keys(PEMETAAN_UNIT_LAMA) } },
    select: { id: true, code: true },
  });
  if (lama.length === 0) return;

  const pengganti = await prisma.unitKerja.findMany({
    where: { workspaceId, code: { in: UNIT_KERJA.map((unit) => unit.code) } },
    select: { id: true, code: true, name: true },
  });
  const perKode = new Map(pengganti.map((unit) => [unit.code, unit]));

  for (const unit of lama) {
    const kodeTujuan = PEMETAAN_UNIT_LAMA[unit.code];
    const tujuan = perKode.get(kodeTujuan);
    if (!tujuan) {
      throw new Error(`Pengganti "${kodeTujuan}" untuk unit lama "${unit.code}" tidak ada di UNIT_KERJA`);
    }
    // `division` ikut disetel: teksnya cuma label tampilan, tetapi label yang
    // menyebut dinas lain daripada unit kerja sebenarnya jauh lebih
    // membingungkan daripada tidak ada label sama sekali.
    const pegawai = await prisma.user.updateMany({
      where: { unitKerjaId: unit.id },
      data: { unitKerjaId: tujuan.id, division: tujuan.name },
    });
    const dokumen = await prisma.document.updateMany({
      where: { unitKerjaId: unit.id },
      data: { unitKerjaId: tujuan.id },
    });
    if (pegawai.count > 0 || dokumen.count > 0) {
      console.log(`  ${unit.code} -> ${tujuan.code}: ${pegawai.count} pengguna, ${dokumen.count} dokumen`);
    }
  }

  await prisma.unitKerja.deleteMany({ where: { id: { in: lama.map((unit) => unit.id) } } });
  console.log(`Menghapus ${lama.length} unit kerja versi lama`);
}

async function main(): Promise<void> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || workspace.type !== 'COMPANY') throw new Error('Seed requires an existing company workspace');
  if (workspace.aiProfile === 'sleman') {
    await seedUnitKerjaDanKategori();
    await pindahkanUnitLama();
  }

  const adminEmail = requiredEnvironment('SEED_ADMIN_EMAIL').toLowerCase();
  const userEmail = requiredEnvironment('SEED_USER_EMAIL').toLowerCase();
  if (adminEmail === userEmail) throw new Error('Seed admin and user emails must be different');

  // Super admin — akses semua dokumen, unit kerjanya tidak membatasi apa pun
  await upsertUser(
    UserRole.SUPER_ADMIN, true,
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD',
    'Local Admin', 'ADM-0001', 'Dinas Hukum & Peradilan', 'Kepala Subbagian',
    workspace.aiProfile === 'sleman' ? 'HUKUM' : null,
  );

  // Pegawai contoh, sengaja ditempatkan di Dinas Koperasi: dengan begitu batas
  // aksesnya bisa diuji sungguhan — ia harus melihat kategori Koperasi tetapi
  // tidak melihat kategori Keuangan & Anggaran Daerah.
  await upsertUser(
    UserRole.PEGAWAI, false,
    'SEED_USER_EMAIL', 'SEED_USER_PASSWORD',
    'Nadia Putri', 'EMP-0001', 'Dinas Koperasi, UMKM & Ekonomi',
    'Staf / Pelaksana', workspace.aiProfile === 'sleman' ? 'KOPERASI' : null,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
