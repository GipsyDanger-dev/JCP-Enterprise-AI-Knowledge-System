import {
  BASE_URL,
  createReporter,
  credentialPair,
  login,
  openBrowser,
  resetSession,
  setInputValue,
  skipCheck,
  skipSuite,
  waitForApiResponse,
} from './support.mjs'

const admin = credentialPair('E2E_ADMIN')
if (!admin.value) {
  skipSuite('chat E2E', admin.missing)
  process.exit(0)
}

const question = process.env.E2E_CHAT_QUESTION?.trim()
const followup = process.env.E2E_CHAT_FOLLOWUP?.trim()
const report = createReporter('chat E2E')
let browser

try {
  const session = await openBrowser()
  browser = session.browser
  const { page } = session

  await resetSession(page)
  await login(page, admin.value)
  await page.goto(`${BASE_URL}/chat`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[placeholder*="Ask a question"]', { timeout: 10_000 })
  report.check('authenticated user can open /chat', new URL(page.url()).pathname === '/chat')
  report.check('chat composer exposes a send command', Boolean(await page.$('button[title="Send question"]')))

  if (!question) {
    skipCheck('real AI query', 'set E2E_CHAT_QUESTION for a document-backed test question')
  } else {
    await setInputValue(page, 'input[placeholder*="Ask a question"]', question)
    const responsePromise = waitForApiResponse(page, 'POST', '/chat/query', 45_000)
    await page.click('button[title="Send question"]')
    const response = await responsePromise
    report.check('POST /chat/query succeeds', response.ok(), `HTTP ${response.status()}`)
    const firstPayload = await response.json()
    const firstConversationId = typeof firstPayload?.conversationId === 'string'
      ? firstPayload.conversationId
      : ''
    report.check('first query returns a conversationId', firstConversationId.length > 0)

    await page.waitForFunction(() => {
      const message = document.querySelector('.assistant-message')
      return message && !message.classList.contains('loading')
    }, { timeout: 45_000 })
    const answerText = await page.$eval('.assistant-message p', (element) => element.textContent?.trim() || '')
    report.check('chat renders the Backend result', answerText.length > 0)

    const citationTexts = await page.$$eval(
      '.assistant-message .source-card',
      (cards) => cards.map((card) => card.textContent?.trim() || ''),
    )
    report.check(
      'document-backed answer renders non-empty citations',
      citationTexts.length > 0 && citationTexts.every(Boolean),
    )

    if (followup) {
      await setInputValue(page, 'input[placeholder*="Ask a question"]', followup)
      const followupResponsePromise = waitForApiResponse(page, 'POST', '/chat/query', 45_000)
      await page.click('button[title="Send question"]')
      const followupResponse = await followupResponsePromise
      report.check('follow-up POST /chat/query succeeds', followupResponse.ok(), `HTTP ${followupResponse.status()}`)

      const requestBody = JSON.parse(followupResponse.request().postData() ?? '{}')
      report.check(
        'follow-up request carries the first conversationId',
        firstConversationId.length > 0 && requestBody.conversationId === firstConversationId,
      )

      const followupPayload = await followupResponse.json()
      report.check(
        'follow-up response stays in the same conversation',
        firstConversationId.length > 0 && followupPayload?.conversationId === firstConversationId,
      )
    } else {
      skipCheck('real AI follow-up', 'set E2E_CHAT_FOLLOWUP to verify conversation continuity')
    }
  }
} catch (error) {
  report.fail('suite execution', error)
} finally {
  await browser?.close()
}

process.exitCode = report.finish() > 0 ? 1 : 0
