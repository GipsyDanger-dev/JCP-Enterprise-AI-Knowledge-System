import { authHeaders, request } from './client'
import {
  mockGetAdminMessages,
  mockGetDirectMessages,
  mockGetEmployeeConversation,
  mockListConversations,
  mockSendDirectMessage,
  onTypingChange as mockOnTypingChange,
  getTypingUser as mockGetTypingUser,
} from './mockMessaging'
import type {
  DirectConversation,
  DirectMessage,
  SendMessageRequest,
  SendMessageResponse,
} from './types'

/** Messaging always uses mock until backend module is built */
const USE_MOCK_MESSAGING = true

/** Employee: get or create their conversation with admin */
export function getEmployeeConversation(employeeId: string | number, token?: string): Promise<DirectConversation> {
  if (USE_MOCK_MESSAGING) return mockGetEmployeeConversation(Number(employeeId))
  return request<DirectConversation>(`/messaging/employee/${employeeId}`, { headers: authHeaders(token) })
}

/** Get messages in a conversation */
export function getDirectMessages(conversationId: number, token?: string): Promise<DirectMessage[]> {
  if (USE_MOCK_MESSAGING) return mockGetDirectMessages(conversationId)
  return request<DirectMessage[]>(`/messaging/${conversationId}/messages`, { headers: authHeaders(token) })
}

/** Send a message */
export function sendDirectMessage(
  conversationId: number,
  body: SendMessageRequest,
  token?: string,
): Promise<SendMessageResponse> {
  if (USE_MOCK_MESSAGING) {
    // Determine sender from context — default to employee for now
    return mockSendDirectMessage(conversationId, body, 'employee', 'Employee')
  }
  return request<SendMessageResponse>(`/messaging/${conversationId}/messages`, {
    method: 'POST',
    body,
    headers: authHeaders(token),
  })
}

/** Admin: list all conversations */
export function listConversations(token?: string): Promise<DirectConversation[]> {
  if (USE_MOCK_MESSAGING) return mockListConversations()
  return request<DirectConversation[]>('/messaging/conversations', { headers: authHeaders(token) })
}

/** Admin: get messages in a conversation */
export function getAdminMessages(conversationId: number, token?: string): Promise<DirectMessage[]> {
  if (USE_MOCK_MESSAGING) return mockGetAdminMessages(conversationId)
  return request<DirectMessage[]>(`/messaging/${conversationId}/messages`, { headers: authHeaders(token) })
}

/** Subscribe to typing state changes */
export function onTypingChange(conversationId: number, listener: (typing: boolean) => void): () => void {
  if (USE_MOCK_MESSAGING) return mockOnTypingChange(conversationId, listener)
  // Real backend would use WebSocket — no-op for now
  return () => {}
}

/** Check who is currently typing */
export function getTypingUser(conversationId: number): 'employee' | 'admin' | null {
  if (USE_MOCK_MESSAGING) return mockGetTypingUser(conversationId)
  return null
}

/** Admin: send a message as admin */
export function sendAdminMessage(
  conversationId: number,
  body: SendMessageRequest,
  token?: string,
): Promise<SendMessageResponse> {
  if (USE_MOCK_MESSAGING) {
    return mockSendDirectMessage(conversationId, body, 'admin', 'Adam')
  }
  return request<SendMessageResponse>(`/messaging/${conversationId}/messages`, {
    method: 'POST',
    body,
    headers: authHeaders(token),
  })
}
