/**
 * Mock messaging — Employee ↔ Admin direct messages.
 * HANYA untuk development (USE_MOCK=true).
 */
import type {
  DirectConversation,
  DirectMessage,
  SendMessageRequest,
  SendMessageResponse,
} from './types'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const iso = (d: Date) => d.toISOString()

// Seed conversations
let convSeq = 10
let msgSeq = 100

const messages: DirectMessage[] = [
  {
    id: 1, conversationId: 1, sender: 'employee', senderName: 'Nadia S.',
    content: 'Halo Admin, saya butuh akses ke koleksi Finance untuk proyek procurement. Bisa dibantu?',
    createdAt: iso(new Date('2026-08-21T08:15:00Z')), read: true,
  },
  {
    id: 2, conversationId: 1, sender: 'admin', senderName: 'Adam',
    content: 'Halo Nadia, sudah saya berikan akses ke koleksi Finance. Silakan cek kembali.',
    createdAt: iso(new Date('2026-08-21T08:32:00Z')), read: true,
  },
  {
    id: 3, conversationId: 1, sender: 'employee', senderName: 'Nadia S.',
    content: 'Terima kasih Admin! Sudah bisa akses sekarang. 🙏',
    createdAt: iso(new Date('2026-08-21T08:35:00Z')), read: true,
  },
  {
    id: 4, conversationId: 2, sender: 'employee', senderName: 'Raka D.',
    content: 'Admin, apakah ada update untuk SOP Perjalanan Dinas yang versi terbaru?',
    createdAt: iso(new Date('2026-08-20T14:20:00Z')), read: true,
  },
  {
    id: 5, conversationId: 2, sender: 'admin', senderName: 'Adam',
    content: 'SOP versi 2.1 sudah di-upload dan terindeks. Silakan cek di halaman Dokumen.',
    createdAt: iso(new Date('2026-08-20T14:45:00Z')), read: true,
  },
  {
    id: 6, conversationId: 3, sender: 'employee', senderName: 'Nadia S.',
    content: 'Mau tanya soal kebijakan reimbursement untuk perjalanan dinas ke luar kota. Berapa batas maksimalnya?',
    createdAt: iso(new Date('2026-08-19T10:00:00Z')), read: true,
  },
]

const conversations: DirectConversation[] = [
  {
    id: 1, employeeId: 2, employeeName: 'Nadia S.', employeeEmail: 'nadia@jcp.co.id',
    lastMessage: 'Terima kasih Admin! Sudah bisa akses sekarang. 🙏',
    lastMessageAt: iso(new Date('2026-08-21T08:35:00Z')), unreadCount: 0,
  },
  {
    id: 2, employeeId: 3, employeeName: 'Raka D.', employeeEmail: 'raka@jcp.co.id',
    lastMessage: 'SOP versi 2.1 sudah di-upload dan terindeks. Silakan cek di halaman Dokumen.',
    lastMessageAt: iso(new Date('2026-08-20T14:45:00Z')), unreadCount: 0,
  },
  {
    id: 3, employeeId: 2, employeeName: 'Nadia S.', employeeEmail: 'nadia@jcp.co.id',
    lastMessage: 'Mau tanya soal kebijakan reimbursement untuk perjalanan dinas ke luar kota. Berapa batas maksimalnya?',
    lastMessageAt: iso(new Date('2026-08-19T10:00:00Z')), unreadCount: 1,
  },
]

// --- Typing simulation ---
type TypingListener = (typing: boolean) => void
const typingListeners = new Map<number, TypingListener[]>()
const typingState = new Map<number, 'employee' | 'admin'>() // who is typing

/** Subscribe to typing state for a conversation */
export function onTypingChange(conversationId: number, listener: TypingListener): () => void {
  if (!typingListeners.has(conversationId)) typingListeners.set(conversationId, [])
  typingListeners.get(conversationId)!.push(listener)
  return () => {
    const list = typingListeners.get(conversationId)
    if (list) {
      const idx = list.indexOf(listener)
      if (idx !== -1) list.splice(idx, 1)
    }
  }
}

/** Check who is typing in a conversation */
export function getTypingUser(conversationId: number): 'employee' | 'admin' | null {
  return typingState.get(conversationId) ?? null
}

function setTyping(conversationId: number, who: 'employee' | 'admin' | null) {
  if (who) {
    typingState.set(conversationId, who)
  } else {
    typingState.delete(conversationId)
  }
  const listeners = typingListeners.get(conversationId)
  if (listeners) {
    for (const fn of listeners) fn(who !== null)
  }
}

