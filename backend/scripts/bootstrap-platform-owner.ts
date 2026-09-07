import { PrismaClient } from '@prisma/client';

async function main() {
  const username = process.env.PLATFORM_OWNER_USERNAME?.trim().toLowerCase();
  if (!username) throw new Error('Set PLATFORM_OWNER_USERNAME to an existing organization administrator');
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || user.accountType !== 'COMPANY' || !user.isActive || !user.isAdmin) {
      throw new Error('An active organization administrator is required');
    }
    await prisma.user.update({ where: { id: user.id }, data: { isPlatformOwner: true } });
    console.log('Platform ownership enabled for the selected administrator.');
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
