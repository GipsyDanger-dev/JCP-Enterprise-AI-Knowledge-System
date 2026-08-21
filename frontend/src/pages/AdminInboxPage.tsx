import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, MessageSquareText } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { listConversations, getAdminMessages, sendAdminMessage, onTypingChange } from '@/api/messaging'
import { errorMessage } from '@/api/client'
import type { DirectConversation, DirectMessage, MessageAttachment } from '@/api/types'
import { userInitials } from '@/api/mockUsers'
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

  // Load messages when conversation selected
  useEffect(() => {
    if (!selectedConv || !token) return
    let cancelled = false
    setLoadingMessages(true)
    getAdminMessages(selectedConv.id, token)
      .then((msgs) => { if (!cancelled) setMessages(msgs) })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)) })
      .finally(() => { if (!cancelled) setLoadingMessages(false) })
    return () => { cancelled = true }
  }, [selectedConv, token])

  // Subscribe to typing state
  useEffect(() => {
    if (!selectedConv) return
    setIsTyping(false)
    return onTypingChange(selectedConv.id, setIsTyping)
  }, [selectedConv])

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

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
      />

      <div className="inbox-layout">
        {/* Conversation list */}
        <div className={`inbox-list ${selectedConv ? 'inbox-list-hidden-mobile' : ''}`}>
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
                <span className="inbox-item-avatar">{userInitials(conv.employeeName)}</span>
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
                <span className="inbox-item-avatar">{userInitials(selectedConv.employeeName)}</span>
                <div>
                  <strong>{selectedConv.employeeName}</strong>
                  <small>{selectedConv.employeeEmail}</small>
                </div>
              </div>

              {/* Messages */}
              <div className="inbox-messages">
                {loadingMessages ? (
                  <div className="messaging-loading">
                    <Loader2 size={18} className="spin" />
                  </div>
                ) : (
                  <>
                    <MessageList messages={messages} currentSender="admin" isId={isId} bottomRef={bottomRef} />
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
