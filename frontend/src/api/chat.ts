import { authHeaders, request } from './client'
import { USE_MOCK } from './config'
import { mockChatQuery } from './mockChat'
import type { ChatQueryRequest, ChatQueryResponse, ConversationDetail, ConversationSummary } from './types'

export function queryChat(body: ChatQueryRequest, token?: string): Promise<ChatQueryResponse> {
  if (USE_MOCK) return mockChatQuery(body.question)
  return request<ChatQueryResponse>('/chat/query', { method: 'POST', body, headers: authHeaders(token) })
}

export function listConversations(token?: string): Promise<ConversationSummary[]> {
  if (USE_MOCK) return Promise.resolve([])
  return request<ConversationSummary[]>('/conversations', { headers: authHeaders(token) })
}

export function getConversation(id: string, token?: string): Promise<ConversationDetail> {
  if (USE_MOCK) return Promise.resolve({ id, title: '', messages: [] })
  return request<ConversationDetail>(`/conversations/${id}`, { headers: authHeaders(token) })
}
