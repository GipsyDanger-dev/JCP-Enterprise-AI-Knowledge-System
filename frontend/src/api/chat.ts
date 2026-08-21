import { authHeaders, request } from './client'
import type { ChatQueryRequest, ChatQueryResponse, ConversationDetail, ConversationSummary } from './types'

export function queryChat(body: ChatQueryRequest, token?: string): Promise<ChatQueryResponse> {
  return request<ChatQueryResponse>('/chat/query', { method: 'POST', body, headers: authHeaders(token) })
}

export function listConversations(token?: string): Promise<ConversationSummary[]> {
  return request<ConversationSummary[]>('/conversations', { headers: authHeaders(token) })
}

export function getConversation(id: string, token?: string): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/conversations/${id}`, { headers: authHeaders(token) })
}
