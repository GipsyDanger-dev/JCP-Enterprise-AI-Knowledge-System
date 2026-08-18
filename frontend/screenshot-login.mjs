import puppeteer from 'puppeteer-core'
import { exec } from 'child_process'
import { mkdirSync } from 'fs'
import { resolve } from 'path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 5199
const DIR = resolve('screenshots')

mkdirSync(DIR, { recursive: true })

const server = exec(`npx vite --port ${PORT} --host 127.0.0.1`)

await new Promise((r) => setTimeout(r, 4000))

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })

const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
await page.goto(`http://127.0.0.1:${PORT}/login`, { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 500))
await page.screenshot({ path: resolve(DIR, 'login-desktop.png'), fullPage: false })
console.log('✅ login-desktop.png')

await page.setViewport({ width: 390, height: 844 })
await page.goto(`http://127.0.0.1:${PORT}/login`, { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 500))
await page.screenshot({ path: resolve(DIR, 'login-mobile.png'), fullPage: true })
console.log('✅ login-mobile.png')

await browser.close()
server.kill()
process.exit(0)
