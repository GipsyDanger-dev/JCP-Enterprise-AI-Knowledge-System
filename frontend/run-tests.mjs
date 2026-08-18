import { execSync, exec } from 'child_process'

const PORT = 5199
const BASE = `http://127.0.0.1:${PORT}`

const server = exec(`npx vite --port ${PORT} --host 127.0.0.1`, { cwd: 'frontend' })

await new Promise((r) => setTimeout(r, 5000))

const tests = ['e2e/login.spec.mjs', 'e2e/chat.spec.mjs', 'e2e/users.spec.mjs']
let allPassed = true

for (const test of tests) {
  console.log(`\n▶ Running ${test}`)
  try {
    const out = execSync(`node ${test}`, {
      cwd: 'frontend',
      env: { ...process.env, E2E_BASE_URL: BASE },
      timeout: 60000,
      encoding: 'utf-8',
    })
    console.log(out)
  } catch (err) {
    console.log(err.stdout || err.message)
    allPassed = false
  }
}

server.kill()
console.log(allPassed ? '\n🎉 ALL SUITE PASSED' : '\n💥 SOME SUITE FAILED')
process.exit(allPassed ? 0 : 1)
