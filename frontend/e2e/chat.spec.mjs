/**
 * E2E test — Alur chat: pertanyaan dengan jawaban + citation, no-answer, loading state.
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
  const pass  = role === 'admin' ? 'admin1234567' : 'employee12345'
  await page.type('input[type="email"]', email)
  await page.type('input[type="password"]', pass)
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => location.pathname !== '/login', { timeout: 5000 })
}

/** Tunggu jawaban selesai (bukan loading) — chat page */
async function waitForChatAnswer() {
  await page.waitForFunction(() => {
    const m = document.querySelector('.assistant-message')
    return m && !m.classList.contains('loading')
  }, { timeout: 10000 })
}

/** Tunggu jawaban selesai — agent panel (cek .verified muncul) */
async function waitForAgentAnswer() {
  await page.waitForFunction(() => {
    const panel = document.querySelector('.agent-answer')
    if (!panel) return false
    // Tunggu sampai ada .verified atau .no-answer (berarti jawaban sudah datang)
    return panel.querySelector('.verified') || panel.querySelector('.no-answer')
      || (panel.querySelector('p') && !panel.querySelector('.typing-indicator'))
  }, { timeout: 10000 })
}

/** Ketik pertanyaan dan submit */
async function askQuestion(text) {
  await page.waitForSelector('.chat-composer input', { timeout: 5000 })
  const input = await page.$('.chat-composer input')
  await input.click({ clickCount: 3 })
  await input.type(text)
  await page.waitForSelector('.chat-composer button:not([disabled])', { timeout: 3000 })
  await page.click('.chat-composer button')
}

;(async () => {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
  page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })

  await loginAs('admin')
  console.log('\n🧪 Chat E2E tests\n')

  // ── Navigate to chat ──
  await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.chat-composer', { timeout: 5000 })
  assert('halaman /chat terbuka', page.url().includes('/chat'))

  // ── Quick question → shows answer + citation ──
  const quickBtn = await page.$('.chat-empty button')
  if (quickBtn) {
    await quickBtn.click()
    await waitForChatAnswer()
    const answerText = await page.$eval('.assistant-message > p', (el) => el.textContent)
    assert('jawaban muncul setelah quick question', answerText && answerText.length > 10)
    const citation = await page.$('.assistant-message .source-card')
    assert('citation card muncul', !!citation)
  }

  // ── Type own question (hotel) → answer + multiple citations ──
  await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle0' })
  await askQuestion('What is the hotel allowance for managers?')
  const loadingEl = await page.$('.assistant-message.loading')
  assert('loading state muncul', !!loadingEl)
  await waitForChatAnswer()
  const citations = await page.$$('.assistant-message .source-card')
  assert('citation cards muncul (>= 1)', citations.length >= 1)
  const verified = await page.$('.assistant-message .verified')
  assert('badge "Evidence verified" muncul', !!verified)

  // ── Off-topic question (guardrail blocks) ──
  await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle0' })
  await askQuestion('Apa resep masakan rendang padang?')
  await waitForChatAnswer()
  const offTopicAnswer = await page.$('.assistant-message > p')
  const offTopicMsg = offTopicAnswer ? await page.$eval('.assistant-message > p', (el) => el.textContent) : ''
  assert('off-topic ditolak dengan pesan guardrail', offTopicMsg && offTopicMsg.includes('dokumen perusahaan'))

  // ── Submit button disabled during loading ──
  await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.chat-composer input', { timeout: 5000 })
  const inputEl = await page.$('.chat-composer input')
  await inputEl.click({ clickCount: 3 })
  await inputEl.type('reimbursement policy')
  await page.waitForSelector('.chat-composer button:not([disabled])', { timeout: 3000 })
  await page.click('.chat-composer button')
  await new Promise((r) => setTimeout(r, 300))
  const btnDisabled = await page.$eval('.chat-composer button', (el) => el.disabled)
  assert('tombol send disabled saat loading', btnDisabled)
  await waitForChatAnswer()
  const btnEnabled = await page.$eval('.chat-composer button', (el) => !el.disabled)
  assert('tombol send enabled setelah jawaban', btnEnabled)

  // ── AgentPanel on overview also works ──
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.agent-composer input', { timeout: 5000 })
  const agentInput = await page.$('.agent-composer input')
  await agentInput.click({ clickCount: 3 })
  await agentInput.type('cuti tahunan')
  await page.waitForSelector('.agent-composer button:not([disabled])', { timeout: 3000 })
  await page.click('.agent-composer button')
  await waitForAgentAnswer()
  const agentCitation = await page.$('.agent-answer .source-card')
  assert('AgentPanel menampilkan citation setelah pertanyaan', !!agentCitation)

  // ── Summary ──
  console.log(`\n📊 Hasil: ${passed} lulus, ${failed} gagal`)
  process.exit(failed > 0 ? 1 : 0)
})().catch((err) => { console.error('FATAL:', err.message); process.exit(1) })
  .finally(() => { browser?.close() })
