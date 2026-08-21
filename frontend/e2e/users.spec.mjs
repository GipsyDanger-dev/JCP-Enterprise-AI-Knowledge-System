import { BASE_URL, assert, config, login, openBrowser } from './support.mjs'

const browser = await openBrowser()
try {
  const page = await browser.newPage()
  const runtime = config()
  await login(page, runtime)
  await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle0' })

  if (process.env.E2E_EXPECT_ADMIN === 'true') {
    await page.waitForSelector('tbody', { timeout: 10000 })
    assert('administrator can access user management', page.url().includes('/users'))
  } else {
    await page.waitForFunction(() => location.pathname !== '/users', { timeout: 10000 })
    assert('non-administrator is denied user management', !page.url().includes('/users'))
  }
} finally {
  await browser.close()
}
