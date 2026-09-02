import { chromium } from 'playwright'

const WEB_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173'
const API_URL = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:8002'
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required. Run this test only against isolated E2E data.`)
  return value
}

async function api(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  return { response, payload }
}

async function login(username, password) {
  const { response, payload } = await api('/auth/login', { method: 'POST', body: { username, password } })
  if (!response.ok || !payload?.accessToken) throw new Error(`Login failed for ${username}`)
  return payload.accessToken
}

const adminUsername = required('E2E_ADMIN_USERNAME')
const adminPassword = required('E2E_ADMIN_PASSWORD')
const employeeUsername = required('E2E_EMPLOYEE_USERNAME')
const employeePassword = required('E2E_EMPLOYEE_PASSWORD')
const documentId = required('E2E_REQUIRED_READING_DOCUMENT_ID')
const employeeId = required('E2E_REQUIRED_READING_EMPLOYEE_ID')

const adminToken = await login(adminUsername, adminPassword)
const employeeToken = await login(employeeUsername, employeePassword)
const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const assignment = await api(`/required-readings/documents/${documentId}/assign`, { token: adminToken, method: 'POST', body: { userIds: [employeeId], dueAt } })
if (!assignment.response.ok) throw new Error(`Assignment failed: ${assignment.response.status}`)

const mine = await api('/required-readings/mine', { token: employeeToken })
const reading = mine.payload?.find((item) => item.documentId === documentId)
if (!reading) throw new Error('Assigned reading was not returned to the employee')

const invalidProgress = await api(`/required-readings/${reading.id}/progress`, { token: employeeToken, method: 'POST', body: { progress: 100 } })
if (invalidProgress.response.status !== 400) throw new Error('Progress API accepted an invalid value of 100')

const browser = await chromium.launch({ executablePath: chromePath, headless: true })
try {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' })
  await page.locator('#login-email').fill(employeeUsername)
  await page.locator('#login-password').fill(employeePassword)
  await page.locator('.login-submit').click()
  await page.waitForURL((url) => !url.pathname.endsWith('/login'))

  await page.goto(`${WEB_URL}/documents?doc=${documentId}&reading=${reading.id}`, { waitUntil: 'networkidle' })
  await page.locator('.doc-viewer-content').waitFor()
  const completeButton = page.getByRole('button', { name: /Tandai selesai|Mark complete/i })
  if (!await completeButton.isDisabled()) throw new Error('Completion was enabled before reaching the document end')

  await page.locator('.doc-viewer-content').evaluate((element) => { element.scrollTop = element.scrollHeight })
  await page.waitForTimeout(700)
  await completeButton.click()

  await page.waitForFunction(async ({ id, apiUrl }) => {
    const token = localStorage.getItem('ea.token')
    const response = await fetch(`${apiUrl}/required-readings/mine`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    const readings = await response.json()
    return readings.some((item) => item.id === id && item.progress === 100 && item.completedAt)
  }, { id: reading.id, apiUrl: API_URL })

  const notifications = await api('/notifications', { token: adminToken })
  if (!notifications.payload?.items.some((item) => item.type === 'REQUIRED_READING_COMPLETED')) throw new Error('Admin completion notification was not created')
  console.log('PASS: required reading assignment, validation, completion, and admin notification')
} finally {
  await browser.close()
}
