const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '../..');
const local = path.join(root, '.local');
const dotenv = require('dotenv');
const config = { ...process.env, ...dotenv.parse(fs.readFileSync(path.join(root, '.env'))), ...dotenv.parse(fs.readFileSync(path.join(local, 'unified-test.env'))) };
if (new URL(config.DATABASE_URL).pathname !== '/codex_unified_integration_20260906') throw new Error('Only the isolated integration database is allowed');
const credentialsPath = path.join(local, 'unified-test-credentials.json');
const credentials = fs.existsSync(credentialsPath) ? JSON.parse(fs.readFileSync(credentialsPath)) : {
  username: 'unified_owner', password: crypto.randomBytes(24).toString('base64url'),
  worker: crypto.randomBytes(24).toString('base64url'), jwt: crypto.randomBytes(48).toString('base64url'),
};
fs.writeFileSync(credentialsPath, JSON.stringify(credentials));
Object.assign(config, { WORKER_TOKEN: credentials.worker, JWT_SECRET: credentials.jwt, BACKEND_PORT: '8102', AI_SERVICE_URL: 'http://127.0.0.1:8101', FRONTEND_PORT: '5273', VITE_API_BASE_URL: '/api', BACKEND_PROXY_URL: 'http://127.0.0.1:8102' });
// Integration fixtures exercise local retrieval without making paid provider calls.
config.SUMOPOD_API_KEY = '';
config.LLM_API_KEY = '';
config.AI_PROVIDER_API_KEY = '';
config.AI_PROVIDER_BASE_URL = '';
config.AI_EMBEDDINGS_ENABLED = 'false';

async function main() {
  if (process.argv[2] === 'seed') {
    const db = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } } });
    try {
      const { hashPassword } = require('../dist/src/auth/password.util');
      await db.user.upsert({ where: { username: credentials.username }, update: {}, create: {
        username: credentials.username, displayName: 'Platform Owner', passwordHash: await hashPassword(credentials.password),
        isAdmin: true, isPlatformOwner: true, role: 'SUPER_ADMIN', accountType: 'COMPANY',
        employeeNumber: 'OWNER-001', division: 'Management', jobTitle: 'Administrator',
      } });
      console.log('Isolated test platform owner ready; credentials remain in .local.');
    } finally { await db.$disconnect(); }
    return;
  }
  if (process.argv[2] !== 'start') throw new Error('Use seed or start');
  const services = [
    ['backend', process.execPath, ['dist/src/main.js'], path.join(root, 'backend'), 8102],
    ['ai', 'python', ['-m', 'uvicorn', 'http_api:app', '--host', '127.0.0.1', '--port', '8101'], path.join(root, 'AI'), 8101],
    ['frontend', process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort'], path.join(root, 'frontend'), 5273],
  ].filter(([name]) => !process.argv[3] || name === process.argv[3]);
  const net = require('node:net');
  for (const [, , , , port] of services) await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error('Test port already occupied: ' + port)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
  const pidPath = path.join(local, 'unified-test-pids.json');
  const pids = fs.existsSync(pidPath) ? JSON.parse(fs.readFileSync(pidPath)) : {};
  for (const [name, command, args, cwd] of services) {
    const log = fs.openSync(path.join(local, 'unified-' + name + '.log'), 'a');
    const child = spawn(command, args, { cwd, env: config, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
    child.unref();
    fs.closeSync(log);
    pids[name] = child.pid;
  }
  fs.writeFileSync(path.join(local, 'unified-test-pids.json'), JSON.stringify(pids));
  console.log('Isolated test services started: frontend 5273, backend 8102, AI 8101.');
}
main().catch((error) => { console.error(error.code || error.message); process.exitCode = 1; });
