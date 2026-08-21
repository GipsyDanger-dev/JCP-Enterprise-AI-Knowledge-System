import { useEffect, useState } from 'react'
import { ArrowUpRight, Loader2, MessageSquareText, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeading } from '@/components/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { listConversations } from '@/api/chat'
import type { ConversationSummary } from '@/api/types'

export function HistoryPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const { language } = useWorkspace()
  const isId = language === 'id'
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listConversations(token ?? undefined)
      .then((data) => setConversations(data))
      .catch(() => setConversations([]))
      .finally(() => setLoading(false))
  }, [token])

  return (
    <div className="standard-page">
      <PageHeading
        eyebrow={isId ? 'Asisten AI' : 'AI assistant'}
        title={isId ? 'Riwayat percakapan' : 'Conversation history'}
        detail={isId ? 'Pertanyaan dan jawaban masa lalu Anda dari Enterprise AI.' : 'Your past questions and answers from Enterprise AI.'}
        action={
          <button className="primary-button" onClick={() => navigate('/chat')}>
            <MessageSquareText size={17} /> {isId ? 'Pertanyaan baru' : 'New question'}
          </button>
        }
      />

      {loading ? (
        <div className="users-loading"><Loader2 size={20} className="spin" /> {isId ? 'Memuat…' : 'Loading…'}</div>
      ) : conversations.length === 0 ? (
        <div className="empty-row">
          <Sparkles size={32} style={{ margin: '0 auto 12px', color: 'var(--text-muted)' }} />
          <p>{isId ? 'Belum ada riwayat percakapan.' : 'No conversation history yet.'}</p>
          <button className="primary-button" style={{ marginTop: 12 }} onClick={() => navigate('/chat')}>
            {isId ? 'Mulai bertanya' : 'Start asking'}
          </button>
        </div>
      ) : (
        <div className="conversation-list">
          {conversations.map((conv: any) => (
            <button key={conv.id} className="conversation-card" onClick={() => navigate(`/chat?conversation=${conv.id}`)}>
              <span className="conversation-icon"><Sparkles size={16} /></span>
              <div>
                <strong>{conv.title || (isId ? 'Percakapan tanpa judul' : 'Untitled conversation')}</strong>
                <small>{new Date(conv.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</small>
                {conv.latestMessage && <p>{conv.latestMessage.content?.slice(0, 120)}…</p>}
                <small>{conv.messageCount} {isId ? 'pesan' : 'messages'}</small>
              </div>
              <ArrowUpRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 4 }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
