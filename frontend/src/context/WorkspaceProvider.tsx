import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getConversation, queryChat } from '@/api/chat'
import { errorMessage } from '@/api/client'
import { deleteDocument, getDocumentStatus, listDocuments, updateDocument, uploadDocument } from '@/api/documents'
import { listConversations, getEmployeeConversation } from '@/api/messaging'
import { toDomainDocument, toDomainDocumentStatus, toDomainRole } from '@/api/mappers'
import type { ApiDocument, ConversationDetail } from '@/api/types'
import { useAuth } from '@/hooks/useAuth'
import type { ChatMessage } from './workspaceContextValue'
import { navigationFor } from '@/types/domain'
import type { DocumentItem, Role } from '@/types/domain'
import { WorkspaceContext } from './workspaceContextValue'
import type { Language } from './workspaceContextValue'
import { notifyNewMessage } from '@/utils/notifications'
import { userInitials } from '@/utils/users'

const POLL_INTERVAL_MS = 2000
const LANG_KEY = 'jcp-lang'

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  const [role, setRole] = useState<Role>(() => (user ? toDomainRole(user.role) : 'admin'))
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [question, setQuestion] = useState('')
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isLoadingAnswer, setIsLoadingAnswer] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [language, setLanguageState] = useState<Language>(() => {
    const v = localStorage.getItem(LANG_KEY)
    return v === 'id' ? 'id' : 'en'
  })
  const [unreadMessages, setUnreadMessages] = useState(0)
  const prevUnreadRef = useRef(0)
  const prevUserIdRef = useRef<string | null>(user?.id ?? null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  // Role mengikuti akun yang login
  useEffect(() => {
    setRole(user ? toDomainRole(user.role) : 'admin')
  }, [user])

  // Reset seluruh workspace & riwayat chat saat logout atau berganti akun
  useEffect(() => {
    if (user?.id !== prevUserIdRef.current) {
      prevUserIdRef.current = user?.id ?? null
      setChatHistory([])
      setConversationId(null)
      setQuestion('')
      setUploadError(null)
      setIsLoadingAnswer(false)
      setIsUploading(false)
      setUnreadMessages(0)
      prevUnreadRef.current = 0
    }
  }, [user?.id])

  useEffect(() => {
    const requestedConversationId = new URLSearchParams(location.search).get('conversation')
    if (!requestedConversationId || !token) return

    let cancelled = false
    getConversation(requestedConversationId, token)
      .then((conversation) => {
        if (cancelled) return
        setConversationId(conversation.id)
        setChatHistory(toWorkspaceHistory(conversation))
      })
      .catch(() => {
        if (!cancelled) {
          setConversationId(null)
          setChatHistory([])
        }
      })
    return () => { cancelled = true }
  }, [location.search, token])

  // Muat dokumen dari API saat login; fallback ke data lokal bila gagal
  useEffect(() => {
    if (!user) {
      setDocuments([])
      return
    }
    let cancelled = false
    listDocuments(token ?? undefined)
      .then((docs) => { if (!cancelled) setDocuments(docs.map(toDomainDocument)) })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Gagal memuat dokumen:', err)
          setDocuments([])
        }
      })
    return () => { cancelled = true }
  }, [user, token])

  // Polling status dokumen yang sedang diproses (queued/processing)
  useEffect(() => {
    if (!token) return
    const active = documents.filter((doc) => doc.status === 'Queued' || doc.status === 'Processing')
    if (active.length === 0) return
    const interval = setInterval(() => {
      active.forEach((doc) => {
        getDocumentStatus(doc.id, token)
          .then((status) => {
            setDocuments((current) => current.map((item) => item.id === status.id
              ? { ...item, status: toDomainDocumentStatus(status.status) }
              : item))
          })
          .catch(() => { /* biarkan polling berikutnya mencoba lagi */ })
      })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [documents, token])

  // Polling unread messages + notification
  useEffect(() => {
    if (!user || !token) { setUnreadMessages(0); prevUnreadRef.current = 0; return }
    if (user.accountType === 'PERSONAL') {
      setUnreadMessages(0)
      prevUnreadRef.current = 0
      return
    }
    let cancelled = false
    const poll = async () => {
      try {
        let count = 0
        let notifName: string | undefined
        let notifPreview: string | undefined
        if (user.isAdmin) {
          const convs = await listConversations(token)
          if (!cancelled) {
            count = convs.reduce((sum, c) => sum + c.unreadCount, 0)
            // Find conversation with new unread for notification context
            const unread = convs.find((c) => c.unreadCount > 0)
            if (unread) {
              notifName = unread.employeeName
              notifPreview = unread.lastMessage
            }
          }
        } else {
          const conv = await getEmployeeConversation(user.id, token)
          if (!cancelled) {
            count = conv.unreadCount
            notifName = 'Admin'
            notifPreview = conv.lastMessage
          }
        }
        if (!cancelled) {
          // Trigger notification when unread count increases
          if (count > prevUnreadRef.current) {
            notifyNewMessage(notifName, notifPreview)
          }
          prevUnreadRef.current = count
          setUnreadMessages(count)
        }
      } catch { /* ignore */ }
    }
    poll()
    const interval = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [user, token])

  const changeRole = (nextRole: Role) => {
    setRole(nextRole)
    if (nextRole === 'employee' && location.pathname === '/users') navigate('/')
  }

  const registerUploadedDocument = (document: ApiDocument) => {
    const nextDocument = toDomainDocument(document)
    setDocuments((current) => [nextDocument, ...current.filter((item) => item.id !== nextDocument.id)])
  }

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setIsUploading(true)
    setUploadError(null)
    try {
      const doc = await uploadDocument(file, token ?? undefined)
      registerUploadedDocument(doc)
    } catch (err) {
      setUploadError(errorMessage(err))
    } finally {
      setIsUploading(false)
    }
  }

  const removeDocument = async (id: string) => {
    if (!token) return
    try {
      await deleteDocument(id, token)
      setDocuments((current) => current.filter((doc) => doc.id !== id))
    } catch (err) {
      setUploadError(errorMessage(err))
    }
  }

  const updateDocumentMetadata = async (id: string, input: { title?: string; collection?: string }) => {
    if (!token) return
    try {
      const updated = await updateDocument(id, input, token)
      setDocuments((current) => current.map((document) => document.id === id
        ? {
            ...document,
            name: updated.title,
            collection: updated.collection || document.collection,
            updatedAt: new Date(updated.updatedAt ?? Date.now()).toLocaleString(language === 'id' ? 'id-ID' : 'en-US'),
          }
        : document))
    } catch (err) {
      setUploadError(errorMessage(err))
      throw err
    }
  }

  const sendQuestion = async (q: string, fromSuggestion = false) => {
    if (!q.trim()) return
    const messageId = `msg-${Date.now()}`
    setQuestion('')
    // Immediately add user message to history (bubble shows right away)
    setChatHistory((prev) => [...prev, {
      id: messageId,
      question: q,
      answer: '',
      citations: [],
      suggestions: [],
      awaitingChoice: false,
      error: null,
      timestamp: Date.now(),
    }])
    setIsLoadingAnswer(true)
    try {
      const res = await queryChat({ question: q, conversationId: conversationId ?? undefined, fromSuggestion }, token ?? undefined)
      setConversationId(res.conversationId)
      // Update the existing message with AI response
      setChatHistory((prev) => prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, answer: res.answer ?? res.message ?? '', citations: res.citations, suggestions: res.suggestions ?? [], awaitingChoice: res.awaitingChoice ?? false, error: null }
          : msg
      ))
    } catch (err) {
      setChatHistory((prev) => prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, error: errorMessage(err) }
          : msg
      ))
    } finally {
      setIsLoadingAnswer(false)
    }
  }

  const onAsk = (event: FormEvent) => {
    event.preventDefault()
    sendQuestion(question)
  }

  // Dipakai hanya oleh tombol saran. Penandanya mematikan pertanyaan balik,
  // supaya aplikasi tidak mempertanyakan usulannya sendiri.
  const askQuestion = (value: string) => {
    setQuestion(value)
    sendQuestion(value, true)
  }

  const clearChat = useCallback(() => {
    setChatHistory([])
    setConversationId(null)
    setQuestion('')
    setIsLoadingAnswer(false)
  }, [])

  const triggerUpload = () => uploadRef.current?.click()

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem(LANG_KEY, lang)
  }

  return (
    <WorkspaceContext.Provider value={{
      role,
      changeRole,
      person: {
        name: user?.displayName ?? '',
        initials: userInitials(user?.displayName ?? ''),
        label: '',
      },
      navigation: navigationFor(role, language).filter((item) => user?.accountType !== 'PERSONAL' || item.id !== 'announcements'),
      documents,
      question,
      setQuestion,
      chatHistory,
      clearChat,
      isLoadingAnswer,
      onAsk,
      askQuestion,
      // Terkunci selama pesan terakhir masih berupa pertanyaan balik dari AI.
      awaitingChoice: chatHistory[chatHistory.length - 1]?.awaitingChoice ?? false,
      triggerUpload,
      onUpload,
      isUploading,
      uploadError,
      registerUploadedDocument,
      updateDocumentMetadata,
      removeDocument,
      language,
      setLanguage,
      unreadMessages,
      setUnreadMessages,
    }}>
      <input ref={uploadRef} className="visually-hidden" type="file" accept=".pdf,.docx,.txt,.md" onChange={onUpload} />
      {children}
    </WorkspaceContext.Provider>
  )
}

function toWorkspaceHistory(conversation: ConversationDetail): ChatMessage[] {
  const history: ChatMessage[] = []
  for (const message of conversation.messages) {
    if (message.role === 'user') {
      history.push({
        id: message.id,
        question: message.content,
        answer: '',
        citations: [],
        suggestions: [],
        awaitingChoice: false,
        error: null,
        timestamp: new Date(message.createdAt).getTime(),
      })
      continue
    }
    if (message.role !== 'assistant') continue
    const latestQuestion = history[history.length - 1]
    if (latestQuestion) {
      latestQuestion.answer = message.content
      latestQuestion.citations = message.citations
    }
  }
  return history
}
