import { authHeaders, request } from './client'
import type { ChatQueryRequest, ChatQueryResponse, ConversationDetail, ConversationSummary } from './types'

const internalChunkReference = /\s*\[[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}-\d+(?:\s*-\s*[^\]]*)?\]/gi

function stripInternalChunkReferences(answer: string): string {
  return answer.replace(internalChunkReference, '').trim()
}

export async function queryChat(body: ChatQueryRequest, token?: string): Promise<ChatQueryResponse> {
  const response = await request<ChatQueryResponse>('/chat/query', { method: 'POST', body, headers: authHeaders(token) })
  return { ...response, answer: response.answer ? stripInternalChunkReferences(response.answer) : response.answer }
}

export function listConversations(token?: string): Promise<ConversationSummary[]> {
  return request<ConversationSummary[]>('/conversations', { headers: authHeaders(token) })
}

export function getConversation(id: string, token?: string): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/conversations/${id}`, { headers: authHeaders(token) })
}
