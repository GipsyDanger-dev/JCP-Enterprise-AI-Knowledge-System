/**
 * E2E smoke test — alur login (mock auth).
 * Jalankan dengan dev server aktif: npm run dev (port 5173)
 *   CHROME_PATH=... npm run test:e2e
 * Base URL bisa diatur via env E2E_BASE_URL (default http://127.0.0.1:5173).
 */
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173'

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })

const fill = async (selector, value) => {
  await page.$eval(selector, (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

const bodyText = () => page.$eval('body', (b) => b.textContent)
const results = []
const check = (name, ok, extra = '') => results.push(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`)

try {
  // 1. Belum login → /login
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 600))
  check('belum login redirect ke /login', page.url().endsWith('/login'), page.url())
  const hasDemo = await page.$('.auth-demo')
  check('mode mock aktif (kotak demo tampil)', hasDemo !== null)

  // 2. Password salah → error
  await fill('#login-email', 'admin@jcp.co.id')
  await fill('#login-password', 'salah')
  await page.click('.auth-submit')
  await page.waitForSelector('.auth-error', { timeout: 5000 })
  const errText = await page.$eval('.auth-error', (el) => el.textContent)
  check('password salah tampil error', /salah/i.test(errText), errText.trim())

  // 3. Login admin benar → dashboard admin
  await fill('#login-password', 'admin123')
  await page.click('.auth-submit')
  await new Promise((r) => setTimeout(r, 1500))
  const afterAdmin = await page.url()
  const adminText = await bodyText()
  check('login admin masuk dashboard', afterAdmin.endsWith('/'), afterAdmin)
  check('dashboard admin (Good morning Adam)', adminText.includes('Good morning, Adam.'), adminText.includes('Good morning, Adam.') ? '' : 'tidak ketemu teks admin')
  check('tombol logout ada di sidebar', (await page.$('.sidebar-lower .nav-item[title="Log out"]')) !== null)

  // 3b. Upload dokumen → queued → processing → ready (mock pipeline)
  await page.goto(BASE + '/documents', { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 800))
  const fileInput = await page.$('input[type="file"]')
  if (fileInput) {
    await fileInput.uploadFile('e2e/fixtures/sample-policy.pdf')
    // tombol berubah jadi "Mengunggah…" lalu selesai
    await new Promise((r) => setTimeout(r, 2000))
    check('dokumen muncul setelah upload', (await bodyText()).includes('sample-policy.pdf'))

    // tunggu status berubah jadi Ready (polling frontend 2s + mock ~5s)
    let status = null
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      status = await page.evaluate(() => {
        const row = [...document.querySelectorAll('tbody tr')].find((r) => r.textContent.includes('sample-policy.pdf'))
        return row ? row.querySelector('.status-badge')?.textContent.trim() : null
      })
      if (status === 'Ready') break
    }
    check('status dokumen jadi Ready', status === 'Ready', `status terakhir: ${status}`)

    // hapus dokumen
    page.on('dialog', (d) => d.accept())
    const del = await page.evaluate(() => {
      const row = [...document.querySelectorAll('tbody tr')].find((r) => r.textContent.includes('sample-policy.pdf'))
      row?.querySelector('.icon-button.danger')?.click()
    })
    await new Promise((r) => setTimeout(r, 1000))
    check('dokumen terhapus', !(await bodyText()).includes('sample-policy.pdf'))
  } else {
    check('input file tersedia', false)
  }

  // 4. Logout → /login
  if (await page.$('.sidebar-lower .nav-item[title="Log out"]')) {
    await page.click('.sidebar-lower .nav-item[title="Log out"]')
    await new Promise((r) => setTimeout(r, 800))
  }
  check('logout kembali ke /login', page.url().endsWith('/login'), page.url())

  // 5. Login employee → dashboard employee
  await fill('#login-email', 'nadia@jcp.co.id')
  await fill('#login-password', 'employee123')
  await page.click('.auth-submit')
  await new Promise((r) => setTimeout(r, 1500))
  const empText = await bodyText()
  check('login employee masuk dashboard', page.url().endsWith('/'), page.url())
  check('dashboard employee (Good morning Nadia)', empText.includes('Good morning, Nadia.'), empText.includes('Good morning, Nadia.') ? '' : 'tidak ketemu teks employee')

  // 6. Employee akses /users → redirect '/'
  await page.goto(BASE + '/users', { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 600))
  check('employee akses /users ditolak (redirect /)', page.url().endsWith('/'), page.url())

  // 7. Reload → sesi dipulihkan
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 1000))
  const reloadText = await bodyText()
  check('sesi pulih setelah reload (tetap login)', reloadText.includes('Good morning, Nadia.'), reloadText.includes('Good morning, Nadia.') ? '' : 'tidak ketemu teks setelah reload')
} catch (err) {
  check('SKRIP ERROR', false, err.message)
}

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('❌')).length
console.log(`\n${failed === 0 ? '✅ SEMUA LULUS' : `❌ ${failed} GAGAL`}`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
