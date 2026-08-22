import { assert, BASE_URL, login, openBrowser } from './support.mjs'

const required = [
  'E2E_EMAIL',
  'E2E_PASSWORD',
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_PASSWORD',
]
const missing = required.filter((name) => !process.env[name])
if (missing.length > 0) {
  throw new Error(`Missing E2E environment variables: ${missing.join(', ')}`)
}

const message = `Realtime verification ${Date.now()}`
const browser = await openBrowser()

try {
  const employee = await browser.newPage()
  const admin = await browser.newPage()

  await login(employee, { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD })
  await employee.goto(`${BASE_URL}/messages`, { waitUntil: 'domcontentloaded' })
  await employee.waitForSelector('.mc-input-row input[placeholder]', { timeout: 10000 })

  await login(admin, { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD })
  await admin.goto(`${BASE_URL}/inbox`, { waitUntil: 'domcontentloaded' })
  await admin.waitForSelector('button.inbox-item', { timeout: 10000 })
  await admin.click('button.inbox-item')

  await employee.type('.mc-input-row input[placeholder]', message)
  await employee.keyboard.press('Enter')

  await admin.waitForFunction(
    (expected) => document.body.textContent?.includes(expected),
    { timeout: 8000 },
    message,
  )
  assert('incoming direct message appears without a browser refresh', true)
} finally {
  await browser.close()
}
