import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const envPath = fileURLToPath(new URL('../.env', import.meta.url))
if (existsSync(envPath)) process.loadEnvFile(envPath)

export const BASE_URL = (process.env.E2E_BASE_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '')

const chromePath = process.env.CHROME_PATH
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

export function credentialPair(prefix) {
  const emailName = `${prefix}_EMAIL`
  const passwordName = `${prefix}_PASSWORD`
  const email = process.env[emailName]?.trim()
  const password = process.env[passwordName]
  const missing = [!email ? emailName : null, !password ? passwordName : null].filter(Boolean)

  return {
    value: missing.length === 0 ? { email, password } : null,
    missing,
  }
}

export function skipSuite(name, missing) {
  console.log(`[SKIP] ${name}: set ${missing.join(' and ')} to use seeded Backend accounts.`)
}

export function skipCheck(label, reason) {
  console.log(`[SKIP] ${label}: ${reason}`)
}

export function createReporter(suiteName) {
  let passed = 0
  let failed = 0

  return {
    check(label, ok, detail = '') {
      if (ok) passed += 1
      else failed += 1
      console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`)
    },
    fail(label, error) {
      failed += 1
      const message = error instanceof Error ? error.message : String(error)
      console.log(`[FAIL] ${label} - ${message}`)
    },
    finish() {
      console.log(`${suiteName}: ${passed} passed, ${failed} failed`)
      return failed
    },
  }
}

export async function openBrowser() {
  if (!existsSync(chromePath)) {
    throw new Error(`Chrome executable not found at ${chromePath}. Set CHROME_PATH.`)
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  return { browser, page }
}

export async function resetSession(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.removeItem('ea.token'))
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('form input[type="email"]')
}

export async function setInputValue(page, selector, value) {
  await page.$eval(selector, (input, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, nextValue)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

function matchesApiResponse(response, method, suffix) {
  try {
    return response.request().method() === method
      && new URL(response.url()).pathname.endsWith(suffix)
  } catch {
    return false
  }
}

export function waitForApiResponse(page, method, path, timeout = 15_000) {
  return page.waitForResponse(
    (response) => matchesApiResponse(response, method, path),
    { timeout },
  )
}

export async function login(page, credentials) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('form input[type="email"]')
  await setInputValue(page, 'form input[type="email"]', credentials.email)
  await setInputValue(page, 'form input[type="password"]', credentials.password)

  const responsePromise = waitForApiResponse(page, 'POST', '/auth/login')
  await page.click('form button[type="submit"]')
  const response = await responsePromise
  if (!response.ok()) throw new Error(`POST /auth/login returned HTTP ${response.status()}`)

  await page.waitForFunction(() => location.pathname !== '/login', { timeout: 10_000 })
  await page.waitForSelector('nav[aria-label="Primary navigation"]', { timeout: 10_000 })
  return response
}

export async function logout(page) {
  await page.waitForSelector('button[title="Log out"]')
  await page.click('button[title="Log out"]')
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 10_000 })
}

export async function clickButtonStartingWith(page, label) {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.trim().startsWith(text))
    if (!button) return false
    button.click()
    return true
  }, label)
  if (!clicked) throw new Error(`Button starting with "${label}" was not found`)
}
