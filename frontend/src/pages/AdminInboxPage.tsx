import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, MessageSquareText } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { listConversations, getAdminMessages, sendAdminMessage, editDirectMessage, deleteDirectMessage, onTypingChange, markConversationAsRead } from '@/api/messaging'
import { errorMessage } from '@/api/client'
import type { DirectConversation, DirectMessage, MessageAttachment } from '@/api/types'
import { userInitials } from '@/utils/users'
import { MessageList } from '@/components/MessageList'
import { MessageComposer } from '@/components/MessageComposer'
import { TypingIndicator } from '@/components/TypingIndicator'

export function AdminInboxPage() {
  const { token } = useAuth()
  const { language, setUnreadMessages } = useWorkspace()
  const isId = language === 'id'

  const [conversations, setConversations] = useState<DirectConversation[]>([])
  const [selectedConv, setSelectedConv] = useState<DirectConversation | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Reset unread count when opening inbox
  useEffect(() => {
    setUnreadMessages(0)
  }, [setUnreadMessages])

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await listConversations(token)
      setConversations(data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Polling keeps the inbox list current for messages sent by employees.
  useEffect(() => {
    if (!token) return
    const interval = window.setInterval(() => {
      listConversations(token)
        .then((data) => {
          if (selectedConv) {
            setConversations(data.map((c) => (c.id === selectedConv.id ? { ...c, unreadCount: 0 } : c)))
          } else {
            setConversations(data)
          }
        })
        .catch((err) => setError(errorMessage(err)))
    }, 2_000)
    return () => window.clearInterval(interval)
  }, [token, selectedConv])

  // Load messages when conversation selected & mark as read
  useEffect(() => {
    if (!selectedConv || !token) return
    let cancelled = false
    setLoadingMessages(true)
    markConversationAsRead(selectedConv.id, token).catch(() => {})
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedConv.id ? { ...c, unreadCount: 0 } : c))
    )
    getAdminMessages(selectedConv.id, token)
      .then((msgs) => { if (!cancelled) setMessages(msgs) })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)) })
      .finally(() => { if (!cancelled) setLoadingMessages(false) })
    return () => { cancelled = true }
  }, [selectedConv, token])

  const prevMsgCountRef = useRef(0)

  // Refresh the selected thread so employee replies appear without a reload.
  useEffect(() => {
    if (!selectedConv || !token) return
    let cancelled = false
    const refreshMessages = () => {
      getAdminMessages(selectedConv.id, token)
        .then((msgs) => {
          if (!cancelled) {
            setMessages((prev) => {
              if (prev.length === msgs.length && prev[prev.length - 1]?.id === msgs[msgs.length - 1]?.id) {
                return prev
              }
              return msgs
            })
            markConversationAsRead(selectedConv.id, token).catch(() => {})
            setConversations((prev) =>
              prev.map((c) => (c.id === selectedConv.id ? { ...c, unreadCount: 0 } : c))
            )
          }
        })
        .catch((err) => { if (!cancelled) setError(errorMessage(err)) })
    }
    const interval = window.setInterval(refreshMessages, 2_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [selectedConv, token])

  // Reset message count ref when changing conversation
  useEffect(() => {
    prevMsgCountRef.current = 0
  }, [selectedConv?.id])

  // Subscribe to typing state
  useEffect(() => {
    if (!selectedConv) return
    setIsTyping(false)
    return onTypingChange(selectedConv.id, setIsTyping)
  }, [selectedConv])

  // Auto scroll only when new messages are added or on initial conversation load
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current || isTyping) {
      bottomRef.current?.scrollIntoView({ behavior: prevMsgCountRef.current === 0 ? 'auto' : 'smooth' })
    }
    prevMsgCountRef.current = messages.length
  }, [messages.length, isTyping])

  const handleSend = async (content: string, attachments: MessageAttachment[]) => {
    if ((!content && attachments.length === 0) || !selectedConv || !token) return
    setSending(true)
    setError(null)
    try {
      const msg = await sendAdminMessage(selectedConv.id, { content, attachments }, token)
      setMessages((prev) => [...prev, msg])
      // Update conversation list
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConv.id
            ? { ...c, lastMessage: content || '(attachment)', lastMessageAt: msg.createdAt, unreadCount: 0 }
            : c
        )
      )
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

  const formatConversationDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return isId ? 'Hari ini' : 'Today'
    if (diffDays === 1) return isId ? 'Kemarin' : 'Yesterday'
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="admin-inbox-page">
      <PageHeading
        eyebrow={isId ? 'Pesan' : 'Messages'}
        title={isId ? 'Kotak masuk' : 'Inbox'}
        detail={isId ? 'Pesan dari karyawan yang membutuhkan bantuan.' : 'Messages from employees who need help.'}
        action={<span className="inbox-summary"><MessageSquareText size={15} /> {conversations.length} {isId ? 'percakapan' : 'conversations'}</span>}
      />

      <div className="inbox-layout">
        {/* Conversation list */}
        <div className={`inbox-list ${selectedConv ? 'inbox-list-hidden-mobile' : ''}`}>
          <div className="inbox-list-header">
            <div>
              <strong>{isId ? 'Antrean percakapan' : 'Conversation queue'}</strong>
              <small>{isId ? 'Pilih pesan untuk membalas' : 'Select a message to reply'}</small>
            </div>
            <span>{conversations.length}</span>
          </div>
          {loading ? (
            <div className="inbox-loading">
              <Loader2 size={18} className="spin" /> {isId ? 'Memuat…' : 'Loading…'}
            </div>
          ) : conversations.length === 0 ? (
            <div className="inbox-empty">
              <p>{isId ? 'Belum ada percakapan.' : 'No conversations yet.'}</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                className={`inbox-item ${selectedConv?.id === conv.id ? 'active' : ''}`}
                onClick={() => setSelectedConv(conv)}
              >
                {conv.employeePhotoUrl ? <img className="inbox-item-avatar inbox-photo-avatar" src={conv.employeePhotoUrl} alt={`${conv.employeeName} profile`} /> : <span className="inbox-item-avatar">{userInitials(conv.employeeName)}</span>}
                <div className="inbox-item-content">
                  <div className="inbox-item-header">
                    <strong>{conv.employeeName}</strong>
                    <small>{formatConversationDate(conv.lastMessageAt)}</small>
                  </div>
                  <p>{conv.lastMessage}</p>
                </div>
                {conv.unreadCount > 0 && <span className="inbox-unread-badge">{conv.unreadCount}</span>}
              </button>
            ))
          )}
        </div>

        {/* Chat area */}
        <div className={`inbox-chat ${selectedConv ? 'inbox-chat-active' : ''}`}>
          {!selectedConv ? (
            <div className="inbox-chat-empty">
              <span><MessageSquareText size={22} /></span>
              <p>{isId ? 'Pilih percakapan untuk mulai membalas.' : 'Select a conversation to start replying.'}</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="inbox-chat-header">
                <button className="icon-button inbox-back-btn" onClick={() => setSelectedConv(null)}>
                  <ArrowLeft size={18} />
                </button>
                {selectedConv.employeePhotoUrl ? <img className="inbox-item-avatar inbox-photo-avatar" src={selectedConv.employeePhotoUrl} alt={`${selectedConv.employeeName} profile`} /> : <span className="inbox-item-avatar">{userInitials(selectedConv.employeeName)}</span>}
                <div>
                  <strong>{selectedConv.employeeName}</strong>
                  <small>{selectedConv.employeeUsername ? `@${selectedConv.employeeUsername}` : ''}</small>
                </div>
                <span className="inbox-thread-status">{isId ? 'Aktif' : 'Active'}</span>
              </div>

              {/* Messages */}
              <div className="inbox-messages">
                {loadingMessages ? (
                  <div className="messaging-loading">
                    <Loader2 size={18} className="spin" />
                  </div>
                ) : (
                  <>
                    <MessageList messages={messages} currentSender="admin" isId={isId} bottomRef={bottomRef} onEdit={handleEdit} onDelete={handleDelete} />
                    {isTyping && <TypingIndicator name={selectedConv.employeeName} />}
                  </>
                )}
              </div>

              {/* Composer */}
              <MessageComposer
                onSend={handleSend}
                disabled={sending || loadingMessages}
                placeholder={isId ? 'Balas pesan…' : 'Type a reply…'}
                isId={isId}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
