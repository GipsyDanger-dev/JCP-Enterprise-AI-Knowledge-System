import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fixtures = JSON.parse(fs.readFileSync(path.join(root, '.local/unified-test-sessions.json')))
const output = path.join(root, '.local/unified-browser')
fs.mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const failures = []
try {
  for (const [label, account] of [['personal', fixtures.personal[0]], ['organization', fixtures.organizations[0].admin], ['owner', fixtures.owner]]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    page.on('pageerror', (error) => failures.push(error.message))
    await page.goto('http://127.0.0.1:5273/login')
    if (label === 'personal') {
      await page.getByRole('tab', { name: /Personal/ }).click()
      await page.locator('#personal-email').fill(account.user.email)
      await page.locator('#personal-password').fill(fixtures.password)
    } else {
      await page.locator('#login-username').fill(account.user.username)
      await page.locator('#login-password').fill(fixtures.password)
    }
    await page.locator('form button[type="submit"]').click()
    await page.waitForURL('http://127.0.0.1:5273/', { timeout: 20000 })
    await page.locator('h1').waitFor()
    await page.screenshot({ path: path.join(output, `${label}-desktop.png`), fullPage: true })
    if (label === 'personal') {
      assert.equal(await page.locator('a[href="/users"],a[href="/announcements"]').count(), 0)
      await page.request.patch(`http://127.0.0.1:5273/api/documents/${fixtures.docs[2].id}`, { headers: { Authorization: `Bearer ${account.accessToken}` }, data: { title: 'My private document' } })
      await page.goto('http://127.0.0.1:5273/documents')
      await page.getByText('My private document', { exact: true }).waitFor()
      await page.getByText('My private document', { exact: true }).click()
      await page.locator('.doc-reader-paper').waitFor({ timeout: 15000 })
      assert((await page.locator('.doc-reader-paper').innerText()).includes('222222'))
      await page.locator('.doc-viewer-header .icon-button').last().click()
      await page.waitForTimeout(1000)
      assert.equal(await page.locator('.doc-viewer-overlay').count(), 0)
      await page.getByTitle(/Ubah nama dokumen|Rename document/).click()
      await page.locator('.modal-card input').fill('Browser verified private document')
      await page.locator('.modal-card button[type="submit"], .modal-card .primary-button').click()
      await page.getByText('Browser verified private document', { exact: true }).waitFor()
      await page.screenshot({ path: path.join(output, 'personal-documents.png'), fullPage: true })
    }
    if (label === 'organization') {
      await page.goto('http://127.0.0.1:5273/users')
      await page.getByText('Staff alpha', { exact: true }).waitFor()
      assert.equal(await page.getByText('Staff beta', { exact: true }).count(), 0)
    }
    if (label === 'owner') {
      await page.goto('http://127.0.0.1:5273/workspaces')
      await page.getByText(fixtures.organizations[0].workspace.name, { exact: true }).waitFor()
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('http://127.0.0.1:5273/')
    await page.locator('h1').waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label} horizontal overflow`)
    await page.screenshot({ path: path.join(output, `${label}-mobile.png`), fullPage: true })
    await context.close()
    console.log(`PASS ${label}: real browser login, workspace UI and mobile layout`)
  }
  assert.deepEqual(failures, [])
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, at: new Date().toISOString() }))
} finally { await browser.close() }
