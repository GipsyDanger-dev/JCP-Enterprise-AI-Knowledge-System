import {
  BASE_URL,
  clickButtonStartingWith,
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
  skipSuite('users E2E', admin.missing)
  process.exit(0)
}

const user = credentialPair('E2E_USER')
const report = createReporter('users E2E')
let browser

try {
  const session = await openBrowser()
  browser = session.browser
  const { page } = session

  await resetSession(page)
  await login(page, admin.value)

  const usersResponsePromise = waitForApiResponse(page, 'GET', '/users')
  await page.goto(`${BASE_URL}/users`, { waitUntil: 'domcontentloaded' })
  const usersResponse = await usersResponsePromise
  report.check('GET /users succeeds for ADMIN', usersResponse.ok(), `HTTP ${usersResponse.status()}`)

  await page.waitForSelector('.data-table table', { timeout: 10_000 })
  const tableText = await page.$eval('.data-table', (table) => table.textContent || '')
  report.check('users table contains the seeded admin', tableText.includes(admin.value.email))

  await clickButtonStartingWith(page, 'Admin')
  await page.waitForFunction(() => {
    const roles = [...document.querySelectorAll('.data-table .role-badge')]
    return roles.length > 0 && roles.every((role) => role.textContent?.trim() === 'Admin')
  }, { timeout: 5_000 })
  report.check('Admin filter only shows admin rows', true)

  await clickButtonStartingWith(page, 'Employee')
  await page.waitForFunction(() => {
    const table = document.querySelector('.data-table')
    if (!table) return false
    const roles = [...table.querySelectorAll('.role-badge')]
    return roles.every((role) => role.textContent?.trim() === 'Employee')
  }, { timeout: 5_000 })
  const employeeRoles = await page.$$eval('.data-table .role-badge', (roles) => roles.map((role) => role.textContent?.trim()))
  report.check('Employee filter excludes admin rows', employeeRoles.every((role) => role === 'Employee'))

  report.check('users E2E does not create or deactivate accounts', true)

  if (user.value) {
    await logout(page)
    await login(page, user.value)
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => location.pathname !== '/users', { timeout: 10_000 })
    report.check('USER is redirected away from /users', new URL(page.url()).pathname !== '/users')
  } else {
    skipCheck('USER access restriction', `set ${user.missing.join(' and ')}`)
  }
} catch (error) {
  report.fail('suite execution', error)
} finally {
  await browser?.close()
}

process.exitCode = report.finish() > 0 ? 1 : 0
