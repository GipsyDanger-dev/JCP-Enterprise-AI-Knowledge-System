import puppeteer from 'puppeteer-core'

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173'
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

export function config() {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !password) {
    throw new Error('E2E_EMAIL and E2E_PASSWORD are required for real-service E2E tests.')
  }
  return { email, password, chatQuestion: process.env.E2E_CHAT_QUESTION }
}

export async function openBrowser() {
  return puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--no-sandbox'] })
}

export async function login(page, { email, password }) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' })
  await page.type('#login-email', email)
  await page.type('#login-password', password)
  await page.click('.login-submit')
  await page.waitForFunction(() => location.pathname !== '/login', { timeout: 10000 })
}

export function assert(label, condition) {
  if (!condition) throw new Error(`Assertion failed: ${label}`)
  console.log(`PASS: ${label}`)
}
