import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Migrate old roles to new ones
  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'BAPPEDA'::"UserRole"`);
  console.log('Migrated BAPPEDA -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'SETDA'::"UserRole"`);
  console.log('Migrated SETDA -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'DINAS_PENDIDIKAN'::"UserRole"`);
  console.log('Migrated DINAS_PENDIDIKAN -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'DINAS_KESEHATAN'::"UserRole"`);
  console.log('Migrated DINAS_KESEHATAN -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'DINAS_PUPR'::"UserRole"`);
  console.log('Migrated DINAS_PUPR -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'DINAS_SOSIAL'::"UserRole"`);
  console.log('Migrated DINAS_SOSIAL -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'DISDUKCAPIL'::"UserRole"`);
  console.log('Migrated DISDUKCAPIL -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'SATPOL_PP'::"UserRole"`);
  console.log('Migrated SATPOL_PP -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'DINAS_PERHUBUNGAN'::"UserRole"`);
  console.log('Migrated DINAS_PERHUBUNGAN -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'DINAS_LINGKUNGAN_HIDUP'::"UserRole"`);
  console.log('Migrated DINAS_LINGKUNGAN_HIDUP -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'DPMPTSP'::"UserRole"`);
  console.log('Migrated DPMPTSP -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'DINAS_KOPERASI_UKM'::"UserRole"`);
  console.log('Migrated DINAS_KOPERASI_UKM -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'DINAS_PARIWISATA'::"UserRole"`);
  console.log('Migrated DINAS_PARIWISATA -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'DINAS_PERTANIAN'::"UserRole"`);
  console.log('Migrated DINAS_PERTANIAN -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'DINAS_PERIKANAN'::"UserRole"`);
  console.log('Migrated DINAS_PERIKANAN -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'DISPERINDAG'::"UserRole"`);
  console.log('Migrated DISPERINDAG -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'DISNAKER'::"UserRole"`);
  console.log('Migrated DISNAKER -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'BKAD'::"UserRole"`);
  console.log('Migrated BKAD -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'BAPENDA'::"UserRole"`);
  console.log('Migrated BAPENDA -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'BKPSDM'::"UserRole"`);
  console.log('Migrated BKPSDM -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'BPBD'::"UserRole"`);
  console.log('Migrated BPBD -> OPERASIONAL');

  await prisma.$executeRawUnsafe(`UPDATE users SET role = 'OPERASIONAL' WHERE role = 'INSPEKTORAT'::"UserRole"`);
  console.log('Migrated INSPEKTORAT -> OPERASIONAL');

  console.log('Done!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
