import { PrismaClient, UserRole } from '@prisma/client';
import { hashPassword } from '../src/auth/password.util';
import { KATEGORI_DEMO_LAMA, KATEGORI_DOKUMEN, UNIT_KERJA } from './reference-data';

const prisma = new PrismaClient();

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
    ? await prisma.unitKerja.findUnique({ where: { code: unitKerjaCode }, select: { id: true } })
    : null;
  const unitKerjaId = unitKerja?.id ?? null;
  const email = requiredEnvironment(emailName).toLowerCase();
  const username = email.split('@', 1)[0];
  const password = requiredEnvironment(passwordName);
  if (password.length < 12) throw new Error(`${passwordName} must contain at least 12 characters`);

  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: { displayName, username, employeeNumber, division, jobTitle, isActive: true, passwordHash, role, isAdmin, unitKerjaId },
    create: { displayName, username, employeeNumber, division, jobTitle, email, isActive: true, passwordHash, role, isAdmin, unitKerjaId },
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
      where: { code: unit.code },
      update: { name: unit.name, isActive: true },
      create: { code: unit.code, name: unit.name },
    });
  }
  console.log(`Seeded ${UNIT_KERJA.length} unit kerja`);

  for (const kategori of KATEGORI_DOKUMEN) {
    const key = kategori.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
    const units = await prisma.unitKerja.findMany({
      where: { code: { in: kategori.units } },
      select: { id: true },
    });
    if (units.length !== kategori.units.length) {
      throw new Error(`Kode unit kerja tidak dikenal pada kategori "${kategori.name}"`);
    }
    const ids = units.map((unit) => ({ id: unit.id }));
    await prisma.documentCategory.upsert({
      where: { key },
      // `set` pada update supaya unit yang DIHAPUS dari daftar acuan ikut
      // tercermin, bukan hanya penambahannya.
      update: { name: kategori.name, units: { set: ids } },
      create: { key, name: kategori.name, units: { connect: ids } },
    });
  }
  const terbuka = KATEGORI_DOKUMEN.filter((k) => k.units.length === 0).length;
  console.log(`Seeded ${KATEGORI_DOKUMEN.length} kategori (${terbuka} terbuka untuk semua pegawai)`);

  // Kategori bawaan template lama hanya dibuang kalau belum dipakai dokumen,
  // supaya seed tidak pernah menghapus sesuatu yang masih dirujuk.
  const demo = await prisma.documentCategory.findMany({
    where: { key: { in: KATEGORI_DEMO_LAMA } },
    select: { id: true, name: true, _count: { select: { documents: true } } },
  });
  const buang = demo.filter((kategori) => kategori._count.documents === 0);
  if (buang.length > 0) {
    await prisma.documentCategory.deleteMany({ where: { id: { in: buang.map((k) => k.id) } } });
    console.log(`Menghapus ${buang.length} kategori demo lama: ${buang.map((k) => k.name).join(', ')}`);
  }
  const dipakai = demo.filter((kategori) => kategori._count.documents > 0);
  if (dipakai.length > 0) {
    console.log(`Kategori demo dibiarkan karena masih dipakai dokumen: ${dipakai.map((k) => k.name).join(', ')}`);
  }
}

async function main(): Promise<void> {
  await seedUnitKerjaDanKategori();

  const adminEmail = requiredEnvironment('SEED_ADMIN_EMAIL').toLowerCase();
  const userEmail = requiredEnvironment('SEED_USER_EMAIL').toLowerCase();
  if (adminEmail === userEmail) throw new Error('Seed admin and user emails must be different');

  // Super admin — akses semua dokumen, unit kerjanya tidak membatasi apa pun
  await upsertUser(
    UserRole.SUPER_ADMIN, true,
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD',
    'Local Admin', 'ADM-0001', 'Sekretariat Daerah', 'Kepala Subbagian',
    'SETDA',
  );

  // Pegawai contoh, sengaja ditempatkan di Dinas Koperasi: dengan begitu batas
  // aksesnya bisa diuji sungguhan — ia harus melihat kategori Koperasi tetapi
  // tidak melihat kategori Keuangan & Anggaran Daerah.
  await upsertUser(
    UserRole.PEGAWAI, false,
    'SEED_USER_EMAIL', 'SEED_USER_PASSWORD',
    'Nadia Putri', 'EMP-0001', 'Dinas Koperasi, UKM, Perindustrian dan Perdagangan',
    'Staf / Pelaksana', 'DISKUKMPP',
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
