import {
  BASE_URL,
  createReporter,
  credentialPair,
  login,
  logout,
  openBrowser,
  resetSession,
  skipCheck,
  skipSuite,
  waitForApiResponse,
} from './support.mjs'

const admin = credentialPair('E2E_ADMIN')
if (!admin.value) {
  skipSuite('login E2E', admin.missing)
  process.exit(0)
}

const user = credentialPair('E2E_USER')
const report = createReporter('login E2E')
let browser

try {
  const session = await openBrowser()
  browser = session.browser
  const { page } = session

  await resetSession(page)
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 10_000 })
  report.check('unauthenticated visitor is redirected to /login', new URL(page.url()).pathname === '/login')

  await login(page, admin.value)
  report.check('seeded admin can sign in', new URL(page.url()).pathname === '/')
  const adminNavigation = await page.$eval('nav[aria-label="Primary navigation"]', (nav) => nav.textContent || '')
  report.check('admin navigation includes People & access', adminNavigation.includes('People & access'))

  const meResponsePromise = waitForApiResponse(page, 'GET', '/auth/me')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const meResponse = await meResponsePromise
  await page.waitForSelector('nav[aria-label="Primary navigation"]', { timeout: 10_000 })
  report.check('admin session is restored through GET /auth/me', meResponse.ok())

  await page.evaluate(() => localStorage.setItem('ea.token', 'e2e-invalid-token'))
  const unauthorizedResponsePromise = waitForApiResponse(page, 'GET', '/auth/me')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const unauthorizedResponse = await unauthorizedResponsePromise
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 10_000 })
  report.check('GET /auth/me rejects a corrupted token', unauthorizedResponse.status() === 401)
  report.check('a runtime 401 redirects to /login', new URL(page.url()).pathname === '/login')
  const navigationType = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type)
  report.check('the 401 redirect stays inside the SPA', navigationType === 'reload')
  const storedToken = await page.evaluate(() => localStorage.getItem('ea.token'))
  report.check('a runtime 401 clears the stored token', storedToken === null)

  await login(page, admin.value)
  await logout(page)
  report.check('logout returns to /login', new URL(page.url()).pathname === '/login')

  if (user.value) {
    await login(page, user.value)
    const userNavigation = await page.$eval('nav[aria-label="Primary navigation"]', (nav) => nav.textContent || '')
    report.check('USER navigation omits People & access', !userNavigation.includes('People & access'))

    await page.goto(`${BASE_URL}/users`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => location.pathname !== '/users', { timeout: 10_000 })
    report.check('USER cannot open /users', new URL(page.url()).pathname !== '/users')
    await logout(page)
  } else {
    skipCheck('USER role routing', `set ${user.missing.join(' and ')}`)
  }
} catch (error) {
  report.fail('suite execution', error)
} finally {
  await browser?.close()
}

process.exitCode = report.finish() > 0 ? 1 : 0
