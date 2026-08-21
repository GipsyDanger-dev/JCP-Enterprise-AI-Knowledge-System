import { authHeaders, request } from './client'
import { USE_MOCK } from './config'
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

/** Employee: get or create their conversation with admin */
export function getEmployeeConversation(employeeId: string | number, token?: string): Promise<DirectConversation> {
  if (USE_MOCK) return mockGetEmployeeConversation(Number(employeeId))
  return request<DirectConversation>(`/messaging/employee/${employeeId}`, { headers: authHeaders(token) })
}

/** Get messages in a conversation */
export function getDirectMessages(conversationId: string, token?: string): Promise<DirectMessage[]> {
  if (USE_MOCK) return mockGetDirectMessages(Number(conversationId))
  return request<DirectMessage[]>(`/messaging/${conversationId}/messages`, { headers: authHeaders(token) })
}

/** Send a message — sender is determined by backend from JWT */
export function sendDirectMessage(
  conversationId: string,
  body: SendMessageRequest,
  token?: string,
): Promise<SendMessageResponse> {
  if (USE_MOCK) {
    return mockSendDirectMessage(Number(conversationId), body, 'employee', 'Employee')
  }
  return request<SendMessageResponse>(`/messaging/${conversationId}/messages`, {
    method: 'POST',
    body,
    headers: authHeaders(token),
  })
}

/** Admin: list all conversations */
export function listConversations(token?: string): Promise<DirectConversation[]> {
  if (USE_MOCK) return mockListConversations()
  return request<DirectConversation[]>('/messaging/conversations', { headers: authHeaders(token) })
}

/** Admin: get messages in a conversation */
export function getAdminMessages(conversationId: string, token?: string): Promise<DirectMessage[]> {
  if (USE_MOCK) return mockGetAdminMessages(Number(conversationId))
  return request<DirectMessage[]>(`/messaging/${conversationId}/messages`, { headers: authHeaders(token) })
}

/** Subscribe to typing state changes */
export function onTypingChange(conversationId: string, listener: (typing: boolean) => void): () => void {
  if (USE_MOCK) return mockOnTypingChange(Number(conversationId), listener)
  // Real backend would use WebSocket — no-op for now
  return () => {}
}

/** Admin: send a message — sender determined by backend from JWT */
export function sendAdminMessage(
  conversationId: string,
  body: SendMessageRequest,
  token?: string,
): Promise<SendMessageResponse> {
  if (USE_MOCK) {
    return mockSendDirectMessage(Number(conversationId), body, 'admin', 'Adam')
  }
  return request<SendMessageResponse>(`/messaging/${conversationId}/messages`, {
    method: 'POST',
    body,
    headers: authHeaders(token),
  })
}
