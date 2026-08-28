import { authHeaders, request } from './client'
import type {
  DirectConversation,
  DirectMessage,
  SendMessageRequest,
  SendMessageResponse,
} from './types'

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

/** Subscribe to typing state changes */
export function onTypingChange(conversationId: string, listener: (typing: boolean) => void): () => void {
  void conversationId
  void listener
  return () => { }
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

