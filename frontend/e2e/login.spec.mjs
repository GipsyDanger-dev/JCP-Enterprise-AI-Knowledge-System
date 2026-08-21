import { BASE_URL, assert, config, login, openBrowser } from './support.mjs'

const browser = await openBrowser()
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' })
  assert('unauthenticated users are redirected to login', page.url().endsWith('/login'))

  await login(page, config())
  assert('valid runtime credentials open the workspace', !page.url().endsWith('/login'))

  await page.reload({ waitUntil: 'networkidle0' })
  assert('authenticated session survives a reload', !page.url().endsWith('/login'))
} finally {
  await browser.close()
}
