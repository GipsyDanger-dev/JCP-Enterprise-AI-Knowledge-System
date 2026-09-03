import { authHeaders, request } from './client'
import type {
  DirectConversation,
  DirectMessage,
  SendMessageRequest,
  SendMessageResponse,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`

export interface MessagingStreamEvent {
  type: 'message.created' | 'message.updated' | 'message.deleted' | 'typing'
  conversationId: string
  message?: DirectMessage
  messageId?: string
  typing?: boolean
  name?: string
}

/** Open a real-time SSE stream for the current user. Returns an unsubscribe function. */
export function subscribeMessaging(token: string, onEvent: (event: MessagingStreamEvent) => void): () => void {
  const source = new EventSource(`${API_BASE_URL}/messaging/stream?token=${encodeURIComponent(token)}`)
  source.onmessage = (event) => {
    try {
      onEvent(JSON.parse(event.data) as MessagingStreamEvent)
    } catch {
      // ignore malformed events
    }
  }
  return () => source.close()
}

/** Employee: get or create their conversation with admin */
export function getEmployeeConversation(employeeId: string | number, token?: string): Promise<DirectConversation> {
  return request<DirectConversation>(`/messaging/employee/${employeeId}`, { headers: authHeaders(token) })
}

/** Get messages in a conversation */
export function getDirectMessages(conversationId: string, token?: string): Promise<DirectMessage[]> {
  return request<DirectMessage[]>(`/messaging/${conversationId}/messages`, { headers: authHeaders(token) })
}

/** Send a message — sender is determined by backend from JWT */
export function sendDirectMessage(
  conversationId: string,
  body: SendMessageRequest,
  token?: string,
): Promise<SendMessageResponse> {
  return request<SendMessageResponse>(`/messaging/${conversationId}/messages`, {
    method: 'POST',
    body,
    headers: authHeaders(token),
  })
}

/** Admin: list all conversations */
export function listConversations(token?: string): Promise<DirectConversation[]> {
  return request<DirectConversation[]>('/messaging/conversations', { headers: authHeaders(token) })
}

/** Admin: get messages in a conversation */
export function getAdminMessages(conversationId: string, token?: string): Promise<DirectMessage[]> {
  return request<DirectMessage[]>(`/messaging/${conversationId}/messages`, { headers: authHeaders(token) })
}

/** Send the typing indicator state for a conversation. */
export function sendTypingStatus(conversationId: string, typing: boolean, token?: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/messaging/${conversationId}/typing`, {
    method: 'POST',
    body: { typing },
    headers: authHeaders(token),
  })
}

/** Admin: send a message — sender determined by backend from JWT */
export function sendAdminMessage(
  conversationId: string,
  body: SendMessageRequest,
  token?: string,
): Promise<SendMessageResponse> {
  return request<SendMessageResponse>(`/messaging/${conversationId}/messages`, {
    method: 'POST',
    body,
    headers: authHeaders(token),
  })
}

export function editDirectMessage(messageId: string, content: string, token?: string): Promise<DirectMessage> {
  return request<DirectMessage>(`/messaging/messages/${messageId}`, {
    method: 'PATCH', body: { content }, headers: authHeaders(token),
  })
}

export function deleteDirectMessage(messageId: string, token?: string): Promise<{ success: boolean; id: string }> {
  return request<{ success: boolean; id: string }>(`/messaging/messages/${messageId}`, {
    method: 'DELETE', headers: authHeaders(token),
  })
}

/** Reset unread count for conversation */
export function markConversationAsRead(conversationId: string, token?: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/messaging/${conversationId}/read`, {
    method: 'PUT',
    headers: authHeaders(token),
  })
}

