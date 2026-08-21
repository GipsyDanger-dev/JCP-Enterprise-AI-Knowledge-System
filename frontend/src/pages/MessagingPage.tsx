import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { getEmployeeConversation, getDirectMessages, sendDirectMessage, onTypingChange } from '@/api/messaging'
import { errorMessage } from '@/api/client'
import type { DirectMessage, MessageAttachment } from '@/api/types'
import { MessageList } from '@/components/MessageList'
import { MessageComposer } from '@/components/MessageComposer'
import { TypingIndicator } from '@/components/TypingIndicator'

export function MessagingPage() {
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const { language, setUnreadMessages } = useWorkspace()
  const isId = language === 'id'

  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load conversation
  useEffect(() => {
    if (!user || !token) return
    let cancelled = false
    setLoading(true)
    getEmployeeConversation(user.id, token)
      .then((conv) => {
        if (cancelled) return
        setConversationId(conv.id)
        return getDirectMessages(conv.id, token)
      })
      .then((msgs) => {
        if (!cancelled && msgs) setMessages(msgs)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [user, token])

  // Reset unread count when opening messages
  useEffect(() => {
    setUnreadMessages(0)
  }, [setUnreadMessages])

  // Subscribe to typing state
  useEffect(() => {
    if (!conversationId) return
    return onTypingChange(conversationId, setIsTyping)
  }, [conversationId])

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSend = async (content: string, attachments: MessageAttachment[]) => {
    if ((!content && attachments.length === 0) || !conversationId || !token) return
    setSending(true)
    setError(null)
    try {
      const msg = await sendDirectMessage(conversationId, { content, attachments }, token)
      setMessages((prev) => [...prev, msg])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="messaging-page">
      <div className="messaging-header">
        <button className="icon-button" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
        <div className="messaging-header-info">
          <div className="messaging-header-avatar">A</div>
          <div>
            <strong>{isId ? 'Admin' : 'Admin'}</strong>
            <small>{isId ? 'Biasanya merespons dalam beberapa menit' : 'Usually responds within a few minutes'}</small>
          </div>
        </div>
      </div>

      <div className="messaging-body">
        {loading ? (
          <div className="messaging-loading">
            <Loader2 size={20} className="spin" />
            <span>{isId ? 'Memuat percakapan…' : 'Loading conversation…'}</span>
          </div>
        ) : error && messages.length === 0 ? (
          <div className="messaging-empty">
            <p>{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="messaging-empty">
            <p>{isId ? 'Mulai percakapan dengan admin.' : 'Start a conversation with admin.'}</p>
          </div>
        ) : (
          <>
            <MessageList messages={messages} currentSender="employee" isId={isId} bottomRef={bottomRef} />
            {isTyping && <TypingIndicator name="Admin" />}
          </>
        )}
      </div>

      <MessageComposer
        onSend={handleSend}
        disabled={sending || loading}
        placeholder={isId ? 'Ketik pesan ke admin…' : 'Type a message to admin…'}
        isId={isId}
      />
    </div>
  )
}
