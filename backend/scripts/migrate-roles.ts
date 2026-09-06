import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Step 1: Add new enum values (PostgreSQL doesn't support DROP VALUE)
  const newValues = [
    'SUPER_ADMIN',
    'DINAS_PENDIDIKAN', 'DINAS_KESEHATAN', 'DINAS_PUPR', 'DINAS_SOSIAL',
    'DISDUKCAPIL', 'SATPOL_PP', 'DINAS_PERHUBUNGAN', 'DINAS_LINGKUNGAN_HIDUP',
    'DPMPTSP', 'DINAS_KOPERASI_UKM', 'DINAS_PARIWISATA', 'DINAS_PERTANIAN',
    'DINAS_PERIKANAN', 'DISPERINDAG', 'DISNAKER', 'BAPPEDA', 'BKAD',
    'BAPENDA', 'BKPSDM', 'BPBD', 'SETDA', 'INSPEKTORAT',
  ];

  for (const val of newValues) {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS '${val}'`
      );
      console.log(`Added ${val}`);
    } catch (e: any) {
      console.log(`${val} already exists or error: ${e.message}`);
    }
  }

  // Step 2: Update existing data
  const adminResult = await prisma.$executeRawUnsafe(
    `UPDATE users SET role = 'SUPER_ADMIN', is_admin = true WHERE role = 'ADMIN'::"UserRole"`
  );
  console.log(`Updated ${adminResult} ADMIN -> SUPER_ADMIN`);

  const userResult = await prisma.$executeRawUnsafe(
    `UPDATE users SET role = 'BAPPEDA' WHERE role = 'USER'::"UserRole"`
  );
  console.log(`Updated ${userResult} USER -> BAPPEDA`);

  console.log('Migration complete!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
