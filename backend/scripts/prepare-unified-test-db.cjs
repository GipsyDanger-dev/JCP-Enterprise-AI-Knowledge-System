const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const source = dotenv.parse(fs.readFileSync(path.join(root, '.env'))).DATABASE_URL;
  if (!source) throw new Error('Missing database configuration');
  const targetName = 'codex_unified_integration_20260906';
  const admin = new PrismaClient({ datasources: { db: { url: source } } });
  try {
    const existing = await admin.$queryRaw`SELECT datname FROM pg_database WHERE datname = ${targetName}`;
    if (!existing.length) await admin.$executeRawUnsafe(`CREATE DATABASE "${targetName}"`);
    const target = new URL(source);
    target.pathname = '/' + targetName;
    fs.mkdirSync(path.join(root, '.local'), { recursive: true });
    fs.writeFileSync(path.join(root, '.local/unified-test.env'), `DATABASE_URL=${target.href}\n`);
    console.log('Isolated integration database configured: ' + targetName);
  } finally {
    await admin.$disconnect();
  }
}
main().catch((error) => {
  console.error('Integration database setup failed: ' + (error.code || error.constructor.name));
  process.exitCode = 1;
});
