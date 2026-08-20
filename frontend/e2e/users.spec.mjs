/**
 * E2E test — User management: list, filter, create, delete.
 */
import puppeteer from 'puppeteer-core'

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5199'
const CHROME = process.env.CHROME_PATH
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

let browser, page, passed = 0, failed = 0

function assert(label, ok) {
  if (ok) { passed++; console.log(`  ✅ ${label}`) }
  else    { failed++; console.log(`  ❌ ${label}`) }
}

async function loginAs(role = 'admin') {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
  const email = role === 'admin' ? 'admin@jcp.co.id' : 'nadia@jcp.co.id'
  const pass  = role === 'admin' ? 'admin123' : 'employee123'
  await page.type('input[type="email"]', email)
  await page.type('input[type="password"]', pass)
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => location.pathname !== '/login', { timeout: 5000 })
}

;(async () => {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
  page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })

  await loginAs('admin')
  console.log('\n🧪 Users page E2E tests\n')

  // ── Navigate to /users ──
  await page.goto(`${BASE}/users`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.data-table', { timeout: 5000 })
  assert('halaman /users terbuka', page.url().includes('/users'))

  // ── Users loaded from API ──
  const rows = await page.$$('.data-table tbody tr')
  assert('users dimuat dari mock API (>= 3 baris)', rows.length >= 3)

  // ── Filter: All ──
  const allChip = await page.$('.filter-chip.active')
  const allText = await allChip?.evaluate((el) => el.textContent)
  assert('filter "All" aktif secara default', allText && allText.includes('All'))

  // ── Filter: Admin ──
  const chips = await page.$$('.filter-chip')
  if (chips.length >= 2) {
    await chips[1].click()
    await new Promise((r) => setTimeout(r, 300))
    const adminRows = await page.$$('.data-table tbody tr')
    assert('filter Admin menampilkan hanya admin', adminRows.length >= 1)
    const allAdmin = await page.$$eval('.role-badge', (els) => els.every((el) => el.textContent === 'Admin'))
    assert('semua baris setelah filter Admin bertipe admin', allAdmin)
  }

  // ── Filter: Employee ──
  if (chips.length >= 3) {
    await chips[2].click()
    await new Promise((r) => setTimeout(r, 300))
    const empRows = await page.$$('.data-table tbody tr')
    assert('filter Employee menampilkan employee', empRows.length >= 1)
    const allEmp = await page.$$eval('.role-badge', (els) => els.every((el) => el.textContent === 'Employee'))
    assert('semua baris setelah filter Employee bertipe employee', allEmp)
  }

  // ── Kembali ke All ──
  await chips[0].click()
  await new Promise((r) => setTimeout(r, 300))

  // ── Create user: buka modal ──
  const inviteBtn = await page.$('.primary-button')
  await inviteBtn?.click()
  await page.waitForSelector('.modal-card', { timeout: 3000 })
  assert('modal "Invite person" terbuka', true)

  // ── Create user: isi form & submit ──
  await page.type('#user-name', 'Budi Santoso')
  await page.type('#user-email', 'budi@test.co.id')
  await page.type('#user-password', 'test123')
  // Klik submit
  const submitBtn = await page.$('.modal-actions .primary-button')
  await submitBtn?.click()

  // Tunggu user muncul di tabel (bukti submit berhasil)
  await page.waitForFunction((name) => {
    const cells = document.querySelectorAll('.person-cell strong')
    return Array.from(cells).some((el) => el.textContent === name)
  }, { timeout: 5000 }, 'Budi Santoso')
  assert('user baru "Budi Santoso" berhasil dibuat', true)

  // Sekarang cek modal sudah tertutup
  await new Promise((r) => setTimeout(r, 500))
  const modalGone = await page.$('.modal-card')
  assert('modal tertutup setelah submit', !modalGone)

  // ── Delete user ──
  page.on('dialog', (dialog) => dialog.accept())
  const deleteButtons = await page.$$('.icon-button[title^="Hapus"]')
  if (deleteButtons.length > 0) {
    await deleteButtons[deleteButtons.length - 1].click()
    await new Promise((r) => setTimeout(r, 500))
    const afterDeleteRows = await page.$$('.data-table tbody tr')
    assert('user terhapus dari tabel', afterDeleteRows.length < rows.length + 1) // +1 karena user baru ditambahkan
  }

  // ── Cancel modal ──
  await page.click('.primary-button')
  await page.waitForSelector('.modal-card', { timeout: 3000 })
  const cancelBtn = await page.$('.modal-actions .secondary-button')
  await cancelBtn?.click()
  await new Promise((r) => setTimeout(r, 500))
  const modalStillThere = await page.$('.modal-card')
  assert('modal tertutup setelah cancel', !modalStillThere)

  // ── Employee tidak bisa akses /users ──
  // Logout dulu
  const logoutBtn = await page.$('button[title="Log out"]')
  if (logoutBtn) await logoutBtn.click()
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 5000 })
  await loginAs('employee')
  await page.goto(`${BASE}/users`, { waitUntil: 'networkidle0' })
  const currentUrl = page.url()
  assert('employee di-redirect dari /users', !currentUrl.includes('/users'))

  // ── Summary ──
  console.log(`\n📊 Hasil: ${passed} lulus, ${failed} gagal`)
  process.exit(failed > 0 ? 1 : 0)
})().catch((err) => { console.error('FATAL:', err.message); process.exit(1) })
  .finally(() => { browser?.close() })