/** Auto-reply messages keyed by keyword */
const AUTO_REPLIES: Array<{ keywords: string[]; reply: string }> = [
  { keywords: ['akses', 'collection', 'koleksi', 'finance', 'access'], reply: 'Baik, sudah saya berikan aksesnya. Silakan cek ulang di halaman koleksi.' },
  { keywords: ['sop', 'prosedur', 'kebijakan', 'policy'], reply: 'SOP terbaru sudah di-upload. Silakan cek di halaman Dokumen untuk versi yang paling update.' },
  { keywords: ['reimburse', 'klaim', 'expense', 'biaya'], reply: 'Untuk reimbursement, silakan ajukan melalui formulir klaim dan lampirkan bukti pembayaran. Hubungi Finance untuk detailnya.' },
  { keywords: ['terima kasih', 'makasih', 'thanks', 'thank'], reply: 'Sama-sama! Senang bisa membantu. 🙌' },
]

function pickAutoReply(incoming: string): string {
  const q = incoming.toLowerCase()
  for (const entry of AUTO_REPLIES) {
    if (entry.keywords.some((kw) => q.includes(kw))) return entry.reply
  }
  return 'Baik, saya terima pesannya. Akan segera saya proses.'
}

/** Simulate typing + auto-reply from the other party */
function simulateReply(conversationId: number, sender: 'employee' | 'admin', incomingMessage: string) {
  const replySender = sender === 'employee' ? 'admin' : 'employee'
  const replyName = sender === 'employee' ? 'Adam' : 'Employee'
  const typingDuration = 1500 + Math.random() * 2000
  const replyDelay = 800 + Math.random() * 1200

  // Start typing after a short delay
  setTimeout(() => setTyping(conversationId, replySender), 600)

  // Stop typing + send reply
  setTimeout(() => {
    setTyping(conversationId, null)
    const reply: DirectMessage = {
      id: msgSeq++,
      conversationId,
      sender: replySender,
      senderName: replyName,
      content: pickAutoReply(incomingMessage),
      createdAt: iso(new Date()),
      read: sender === 'employee', // if employee sent, admin reply is unread for employee;反之亦然
    }
    messages.push(reply)
    const conv = conversations.find((c) => c.id === conversationId)
    if (conv) {
      conv.lastMessage = reply.content
      conv.lastMessageAt = reply.createdAt
      if (replySender === 'employee') conv.unreadCount += 1
    }
  }, 600 + typingDuration + replyDelay)
}

// --- Employee-facing API ---

/** Employee: get or create conversation with admin */
export async function mockGetEmployeeConversation(employeeId: number): Promise<DirectConversation> {
  await delay(200)
  let conv = conversations.find((c) => c.employeeId === employeeId)
  if (!conv) {
    conv = {
      id: convSeq++,
      employeeId,
      employeeName: '',
      employeeEmail: '',
      lastMessage: '',
      lastMessageAt: iso(new Date()),
      unreadCount: 0,
    }
    conversations.unshift(conv)
  }
  return { ...conv }
}

/** Employee: get messages in their conversation */
export async function mockGetDirectMessages(conversationId: number): Promise<DirectMessage[]> {
  await delay(150)
  return messages
    .filter((m) => m.conversationId === conversationId)
    .map((m) => ({ ...m }))
}

/** Employee or Admin: send a message */
export async function mockSendDirectMessage(
  conversationId: number,
  body: SendMessageRequest,
  sender: 'employee' | 'admin',
  senderName: string,
): Promise<SendMessageResponse> {
  await delay(300)
  const msg: DirectMessage = {
    id: msgSeq++,
    conversationId,
    sender,
    senderName,
    content: body.content,
    createdAt: iso(new Date()),
    read: sender === 'admin', // admin's own messages are read; employee messages to admin are unread
  }
  messages.push(msg)

  // Update conversation
  const conv = conversations.find((c) => c.id === conversationId)
  if (conv) {
    conv.lastMessage = body.content
    conv.lastMessageAt = msg.createdAt
    if (sender === 'employee') conv.unreadCount += 1
  }

  // Trigger auto-reply from the other party
  simulateReply(conversationId, sender, body.content)

  return { ...msg }
}

// --- Admin-facing API ---

/** Admin: list all conversations */
export async function mockListConversations(): Promise<DirectConversation[]> {
  await delay(200)
  return conversations.map((c) => ({ ...c }))
}

/** Admin: get messages in a conversation */
export async function mockGetAdminMessages(conversationId: number): Promise<DirectMessage[]> {
  await delay(150)
  // Mark employee messages as read
  messages.forEach((m) => {
    if (m.conversationId === conversationId && m.sender === 'employee') {
      m.read = true
    }
  })
  const conv = conversations.find((c) => c.id === conversationId)
  if (conv) conv.unreadCount = 0

  return messages
    .filter((m) => m.conversationId === conversationId)
    .map((m) => ({ ...m }))
}
