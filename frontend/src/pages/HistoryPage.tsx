import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, MessageSquareText, RefreshCw, Sparkles, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { getConversation, listConversations } from '@/api/chat'
import { formatTimestamp } from '@/api/mappers'
import type { ConversationDetail, ConversationSummary } from '@/api/types'
import { PageHeading } from '@/components/PageHeading'
import { SourceCard } from '@/components/SourceCard'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'

export function HistoryPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const { startNewConversation } = useWorkspace()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ConversationDetail | null>(null)
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  const loadConversations = useCallback(async () => {
    if (!token) {
      setConversations([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setConversations(await listConversations(token))
    } catch (err) {
      setConversations([])
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  const openConversation = async (id: string) => {
    if (!token) return
    setLoadingConversationId(id)
    setDetailError(null)
    try {
      setSelected(await getConversation(id, token))
    } catch (err) {
      setDetailError(errorMessage(err))
    } finally {
      setLoadingConversationId(null)
    }
  }

  return (
    <div className="standard-page">
      <PageHeading
        eyebrow="AI assistant"
        title="Conversation history"
        detail="Your conversations stored by Enterprise AI."
        action={<button className="primary-button" onClick={() => { startNewConversation(); navigate('/chat') }}><MessageSquareText size={17} /> New question</button>}
      />

      {loading ? (
        <div className="users-loading"><Loader2 size={20} className="spin" /> Loading conversations...</div>
      ) : error ? (
        <div className="inline-alert" role="alert"><AlertTriangle size={15} /> {error}<button className="link-button" onClick={() => void loadConversations()}><RefreshCw size={14} /> Retry</button></div>
      ) : conversations.length === 0 ? (
        <div className="chat-empty"><span><Sparkles size={27} /></span><h2>No conversations yet</h2><p>Your completed conversations will appear here.</p></div>
      ) : (
        <div className="conversation-list">
          {conversations.map((conversation) => (
            <button key={conversation.id} className="conversation-card" onClick={() => void openConversation(conversation.id)} disabled={loadingConversationId !== null}>
              <span className="conversation-icon">{loadingConversationId === conversation.id ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}</span>
              <div><strong>{conversation.title}</strong><small>{formatTimestamp(conversation.updatedAt)}</small></div>
            </button>
          ))}
        </div>
      )}
      {detailError && <div className="inline-alert" role="alert"><AlertTriangle size={15} /> {detailError}</div>}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-card doc-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header"><h2>{selected.title}</h2><button className="icon-button" onClick={() => setSelected(null)}><X size={18} /></button></div>
            <div className="conversation">
              {selected.messages.map((message) => (
                <div key={message.id} className={message.role === 'user' ? 'user-message' : 'assistant-message'}>
                  {message.role === 'assistant' && <div className="answer-label"><Sparkles size={15} /> Enterprise AI</div>}
                  <p>{message.content}</p>
                  {message.citations.map((citation) => (
                    <SourceCard
                      key={`${message.id}-${citation.chunkId}`}
                      title={citation.filename}
                      detail={[citation.sectionTitle, citation.pageNumber ? `Page ${citation.pageNumber}` : null].filter(Boolean).join(' - ')}
                      excerpt={citation.excerpt}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
