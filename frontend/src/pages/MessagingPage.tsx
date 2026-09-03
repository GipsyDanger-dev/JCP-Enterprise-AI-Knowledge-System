import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { getEmployeeConversation, getDirectMessages, sendDirectMessage, editDirectMessage, deleteDirectMessage, sendTypingStatus, subscribeMessaging, markConversationAsRead } from '@/api/messaging'
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
  const [adminPhotoUrl, setAdminPhotoUrl] = useState<string | null>(null)
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
        setAdminPhotoUrl(conv.adminPhotoUrl ?? null)
        markConversationAsRead(conv.id, token).catch(() => {})
        setUnreadMessages(0)
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
  }, [user, token, setUnreadMessages])

  const prevMsgCountRef = useRef(0)

  // Real-time updates via SSE — no polling needed.
  useEffect(() => {
    if (!token) return
    return subscribeMessaging(token, (event) => {
      if (event.conversationId !== conversationId) return
      if (event.type === 'message.created' && event.message) {
        setMessages((prev) => prev.some((msg) => msg.id === event.message?.id) ? prev : [...prev, event.message!])
        markConversationAsRead(conversationId, token).catch(() => {})
        setUnreadMessages(0)
      } else if (event.type === 'message.updated' && event.message) {
        setMessages((prev) => prev.map((msg) => msg.id === event.message?.id ? event.message! : msg))
      } else if (event.type === 'message.deleted' && event.messageId) {
        setMessages((prev) => prev.filter((msg) => msg.id !== event.messageId))
      } else if (event.type === 'typing') {
        setIsTyping(Boolean(event.typing))
      }
    })
  }, [conversationId, token, setUnreadMessages])

  // Reset unread count when opening messages
  useEffect(() => {
    setUnreadMessages(0)
  }, [setUnreadMessages])

  // Broadcast typing while composing; stop 2.5s after the last keystroke.
  const typingTimerRef = useRef<number | null>(null)
  const notifyTyping = () => {
    if (!conversationId || !token) return
    sendTypingStatus(conversationId, true, token).catch(() => {})
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
    typingTimerRef.current = window.setTimeout(() => {
      sendTypingStatus(conversationId, false, token).catch(() => {})
      typingTimerRef.current = null
    }, 2500)
  }
  useEffect(() => () => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
    if (conversationId && token) sendTypingStatus(conversationId, false, token).catch(() => {})
  }, [conversationId, token])

  // Auto scroll only when new messages are added or on first load
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current || isTyping) {
      bottomRef.current?.scrollIntoView({ behavior: prevMsgCountRef.current === 0 ? 'auto' : 'smooth' })
    }
    prevMsgCountRef.current = messages.length
  }, [messages.length, isTyping])

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

  const handleEdit = async (messageId: string, content: string) => {
    if (!token) return
    try { const updated = await editDirectMessage(messageId, content, token); setMessages((prev) => prev.map((msg) => msg.id === messageId ? updated : msg)) }
    catch (err) { setError(errorMessage(err)); throw err }
  }

  const handleDelete = async (messageId: string) => {
    if (!token) return
    try { await deleteDirectMessage(messageId, token); setMessages((prev) => prev.filter((msg) => msg.id !== messageId)) }
    catch (err) { setError(errorMessage(err)); throw err }
  }

  return (
    <div className="messaging-page">
      <div className="messaging-header">
        <button className="icon-button" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
        <div className="messaging-header-info">
          {adminPhotoUrl ? <img className="messaging-header-avatar messaging-photo-avatar" src={adminPhotoUrl} alt="Admin profile" /> : <div className="messaging-header-avatar">A</div>}
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
            <MessageList messages={messages} currentSender="employee" isId={isId} bottomRef={bottomRef} onEdit={handleEdit} onDelete={handleDelete} />
            {isTyping && <TypingIndicator name="Admin" />}
          </>
        )}
      </div>

      <MessageComposer
        onSend={handleSend}
        onTyping={notifyTyping}
        disabled={sending || loading}
        placeholder={isId ? 'Ketik pesan ke admin…' : 'Type a message to admin…'}
        isId={isId}
      />
    </div>
  )
}
