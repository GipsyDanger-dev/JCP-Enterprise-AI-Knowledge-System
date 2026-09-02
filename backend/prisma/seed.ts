import { PrismaClient, UserRole } from '@prisma/client';
import { hashPassword } from '../src/auth/password.util';

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
) {
  const email = requiredEnvironment(emailName).toLowerCase();
  const username = email.split('@', 1)[0];
  const password = requiredEnvironment(passwordName);
  if (password.length < 12) throw new Error(`${passwordName} must contain at least 12 characters`);

  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: { displayName, username, employeeNumber, division, jobTitle, isActive: true, passwordHash, role, isAdmin },
    create: { displayName, username, employeeNumber, division, jobTitle, email, isActive: true, passwordHash, role, isAdmin },
  });
  console.log(`Seeded ${isAdmin ? 'SUPER_ADMIN' : role}: ${username}`);
}

async function main(): Promise<void> {
  const adminEmail = requiredEnvironment('SEED_ADMIN_EMAIL').toLowerCase();
  const userEmail = requiredEnvironment('SEED_USER_EMAIL').toLowerCase();
  if (adminEmail === userEmail) throw new Error('Seed admin and user emails must be different');

  // Super admin — akses semua dokumen
  await upsertUser(
    UserRole.SUPER_ADMIN, true,
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD',
    'Local Admin', 'ADM-0001', 'Sekretariat', 'Administrator',
  );

  // User biasa — divisi Sekretaris
  await upsertUser(
    UserRole.SEKRETARIS, false,
    'SEED_USER_EMAIL', 'SEED_USER_PASSWORD',
    'Nadia Putri', 'EMP-0001', 'Sekretaris', 'Staff Sekretaris',
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
