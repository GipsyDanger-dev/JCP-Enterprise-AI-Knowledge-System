import { PrismaClient, UserRole } from '@prisma/client';
import { hashPassword } from '../src/auth/password.util';

const prisma = new PrismaClient();

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to seed local users`);
  return value;
}

async function upsertUser(role: UserRole, emailName: string, passwordName: string, displayName: string) {
  const email = requiredEnvironment(emailName).toLowerCase();
  const password = requiredEnvironment(passwordName);
  if (password.length < 12) throw new Error(`${passwordName} must contain at least 12 characters`);

  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: { displayName, isActive: true, passwordHash, role },
    create: { displayName, email, isActive: true, passwordHash, role },
  });
  console.log(`Seeded ${role}: ${email}`);
}

async function main(): Promise<void> {
  const adminEmail = requiredEnvironment('SEED_ADMIN_EMAIL').toLowerCase();
  const userEmail = requiredEnvironment('SEED_USER_EMAIL').toLowerCase();
  if (adminEmail === userEmail) throw new Error('Seed admin and user emails must be different');

  await upsertUser(UserRole.ADMIN, 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'Local Admin');
  await upsertUser(UserRole.USER, 'SEED_USER_EMAIL', 'SEED_USER_PASSWORD', 'Local User');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
