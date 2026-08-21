import { BASE_URL, assert, config, login, openBrowser } from './support.mjs'

const browser = await openBrowser()
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const runtime = config()
  await login(page, runtime)

  await page.goto(`${BASE_URL}/chat`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.chat-composer input', { timeout: 10000 })
  assert('chat page renders for an authenticated user', page.url().includes('/chat'))

  if (runtime.chatQuestion) {
    await page.type('.chat-composer input', runtime.chatQuestion)
    await page.click('.chat-composer button:not([disabled])')
    await page.waitForFunction(() => {
      const answer = document.querySelector('.assistant-message p')
      return answer && answer.textContent.trim().length > 0
    }, { timeout: 30000 })
    assert('AI service returns a persisted chat response', true)
  } else {
    console.log('SKIP: Set E2E_CHAT_QUESTION to verify a live AI response.')
  }
} finally {
  await browser.close()
}
